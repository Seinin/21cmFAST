## Why

逐块的「公式到语句」深化现在只落在一篇手写平行页 `docs/notes/晕到星系属性_物理与代码.md`，只覆盖 12 个块里的 `block:galaxy`。它与模块文档平行存在：读者要读两处、只对得上一个块，而且它绕开了「模块文档由真源生成、MUST NOT 手改」的纪律。逐块深化的正确位置是**该块的模块文档**，名字就是块名。

## What Changes

- 模块文档的节结构从「物理 / 工程」两节扩为固定五节，**全部模块文档**生效（12 篇块那篇 + 39 篇成员那篇）：`物理` → `符号与代码名` → `工程` → `口径分野` → `参考文献`；块那篇按既有口径 = 各成员条目的并集，共享内核层那 16 篇头文件成员是唯一例外（只保留物理与工程两节）。
  - `符号与代码名`：公式符号 ↔ 用户面代码名（默认值、进 C 时的换算、核定落点），并给出该块用到的换算类型与同名两义。
  - `物理`：保持现有口径（只讲读进哪些量、按哪些公式算出哪些量、公式取**代码执行的那一套**），补一句与论文简式的差异指向。
  - `工程`：保持现有口径（逐成员与逐步骤给出核定核心行、输入、产出）。
  - `口径分野`：逐条列出该块里「论文式 vs 代码式」不一致的对象，并给出判据——**两码事** 或 **同一算法的细化版**；一致的量不列。
  - `参考文献`：逐条给出对象、代码位置、注释或 docstring 里的出处原文，以及仓库里有没有正文；末尾给出该块「本地缺正文」的条目清单。
- 真源 `chain.json` 新增三个按块归属的结构化区块：`symbolMap`、`divergences`、`references`；生成器据块渲染上述三节，自检逐条重算判据。
- 自检新增断言：五节齐全且次序固定；每块的符号表覆盖该块全部成员与 `drivers`；每条分野的判据只有两类取值、且归属唯一；每条参考文献的「本地有无」与 `docs/论文/` 实际文件一致、引用位置 needles 逐个命中；磁盘文档与重新生成的结果逐字一致。
- 删除平行页 `docs/notes/晕到星系属性_物理与代码.md`，其内容并入真源；同步删掉 `docs/DIRECTORY.md` 里该页的登记行。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-chain`: 模块文档的节结构与内容要求由「物理 / 工程两节」改为「物理 / 符号与代码名 / 工程 / 口径分野 / 参考文献五节」，并新增符号对照、口径分野、参考文献三节的真源纪律与自检断言；逐块深化 MUST 写进模块文档、MUST NOT 另建平行页。

## Impact

- 真源与内容：`docs/notes/physics-chain/chain.json`（新增三个区块 + 12 个块的内容）。
- 脚本：`Graphify/scripts/build-physics-chain.mjs`（渲染三节、写前校验）、`Graphify/scripts/check-physics-chain.mjs`（新断言）。
- 生成物：`docs/notes/physics-chain/modules/**`（12 篇块 + 39 篇成员共 51 篇节结构变化，16 篇头文件成员不变）、`Graphify/src/generated/physics-chain.json`。
- 删除与登记：删 `docs/notes/晕到星系属性_物理与代码.md`；改 `docs/DIRECTORY.md`。
- 门禁：`cd Graphify && npm run build:chain`、`npm run check:chain`、`npm run check:copy`。
- 次序：本变更改的需求由未归档的 `graphify-leaf-module-docs` 定下（它把模块文档改成「一节点一篇」），因此实施前 MUST 先把该变更归档，让主规格含这条需求，再叠本变更的增量。
