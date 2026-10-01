## Why

图谱现在的读法是「层带堆叠 + 带内横排 + 追箭头」：59 条语义边全部带三角箭头（`depends_on` 35 / `derives_from` 24），其中 51 条落在同一条层带内部，单个子图里的箭头甚至比主图更密（S09 26 条、入口 B 15 条）。而「谁是谁的细分」这层结构本来已经由**无箭头、低权重**的层级连线表达（`graphify-canvas-appearance` 的「层级连线」需求）——两套线条叠在同一张画布上，就是「箭头太多太杂」。

要的是把结构交给**排布**：主图用自顶向下的多叉树表达**逻辑顺序**（①→⑤ 的先后），子图用自顶向下的多叉树表达**概念与子概念**。排布本身说清了层级，就不必再用箭头去补。

## What Changes

- **主图改为自顶向下的多叉树**：五条层带从「并列堆叠」改为「逻辑顺序的层级」——① 入口层在顶、⑤ 输出层在底，每一级作为一级树层，该级的模块作为这一级的孩子横排。
- **子图改为自顶向下的概念树**：`compute_initial_conditions` 的 5 个块（前置 / 产物与收尾 / 密度链 / 速度链 / vcb 链）＝**概念层**，块内过程＝**子概念层**；入口 B 的 E1 / E2 / E3＝概念层，各自的过程为子概念层。
- **箭头改为「按需显现」**：父子关系仍只由**无箭头**的层级连线表达（不变）；语义边（`depends_on` / `derives_from`）**默认不画三角箭头**，只留一条细线——流向由树形（自顶向下）与 ①→⑦ 的位置关系表达。箭头与关系名**同一时机**显现，具体四种：① 指针悬停在某个**模块**上 → 该模块的出入边显箭头；② 悬停在**某条关系**上 → 该条显箭头；③ 选中某条关系 → 该条显箭头；④ 打开工具条的**「常显边标签」**开关 → 全部箭头一并显现（该开关的用途就是一次读完整条数据流，没有箭头则读不出流向）。①②沿用既有的邻接高亮链路（`.highlighted` / `.hovered`），③④沿用既有的选中态与开关，**不新增交互方式**。**BREAKING**——`graphify-canvas-appearance` 里「依赖关系保持带箭头」这句必须改写为「按需显现」。
- **修正一条名不副实的需求**：`graphify-canvas-layout` 写着「打开即用内置层级布局」，实现里却是 `DEFAULT_LAYOUT_KIND = 'manual'`；本次把两者对齐。
- **不改数据**：`Graphify/data/graph.json` 零改动（树的父子关系已在 `parent` 字段里，概念分组也已存在）。
- **不新增依赖**：不引入 dagre / elk，树形排布沿用自研算法。

## Capabilities

### New Capabilities

（无——本次是在既有能力上改变行为，不引入新能力。）

### Modified Capabilities

- `graphify-canvas-layout`：新增「自顶向下多叉树排布」与「子图按概念层级排布」两条需求；改写「标签页内按层整理布局」（从「层带竖排 + 带内横排」改为「自顶向下树形」）；修正「默认使用内置层级布局」使其与实现一致。
- `graphify-canvas-appearance`：修改「层级连线与语义关系的样式区分」（**BREAKING**）——语义边默认不画箭头，改为「悬停模块时显现」，与关系名同一显现时机；层级连线仍恒定无箭头。

## Impact

- **排布算法**：`Graphify/src/graph/ordered.ts`（分层对齐 → 树形排布）、`Graphify/src/graph/pack.ts`、`Graphify/src/graph/layout.ts`（`DEFAULT_LAYOUT_KIND`、`breadthfirst` 档）。
- **样式**：`Graphify/src/graph/styles.ts`（语义边箭头规则、层级连线权重）。
- **树形数据**：`Graphify/src/graph/hierarchy.ts`、`Graphify/src/graph/cytoscapeSetup.ts`（层级连线的合成）。
- **同口径脚本**：`Graphify/scripts/normalize-layout.mjs`（与 `pack.ts` 参数必须同步）。
- **自检**：`npm run check:canvas`（样式取值）、`npm run check:tabs`（可见集与数据口径）需同步断言；README 的布局说明随之更新。
- **不改动**：`Graphify/data/graph.json`、依赖清单、`server/`。
