## Context

见 `proposal.md` 的 Why。实现层面的现状约束（均已核实）：

- 主题现状：`Graphify/src/index.css` 的 `:root` 定义一整套深色 HSL 变量（`--background: 228 26% 6%` 等），`tailwind.config.js` 把语义色映射到这些变量（`darkMode: ['class']`，但组件层没有 `dark:` 分支）。另有约 60 处深色专用的 alpha 写法（`bg-white/[0.06]`、`border-white/[0.07]`、`text-white`、`bg-black/40`、`ring-white/10`）分布在约 25 个文件，以及 `.glass-panel` / `.canvas-grid` / `.hairline` / 滚动条 / `boxShadow` / `panel-sheen` / `brand-sheen` 中的深色专用硬编码。
- 画布现状：`src/graph/styles.ts` 硬编码画布配色（标签 `#E6E8EF`、`text-outline-color '#0B0D12'`、连线 `#3A4252`、层级连线 `#2A3140`），`CanvasOverlays.tsx` 的图例又各自硬编码一份同类色值；`NODE_TYPE_COLORS`（`src/lib/types.ts`）的 8 个类型色是为深底挑选的浅亮色。
- 标签现状：`font-size: 11` 是**模型坐标**字号，缩小时被按 zoom 降采样后栅格化（发虚的根因）；`cy.on('zoom')` 只做 `edges().toggleClass('labels-on', zoom > 1.05)` 与回调上报。
- 取景现状：`GraphRenderer.fit(padding = 80)` 用 `cy.fit(visible, padding)`（不含标签包围盒）；布局配置 `src/graph/layout.ts` 各布局带 `fit: true`（cytoscape 自带 fit，同样不含标签）。
- 既有约束（不得回归）：展开/收起后重排 `fit: false` + 锚点钉回原屏幕位置；重新取景只允许出现在打开图谱、切换布局、显式重排/取景、布局失败兜底；画布根容器不得加 `isolate`（否则 `ContextMenu` 的 `fixed z-[80]` 会被详情面板盖住）；层级布局只能用 cytoscape 内置实现。

## Goals / Non-Goals

**Goals**

- 一套浅色主题变量驱动全应用（背景、面板、顶栏/状态条、弹层、阅读抽屉、画布、画布浮层），组件层不再各自决定深浅。
- 画布配色收敛到单一来源，图例与画布渲染不再各写一套色值。
- 标签在任何缩放下保持约 12px 的屏幕字号，并能在密集时按优先级省略、悬停/选中必显示。
- 打开图谱（含刷新）与显式重排/取景时，默认视角把全部可见节点及其标签纳入画布。

**Non-Goals**

- 不做深色/浅色主题切换（用户已选单一浅色主题）；不新增依赖。
- 不改 `+/-` 缩放按钮的加性步长 `0.25`（本次只提速滚轮），不改缩放上下限 `minZoom 0.12 / maxZoom 3.4`。
- 不改节点上限、展开/收起语义、话题过滤语义、`/api/*` 契约与存档结构。
- 不做标签的 DOM 覆盖层渲染（见 Decision 3 的备选方案）。

## Decisions

### 1. 主题源：只换 `:root` 变量值，变量名与语义映射保持不变

`index.css` 的 `:root` 换成浅色值（`--background: 0 0% 100%`、`--panel: 210 20% 99%`、`--foreground: 224 30% 12%`、`--muted-foreground: 220 12% 42%`、`--border: 220 16% 90%`、`--primary` 保持靛蓝族等），`tailwind.config.js` 的语义色映射、`fontSize` 与 `darkMode: ['class']` 一行不动。这样组件层所有 `bg-panel` / `text-muted-foreground` / `border-border` 自动跟随，避免大范围重写与遗漏。

**备选**：把语义色直接写成十六进制常量 —— 否，会丢掉「单一主题源」并让渐变/叠加难以复算透明度。

深色专用的 alpha 写法按语义统一替换（不改结构，只改色）：

| 现写法 | 目标写法 | 语义 |
| --- | --- | --- |
| `border-white/[0.07]` 等 | `border-black/[0.06]`～`border-black/10` | 描边/分隔线 |
| `bg-white/[0.05]` 等浅层底 | `bg-black/[0.03]`～`bg-black/[0.06]`，或 `bg-muted` / `bg-accent` | 次级底、悬停底 |
| `text-white` | `text-foreground`（在彩色底上则 `text-primary-foreground`） | 文字 |
| `bg-black/40`（遮罩、kbd 底） | 遮罩保持低透明黑；kbd 底改 `bg-black/[0.06]` | 遮罩/键帽 |
| `ring-white/10` | `ring-black/10` | 聚焦/内描边 |

`.glass-panel` → `border-black/[0.06] bg-white/75 shadow-panel backdrop-blur-xl` + 顶部白色高光渐变；`.glass-panel::before` 的高光改低透明黑或改白色低透明描边；`.canvas-grid` 由 `hsl(228 30% 5%)` 改为近白底（`hsl(0 0% 100%)` 起底）配浅灰点阵（`hsl(226 20% 88%)` 点）+ 极淡主色径向光；滚动条改 `hsl(220 14% 78%)` / hover `hsl(220 14% 68%)`；`boxShadow.panel/raised` 改低饱和柔和投影（`hsl(228 40% 24% / 0.14~0.18)`）；`panel-sheen` 改白色高光；`brand-sheen` 把起点加深（如 `hsl(243 75% 56%)`）以保证白字在白底按钮渐变上的对比。

### 2. 画布配色抽取 `src/graph/palette.ts`

导出 `canvasPalette`（标签前景、标签描边、语义连线默认色、层级连线色、选中色、邻居高亮色、连线吸附色、画布底/网格点色）与语义关系类型色映射，`styles.ts` 与 `CanvasOverlays.tsx` 的图例共同引用，消除两份硬编码。`NODE_TYPE_COLORS` 整体加深一档（concept `#4F46E5`、method `#7C3AED`、doc `#0891B2`、dataset `#0284C7`、result `#16A34A`、question `#D97706`、tool `#DB2777`、section `#64748B`），填充保持低透明度 + 实描边，标签改深色前景 + 浅色描边。

**备选**：只把类型色加深、其余色值原地各改一份 —— 否，图例与画布会继续漂移。

### 3. 标签清晰度：按 zoom 反算模型字号，恒定屏幕字号

`zoom` 处理里写 `font-size = clamp(LABEL_SCREEN_PX / zoom, MIN, MAX)`（`LABEL_SCREEN_PX ≈ 12`），`text-max-width = LABEL_MAX_WIDTH_PX / zoom + 'px'` 同步缩放，使屏幕上的字号与折行宽度基本恒定，栅格化接近 1:1，从而清晰且不回退为「缩小时变小到看不清」。`LABEL_SCREEN_PX / zoom` 与 `.branch` 的「名称 · N」共用同一字号。

**备选**：DOM 覆盖层渲染标签 —— 否，等于重做浮层定位、命中测试与既有 `labels-on` 约定，回归面过大。

### 4. 标签按需省略：渲染坐标下的贪心非重叠筛选

新建 `src/graph/labels.ts`：给定「可见节点 + 当前 zoom + 必显集合（悬停/选中）」返回「应显示标签的节点集合」。

- 优先级：悬停/选中 > 带未展开子节点的分支节点（虚线 + `· N` 标记，信息量最高）> 度数高 > 层级浅 > id 稳定序（保证同一状态下结果可复现，不随遍历顺序抖动）。
- 用离屏 canvas 的 `measureText` 估算标签尺寸（字体与画布一致，按「字符串 + 最大宽度」缓存），标签矩形按「节点渲染位置 + 节点渲染尺寸 + `text-valign: bottom` 的偏移」推算，在渲染坐标下做非重叠判定；用网格哈希把相交测试降到近似线性，并对标签数设上限。
- 应用方式沿用既有 `.labels-on` 约定：给被省略的节点加 `.label-off`（`text-opacity: 0`），不写 `data`、不做逐元素 `style()` 覆盖，避免污染数据与存档。
- 触发时机：`zoom`、`layoutstop`、展开/收起、话题切换后重算，用 `requestAnimationFrame` 合并（与边标签阈值合并进同一个 zoom 处理函数），避免一次缩放多次全量遍历与闪烁；悬停/选中变化时立即重算以保证「必显示」。

### 5. 取景纳入标签，并统一「允许取景」的四处调用

- `GraphRenderer.fit(padding = 80)` 改为：取可见元素的 `boundingBox({ includeLabels: true })`，按 `w/(box.w+2p)`、`h/(box.h+2p)` 求 zoom 并夹到 `[minZoom, maxZoom]`，再 `viewport()` 把包围盒中心对齐画布中心；空集合与零尺寸包围盒（单节点）走兜底分支，避免 NaN。
- `layout.ts` 各布局的 `fit: true` 改为 `fit: false`，由调用方在 `layoutstop` 后调 `renderer.fit()`（label-aware），使「打开、切换布局、显式重排、失败兜底」四处取景都包含标签；展开/收起路径保持 `fit: false` + 锚点钉回，不触发取景。
- 由于标签屏幕字号恒定，标签的屏幕包围盒近似与 zoom 无关，一次取景即可稳定，不需要「取景 → 字号变化 → 再取景」的迭代。

### 6. 滚轮灵敏度

`wheelSensitivity: 0.6 → 1.5`（cytoscape 默认 1），保留 `minZoom 0.12 / maxZoom 3.4` 与 `zoom(delta)` 加性步长不变；在配置处更新注释记录这次调参。

## Risks / Trade-offs

- [浅色底对比度不足，尤其类型色与半透明底徽标] → 类型色加深一档 + 统一 `border-black/[0.06]`~`border-black/10`；逐个面板目视回归。
- [约 60 处硬编码漏改，留下深色残留] → 先由 code-explorer 产出「文件→行→现写法→目标写法」清单再改；改完用 `rg` 复检 `bg-white/`、`border-white/`、`text-white`、`bg-black/` 等模式确认无残留（保 `ContextMenu` 的 `fixed z-[80]`、画布根容器不加 `isolate`）。
- [恒定屏幕字号后，放大时文字相对节点显小] → 这是「字始终看得清」的直接代价，符合 spec；不额外补偿。
- [省略算法在大图上的开销] → 测量缓存 + 网格哈希 + 标签数上限 + rAF 合并；只对可见节点计算。
- [被省略标签用 `text-opacity: 0` 仍参与 `includeLabels` 包围盒，取景略保守] → 接受：取景更稳定，且不出现「取景后标签又被显示出来溢出画布」。
- [取景改动可能破坏「展开/收起不跳视口」] → 取景只保留在既有四处调用点；展开/收起路径不改；按 spec 场景逐条目视验证。
- [白色主题下浮层按钮（展开键、连线手柄）失去对比] → 这两个按钮改用浅底 + 深色文字 + 彩色描边的高对比写法，并复检夹紧在画布内的既有行为。

## Migration Plan

前端纯样式与渲染逻辑改动，无数据迁移、无接口变更：改动落地后 `npx tsc -b`、`npx eslint src scripts`、`npm run build` 全绿，`openspec validate --specs` 通过，重启 `npm run dev`（http://localhost:5178/ ）逐项目视回归。回滚即 revert 提交；存档坐标与 localStorage 不受影响（取景不写坐标）。

## Open Questions

- 无（`+/-` 按钮步长是否改乘性留待后续手感反馈，本次为非目标，不阻塞实现）。
