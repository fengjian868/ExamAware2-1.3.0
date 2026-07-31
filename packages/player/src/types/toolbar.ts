export type UIDensity = 'comfortable' | 'cozy' | 'compact';

export interface DensityOption {
  value: UIDensity;
  label: string;
  description: string;
}

export const defaultDensityOptions: DensityOption[] = [
  { value: 'comfortable', label: '舒适', description: '标准间距与字号' },
  { value: 'cozy', label: '适中', description: '减少约15%的留白' },
  { value: 'compact', label: '紧凑', description: '减少约30%的留白' }
];

/** 考试信息显示模式：scroll 横向滚动 / stack 纵向堆叠 / current 仅当前天+切换 */
export type ExamInfoDisplayMode = 'scroll' | 'stack' | 'current';

export interface ExamInfoDisplayModeOption {
  value: ExamInfoDisplayMode;
  label: string;
  description: string;
}

export const defaultExamInfoDisplayModeOptions: ExamInfoDisplayModeOption[] = [
  { value: 'scroll', label: '横向滚动', description: '多天并排，可左右滚动' },
  { value: 'stack', label: '纵向堆叠', description: '多天上下排列（默认）' },
  { value: 'current', label: '仅当前天', description: '只显示一天，可切换日期' }
];

export type DevReminderPreset = 'start' | 'warning' | 'end';

export interface DevReminderPayload {
  title: string;
  themeBaseColor: string;
  forceWhiteText?: boolean;
}
