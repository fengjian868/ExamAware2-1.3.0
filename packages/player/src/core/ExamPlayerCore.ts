import { ref, computed, readonly, watch } from 'vue';
import type { ExamConfig } from '@dsz-examaware/core';
import { ExamTaskQueue } from '../utils/taskQueue';
import { ExamDataProcessor } from '../utils/dataProcessor';
import type { ExamInfo, PlayerConfig, PlayerEventHandlers, PlayerState } from '../types';
import type { TimeProvider, IExamConfigService } from './interfaces';
import type { IReminderService } from './reminder';

export class ExamPlayerCore {
  readonly state = ref<PlayerState>({
    currentExamIndex: 0,
    loading: false,
    loaded: false,
    error: null
  });
  readonly examConfig = ref<ExamConfig | null>(null);
  readonly currentTime = ref<number>(0);

  private readonly timeProvider: TimeProvider;
  private readonly events: PlayerEventHandlers;
  private readonly configSvc: IExamConfigService;
  private timeInterval: NodeJS.Timeout | null = null;
  private readonly queue: ExamTaskQueue;
  private readonly reminder?: IReminderService;

  // 订阅/Hook
  private onStateChangeCbs: Array<(s: Readonly<PlayerState>) => void> = [];
  private onExamChangeCbs: Array<(oldIdx: number, newIdx: number) => void> = [];

  constructor(
    config: ExamConfig | null,
    playerCfg: PlayerConfig,
    timeProvider: TimeProvider,
    events: PlayerEventHandlers,
    configSvc: IExamConfigService,
    opts?: { reminder?: IReminderService; schedulerFactory?: () => ExamTaskQueue }
  ) {
    this.timeProvider = timeProvider;
    this.events = events;
    this.configSvc = configSvc;
    this.currentTime.value = this.timeProvider.getCurrentTime();
    this.queue = opts?.schedulerFactory
      ? opts.schedulerFactory()
      : new ExamTaskQueue(this.timeProvider.getCurrentTime);
    this.reminder = opts?.reminder;
    this.examConfig.value = config;

    // 定期推进 currentTime
    watch(this.currentTime, () => {
      if (this.examConfig.value?.examInfos && this.state.value.loaded) {
        if (this.currentTime.value % 30000 < 1000) {
          // 考试刚结束的宽限期内不自动切换，保持 completed 状态让 UI 显示结束特效
          const current = this.currentExam.value;
          if (current?.end) {
            const endMs = this.configSvc.parse(current.end).getTime();
            if (this.currentTime.value >= endMs && this.currentTime.value - endMs < 6000) {
              return;
            }
          }
          this.updateCurrentExam();
        }
      }
    });

    // 派发状态变化
    watch(
      this.state,
      (_s) => {
        const v = this.state.value;
        const clone = {
          currentExamIndex: v.currentExamIndex,
          loading: v.loading,
          loaded: v.loaded,
          error: v.error,
          errorDetails: v.errorDetails
            ? {
                isValid: v.errorDetails.isValid,
                errors: [...v.errorDetails.errors],
                warnings: [...v.errorDetails.warnings]
              }
            : v.errorDetails
        };
        this.onStateChangeCbs.forEach((cb) => cb(clone));
      },
      { deep: true }
    );
  }

  // 计算属性（与原逻辑保持一致）
  readonly currentExam = computed(() => {
    if (!this.examConfig.value) return null;
    const idx = this.state.value.currentExamIndex;
    const list = this.examConfig.value.examInfos;
    if (idx < 0 || idx >= list.length) return null;
    return list[idx];
  });

  readonly sortedExamInfos = computed(() => {
    if (!this.examConfig.value) return [];
    return this.configSvc.getSortedConfig(this.examConfig.value).examInfos;
  });

  readonly examStatus = computed(() =>
    ExamDataProcessor.getExamStatus(this.currentExam.value, this.currentTime.value)
  );
  readonly currentExamName = computed(() => this.currentExam.value?.name || '暂无考试');
  readonly currentExamTimeRange = computed(() =>
    ExamDataProcessor.getExamTimeRange(this.currentExam.value)
  );
  readonly remainingTime = computed(() =>
    ExamDataProcessor.getRemainingTimeText(this.currentExam.value, this.currentTime.value)
  );
  readonly formattedCurrentTime = computed(() =>
    ExamDataProcessor.formatCurrentTime(this.currentTime.value)
  );
  readonly formattedExamInfos = computed(() =>
    ExamDataProcessor.formatExamInfos(
      this.examConfig.value,
      this.currentTime.value,
      Number(this.playerConfig.preCountdownMinutes) || 15
    )
  );

  // 记录已触发结束提醒的考试，防止重复
  private endedExamNotified = new Set<string>();

  start() {
    if (this.timeInterval) return;
    this.timeInterval = setInterval(() => {
      const prevTime = this.currentTime.value;
      this.currentTime.value = this.timeProvider.getCurrentTime();
      // 每秒检测考试结束：当前考试从进行中变为结束的瞬间触发 onExamEnd
      this.detectExamEnd(prevTime);
    }, 1000);
    this.queue.start();
    if (this.timeProvider.onTimeChange) {
      this.timeProvider.onTimeChange(() => {
        const prevTime = this.currentTime.value;
        this.currentTime.value = this.timeProvider.getCurrentTime();
        this.detectExamEnd(prevTime);
        this.queue.updateTimeProvider(this.timeProvider.getCurrentTime);
      });
    }
  }

  // 检测当前考试是否刚刚结束（currentTime 跨过 endTime），触发 onExamEnd
  private detectExamEnd(prevTime: number) {
    const exam = this.currentExam.value;
    if (!exam?.end) return;
    let endMs: number;
    try {
      endMs = this.configSvc.parse(exam.end).getTime();
    } catch {
      return;
    }
    const now = this.currentTime.value;
    // prevTime < endMs <= now 表示刚刚跨过结束时间
    if (prevTime < endMs && now >= endMs) {
      const examKey = exam.id ?? exam.name ?? '';
      const key = String(examKey);
      if (key && !this.endedExamNotified.has(key)) {
        this.endedExamNotified.add(key);
        // 不立即切换，保持 completed 状态让 UI 显示结束特效
        this.scheduleExamSwitchAfterEnd();
        this.events.onExamEnd?.(exam);
        this.reminder?.showColorfulAlert({ title: '考试结束', themeBaseColor: '#ff3b30' });
      }
    }
  }

  stop() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
      this.timeInterval = null;
    }
    if (this.examSwitchTimer) {
      clearTimeout(this.examSwitchTimer);
      this.examSwitchTimer = null;
    }
    if (this.timeProvider.offTimeChange) {
      this.timeProvider.offTimeChange(() => {
        this.currentTime.value = this.timeProvider.getCurrentTime();
      });
    }
    this.queue.stop();
  }

  private playerConfig: PlayerConfig = { roomNumber: '01' };

  setPlayerConfig(cfg: PlayerConfig) {
    this.playerConfig = cfg;
  }

  updatePlayerConfig(cfg: Partial<PlayerConfig>) {
    this.playerConfig = { ...this.playerConfig, ...cfg };
    // 如果配置已加载，重新创建任务队列以应用新的考前倒计时设置
    if (this.examConfig.value && this.state.value.loaded) {
      this.queue.clear();
      this.queue.createTasksForConfig(
        this.examConfig.value,
        {
          onPreExamStart: (exam: ExamInfo, preMinutes: number) => {
            this.events.onPreExamStart?.(exam, preMinutes);
            this.reminder?.showColorfulAlert({
              title: `即将开考 · ${exam.name}`,
              themeBaseColor: '#ff9800',
              forceWhiteText: true
            });
          },
          onExamStart: (exam: ExamInfo) => {
            this.currentTime.value = this.timeProvider.getCurrentTime();
            this.updateCurrentExam();
            this.events.onExamStart?.(exam);
            this.reminder?.showColorfulAlert({ title: '考试开始', themeBaseColor: '#2ecc71' });
          },
          onExamEnd: (exam: ExamInfo) => {
            this.currentTime.value = this.timeProvider.getCurrentTime();
            // 不立即切换到下一场：保持当前考试为 completed 状态，
            // 让 UI 显示“考试已结束”并触发全屏结束特效。
            this.scheduleExamSwitchAfterEnd();
            this.events.onExamEnd?.(exam);
            this.reminder?.showColorfulAlert({ title: '考试结束', themeBaseColor: '#ff3b30' });
          },
          onExamAlert: (exam: ExamInfo, alertTime: number) => {
            this.events.onExamAlert?.(exam, alertTime);
            this.reminder?.showColorfulAlert({
              title: '考试即将结束',
              themeBaseColor: '#ff3b30',
              forceWhiteText: true
            });
          },
          onExamSwitch: this.events.onExamSwitch
        },
        this.playerConfig.preCountdownMinutes
      );
      this.queue.start();
    }
  }

  updateConfig(newConfig: ExamConfig | null): boolean {
    if (!newConfig) {
      this.state.value.error = '配置为空';
      this.state.value.errorDetails = { isValid: false, errors: ['配置对象为 null'], warnings: [] };
      this.state.value.loaded = false;
      this.queue.clear();
      return false;
    }
    if (!this.configSvc.validate(newConfig)) {
      this.state.value.error = '配置验证失败';
      this.state.value.errorDetails = {
        isValid: false,
        errors: ['validateExamConfig 返回 false'],
        warnings: []
      };
      this.state.value.loaded = false;
      this.queue.clear();
      return false;
    }
    if (this.configSvc.hasOverlap(newConfig)) {
      this.state.value.error = '考试时间存在重叠';
      this.state.value.errorDetails = {
        isValid: false,
        errors: ['hasExamTimeOverlap 返回 true'],
        warnings: []
      };
      this.state.value.loaded = false;
      this.queue.clear();
      return false;
    }
    this.examConfig.value = newConfig;
    this.state.value.error = null;
    this.state.value.loaded = true;
    this.endedExamNotified.clear();
    this.updateCurrentExam();

    this.queue.createTasksForConfig(
      newConfig,
      {
        onPreExamStart: (exam: ExamInfo, preMinutes: number) => {
          this.events.onPreExamStart?.(exam, preMinutes);
          this.reminder?.showColorfulAlert({
            title: `即将开考 · ${exam.name}`,
            themeBaseColor: '#ff9800',
            forceWhiteText: true
          });
        },
        onExamStart: (exam: ExamInfo) => {
          this.currentTime.value = this.timeProvider.getCurrentTime();
          this.updateCurrentExam();
          this.events.onExamStart?.(exam);
          this.reminder?.showColorfulAlert({ title: '考试开始', themeBaseColor: '#2ecc71' });
        },
        onExamEnd: (exam: ExamInfo) => {
          this.currentTime.value = this.timeProvider.getCurrentTime();
          // 不立即切换到下一场：保持当前考试为 completed 状态，
          // 让 UI 显示“考试已结束”并触发全屏结束特效。
          this.scheduleExamSwitchAfterEnd();
          this.events.onExamEnd?.(exam);
          this.reminder?.showColorfulAlert({ title: '考试结束', themeBaseColor: '#ff3b30' });
        },
        onExamAlert: (exam: ExamInfo, alertTime: number) => {
          this.events.onExamAlert?.(exam, alertTime);
          this.reminder?.showColorfulAlert({ title: '考试即将结束', themeBaseColor: '#f1c40f' });
        },
        onExamSwitch: this.events.onExamSwitch
      },
      this.playerConfig.preCountdownMinutes
    );

    this.queue.start();
    return true;
  }

  updateCurrentExam() {
    if (!this.examConfig.value?.examInfos) return;
    const sorted = this.sortedExamInfos.value;
    if (!sorted.length) return;

    let targetIndex = ExamDataProcessor.getCurrentExamIndex(
      this.examConfig.value,
      this.currentTime.value
    );
    const oldIndex = this.state.value.currentExamIndex;
    const oldExam = sorted[oldIndex];
    if (oldExam?.end) {
      const endMs = this.configSvc.parse(oldExam.end).getTime();
      if (this.currentTime.value >= endMs && oldIndex < sorted.length - 1) {
        targetIndex = Math.max(targetIndex, oldIndex + 1);
      }
    }
    this.state.value.currentExamIndex = targetIndex;
    if (oldIndex !== targetIndex && this.events.onExamSwitch) {
      const newExam = sorted[targetIndex];
      this.events.onExamSwitch(oldExam, newExam);
    }
    if (oldIndex !== targetIndex) {
      this.onExamChangeCbs.forEach((cb) => cb(oldIndex, targetIndex));
    }
  }

  // 考试结束后延迟切换到下一场，保持当前考试为 completed 状态一段时间，
  // 让 UI 能显示“考试已结束”并播放全屏结束特效。
  private examSwitchTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleExamSwitchAfterEnd() {
    if (this.examSwitchTimer) {
      clearTimeout(this.examSwitchTimer);
      this.examSwitchTimer = null;
    }
    this.examSwitchTimer = setTimeout(() => {
      this.examSwitchTimer = null;
      this.updateCurrentExam();
    }, 6000);
  }

  switchToExam(index: number): boolean {
    if (!this.examConfig.value || index < 0 || index >= this.examConfig.value.examInfos.length)
      return false;
    const oldIndex = this.state.value.currentExamIndex;
    this.state.value.currentExamIndex = index;
    if (this.events.onExamSwitch && oldIndex !== index) {
      const oldExam = this.sortedExamInfos.value[oldIndex];
      const newExam = this.sortedExamInfos.value[index];
      this.events.onExamSwitch(oldExam, newExam);
    }
    return true;
  }

  // 暴露只读视图
  view() {
    return {
      state: readonly(this.state),
      examConfig: readonly(this.examConfig),
      currentTime: readonly(this.currentTime),
      currentExam: this.currentExam,
      sortedExamInfos: this.sortedExamInfos,
      formattedExamInfos: this.formattedExamInfos,
      examStatus: this.examStatus,
      currentExamName: this.currentExamName,
      currentExamTimeRange: this.currentExamTimeRange,
      remainingTime: this.remainingTime,
      formattedCurrentTime: this.formattedCurrentTime
    };
  }

  taskQueueApi() {
    return {
      getTaskCount: () => this.queue.getTaskCount(),
      getTaskDetails: () => this.queue.getTaskDetails(),
      getPendingTasks: () => this.queue.getPendingTasks(),
      clear: () => this.queue.clear(),
      start: () => this.queue.start(),
      stop: () => this.queue.stop()
    };
  }

  // 序列化/反序列化：用于热重载或持久化
  serialize() {
    return {
      state: this.state.value,
      currentTime: this.currentTime.value
    };
  }

  rehydrate(payload: { state?: Partial<PlayerState>; currentTime?: number }) {
    if (payload.state) {
      this.state.value = { ...this.state.value, ...payload.state };
    }
    if (typeof payload.currentTime === 'number') {
      this.currentTime.value = payload.currentTime;
    }
    this.updateCurrentExam();
  }

  // Hook/订阅
  onStateChange(cb: (s: Readonly<PlayerState>) => void) {
    this.onStateChangeCbs.push(cb);
    return () => {
      this.onStateChangeCbs = this.onStateChangeCbs.filter((x) => x !== cb);
    };
  }

  onExamChange(cb: (oldIdx: number, newIdx: number) => void) {
    this.onExamChangeCbs.push(cb);
    return () => {
      this.onExamChangeCbs = this.onExamChangeCbs.filter((x) => x !== cb);
    };
  }
}
