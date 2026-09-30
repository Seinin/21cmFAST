# Tasks

## 1. 视图切换时清空画布状态

- [x] 1.1 `App.tsx`：`view === 'matrix'` 时清空选中（`select(null, null)`）、连线模式（`setConnectSource(null)`）、引用拖拽（`setRefDragPayload(null)`）与搜索框内容
- [x] 1.2 复核没有别的画布专属状态会残留（对话框、抽屉属于跨视图，保持不动）

## 2. 快捷键按视图隔离

- [x] 2.1 `App.tsx`：矩阵视图只注册 `onSave` 与 `onToggleHelp`；画布专属动作（撤销/重做/删除/新建/连线/重排/适应屏幕/聚焦搜索）不注册
- [x] 2.2 验证：矩阵页按 Delete / N / C / L / F / `/` 页面无变化、不产生快照

## 3. 顶栏隐藏画布专属控件

- [x] 3.1 `TopBar.tsx`：`view === 'matrix'` 时隐藏搜索框、撤销/重做、布局、话题、标签、导入、图谱统计（后三项偏差已在 design.md 说明）
- [x] 3.2 保留视图切换、另存、历史、帮助与图谱名称

## 4. 状态条换成矩阵口径

- [x] 4.1 `StatusBar.tsx`：新增 `view` 与 `matrix` 两个属性，矩阵页显示「N 参数 · M 过程 · K 有色格」与当前动作；右侧保存状态两种视图共用
- [x] 4.2 `MatrixView.tsx`：通过 `onStatus` 回调上报统计与当前动作（详情打开 / 参数行聚焦）
- [x] 4.3 `App.tsx`：持有矩阵统计状态并只在该视图传给状态条
- [x] 4.4 `MatrixView.tsx`：Esc 关闭已打开的过程详情（`Sheet` 自身不处理 Escape）

## 5. 文案与文档

- [x] 5.1 `HelpDialog.tsx`：说明画布专属快捷键在矩阵页不生效，并补一条"参数矩阵视图"的说明
- [x] 5.2 `README.md`：视图切换一行补上"矩阵页与画布状态隔离"的说明

## 5.5 顺带修正（验证时发现）

- [x] 5.5.1 `useGraphSync.applyPositions`：只有坐标真的变了才算本机改动（开屏布局回存不该把图标脏，否则"离开提示"永远在弹）

## 6. 验证

- [x] 6.1 浏览器探针（无头 Edge + CDP，跑完即删）：矩阵页无「已选中节点」、状态条显示矩阵口径、顶栏画布控件隐藏；按 Delete/N/C/L/F/`/` 无反应且快照数不变；`Ctrl+S` 仍可另存；Esc 关详情；切回画布后选中为空且画布正常；切视图本身不写盘；开屏不脏 —— **27 项全绿**
- [x] 6.2 回归：`npx tsc -b`、`npm run lint`（仅 2 处既有警告）、`npm run build`、`check:code`（48）、`check:canvas`（✓）、`check:styles`（✓）、`check:graph`（13）、`check:store`（39）、`check:physics`（28）全绿
- [x] 6.3 `openspec validate graphify-matrix-view-isolation --strict` 通过并归档
