<template>
  <div class="player-view-container">
    <!-- 使用新的 ExamPlayer 组件 -->
    <ExamPlayer
      :exam-config="configData"
      :config="playerConfig"
      :time-provider="timeProvider"
      :time-sync-status="timeSyncStatusText"
      v-model:roomNumber="roomNumber"
      :allow-edit-room-number="false"
      :show-action-bar="true"
      :ui-scale="scaleSeed"
      :ui-density="uiDensitySetting"
      :large-clock="largeClockEnabled"
      :large-clock-scale="largeClockScaleSetting"
      :exam-info-large-font="examInfoLargeFontSetting"
      :material-font-scale="materialFontScaleSetting"
      :auxiliary-font-scale="auxiliaryFontScaleSetting"
      :pre-countdown-minutes="preCountdownMinutesSetting"
      :hdr-highlight="hdrHighlightSetting"
      :player-theme="playerTheme"
      :classic-show-material="classicShowMaterial"
      :pages-per-sheet="pagesPerSheet"
      @exit="handleExit"
      @minimize="handleMinimize"
      @open-file="handleOpenFile"
      @open-settings="handleOpenSettings"
      @room-number-click="handleRoomNumberClick"
      @room-number-change="handleRoomNumberChange"
      @scale-change="handleScaleChange"
      @density-change="handleDensitySettingChange"
      @large-clock-toggle="handleLargeClockToggle"
      @large-clock-scale-change="handleLargeClockScaleChange"
      @exam-info-large-font-toggle="handleExamInfoLargeFontToggle"
      @material-font-scale-change="handleMaterialFontScaleChange"
      @auxiliary-font-scale-change="handleAuxiliaryFontScaleChange"
      @exam-start="handleExamStart"
      @exam-end="handleExamEnd"
      @exam-alert="handleExamAlert"
      @pre-exam-start="handlePreExamStart"
      @colorful-alert="handleColorfulAlert"
      @exam-switch="handleExamSwitch"
      @error="handleError"
      @status-update="handleStatusUpdate"
      ref="examPlayerRef"
    >
      <!-- 额外内容插槽保留为空，由 ExamPlayer 内部处理考场号设置 -->
      <template #extra></template>
    </ExamPlayer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { NotifyPlugin } from 'tdesign-vue-next'
import { ExamPlayer, type PlayerConfig } from '@dsz-examaware/player'
// 导入 player 包的样式
import '@dsz-examaware/player/dist/player.css'
import { useConfigLoader } from '@renderer/composables/useConfigLoader'
import { ElectronTimeProvider } from '@renderer/adapters/ElectronTimeProvider'
import { RecentFileManager } from '@renderer/core/recentFileManager'
import { applyThemeMode, getThemeMode, type ThemeMode } from '@renderer/core/themeManager'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import {
  clampUiScale,
  clampLargeClockScale,
  clampMaterialFontScale,
  clampAuxiliaryFontScale,
  normalizeDensity
} from '@renderer/composables/usePlaybackSettings'
import { useDesktopApi, type UIDensity } from '@renderer/runtime/desktopApi'
import { useSettingRef } from '@renderer/composables/useSetting'
import { createPlayerLauncher } from '@renderer/services/playerLauncher'
import {
  createReminderSoundController,
  normalizeReminderSoundSettings,
  type ReminderSoundKind
} from '@renderer/services/reminderSound'
import {
  POND_REMINDER_SOUND_PACK,
  selectReminderSoundPack,
  type ReminderSoundPackSummary
} from '../../../shared/reminderSoundPack'
// 键盘相关逻辑已经内置在 ExamPlayer 中

const ipcRenderer = window.api.ipc

const settingsStore = useSettingsStore()
const desktopApi = useDesktopApi()
const {
  uiScale: uiScaleSetting,
  uiDensity: uiDensitySetting,
  largeClockEnabled: largeClockEnabledSetting,
  largeClockScale: largeClockScaleSetting,
  examInfoLargeFont: examInfoLargeFontSetting,
  materialFontScale: materialFontScaleSetting,
  auxiliaryFontScale: auxiliaryFontScaleSetting,
  preCountdownMinutes: preCountdownMinutesSetting
} = desktopApi.playback

// 播放器主题
const playerTheme = useSettingRef<'classic' | 'enhanced'>('appearance.playerTheme', 'enhanced')
const classicShowMaterial = useSettingRef<boolean>('appearance.classicShowMaterial', false)
const pagesPerSheet = useSettingRef<number>('player.pagesPerSheet', 4)

const defaultRoomSetting = computed(() => {
  const raw = settingsStore.get<string>('player.defaultRoom', '01')
  if (!raw) return '01'
  const trimmed = raw.trim()
  return trimmed.length ? trimmed : '01'
})
const hdrHighlightSetting = computed(() =>
  Boolean(settingsStore.get<boolean>('player.hdrHighlight', false))
)
const largeClockEnabled = largeClockEnabledSetting

// === 提醒铃声 ===
const reminderSoundSettings = computed(() =>
  normalizeReminderSoundSettings({
    master: settingsStore.get<unknown>('player.reminderSound.enabled', true),
    start: settingsStore.get<unknown>('player.reminderSound.start', true),
    alert: settingsStore.get<unknown>('player.reminderSound.alert', true),
    end: settingsStore.get<unknown>('player.reminderSound.end', true),
    volume: settingsStore.get<unknown>('player.reminderSound.volume', 0.7)
  })
)

const reminderSoundPackId = computed(() => {
  const value = settingsStore.get<unknown>('player.reminderSound.packId', 'pond')
  return typeof value === 'string' && value.trim() ? value.trim() : 'pond'
})
const reminderSoundPacks = ref<ReminderSoundPackSummary[]>([POND_REMINDER_SOUND_PACK])
const activeReminderSoundPack = computed(() =>
  selectReminderSoundPack(reminderSoundPacks.value, reminderSoundPackId.value)
)
let soundPackLoadRequest = 0
const loadReminderSoundPacks = async () => {
  const request = ++soundPackLoadRequest
  try {
    const packs = await window.api.reminderSounds.list()
    if (request === soundPackLoadRequest) {
      reminderSoundPacks.value = packs.length ? packs : [POND_REMINDER_SOUND_PACK]
    }
  } catch (error) {
    console.warn('读取提醒铃声方案失败，将使用 Pond', error)
  }
}

const reminderSoundController = createReminderSoundController({
  baseUrl: document.baseURI,
  sourceProvider: (kind) => activeReminderSoundPack.value.sounds[kind].src,
  reporter: ({ kind, phase, error }) => {
    console.warn(`提醒铃声处理失败（类型：${kind}，阶段：${phase}）:`, error)
  }
})

watch(
  reminderSoundPackId,
  (packId) => {
    if (!reminderSoundPacks.value.some((pack) => pack.id === packId)) {
      void loadReminderSoundPacks()
    }
  },
  { immediate: true }
)

// 考场号相关状态
const roomNumber = ref(defaultRoomSetting.value)

// 使用配置加载器
const {
  loading,
  loaded,
  config: configData,
  source: configSource,
  loadFromIPC,
  reload: reloadConfig
} = useConfigLoader(ipcRenderer)

// 创建 Electron 时间提供器
const timeProvider = new ElectronTimeProvider(ipcRenderer)

// 播放器逻辑已由 ExamPlayer 组件内部处理

// 播放器配置
const manualRoomOverride = ref(false)

const scaleSeed = uiScaleSetting

watch(defaultRoomSetting, (value) => {
  if (!manualRoomOverride.value) {
    roomNumber.value = value
  }
})

const playerConfig = computed<PlayerConfig>(() => ({
  roomNumber: roomNumber.value,
  fullscreen: true,
  timeSync: true,
  refreshInterval: 1000,
  preCountdownMinutes: preCountdownMinutesSetting.value
}))

// 时间同步状态文本
const timeSyncStatusText = computed(() => {
  return timeProvider.getTimeSyncStatusText()
})

const previousThemeMode = ref<ThemeMode>(getThemeMode())
let didForceTheme = false

// === 事件处理器 ===

// 考场号点击（交由 ExamPlayer 弹出设置）
const handleRoomNumberClick = () => {
  console.log('考场号被点击（由 ExamPlayer 处理弹窗）')
}

// 接收 ExamPlayer 的房间号变更
const handleRoomNumberChange = (val: string) => {
  roomNumber.value = val
  manualRoomOverride.value = true
  NotifyPlugin.success({
    title: '设置成功',
    content: `考场号已设置为：${roomNumber.value}`,
    placement: 'bottom-right',
    closeBtn: true
  })
}

const handleScaleChange = (scale: number) => {
  const safe = clampUiScale(scale)
  if (Object.is(uiScaleSetting.value, safe)) return
  uiScaleSetting.value = safe
}

const handleDensitySettingChange = (density: UIDensity) => {
  const normalized = normalizeDensity(density)
  if (uiDensitySetting.value === normalized) return
  uiDensitySetting.value = normalized
}

const handleLargeClockToggle = (enabled: boolean) => {
  const flag = Boolean(enabled)
  if (largeClockEnabledSetting.value === flag) return
  largeClockEnabledSetting.value = flag
}

const handleLargeClockScaleChange = (scale: number) => {
  const safe = clampLargeClockScale(scale)
  if (Object.is(largeClockScaleSetting.value, safe)) return
  largeClockScaleSetting.value = safe
}

const handleExamInfoLargeFontToggle = (enabled: boolean) => {
  const flag = Boolean(enabled)
  if (examInfoLargeFontSetting.value === flag) return
  examInfoLargeFontSetting.value = flag
}

const handleMaterialFontScaleChange = (scale: number) => {
  const safe = clampMaterialFontScale(scale)
  if (Object.is(materialFontScaleSetting.value, safe)) return
  materialFontScaleSetting.value = safe
}

const handleAuxiliaryFontScaleChange = (scale: number) => {
  const safe = clampAuxiliaryFontScale(scale)
  if (Object.is(auxiliaryFontScaleSetting.value, safe)) return
  auxiliaryFontScaleSetting.value = safe
}

// 考试开始事件
const handleExamStart = (exam: any) => {
  console.log('考试开始:', exam)
  NotifyPlugin.success({
    title: '考试开始',
    content: `${exam.name} 已开始`,
    placement: 'bottom-right',
    closeBtn: true
  })
}

// 考试结束事件
const handleExamEnd = (exam: any) => {
  console.log('考试结束:', exam)
  NotifyPlugin.info({
    title: '考试结束',
    content: `${exam.name} 已结束`,
    placement: 'bottom-right',
    closeBtn: true
  })
  // 通知主进程检查是否为该时间段最后一场考试，若是则触发系统关机
  try {
    ipcRenderer?.invoke?.('exam:check-shutdown', configData.value ?? null, exam ?? null)
  } catch (e) {
    console.warn('发送考试结束关机检查失败:', e)
  }
}

// 考试提醒事件
const handleExamAlert = (exam: any, alertTime: number) => {
  console.log('考试提醒:', exam, alertTime)
  const minutes = Math.floor(alertTime / 60000)
  NotifyPlugin.warning({
    title: '考试提醒',
    content: `${exam.name} 将在 ${minutes} 分钟后${alertTime > 0 ? '开始' : '结束'}`,
    placement: 'bottom-right',
    closeBtn: true,
    duration: 5000
  })
}

// 考前倒计时开始事件
const handlePreExamStart = (exam: any, preMinutes: number) => {
  console.log('考前倒计时开始:', exam, preMinutes)
  NotifyPlugin.info({
    title: '即将开考',
    content: `${exam.name} 将在 ${preMinutes} 分钟后开始`,
    placement: 'bottom-right',
    closeBtn: true,
    duration: 5000
  })
}

// 彩色提醒事件：触发铃声播放
const handleColorfulAlert = (payload: { kind: ReminderSoundKind }) => {
  void reminderSoundController
    .play(payload.kind, reminderSoundSettings.value)
    .catch(() => undefined)
}

// === 集控：IPC 桥接（player:control / player:overlay-notice / player:status-report）===
const examPlayerRef = ref<any>(null)

// 状态上报：ExamPlayer 状态变化 → 主进程 → 广播给控制端
const handleStatusUpdate = (status: any) => {
  try {
    ipcRenderer?.send?.('player:status-report', { ...status, now: Date.now() })
  } catch (e) {
    console.warn('上报状态失败:', e)
  }
}

// 控制命令：主进程转发 → 调 ExamPlayer 暴露的 executeControl → 回 player:control-result
const handleControlCommand = async (
  _event: unknown,
  payload: { id?: string; kind: string; data?: any }
) => {
  if (!payload?.id || !payload?.kind) return
  const player = examPlayerRef.value
  if (!player?.executeControl) {
    sendControlResult(payload.id, { ok: false, error: '播放器未就绪' })
    return
  }
  try {
    const result = await player.executeControl(payload.kind, payload.data)
    sendControlResult(payload.id, result)
  } catch (e) {
    sendControlResult(payload.id, { ok: false, error: e instanceof Error ? e.message : '执行异常' })
  }
}

// 广播通知：主进程 → ExamPlayer 叠全屏 markdown 通知
const handleOverlayNotice = (
  _event: unknown,
  payload: { id?: string; title: string; body: string; color?: string }
) => {
  const player = examPlayerRef.value
  let ok = true
  let error: string | undefined
  try {
    player?.showBroadcastNotice?.(payload)
  } catch (e) {
    ok = false
    error = e instanceof Error ? e.message : '广播显示失败'
  }
  // 回执给主进程，消灭 fire-and-forget 虚假成功
  if (payload?.id) {
    try {
      ipcRenderer?.send?.('player:overlay-notice-result', { id: payload.id, ok, error })
    } catch {}
  }
}

const sendControlResult = (id: string, result: { ok: boolean; error?: string }) => {
  try {
    ipcRenderer?.send?.('player:control-result', { id, ...result })
  } catch (e) {
    console.warn('回执发送失败:', e)
  }
}

// 考试切换事件
const handleExamSwitch = (fromExam: any, toExam: any) => {
  console.log('考试切换:', fromExam, '->', toExam)
  if (fromExam && toExam && fromExam.name !== toExam.name) {
    NotifyPlugin.info({
      title: '已切换到下一场考试',
      content: `当前考试: ${toExam.name}`,
      placement: 'bottom-right',
      closeBtn: true
    })
  }
}

// 错误事件
const handleError = (error: string) => {
  console.error('ExamPlayer 错误:', error)
  NotifyPlugin.error({
    title: '播放器错误',
    content: error,
    placement: 'bottom-right',
    closeBtn: true
  })
}

// 退出播放（通过 IPC 请求主进程关闭窗口）
const handleExit = () => {
  try {
    ipcRenderer?.send?.('player-window-exit')
  } catch (e) {
    console.warn('发送退出请求失败:', e)
  }
}

// 最小化播放窗口
const handleMinimize = () => {
  try {
    window.electronAPI?.minimize()
  } catch (e) {
    console.warn('最小化窗口失败:', e)
  }
}

// 打开设置窗口（作为独立窗口从播放器外部打开）
const handleOpenSettings = () => {
  window.api?.ipc?.send?.('open-player-settings-window')
}

// 打开文件：弹出文件选择对话框，选中后在新播放器窗口中打开
const handleOpenFile = async () => {
  try {
    const launcher = createPlayerLauncher()
    await launcher.selectLocalAndOpen()
  } catch (e) {
    console.warn('打开文件失败:', e)
    NotifyPlugin.error({
      title: '打开文件失败',
      content: e instanceof Error ? e.message : '未知错误',
      placement: 'bottom-right',
      closeBtn: true
    })
  }
}

// === 考场号设置相关 === 已移至 ExamPlayer 内部

// === 初始化和清理 ===

onMounted(async () => {
  previousThemeMode.value = getThemeMode()
  applyThemeMode('dark')
  didForceTheme = true
  document.documentElement.setAttribute('data-player-force-dark', 'true')

  console.log('PlayerViewNew mounted, starting initialization...')

  // 检查 IPC 是否可用
  if (!ipcRenderer) {
    console.error('IPC renderer not available')
    NotifyPlugin.error({
      title: '系统通信错误',
      content: '无法与主程序通信，请重启应用程序',
      placement: 'bottom-right',
      closeBtn: true
    })
    return
  }

  console.log('IPC renderer available, setting up listeners...')

  // 集控：订阅主进程下发的控制命令与广播通知
  ipcRenderer?.on?.('player:control', handleControlCommand)
  ipcRenderer?.on?.('player:overlay-notice', handleOverlayNotice)

  // 执行时间同步
  try {
    await timeProvider.performSync()
    console.log('初始时间同步完成')
  } catch (error) {
    console.warn('初始时间同步失败:', error)
  }

  // 使用新的配置加载器从 IPC 加载配置
  try {
    console.log('Attempting to load config via new loader...')
    await loadFromIPC(30000) // 30秒超时
    console.log('Config loaded successfully via new loader!')

    // 配置加载成功后的处理
    if (configData.value) {
      console.log('开始处理加载的配置:', configData.value)

      // 记录到最近文件列表（如果有配置名称的话）
      if (configData.value.examName) {
        const configIdentifier = `${configData.value.examName}_${new Date().toISOString().split('T')[0]}`
        RecentFileManager.addRecentFile(configIdentifier)
        console.log('已添加到最近文件列表:', configIdentifier)
      }

      // 显示成功加载的通知
      NotifyPlugin.success({
        title: '考试档案已加载',
        content: `已成功加载考试档案：${configData.value.examName}`,
        placement: 'bottom-right',
        closeBtn: true
      })
    } else {
      console.warn('配置加载器返回了空配置')
      NotifyPlugin.warning({
        title: '未找到考试档案',
        content: '未找到有效的考试档案文件(.ea2)，请确保档案文件已正确拷贝到大屏设备',
        placement: 'bottom-right',
        closeBtn: true
      })
    }
  } catch (error) {
    console.error('Config loading failed:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    NotifyPlugin.error({
      title: '考试档案加载失败',
      content: `考试档案文件(.ea2)加载失败：${errorMessage}。请检查文件是否损坏或格式是否正确。`,
      placement: 'bottom-right',
      closeBtn: true,
      duration: 15000
    })
  }
})

onUnmounted(() => {
  console.log('PlayerViewNew 卸载')

  // 集控：移除 IPC 监听
  try {
    ipcRenderer?.off?.('player:control', handleControlCommand)
    ipcRenderer?.off?.('player:overlay-notice', handleOverlayNotice)
  } catch (e) {
    console.warn('移除集控监听失败:', e)
  }

  // 清理资源
  reminderSoundController.dispose()
  timeProvider.destroy()
  document.documentElement.removeAttribute('data-player-force-dark')
  if (didForceTheme && getThemeMode() === 'dark') {
    applyThemeMode(previousThemeMode.value)
  }
})

// 暴露调试接口
if (typeof window !== 'undefined') {
  ;(window as any).debugPlayerView = {
    get config() {
      return configData.value
    },
    get roomNumber() {
      return roomNumber.value
    },
    get uiScale() {
      return scaleSeed.value
    },
    get timeProvider() {
      return timeProvider
    },
    get syncStatus() {
      return timeProvider.getSyncStatus()
    },
    get syncStatusText() {
      return timeSyncStatusText.value
    },
    get loading() {
      return loading.value
    },
    get loaded() {
      return loaded.value
    },
    get source() {
      return configSource.value
    },
    performSync: () => timeProvider.performSync(),
    reloadConfig
  }
}
</script>

<style scoped>
.player-view-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #05070d;
  color: var(--td-text-color-anti);
}

:global(:root[data-player-force-dark]) {
  background-color: #05070d !important;
}

/* 虚拟键盘样式 */
.keyboard-container {
  margin-top: 20px;
}

.virtual-keyboard {
  max-width: 300px;
  margin: 0 auto;
}

.virtual-keyboard {
  background: transparent;
}

/* 暗色主题数字键盘样式 */
:deep(.numeric-keyboard-dark) {
  background: #1a1a1a !important;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

:deep(.numeric-keyboard-dark .hg-button) {
  background: #2d2d2d !important;
  color: var(--td-text-color-anti) !important;
  border: 1px solid #404040 !important;
  border-radius: 6px !important;
  height: 50px !important;
  margin: 3px !important;
  font-size: 18px !important;
  font-weight: 500 !important;
  transition: all 0.2s ease !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

:deep(.numeric-keyboard-dark .hg-button:hover) {
  background: #3d3d3d !important;
  border-color: #505050 !important;
  transform: translateY(-1px) !important;
}

:deep(.numeric-keyboard-dark .hg-button:active) {
  background: #1d1d1d !important;
  transform: translateY(0) !important;
}

:deep(.numeric-keyboard-dark .hg-button.hg-functionBtn) {
  background: #0052d9 !important;
  color: var(--td-text-color-anti) !important;
  border-color: #0052d9 !important;
}

:deep(.numeric-keyboard-dark .hg-button.hg-functionBtn:hover) {
  background: #1668dc !important;
  border-color: #1668dc !important;
}

:deep(.numeric-keyboard-dark .hg-row) {
  display: flex !important;
  justify-content: center !important;
}
</style>
