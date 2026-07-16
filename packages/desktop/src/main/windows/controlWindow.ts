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
        // 置顶级别高于 player 的 'screen-saver'，确保集控面板和对话框不被全屏 player 挡住
        win.setAlwaysOnTop(true, 'pop-up-menu')
        win.focus()
      }
    }
  }) as unknown as BrowserWindow
}
