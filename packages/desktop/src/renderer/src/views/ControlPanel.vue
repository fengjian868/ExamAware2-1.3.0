<template>
  <div class="control-panel">
    <!-- 顶栏 -->
    <header class="cp-header" :class="`cp-header--${platform}`">
      <div class="cp-title">集控面板</div>
      <div class="cp-header-actions">
        <t-button variant="outline" size="small" :loading="refreshing" @click="refresh">
          刷新发现
        </t-button>
        <t-checkbox v-model="onlyOnline">仅显示在线</t-checkbox>
        <span class="cp-count">设备 {{ onlineCount }}/{{ devices.length }} 在线</span>
      </div>
    </header>

    <div class="cp-body">
      <!-- 左栏：设备列表 -->
      <aside class="cp-left">
        <div class="cp-left-head">设备列表</div>
        <t-empty v-if="!filteredDevices.length" size="small" description="暂无设备" />
        <div v-else class="cp-device-list">
          <div
            v-for="d in filteredDevices"
            :key="d.peerId"
            class="cp-device-row"
            :class="{ active: selectedId === d.peerId }"
            @click="selectDevice(d.peerId)"
          >
            <t-checkbox
              :checked="checkedIds.includes(d.peerId)"
              @click.stop
              @change="(v) => toggleCheck(d.peerId, v as boolean)"
            />
            <div class="cp-device-main">
              <div class="cp-device-name">
                <span class="cp-dot" :class="{ on: d.online, conn: d.connecting }"></span>
                {{ d.deviceName || d.peerId }}
              </div>
              <div class="cp-device-sub">
                <span v-if="d.online && d.status">
                  {{ d.status.currentExam || '—' }} · {{ statusText(d.status.examStatus) }}
                </span>
                <span v-else-if="d.connecting">连接中…</span>
                <span v-else>离线</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 中栏：选中设备详情 + 快捷操作 -->
      <section class="cp-center">
        <div v-if="!selected" class="cp-empty-center">
          <t-empty description="从左侧选择一台设备查看详情" />
        </div>
        <template v-else>
          <div class="cp-detail-head">
            <span class="cp-dot" :class="{ on: selected.online, conn: selected.connecting }"></span>
            <span class="cp-detail-name">{{ selected.deviceName || selected.peerId }}</span>
            <span class="cp-detail-state">{{ selected.online ? '在线' : '离线' }}</span>
          </div>
          <div class="cp-detail-grid">
            <div class="cp-field">
              <span class="cp-label">考试档案</span
              ><span class="cp-value">{{ selected.status?.examName || '—' }}</span>
            </div>
            <div class="cp-field">
              <span class="cp-label">当前科目</span
              ><span class="cp-value">{{ selected.status?.currentExam || '—' }}</span>
            </div>
            <div class="cp-field">
              <span class="cp-label">考试状态</span
              ><span class="cp-value">{{
                selected.status ? statusText(selected.status.examStatus) : '—'
              }}</span>
            </div>
            <div class="cp-field">
              <span class="cp-label">考场号</span
              ><span class="cp-value">{{ selected.status?.roomNumber || '—' }}</span>
            </div>
            <div class="cp-field">
              <span class="cp-label">时钟偏移</span
              ><span class="cp-value">{{
                selected.status ? formatOffset(selected.status.now) : '—'
              }}</span>
            </div>
            <div class="cp-field">
              <span class="cp-label">档案加载</span
              ><span class="cp-value">{{ selected.status?.configLoaded ? '是' : '否' }}</span>
            </div>
          </div>

          <div class="cp-section-title">快捷操作</div>
          <div class="cp-actions">
            <t-button size="small" @click="pickAndPushConfig([selected.peerId])">推送档案</t-button>
            <t-button size="small" @click="sendOne(selected.peerId, { kind: 'openPlayer' })"
              >打开播放器</t-button
            >
            <t-button size="small" @click="quickSwitch(selected.peerId)">切场</t-button>
            <t-button
              size="small"
              theme="danger"
              variant="outline"
              @click="sendOne(selected.peerId, { kind: 'end' })"
              >结束当前</t-button
            >
            <t-button size="small" @click="openAlertDialog(selected.peerId)">提醒</t-button>
            <t-button size="small" @click="openRoomDialog(selected.peerId)">改考场号</t-button>
            <t-button size="small" @click="openBroadcastDialog([selected.peerId])">广播</t-button>
            <t-button
              size="small"
              theme="default"
              variant="dashed"
              @click="sendOne(selected.peerId, { kind: 'exit' })"
              >退出</t-button
            >
          </div>
        </template>
      </section>

      <!-- 右栏：批量操作 -->
      <aside class="cp-right">
        <div class="cp-right-head">
          <span>批量操作</span>
          <span class="cp-right-count">已选 {{ checkedIds.length }}</span>
        </div>
        <div class="cp-right-selected">
          <t-tag
            v-for="id in checkedIds"
            :key="id"
            closable
            @close="toggleCheck(id, false)"
            size="small"
          >
            {{ deviceName(id) }}
          </t-tag>
          <span v-if="!checkedIds.length" class="cp-hint">勾选左侧设备进行批量操作</span>
        </div>
        <div class="cp-batch-actions">
          <t-button block @click="pickAndPushConfig(checkedIds)">推送档案</t-button>
          <t-button block @click="batchSend({ kind: 'openPlayer' })">全部打开播放器</t-button>
          <t-button block @click="batchSend({ kind: 'switch', data: { direction: 'next' } })"
            >全部切下一场</t-button
          >
          <t-button block theme="danger" variant="outline" @click="batchSend({ kind: 'end' })"
            >全部结束</t-button
          >
          <t-button block @click="openBroadcastDialog(checkedIds)">紧急广播</t-button>
          <t-button block variant="dashed" @click="batchSend({ kind: 'exit' })">全部退出</t-button>
        </div>
        <div class="cp-batch-result">
          <div v-if="!batchResults.length" class="cp-hint">批量回执将显示在此</div>
          <div v-for="r in batchResults" :key="r.peerId" class="cp-result-row">
            <span class="cp-dot" :class="{ on: r.result.ok }"></span>
            <span class="cp-result-name">{{ deviceName(r.peerId) }}</span>
            <span class="cp-result-state" :class="{ ok: r.result.ok }">
              {{ r.result.ok ? '成功' : r.result.error || '失败' }}
            </span>
          </div>
        </div>
      </aside>
    </div>

    <!-- 底部日志 -->
    <footer class="cp-log">
      <div v-for="(log, i) in logs" :key="i" class="cp-log-row" :class="{ err: !log.ok }">
        {{ log.time }} · {{ log.text }}
      </div>
      <div v-if="!logs.length" class="cp-hint">操作日志将显示在此</div>
    </footer>

    <!-- 提醒对话框 -->
    <t-dialog
      v-model:visible="alertVisible"
      header="发送提醒"
      :on-confirm="confirmAlert"
      width="420px"
    >
      <t-input v-model="alertTitle" placeholder="提醒标题（如：注意考场纪律）" />
      <t-color-picker v-model="alertColor" style="margin-top: 12px" />
    </t-dialog>

    <!-- 改考场号对话框 -->
    <t-dialog
      v-model:visible="roomVisible"
      header="修改考场号"
      :on-confirm="confirmRoom"
      width="360px"
    >
      <t-input v-model="roomValue" placeholder="请输入考场号" maxlength="10" />
    </t-dialog>

    <!-- 紧急广播对话框 -->
    <t-dialog
      v-model:visible="broadcastVisible"
      header="紧急广播"
      :on-confirm="confirmBroadcast"
      width="480px"
    >
      <t-input v-model="broadcastTitle" placeholder="广播标题" />
      <t-textarea
        v-model="broadcastBody"
        placeholder="广播正文"
        :autosize="{ minRows: 3 }"
        style="margin-top: 12px"
      />
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { NotifyPlugin, MessagePlugin } from 'tdesign-vue-next'
import { useWindowControls } from '@renderer/composables/useWindowControls'

const { platform } = useWindowControls()

interface DeviceStatus {
  playing: boolean
  examName: string
  examStatus: 'pending' | 'inProgress' | 'completed'
  currentExam: string
  roomNumber: string
  now: number
  configLoaded: boolean
}
interface ControlDevice {
  peerId: string
  deviceName: string
  host: string
  port: number
  online: boolean
  connecting: boolean
  status: DeviceStatus | null
  lastSeen: number
}

const api = window.api.control
const ipc = window.api.ipc

const devices = ref<ControlDevice[]>([])
const selectedId = ref<string>('')
const checkedIds = ref<string[]>([])
const onlyOnline = ref(false)
const refreshing = ref(false)
const logs = ref<Array<{ time: string; text: string; ok: boolean }>>([])
const batchResults = ref<Array<{ peerId: string; result: { ok: boolean; error?: string } }>>([])

const selected = computed(() => devices.value.find((d) => d.peerId === selectedId.value) || null)
const onlineCount = computed(() => devices.value.filter((d) => d.online).length)
const filteredDevices = computed(() =>
  onlyOnline.value ? devices.value.filter((d) => d.online) : devices.value
)

const statusText = (s?: string) =>
  s === 'inProgress' ? '进行中' : s === 'completed' ? '已结束' : s === 'pending' ? '待考' : '—'

const formatOffset = (now?: number) => {
  if (typeof now !== 'number') return '—'
  const offset = Date.now() - now
  const sign = offset >= 0 ? '+' : ''
  return `${sign}${offset}ms`
}

const deviceName = (id: string) => devices.value.find((d) => d.peerId === id)?.deviceName || id

const pushLog = (text: string, ok = true) => {
  const time = new Date().toLocaleTimeString()
  logs.value.unshift({ time, text, ok })
  if (logs.value.length > 50) logs.value.length = 50
}

const selectDevice = (id: string) => {
  selectedId.value = id
}

const toggleCheck = (id: string, checked: boolean) => {
  if (checked) {
    if (!checkedIds.value.includes(id)) checkedIds.value.push(id)
  } else {
    checkedIds.value = checkedIds.value.filter((x) => x !== id)
  }
}

const refresh = async () => {
  refreshing.value = true
  try {
    await api.refreshDiscovery()
    devices.value = await api.listDevices()
  } finally {
    refreshing.value = false
  }
}

// 单台发送命令
const sendOne = async (peerId: string, command: any) => {
  pushLog(`→ ${deviceName(peerId)}：${command.kind}`)
  const res = await api.sendCommand([peerId], command)
  const r = res?.[0]
  const ok = !!r?.result?.ok
  pushLog(
    `${deviceName(peerId)} ${command.kind} ${ok ? '成功' : '失败：' + (r?.result?.error || '')}`,
    ok
  )
  return r
}

// 批量发送命令
const batchSend = async (command: any) => {
  if (!checkedIds.value.length) {
    MessagePlugin.warning('请先勾选设备')
    return
  }
  batchResults.value = []
  pushLog(`批量 ${command.kind} → ${checkedIds.value.length} 台`)
  const res = await api.sendCommand(checkedIds.value, command)
  batchResults.value = res || []
  const okCount = batchResults.value.filter((r) => r.result.ok).length
  pushLog(`批量 ${command.kind} 完成：${okCount}/${batchResults.value.length} 成功`)
}

// 切场：单台弹选择
const quickSwitch = async (peerId: string) => {
  const direction = confirm('确定切换到下一场？\n（取消则切换到上一场）') ? 'next' : 'prev'
  await sendOne(peerId, { kind: 'switch', data: { direction } })
}

// 推送档案：选本地 .ea2 文件
const pickAndPushConfig = async (peerIds: string[]) => {
  if (!peerIds.length) {
    MessagePlugin.warning('请选择目标设备')
    return
  }
  const filePath = await window.api.openFileDialog({
    title: '选择考试档案',
    filters: [{ name: '考试档案', extensions: ['ea2', 'json'] }],
    properties: ['openFile']
  })
  if (!filePath) return
  const config = await window.api.readFile(filePath)
  if (!config) {
    MessagePlugin.error('读取档案失败')
    return
  }
  batchResults.value = []
  pushLog(`推送档案 → ${peerIds.length} 台`)
  const res = await api.pushConfigFile(peerIds, config)
  batchResults.value = res || []
  const okCount = batchResults.value.filter((r) => r.result.ok).length
  pushLog(`推送档案完成：${okCount}/${batchResults.value.length} 成功`)
}

// 提醒对话框
const alertVisible = ref(false)
const alertTitle = ref('')
const alertColor = ref('#ff9800')
const alertTarget = ref<string[]>([])
const openAlertDialog = (peerId: string) => {
  alertTarget.value = [peerId]
  alertTitle.value = '请注意考场纪律'
  alertVisible.value = true
}
const confirmAlert = async () => {
  alertVisible.value = false
  await batchSendTo(alertTarget.value, {
    kind: 'alert',
    data: { title: alertTitle.value, color: alertColor.value }
  })
}

// 改考场号对话框
const roomVisible = ref(false)
const roomValue = ref('')
const roomTarget = ref<string>('')
const openRoomDialog = (peerId: string) => {
  roomTarget.value = peerId
  roomValue.value = selected.value?.status?.roomNumber || ''
  roomVisible.value = true
}
const confirmRoom = async () => {
  roomVisible.value = false
  await sendOne(roomTarget.value, { kind: 'setRoom', data: { room: roomValue.value } })
}

// 紧急广播对话框
const broadcastVisible = ref(false)
const broadcastTitle = ref('')
const broadcastBody = ref('')
const broadcastTarget = ref<string[]>([])
const openBroadcastDialog = (peerIds: string[]) => {
  if (!peerIds.length) {
    MessagePlugin.warning('请选择目标设备')
    return
  }
  broadcastTarget.value = peerIds
  broadcastTitle.value = '紧急通知'
  broadcastBody.value = ''
  broadcastVisible.value = true
}
const confirmBroadcast = async () => {
  broadcastVisible.value = false
  await batchSendTo(broadcastTarget.value, {
    kind: 'broadcast',
    data: { title: broadcastTitle.value, body: broadcastBody.value }
  })
}

const batchSendTo = async (peerIds: string[], command: any) => {
  batchResults.value = []
  pushLog(`${command.kind} → ${peerIds.length} 台`)
  const res = await api.sendCommand(peerIds, command)
  batchResults.value = res || []
  const okCount = batchResults.value.filter((r) => r.result.ok).length
  pushLog(`${command.kind} 完成：${okCount}/${batchResults.value.length} 成功`)
}

// 订阅设备列表与回执
let unsubDevices: (() => void) | null = null
let unsubResult: (() => void) | null = null

onMounted(async () => {
  devices.value = await api.listDevices()
  unsubDevices = api.onDevices((list) => {
    devices.value = list
  })
  unsubResult = api.onCommandResult((payload) => {
    const { peerId, result } = payload
    pushLog(
      `${deviceName(peerId)} 回执：${result?.ok ? '成功' : '失败：' + (result?.error || '')}`,
      !!result?.ok
    )
  })
  // 定期刷新发现（主进程也每 10s 刷一次，这里 15s 拉一次设备列表兜底）
  setInterval(() => {
    api.listDevices().then((list) => {
      devices.value = list
    })
  }, 5000)
})

onUnmounted(() => {
  unsubDevices?.()
  unsubResult?.()
})

// 兼容：ipc 在 preload 已暴露
void ipc
</script>

<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background: var(--td-bg-color-page);
  color: var(--td-text-color-primary);
  overflow: hidden;
}
.cp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--td-border-level-1-color);
  flex-shrink: 0;
  /* 整个标题栏可拖动窗口 */
  -webkit-app-region: drag;
}
.cp-title {
  font-size: 18px;
  font-weight: 600;
}
.cp-header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  /* 交互区域不可拖动，否则按钮点不动 */
  -webkit-app-region: no-drag;
}
/* 确保所有交互子元素均可点击 */
.cp-header-actions :deep(*) {
  -webkit-app-region: no-drag;
}
/* Windows 原生最小化/最大化/关闭按钮区域预留空间，避免与右侧操作按钮重叠 */
.cp-header--win32 {
  padding-right: 150px;
}
/* macOS 交通灯按钮在左侧，预留空间避免遮挡标题 */
.cp-header--darwin {
  padding-left: 80px;
}
.cp-count {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
.cp-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.cp-left {
  width: 280px;
  border-right: 1px solid var(--td-border-level-1-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.cp-left-head,
.cp-right-head {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-secondary);
  border-bottom: 1px solid var(--td-border-level-1-color);
}
.cp-device-list {
  flex: 1;
  overflow-y: auto;
}
.cp-device-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--td-border-level-1-color);
}
.cp-device-row:hover {
  background: var(--td-bg-color-container-hover);
}
.cp-device-row.active {
  background: var(--td-brand-color-light);
}
.cp-device-main {
  flex: 1;
  min-width: 0;
}
.cp-device-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
}
.cp-device-sub {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-top: 2px;
}
.cp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #999;
  flex-shrink: 0;
}
.cp-dot.on {
  background: #2ecc71;
}
.cp-dot.conn {
  background: #f1c40f;
}
.cp-center {
  flex: 1;
  min-width: 0;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.cp-empty-center {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.cp-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.cp-detail-name {
  font-size: 16px;
  font-weight: 600;
}
.cp-detail-state {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
.cp-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 24px;
  margin-bottom: 20px;
}
.cp-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cp-label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
.cp-value {
  font-size: 14px;
}
.cp-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-secondary);
  margin-bottom: 10px;
}
.cp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cp-right {
  width: 280px;
  border-left: 1px solid var(--td-border-level-1-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.cp-right-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
.cp-right-selected {
  padding: 12px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 50px;
  border-bottom: 1px solid var(--td-border-level-1-color);
}
.cp-hint {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
.cp-batch-actions {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--td-border-level-1-color);
}
.cp-batch-result {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.cp-result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 4px 0;
}
.cp-result-name {
  flex: 1;
}
.cp-result-state {
  color: var(--td-error-color);
}
.cp-result-state.ok {
  color: #2ecc71;
}
.cp-log {
  height: 110px;
  border-top: 1px solid var(--td-border-level-1-color);
  padding: 8px 20px;
  overflow-y: auto;
  font-size: 12px;
  font-family: monospace;
  background: var(--td-bg-color-container);
  flex-shrink: 0;
}
.cp-log-row {
  padding: 2px 0;
  color: var(--td-text-color-secondary);
}
.cp-log-row.err {
  color: var(--td-error-color);
}
</style>
