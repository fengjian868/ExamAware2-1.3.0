# 进度条位置修复 + 考试信息显示模式

日期：2026-07-19
关联：2026-07-16-control-panel-v2-design.md

## 背景

1. 考试进度条当前放在 `.bottom-section` 内部用绝对定位 `bottom:0`，与上方信息卡片重叠导致视觉上"看不见"。用户希望进度条位于两个信息卡片正下方、与卡片左右边缘对齐、保持一点间距。
2. 当考试跨多天（如三天）时，`CurrentExamInfo.vue` 的按日期多列布局会水平挤压，信息拥挤。用户希望提供三种可选显示模式，默认使用纵向堆叠模式。

## 目标

- 修复进度条位置：移到 `.bottom-section` 之后作为正常文档流元素，与卡片对齐且保持间距。
- 为考试信息组件提供三种显示模式，用户可自行选择，默认纵向堆叠。
- 模式选择持久化，下次启动记住用户偏好。

## 非目标

- 不修改考试数据源结构。
- 不改变主控端协议（仅前端渲染优化）。
- 不引入新的外部依赖。

## 设计

### 1. 进度条位置修复

**文件：** `packages/player/src/components/ExamPlayer.vue`

**当前结构：**
```
.content-wrapper
  ├── .top-header
  ├── .clock-section
  └── .bottom-section
      ├── .bottom-left
      ├── .bottom-right
      └── .exam-progress-bar (absolute, bottom:0)  ← 问题所在
```

**目标结构：**
```
.content-wrapper
  ├── .top-header
  ├── .clock-section
  ├── .bottom-section
  │   ├── .bottom-left
  │   └── .bottom-right
  └── .exam-progress-bar  ← 移到这里，文档流
```

**改动点：**
- 模板：将 `<div class="exam-progress-bar">` 从 `.bottom-section` 内部移出，放到 `.bottom-section` 之后、`.content-wrapper` 之内。
- CSS：
  - `.bottom-section` 移除 `position: relative` 和 `padding-bottom: 12px`
  - `.exam-progress-bar` 移除 `position: absolute`、`bottom: 0`、`left: 0`、`right: 0`
  - `.exam-progress-bar` 改为 `margin-top: 0.5rem`（约 8px，与上方卡片保持间距）
  - 宽度保持 100%，自动与 `.bottom-section` 左右边缘对齐

**逻辑不变：**
- `examProgress`、`examProgressPercent`、`examProgressBarColor`、`showExamProgressBar` 等 computed 保留现有实现
- 进度条计算逻辑（考前 preCountdownMinutes 到考试结束）不变

### 2. 考试信息显示模式

**文件：** `packages/player/src/components/CurrentExamInfo.vue`

#### 2.1 新增 displayMode prop

```typescript
type ExamInfoDisplayMode = 'scroll' | 'stack' | 'current'

const props = withDefaults(defineProps<{
  // ...现有 props
  displayMode?: ExamInfoDisplayMode
}>(), {
  displayMode: 'stack'
})
```

#### 2.2 三种模式渲染

**A. scroll（横向滚动）**
- 保持现有 `.days-grid` 横向 flex 布局
- 修复压缩问题：`.day-group` 从 `flex: 1` 改为 `flex: 0 0 auto`，设置 `min-width: 8rem`
- 容器 `.days-grid` 保持 `overflow-x: auto`
- 适用：天数少、想一眼看多日

**B. stack（纵向堆叠，默认）**
- 新增 `.days-stack` 容器，`flex-direction: column`，`gap: 0.5rem`
- 每个 `.day-row` 横向排列：日期表头（固定宽度）+ 该日考试项（横向 flex）
- 宽度充裕不挤压
- 适用：天数多、避免拥挤

**C. current（仅当前天 + 切换）**
- 只渲染 `isCurrentDay` 的那一组考试信息
- 顶部加左右箭头按钮切换日期索引
- 显示当前日期 / 总天数（如 "2 / 3"）
- 切换不影响当前考试判定，仅切换显示
- 适用：屏幕小、关注当前

#### 2.3 模板结构

```vue
<template>
  <div class="current-exam-info">
    <!-- current 模式：切换栏 -->
    <div v-if="displayMode === 'current' && dayGroups.length > 1" class="day-switcher">
      <button @click="prevDay">‹</button>
      <span>{{ currentDayIndex + 1 }} / {{ dayGroups.length }}</span>
      <button @click="nextDay">›</button>
    </div>

    <!-- scroll 模式 -->
    <div v-if="displayMode === 'scroll'" class="days-grid">
      <div v-for="group in dayGroups" :key="group.date" class="day-group"
           :class="{ 'is-current': group.isCurrentDay }">
        <!-- ... -->
      </div>
    </div>

    <!-- stack 模式 -->
    <div v-else-if="displayMode === 'stack'" class="days-stack">
      <div v-for="group in dayGroups" :key="group.date" class="day-row"
           :class="{ 'is-current': group.isCurrentDay }">
        <div class="day-row-header">{{ group.dateLabel }}</div>
        <div class="day-row-exams">
          <!-- 考试项 -->
        </div>
      </div>
    </div>

    <!-- current 模式 -->
    <div v-else class="days-grid">
      <div class="day-group" :class="{ 'is-current': true }">
        <!-- 当前选中的日期 -->
      </div>
    </div>
  </div>
</template>
```

#### 2.4 模式切换入口

**入口位置：** 播放器设置面板（ActionButtonBar 的设置弹窗）

**实现：**
- 在设置弹窗中新增"考试信息显示模式"单选项（radio group）
- 选项：横向滚动 / 纵向堆叠（默认）/ 仅当前
- 选择后通过 `ExamPlayerCtx` provide/inject 传递到 `CurrentExamInfo`
- 持久化到 player 配置（localStorage key: `player.examInfoDisplayMode`），下次启动记住选择

#### 2.5 默认值

- `displayMode` 默认 `stack`
- localStorage 无值时使用默认值

## 数据流

```
设置弹窗（用户选择 displayMode）
  ↓ commit
ExamPlayerCtx（provide）
  ↓ inject
CurrentExamInfo（displayMode prop）
  ↓ 渲染
对应模式布局
```

## 错误处理

- `displayMode` 值校验：非三选一时回退到 `stack`
- `dayGroups` 为空时：所有模式都不渲染内容，显示空状态
- `current` 模式下日期索引越界：自动 clamp 到有效范围

## 测试要点

- 进度条：确认在卡片下方可见、与卡片左右对齐、有间距
- scroll 模式：多天时横向滚动正常，不被压缩
- stack 模式（默认）：多天纵向排列，信息不拥挤
- current 模式：切换箭头工作，索引显示正确
- 模式切换：实时生效，不丢失数据
- 持久化：重启播放器后模式选择被记住
- 单天考试：三种模式都正常显示

## 涉及文件

1. `packages/player/src/components/ExamPlayer.vue` — 进度条位置修复
2. `packages/player/src/components/CurrentExamInfo.vue` — 三种显示模式
3. 播放器设置弹窗组件 — 新增 displayMode 单选项（具体文件待实现时确认）
4. `ExamPlayerCtx` — 传递 displayMode（如尚未有则新增 provide）
