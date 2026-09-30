## Why

打开 `Graphify/` 工作台会**整页白屏**，控制台首条报错是 `The requested module '/src/graph/cytoscapeSetup.ts?t=…' does not provide an export named 'GraphRenderer'`。这是**启动期模块链接失败**：`main.tsx` 整段不会执行，`#root` 始终为空。而现有实现既无错误边界也无全局错误收敛，任何启动期失败都只能表现为「无信息白屏」，使用者无法判断该刷新、该重启服务，还是代码真的坏了（本次实测磁盘源码、类型检查与生产构建全部正常，问题只在运行中的开发服务的模块状态）。

同时暴露两处既有缺陷：① 话题过滤切回「全部」后，被隐藏的**关系**不会恢复（当前主图 0 条边，属潜伏缺陷，一旦 `links[]` 恢复立即显形）；② 全图重排把被隐藏的复合容器纳入布局集合，fcose 直接抛错导致整次布局**静默失败**（`docs/DIRECTORY.md` §7 已把该问题记为「已知未改」）。

## What Changes

- 新增**启动看门狗**：`index.html` 里放静态启动占位，并加一段**不依赖 ES module 的内联脚本**——应用在约定时间内没有被接管，或入口脚本加载失败时，把占位替换为诊断面板（失败说明、失败地址、恢复步骤、「重新加载」、「复制诊断信息」）。
- 新增 **React 错误边界**包住 `App`：渲染/副作用期抛错渲染同风格诊断面板（错误摘要、可展开堆栈、复制、重新加载），并在成功挂载后清除启动占位、打上挂载标记（看门狗据此避免误报）。
- `main.tsx` 注册全局 `error`（含捕获阶段的资源加载失败）与 `unhandledrejection`，收敛为统一提示，带**去重与限流**（同一消息冷却期内只提示一次、跟踪条数有上限），避免持续抛错刷屏。
- 话题视图：还原节点可见性时**一并还原关系**，使「话题 → 全部」往返后连线恢复，且往返幂等。
- 布局：全图重排**只把可见元素交给 fcose**（与既有局部重排同口径）；全图与局部重排都捕获失败并通过渲染器回调上报，由画布层提示并兜底取景，不再静默失败。
- 元素可见性判定统一为「cytoscape 可见性」语义（含祖先隐藏），用于取景、命中测试与浮层手柄定位。
- 把「结束开发服务 → 清理 `node_modules/.vite` 预打包缓存 → 重启 → 硬刷新」固化为诊断面板中给出的恢复步骤。

## Capabilities

### New Capabilities

- `graphify-runtime-resilience`: 应用启动期与运行期失败的可见化契约——启动失败不得表现为空白页、渲染期崩溃必须在界面内可读、全局未捕获错误必须收敛且不刷屏。
- `graphify-canvas-layout`: 画布布局与视口的元素可见性契约——布局只作用于可见元素、布局失败必须可见且不破坏现状、取景与命中测试按元素可见性判定。

### Modified Capabilities

- `graphify-topic-views`: 「非本话题关系一并隐藏」需要补齐反向保证——切回不过滤视图时被隐藏的关系必须恢复绘制，且反复切换保持幂等。

## Impact

- 前端改动：`Graphify/index.html`、`Graphify/src/main.tsx`、`Graphify/src/components/AppErrorBoundary.tsx`（新增）、`Graphify/src/components/GraphCanvas.tsx`、`Graphify/src/graph/cytoscapeSetup.ts`、`Graphify/src/graph/layout.ts`。
- 数据与接口：无变更（不改图谱数据格式、不新增接口、不引入新依赖）。
- 运维：需要一次「结束 dev 服务 → 清理 `Graphify/node_modules/.vite` → 重启 → 硬刷新」的恢复动作；此后同类失败由诊断面板自行说明，不再需要靠猜。
- 文档：`docs/DIRECTORY.md` §7 变更记录补记本次修复，并关闭该表里「已知未改」的 fcose 隐藏容器问题。
