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
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
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
    _e: Electron.IpcMainInvokeEvent,
    payload: { peerIds: string[]; command: ControlCommand }
  ) {
    if (!payload?.peerIds || !payload?.command) {
      throw new Error('peerIds and command are required')
    }
    return getManager().sendCommandBatch(payload.peerIds, payload.command)
  }

  @IpcHandle('control:push-config')
  async pushConfig(
    _e: Electron.IpcMainInvokeEvent,
    payload: { peerIds: string[]; config: string }
  ) {
    if (!payload?.peerIds || !payload?.config) {
      throw new Error('peerIds and config are required')
    }
    const command: ControlCommand = {
      kind: 'pushConfig',
      data: { config: payload.config, autoPlay: true }
    }
    return getManager().sendCommandBatch(payload.peerIds, command)
  }
}
