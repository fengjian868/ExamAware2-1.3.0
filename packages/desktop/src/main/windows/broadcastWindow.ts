/**
 * 被控端广播窗口：先全屏橙色高亮提醒 5 秒，再切换为居中悬浮窗显示广播内容。
 * - 不依赖播放器，可在任意状态下显示
 * - 层级最高（screen-saver），覆盖全屏播放器与桌面
 * - 阶段一：全屏橙色高亮 + 提醒标题，持续 5 秒
 * - 阶段二：收起为居中悬浮窗，显示广播正文，自动定时关闭
 */
import { BrowserWindow, screen } from 'electron'

let broadcastWindow: BrowserWindow | null = null
let closeTimer: NodeJS.Timeout | null = null
let phaseTimer: NodeJS.Timeout | null = null

export function closeBroadcastWindow(): void {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  if (phaseTimer) {
    clearTimeout(phaseTimer)
    phaseTimer = null
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
  // 阶段一：全屏高亮提醒持续时长（秒）
  const HIGHLIGHT_SEC = 5

  const display = screen.getPrimaryDisplay()
  const bounds = display.bounds

  // 阶段一：全屏橙色高亮窗口
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
  broadcastWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 阶段一 HTML：全屏橙色高亮 + 标题居中
  const highlightHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100vw; height: 100vh; overflow: hidden; }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: linear-gradient(135deg, #e8510f 0%, #ff8c1a 50%, #f5a623 100%);
    color: #fff;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; padding: 4vh 6vw;
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.12); }
  }
  .hl-title {
    font-size: 9vh; font-weight: 800; margin-bottom: 3vh;
    text-shadow: 0 2px 16px rgba(0,0,0,0.4);
    max-width: 90vw; overflow-wrap: break-word;
  }
  .hl-hint {
    font-size: 3vh; opacity: 0.9; font-weight: 600;
    text-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
</style></head><body>
  <div class="hl-title">${escHtml(payload.title)}</div>
  <div class="hl-hint">紧急广播</div>
</body></html>`

  broadcastWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(highlightHtml)}`)
  broadcastWindow.showInactive()

  // 阶段二：5 秒后切换为居中悬浮窗显示正文
  phaseTimer = setTimeout(() => {
    phaseTimer = null
    if (!broadcastWindow || broadcastWindow.isDestroyed()) return
    switchToFloatWindow(payload, durationSec)
  }, HIGHLIGHT_SEC * 1000)
  phaseTimer.unref?.()

  broadcastWindow.on('closed', () => {
    broadcastWindow = null
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    if (phaseTimer) {
      clearTimeout(phaseTimer)
      phaseTimer = null
    }
  })
}

// 切换为阶段二的居中悬浮窗：显示广播标题与正文
function switchToFloatWindow(payload: { title: string; body: string }, durationSec: number): void {
  if (!broadcastWindow || broadcastWindow.isDestroyed()) return

  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea
  const winW = 720
  const winH = 420
  const x = Math.round(workArea.x + (workArea.width - winW) / 2)
  const y = Math.round(workArea.y + (workArea.height - winH) / 2)

  // 调整窗口为居中悬浮尺寸
  broadcastWindow.setBounds({ x, y, width: winW, height: winH })

  const floatHtml = `<!DOCTYPE html>
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
    font-size: 42px; font-weight: 700; margin-bottom: 20px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: #ffd66b;
  }
  .bc-body {
    font-size: 30px; line-height: 1.6; flex: 1; overflow-y: auto;
    opacity: 0.95;
  }
  .bc-countdown {
    font-size: 18px; opacity: 0.5; text-align: right; margin-top: 20px;
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

  broadcastWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(floatHtml)}`)

  // 阶段二倒计时关闭（durationSec 从阶段二开始计时）
  closeTimer = setTimeout(() => closeBroadcastWindow(), durationSec * 1000)
  closeTimer.unref?.()
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
