## Context

动机见 `proposal.md` 的 Why 与 `specs/` 下的能力契约，此处只记录塑造方案的现状与约束：

- **故障判定**：报错 `.../cytoscapeSetup.ts?t=1789647389791 does not provide an export named 'GraphRenderer'` 发生在 **ESM 链接期**；磁盘上该文件完整（`export class GraphRenderer` 在第 44 行）、导入路径正确、esbuild 转换结果正常、`npx tsc -b` / `npx eslint src scripts` / `npx vite build` 全绿，唯一异常标记是 URL 上的 `?t=` 热更新版本号 → 浏览器侧与运行中的开发服务持有陈旧模块。同类先例见 `docs/DIRECTORY.md` §7（`graphify-panel-resize-topic-restore`：进程内旧 zod schema 与磁盘源码不一致）。
- **兜底现状**：`index.html` 的 `#root` 是空 `div`，`main.tsx` 直接 `createRoot(...).render(...)`；`src/components/GraphCanvas.tsx:4` 静态导入 `GraphRenderer`，因此「入口脚本」与「界面」在同一条依赖链上——链接失败时没有任何 UI 代码可运行。
- **开发服务形态**：`server/index.mjs`（Express + Vite `middlewareMode`，`appType: 'spa'`，监听 5178），与 `vite build` 共用同一套 esbuild 转换管线。
- **两处既有缺陷的位置**：`src/graph/cytoscapeSetup.ts:390-397` 的还原分支只对节点做了 `removeStyle('display')`；`src/graph/layout.ts:92` 的 `runLayout` 未传 `eles`，cytoscape 默认把 `display:none` 的元素也纳入集合，fcose 在 `nodeDimensionsIncludeLabels: true` 下遇到被隐藏的复合容器会抛 `Cannot read properties of undefined (reading 'labelWidth')`（同一条已被 `docs/DIRECTORY.md` §7 记为「已知未改」）。
- 现有可复用写法：`runLocalLayout`（`layout.ts:117-123`）已经用 `eles.nodes().filter(node => node.visible())`，故从未踩到上述崩溃——本次把全图重排与可见性判定都对齐到这一口径，不新建模式。

## Goals / Non-Goals

**Goals:**

- 启动期失败（模块加载/链接）不再表现为无信息白屏，而是给出失败线索与恢复入口。
- 渲染期崩溃在界面内可见（含堆栈、复制、重新加载），不再白屏或半截界面。
- 全局未捕获错误与未处理拒绝可收敛为提示，且持续抛错不刷屏。
- 话题过滤切回不过滤视图后，关系可见性与节点结构一并还原且往返幂等。
- 全图重排只作用于可见元素；布局失败可见并保留现状、重新取景。
- 取景 / 命中测试 / 手柄定位统一用元素可见性判定。

**Non-Goals:**

- 不引入新依赖（不装错误上报 SDK、不装面板分割或状态库）。
- 不改动话题可见性规则（仅本话题成员、越界成员提升）与容器外观（分组不描边）这两项既有 Requirement。
- 不改图谱数据格式与读写接口，不追溯历史快照。
- 不做远程错误上报 / 监控接入，不引入离线 PWA 层。

## Decisions

### 1. 按「失败发生在哪一层」分工的三层兜底

| 失败层次 | 承接者 | 为什么 |
| :--- | :--- | :--- |
| 模块加载 / 链接期 | `index.html` 内的静态占位 + **非 module** 内联看门狗脚本 | 此时 `main.tsx` 整段不会执行，任何 React 侧兜底都无从生效 |
| React 渲染 / 副作用期 | `AppErrorBoundary`（`main.tsx:58` 包住 `App`，`Toaster` 留在外层） | 保住提示条自身可用，界面报错时仍能弹出提示 |
| 其它运行期（事件回调、异步） | `main.tsx:31-52` 的 `error` / `unhandledrejection` 收敛 | 这些错误不经过渲染路径，错误边界看不到 |

备选 A：只加错误边界——本次场景下无效（入口没执行）。备选 B：把看门狗写进 `main.tsx`——同样是「应用代码」，链接失败时也不会执行。

### 2. 用「挂载标记 + 占位存在性」判定，而不是「`#root` 是否有内容」

错误边界渲染出的诊断面板也在 `#root` 内，若以「有内容即视为启动成功」判定，会把「渲染期崩溃」误判成启动成功而漏报；反之以标记判定即可区分。`AppErrorBoundary` 在 `componentDidMount` 与 `componentDidCatch` 两处都调用 `markAppMounted()`（`AppErrorBoundary.tsx:13-18,41-50`），后者保证错误面板不被看门狗二次替换。`report()` 同时要求「占位仍存在」才动手（`index.html:83`），避免无占位可换时覆盖真实界面。

### 3. 时间参数：超时 10 s + 提前判定 800 ms / 1500 ms

- `index.html:58` `TIMEOUT = 10000`：保守上限，覆盖冷启动与首次依赖预打包。
- `index.html:147` 脚本元素 `error` 事件 → 800 ms 后判定（资源地址已知，不必干等超时）；`index.html:152` 运行期 `error` → 1500 ms 后判定。
- 因为 `report()` 在已挂载时是空操作，提前触发不会误报。

### 4. 全局错误用「固定 id + 冷却期 + 上限」限流

`main.tsx:16-17`：`REPORT_COOLDOWN = 8000`、`MAX_REPORT_KEYS = 12`；key 为「标题 + 摘要」截断 200 字符；冷却期内同 key 直接丢弃，超出上限清空计数重新开始。提示用固定 `id`（`runtime-error:<key>`），使同类错误只占一条提示位置而不是叠成一列。

备选：不做限流——一个自触发的错误循环会在几秒内刷满提示，反而掩盖首条关键信息。

### 5. 布局集合与 `runLocalLayout` 对齐，而不是调 fcose 选项

`layout.ts:96-98` 用 `cy.nodes().filter(node => node.visible())` 再 `union(nodes.edgesWith(nodes))`，与 `layout.ts:123` 的既有写法完全一致（DRY）。

备选：关掉 `nodeDimensionsIncludeLabels` 规避崩溃——会改变布局质量与既有视觉，且不解决根因；隐藏元素本就不该参与布局。

### 6. 布局失败经回调上报，不在渲染层直接提示

新增可选回调 `RendererHandlers.onLayoutError`（`cytoscapeSetup.ts:29`），`runLayout` / `runLocalLayout` 捕获异常后回调（`cytoscapeSetup.ts:325,486`），由 `GraphCanvas.tsx:113-121` 统一 toast（固定 `id: 'layout-error'`，文案含「已保留现有节点位置」）并 `renderer.fit()` 兜底取景。图渲染层不依赖 UI 文案，延续既有分层。

### 7. 可见性判定统一到 `element.visible()`

`fit()`（`cytoscapeSetup.ts:614`）、`renderedPosition`（`:633`）、`nodeAt`（`:651`）改用 cytoscape 的 `visible()`：它已包含「祖先容器被隐藏」语义，比只读自身 `style('display')` 更准，也与 `runLocalLayout` 口径一致。原写法在折叠 + 话题过滤叠加时会漏掉「节点自身可见但祖先被隐藏」的情形。

### 8. 关系还原与节点还原写在同一分支

`cytoscapeSetup.ts:395-401`：节点 `removeStyle('display')` 之后紧接 `cy.edges()` 同样还原。两组可见性在同一处维护，避免再次出现「只还原了一半」；当前主图为 0 边，属潜伏缺陷，一旦 `links[]` 恢复即会显形。

### 9. 陈旧状态用「重建」而不是热更新

恢复流程：结束 5178 上的 `node server/index.mjs` → 清理 `Graphify/node_modules/.vite` → 重新 `npm run dev` → 浏览器硬刷新。判定标准：控制台不再出现缺导出报错，且开发服务返回的模块确实带该导出。若重建后仍复现，则退一步按「dev 中间件下的真实转换失败」排查（此时 `vite build` 仍通过即可反证源码无问题）。

## Risks / Trade-offs

- **[看门狗误报]** 极慢的冷启动可能超过 10 s → 只在未打挂载标记时触发；真出现慢启动可调 `TIMEOUT`；面板自带刷新入口，代价是一次刷新。
- **[捕获阶段监听所有资源错误带来噪音]** 图片、图标等加载失败也会计入 → 冷却期 + 固定 id 收敛为一条，且提示里给出资源类型与地址，便于判断是否要紧。
- **[恢复文案在两处（`index.html` 与 `AppErrorBoundary.tsx`）]** → 两处措辞与 `docs/DIRECTORY.md` §7/§8 保持一致；步骤是「硬刷新 / 重启服务」这类稳定动作，变更频率低。
- **[布局集合缩小后隐藏分支的位置不更新]** → 展开时由既有局部重排补位（原本就是如此），不引入新行为。
- **[try/catch 可能掩盖真实回归]** → 失败并不静默：`onLayoutError` 会在界面上提示并保留原位置。
- **[不改数据与接口]** → 回滚只需还原前端文件，无数据侧回滚点需求。

## Migration Plan

1. 代码改动落地，跑通 `npx tsc -b`、`npx eslint src scripts`、`npx vite build`。
2. 一次性恢复动作：结束 5178 上的 `node server/index.mjs` → 清理 `Graphify/node_modules/.vite` → `npm run dev` → 硬刷新；确认控制台无缺导出报错、顶栏与画布出现。
3. 回归：话题 ↔ 全部往返（关系与结构恢复）、全部收起 / 全部展开 / 切换布局算法（不再静默失败）、人为制造一次模块加载失败（看到诊断面板而非白屏）。
4. 文档：`docs/DIRECTORY.md` §7 补记本次修复，并关闭该表中「已知未改」的 fcose 隐藏容器问题。
5. 归档：`openspec archive graphify-boot-fallback-renderer-hardening`。
