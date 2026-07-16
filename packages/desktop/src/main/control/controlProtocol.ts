/**
 * 集控协议定义：WS 消息帧类型、命令/状态结构、序列化与反序列化。
 * 控制端与被控端共用此模块。
 */

// ===== 消息顶层类型 =====

export type ControlMessageType = 'hello' | 'status' | 'command' | 'result'

export type ControlMessageKind =
  | 'hello'
  | 'heartbeat'
  | 'state'
  | 'pushConfig'
  | 'switch'
  | 'end'
  | 'alert'
  | 'setRoom'
  | 'broadcast'
  | 'exit'
  | 'openPlayer'
  | 'captureScreen'
  | 'listScreens'

/** WS 帧顶层结构 */
export interface ControlFrame {
  /** 消息类型 */
  t: ControlMessageType
  /** 命令/回执配对 id（仅 command/result 带） */
  id?: string
  /** 子类型 */
  kind: ControlMessageKind
  /** 负载 */
  data?: unknown
}

// ===== 命令 payload =====

export interface PushConfigCommandData {
  config: string
  autoPlay?: boolean
}

export interface SwitchCommandData {
  direction?: 'next' | 'prev'
  /** 直接跳转到指定场次索引（优先于 direction） */
  index?: number
}

export interface AlertCommandData {
  title: string
  color?: string
}

export interface SetRoomCommandData {
  room: string
}

export interface BroadcastCommandData {
  title: string
  body: string
  color?: string
}

/** 统一命令描述，下发时构造 */
export interface ControlCommand {
  kind: Exclude<ControlMessageKind, 'hello' | 'heartbeat' | 'state'>
  data?: unknown
}

// ===== 状态/回执 payload =====

export type ExamStatusValue = 'pending' | 'inProgress' | 'completed'

/** 设备状态快照（state / hello 的 data） */
export interface DeviceStatus {
  playing: boolean
  examName: string
  examStatus: ExamStatusValue
  currentExam: string
  roomNumber: string
  /** 设备发送时的 Date.now()，控制端收到时相减得时钟偏移 */
  now: number
  configLoaded: boolean
  /** 当前考试索引（第几场，从 0 开始） */
  currentExamIndex?: number
  /** 考试总场数 */
  totalExams?: number
  /** 本场考试剩余时间文本（如 "01:23:45"） */
  remainingTime?: string
  /** 本场考试开始时间戳（ms） */
  examStart?: number
  /** 本场考试结束时间戳（ms） */
  examEnd?: number
  /** player 窗口是否已打开 */
  playerOpened?: boolean
}

/** hello 帧的 data，比 state 多设备元信息 */
export interface HelloData extends DeviceStatus {
  deviceName: string
  version: string
  appId: string
}

/** 回执 data */
export interface CommandResultData {
  ok: boolean
  error?: string
  /** captureScreen 回执：base64 jpg */
  image?: string
  /** captureScreen 回执：图片宽度 */
  width?: number
  /** captureScreen 回执：图片高度 */
  height?: number
  /** listScreens 回执：屏幕列表 */
  screens?: ScreenInfo[]
}

/** 屏幕信息（listScreens 回执） */
export interface ScreenInfo {
  id: number
  name: string
}

// ===== 序列化 =====

export function encodeFrame(frame: ControlFrame): string {
  return JSON.stringify(frame)
}

export function decodeFrame(raw: string | Buffer): ControlFrame | null {
  let obj: unknown
  try {
    obj = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'))
  } catch {
    return null
  }
  if (!isControlFrame(obj)) return null
  return obj
}

function isControlFrame(value: unknown): value is ControlFrame {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.t !== 'string') return false
  if (typeof v.kind !== 'string') return false
  return true
}

// ===== 帧构造助手 =====

export function buildHello(data: HelloData): ControlFrame {
  return { t: 'status', kind: 'hello', data }
}

export function buildState(data: DeviceStatus): ControlFrame {
  return { t: 'status', kind: 'state', data }
}

export function buildHeartbeat(): ControlFrame {
  return { t: 'status', kind: 'heartbeat' }
}

export function buildCommand(id: string, command: ControlCommand): ControlFrame {
  return { t: 'command', id, kind: command.kind, data: command.data }
}

export function buildResult(id: string, data: CommandResultData): ControlFrame {
  return { t: 'result', id, kind: 'result', data }
}

/** 生成命令 id（足够区分即可，无需密码学强度） */
export function generateCommandId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ===== 类型守卫：从 data 字段取具体 payload =====

export function asPushConfigData(data: unknown): PushConfigCommandData | null {
  if (!data || typeof data !== 'object') return null
  const v = data as Record<string, unknown>
  if (typeof v.config !== 'string') return null
  return {
    config: v.config,
    autoPlay: typeof v.autoPlay === 'boolean' ? v.autoPlay : true
  }
}

export function asSwitchData(data: unknown): SwitchCommandData | null {
  if (!data || typeof data !== 'object') return null
  const v = data as Record<string, unknown>
  const index = typeof v.index === 'number' ? v.index : undefined
  const direction = v.direction === 'next' || v.direction === 'prev' ? v.direction : undefined
  if (index === undefined && direction === undefined) return null
  return { direction, index }
}

export function asAlertData(data: unknown): AlertCommandData | null {
  if (!data || typeof data !== 'object') return null
  const v = data as Record<string, unknown>
  if (typeof v.title !== 'string') return null
  return { title: v.title, color: typeof v.color === 'string' ? v.color : undefined }
}

export function asSetRoomData(data: unknown): SetRoomCommandData | null {
  if (!data || typeof data !== 'object') return null
  const v = data as Record<string, unknown>
  if (typeof v.room !== 'string') return null
  return { room: v.room }
}

export function asBroadcastData(data: unknown): BroadcastCommandData | null {
  if (!data || typeof data !== 'object') return null
  const v = data as Record<string, unknown>
  if (typeof v.title !== 'string' || typeof v.body !== 'string') return null
  return {
    title: v.title,
    body: v.body,
    color: typeof v.color === 'string' ? v.color : undefined
  }
}

export function asResultData(data: unknown): CommandResultData | null {
  if (!data || typeof data !== 'object') return null
  const v = data as Record<string, unknown>
  if (typeof v.ok !== 'boolean') return null
  const result: CommandResultData = {
    ok: v.ok,
    error: typeof v.error === 'string' ? v.error : undefined
  }
  // 截图/屏列表回执字段透传（captureScreen / listScreens 用）
  if (typeof v.image === 'string') result.image = v.image
  if (typeof v.width === 'number') result.width = v.width
  if (typeof v.height === 'number') result.height = v.height
  if (Array.isArray(v.screens)) {
    result.screens = v.screens
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s, i) => ({
        id: typeof s.id === 'number' ? s.id : i,
        name: typeof s.name === 'string' ? s.name : `Screen ${i}`
      }))
  }
  return result
}

export function asDeviceStatus(data: unknown): DeviceStatus | null {
  if (!data || typeof data !== 'object') return null
  const v = data as Record<string, unknown>
  if (typeof v.now !== 'number') return null
  return {
    playing: typeof v.playing === 'boolean' ? v.playing : false,
    examName: typeof v.examName === 'string' ? v.examName : '',
    examStatus:
      v.examStatus === 'pending' || v.examStatus === 'inProgress' || v.examStatus === 'completed'
        ? v.examStatus
        : 'pending',
    currentExam: typeof v.currentExam === 'string' ? v.currentExam : '',
    roomNumber: typeof v.roomNumber === 'string' ? v.roomNumber : '',
    now: v.now,
    configLoaded: typeof v.configLoaded === 'boolean' ? v.configLoaded : false,
    currentExamIndex: typeof v.currentExamIndex === 'number' ? v.currentExamIndex : undefined,
    totalExams: typeof v.totalExams === 'number' ? v.totalExams : undefined,
    remainingTime: typeof v.remainingTime === 'string' ? v.remainingTime : undefined,
    examStart: typeof v.examStart === 'number' ? v.examStart : undefined,
    examEnd: typeof v.examEnd === 'number' ? v.examEnd : undefined,
    playerOpened: typeof v.playerOpened === 'boolean' ? v.playerOpened : undefined
  }
}

export function asHelloData(data: unknown): HelloData | null {
  const status = asDeviceStatus(data)
  if (!status) return null
  if (!data || typeof data !== 'object') return null
  const v = data as Record<string, unknown>
  if (typeof v.deviceName !== 'string') return null
  return {
    ...status,
    deviceName: v.deviceName,
    version: typeof v.version === 'string' ? v.version : '',
    appId: typeof v.appId === 'string' ? v.appId : ''
  }
}
