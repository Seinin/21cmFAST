## 1. 规划产物

- [x] 1.1 产出 `proposal.md`（新增能力 `graphify-light-theme` + 两个修改能力）
- [x] 1.2 产出三份 delta spec（`graphify-light-theme` 含 Purpose；`graphify-canvas-appearance` 浅色配色与标签可读性；`graphify-canvas-layout` 取景与滚轮）
- [x] 1.3 产出 `design.md`
- [x] 1.4 `openspec validate graphify-light-theme-label-legibility` 通过

## 2. 浅色主题变量与基础样式

- [x] 2.1 `src/index.css` 的 `:root` 换为浅色值，变量名不变
- [x] 2.2 `.glass-panel`、`::before`、`.hairline` 改浅色写法
- [x] 2.3 `.canvas-grid` 改近白底 + 浅灰点阵；滚动条改浅灰；`::selection` 保持主色低透明
- [x] 2.4 `tailwind.config.js`：`boxShadow.panel/raised` 改柔和投影、`panel-sheen` 改白色高光、`brand-sheen` 加深起点

## 3. 组件层样式改写

- [x] 3.1 由 code-explorer 产出「文件 → 行 → 现写法 → 目标写法」清单（约 25 文件、约 60 处）
- [x] 3.2 按清单改写深色专用 alpha 写法（描边/分隔线、浅层底、`text-white`、kbd 底）
- [x] 3.3 白底上重做对比度：顶栏与状态条、左右面板、各弹层、阅读抽屉、画布浮层按钮与图例
- [x] 3.4 `rg` 复检无深色残留；保住 `ContextMenu` 的 `fixed z-[80]` 与「画布根容器不加 `isolate`」

## 4. 画布配色单一来源

- [x] 4.1 新建 `src/graph/palette.ts` 导出画布配色与语义关系类型色
- [x] 4.2 `src/graph/styles.ts` 引用 palette：标签深色前景 + 浅色描边、连线灰度重定、选中/高亮/吸附提对比
- [x] 4.3 `src/lib/types.ts` 的 `NODE_TYPE_COLORS` 加深一档
- [x] 4.4 `CanvasOverlays.tsx` 图例引用 palette，与画布渲染一致

## 5. 标签清晰度与按需省略

- [x] 5.1 `zoom` 处理按 `LABEL_SCREEN_PX / zoom` 写标签字体（夹紧上下限）并同步 `text-max-width`，`.branch` 共用同一字号
- [x] 5.2 新建 `src/graph/labels.ts`：贪心非重叠筛选（优先级 + 测量缓存 + 网格哈希 + 上限）
- [x] 5.3 应用省略结果（`.label-off` 走 `text-opacity: 0`）；悬停/选中标签必显示
- [x] 5.4 重算时机：`zoom`、`layoutstop`、展开/收起、话题切换、悬停/选中变化，rAF 合并

## 6. 取景与滚轮

- [x] 6.1 `GraphRenderer.fit` 改按 `boundingBox({ includeLabels: true })` 计算 zoom/pan，含夹紧与空集合兜底
- [x] 6.2 `src/graph/layout.ts` 各布局改 `fit: false` + 停后 label-aware 取景（打开/切换/显式重排/失败兜底）；展开收起保持不跳视口
- [x] 6.3 `wheelSensitivity` 由 `0.6` 改为 `1.5`，保留 `minZoom 0.12 / maxZoom 3.4` 并更新注释

## 7. 验证与收尾

- [x] 7.1 `npx tsc -b`、`npx eslint src scripts`、`npm run build` 全绿
- [x] 7.2 `openspec validate graphify-light-theme-label-legibility` 与 `openspec validate --specs` 通过
- [ ] 7.3 目视回归（待用户确认）：已自动验证的部分为 `fit` 取景含标签的调用路径、`labels.ts` 贪心筛选的纯函数用例（不重叠/优先级/悬停必显/上限/稳定序）与 headless cytoscape 端到端（字号写入、候选矩形随坐标散开、稀疏 25/25 与 zoom 0.4 时 20/25、保留标签零重叠）；仍需人眼确认的是浅色对比度、标签清晰度与滚轮手感
- [x] 7.4 同步 delta spec 进主 spec 并归档 change

---

> **归档说明（2026-09-19）**：本 change 以 **26/27 tasks** 归档，唯一未完成项为 **7.3 目视回归**（浅色对比度 / 标签清晰度 / 滚轮手感属主观观感，需人眼在浏览器中确认）。
> 已自动验证的部分：`tsc -b`、`eslint src scripts`、`build` 全绿；`openspec validate --specs` 11/11 通过；`src/graph/labels.ts` 纯函数用例（不重叠 / 优先级 / 悬停必显 / 上限 / 稳定序）；headless cytoscape 端到端（字号写入、候选矩形随坐标散开、稀疏 25/25 与 zoom 0.4 时 20/25、保留标签零重叠）。复现命令：`cd Graphify && node graphify-smoke.mjs`。
> delta spec 已按 `--skip-specs` 前置手动同步：`openspec/specs/graphify-light-theme/spec.md`（新建，4 条要求）、`graphify-canvas-appearance`（+3 条）、`graphify-canvas-layout`（+2 条）。
