<template>
  <CurrentExamInfo
    :exam-infos="ctx.displayFormattedExamInfos.value"
    :current-exam-index="ctx.currentExamIndex?.value ?? 0"
    :display-mode="ctx.examInfoDisplayMode?.value ?? 'stack'"
  />
</template>

<script setup lang="ts">
import { inject } from 'vue';
import CurrentExamInfo from '../CurrentExamInfo.vue';
import type { ExamInfoDisplayMode } from '../../types/toolbar';

export interface ExamPlayerCtx {
  displayFormattedExamInfos: any;
  currentExamIndex?: any;
  examInfoDisplayMode?: { value: ExamInfoDisplayMode };
}
const ctx = inject<ExamPlayerCtx>('ExamPlayerCtx')!;
</script>
