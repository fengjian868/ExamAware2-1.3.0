import { BrowserWindow } from 'electron'
import { windowManager } from './windowManager'
import { applyTitleBarOverlay, attachTitleBarOverlayLifecycle, buildTitleBarOverlay } from './titleBarOverlay'

export function createPlayerSettingsWindow(): BrowserWindow {
  return windowManager.open(({ commonOptions }) => {
    const options: Electron.BrowserWindowConstructorOptions = {
      ...commonOptions(),
      width: 900,
      height: 600,
      ...(process.platform !== 'linux'
        ? { titleBarStyle: 'hidden' as const, titleBarOverlay: buildTitleBarOverlay() }
        : {}),
      title: '播放器设置',
      resizable: true,
      minimizable: true,
      maximizable: false,
      alwaysOnTop: true,
      fullscreenable: false
    }
    return {
      id: 'player-settings',
      route: 'settings/player',
      options,
      setup(win) {
        applyTitleBarOverlay(win)
        attachTitleBarOverlayLifecycle(win)
        // 确保比播放器更置顶
        win.setAlwaysOnTop(true, 'pop-up-menu')
        // 窗口显示时获取焦点
        win.focus()
      }
    }
  }) as unknown as BrowserWindow
}
