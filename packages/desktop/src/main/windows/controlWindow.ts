import { BrowserWindow } from 'electron'
import { windowManager } from './windowManager'
import {
  applyTitleBarOverlay,
  attachTitleBarOverlayLifecycle,
  buildTitleBarOverlay
} from './titleBarOverlay'

export function createControlWindow(): BrowserWindow {
  return windowManager.open(({ commonOptions }) => {
    const options: Electron.BrowserWindowConstructorOptions = {
      ...commonOptions(),
      width: 1100,
      height: 720,
      minWidth: 880,
      minHeight: 560,
      ...(process.platform !== 'linux'
        ? { titleBarStyle: 'hidden' as const, titleBarOverlay: buildTitleBarOverlay() }
        : {}),
      title: '集控面板',
      resizable: true,
      minimizable: true,
      maximizable: true,
      fullscreenable: false
    }
    return {
      id: 'control',
      route: 'control',
      options,
      setup(win) {
        applyTitleBarOverlay(win)
        attachTitleBarOverlayLifecycle(win)
        win.focus()
      }
    }
  }) as unknown as BrowserWindow
}
