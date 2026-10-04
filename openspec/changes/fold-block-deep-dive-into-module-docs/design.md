## Context

模块文档现在由真源 `docs/notes/physics-chain/chain.json` 生成（`Graphify/scripts/build-physics-chain.mjs`），自检 `Graphify/scripts/check-physics-chain.mjs` 逐字对拍磁盘、并打开源码核对每条落点的检定标识。文档树已经是一节点一篇（12 篇块 + 39 篇成员 + 16 篇层头文件成员）。未归档的 `graphify-leaf-module-docs` 定下了这个形状。成因与动机见 proposal.md。

## Goals / Non-Goals

**Goals:**

- 把「公式到语句」的逐块深化从一篇手写平行页收进模块文档本身，覆盖全部对象。
- 三节新内容全部由真源驱动、可机械核对：符号对照的每一行、分野的每一条、出处的每一句原文都能回到源码或 docstring 上。

**Non-Goals:**

- 不引入代码摘录（文档仍只给"核定行区间 + 一句说明"，不贴语句片段）。
- 不改画布、属性页、检索等界面行为；不改 16 篇层头文件成员的节结构。
- 不新增依赖，不改 `docs/notes/` 之外的文档树。

## Decisions

### D1 三节内容进真源，生成器渲染

真源新增三个顶层区块，按对象归属：

- `symbolMap[]`：`{ owner, symbol, codeName, default, conversion: { kind: 'log10→linear' | 'dex→nats' | 'identity', site }, site: { file, line, endLine, needles }, alias?: { sibling, note } }`
- `divergences[]`：`{ owner, subject, paper, code, verdict: '两码事' | '同一算法的细化版', note }`
- `references[]`：`{ owner, subject, location, quote, sourceKey, local }`

`owner` = 对象 id（成员 id；块不自造条目）。

**替代方案与取舍**：手写平行页（现状）——内容与代码容易脱钩、且违反"MUST NOT 手改生成物"；生成器现场从源码抽取——注释格式五花八门，抽不准也没法核定。真源 + 自检是唯一能同时满足"可核对"与"不手改生成物"的路。

### D2 节次序：物理 → 符号与代码名 → 工程 → 口径分野 → 参考文献

先立物理（哪些量、哪些公式），紧接把符号接到代码名上（读者带着符号往下走），再给落点，最后收尾分歧与出处。块那篇按既有口径 = 各成员条目并集（去重），MUST NOT 另写块级散文；顺序按成员次序。

### D3 「本地有无」由自检重算，不靠人工填

真源给每条出处一个 `sourceKey`（如 `Greig+2018`），另在真源里维护一张**正文登记表**（`sourceKey` → 仓内文件路径或空）。自检：`local: true` 的条目，其登记路径 MUST 存在；`local: false` 的条目，其登记路径 MUST 为空或不指向正文；两边对不上就失败。这样"把 PDF 放进仓里"这件事会自动逼真源更新。

### D4 层头文件成员例外

`kernel` 的 16 篇没有可求值的量，不给符号表、公式与分野；`references` 仍按头文件注释里的出处给（有就给）。这条与既有的"不给公式、给整文件级落点"例外一致。

### D5 平行页删除，命名纪律并进本规格

删 `docs/notes/晕到星系属性_物理与代码.md` 与 `docs/DIRECTORY.md` 的登记行，内容按 D1 拆进真源。`docs-house-style` 已有"文件名与标题只由内容命名"，本变更在此之上加"逐块深化 MUST 只写在模块文档里、文件名 = 对象名"，不再另开 capability。

### D6 判据留机器可核的余地

自检不数"每篇至少几条"这种会逼人凑数的指标，只核可判定的东西：五节齐全且次序固定、符号表覆盖该对象全部成员用到的驱动参数、每条落点的检定标识命中、判据取值只在两类里、归属唯一、`local` 与登记表一致、磁盘文档 = 重新生成的结果。

## Risks / Trade-offs

- [内容量大：12 块 + 39 成员逐条填符号与出处] → 分两批落地：先加真源骨架与自检断言（此时自检红），再逐块填内容；填一块绿一块。
- [出处清单大部分"本地无正文"，清单会很长] → 如实标注，不为了让页面好看而删条目；登记的正文文件存在时自动转绿。
- [改了模块文档节结构，站点渲染与既有链接可能失配] → 节标题是新增的二级标题，既有锚点（对象名）不变；改动后跑 `npm run check:copy` 与站点构建。
- [前置变更未归档导致主规格缺这条需求] → 实施顺序里排在第一项：先归档 `graphify-leaf-module-docs`。

## Migration Plan

1. 归档 `graphify-leaf-module-docs`，主规格含「模块文档一节点一篇，与子图树同构」。
2. 真源加三个区块与正文登记表，先落 `block:galaxy` 与它的 5 个成员（现有平行页的内容搬进去）。
3. 生成器渲染三节 + 写前校验（缺条目即不写盘并指名对象）。
4. 自检加断言（见 D6）。
5. `npm run build:chain` → `npm run check:chain` → `npm run check:copy` 全绿。
6. 删除平行页与 `docs/DIRECTORY.md` 登记行，复查 `docs/DIRECTORY.md` 的模块文档描述与实际一致。
7. 逐块补齐其余 11 个块的条目，每块一次 build + check。
8. 归档本变更。

回滚：本变更只动真源、两个脚本与生成物；回滚即 `git revert` 该提交并重跑 `build:chain`，磁盘文档随生成器回到两节形状。
