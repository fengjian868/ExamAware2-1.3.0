/**
 * 考试材料信息
 */
export interface ExamMaterial {
  /** 材料名称，如"试卷"、"答题卡"、"草稿纸"等 */
  name: string;
  /** 材料数量 */
  quantity: number;
  /** 材料单位，如"张"、"份"、"本"等 */
  unit: string;
}

/**
 * 考试信息
 */
export interface ExamInfo {
  /** 考试名称 */
  name: string;
  /** 考试开始时间 */
  start: string;
  /** 考试结束时间 */
  end: string;
  /** 考试结束前几分钟提醒 */
  alertTime: number;
  /** 考试材料清单 */
  materials?: ExamMaterial[];
}

/**
 * 集控操作预设单步
 * 复用现有控制命令 kind，线性执行，步骤间可等待
 */
export interface ControlPresetStep {
  /** 命令 kind，复用现有命令。不含 captureScreen/listScreens（截图不适合进线性预设） */
  command:
    | 'pushConfig'
    | 'switch'
    | 'end'
    | 'alert'
    | 'setRoom'
    | 'broadcast'
    | 'exit'
    | 'openPlayer';
  /** 命令参数，结构对应各命令的 data */
  data?: unknown;
  /** 执行本步后等待的毫秒数，再执行下一步；0 或缺省表示不等待 */
  delayMs?: number;
}

/**
 * 集控操作预设
 * 绑定到 .ea2 档案顶层，随档案推送下发
 */
export interface ControlPreset {
  steps: ControlPresetStep[];
}

/**
 * 考试配置
 * Represents the configuration for an exam.
 */
export interface ExamConfig {
  /**
   * The name of the exam.
   */
  examName: string;

  /**
   * A message related to the exam.
   */
  message: string;

  /**
   * An array of information related to the exam.
   */
  examInfos: ExamInfo[];

  /**
   * 集控操作预设，可选。绑定到档案，随档案推送下发
   */
  controlPreset?: ControlPreset;
}
