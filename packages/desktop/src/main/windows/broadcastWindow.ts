/**
 * 被控端广播窗口：独立置顶悬浮窗，显示广播内容。
 * - 不依赖播放器，可在任意状态下显示
 * - 层级最高（screen-saver），覆盖全屏播放器与桌面
 * - 居中显示，自动定时关闭
 */
import { BrowserWindow, screen } from 'electron'

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
  // 先关闭已有的广播窗口
  closeBroadcastWindow()

  const durationSec = payload.durationSec ?? 15

  // 以主屏幕为基准居中显示（不依赖播放器窗口）
  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea
  const winW = 480
  const winH = 260
  const x = Math.round(workArea.x + (workArea.width - winW) / 2)
  const y = Math.round(workArea.y + (workArea.height - winH) / 2)

  broadcastWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x,
    y,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    transparent: true,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  broadcastWindow.setAlwaysOnTop(true, 'screen-saver')
  // 阻止抢焦点，避免打断播放器
  broadcastWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 内联 HTML
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: rgba(20, 28, 34, 0.96);
    color: #fff;
    border-radius: 16px;
    overflow: hidden;
    width: 100vw; height: 100vh;
    display: flex; flex-direction: column;
    padding: 24px 28px;
    border: 1px solid rgba(255,255,255,0.18);
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  }
  .bc-title {
    font-size: 22px; font-weight: 700; margin-bottom: 12px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: #ffd66b;
  }
  .bc-body {
    font-size: 16px; line-height: 1.7; flex: 1; overflow-y: auto;
    opacity: 0.95;
  }
  .bc-countdown {
    font-size: 13px; opacity: 0.5; text-align: right; margin-top: 12px;
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
