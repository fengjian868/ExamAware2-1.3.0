<template>
  <BaseCard custom-class="current-exam-info-card">
    <!-- current 模式：日期切换栏 -->
    <div v-if="displayMode === 'current' && groupedExamInfos.length > 1" class="day-switcher">
      <button class="day-switch-btn" :disabled="currentDayIndex === 0" @click="prevDay">‹</button>
      <span class="day-switch-label">
        {{ currentDayIndex + 1 }} / {{ groupedExamInfos.length }}
      </span>
      <button
        class="day-switch-btn"
        :disabled="currentDayIndex >= groupedExamInfos.length - 1"
        @click="nextDay"
      >
        ›
      </button>
    </div>

    <!-- 考试列表 -->
    <div v-if="visibleDayGroups.length > 0" :class="daysContainerClass">
      <div
        v-for="day in visibleDayGroups"
        :key="day.date"
        class="day-column"
        :class="{ 'is-current-day': day.isCurrentDay, 'is-ended': day.isEnded }"
      >
        <div class="day-title">{{ day.dateLabel }}</div>
        <div class="day-table-header">
          <div class="day-header-cell" style="flex: 0.6">时段</div>
          <div class="day-header-cell" style="flex: 1.6">科目</div>
          <div class="day-header-cell" style="flex: 1">开始</div>
          <div class="day-header-cell" style="flex: 1">结束</div>
          <div class="day-header-cell" style="flex: 0.8; text-align: right">状态</div>
        </div>
        <div class="day-exam-list">
          <ExamInfoItem
            v-for="exam in day.exams"
            :key="exam.name"
            :period="exam.period"
            :subject="exam.name"
            :start-time="exam.startTime"
            :end-time="exam.endTime"
            :status="exam.statusText"
            :is-current="exam.index === currentExamIndex"
          />
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <span class="empty-text">暂无考试安排</span>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { parseDateTime } from '@dsz-examaware/core';
import BaseCard from './BaseCard.vue';
import ExamInfoItem from './ExamInfoItem.vue';
import type { FormattedExamInfo } from '../utils/dataProcessor';
import type { ExamInfoDisplayMode } from '../types/toolbar';

export type { ExamInfoDisplayMode };

export interface CurrentExamInfoProps {
  examInfos?: FormattedExamInfo[];
  currentExamIndex?: number;
  displayMode?: ExamInfoDisplayMode;
}

const props = withDefaults(defineProps<CurrentExamInfoProps>(), {
  examInfos: () => [],
  currentExamIndex: 0,
  displayMode: 'scroll'
});

interface DayGroup {
  date: string;
  dateLabel: string;
  dayIndex: number;
  exams: FormattedExamInfo[];
  isCurrentDay: boolean;
  isEnded: boolean;
}

const groupedExamInfos = computed<DayGroup[]>(() => {
  const groups = new Map<string, FormattedExamInfo[]>();
  props.examInfos.forEach((exam) => {
    const list = groups.get(exam.date) || [];
    list.push(exam);
    groups.set(exam.date, list);
  });

  const currentExam = props.examInfos[props.currentExamIndex];
  const currentDate = currentExam?.date;

  let dayIndex = 0;
  const items: DayGroup[] = Array.from(groups.entries()).map(([date, exams]) => {
    dayIndex++;
    const firstExam = exams[0];
    const startDate = parseDateTime(firstExam.rawData.start);
    const weekday = startDate.toLocaleDateString('zh-CN', {
      weekday: 'short'
    });
    const isCurrentDay = date === currentDate;
    const isEnded = exams.every((e) => e.statusText === '已结束');

    return {
      date,
      dateLabel: `第${dayIndex}天 ${date} ${weekday}`,
      dayIndex,
      exams,
      isCurrentDay,
      isEnded
    };
  });

  // 按日期原顺序排列，不移动当天到最前
  return items.sort((a, b) => a.date.localeCompare(b.date));
});

// === current 模式：日期切换状态 ===
const currentDayIndex = ref(0);

// 初始化定位到当前考试所在日期
watch(
  () => groupedExamInfos.value,
  (groups) => {
    const idx = groups.findIndex((g) => g.isCurrentDay);
    if (idx >= 0) {
      currentDayIndex.value = idx;
    } else if (currentDayIndex.value >= groups.length) {
      currentDayIndex.value = Math.max(0, groups.length - 1);
    }
  },
  { immediate: true }
);

const prevDay = () => {
  if (currentDayIndex.value > 0) currentDayIndex.value--;
};
const nextDay = () => {
  if (currentDayIndex.value < groupedExamInfos.value.length - 1) currentDayIndex.value++;
};

// === 根据 displayMode 决定可见的日期组和容器 class ===
const safeDisplayMode = computed<ExamInfoDisplayMode>(() => {
  const m = props.displayMode;
  return m === 'scroll' || m === 'stack' || m === 'current' ? m : 'stack';
});

const visibleDayGroups = computed<DayGroup[]>(() => {
  if (safeDisplayMode.value === 'current') {
    const idx = Math.min(currentDayIndex.value, groupedExamInfos.value.length - 1);
    const group = groupedExamInfos.value[idx];
    return group ? [group] : [];
  }
  return groupedExamInfos.value;
});

const daysContainerClass = computed(() => {
  return safeDisplayMode.value === 'stack' ? 'days-stack' : 'days-grid';
});
</script>

<style scoped>
.current-exam-info-card :deep(.card-content) {
  padding: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 1.2rem)
    calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.8rem);
}

/* === 日期切换栏（current 模式） === */
.day-switcher {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--ui-scale, 1) * 0.75rem);
  padding: calc(var(--ui-scale, 1) * 0.3rem) 0;
  margin-bottom: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.5rem);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.day-switch-btn {
  width: calc(var(--ui-scale, 1) * 2rem);
  height: calc(var(--ui-scale, 1) * 2rem);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  font-size: calc(var(--ui-scale, 1) * 1.2rem);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.day-switch-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.18);
}

.day-switch-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.day-switch-label {
  color: rgba(255, 255, 255, 0.8);
  font-size: calc(var(--ui-scale, 1) * 1.1rem);
  font-weight: 600;
  font-family: 'TCloudNumber', 'MiSans', monospace;
  min-width: calc(var(--ui-scale, 1) * 3.5rem);
  text-align: center;
}

/* === scroll 模式：横向滚动 === */
.days-grid {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.5rem);
  overflow-x: auto;
}

.days-grid::-webkit-scrollbar {
  height: 4px;
}

.days-grid::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 2px;
}

.days-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.days-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* scroll 模式下 day-column 不收缩，设最小宽度 */
.days-grid .day-column {
  flex: 0 0 auto;
  min-width: calc(var(--ui-scale, 1) * 8rem);
}

/* === stack 模式：纵向堆叠 === */
.days-stack {
  display: flex;
  flex-direction: column;
  gap: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.5rem);
}

.days-stack .day-column {
  width: 100%;
}

/* === 日期列通用样式 === */
.day-column {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: calc(var(--ui-scale, 1) * 8px);
  padding: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.4rem);
  transition: opacity 0.3s ease;
}

.day-column.is-current-day {
  border-color: rgba(77, 171, 247, 0.45);
  background: rgba(77, 171, 247, 0.06);
}

.day-column.is-current-day .day-title {
  color: #4dabf7;
  border-color: rgba(77, 171, 247, 0.35);
}

.day-column.is-ended {
  opacity: 0.5;
}

.day-title {
  color: rgba(255, 255, 255, 0.85);
  font-size: calc(var(--ui-scale, 1) * 1.15rem);
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-bottom: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.4rem);
  margin-bottom: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.4rem);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-family: 'TCloudNumber', 'MiSans', monospace;
}

.day-table-header {
  display: flex;
  align-items: center;
  gap: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.25rem);
  padding: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.2rem) 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 0.2rem);
  flex-shrink: 0;
}

.day-header-cell {
  color: rgba(255, 255, 255, 0.55);
  font-size: calc(var(--ui-scale, 1) * 0.95rem);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.day-exam-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 16rem);
}

.day-exam-list::-webkit-scrollbar {
  width: calc(var(--ui-scale, 1) * 0.25rem);
}

.day-exam-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: calc(var(--ui-scale, 1) * 4px);
}

.day-exam-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: calc(var(--ui-scale, 1) * 4px);
}

.day-exam-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: calc(var(--ui-scale, 1) * var(--density-scale, 1) * 2rem) 0;
}

.empty-text {
  color: rgba(255, 255, 255, 0.5);
  font-size: calc(var(--ui-scale, 1) * 1.2rem);
  font-weight: 400;
}
</style>
