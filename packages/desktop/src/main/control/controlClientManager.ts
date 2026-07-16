/**
 * 集控 WS 客户端管理（控制端侧）：
 * - 从 castService.listPeers() 获取候选被控设备，逐台连 ws://host:port/control/ws
 * - 每台设备一个 DeviceConnection，持有 WS、最近状态快照、重连退避
 * - 收 hello/state 推送更新快照，收 result 匹配 pending 命令
 * - 通过回调把设备列表/状态/回执推给渲染层（由 controlPanelRuntime 桥接 IPC）
 */
import WebSocket from 'ws'
import { appLogger } from '../logging/winstonLogger'
import {
  asHelloData,
  asDeviceStatus,
  asResultData,
  buildCommand,
  buildHeartbeat,
  decodeFrame,
  encodeFrame,
  generateCommandId,
  type ControlCommand,
  type DeviceStatus
} from './controlProtocol'

const RECONNECT_BACKOFF_MS = [5000, 10000, 20000]
const HEARTBEAT_INTERVAL_MS = 5000
const CONNECT_TIMEOUT_MS = 5000
const DISCOVERY_REFRESH_MS = 10000

export interface ControlDevice {
  peerId: string
  deviceName: string
  host: string
  port: number
  online: boolean
  connecting: boolean
  status: DeviceStatus | null
  lastSeen: number
}

export interface PendingCommand {
  id: string
  kind: string
  resolve: (result: { ok: boolean; error?: string }) => void
  timer: NodeJS.Timeout
}

interface DeviceConnection {
  peerId: string
  host: string
  port: number
  ws: WebSocket | null
  deviceName: string
  online: boolean
  connecting: boolean
  status: DeviceStatus | null
  lastSeen: number
  reconnectAttempt: number
  reconnectTimer: NodeJS.Timeout | null
  heartbeatTimer: NodeJS.Timeout | null
  pending: Map<string, PendingCommand>
  disposed: boolean
}

export interface ControlClientCallbacks {
  /** 设备列表/状态变化时回调（传全量快照） */
  onDevices: (devices: ControlDevice[]) => void
  /** 命令回执 */
  onCommandResult: (
    peerId: string,
    commandId: string,
    result: { ok: boolean; error?: string }
  ) => void
  /** 获取候选 peer 列表（由 castService 提供） */
  listPeers: () => Array<{
    id: string
    name: string
    host: string
    port: number
    txt?: Record<string, any>
  }>
}

export class ControlClientManager {
  private connections = new Map<string, DeviceConnection>()
  private callbacks: ControlClientCallbacks
  private discoveryTimer: NodeJS.Timeout | null = null
  private started = false

  constructor(callbacks: ControlClientCallbacks) {
    this.callbacks = callbacks
  }

  start() {
    if (this.started) return
    this.started = true
    this.refreshDiscovery()
    this.discoveryTimer = setInterval(() => this.refreshDiscovery(), DISCOVERY_REFRESH_MS)
    appLogger.info('[control-client] 已启动')
  }

  stop() {
    if (!this.started) return
    this.started = false
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer)
      this.discoveryTimer = null
    }
    for (const conn of this.connections.values()) {
      this.disposeConnection(conn)
    }
    this.connections.clear()
    this.emitDevices()
    appLogger.info('[control-client] 已停止')
  }

  /** 刷新发现：合并新 peer、对新增的发起连接 */
  private refreshDiscovery() {
    if (!this.started) return
    const peers = this.callbacks.listPeers()
    const seen = new Set<string>()
    for (const peer of peers) {
      // 仅纳入支持集控协议的 peer（TXT control: '1'）
      if (peer.txt?.control !== '1') continue
      seen.add(peer.id)
      if (!this.connections.has(peer.id)) {
        // deviceName 优先取 Bonjour TXT，回退 peer.name
        const deviceName = peer.txt?.deviceName || peer.name
        this.createConnection(peer.id, peer.host, peer.port, deviceName)
      } else {
        // 已有连接：若 TXT deviceName 变了，更新之
        const conn = this.connections.get(peer.id)!
        const newName = peer.txt?.deviceName || peer.name
        if (newName && conn.deviceName !== newName) {
          conn.deviceName = newName
          this.emitDevices()
        }
      }
    }
    // 不在发现列表里的连接：标记离线但保留一会以便重连，由重连退避封顶后清理
    // 这里简单处理：不主动删除，等重连失败后保持离线状态显示
    this.emitDevices()
  }

  private createConnection(peerId: string, host: string, port: number, name: string) {
    const conn: DeviceConnection = {
      peerId,
      host,
      port,
      ws: null,
      deviceName: name,
      online: false,
      connecting: false,
      status: null,
      lastSeen: 0,
      reconnectAttempt: 0,
      reconnectTimer: null,
      heartbeatTimer: null,
      pending: new Map(),
      disposed: false
    }
    this.connections.set(peerId, conn)
    this.connect(conn)
  }

  private connect(conn: DeviceConnection) {
    if (conn.disposed || conn.ws) return
    conn.connecting = true
    const url = `ws://${conn.host}:${conn.port}/control/ws`
    appLogger.info('[control-client] 连接设备', { peerId: conn.peerId, url })

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      appLogger.warn('[control-client] 创建 WS 失败', err as Error)
      conn.connecting = false
      this.scheduleReconnect(conn)
      return
    }
    conn.ws = ws

    const connectTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        try {
          ws.terminate()
        } catch {}
      }
    }, CONNECT_TIMEOUT_MS)

    ws.on('open', () => {
      clearTimeout(connectTimer)
      conn.connecting = false
      conn.online = true
      conn.reconnectAttempt = 0
      conn.lastSeen = Date.now()
      this.startHeartbeat(conn)
      appLogger.info('[control-client] 已连接', { peerId: conn.peerId })
      this.emitDevices()
    })

    ws.on('message', (raw) => this.handleMessage(conn, raw))

    ws.on('close', () => {
      clearTimeout(connectTimer)
      this.handleDisconnect(conn)
    })
    ws.on('error', (err) => {
      appLogger.warn('[control-client] ws error', { peerId: conn.peerId, err: err.message })
      // close 事件会随后触发 handleDisconnect
    })
  }

  private startHeartbeat(conn: DeviceConnection) {
    if (conn.heartbeatTimer) clearInterval(conn.heartbeatTimer)
    conn.heartbeatTimer = setInterval(() => {
      if (conn.ws?.readyState === WebSocket.OPEN) {
        try {
          conn.ws.send(encodeFrame(buildHeartbeat()))
        } catch {}
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private handleMessage(conn: DeviceConnection, raw: unknown) {
    const frame = decodeFrame(raw as string | Buffer)
    if (!frame) return
    if (frame.t === 'status') {
      if (frame.kind === 'hello') {
        const hello = asHelloData(frame.data)
        if (hello) {
          conn.deviceName = hello.deviceName || conn.deviceName
          conn.status = {
            playing: hello.playing,
            examName: hello.examName,
            examStatus: hello.examStatus,
            currentExam: hello.currentExam,
            roomNumber: hello.roomNumber,
            now: hello.now,
            configLoaded: hello.configLoaded
          }
          conn.lastSeen = Date.now()
          this.emitDevices()
        }
      } else if (frame.kind === 'state') {
        const status = asDeviceStatus(frame.data)
        if (status) {
          conn.status = status
          conn.lastSeen = Date.now()
          this.emitDevices()
        }
      } else if (frame.kind === 'heartbeat') {
        conn.lastSeen = Date.now()
      }
    } else if (frame.t === 'result') {
      const result = asResultData(frame.data)
      if (result && frame.id) {
        const pending = conn.pending.get(frame.id)
        if (pending) {
          clearTimeout(pending.timer)
          conn.pending.delete(frame.id)
          pending.resolve(result)
          this.callbacks.onCommandResult(conn.peerId, frame.id, result)
        }
      }
    }
  }

  private handleDisconnect(conn: DeviceConnection) {
    if (conn.heartbeatTimer) {
      clearInterval(conn.heartbeatTimer)
      conn.heartbeatTimer = null
    }
    conn.ws = null
    conn.online = false
    conn.connecting = false
    // 失败所有 pending 命令
    for (const [id, pending] of conn.pending) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, error: '设备已断开' })
      this.callbacks.onCommandResult(conn.peerId, id, { ok: false, error: '设备已断开' })
    }
    conn.pending.clear()
    this.emitDevices()
    if (!conn.disposed && this.started) {
      this.scheduleReconnect(conn)
    }
  }

  private scheduleReconnect(conn: DeviceConnection) {
    if (conn.reconnectTimer || conn.disposed) return
    const idx = Math.min(conn.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)
    const delay = RECONNECT_BACKOFF_MS[idx]
    conn.reconnectAttempt++
    appLogger.info('[control-client] 计划重连', {
      peerId: conn.peerId,
      delay,
      attempt: conn.reconnectAttempt
    })
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null
      this.connect(conn)
    }, delay)
  }

  /** 下发命令到单台设备，返回 Promise 回执 */
  sendCommand(peerId: string, command: ControlCommand): Promise<{ ok: boolean; error?: string }> {
    const conn = this.connections.get(peerId)
    if (!conn || !conn.online || !conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, error: '设备离线' })
    }
    const id = generateCommandId()
    const frame = buildCommand(id, command)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        conn.pending.delete(id)
        const result = { ok: false, error: '响应超时' }
        resolve(result)
        this.callbacks.onCommandResult(peerId, id, result)
      }, 10000)
      conn.pending.set(id, { id, kind: command.kind, resolve, timer })
      try {
        conn.ws.send(encodeFrame(frame))
      } catch (err) {
        clearTimeout(timer)
        conn.pending.delete(id)
        const result = { ok: false, error: '发送失败' }
        resolve(result)
        this.callbacks.onCommandResult(peerId, id, result)
      }
    })
  }

  /** 批量下发命令，逐台收回执（并发） */
  async sendCommandBatch(
    peerIds: string[],
    command: ControlCommand
  ): Promise<Array<{ peerId: string; result: { ok: boolean; error?: string } }>> {
    const results = await Promise.all(
      peerIds.map(async (peerId) => ({
        peerId,
        result: await this.sendCommand(peerId, command)
      }))
    )
    return results
  }

  /**
   * 批量下发命令，流式回执：每台完成立即回调，不等全部完成。
   * 回调返回后该台才算"处理完"，便于控制端增量更新进度。
   */
  async sendCommandBatchStream(
    peerIds: string[],
    command: ControlCommand,
    onProgress: (progress: { peerId: string; result: { ok: boolean; error?: string } }) => void
  ): Promise<void> {
    await Promise.all(
      peerIds.map(async (peerId) => {
        const result = await this.sendCommand(peerId, command)
        onProgress({ peerId, result })
      })
    )
  }

  getDevices(): ControlDevice[] {
    return Array.from(this.connections.values()).map((c) => ({
      peerId: c.peerId,
      deviceName: c.deviceName,
      host: c.host,
      port: c.port,
      online: c.online,
      connecting: c.connecting,
      status: c.status,
      lastSeen: c.lastSeen
    }))
  }

  private emitDevices() {
    this.callbacks.onDevices(this.getDevices())
  }

  private disposeConnection(conn: DeviceConnection) {
    conn.disposed = true
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer)
      conn.reconnectTimer = null
    }
    if (conn.heartbeatTimer) {
      clearInterval(conn.heartbeatTimer)
      conn.heartbeatTimer = null
    }
    if (conn.ws) {
      try {
        conn.ws.removeAllListeners()
        conn.ws.terminate()
      } catch {}
      conn.ws = null
    }
    for (const [, pending] of conn.pending) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, error: '控制端已关闭' })
    }
    conn.pending.clear()
  }
}
