/**
 * 集控历史记录管理器
 * 记录集控页面推送档案 / 加载预设的操作历史，持久化到 localStorage
 */

export interface ControlHistoryTarget {
  peerId: string
  deviceName: string
}

export type ControlHistoryAction = 'pushConfig' | 'loadPreset'

export interface ControlHistoryEntry {
  id: string
  filePath: string
  fileName: string
  action: ControlHistoryAction
  openedAt: number
  targets: ControlHistoryTarget[]
  successCount: number
  totalCount: number
  examName?: string
}

export interface AddControlHistoryPayload {
  filePath: string
  action: ControlHistoryAction
  targets: ControlHistoryTarget[]
  successCount: number
  totalCount: number
  examName?: string
}

const STORAGE_KEY = 'controlPanel:historyRecords'
const MAX_RECORDS = 30

function genId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function fileNameOf(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() || 'Unnamed'
  return base.replace(/\.(ea2|json)$/i, '')
}

function readRaw(): ControlHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as ControlHistoryEntry[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeRaw(list: ControlHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore quota errors */
  }
}

export const ControlHistoryManager = {
  getHistory(): ControlHistoryEntry[] {
    return readRaw().sort((a, b) => b.openedAt - a.openedAt)
  },

  addHistory(payload: AddControlHistoryPayload): ControlHistoryEntry | null {
    if (!payload.filePath) return null
    const entry: ControlHistoryEntry = {
      id: genId(),
      filePath: payload.filePath,
      fileName: fileNameOf(payload.filePath),
      action: payload.action,
      openedAt: Date.now(),
      targets: payload.targets || [],
      successCount: payload.successCount,
      totalCount: payload.totalCount,
      examName: payload.examName
    }
    const list = readRaw().filter((e) => e.filePath !== entry.filePath)
    list.unshift(entry)
    writeRaw(list.slice(0, MAX_RECORDS))
    return entry
  },

  removeHistory(id: string): void {
    writeRaw(readRaw().filter((e) => e.id !== id))
  },

  clearHistory(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}
