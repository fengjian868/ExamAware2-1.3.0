<template>
  <div class="plugin-view">
    <h2>放映器</h2>
    <p>选择一个 ExamAware 2 档案文件以开始放映。</p>
    <t-row :gutter="25">
      <t-col :span="4">
        <t-card class="card-button" @click="selectFile">
          <div class="card-content">
            <t-icon name="file" size="60px" class="card-button-icon"></t-icon>
            <p>本地文件</p>
          </div>
        </t-card>
      </t-col>
      <t-col :span="8">
        <t-card class="card-button" @click="openUrl">
          <div class="card-content">
            <t-icon name="link" size="60px" class="card-button-icon"></t-icon>
            <p>从 URL 放映</p>
          </div>
        </t-card>
      </t-col>
    </t-row>

    <!-- 最近放映的文件列表 -->
    <div v-if="recentFiles.length" class="last-file-section">
      <t-divider />
      <p class="last-file-title">最近放映</p>
      <t-card
        v-for="(item, index) in recentFiles"
        :key="item.path"
        class="card-button last-file-card"
        @click="playFile(item.path)"
      >
        <div class="card-content last-file-content">
          <t-icon name="history" size="32px" class="card-button-icon"></t-icon>
          <div class="last-file-info">
            <p class="last-file-name">{{ getFileName(item.path) }}</p>
            <p class="last-file-path">{{ item.path }}</p>
          </div>
          <t-button theme="primary" size="small" @click.stop="playFile(item.path)">
            <template #icon><t-icon name="play-circle" /></template>
            放映
          </t-button>
          <t-button theme="default" variant="text" size="small" @click.stop="removeRecent(index)">
            <template #icon><t-icon name="close" /></template>
          </t-button>
        </div>
      </t-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, computed, onMounted } from 'vue'
import { createPlayerLauncher } from '@renderer/services/playerLauncher'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSettingRef } from '@renderer/composables/useSetting'

const RECENT_FILES_KEY = 'examaware:recent-played-files'
const OLD_LAST_FILE_KEY = 'examaware:last-played-file'
const MAX_RECENT = 5

interface RecentFile {
  path: string
}

const launcher = createPlayerLauncher()
const router = useRouter()
const recentFiles = ref<RecentFile[]>([])

// 放映按钮行为设置
const playButtonMode = useSettingRef<'direct' | 'select'>('player.playButtonMode', 'direct')

const lastFilePath = computed(() => recentFiles.value[0]?.path || '')

const getFileName = (path: string): string => {
  if (!path) return ''
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

const loadRecentFiles = () => {
  try {
    // 兼容旧的单文件存储格式
    const stored = localStorage.getItem(RECENT_FILES_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        recentFiles.value = parsed
          .filter((f: any) => f && typeof f.path === 'string')
          .slice(0, MAX_RECENT)
        return
      }
    }
    // 旧格式迁移
    const old = localStorage.getItem(OLD_LAST_FILE_KEY)
    if (old) {
      recentFiles.value = [{ path: old }]
      saveRecentFiles()
      localStorage.removeItem(OLD_LAST_FILE_KEY)
    }
  } catch {}
}

const saveRecentFiles = () => {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recentFiles.value))
  } catch {}
}

const addRecentFile = (path: string) => {
  // 去重：已存在则移到最前
  recentFiles.value = recentFiles.value.filter((f) => f.path !== path)
  recentFiles.value.unshift({ path })
  // 最多保留 MAX_RECENT 条
  recentFiles.value = recentFiles.value.slice(0, MAX_RECENT)
  saveRecentFiles()
}

const removeRecent = (index: number) => {
  recentFiles.value.splice(index, 1)
  recentFiles.value = [...recentFiles.value]
  saveRecentFiles()
}

const selectFile = async () => {
  const path = await launcher.selectLocalAndOpen()
  if (path) {
    addRecentFile(path)
  }
}

const playFile = async (path: string) => {
  if (!path) {
    MessagePlugin.warning('文件路径无效')
    return
  }
  try {
    await launcher.openWith({ source: 'file', pathOrUrl: path })
    // 播放后移到最前
    addRecentFile(path)
  } catch (error) {
    const message = error instanceof Error ? error.message : '打开失败'
    MessagePlugin.error(message)
  }
}

const playLastFile = async () => {
  // 根据设置决定行为：直接播放或打开文件选择
  if (playButtonMode.value === 'select') {
    await selectFile()
    return
  }
  if (!lastFilePath.value) {
    MessagePlugin.warning('没有最近放映的记录')
    return
  }
  await playFile(lastFilePath.value)
}

const openUrl = async () => {
  await router.push('/playerhome/url')
}

onMounted(() => {
  loadRecentFiles()
})

// 暴露给外部可能的调用
defineExpose({ playLastFile })
</script>

<style scoped>
.plugin-view {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

h2,
p {
  user-select: none;
}

.card-button {
  cursor: pointer;
  text-align: center;
  padding: 20px;
  margin-bottom: 10px;
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card-content t-icon {
  margin-bottom: 10px;
}

.card-content p {
  margin: 0;
}

.card-button-icon {
  padding-bottom: 15px;
}

/* 最近放映 */
.last-file-section {
  margin-top: 10px;
}

.last-file-title {
  font-size: 14px;
  color: var(--td-text-color-secondary);
  margin-bottom: 12px;
}

.last-file-card {
  text-align: left;
}

.last-file-content {
  flex-direction: row;
  gap: 12px;
  align-items: center;
  padding: 8px;
}

.last-file-content .card-button-icon {
  padding-bottom: 0;
  flex-shrink: 0;
}

.last-file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.last-file-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--td-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.last-file-path {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
