## Why

Graphify 工作台的左右两栏是写死的固定宽度（左 `w-[312px]`、右 `w-[326px]`，均 `shrink-0 overflow-hidden`），长文档标题、章节名与详情字段只能被 `truncate` 硬截断，用户无法按需放宽；markdown 阅读抽屉的目录与正文右缘还被 Radix `ScrollArea.Viewport` 内层的 `display:table` 包裹盒裁掉一截，文字看不全。同时顶栏的「话题」下拉整个消失：磁盘 `data/graph.json` 里 `meta.topics` 与全部 `node.topics` 均为空，而草案 `data/nion-draft.json` 数据完好——时间线显示 dev 服务进程（PID 1066，启动 10:26:35）早于 `server/lib/schema.mjs` 加入话题字段（13:51:04）启动，其内存中仍是旧 zod schema；14:22 那次经前端 `POST /graph/import` 的写入被旧 schema 按 zod 默认 strip 行为静默丢弃，落盘即成 0 个话题。

## What Changes

- **左右栏可拉伸**：左侧「notes 数据库」与右侧「节点详情」各加一条竖直拖拽手柄，支持鼠标拖拽、键盘 ←/→ 微调（Shift 加速）、Home/End 到极限、双击复位默认宽度；拖到最小宽度以下自动收起为细条，细条上有一键恢复按钮。
- **画布保底宽度**：图表区域始终保留最小可用宽度，两栏拉到极限时画布不被压没；宽度上限按「容器宽 − 另一栏当前宽 − 画布最小宽」夹紧。
- **宽度记忆**：每个面板的宽度写入浏览器本地存储（独立命名空间、损坏即回退默认），刷新或重开保持；该宽度属纯界面视图状态，**不进入撤销栈、不写入图谱数据**。
- **抽屉右侧不再被遮挡**：覆盖 Radix `ScrollArea.Viewport` 内层包裹盒的 `display:table` 裁切行为，补齐 `min-w-0` 让截断生效、正文 `break-words`，超宽内容（代码块/公式/表格）在自身容器内横向滚动，并为纵向滚动条留出内边距。
- **恢复话题功能**：重启持有旧 schema 的 dev 服务进程，用生成器重建草案并重新导入，令磁盘恢复 `meta.topics`（3 个话题）与全部节点的归属，顶栏话题下拉重新可用。
- **导入链路加固**：`scripts/import-graph.mjs` 写完盘后回读比对关键字段指纹（话题数、节点话题总数、节点数、引用数），不一致时报错并以非零码退出，提示「服务端 schema 可能比源码旧，请重启 dev 服务」，杜绝再次静默丢字段；补 `--verify`/`--no-verify` 开关。

## Capabilities

### New Capabilities

- `graphify-panel-layout`: 工作台三列布局的面板尺寸行为——左右栏可拖拽/键盘调宽、越界自动收起与恢复、宽度本地记忆、画布最小宽度保护，以及 markdown 阅读抽屉的内容溢出与滚动表现。

### Modified Capabilities

- `graphify-tree-authoring`: 新增「导入写盘后回读校验」要求——导入工具在写入落盘文件后必须回读并比对关键字段，发现字段静默丢失必须报错退出而非静默成功。
- `graphify-topic-views`: 新增「话题归属持久化不丢」要求——话题注册表与节点话题归属必须完整落盘并可经读接口原样返回，读接口 MUST NOT 因服务端 schema 落后于源码而剥离这些字段。

## Impact

- 前端：`src/App.tsx`（三列 flex 布局与手柄接入）、`src/components/MdLibraryPanel.tsx`、`src/components/Inspector.tsx`、`src/components/GraphCanvas.tsx`、`src/components/MdReaderDrawer.tsx`、`src/components/ui/scroll-area.tsx`、`src/index.css`；新增 `src/hooks/usePanelWidth.ts`、`src/components/ResizeHandle.tsx`。
- 脚本/服务端：`scripts/import-graph.mjs`（写后校验）；运行中的 `server/index.mjs` 进程需重启以加载含话题字段的 schema。
- 数据：`data/graph.json` 需重新导入以恢复话题字段；历史快照同样缺失话题，不做回改。
- 依赖：无新增第三方依赖（拖拽用原生 Pointer Events 手写）。
- 文档：`docs/DIRECTORY.md` §7 变更记录与 §8.1 图谱说明。
