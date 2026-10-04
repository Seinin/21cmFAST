## Why

一级已按代码模块切块（10 个过程块 + 2 个层），但其中 5 个过程块的成员只有 1 个：进入子图后只有一个框，没有任何关系可看，子图这个入口等于空设。同一批成员的代码落点又是由 atlas 文档的「承担者」字段推出来的，那里写成文件名就退化成整文件落点（今天 32 条从第 1 行起，最长 1374 行：`heating_helper_progs.c:1-1374`、`hmf.c:1-1290`），而展示落点的属性页要的是"这个量算在哪几行"的核心区间。模块 md 同时还是施工骨架（12 篇共 5–41 行，`ionization.md` 通篇是"下面每个成员一节"这类写给作者的说明），读者拿不到「输入什么、怎么算、产出什么」。

## What Changes

- **子图完善**：五个单成员过程块按各自输出盒子的字段展成多成员，并逐条给出块内关系的代码出处：宇宙学背景与物质功率谱 1 → 2、初始条件 1 → 4、引力扰动 1 → 2、X 射线源的历史卷积 1 → 3、电离场 1 → 5。一级的 21 条接口边与 2 条回流边**端点与条数都不动**。
- **规范收紧**：可进入的块 MUST 至少 2 个成员，且 MUST 至少有一条两端都是本块成员的关系；一块确实只有一件事时 MUST NOT 单独成块（并入相邻块）。层 MUST NOT 有子图。
- **代码重新定位**：成员落点改为真源逐条核定（核心行区间 + 该区间内必须出现的代码标识），MUST NOT 再出现整文件落点，也不再成段引用函数体；落点重定 MUST NOT 改变块的对外接口。
- **模块文档**：`docs/notes/physics-chain/modules/*.md` 改由真源生成，结构固定为 输入 / 算法 / 产物，只讲物理，去掉计算效率、并行、内存拷贝、构建流程这类枝节，且 MUST NOT 出现施工说明与对话口吻。
- 吸收 `graphify-chain-code-modules` 未完成的 6.1–6.3 文档项（README 的划分依据、`papers.md` 的等式对照、`docs/notes/graphify/G4-物理链.md` 与 `docs/DIRECTORY.md` 的补记）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-chain`: 新增四条要求——子图必须有结构、成员代码落点只指核心行、模块文档写输入算法产物、展开不动一级接口。既有的"一级按代码模块切块""块的代码锚可证伪""过程块与层分列"三条口径不变，本变更只在其上补成员下限与落点精度。

## Impact

- 真源 `docs/notes/physics-chain/chain.json`：新增 11 个成员（物理量 28 → 39）、各自的块内关系、每个成员的 `codeSites`、每块的 `module` 散文；`processes` 与 `algorithms` 段同步收编新成员。
- 生成器 `Graphify/scripts/build-physics-chain.mjs`：成员落点优先取真源 `codeSites`，atlas 路线降为兜底且不再产出整文件落点；新增模块 md 生成。
- 自检 `Graphify/scripts/check-physics-chain.mjs`：新增"成员下限与块内关系""落点跨度与区间标识""模块文档三节与成员覆盖"三组断言；写死的物理量总数 28 改为 39。
- 视图侧数据契约不变（成员、落点、模块文档都走既有出口），一级画布与状态条报数随之更新。
- 文档：`docs/notes/physics-chain/modules/` 12 篇重写，`README.md` 与 `papers.md` 改写。
