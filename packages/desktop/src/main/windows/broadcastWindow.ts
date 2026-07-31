/**
 * 被控端广播窗口：全屏橙色高亮显示广播内容。
 * - 不依赖播放器，可在任意状态下显示
 * - 层级最高（screen-saver），覆盖全屏播放器与桌面
 * - 全屏橙色背景高亮，内容居中，自动定时关闭
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

  // 全屏覆盖主屏幕（使用 bounds 覆盖任务栏）
  const display = screen.getPrimaryDisplay()
  const bounds = display.bounds

  broadcastWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    transparent: false,
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

  // 内联 HTML：全屏橙色高亮背景，内容居中
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100vw; height: 100vh;
    overflow: hidden;
  }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: linear-gradient(135deg, #e8510f 0%, #ff8c1a 50%, #f5a623 100%);
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4vh 6vw;
  }
  .bc-title {
    font-size: 7vh; font-weight: 800; margin-bottom: 3vh;
    text-shadow: 0 2px 12px rgba(0,0,0,0.35);
    max-width: 90vw;
    overflow-wrap: break-word;
  }
  .bc-body {
    font-size: 4.2vh; line-height: 1.7; flex: 1;
    display: flex; align-items: center; justify-content: center;
    max-width: 86vw;
    overflow-y: auto;
    text-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .bc-body-inner {
    white-space: pre-wrap;
  }
  .bc-countdown {
    font-size: 2.4vh; opacity: 0.85; margin-top: 3vh;
    font-weight: 600;
  }
</style></head><body>
  <div class="bc-title">${escHtml(payload.title)}</div>
  <div class="bc-body"><div class="bc-body-inner">${escHtml(payload.body)}</div></div>
  <div class="bc-countdown" id="cd"></div>
  <script>
    var rem = ${durationSec};
    function tick() {
      rem--;
      if (rem <= 0) return;
      var el = document.getElementById('cd');
      if (el) el.textContent = rem + 's 后自动关闭';
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
