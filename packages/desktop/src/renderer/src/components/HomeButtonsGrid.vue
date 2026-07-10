<template>
  <div class="home-buttons-grid">
    <div class="pagination-container">
      <div
        class="buttons-page"
        v-for="(page, pageIndex) in pages"
        :key="pageIndex"
        :style="pageStyle(pageIndex)"
      >
        <div class="buttons-row" v-for="(row, rowIndex) in page" :key="rowIndex">
          <div class="button-container" v-for="button in row" :key="button.id">
            <t-button
              class="home-button"
              :theme="button.theme"
              :title="button.hint"
              @click="handleButtonClick(button)"
            >
              <t-icon :name="button.icon" size="50px" />
            </t-button>
            <p class="button-description">{{ button.label }}</p>
          </div>
          <div
            class="button-container placeholder"
            v-for="i in 4 - row.length"
            :key="`placeholder-${rowIndex}-${i}`"
          ></div>
        </div>
      </div>
    </div>

    <!-- 分页指示器 -->
    <div class="page-indicators" v-if="pages.length > 1">
      <t-button
        v-for="(_, index) in pages"
        :key="index"
        size="small"
        shape="circle"
        :theme="currentPage === index ? 'primary' : 'default'"
        @click="currentPage = index"
      >
        {{ index + 1 }}
      </t-button>
    </div>

    <!-- 左右滑动按钮 -->
    <div class="nav-buttons" v-if="pages.length > 1">
      <t-button
        class="nav-btn nav-prev"
        shape="circle"
        theme="default"
        :disabled="currentPage === 0"
        @click="prevPage"
      >
        <t-icon name="chevron-left" />
      </t-button>
      <t-button
        class="nav-btn nav-next"
        shape="circle"
        theme="default"
        :disabled="currentPage === pages.length - 1"
        @click="nextPage"
      >
        <t-icon name="chevron-right" />
      </t-button>
    </div>

    <!-- 考场号输入区 -->
    <div class="room-number-bar" @click="openRoomKeyboard">
      <span class="room-label">考场号</span>
      <span class="room-value">{{ roomNumber }}</span>
    </div>

    <!-- 考场号键盘弹窗 -->
    <t-dialog
      header="设置考场号"
      v-model:visible="showRoomKeyboard"
      :footer="true"
      @confirm="handleRoomConfirm"
      @cancel="handleRoomCancel"
      @esc-keydown="handleRoomCancel"
      @close-btn-click="handleRoomCancel"
      @close="handleRoomCancel"
    >
      <template #body>
        <t-input v-model="tempRoomNumber" type="text" placeholder="请输入考场号" maxlength="10" />
        <div class="keyboard-container">
          <div ref="keyboardRef" class="virtual-keyboard"></div>
        </div>
      </template>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useHomeButtonsList } from '@renderer/composables/useHomeButtons'
import type { HomeButtonMeta } from '@renderer/app/modules/homeButtons'
import { useHomeButtons } from '@renderer/composables/useHomeButtons'
import { Dialog as TDialog, Input as TInput } from 'tdesign-vue-next'
import 'simple-keyboard/build/css/index.css'

const registry = useHomeButtons()
const { list } = useHomeButtonsList(registry)
const currentPage = ref(0)

const pages = computed((): HomeButtonMeta[][][] => {
  const buttons = list()
  const buttonsPerPage = 8
  const pageCount = Math.ceil(buttons.length / buttonsPerPage)
  const result: HomeButtonMeta[][][] = []

  for (let i = 0; i < pageCount; i++) {
    const pageButtons = buttons.slice(i * buttonsPerPage, (i + 1) * buttonsPerPage)
    const rows: HomeButtonMeta[][] = []

    for (let j = 0; j < 2; j++) {
      const rowButtons = pageButtons.slice(j * 4, (j + 1) * 4)
      rows.push(rowButtons)
    }

    result.push(rows)
  }

  return result
})

const pageStyle = (pageIndex: number) => {
  const offset = (pageIndex - currentPage.value) * 100
  const isActive = pageIndex === currentPage.value
  return {
    transform: `translateX(${offset}%)`,
    opacity: isActive ? 1 : 0,
    zIndex: `${pages.value.length - Math.abs(pageIndex - currentPage.value)}`
  }
}

// Keep current page in range when items change
watch(
  () => pages.value.length,
  (len) => {
    if (currentPage.value > len - 1) {
      currentPage.value = Math.max(0, len - 1)
    }
  }
)

const handleButtonClick = async (button: HomeButtonMeta) => {
  try {
    await button.action()
  } catch (error) {
    console.error('Button action failed:', error)
  }
}

const prevPage = () => {
  if (currentPage.value > 0) {
    currentPage.value--
  }
}

const nextPage = () => {
  if (currentPage.value < pages.value.length - 1) {
    currentPage.value++
  }
}

/* ----------------- 考场号输入区与虚拟键盘 ----------------- */
const ROOM_STORAGE_KEY = 'examaware:roomNumber'

const loadRoomNumber = (): string => {
  if (typeof window === 'undefined') return '01'
  try {
    const v = window.localStorage.getItem(ROOM_STORAGE_KEY)
    return v && v.trim() ? v.trim() : '01'
  } catch {
    return '01'
  }
}

const saveRoomNumber = (val: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ROOM_STORAGE_KEY, val)
  } catch {}
}

const roomNumber = ref<string>(loadRoomNumber())
const showRoomKeyboard = ref(false)
const tempRoomNumber = ref<string>(roomNumber.value)
const keyboardRef = ref<HTMLElement>()
let keyboardInstance: any = null

// 键盘按键处理
const onKeyPress = (button: string) => {
  if (button === '{clear}') {
    tempRoomNumber.value = ''
  } else if (button === '{bksp}') {
    tempRoomNumber.value = tempRoomNumber.value.slice(0, -1)
  } else {
    // 限制只能输入数字和字母，最大长度10
    if (/^[0-9a-zA-Z]$/.test(button) && tempRoomNumber.value.length < 10) {
      tempRoomNumber.value += button
    }
  }
}

// 初始化虚拟键盘
const initKeyboard = () => {
  import('simple-keyboard')
    .then(({ default: Keyboard }) => {
      if (keyboardRef.value && !keyboardInstance) {
        keyboardInstance = new Keyboard(keyboardRef.value, {
          layout: {
            default: ['1 2 3', '4 5 6', '7 8 9', '{clear} 0 {bksp}']
          },
          display: {
            '{clear}': '清空',
            '{bksp}': '⌫ 删除'
          },
          theme: 'hg-theme-default hg-layout-numeric numeric-keyboard-dark',
          physicalKeyboardHighlight: false,
          syncInstanceInputs: false,
          mergeDisplay: true,
          onKeyPress: (button: string) => onKeyPress(button)
        })
      }
    })
    .catch((error) => {
      console.warn('Failed to load simple-keyboard:', error)
    })
}

// 销毁虚拟键盘
const destroyKeyboard = () => {
  if (keyboardInstance) {
    keyboardInstance.destroy()
    keyboardInstance = null
  }
}

// 打开考场号键盘弹窗
const openRoomKeyboard = () => {
  tempRoomNumber.value = roomNumber.value || '01'
  showRoomKeyboard.value = true
  // 延迟初始化键盘，确保 DOM 已渲染
  setTimeout(() => {
    initKeyboard()
  }, 100)
}

// 确认考场号设置：同时写入 localStorage 与 settings
const handleRoomConfirm = async () => {
  const next = (tempRoomNumber.value || '').trim()
  if (!next) {
    return
  }
  roomNumber.value = next
  saveRoomNumber(next)
  try {
    await window.api.config.set('player.defaultRoom', next)
  } catch (error) {
    console.error('Failed to save room number to settings:', error)
  }
  showRoomKeyboard.value = false
  destroyKeyboard()
}

// 取消考场号设置
const handleRoomCancel = () => {
  showRoomKeyboard.value = false
  tempRoomNumber.value = roomNumber.value || '01'
  destroyKeyboard()
}

onUnmounted(() => {
  destroyKeyboard()
})
</script>

<style scoped>
.home-buttons-grid {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 20px;
}

.pagination-container {
  position: relative;
  width: 100%;
  max-width: 520px;
  height: 300px;
  overflow: hidden;
  background: color-mix(in srgb, var(--td-bg-color-page) 35%, transparent);
  backdrop-filter: blur(16px);
  border-radius: 14px;
}

.buttons-page {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px; /* 减小行间距 */
  opacity: 0;
  transform: translateX(0);
  transition:
    transform 0.32s ease,
    opacity 0.32s ease;
}

.buttons-row {
  display: flex;
  justify-content: center;
  gap: 16px; /* 减小按钮间距 */
  width: 100%;
}

.button-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 100px; /* 减小最小宽度 */
  min-height: 130px; /* 保持单行页与双行页的行高一致 */
}

.button-container.placeholder {
  visibility: hidden;
}

.home-button {
  width: 72px; /* 减小按钮尺寸 */
  height: 72px;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
}

.button-description {
  margin-top: 8px; /* 减小文字间距 */
  font-size: 14px; /* 减小字体 */
  text-align: center;
  color: var(--td-text-color-primary);
  white-space: nowrap;
}

.page-indicators {
  margin-top: 24px; /* 减小上边距 */
  display: flex;
  gap: 8px;
}

.nav-buttons {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 0 -20px; /* 调整左右箭头位置 */
  pointer-events: none;
}

.nav-btn {
  pointer-events: auto;
}

/* 考场号输入条 */
.room-number-bar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 240px;
  padding: 10px 24px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--td-bg-color-page) 35%, transparent);
  backdrop-filter: blur(16px);
  border: 1px solid color-mix(in srgb, var(--td-border-level-2-color) 50%, transparent);
  cursor: pointer;
  user-select: none;
  transition:
    background 0.2s ease,
    transform 0.2s ease;
}

.room-number-bar:hover {
  background: color-mix(in srgb, var(--td-bg-color-page) 55%, transparent);
  transform: translateX(-50%) translateY(-1px);
}

.room-label {
  font-size: 16px;
  color: var(--td-text-color-secondary);
  letter-spacing: 1px;
}

.room-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  min-width: 40px;
  text-align: right;
}

/* 键盘样式 */
.keyboard-container {
  margin-top: 10px;
}

.virtual-keyboard {
  max-width: 260px;
  margin: 0 auto;
  background: transparent;
}

:deep(.numeric-keyboard-dark) {
  background: #1a1a1a !important;
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

:deep(.numeric-keyboard-dark .hg-button) {
  background: #2d2d2d !important;
  color: #ffffff !important;
  border: 1px solid #404040 !important;
  border-radius: 6px !important;
  height: 36px !important;
  margin: 2px !important;
  font-size: 15px !important;
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
  color: #ffffff !important;
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
