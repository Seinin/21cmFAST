## Why

画布右上的图例写在两个页面共用的模板里，列的是知识图谱那套关系名（依赖 / 相关 / 源自 / 引用）：画布页实际只画「依赖 / 源自」两种，物理链页一条都不是（那张图画的是主序、跨层捷径、跨红移回流、条件虚线、对外输入）。颜色与线型也跟 `styles.ts` 的实际渲染对不上——相斥在画布上是琥珀点线，图例里画成灰实线；跨红移回流根本没有条目。同时它常驻右上角、压在缩放条与跨红移反馈开关下面，节点种类一多就换行成大块，挡住画布本身。

## What Changes

- **图例条目改为从画布实际渲染的边元素派生**：新增一档「线型」表（色值取自 `palette.ts` 里 `styles.ts` 同用的那些常量，样式表与图例不再各写一套），渲染器报出当前视图实际出现的线型，图例只列这些；节点种类照旧只列实际出现的。
- 物理链页因此获得「跨红移回流」（与「同一红移内的数据流」相对照）、「跨层捷径」、「对外输入」与「条件 / 可选」的图例条目；画布页只列它真画的那几条，不再出现「相关 / 引用」这类本页没有的条目。
- 图例从右上角移到**画布左下角**，默认**收起**成一枚「图例」按钮；点开时在按钮**上方**铺出浮层（不越过画布下边界），再点按钮或点画布空白即收起——与「点空白回到什么都没点亮」共用同一条手势。
- 展开态是纯视图状态：MUST NOT 改动图谱数据、MUST NOT 让图谱变脏，切页与切标签页都回到收起。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `graphify-canvas-appearance`: 图例的条目取舍由"与画布渲染一致（颜色 / 线型）"扩到**只列当前页真画了的种类与线型**，并新增位置（画布底部）与默认收起（点开 / 点空白收起）的口径。

## Impact

- 前端：`Graphify/src/components/CanvasOverlays.tsx`（`GraphLegend` 重写）、`Graphify/src/components/GraphCanvas.tsx`（浮层位置、展开态、空白点击收起）、`Graphify/src/graph/palette.ts`（线型 → 色值 / 标签的单一来源表）、`Graphify/src/graph/cytoscapeSetup.ts`（报出当前实际出现的线型）。
- 门禁：`Graphify/scripts/check-canvas.mjs`（图例条目集合与画布线型的断言）。
- 文档：`docs/notes/graphify/G0-绘制规范.md`、`docs/notes/graphify/G4-物理链.md`、`docs/DIRECTORY.md` 变更表。
- 数据与生成物不动：图例只读渲染结果，不写任何文件。
- 与既有规格的关系：`graphify-physics-chain` 的「反向箭头有自己的样式 → 图例写明两者的区别」由此落实，该能力的需求文字不变，因此不出一份 delta；`graphify-tree-layout`（未实施）里那条"图例含层级连线"的口径不受影响——层级连线真画出来时，本机制会自动把它列上。
