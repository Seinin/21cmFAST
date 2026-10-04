## Why

物理链页现在把**代码账本里的编号**当名字用：一级的框叫 `M8 气体热与自旋温度`，成员明细右列印 `S14`，引用卡片第二行印 `M8-thermal.md#m8-气体热与自旋温度`，检索命中说明末尾印 `· 代码 S14`，骨架文档标题也带编号。这些编号（`L0/L1`、`M1…M10`、`S04/S07`…）是**维护者对着代码说话时的坐标**，不是这一页要讲的东西；读这一页的人（以及站点上读骨架文档的人）看到的是"编号 + 名字"，其中编号只在解释"它算在哪段代码里"时才需要，而那段已经由「源码」标签页的文件 + 行区间回答了。

用户口径（2026-10-01）：**把编号从页面上全部挡掉**——编号是内部坐标，读者不该看见。

## What Changes

- **名字里就不带编号**（单一真源，不做显示层掩码）：真源 `chain.json` 里 12 个块的 `label` 去掉模块码前缀（`M8 气体热与自旋温度` → `气体热与自旋温度`）；生成器不再把步骤标签拼成 `${单元号} · ${步骤名}`（`S14.3.1 · UpdateXraySourceBox` → `UpdateXraySourceBox`）。**编号退回数据字段**（量的 `stage`、真源 `codeHints`、块的 `codeAnchor`、`algorithms` 注册表）——它们仍在生成物里、仍被自检逐条断言，只是不再进任何界面文案。
- **骨架文档跟着名字走**：12 份模块骨架文档改名（`M8-thermal.md` → `thermal.md`，文件名 = 块的 id 去掉 `block:` 前缀），标题同步去码（`# M8 气体热与自旋温度` → `# 气体热与自旋温度`，步骤小节 `### S14.3.1 · UpdateXraySourceBox` → `### UpdateXraySourceBox`）。锚点由标题算出来，两者必须一起改——自检逐条对拍。
- **散文改写（改真源、重新生成）**：块注、过程面注、边注、兜底小节注里的模块码换成块名（`下游 M4/M8/M9/M10 都拿它当参数` → `下游的「晕目录与质量函数」「气体热与自旋温度」「电离场」「亮温与观测」都拿它当参数`）。
- **界面出口撤干净**：块「成员明细」右列（阶段号）退场；检索命中说明不再印 `· 代码 S14`；检索框占位文案去掉 `（S14 也行）`。
- **自检加断言**：界面出口上的字符串（块 / 步骤 / 成员标签、真源散文、引用落点、命中说明、骨架标题）MUST NOT 含内部编号形状；同时保留"`stage` 与真源 `codeHints` 逐条对得上"这类数据侧断言，编号不会因为看不见就失守。
- **接口面照旧**：按 `S14` 检索仍能命中（命中面含阶段号），只是命中说明里不再印它。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-chain`: 新增要求「界面上的名字与落点不含内部编号」（名字在真源与生成器里就去掉编号，禁止用显示层掩码造别名；编号留在数据字段里且仍被自检断言），并改既有「本页检索与来源标注」（命中说明 MUST NOT 印阶段号）。

## Impact

- **真源**：`docs/notes/physics-chain/chain.json` —— 12 个块 `label`、12 处 `noteDoc`、块注 / 过程面注 / 边注 / 兜底注里的模块码。
- **生成器**：`Graphify/scripts/build-physics-chain.mjs` —— 步骤标签不再拼单元号（`:1149`）。
- **骨架文档**：`docs/notes/physics-chain/modules/*.md` 12 份改名 + 标题去码。
- **前端**：`Graphify/src/components/Inspector.tsx`（成员明细撤右列）、`Graphify/src/components/PhysicsChainView.tsx`（不再往成员明细递 `stage`）、`Graphify/src/lib/physicsChain.ts`（命中说明）、`Graphify/src/components/ChainSearchPanel.tsx`（占位文案）。
- **自检**：`Graphify/scripts/check-physics-chain.mjs` —— 新增"界面出口不含内部编号"一组断言。
- **文档**：`docs/DIRECTORY.md`、`docs/notes/physics-chain/README.md`（引用示例与"节点符号"那段口径）、`docs/notes/graphify/G4-物理链.md`。
- **不改**：`src/py21cmfast/` 下任何代码；画布页行为与 `Inspector` 在画布页的用法（同一组件、`inline` 分支不动）；atlas 册子（`docs/notes/atlas/**`）里的代码拓扑编号——那是代码账本自己的坐标，不是这一页的呈现面。
- **change 卫生**：`graphify-chain-leaf-refs`（25/27，未归档）的 6.3 曾明确保留「命中说明里的『代码 S14』」，本变更撤销该**展示**；它的规格 delta 里钉的是代码引用的文件名形状（`SpinTemperatureBox.c`），不含模块码，与本变更不冲突（design D6 记一笔）。
