# 集控（多屏集中管理面板）设计文档

- 日期：2026-07-15
- 状态：已批准，待编写实现计划
- 方案：B（cast 端口加 WebSocket 控制通道）

## 1. 目标与场景

一台控制端（老师/管理员电脑）统一管理局域网内多台大屏设备，控制端自身不强制放映。支持四类远程操作：

1. 推送/批量推送考试档案并让对端放映
2. 远程操控播放进度（切场、结束、提醒、改考场号、退出）
3. 实时状态总览（在线状态、当前考试/状态/考场号、时钟同步）
4. 紧急广播通知（覆盖式全屏通知）

控制端与放映端角色可动态切换：任意设备都能开控制面板当控制端，也都能被管+放映，两者在同一设备上可并存。

## 2. 整体架构

P2P 模型，无中心 broker。控制端主动连接被控端的 WS `/control/ws`，被控端作为 WS 服务端。

```
控制端设备                          被控端(大屏)设备
┌──────────────────┐               ┌──────────────────┐
│ 控制面板窗口      │   WS 连接     │ cast 服务        │
│  (路由 control)  │ ────────────▶ │ /control/ws      │
│                  │  下行命令      │   ↑ 状态推送      │
│  Bonjour 发现 ◀──│  上行状态/回执 │   ↓ 命令执行      │
└──────────────────┘               │  播放器窗口       │
                                   └──────────────────┘
```

关键点：

- **P2P 而非 hub**：控制端对每台被控设备各建一条 WS（N 条连接）。设备 A 当控制端时连 B/C/D，设备 B 当控制端时也能连 A/C/D。
- **复用 Bonjour 发现**：被控端在 cast 的 TXT 记录里新增 `control: '1'` 标志，表示支持集控协议。控制端发现 peer 后探活 `/control/ws`，能连则纳入管理。
- **角色互斥但不互踢**：同一台设备开控制面板时仍可被别的设备控制——它既跑 WS 服务端（被管），又作为 WS 客户端连别人（管人）。播放器窗口与控制面板窗口在同一设备上并存。
- **权限**：复用 cast 现有的「无鉴权局域网信任」模型，不引入 token（与现有 `cast:send`/`POST /cast/play` 一致）。

## 3. WS 协议

所有 WS 帧统一为 JSON，顶层结构：

```jsonc
{
  "t": "status",        // 消息类型：status | command | result | hello
  "id": "abc123",        // 命令/回执配对用（仅 command/result 带）
  "kind": "switch",      // 具体子类型
  "data": { ... }        // 负载
}
```

### 3.1 设备 → 控制端（上行，t=status）

- `hello`：连接建立后立即发一次，含 `deviceName`、`version`、`appId`、当前状态快照
- `heartbeat`：每 5 秒，控制端据此判活，15 秒无心跳判离线
- `state`：考试状态变更时推送（在线/正在考试的考试名/状态/考场号/当前时间偏移）

### 3.2 控制端 → 设备（下行，t=command）

| kind         | data                                              | 说明                                                                 |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------------- |
| `pushConfig` | `{ config: string, autoPlay?: bool }`             | 推送考试档案，落地为临时 .ea2 并打开播放器窗口（autoPlay 默认 true） |
| `switch`     | `{ direction: 'next' \| 'prev' }`                 | 切换到上一场/下一场                                                  |
| `end`        | `{}`                                              | 强制结束当前场                                                       |
| `alert`      | `{ title: string, color?: string }`               | 触发全屏提醒 + 铃声                                                  |
| `setRoom`    | `{ room: string }`                                | 改考场号                                                             |
| `broadcast`  | `{ title: string, body: string, color?: string }` | 紧急广播全屏通知（覆盖当前内容，可手动关）                           |
| `exit`       | `{}`                                              | 退出播放器（回待机/主界面）                                          |

### 3.3 设备 → 控制端（回执，t=result）

每条 command 必须回 `result`，`id` 与命令一致，`{ ok: true }` 或 `{ ok: false, error: string }`。例：`pushConfig` 落地成功回 `ok:true`，配置非法回 `ok:false,error:'配置解析失败'`。

### 3.4 状态数据结构（state 的 data）

```jsonc
{
  "playing": true,
  "examName": "2024期末",
  "examStatus": "inProgress", // pending | inProgress | completed
  "currentExam": "语文",
  "roomNumber": "01",
  "now": 1784123456789, // 设备发送时的 Date.now()，控制端收到时与本地时间相减得偏移
  "configLoaded": true
}
```

### 3.5 设计取舍

- **pushConfig 复用现有 `POST /cast/play` 逻辑**：WS 收到 `pushConfig` 后，主进程走同一段「写临时 .ea2 → `createPlayerWindow`」代码，不另起。WS 与 HTTP 两条通道行为一致。
- **broadcast 不改播放器状态**：它只是叠一层全屏通知，关掉后播放器恢复原样，不切场、不清页数。与现有 `reminderService` 的普通 notice 类似但更高优先级。
- **时钟偏移由控制端计算**：设备只在 `now` 字段带上自己的 `Date.now()`，不算偏移；控制端收到时用 `Date.now() - data.now` 得到偏移（负数表示设备慢），用于总览里标红「时钟不准」的设备。不需要 NTP 级精度。

## 4. 控制端 UI（控制面板窗口）

新窗口：路由 `control`，独立窗口 `controlWindow.ts`，尺寸 1100×720，标题「集控面板」。通过 `examaware://control` 深链或主界面入口打开。与播放器窗口并存。

### 4.1 布局（三栏）

```
┌─────────────────────────────────────────────────────────┐
│ 集控面板          [刷新] [仅显示在线]     设备 5/8 在线   │
├──────────┬──────────────────────────────┬───────────────┤
│ 设备列表  │   选中设备详情                │  批量操作      │
│          │                              │               │
│ ● 设备A   │  设备A · 在线                 │  [推送档案…]  │
│   语文·进行│  ──────────────              │  [切下一场]   │
│ ● 设备B   │  当前: 语文 进行中  考场01    │  [全部结束]   │
│   数学·待考│  时钟偏移: +0ms  同步✓       │  [紧急广播…]  │
│ ○ 设备C   │  ──────────────              │               │
│   离线    │  快捷操作                     │  选中设备:    │
│          │  [推送档案][切场][结束][提醒]  │  设备A, 设备B │
│          │  [改考场号][广播][退出]        │               │
├──────────┴──────────────────────────────┴───────────────┤
│ 日志: 14:23 推送档案→设备A 成功                          │
└─────────────────────────────────────────────────────────┘
```

### 4.2 左栏（设备列表）

- 每台一行：设备名、在线圆点（绿/灰）、当前考试名+状态摘要
- Bonjour 发现的 peer + 已连 WS 的状态合并显示
- 复选框多选，选中项受「批量操作」影响
- 点击单台→中栏显示详情
- 顶部筛选「仅显示在线」

### 4.3 中栏（单设备详情 + 快捷操作）

- 完整状态：考试名、examStatus、当前科目、考场号、时钟偏移、配置是否加载
- 7 个快捷按钮（对应 command 的 7 种 kind），对当前选中的单台执行
- 「推送档案」点开文件选择 → 推送并显示回执
- 「切场」弹下一场/上一场二选一

### 4.4 右栏（批量操作）

- 列出当前勾选的设备名
- 批量推送、批量切下一场、批量结束、批量广播、批量退出
- 批量操作逐台下发、逐台收回执，右栏实时滚动「设备A ✓ / 设备B ✗ 配置非法」

### 4.5 底部（日志栏）

滚动日志：操作时间 + 目标设备 + 结果，保留最近 50 条。

### 4.6 状态更新来源

- 控制端对每台在线设备持有 WS 连接，设备主动 `state` 推送时左栏+中栏实时刷新
- 离线/重连自动更新圆点

### 4.7 不复用的部分

现有 `CastWindow.vue`（400×300 投送小窗）保留不动，集控面板是新独立窗口。CastWindow 的「发送当前配置」「跟随放映」继续作为轻量单设备投送入口。

## 5. 被控端实现（设备侧 WS 服务端 + 命令执行）

### 5.1 WS 服务端

在 `castService.ts` 的 Koa 服务上挂 WS 路径 `/control/ws`，用项目已有的 `ws` 包。每个控制端连进来的连接视为一个控制端，维护一个 `Set<WebSocket>`。

### 5.2 连接生命周期

- 接受连接 → 立即发 `hello`（设备名、版本、当前状态快照）
- 每条连接每 5 秒收心跳 `ping`（ws 原生），15 秒无响应断开
- 断开时清理，不影响播放器

### 5.3 命令执行器（主进程 `controlCommandExecutor.ts`）

| kind                                 | 执行方式                                                                                                        | 回执                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `pushConfig`                         | 复用 `createPlayerWindow` 链路：写临时 .ea2 → 开/复活 player 窗口（复用现有单实例逻辑，不并发多窗）             | 落地+窗口创建成功回 ok |
| `switch`                             | 通过 IPC `player:control` 把命令转发给 player 窗口渲染层，由 `ExamPlayerCore` 执行切场                          | 渲染层确认后回 ok      |
| `end` / `alert` / `setRoom` / `exit` | 同上，走 `player:control` IPC 通道                                                                              | 同上                   |
| `broadcast`                          | 主进程直接向 player 窗口发 `player:overlay-notice` IPC，渲染层用现有 `reminderService` 的 notice 机制叠全屏通知 | 通知显示成功回 ok      |

### 5.4 关键点 — player 窗口单实例的取舍

现有 `WindowManager` 是单实例-per-id，player id 硬编码 `'player'`。**本次不改这个架构**——被控端同一时刻只放一个 player 窗口（符合「一台大屏放一场考试」现实）。`pushConfig` 推新配置时，复用现有逻辑：若 player 窗口已存在则 `forceRecreate` 重开并加载新配置。

集控的「多屏」是「多台设备各一个 player 窗口」，不是「一台设备开多个 player 窗口」。因此不需要动 WindowManager 的单实例模型。

### 5.5 状态采集（设备→控制端推送）

- 主进程维护一份 `DeviceStatus` 快照，订阅 player 窗口通过 IPC 上报的状态变更（`player:status-report`，含 examStatus/currentExam/roomNumber/configLoaded/now）
- 任何字段变化时，向所有连着的控制端 WS 推送 `state`
- 设备侧只带上 `now`（`Date.now()`），偏移由控制端计算，设备侧不算

### 5.6 IPC 通道清单（主进程↔player 渲染层，新增）

- `player:control`（主→渲染）：`{ kind, data }` 执行命令
- `player:control-result`（渲染→主）：`{ id, ok, error? }` 回执
- `player:status-report`（渲染→主）：`{ ...DeviceStatus }` 状态上报
- `player:overlay-notice`（主→渲染）：`{ title, body, color }` 广播通知

### 5.7 播放器侧改动

`ExamPlayer.vue` / `ExamPlayerCore` 订阅 `player:control`，把 switch/end/alert/setRoom/exit 映射到现有方法（`nextExam`/`forceEnd`/`showColorfulAlert`/`setRoomNumber`/`exit`），执行完回 `player:control-result`。同时在 `examStatus` 等 watch 里加 `player:status-report` 上报。

### 5.8 不做的

- 不改 `httpApiService`（它的 WS `/ws` 保持 ping/pong 空壳）
- 不改 `CastWindow.vue`
- 不引入新的鉴权层（与 cast 现有信任模型一致）

## 6. 控制端实现（WS 客户端 + 发现/重连 + 聚合）

### 6.1 控制端 WS 客户端管理（主进程 `controlClientManager.ts`）

- 控制面板窗口打开时启动，关闭时停止并断开所有连接
- 复用 `castService` 的 `listPeers()` 拿到候选设备，对每台尝试连 `ws://{host}:{port}/control/ws`
- 每台设备一个 `DeviceConnection` 对象，持有 WS、最近状态快照、重连退避计时器
- **重连**：连接断开（非主动关闭）后，5s → 10s → 20s 三级退避重试，封顶 20s；设备主动下线不重试
- **发现刷新**：控制面板每 10s 调一次 `listPeers()` 合并新设备，对新增 peer 发起连接；Bonjour `down` 事件标记设备待移除（等重连失败后转离线）

### 6.2 状态聚合 → 渲染层

- 主进程通过 IPC `control:devices` 把所有 `DeviceConnection` 快照推给控制面板渲染层（数组：`{ peerId, deviceName, online, status, lastSeen }`）
- 任何设备状态变化/上下线时增量推送
- 控制面板渲染层只读这个快照，不直连 WS

### 6.3 命令下发链路

- 控制面板点按钮 → `window.api.control.sendCommand(peerIds[], { kind, data })` → 主进程逐台发 WS command（带 id）→ 收 result 回执 → `control:command-result` IPC 推给渲染层 → 右栏/日志栏更新
- 批量操作：主进程 `Promise.allSettled` 并发下发，逐台回执滚动上报

### 6.4 控制面板的 IPC 暴露（preload 新增 `window.api.control`）

```ts
listDevices()                         // 触发一次发现+状态快照
sendCommand(peerIds: string[], cmd)   // 下发命令（单/批量统一入口）
onDevices(listener)                   // 订阅设备列表变化
onCommandResult(listener)             // 订阅回执
refreshDiscovery()                    // 手动刷新发现
```

### 6.5 Bonjour TXT 扩容

- cast 发布的 TXT 加 `control: '1'`（表示支持集控协议）和 `ctrlVer: '1'`（协议版本，未来协商用）
- 控制端发现 peer 后，先看 TXT 有无 `control:'1'`，没有则不纳入集控（但仍可走老 cast 投送）

### 6.6 深链入口

新增 `examaware://control` → `createControlWindow()`，方便从主界面按钮或外部唤起。

## 7. 范围边界（不做的）

- 不做跨网段/外网控制（仅局域网 Bonjour 可达）
- 不做设备分组/房间管理（v1 先平面列表，后续可加）
- 不做命令队列/离线补发（设备离线时命令丢弃，控制端日志记「失败：离线」）
- 不做权限分级（局域网内任意已安装 EA2 的设备均可互控，与 cast 现模型一致）
- 不改 `WindowManager` 单实例模型

## 8. 测试策略

- **单元**：WS 协议帧的序列化/反序列化、命令执行器对各 kind 的分发、状态快照 diff 计算
- **集成**：起两个主进程实例（不同端口），一个开控制面板、一个当被控，验证发现→连接→下发→回执→状态推送全链路
- **手动**：两台真机/虚拟机，推档案、切场、广播、断网重连

## 9. 文件清单预估（实现时再细化）

新增：

- `packages/desktop/src/main/windows/controlWindow.ts`
- `packages/desktop/src/main/control/controlServer.ts`（被控端 WS 服务端）
- `packages/desktop/src/main/control/controlClientManager.ts`（控制端 WS 客户端管理）
- `packages/desktop/src/main/control/controlCommandExecutor.ts`（命令执行器）
- `packages/desktop/src/main/control/controlProtocol.ts`（协议类型与序列化）
- `packages/desktop/src/renderer/src/views/ControlPanel.vue` 及子组件

改动：

- `packages/desktop/src/main/cast/castService.ts`（挂 WS 路径 + TXT 扩容）
- `packages/desktop/src/preload/index.ts` + `index.d.ts`（control API）
- `packages/player/src/components/ExamPlayer.vue` / `ExamPlayerCore.ts`（订阅 control + 上报 status）
- `packages/desktop/src/main/index.ts`（注册）
- `packages/desktop/src/main/deepLink/coreDeepLinkController.ts`（control 深链）
