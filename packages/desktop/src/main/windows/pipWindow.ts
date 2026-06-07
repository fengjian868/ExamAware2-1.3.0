import { BrowserWindow, ipcMain } from 'electron'
import { windowManager } from './windowManager'
import { appLogger } from '../logging/winstonLogger'

let pipWindow: BrowserWindow | null = null

export function createPipWindow(options?: {
  showRemaining?: boolean
  showCurrent?: boolean
}): BrowserWindow | null {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.focus()
    return pipWindow
  }

  const win = windowManager.open(({ commonOptions }) => ({
    id: 'pip',
    route: 'pip',
    options: {
      ...commonOptions(),
      width: 380,
      height: 200,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      transparent: true,
      backgroundColor: '#00000000',
      roundedCorners: true,
      webPreferences: {
        ...commonOptions().webPreferences,
        nodeIntegration: true
      }
    },
    setup: (w) => {
      pipWindow = w

      // 发送初始选项
      setTimeout(() => {
        if (!w.isDestroyed()) {
          w.webContents.send('pip:init', {
            showRemaining: options?.showRemaining ?? true,
            showCurrent: options?.showCurrent ?? false
          })
        }
      }, 500)

      const onClose = () => {
        pipWindow = null
      }
      w.on('closed', onClose)

      return () => {
        w.off('closed', onClose)
        pipWindow = null
      }
    }
  })) as unknown as BrowserWindow

  return win
}

export function closePipWindow(): void {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.close()
    pipWindow = null
  }
}

export function isPipWindowOpen(): boolean {
  return pipWindow !== null && !pipWindow.isDestroyed()
}

export function sendPipData(data: { remainingTime?: string; currentTime?: string }): void {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.webContents.send('pip:data', data)
  }
}

function restorePlayerWindow(): void {
  try {
    const playerWin = windowManager.get('player')
    if (playerWin && !playerWin.isDestroyed()) {
      if (playerWin.isMinimized()) {
        playerWin.restore()
      }
      if (!playerWin.isVisible()) {
        playerWin.show()
      }
      playerWin.focus()
    }
  } catch (error) {
    appLogger.warn('[pipWindow] failed to restore player window', error as Error)
  }
}

export function setupPipIpc(): () => void {
  const onToggle = (
    _event: Electron.IpcMainEvent,
    opts?: { showRemaining?: boolean; showCurrent?: boolean }
  ) => {
    if (isPipWindowOpen()) {
      closePipWindow()
      restorePlayerWindow()
    } else {
      createPipWindow(opts)
    }
  }

  const onUpdate = (
    _event: Electron.IpcMainEvent,
    data: { remainingTime?: string; currentTime?: string }
  ) => {
    sendPipData(data)
  }

  ipcMain.on('pip:toggle', onToggle)
  ipcMain.on('pip:update', onUpdate)

  return () => {
    ipcMain.off('pip:toggle', onToggle)
    ipcMain.off('pip:update', onUpdate)
  }
}
