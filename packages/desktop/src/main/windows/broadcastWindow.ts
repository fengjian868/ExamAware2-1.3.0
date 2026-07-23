/**
 * 被控端广播窗口：在播放器右下角独立 BrowserWindow 显示广播内容。
 * - 层级高于全屏播放器（screen-saver）
 * - 无关闭/最小化按钮，自动定时关闭
 * - 不遮挡播放器底部倒计时
 */
import { BrowserWindow } from 'electron'
import { windowManager } from './windowManager'

let broadcastWindow: BrowserWindow | null = null
let closeTimer: NodeJS.Timeout | null = null

export function closeBroadcastWindow(): void {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  if (broadcastWindow && !broadcastWindow.isDestroyed()) {
    try {
      broadcastWindow.close()
    } catch {}
  }
  broadcastWindow = null
}

export function showBroadcastWindow(payload: {
  title: string
  body: string
  durationSec?: number
}): void {
  const playerWin = windowManager.get('player')
  if (!playerWin || playerWin.isDestroyed()) return

  // 先关闭已有的广播窗口
  closeBroadcastWindow()

  const durationSec = payload.durationSec ?? 15

  // 计算位置：播放器右下角，底部偏移 100px 避开倒计时
  const playerBounds = playerWin.getBounds()
  const winW = 400
  const winH = 200
  const x = playerBounds.x + playerBounds.width - winW - 20
  const y = playerBounds.y + playerBounds.height - winH - 100

  broadcastWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x,
    y,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    fullscreenable: false,
    transparent: true,
    parent: playerWin,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  broadcastWindow.setAlwaysOnTop(true, 'screen-saver')

  // 内联 HTML
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: rgba(30, 30, 30, 0.92);
    color: #fff;
    border-radius: 12px;
    overflow: hidden;
    width: 100vw; height: 100vh;
    display: flex; flex-direction: column;
    padding: 20px 24px;
    border: 1px solid rgba(255,255,255,0.15);
  }
  .bc-title {
    font-size: 18px; font-weight: 700; margin-bottom: 8px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .bc-body {
    font-size: 14px; line-height: 1.6; flex: 1; overflow-y: auto;
    opacity: 0.9;
  }
  .bc-countdown {
    font-size: 12px; opacity: 0.5; text-align: right; margin-top: 8px;
  }
</style></head><body>
  <div class="bc-title">${escHtml(payload.title)}</div>
  <div class="bc-body">${escHtml(payload.body)}</div>
  <div class="bc-countdown" id="cd"></div>
  <script>
    var rem = ${durationSec};
    function tick() {
      rem--;
      if (rem <= 0) return;
      var el = document.getElementById('cd');
      if (el) el.textContent = rem + 's 后关闭';
    }
    setInterval(tick, 1000);
  </script>
</body></html>`

  broadcastWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  broadcastWindow.showInactive()

  // 定时自动关闭
  closeTimer = setTimeout(() => closeBroadcastWindow(), durationSec * 1000)
  closeTimer.unref?.()

  broadcastWindow.on('closed', () => {
    broadcastWindow = null
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
  })
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
