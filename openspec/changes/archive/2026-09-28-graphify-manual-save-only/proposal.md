# graphify-manual-save-only

## Why

前端现在把整张图按 650ms 去抖自动 PUT 回工作文件：任何本机改动（拖拽坐标、属性编辑触发的标脏）都会自动覆盖 `data/graph.json`，撤销/重做也会立即整图落盘。这条通道已经造成过真实事故——服务端护栏的注释里记着"迁移好的 70 节点图谱被一个仍持有 24 节点旧数据的页面在 45 秒内连写 6 次、整份迁移凭空消失"。用户的要求是把写入权力收回：**取消自动保存覆盖，改成只能手动**，而且**手动保存的语义是另存为一份副本，不是覆盖工作文件**。

## What Changes

- **BREAKING（前端保存语义）**：取消整图自动保存（650ms 去抖）与撤销/重做的自动落盘；保存按钮与 `Ctrl/Cmd + S` 改为 **另存为一份保留副本**。
- **BREAKING（坐标持久化）**：拖拽节点坐标、整理布局不再自动落盘，只标记"有未保存改动"；保存时先把这些**只存在于本机**的坐标**批量**写回工作文件（一次写盘 = 一份快照），再另存副本。
- 新增：**保留副本**——写进 `data/history/`、文件内标记保留、**不参与 50 份轮转**、历史面板可见可回滚、可单独删除。
- 新增：存在未保存改动时，关闭/刷新页面先弹浏览器原生确认。
- 新增：重命名的增量写入通道（此前它借用整图 PUT）。
- 修改：顶栏/状态条/帮助/历史面板文案与徽标；`README.md` 与 `docs/DESIGN.md` 同步。
- 不变：结构性操作（新建/删除节点、建立/取消关系、改属性、标签增删）仍是"点了才发生"，仍即时写服务端并各自留快照；`PUT /api/graph` 端点保留给命令行脚本（`scan-param-tags.mjs` 等仍在使用），只是前端不再调用它。

## Capabilities

### New Capabilities

- `graphify-graph-persistence`：图谱的持久化权力边界——保存即另存保留副本、工作文件不被整图覆盖、本机未落盘改动的可见性与离开拦截、撤销只作用于本机会话、保留副本不参与轮转且可单独删除。

### Modified Capabilities

- `graphify-canvas-layout`：`默认使用内置层级布局` 下"打开时按当前布局重排一次"的场景写着"重排后的坐标被回写保存"，与"不再自动落盘"冲突，改为"重排结果作为本机未保存改动、随手动保存写入工作文件"。
- `graphify-topic-views`：`隐藏关系是本地记忆的视图状态` 用"不触发自动保存"表述；自动保存取消后该词失指，改为"不触发任何写盘（既不写工作文件也不产生快照）"。

## Impact

- 前端：`src/hooks/useGraphSync.ts`（删自动保存、保存改两步）、`src/state/graphStore.ts`（待写坐标集合、撤销置脏）、`src/api/client.ts`、新增 `src/hooks/useUnsavedWarning.ts`、`src/App.tsx`、`TopBar` / `StatusBar` / `HelpDialog` / `HistoryPanel`。
- 服务端：`server/lib/store.mjs`（保留副本 + 轮转跳过 + 列表回传）、`server/lib/paths.mjs`（数据目录可覆盖，供断言脚本用临时目录）、`server/routes/graph.mjs`（批量坐标、另存、删副本、重命名四个端点；更新整图 PUT 的注释）。
- 脚本：新增 `scripts/check-store.mjs` 与 `npm run check:store`。
- 文档：`README.md`、`docs/DESIGN.md`。无新增依赖，无数据迁移（旧快照与工作文件照旧可用）。
