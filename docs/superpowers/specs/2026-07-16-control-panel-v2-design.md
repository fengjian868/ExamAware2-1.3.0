# 集控增强 V2 设计文档（Bug 修复 + 4 项新功能）

- 日期：2026-07-16
- 状态：待批准
- 基础：基于 [2026-07-15-control-panel-design.md](./2026-07-15-control-panel-design.md) 已实现的集控能力扩展

## 1. 目标与范围

在现有集控（推送档案/切场/结束/提醒/改考场号/广播/退出/打开播放器）基础上，本次包含 6 项工作：

**Bug 修复（2 项）**

- A. 广播不可用：被控端 player 未运行时广播直接失败；且为 fire-and-forget，player 刚开监听未就绪时虚假成功
- B. 推送档案不自动播放：`createPlayerWindow` 未透传 `forceRecreate`，被控端已有 player 时复用旧窗、不重载新档案

**新功能（4 项）**

- C. 实时时钟/进度看板：设备列表行内紧凑展示考试进度、时钟偏移、剩余时间，偏差超阈值高亮
- D. 被控端画面预览：手动点按触发系统级屏幕截图回传，支持多屏选择
- E. 操作预设/一键流程：预设绑定到 .ea2 档案顶层，面板内编辑，手动触发批量执行，步骤间支持间隔等待
- F. 批量进度实时追踪：批量命令改为流式回执，每台完成即推进度

## 2. Bug 修复设计

### 2.1 Bug A — 广播不可用

**根因**（见调研结论）：

- [controlCommandExecutor.ts:149-152](file:///workspace/packages/desktop/src/main/control/controlCommandExecutor.ts) `executeBroadcast` 在 player 窗口不存在时直接返回 `{ ok: false, error: '播放器未运行' }`
- `:153-159` 是 fire-and-forget：`webContents.send` 后立即返回 `{ ok: true }`，player 刚开、PlayerView 的 `onMounted` 监听（[PlayerView.vue:472](file:///workspace/packages/desktop/src/renderer/src/views/PlayerView.vue)）未注册时 IPC 被静默丢弃

**修复方案**：

1. `executeBroadcast` 在 player 不存在时，复用 `executeOpenPlayer` 的逻辑先打开 player（用 sharedConfig 或返回"无可用档案"错误），不再直接失败
2. 开窗后等待短暂时间（500ms）让 PlayerView 注册监听，再 send
3. 新增 `player:overlay-notice-result` IPC channel：PlayerView 收到 overlay-notice 后回执 `{ ok: true }`；executor 等待该回执（超时 3s 算失败），消灭虚假成功
4. PlayerView `handleOverlayNotice` 调用 `showBroadcastNotice` 后 `ipcRenderer.send('player:overlay-notice-result', { ok: true })`

**回执协议**：

- executor → player：`player:overlay-notice` `{ title, body, color }`（不变）
- player → executor：`player:overlay-notice-result` `{ ok: boolean, error?: string }`（新增）

### 2.2 Bug B — 推送档案不自动播放

**根因**：

- [playerWindow.ts:8](file:///workspace/packages/desktop/src/main/windows/playerWindow.ts) `createPlayerWindow(configPath: string)` 签名无 `forceRecreate`，调用 `windowManager.open(factory)` 省略第二参
- [windowManager.ts:87](file:///workspace/packages/desktop/src/main/windows/windowManager.ts) `!forceRecreate` 恒为 true，走复用分支只 restore/show/focus，不跑 setup、不发 `load-config`
- [controlCommandExecutor.ts:99-100](file:///workspace/packages/desktop/src/main/control/controlCommandExecutor.ts) 注释声称 forceRecreate=true 但实际未传

**修复方案**：

1. `createPlayerWindow(configPath: string, forceRecreate = false)` 增加第二参，透传给 `windowManager.open(factory, forceRecreate)`
2. `executePushConfig` 改为 `createPlayerWindow(file, true)` 强制重建
3. `executeOpenPlayer` 新建分支保持 `createPlayerWindow(file)`（不强制重建，因为 openPlayer 语义是"唤起"，player 已存在则聚焦）

## 3. 新功能 C — 实时时钟/进度看板

### 3.1 数据来源

现有 `DeviceStatus`（[controlProtocol.ts:71-80](file:///workspace/packages/desktop/src/main/control/controlProtocol.ts)）已含 `now`、`examStatus`、`currentExam`、`roomNumber`、`configLoaded`。状态由被控端周期推送（state 帧）+ hello 帧带出。无需新增协议字段。

**剩余时间计算**：控制端本地持有 ExamConfig（推送档案时已知），根据 `currentExam` 匹配 `examInfos[i]` 的 `end` 时间，减去"被控端 now + 时钟偏移"得到剩余。若控制端无该档案则显示"—"。

### 3.2 UI

设备列表每行下方加一行紧凑状态条：

```
● 考场01主机
  语文 · 进行中 · 偏移 +120ms · 剩余 45:32
```

- 时钟偏移 > 2000ms（2s）时整行文字变红 + 行背景浅红高亮
- 离线/连接中/无状态时显示对应占位文案
- 偏移 = `Date.now() - status.now`（控制端计算时刻）

### 3.3 文件改动

仅 [ControlPanel.vue](file:///workspace/packages/desktop/src/renderer/src/views/ControlPanel.vue) 模板与样式：扩展 `.cp-device-sub` 渲染逻辑，新增 `formatRemaining`、`formatOffsetDetailed` 计算函数（偏移超阈值返回标记）。无主进程/协议改动。

## 4. 新功能 D — 被控端画面预览

### 4.1 依赖

新增 `screenshot-desktop` 包（被控端运行时依赖）。跨平台系统级截图，API：`screenshot({ format: 'jpg', screen: <displayId> })` 返回 Buffer。

### 4.2 协议扩展

新增命令 kind `captureScreen`：

```typescript
// 控制端 → 被控端
{ t: 'command', id, kind: 'captureScreen', data: { displayId?: number } }

// 被控端 → 控制端（回执，data 为截图结果）
{ t: 'result', id, kind: 'result', data: { ok: true, image: '<base64 jpg>', width, height } }
{ t: 'result', id, kind: 'result', data: { ok: false, error: '截图失败' } }
```

为支持多屏，新增 `listScreens` 命令：

```typescript
{ t: 'command', id, kind: 'listScreens', data: {} }
// 回执
{ t: 'result', id, kind: 'result', data: { ok: true, screens: [{ id: 0, name: 'Display 1' }, ...] } }
```

两个 kind 加入 [controlServer.ts](file:///workspace/packages/desktop/src/main/control/controlServer.ts) 的 `allowed` 白名单。

### 4.3 执行器实现

`ControlCommandExecutor` 新增：

- `executeListScreens()`：调 `screenshot-desktop` 的 `listDisplays()`（若库提供）或返回 `[{ id: 0, name: '主屏幕' }]`，多屏时列出全部
- `executeCaptureScreen(data)`：
  1. `screenshot({ format: 'jpg', quality: 60, screen: displayId })` 截图（ jpg + quality 压缩控制带宽，单张约 50-150KB）
  2. `Buffer.toString('base64')` 编码
  3. 返回 `{ ok: true, image, width, height }`
  4. 失败返回 `{ ok: false, error }`

### 4.4 控制端 UI

中栏详情区加"画面预览"按钮：

- 首次点击先调 `listScreens`，多屏时弹下拉选择，单屏直接截
- 截图完成后弹模态窗显示图片（`<img :src="'data:image/jpeg;base64,' + image">`）
- 模态窗内有"刷新截图"按钮可重新截一张
- 截图过程显示 loading

### 4.5 带宽与安全

- 手动点按触发，无定时轮询，带宽可控
- jpg quality 60 压缩，单张 < 150KB
- base64 over WS，单帧 < 200KB，ws 默认无限制
- 截图不经落盘，内存中流转后丢弃

## 5. 新功能 E — 操作预设/一键流程

### 5.1 档案格式扩展

在 [core/src/types.ts](file:///workspace/packages/core/src/types.ts) 的 `ExamConfig` 顶层新增可选字段（调研确认安全，不破坏现有解析）：

```typescript
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

export interface ControlPreset {
  steps: ControlPresetStep[];
}

export interface ExamConfig {
  examName: string;
  message: string;
  examInfos: ExamInfo[];
  /** 集控操作预设，可选。绑定到档案，随档案推送下发 */
  controlPreset?: ControlPreset;
}
```

通过 [core/src/index.ts](file:///workspace/packages/core/src/index.ts) 导出新类型。`validateExamConfig` 可选加一条对 `controlPreset.steps` 形状的轻校验。

### 5.2 预设编辑（集控面板内）

右栏"批量操作"区下方新增"操作预设"卡片：

```
┌─ 操作预设 ────────────────┐
│ 档案：[选择.ea2 ▼]         │
│ ┌────────────────────────┐│
│ │ 1. 推送档案   [删除]    ││
│ │ 2. 等待 30s   [删除]    ││
│ │ 3. 切下一场   [删除]    ││
│ │ 4. 广播       [删除]    ││
│ └────────────────────────┘│
│ [+ 添加步骤]              │
│                           │
│ [保存到档案] [执行预设]    │
└───────────────────────────┘
```

- 选档案后从 `config.controlPreset` 加载步骤列表
- 添加步骤：选 command → 填 data（按 command 类型动态表单）→ 填 delayMs
- 保存到档案：用 `fileOperations` 读原文件 JSON → 改 `controlPreset` → 写回
- 执行预设：对当前勾选设备，按序执行每步（每步批量下发，等 delayMs 后下一步）

### 5.3 预设执行引擎

控制端 `ControlPanel.vue` 新增 `executePreset(peerIds, preset)`：

```
for step in preset.steps:
    if step.command === 'pushConfig':
        await api.pushConfigFile(peerIds, currentConfigString)
    else:
        await api.sendCommand(peerIds, { kind: step.command, data: step.data })
    if step.delayMs > 0:
        await sleep(step.delayMs)
    // 进度通过功能 F 的流式回执实时更新
```

注意 `pushConfig` 走独立 IPC（`control:push-config`），其余走 `control:send-command`，与现有实现一致。

### 5.4 步骤 data 动态表单

按 command 类型提供简化编辑：

- `pushConfig`：无 data（用预设编辑器当前选中的档案，即"档案"下拉选中的那个 .ea2）
- `switch`：下拉 next/prev
- `alert`：title 输入 + color 选色
- `setRoom`：room 输入
- `broadcast`：title + body 输入
- `end`/`exit`/`openPlayer`：无 data

## 6. 新功能 F — 批量进度实时追踪

### 6.1 协议

无需新增 WS 帧。现有 `result` 帧本就是单命令单回执。问题在控制端主进程把多台回执聚合后才一次性返回渲染层。改为流式推送。

### 6.2 主进程改动

[controlClientManager.ts](file:///workspace/packages/desktop/src/main/control/controlClientManager.ts) 新增 `sendCommandBatchStream`：

```typescript
async sendCommandBatchStream(
  peerIds: string[],
  command: ControlCommand,
  onProgress: (progress: { peerId: string; result: CommandResultData }) => void
): Promise<void>
```

对每个 peerId 并发 `sendCommand`，每台 resolve 后立即调 `onProgress`。不等全部完成。

[controlController.ts](file:///workspace/packages/desktop/src/main/ipc/controlController.ts) 的 `control:send-command` handler 改为：注册 `onProgress` 回调，每台完成时通过 `event.sender.send('control:batch-progress', { peerId, result })` 推给渲染层，全部完成后再 invoke return 总结果。`control:push-config` 同理。

### 6.3 渲染层改动

[ControlPanel.vue](file:///workspace/packages/desktop/src/renderer/src/views/ControlPanel.vue) `batchSend` / `pickAndPushConfig` / `executePreset`：

- onMounted 注册 `control:batch-progress` 监听
- 批量执行时初始化进度状态 `{ total, done: 0, results: [] }`，每收到一个 progress 增量更新
- 右栏批量结果区改为流式渲染：完成一台显示一台，顶部显示 `完成 3/10` 进度条
- 预设执行时进度区分"步骤 2/4 · 完成 3/10"

### 6.4 preload 扩展

新增 `onBatchProgress(callback)` 桥接 `control:batch-progress` IPC。

## 7. 文件清单

### 修改

- `packages/core/src/types.ts` — 新增 ControlPreset/ControlPresetStep 类型，ExamConfig 加 controlPreset?
- `packages/core/src/index.ts` — 导出新类型
- `packages/core/src/parser.ts` — validateExamConfig 加 controlPreset 轻校验（可选）
- `packages/desktop/src/main/control/controlProtocol.ts` — ControlMessageKind 加 captureScreen/listScreens；CommandResultData 加 image/screens 可选字段
- `packages/desktop/src/main/control/controlServer.ts` — allowed 白名单加 captureScreen/listScreens
- `packages/desktop/src/main/control/controlCommandExecutor.ts` — executeBroadcast 改造（Bug A）；executePushConfig 传 forceRecreate（Bug B）；新增 executeListScreens/executeCaptureScreen（功能 D）
- `packages/desktop/src/main/windows/playerWindow.ts` — createPlayerWindow 加 forceRecreate 参数（Bug B）
- `packages/desktop/src/main/control/controlClientManager.ts` — 新增 sendCommandBatchStream（功能 F）
- `packages/desktop/src/main/ipc/controlController.ts` — send-command/push-config 改流式回执（功能 F）
- `packages/desktop/src/preload/index.ts` + `index.d.ts` — control 加 onBatchProgress；capture/listScreens 命令
- `packages/desktop/src/renderer/src/views/PlayerView.vue` — handleOverlayNotice 加回执（Bug A）
- `packages/desktop/src/renderer/src/views/ControlPanel.vue` — 设备行状态条（功能 C）；预览按钮+模态（功能 D）；预设编辑卡+执行（功能 E）；流式进度（功能 F）
- `packages/desktop/src/renderer/src/core/configTypes.ts` — re-export 新类型（自动）

### 新增依赖

- `screenshot-desktop`（packages/desktop dependencies）

## 8. 测试要点

- **Bug A**：被控端 player 未开时发广播 → 应自动开 player 并显示广播；player 刚开立即发广播 → 应等监听就绪后成功
- **Bug B**：被控端 player 已开着旧档案时推送新档案 → 旧窗销毁、新窗加载新档案
- **功能 C**：多台设备状态条实时刷新；人为调偏被控端时钟验证高亮
- **功能 D**：单屏/多屏截图；截图显示与刷新；被控端无显示器时错误处理
- **功能 E**：编辑预设→保存→重新加载验证持久化；多步骤含 delayMs 执行时序；pushConfig 步骤走独立 IPC
- **功能 F**：10 台设备批量下发，观察增量进度；部分设备离线时进度仍推进至完成

## 9. 范围边界

**本次不做**：

- 预设的导入导出（已有档案绑定，存盘即同步）
- 截图的历史记录/对比
- 看板的全屏轮播模式
- 预设的条件分支/跳转（保持线性步骤）
- 批量命令的重试策略（失败即记录，不自动重试）
