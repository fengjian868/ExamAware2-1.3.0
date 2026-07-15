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
import { setSharedConfig } from '../state/sharedConfigStore'
import { appLogger } from '../logging/winstonLogger'
import {
  asPushConfigData,
  asSwitchData,
  asAlertData,
  asSetRoomData,
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
          return await this.executeViaRenderer('alert', command.data)
        case 'setRoom':
          return await this.executeViaRenderer('setRoom', command.data)
        case 'exit':
          return await this.executeViaRenderer('exit', command.data)
        case 'broadcast':
          return await this.executeBroadcast(command.data)
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
      // forceRecreate=true：若 player 已存在则重开载入新配置
      createPlayerWindow(file)
      appLogger.info('[control] pushConfig 已创建 player 窗口', { autoPlay: payload.autoPlay })
      return { ok: true }
    } catch (err) {
      appLogger.error('[control] pushConfig failed', err as Error)
      return { ok: false, error: err instanceof Error ? err.message : '推送失败' }
    }
  }

  /** 通过 IPC 转发给 player 渲染层执行，等待回执 */
  private async executeViaRenderer(
    kind: 'switch' | 'end' | 'alert' | 'setRoom' | 'exit',
    data: unknown
  ): Promise<CommandResultData> {
    // 参数校验
    if (kind === 'switch' && !asSwitchData(data)) return { ok: false, error: 'switch 参数无效' }
    if (kind === 'alert' && !asAlertData(data)) return { ok: false, error: 'alert 参数无效' }
    if (kind === 'setRoom' && !asSetRoomData(data)) return { ok: false, error: 'setRoom 参数无效' }

    const win = windowManager.get(PLAYER_ID)
    if (!win || win.isDestroyed()) {
      return { ok: false, error: '播放器未运行' }
    }

    const reqId = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    return new Promise<CommandResultData>((resolve) => {
      const timer = setTimeout(() => {
        win.webContents.removeListener(CONTROL_RESULT_CHANNEL, onResult)
        resolve({ ok: false, error: '渲染层响应超时' })
      }, CONTROL_RESULT_TIMEOUT_MS)

      const onResult = (
        _event: Electron.Event,
        payload: { id?: string; ok?: boolean; error?: string }
      ) => {
        if (payload?.id !== reqId) return
        clearTimeout(timer)
        win.webContents.removeListener(CONTROL_RESULT_CHANNEL, onResult)
        resolve({ ok: Boolean(payload.ok), error: payload.error })
      }
      win.webContents.on(CONTROL_RESULT_CHANNEL, onResult)
      win.webContents.send(CONTROL_IPC_CHANNEL, { id: reqId, kind, data })
    })
  }

  /** broadcast：直接发 overlay-notice IPC，渲染层用 reminderService 叠通知 */
  private async executeBroadcast(data: unknown): Promise<CommandResultData> {
    const payload = asBroadcastData(data)
    if (!payload) return { ok: false, error: 'broadcast 参数无效' }
    const win = windowManager.get(PLAYER_ID)
    if (!win || win.isDestroyed()) {
      return { ok: false, error: '播放器未运行' }
    }
    win.webContents.send(OVERLAY_NOTICE_CHANNEL, {
      title: payload.title,
      body: payload.body,
      color: payload.color
    })
    appLogger.info('[control] broadcast 已下发', { title: payload.title })
    return { ok: true }
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
