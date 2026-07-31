/**
 * 集控 IPC 控制器（控制端侧）：
 * - 懒加载 ControlClientManager 单例
 * - 处理 control:list-devices / refresh-discovery / send-command / push-config
 * - 把 manager 的 onDevices / onCommandResult 回调转发给控制面板窗口
 */
import { BrowserWindow } from 'electron'
import { IpcHandle } from './decorators'
import { castService } from '../cast/castService'
import { windowManager } from '../windows/windowManager'
import { appLogger } from '../logging/winstonLogger'
import { ControlClientManager, type ControlDevice } from '../control/controlClientManager'
import type { ControlCommand } from '../control/controlProtocol'

let manager: ControlClientManager | null = null

function getManager(): ControlClientManager {
  if (manager) return manager
  manager = new ControlClientManager({
    listPeers: () => castService.listPeers(),
    onDevices: (devices) => broadcastToControlWindow('control:devices', devices),
    onCommandResult: (peerId, commandId, result) =>
      broadcastToControlWindow('control:command-result', { peerId, commandId, result })
  })
  manager.start()
  appLogger.info('[control-controller] ControlClientManager 已启动')
  return manager
}

function broadcastToControlWindow(channel: string, payload: unknown) {
  const win = windowManager.get('control')
  if (!win || win.isDestroyed()) return
  try {
    win.webContents.send(channel, payload)
  } catch (err) {
    appLogger.warn('[control-controller] 向集控窗口发送消息失败', err as Error)
  }
}

/** 卸载 ControlClientManager（退出时调用，清理所有定时器与 WS 连接） */
export function disposeControlController() {
  if (manager) {
    manager.stop()
    manager = null
    appLogger.info('[control-controller] ControlClientManager 已卸载')
  }
}

export class ControlController {
  @IpcHandle('control:list-devices')
  listDevices(): ControlDevice[] {
    return getManager().getDevices()
  }

  @IpcHandle('control:refresh-discovery')
  async refreshDiscovery(): Promise<void> {
    // listPeers 由 Bonjour 异步维护，这里触发一次设备列表回推
    getManager()
    broadcastToControlWindow('control:devices', getManager().getDevices())
  }

  @IpcHandle('control:send-command')
  async sendCommand(
    e: Electron.IpcMainInvokeEvent,
    payload: { peerIds: string[]; command: ControlCommand }
  ) {
    if (!payload?.peerIds || !payload?.command) {
      throw new Error('peerIds and command are required')
    }
    const results: Array<{ peerId: string; result: any }> = []
    const sender = e.sender
    await getManager().sendCommandBatchStream(payload.peerIds, payload.command, (progress) => {
      results.push(progress)
      // 流式推送进度给控制面板窗口
      try {
        if (!sender.isDestroyed()) {
          sender.send('control:batch-progress', {
            ...progress,
            total: payload.peerIds.length,
            done: results.length
          })
        }
      } catch (err) {
        appLogger.warn('[control-controller] 向发送进程回推进度失败', err as Error)
      }
    })
    return results
  }

  @IpcHandle('control:push-config')
  async pushConfig(e: Electron.IpcMainInvokeEvent, payload: { peerIds: string[]; config: string }) {
    if (!payload?.peerIds || !payload?.config) {
      throw new Error('peerIds and config are required')
    }
    const command: ControlCommand = {
      kind: 'pushConfig',
      data: { config: payload.config, autoPlay: false }
    }
    const results: Array<{ peerId: string; result: any }> = []
    const sender = e.sender
    await getManager().sendCommandBatchStream(payload.peerIds, command, (progress) => {
      results.push(progress)
      try {
        if (!sender.isDestroyed()) {
          sender.send('control:batch-progress', {
            ...progress,
            total: payload.peerIds.length,
            done: results.length
          })
        }
      } catch (err) {
        appLogger.warn('[control-controller] 向发送进程回推进度失败', err as Error)
      }
    })
    return results
  }

  @IpcHandle('control:get-config')
  getControlConfig() {
    return castService.getControlConfig()
  }

  @IpcHandle('control:set-config')
  async setControlConfig(
    _e: Electron.IpcMainInvokeEvent,
    payload: Partial<{ enabled: boolean; role: 'controlled' | 'controller'; deviceName: string }>
  ) {
    return castService.setControlConfig(payload || {})
  }
}
