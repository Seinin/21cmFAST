## Why

物理链页一级现在是「12 个块沿一列竖排 + 悬浮才显现的箭头」：**顺序只能逐个悬浮去读**，而箭头同时承担「顺序」与「数据流」两件事。之所以不直接画线，是因为要让箭头互不打架——于是引入了「到终点的最长路径」分层模型（骨干树 + 跨层成因）。这套模型是**没有布线手段时的替代品**，它把每条依赖硬塞进一个层号，代价已经在两处显形：① 没有下游的量一律落在第 0 层，于是「深节点喂叶子」被报成「跨 9 层、缺中间量」（`perturb_field → perturb_velocity`）；② 可达性只从同一个源出发看，上一轮删掉一条假边就凭空多出 5 条「缺中间量」（名单由 8 涨到 13）。

既然一级的先后由**摆放**表达、跨步依赖由悬浮箭头表达，「深度」就不再是必需品。

线型与关系类型这一层同时积了债：非实线有 **四种**（`dotted` 1.3px 在取景缩放下退化成淡实线、引擎内建 `dashed` 两档共用导致「相关」与「条件」肉眼无法区分、只有跨红移那档写了 `line-dash-pattern`），且**图例样例的节奏与画布实际渲染不一致**；关系类型里 `relates_to` / `contradicts` / `undirected` 在数据里**各 0 条**（建库时预留、从未使用，图例自上一轮起也不再显示它们）。

## What Changes

- **一级改为「三段 + 段内横排按执行序」**：预备（一次性）/ 逐红移循环 / 收尾三段竖摞；段内块按 `order`（红移内执行序）**横向**排列。顺序由**摆放**承担，MUST NOT 再靠连线表达。**BREAKING**：`order` 语义由「纵向位次」改为「段内横向位次」。
- **撤掉「下一步」连线**：一级静息只有块；不做相邻步直连线，也不引入脊轨或步序刻度。
- **分层模型整体退场**：删 `crossLevel`（`levels` / `backbone` / `parentOf` / `sibling` / `coarse` / `bypass` / `gap` / `stats`）与边上的 `levelSpan` / `spanKind`；`CROSS_LINK_COLOR` 与「跨层捷径」这一档一并删除。自检那整节「分层：骨干树 + 跨层成因」及其十余条断言删除，不另立替代（块行横序另有一条）。
- **线型收敛到两种**：**实线 = 产物交付**（块间接口、块内边；「对外输入」是它的细灰弱化版），**稀疏虚线 = 跨红移回流**。**BREAKING**：`dotted` 与 `long-dash` 退场；所有虚线 MUST 显式写 `line-dash-pattern` 且首项 ≥ 8（0.5× 取景下仍可辨），虚线线宽提到 1.7–1.8。虚线节奏与线宽不再由引擎缺省决定。
- **「条件 / 可选」不再用线型**：门控改由**线上的开关框**表达，线型随所属那一档。**BREAKING**：现行「虚线 = 条件 / 可选」这条规矩改写为「虚线 = 跨轮」。
- **关系类型枚举删到两种**：删 `relates_to` / `contradicts` / `undirected`，只留 `depends_on` / `derives_from`（外加 `conditional` 修饰）。**BREAKING**：`data/graph.json` 的 schema 与新建边的类型下拉随之收窄。
- **图例**：档位由 8 收敛到 4（交付 / 跨移回流 / 对外输入 / 条件）；样例线段要能画**线上挂框**，线型随所属那一档；新增断言把「图例节奏 = 样式表节奏」「样式表不出现 `dotted`」钉死。

## Capabilities

### New Capabilities

（无——本次是在既有能力上改变行为。）

### Modified Capabilities

- `graphify-physics-chain`：一级摆位口径（三段 + 段内横排按执行序）、撤掉「下一步」线、分层/骨干/成因模型退场、子图成员按块内拓扑序排布。
- `graphify-canvas-appearance`：线型收敛为实线与稀疏虚线两种、撤 `dotted` 与跨层捷径档、虚线的节奏与线宽下限、「条件 / 可选」改由开关框表达、图例档位与节奏口径。
- `graphify-graph-annotations`：「可选支路必须在节点与关系上标注」里「以虚线区分条件 / 可选」的**呈现口径**改写为开关框（字段与校验不变）。

## Impact

- 真源与产物：`docs/notes/physics-chain/chain.json`（边字段）、`Graphify/src/generated/physics-chain.json`（删 `crossLevel`，增红移内步序）、`Graphify/scripts/build-physics-chain.mjs`（段内横排坐标、删分层）、`Graphify/scripts/check-physics-chain.mjs`（删一整节 + 「块行 x 升序 = 主循环调用序」）。
- 外观：`Graphify/src/graph/palette.ts`、`Graphify/src/graph/styles.ts`、`Graphify/src/components/CanvasOverlays.tsx`（图例样例与挂框）。
- 数据 schema 与编写面：`Graphify/src/lib/types.ts`（关系类型联合、`EdgeStyleId`、删 `backbone` / `levelSpan` / `spanKind`）、`Graphify/src/components/EntityDialogs.tsx`（新建边的类型下拉）、`Graphify/data/graph.json`、`Graphify/scripts/check-canvas.mjs` / `check-styles.mjs` / `check-graph.mjs` 的相应断言。
- 文档：`docs/notes/graphify/G0-绘制规范.md`（虚线语义整句改写）、`docs/notes/graphify/G4-物理链.md`（摆位、图例、§七 第 10 条）、`docs/DIRECTORY.md`。
- **不改**：`src/py21cmfast/**`（本 change 不碰仿真代码）；画布页已有 51 条边的内容（只收窄关系类型枚举，不改任何一条边）。
