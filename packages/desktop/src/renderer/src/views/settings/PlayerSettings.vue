<template>
  <div class="settings-page">
    <h2>播放器</h2>
    <t-space direction="vertical" size="small" style="width: 100%">
      <t-card title="默认参数" theme="poster2">
        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="play-circle" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">默认考场号</div>
            <div class="settings-item-desc">用于播放器窗口首次打开时的默认考场号。</div>
          </div>
          <div class="settings-item-action">
            <t-input
              v-model="defaultRoom"
              placeholder="例如：01"
              :maxlength="8"
              style="width: 180px"
              @blur="normalizeRoom"
            />
          </div>
        </div>

        <t-divider />

        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="upscale" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">默认界面缩放</div>
            <div class="settings-item-desc">调整播放器内 UI 的默认缩放倍率，范围 50%-200%。</div>
            <div class="settings-item-extra">
              <t-slider
                v-model="defaultScale"
                :min="0.5"
                :max="2"
                :step="0.05"
                :show-tooltip="false"
                :marks="scaleMarks"
              />
            </div>
          </div>
          <div class="settings-item-action" style="width: 160px">
            <t-input-number
              v-model="defaultScale"
              :min="0.5"
              :max="2"
              :step="0.05"
              :decimal-places="2"
              suffix="倍"
            />
            <!-- <t-tag theme="success" variant="light-outline">{{ scalePercent }}%</t-tag> -->
          </div>
        </div>

        <br />
        <t-divider />

        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="time" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">大时钟模式</div>
            <div class="settings-item-desc">开启后隐藏时钟右侧提示文字，仅保留更大的时间显示。</div>
          </div>
          <div class="settings-item-action">
            <t-switch v-model="largeClockEnabled" size="large" />
          </div>
        </div>

        <t-divider />

        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="play-circle-stroke" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">放映按钮行为</div>
            <div class="settings-item-desc">
              点击主界面"放映"按钮时，直接播放上次文件还是打开文件选择界面。
            </div>
          </div>
          <div class="settings-item-action">
            <t-radio-group v-model="playButtonMode">
              <t-radio value="direct">直接播放</t-radio>
              <t-radio value="select">选择文件</t-radio>
            </t-radio-group>
          </div>
        </div>

        <t-divider />

        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="view-module" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">HDR 高亮提醒</div>
            <div class="settings-item-desc">
              彩色全屏提醒为白色文字时启用 P3 HDR 亮度高亮（显示器支持时）。
            </div>
          </div>
          <div class="settings-item-action">
            <t-switch v-model="hdrHighlight" size="large" />
          </div>
        </div>
      </t-card>

      <t-card title="界面与字号" theme="poster2">
        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="layout" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">界面密度</div>
            <div class="settings-item-desc">控制播放器内元素的间距和紧凑程度。</div>
          </div>
          <div class="settings-item-action">
            <t-radio-group v-model="uiDensity">
              <t-radio value="comfortable">舒适</t-radio>
              <t-radio value="moderate">适中</t-radio>
              <t-radio value="compact">紧凑</t-radio>
            </t-radio-group>
          </div>
        </div>

        <t-divider />

        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="time" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">大时钟字号缩放</div>
            <div class="settings-item-desc">调整大时钟模式下时钟数字的字号倍率，范围 50%-200%。</div>
            <div class="settings-item-extra">
              <t-slider
                v-model="largeClockScale"
                :min="0.5"
                :max="2"
                :step="0.05"
                :show-tooltip="false"
              />
            </div>
          </div>
          <div class="settings-item-action" style="width: 120px">
            <t-input-number
              v-model="largeClockScale"
              :min="0.5"
              :max="2"
              :step="0.05"
              :decimal-places="2"
              suffix="倍"
            />
          </div>
        </div>

        <t-divider />

        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="font-size" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">本场信息大字体</div>
            <div class="settings-item-desc">开启后当前考试信息卡片使用更大字号显示。</div>
          </div>
          <div class="settings-item-action">
            <t-switch v-model="examInfoLargeFont" size="large" />
          </div>
        </div>

        <t-divider />

        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="file-paste" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">试卷材料字号缩放</div>
            <div class="settings-item-desc">调整试卷/答题卡页数张数区域的字号倍率，范围 80%-200%。</div>
            <div class="settings-item-extra">
              <t-slider
                v-model="materialFontScale"
                :min="0.8"
                :max="2"
                :step="0.05"
                :show-tooltip="false"
              />
            </div>
          </div>
          <div class="settings-item-action" style="width: 120px">
            <t-input-number
              v-model="materialFontScale"
              :min="0.8"
              :max="2"
              :step="0.05"
              :decimal-places="2"
              suffix="倍"
            />
          </div>
        </div>

        <t-divider />

        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="font-size-1" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">辅助字号缩放</div>
            <div class="settings-item-desc">调整时钟旁提示文字等辅助信息的字号倍率，范围 80%-200%。</div>
            <div class="settings-item-extra">
              <t-slider
                v-model="auxiliaryFontScale"
                :min="0.8"
                :max="2"
                :step="0.05"
                :show-tooltip="false"
              />
            </div>
          </div>
          <div class="settings-item-action" style="width: 120px">
            <t-input-number
              v-model="auxiliaryFontScale"
              :min="0.8"
              :max="2"
              :step="0.05"
              :decimal-places="2"
              suffix="倍"
            />
          </div>
        </div>
      </t-card>

      <t-card title="倒计时与提醒" theme="poster2">
        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="time" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">考前倒计时分钟数</div>
            <div class="settings-item-desc">考试开始前多少分钟进入"即将开始"状态并显示倒计时。</div>
          </div>
          <div class="settings-item-action" style="width: 140px">
            <t-input-number
              v-model="preCountdownMinutes"
              :min="1"
              :max="60"
              :step="1"
              suffix="分钟"
            />
          </div>
        </div>
      </t-card>

      <t-card title="播放器主题" theme="poster2">
        <div class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="palette" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">播放器布局</div>
            <div class="settings-item-desc">经典：左右两列布局；增强：上中下布局。</div>
          </div>
          <div class="settings-item-action">
            <t-radio-group v-model="playerTheme">
              <t-radio value="classic">经典</t-radio>
              <t-radio value="enhanced">增强</t-radio>
            </t-radio-group>
          </div>
        </div>

        <t-divider v-if="playerTheme === 'classic'" />

        <div v-if="playerTheme === 'classic'" class="settings-item">
          <div class="settings-item-icon">
            <TIcon name="view-list" size="22px" />
          </div>
          <div class="settings-item-main">
            <div class="settings-item-title">显示页数统计</div>
            <div class="settings-item-desc">经典主题下显示试卷/答题卡的页数和张数统计控件。</div>
          </div>
          <div class="settings-item-action">
            <t-switch v-model="classicShowMaterial" size="large" />
          </div>
        </div>
      </t-card>
    </t-space>
  </div>
</template>

<script setup lang="ts">
import { Icon as TIcon } from 'tdesign-icons-vue-next'
import { useSettingsGroup, useSettingRef } from '@renderer/composables/useSetting'
import { clampUiScale } from '@renderer/composables/usePlaybackSettings'

const settings = useSettingsGroup('player')

const sanitizeRoom = (value: unknown) => {
  if (value == null) return '01'
  const text = String(value).trim().slice(0, 8)
  return text || '01'
}

const defaultRoom = settings.ref<string>('defaultRoom', '01', {
  mapIn: sanitizeRoom,
  mapOut: sanitizeRoom
})

const defaultScale = settings.ref<number>('uiScale', 1.05, {
  mapIn: clampUiScale,
  mapOut: clampUiScale
})

const largeClockEnabled = settings.ref<boolean>('largeClockEnabled', true, {
  mapIn: (value) => Boolean(value),
  mapOut: (value) => Boolean(value)
})

const hdrHighlight = settings.ref<boolean>('hdrHighlight', false, {
  mapIn: (value) => Boolean(value),
  mapOut: (value) => Boolean(value)
})

const playButtonMode = settings.ref<'direct' | 'select'>('playButtonMode', 'direct', {
  mapIn: (value) => (value === 'select' ? 'select' : 'direct'),
  mapOut: (value) => value
})

const scaleMarks = {
  0.5: '50%',
  1: '100%',
  1.5: '150%',
  2: '200%'
}

const normalizeRoom = () => {
  defaultRoom.value = sanitizeRoom(defaultRoom.value)
}

// 界面与字号设置
const uiDensity = settings.ref<'comfortable' | 'moderate' | 'compact'>('uiDensity', 'comfortable', {
  mapIn: (value) => (value === 'moderate' || value === 'compact' ? value : 'comfortable'),
  mapOut: (value) => value
})

const largeClockScale = settings.ref<number>('largeClockScale', 1.0, {
  mapIn: (value) => Number(value) || 1.0,
  mapOut: (value) => value
})

const examInfoLargeFont = settings.ref<boolean>('examInfoLargeFont', true, {
  mapIn: (value) => Boolean(value),
  mapOut: (value) => Boolean(value)
})

const materialFontScale = settings.ref<number>('materialFontScale', 1.4, {
  mapIn: (value) => Number(value) || 1.4,
  mapOut: (value) => value
})

const auxiliaryFontScale = settings.ref<number>('auxiliaryFontScale', 1.3, {
  mapIn: (value) => Number(value) || 1.3,
  mapOut: (value) => value
})

// 倒计时与提醒
const preCountdownMinutes = settings.ref<number>('preCountdownMinutes', 15, {
  mapIn: (value) => Number(value) || 15,
  mapOut: (value) => value
})

// 播放器主题（原在外观设置页，现合并到播放器设置）
const playerTheme = useSettingRef<'classic' | 'enhanced'>('appearance.playerTheme', 'enhanced')
const classicShowMaterial = useSettingRef<boolean>('appearance.classicShowMaterial', false)
</script>

<style scoped>
.settings-item-extra {
  margin-top: 8px;
}
</style>
