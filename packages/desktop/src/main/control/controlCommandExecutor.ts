/**
 * 集控命令执行器：把控制端下发的命令转译为对本地 player 窗口的操作。
 * - pushConfig 复用 createPlayerWindow 链路（forceRecreate 重开载入新配置）
 * - switch/end/alert/setRoom/exit 通过 player:control IPC 转发给渲染层
 * - broadcast 通过 player:overlay-notice IPC 叠全屏通知
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { windowManager } from '../windows/windowManager'
import { createPlayerWindow } from '../windows/playerWindow'
import { setSharedConfig, getSharedConfig } from '../state/sharedConfigStore'
import { appLogger } from '../logging/winstonLogger'
import {
  asPushConfigData,
  asSwitchData,
  asAlertData,
  asSetRoomData,
  asSetMaterialData,
  asBroadcastData,
  buildResult,
  encodeFrame,
  type ControlCommand,
  type CommandResultData,
  type DeviceStatus
} from './controlProtocol'
import type { WebSocket } from 'ws'

const PLAYER_ID = 'player'
const CONTROL_IPC_CHANNEL = 'player:control'
const CONTROL_RESULT_CHANNEL = 'player:control-result'
const OVERLAY_NOTICE_CHANNEL = 'player:overlay-notice'
const OVERLAY_NOTICE_RESULT_CHANNEL = 'player:overlay-notice-result'

/** 等待渲染层回 player:control-result 的最大时长 */
const CONTROL_RESULT_TIMEOUT_MS = 5000

export class ControlCommandExecutor {
  /** 当前设备状态快照，由渲染层 player:status-report 上报 */
  private currentStatus: DeviceStatus = {
    playing: false,
    examName: '',
    examStatus: 'pending',
    currentExam: '',
    roomNumber: '',
    now: Date.now(),
    configLoaded: false
  }

  getStatus(): DeviceStatus {
    return { ...this.currentStatus, now: Date.now() }
  }

  setStatus(status: DeviceStatus) {
    this.currentStatus = { ...status }
  }

  /** 执行一条命令，返回回执 data */
  async execute(command: ControlCommand): Promise<CommandResultData> {
    try {
      switch (command.kind) {
        case 'pushConfig':
          return await this.executePushConfig(command.data)
        case 'switch':
          return await this.executeViaRenderer('switch', command.data)
        case 'end':
          return await this.executeViaRenderer('end', command.data)
        case 'alert':
          return await this.executeViaRenderer('alert', command.data, true)
        case 'setRoom':
          return await this.executeViaRenderer('setRoom', command.data)
        case 'setMaterial':
          return await this.executeViaRenderer('setMaterial', command.data)
        case 'exit':
          return await this.executeViaRenderer('exit', command.data)
        case 'broadcast':
          return await this.executeBroadcast(command.data)
        case 'openPlayer':
          return await this.executeOpenPlayer()
        case 'listScreens':
          return await this.executeListScreens()
        case 'captureScreen':
          return await this.executeCaptureScreen(command.data)
        default:
          return { ok: false, error: `未知命令: ${command.kind}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '执行异常'
      appLogger.error('[control] command execute failed', err as Error)
      return { ok: false, error: msg }
    }
  }

  /** pushConfig：写临时 .ea2 → forceRecreate player 窗口 */
  private async executePushConfig(data: unknown): Promise<CommandResultData> {
    const payload = asPushConfigData(data)
    if (!payload) return { ok: false, error: 'pushConfig 参数无效' }
    try {
      const dir = path.join(app.getPath('temp'), 'examaware-control')
      await fs.promises.mkdir(dir, { recursive: true })
      const file = path.join(
        dir,
        `control-${Date.now()}-${Math.random().toString(16).slice(2)}.ea2`
      )
      await fs.promises.writeFile(file, payload.config, 'utf-8')
      setSharedConfig(payload.config)
      // forceRecreate=true：若 player 已存在则销毁重开，确保加载新配置
      createPlayerWindow(file, true)
      // 等待 player 窗口创建完成（不等配置加载完毕，但确保窗口存在），
      // 避免控制端立即发 switch/end 等命令时报"播放器未运行"
      await this.waitForPlayerReady(5000)
      appLogger.info('[control] pushConfig 已创建 player 窗口', { autoPlay: payload.autoPlay })
      return { ok: true }
    } catch (err) {
      appLogger.error('[control] pushConfig failed', err as Error)
      return { ok: false, error: err instanceof Error ? err.message : '推送失败' }
    }
  }

  /** 通过 IPC 转发给 player 渲染层执行，等待回执 */
  private async executeViaRenderer(
    kind: 'switch' | 'end' | 'alert' | 'setRoom' | 'setMaterial' | 'exit',
    data: unknown,
    autoOpenPlayer = false
  ): Promise<CommandResultData> {
    // 参数校验
    if (kind === 'switch' && !asSwitchData(data)) return { ok: false, error: 'switch 参数无效' }
    if (kind === 'alert' && !asAlertData(data)) return { ok: false, error: 'alert 参数无效' }
    if (kind === 'setRoom' && !asSetRoomData(data)) return { ok: false, error: 'setRoom 参数无效' }
    if (kind === 'setMaterial' && !asSetMaterialData(data))
      return { ok: false, error: 'setMaterial 参数无效' }

    let win = windowManager.get(PLAYER_ID)
    if (!win || win.isDestroyed()) {
      // alert 等需要在播放页上显示的命令，自动开 player
      if (!autoOpenPlayer) return { ok: false, error: '播放器未运行' }
      const openResult = await this.executeOpenPlayer()
      if (!openResult.ok) return openResult
      await new Promise((r) => {
        const t = setTimeout(r, 800)
        t.unref?.()
      })
      win = windowManager.get(PLAYER_ID)
      if (!win || win.isDestroyed()) return { ok: false, error: '播放器启动失败' }
    }

    const playerWin = win
    const reqId = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const safeRemoveListener = () => {
      try {
        if (!playerWin.isDestroyed()) {
          playerWin.webContents.removeListener(CONTROL_RESULT_CHANNEL, onResult)
        }
      } catch {}
    }
    return new Promise<CommandResultData>((resolve) => {
      const timer = setTimeout(() => {
        safeRemoveListener()
        resolve({ ok: false, error: '渲染层响应超时' })
      }, CONTROL_RESULT_TIMEOUT_MS)
      timer.unref?.()

      const onResult = (
        _event: Electron.Event,
        payload: { id?: string; ok?: boolean; error?: string }
      ) => {
        if (payload?.id !== reqId) return
        clearTimeout(timer)
        safeRemoveListener()
        resolve({ ok: Boolean(payload.ok), error: payload.error })
      }
      try {
        if (playerWin.isDestroyed()) {
          clearTimeout(timer)
          return resolve({ ok: false, error: '播放器已关闭' })
        }
        playerWin.webContents.on(CONTROL_RESULT_CHANNEL, onResult)
        playerWin.webContents.send(CONTROL_IPC_CHANNEL, { id: reqId, kind, data })
      } catch (err) {
        clearTimeout(timer)
        safeRemoveListener()
        resolve({ ok: false, error: err instanceof Error ? err.message : '发送失败' })
      }
    })
  }

  /** broadcast：确保 player 已开 → 发 overlay-notice → 等渲染层回执 */
  private async executeBroadcast(data: unknown): Promise<CommandResultData> {
    const payload = asBroadcastData(data)
    if (!payload) return { ok: false, error: 'broadcast 参数无效' }

    // player 不存在则先打开（复用 openPlayer 逻辑）
    let win = windowManager.get(PLAYER_ID)
    if (!win || win.isDestroyed()) {
      const openResult = await this.executeOpenPlayer()
      if (!openResult.ok) return openResult
      // 等待 PlayerView onMounted 注册 overlay-notice 监听
      await new Promise((r) => {
        const t = setTimeout(r, 800)
        t.unref?.()
      })
      win = windowManager.get(PLAYER_ID)
      if (!win || win.isDestroyed()) {
        return { ok: false, error: '播放器启动失败' }
      }
    }

    const broadcastWin = win
    const reqId = `broadcast-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const safeRemoveListener = () => {
      try {
        if (!broadcastWin.isDestroyed()) {
          broadcastWin.webContents.removeListener(OVERLAY_NOTICE_RESULT_CHANNEL, onResult)
        }
      } catch {}
    }
    return new Promise<CommandResultData>((resolve) => {
      const timer = setTimeout(() => {
        safeRemoveListener()
        resolve({ ok: false, error: '广播显示超时' })
      }, 3000)
      timer.unref?.()

      const onResult = (
        _event: Electron.Event,
        payload: { id?: string; ok?: boolean; error?: string }
      ) => {
        if (payload?.id !== reqId) return
        clearTimeout(timer)
        safeRemoveListener()
        resolve({ ok: Boolean(payload.ok), error: payload.error })
      }
      try {
        if (broadcastWin.isDestroyed()) {
          clearTimeout(timer)
          return resolve({ ok: false, error: '播放器已关闭' })
        }
        broadcastWin.webContents.on(OVERLAY_NOTICE_RESULT_CHANNEL, onResult)
        broadcastWin.webContents.send(OVERLAY_NOTICE_CHANNEL, {
          id: reqId,
          title: payload.title,
          body: payload.body,
          color: payload.color
        })
        appLogger.info('[control] broadcast 已下发', { title: payload.title })
      } catch (err) {
        clearTimeout(timer)
        safeRemoveListener()
        resolve({ ok: false, error: err instanceof Error ? err.message : '广播发送失败' })
      }
    })
  }

  /** openPlayer：让被控端打开播放器。已有则聚焦，否则用已存档案重开 */
  private async executeOpenPlayer(): Promise<CommandResultData> {
    const existing = windowManager.get(PLAYER_ID)
    if (existing && !existing.isDestroyed()) {
      try {
        if (existing.isMinimized()) existing.restore()
        existing.focus()
      } catch {}
      return { ok: true }
    }
    const config = getSharedConfig()
    if (!config || !config.trim()) {
      return { ok: false, error: '被控端无可用档案，请先推送档案' }
    }
    try {
      const dir = path.join(app.getPath('temp'), 'examaware-control')
      await fs.promises.mkdir(dir, { recursive: true })
      const file = path.join(dir, `open-${Date.now()}-${Math.random().toString(16).slice(2)}.ea2`)
      await fs.promises.writeFile(file, config, 'utf-8')
      createPlayerWindow(file)
      appLogger.info('[control] openPlayer 已创建 player 窗口')
      await this.waitForPlayerReady(5000)
      return { ok: true }
    } catch (err) {
      appLogger.error('[control] openPlayer failed', err as Error)
      return { ok: false, error: err instanceof Error ? err.message : '打开失败' }
    }
  }

  /** 等待 player 窗口创建并加载 DOM（轮询 webContents 是否可用） */
  private async waitForPlayerReady(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const win = windowManager.get(PLAYER_ID)
      if (win && !win.isDestroyed()) {
        try {
          if (!win.webContents.isLoading()) return
        } catch {}
      }
      await new Promise((r) => {
        const t = setTimeout(r, 200)
        t.unref?.()
      })
    }
  }

  /** listScreens：列出被控端可用显示器 */
  private async executeListScreens(): Promise<CommandResultData> {
    try {
      const screenshot: any = await import('screenshot-desktop')
      const displays: Array<{ id?: number; name?: string }> =
        (await screenshot.listDisplays?.()) || []
      const screens = displays.map((d, i) => ({
        id: typeof d.id === 'number' ? d.id : i,
        name: d.name || `显示器 ${i + 1}`
      }))
      if (!screens.length) screens.push({ id: 0, name: '主屏幕' })
      return { ok: true, screens }
    } catch (err) {
      appLogger.error('[control] listScreens failed', err as Error)
      // 库不可用时回退单屏
      return { ok: true, screens: [{ id: 0, name: '主屏幕' }] }
    }
  }

  /** captureScreen：系统级截图，base64 回传 */
  private async executeCaptureScreen(data: unknown): Promise<CommandResultData> {
    try {
      const payload = (data || {}) as { displayId?: number }
      const screenshot: any = await import('screenshot-desktop')
      const opts: Record<string, unknown> = { format: 'jpg', quality: 60 }
      if (typeof payload.displayId === 'number') opts.screen = payload.displayId
      const buffer: Buffer = await screenshot(opts)
      const image = buffer.toString('base64')
      appLogger.info('[control] captureScreen 成功', {
        sizeKB: Math.round(buffer.length / 1024),
        displayId: payload.displayId
      })
      return { ok: true, image }
    } catch (err) {
      appLogger.error('[control] captureScreen failed', err as Error)
      return { ok: false, error: err instanceof Error ? err.message : '截图失败' }
    }
  }

  /**
   * 执行命令并把回执通过 WS 回送给控制端。
   * WS 不可写时静默丢弃。
   */
  async executeAndReply(ws: WebSocket, commandId: string, command: ControlCommand): Promise<void> {
    const result = await this.execute(command)
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(encodeFrame(buildResult(commandId, result)))
      }
    } catch (err) {
      appLogger.warn('[control] reply failed', err as Error)
    }
  }
}
