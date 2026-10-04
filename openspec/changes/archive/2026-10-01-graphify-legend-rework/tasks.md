## 1. 线型 → 图例条目的单一来源

- [x] 1.1 `Graphify/src/graph/palette.ts`：增 `EdgeStyleId` 与 `EDGE_STYLE_LEGEND`（线型 id → 标签 / 色值（引用既有常量）/ 线型提示），色值不得另写 hex；验证：`npx tsc -b` 无输出
- [x] 1.2 `Graphify/src/graph/cytoscapeSetup.ts`：`GraphRenderer` 增只读 `presentEdgeStyles(): EdgeStyleId[]`（只数此刻可见的边，按类名与属性归类去重）；验证：`npm run check:canvas` 新增断言通过

## 2. 图例改成派生 + 底部收起

- [x] 2.1 `Graphify/src/components/CanvasOverlays.tsx`：`GraphLegend` 改成「收起入口 + 上铺浮层」，条目 = 传入的节点种类 + 线型 id，样例按 `EDGE_STYLE_LEGEND` 画，没有线型时不渲染那一段；验证：`npx eslint src/components/CanvasOverlays.tsx` 无新增告警
- [x] 2.2 `Graphify/src/components/GraphCanvas.tsx`：浮层从右上角搬到左下角、与右上角那列分开；加 `legendOpen` 展开态；在既有刷新时机取 `presentEdgeStyles()`；空白回调里一并收起；验证：`npx eslint src/components/GraphCanvas.tsx` 无新增告警
- [x] 2.3 两页的图例条目由断言守住：`check:canvas` 的「画布页图例只报真画出来的线型（`flow,conditional`）」「画布页不列本页没有的档」「关掉回流那条消失 / 打开回来」四条；物理链页主序一档的叫法经 `legendEdgeLabels` 传入（`同一红移内的数据流`），与「跨红移回流」并排

## 3. 门禁

- [x] 3.1 `Graphify/scripts/check-canvas.mjs`：断言真实 `data/graph.json` 上 `presentEdgeStyles()` 只返回本页真画的那几档，且 `EDGE_STYLE_LEGEND` 每一档的色值都能在样式表里找到同色规则；验证：`npm run check:canvas` 全绿

## 4. 规格与文档

- [x] 4.1 `openspec validate graphify-legend-rework --strict` 通过
- [x] 4.2 文档记账：`docs/notes/graphify/G0-绘制规范.md`、`docs/notes/graphify/G4-物理链.md` 各补一句图例口径，`docs/DIRECTORY.md` 变更表补一条；验证：`npm run check:copy` 通过

## 5. 自检

- [x] 5.1 `npx tsc -b`、`npx eslint`（改动文件）、`npm run check:copy`、`npm run check:styles`、`npm run check:canvas`、`npm run check:chain` 全绿
