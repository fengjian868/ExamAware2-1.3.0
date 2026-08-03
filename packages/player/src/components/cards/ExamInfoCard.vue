<template>
  <InfoCardWithIcon title="当前考试信息" :show-icon="false" :custom-class="customClass">
    <InfoItem label="当前科目" :value="ctx.currentExamName.value" />
    <InfoItem label="考试时间" :value="examTimeWithTotal" />
    <div class="info-row">
      <span class="info-label">考试状态:</span>
      <span class="info-value" :class="statusColorClass">{{ examStatusText }}</span>
    </div>

    <!-- 试卷信息：共 Y 张 共 X 页（张数在前，页数在后） -->
    <div class="material-row">
      <span class="material-label">试卷:</span>
      <span class="material-text">共</span>
      <div
        class="number-control"
        :class="{ 'controls-hidden': !showControls.paperSheets, disabled: !canEdit }"
      >
        <button
          v-show="showControls.paperSheets"
          class="num-btn"
          :class="{ 'num-btn-disabled': !canEdit || paperSheets >= MAX_SHEETS }"
          :disabled="!canEdit"
          @click="decrease('paperSheets')"
        >
          -
        </button>
        <input
          class="num-input"
          :class="{ 'num-input-disabled': !canEdit }"
          type="number"
          min="0"
          :max="MAX_SHEETS"
          :value="paperSheets"
          :disabled="!canEdit"
          @change="setValue('paperSheets', $event)"
          @focus="handleInputFocus('paperSheets')"
        />
        <button
          v-show="showControls.paperSheets"
          class="num-btn"
          :class="{ 'num-btn-disabled': !canEdit || paperSheets >= MAX_SHEETS }"
          :disabled="!canEdit"
          @click="increase('paperSheets')"
        >
          +
        </button>
      </div>
      <span class="material-text">张</span>
      <span class="material-text">共</span>
      <div
        class="number-control"
        :class="{ 'controls-hidden': !showControls.paperPages, disabled: !canEdit }"
      >
        <button
          v-show="showControls.paperPages"
          class="num-btn"
          :class="{ 'num-btn-disabled': !canEdit || paperPages >= MAX_PAGES }"
          :disabled="!canEdit"
          @click="decrease('paperPages')"
        >
          -
        </button>
        <input
          class="num-input"
          :class="{ 'num-input-disabled': !canEdit }"
          type="number"
          min="0"
          :max="MAX_PAGES"
          :value="paperPages"
          :disabled="!canEdit"
          @change="setValue('paperPages', $event)"
          @focus="handleInputFocus('paperPages')"
        />
        <button
          v-show="showControls.paperPages"
          class="num-btn"
          :class="{ 'num-btn-disabled': !canEdit || paperPages >= MAX_PAGES }"
          :disabled="!canEdit"
          @click="increase('paperPages')"
        >
          +
        </button>
      </div>
      <span class="material-text">页</span>
    </div>

    <!-- 答题卡信息：共 Y 张 共 X 页 -->
    <div class="material-row">
      <span class="material-label">答题卡:</span>
      <span class="material-text">共</span>
      <div
        class="number-control"
        :class="{ 'controls-hidden': !showControls.answerSheets, disabled: !canEdit }"
      >
        <button
          v-show="showControls.answerSheets"
          class="num-btn"
          :class="{ 'num-btn-disabled': !canEdit || answerSheets >= MAX_SHEETS }"
          :disabled="!canEdit"
          @click="decrease('answerSheets')"
        >
          -
        </button>
        <input
          class="num-input"
          :class="{ 'num-input-disabled': !canEdit }"
          type="number"
          min="0"
          :max="MAX_SHEETS"
          :value="answerSheets"
          :disabled="!canEdit"
          @change="setValue('answerSheets', $event)"
          @focus="handleInputFocus('answerSheets')"
        />
        <button
          v-show="showControls.answerSheets"
          class="num-btn"
          :class="{ 'num-btn-disabled': !canEdit || answerSheets >= MAX_SHEETS }"
          :disabled="!canEdit"
          @click="increase('answerSheets')"
        >
          +
        </button>
      </div>
      <span class="material-text">张</span>
      <span class="material-text">共</span>
      <div
        class="number-control"
        :class="{ 'controls-hidden': !showControls.answerPages, disabled: !canEdit }"
      >
        <button
          v-show="showControls.answerPages"
          class="num-btn"
          :class="{ 'num-btn-disabled': !canEdit || answerPages >= MAX_PAGES }"
          :disabled="!canEdit"
          @click="decrease('answerPages')"
        >
          -
        </button>
        <input
          class="num-input"
          :class="{ 'num-input-disabled': !canEdit }"
          type="number"
          min="0"
          :max="MAX_PAGES"
          :value="answerPages"
          :disabled="!canEdit"
          @change="setValue('answerPages', $event)"
          @focus="handleInputFocus('answerPages')"
        />
        <button
          v-show="showControls.answerPages"
          class="num-btn"
          :class="{ 'num-btn-disabled': !canEdit || answerPages >= MAX_PAGES }"
          :disabled="!canEdit"
          @click="increase('answerPages')"
        >
          +
        </button>
      </div>
      <span class="material-text">页</span>
    </div>
  </InfoCardWithIcon>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { parseDateTime } from '@dsz-examaware/core';
import InfoCardWithIcon from '../InfoCardWithIcon.vue';
import InfoItem from '../InfoItem.vue';

export interface ExamPlayerCtx {
  currentExam: any;
  currentExamName: any;
  currentExamTimeRange: any;
  examStatus?: any;
  examInfoLargeFont?: { value: boolean };
  materialFontScale?: { value: number };
  preCountdownMinutes?: any;
  sortedExamInfos?: any;
  pagesPerSheet?: { value: number };
  paperPages?: { value: number };
  paperSheets?: { value: number };
  answerPages?: { value: number };
  answerSheets?: { value: number };
  setMaterial?: (payload: {
    paperPages?: number;
    paperSheets?: number;
    answerPages?: number;
    answerSheets?: number;
  }) => void;
}

const ctx = inject<ExamPlayerCtx>('ExamPlayerCtx')!;

const MAX_PAGES = 20;
const MAX_SHEETS = 10;
const pagesPerSheet = computed(() => {
  const n = Number(ctx.pagesPerSheet?.value);
  return Number.isFinite(n) && n >= 1 ? n : 4;
});

const customClass = computed(() =>
  ['exam-info-card', ctx.examInfoLargeFont?.value ? 'exam-info-large' : '']
    .filter(Boolean)
    .join(' ')
);

// 考试时间（带总分钟数）
const examTimeWithTotal = computed(() => {
  const exam = ctx.currentExam?.value;
  if (!exam) return ctx.currentExamTimeRange?.value || '暂无安排';
  const start = parseDateTime(exam.start);
  const end = parseDateTime(exam.end);
  const totalMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  const startStr = start.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const endStr = end.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return `${startStr} - ${endStr}（共${totalMinutes}分钟）`;
});

// 是否所有考试都已结束
const allExamsEnded = computed(() => {
  const exams = ctx.sortedExamInfos?.value;
  if (!exams || exams.length === 0) return false;
  const now = Date.now();
  return exams.every((exam: any) => parseDateTime(exam.end).getTime() <= now);
});

// 是否在考前倒计时窗口内（preStart）
const isPreStart = computed(() => {
  const status = ctx.examStatus?.value?.status;
  const timeRemaining = ctx.examStatus?.value?.timeRemaining;
  const preMs = (Number(ctx.preCountdownMinutes?.value ?? 15) || 15) * 60 * 1000;
  return status === 'pending' && typeof timeRemaining === 'number' && timeRemaining <= preMs;
});

// 是否可以编辑页数（只在考前15分钟和考试时才能加减）
const canEdit = computed(() => {
  const status = ctx.examStatus?.value?.status;
  return isPreStart.value || status === 'inProgress';
});

// 考试状态文本
const examStatusText = computed(() => {
  const status = ctx.examStatus?.value?.status;
  if (status === 'completed') return '已结束';
  if (status === 'inProgress') {
    const timeRemaining = ctx.examStatus?.value?.timeRemaining;
    const alertMs = (Number(ctx.currentExam?.value?.alertTime) || 0) * 60 * 1000;
    if (alertMs > 0 && typeof timeRemaining === 'number' && timeRemaining <= alertMs) {
      return '即将结束';
    }
    return '进行中';
  }
  if (status === 'pending') {
    if (isPreStart.value) return '即将开始';
    return '未开始';
  }
  return '暂无安排';
});

// 考试状态颜色
const statusColorClass = computed(() => {
  const status = ctx.examStatus?.value?.status;
  if (status === 'completed') return 'status-finished';
  if (status === 'inProgress') {
    const timeRemaining = ctx.examStatus?.value?.timeRemaining;
    const alertMs = (Number(ctx.currentExam?.value?.alertTime) || 0) * 60 * 1000;
    if (alertMs > 0 && typeof timeRemaining === 'number' && timeRemaining <= alertMs) {
      return 'status-preend';
    }
    return 'status-ongoing';
  }
  if (status === 'pending') {
    return isPreStart.value ? 'status-prestart' : 'status-pending';
  }
  return '';
});

// ====== 页数统计逻辑 ======
// 从 ExamPlayerCtx 读取页数/张数状态，通过 ctx.setMaterial 修改
const paperPages = computed(() => ctx.paperPages?.value ?? 0);
const paperSheets = computed(() => ctx.paperSheets?.value ?? 0);
const answerPages = computed(() => ctx.answerPages?.value ?? 0);
const answerSheets = computed(() => ctx.answerSheets?.value ?? 0);

const setMaterial = (payload: {
  paperPages?: number;
  paperSheets?: number;
  answerPages?: number;
  answerSheets?: number;
}) => {
  ctx.setMaterial?.(payload);
};

// 加减按钮显隐控制
const showControls = ref({
  paperPages: true,
  paperSheets: true,
  answerPages: true,
  answerSheets: true
});

const hideTimers: Record<string, ReturnType<typeof setTimeout> | null> = {
  paperPages: null,
  paperSheets: null,
  answerPages: null,
  answerSheets: null
};

const clearHideTimer = (field: string) => {
  if (hideTimers[field]) {
    clearTimeout(hideTimers[field]!);
    hideTimers[field] = null;
  }
};

// 只在考试进行中且值>0时才自动隐藏
const scheduleHide = (field: 'paperPages' | 'paperSheets' | 'answerPages' | 'answerSheets') => {
  clearHideTimer(field);
  // 考试未开始时不隐藏
  if (!canEdit.value || ctx.examStatus?.value?.status !== 'inProgress') return;
  hideTimers[field] = setTimeout(() => {
    const val =
      field === 'paperPages'
        ? paperPages.value
        : field === 'paperSheets'
          ? paperSheets.value
          : field === 'answerPages'
            ? answerPages.value
            : answerSheets.value;
    // 考试进行中且值大于0时才隐藏
    if (val > 0) {
      showControls.value[field] = false;
    }
  }, 5000);
};

const showControlsAndScheduleHide = (
  field: 'paperPages' | 'paperSheets' | 'answerPages' | 'answerSheets'
) => {
  showControls.value[field] = true;
  scheduleHide(field);
};

// 监听状态变化：只在状态真正切换时执行，避免每秒倒计时触发重复清除定时器导致加减号闪现后消失
watch(
  () => ctx.examStatus?.value?.status,
  (status, prevStatus) => {
    if (status === 'pending') {
      // 未开始（含即将开始）：始终显示加减号
      showControls.value = {
        paperPages: true,
        paperSheets: true,
        answerPages: true,
        answerSheets: true
      };
      // 清除所有隐藏定时器
      Object.keys(hideTimers).forEach(clearHideTimer);
    } else if (status === 'inProgress' && prevStatus !== 'inProgress') {
      // 仅在真正进入考试时执行一次：值为0时显示（待用户输入），值>0时立即隐藏
      // 之后用户点击 +/- 或聚焦输入框时会短暂显示，5秒后再自动隐藏
      (['paperPages', 'paperSheets', 'answerPages', 'answerSheets'] as const).forEach((field) => {
        const val =
          field === 'paperPages'
            ? paperPages.value
            : field === 'paperSheets'
              ? paperSheets.value
              : field === 'answerPages'
                ? answerPages.value
                : answerSheets.value;
        if (val === 0) {
          showControls.value[field] = true;
          clearHideTimer(field);
        } else {
          showControls.value[field] = false;
          clearHideTimer(field);
        }
      });
    }
  },
  { immediate: true }
);

// 额外监听值变化：确保考试进行中值>0时一定调度隐藏（修复加减号不自动消失）
watch(
  [paperPages, paperSheets, answerPages, answerSheets, () => ctx.examStatus?.value?.status],
  () => {
    const status = ctx.examStatus?.value?.status;
    if (status !== 'inProgress') return;
    (['paperPages', 'paperSheets', 'answerPages', 'answerSheets'] as const).forEach((field) => {
      const val =
        field === 'paperPages'
          ? paperPages.value
          : field === 'paperSheets'
            ? paperSheets.value
            : field === 'answerPages'
              ? answerPages.value
              : answerSheets.value;
      // 值>0且控件可见且没有等待中的定时器时，调度隐藏
      if (val > 0 && showControls.value[field] && !hideTimers[field]) {
        scheduleHide(field);
      }
    });
  }
);

const increase = (field: 'paperPages' | 'paperSheets' | 'answerPages' | 'answerSheets') => {
  if (!canEdit.value) return;
  switch (field) {
    case 'paperPages':
      if (paperPages.value < MAX_PAGES) {
        setMaterial({ paperPages: paperPages.value + 1 });
      }
      break;
    case 'paperSheets':
      if (paperSheets.value < MAX_SHEETS) {
        setMaterial({ paperSheets: paperSheets.value + 1 });
      }
      break;
    case 'answerPages':
      if (answerPages.value < MAX_PAGES) {
        setMaterial({ answerPages: answerPages.value + 1 });
      }
      break;
    case 'answerSheets':
      if (answerSheets.value < MAX_SHEETS) {
        setMaterial({ answerSheets: answerSheets.value + 1 });
      }
      break;
  }
  showControlsAndScheduleHide(field);
  // 如果改的是张数，也要刷新页数的显隐
  if (field === 'paperSheets') showControlsAndScheduleHide('paperPages');
  if (field === 'answerSheets') showControlsAndScheduleHide('answerPages');
};

const decrease = (field: 'paperPages' | 'paperSheets' | 'answerPages' | 'answerSheets') => {
  if (!canEdit.value) return;
  switch (field) {
    case 'paperPages':
      if (paperPages.value > 0) {
        setMaterial({ paperPages: paperPages.value - 1 });
      }
      break;
    case 'paperSheets':
      if (paperSheets.value > 0) {
        setMaterial({ paperSheets: paperSheets.value - 1 });
      }
      break;
    case 'answerPages':
      if (answerPages.value > 0) {
        setMaterial({ answerPages: answerPages.value - 1 });
      }
      break;
    case 'answerSheets':
      if (answerSheets.value > 0) {
        setMaterial({ answerSheets: answerSheets.value - 1 });
      }
      break;
  }
  showControlsAndScheduleHide(field);
  if (field === 'paperSheets') showControlsAndScheduleHide('paperPages');
  if (field === 'answerSheets') showControlsAndScheduleHide('answerPages');
};

const setValue = (
  field: 'paperPages' | 'paperSheets' | 'answerPages' | 'answerSheets',
  event: Event
) => {
  if (!canEdit.value) return;
  const target = event.target as HTMLInputElement;
  let val = Math.max(0, Math.floor(Number(target.value)) || 0);
  switch (field) {
    case 'paperPages':
      setMaterial({ paperPages: Math.min(val, MAX_PAGES) });
      break;
    case 'paperSheets':
      setMaterial({ paperSheets: Math.min(val, MAX_SHEETS) });
      break;
    case 'answerPages':
      setMaterial({ answerPages: Math.min(val, MAX_PAGES) });
      break;
    case 'answerSheets':
      setMaterial({ answerSheets: Math.min(val, MAX_SHEETS) });
      break;
  }
  showControlsAndScheduleHide(field);
  if (field === 'paperSheets') showControlsAndScheduleHide('paperPages');
  if (field === 'answerSheets') showControlsAndScheduleHide('answerPages');
};

const handleInputFocus = (field: 'paperPages' | 'paperSheets' | 'answerPages' | 'answerSheets') => {
  showControlsAndScheduleHide(field);
};

// 考试结束后自动重置
watch(
  () => ctx.examStatus?.value?.status,
  (status, prevStatus) => {
    if (status === 'completed' && prevStatus === 'inProgress') {
      setMaterial({ paperPages: 0, paperSheets: 0, answerPages: 0, answerSheets: 0 });
      showControls.value = {
        paperPages: true,
        paperSheets: true,
        answerPages: true,
        answerSheets: true
      };
    }
  }
);
</script>

<style scoped>
.exam-info-card.exam-info-large :deep(.card-body) {
  grid-template-columns: 1fr;
  gap: calc(var(--ui-scale, 1) * 1.1rem) calc(var(--ui-scale, 1) * 1rem);
}

.exam-info-card.exam-info-large :deep(.card-title) {
  font-size: calc(var(--ui-scale, 1) * 1.6rem);
}

.exam-info-card.exam-info-large :deep(.info-label),
.exam-info-card.exam-info-large :deep(.info-value) {
  font-size: calc(var(--ui-scale, 1) * 1.8rem);
  line-height: 1.15;
}

/* 考试状态颜色 */
.info-row {
  display: flex;
  align-items: center;
  gap: 0;
}

.info-label {
  color: rgba(255, 255, 255, 0.75);
  font-size: calc(var(--ui-scale, 1) * 1.4rem);
  font-weight: 500;
  min-width: calc(var(--ui-scale, 1) * 6rem);
}

.info-value {
  color: #fff;
  font-size: calc(var(--ui-scale, 1) * 1.4rem);
  font-weight: 600;
}

.status-pending {
  color: #ff9800;
}

.status-prestart {
  color: #ffb347;
}

.status-ongoing {
  color: #45a452;
}

.status-preend {
  color: #ff6b6b;
}

.status-finished {
  color: #ff3b30;
}

/* 材料信息行 */
.material-row {
  display: flex;
  align-items: center;
  gap: calc(var(--ui-scale, 1) * 0.5rem);
  flex-wrap: wrap;
}

.material-label {
  color: rgba(255, 255, 255, 0.75);
  font-size: calc(var(--ui-scale, 1) * var(--material-font-scale, 1) * 1.4rem);
  font-weight: 500;
  min-width: calc(var(--ui-scale, 1) * var(--material-font-scale, 1) * 5rem);
}

.material-text {
  color: rgba(255, 255, 255, 0.75);
  font-size: calc(var(--ui-scale, 1) * var(--material-font-scale, 1) * 1.3rem);
}

/* 数字加减控制器 */
.number-control {
  display: flex;
  align-items: center;
  gap: calc(var(--ui-scale, 1) * 0.25rem);
  background: rgba(255, 255, 255, 0.08);
  border-radius: calc(var(--ui-scale, 1) * 6px);
  padding: calc(var(--ui-scale, 1) * 0.2rem) calc(var(--ui-scale, 1) * 0.4rem);
  transition:
    background 0.3s ease,
    padding 0.3s ease;
}

.number-control.controls-hidden {
  background: transparent;
  padding: calc(var(--ui-scale, 1) * 0.2rem) 0;
}

.number-control.disabled {
  opacity: 0.5;
}

.num-btn {
  width: calc(var(--ui-scale, 1) * var(--material-font-scale, 1) * 1.6rem);
  height: calc(var(--ui-scale, 1) * var(--material-font-scale, 1) * 1.6rem);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  border: none;
  border-radius: calc(var(--ui-scale, 1) * 4px);
  color: #fff;
  font-size: calc(var(--ui-scale, 1) * var(--material-font-scale, 1) * 1.1rem);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
  line-height: 1;
  padding: 0;
}

.num-btn:hover:not(.num-btn-disabled) {
  background: rgba(255, 255, 255, 0.22);
}

.num-btn:active:not(.num-btn-disabled) {
  background: rgba(255, 255, 255, 0.08);
}

/* 暗灰色：不可点击或达到上限 */
.num-btn-disabled {
  background: rgba(255, 255, 255, 0.05) !important;
  color: rgba(255, 255, 255, 0.3) !important;
  cursor: not-allowed;
}

.num-value,
.num-input {
  color: #fff;
  font-size: calc(var(--ui-scale, 1) * var(--material-font-scale, 1) * 2rem);
  font-weight: 700;
  min-width: calc(var(--ui-scale, 1) * var(--material-font-scale, 1) * 2rem);
  text-align: center;
  font-family: 'TCloudNumber', 'MiSans', monospace;
}

.num-input {
  background: transparent;
  border: none;
  outline: none;
  width: calc(var(--ui-scale, 1) * var(--material-font-scale, 1) * 3rem);
  padding: 0;
  -moz-appearance: textfield;
}

.num-input::-webkit-outer-spin-button,
.num-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.num-input-disabled {
  color: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
}
</style>
