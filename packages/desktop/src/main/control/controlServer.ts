/**
 * 集控 WS 服务端（被控端侧）：监听控制端连入的 /control/ws 连接。
 * - 接受连接后发 hello（设备名+版本+状态快照）
 * - 收 command 交给 ControlCommandExecutor 执行并回执
 * - 每条连接 ws 原生 ping/pong 心跳，15s 无响应断开
 * - 设备状态变化时向所有连着的控制端推 state
 */
import type { Server } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { app } from 'electron'
import os from 'os'
import { appLogger } from '../logging/winstonLogger'
import { getConfig as cfgGet } from '../configStore'
import { ControlCommandExecutor } from './controlCommandExecutor'
import {
  buildHello,
  buildState,
  decodeFrame,
  encodeFrame,
  generateCommandId,
  type ControlFrame,
  type ControlCommand,
  type ControlMessageKind,
  type DeviceStatus
} from './controlProtocol'

const HEARTBEAT_TIMEOUT_MS = 15000

export class ControlServer {
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
  private heartbeatTimers = new WeakMap<WebSocket, NodeJS.Timeout>()
  private executor: ControlCommandExecutor

  constructor(executor: ControlCommandExecutor) {
    this.executor = executor
  }

  /** 挂到 cast 的 HTTP server 上，监听 /control/ws 升级 */
  attach(server: Server) {
    this.wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, socket, head) => {
      const url = req.url || ''
      if (!url.startsWith('/control/ws')) {
        return // 不是集控路径，交给其他处理（cast 不用 ws，所以这里直接忽略）
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit('connection', ws, req)
      })
    })
    this.wss.on('connection', (ws) => this.handleConnection(ws))
    appLogger.info('[control] WS 服务端已挂载到 /control/ws')
  }

  private handleConnection(ws: WebSocket) {
    this.clients.add(ws)
    appLogger.info('[control] 控制端连入', { total: this.clients.size })

    // 立即发 hello
    this.send(ws, buildHello(this.buildHelloData()))

    // 心跳监听
    this.startHeartbeat(ws)

    ws.on('message', (raw) => this.handleMessage(ws, raw))
    ws.on('close', () => this.handleClose(ws))
    ws.on('error', (err) => {
      appLogger.warn('[control] client ws error', err as Error)
      this.handleClose(ws)
    })
  }

  private startHeartbeat(ws: WebSocket) {
    const reset = () => {
      let timer = this.heartbeatTimers.get(ws)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        appLogger.warn('[control] 心跳超时，断开控制端')
        try {
          ws.terminate()
        } catch {}
      }, HEARTBEAT_TIMEOUT_MS)
      this.heartbeatTimers.set(ws, timer)
    }
    // ws pong 作为存活信号
    ws.on('pong', reset)
    reset()
  }

  private handleClose(ws: WebSocket) {
    this.clients.delete(ws)
    const timer = this.heartbeatTimers.get(ws)
    if (timer) clearTimeout(timer)
    appLogger.info('[control] 控制端断开', { total: this.clients.size })
  }

  private async handleMessage(ws: WebSocket, raw: unknown) {
    const frame = decodeFrame(raw as string | Buffer)
    if (!frame) return
    if (frame.t === 'command') {
      const command = this.frameToCommand(frame)
      if (!command) {
        this.send(ws, {
          t: 'result',
          id: frame.id,
          kind: 'result',
          data: { ok: false, error: '无法识别的命令' }
        })
        return
      }
      await this.executor.executeAndReply(ws, frame.id || generateCommandId(), command)
    }
    // 控制端也可能回 result（未来扩展双向），这里忽略
  }

  private frameToCommand(frame: ControlFrame): ControlCommand | null {
    const allowed: ControlMessageKind[] = [
      'pushConfig',
      'switch',
      'end',
      'alert',
      'setRoom',
      'broadcast',
      'exit'
    ]
    if (!allowed.includes(frame.kind)) return null
    return { kind: frame.kind as ControlCommand['kind'], data: frame.data }
  }

  private send(ws: WebSocket, frame: ControlFrame) {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(encodeFrame(frame))
      }
    } catch (err) {
      appLogger.warn('[control] send failed', err as Error)
    }
  }

  /** 设备状态变化时广播 state 给所有控制端 */
  broadcastStatus(status: DeviceStatus) {
    const frame = buildState(status)
    for (const ws of this.clients) {
      this.send(ws, frame)
    }
  }

  private buildHelloData() {
    const castName = ((cfgGet('cast') ?? {}) as { name?: string }).name
    const status = this.executor.getStatus()
    return {
      ...status,
      deviceName: castName || os.hostname?.() || 'ExamAware',
      version: app.getVersion?.() || 'dev',
      appId: 'examaware-desktop'
    }
  }

  dispose() {
    for (const ws of this.clients) {
      try {
        ws.terminate()
      } catch {}
    }
    this.clients.clear()
    this.wss?.close()
    this.wss = null
    appLogger.info('[control] WS 服务端已卸载')
  }
}
