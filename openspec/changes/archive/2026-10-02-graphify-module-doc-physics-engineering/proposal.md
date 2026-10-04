## Why

模块文档现在按 **输入 / 算法 / 产物** 三节组织，物理与工程混在同一节里：算法一节既写公式又夹代码落点，产物一节把成员符号、物理一句话与文件行号混在一起。想"只读物理"或"只看某几行代码的输入与产出"，读者都得自己在同一段里挑。文档要能当两样东西用——一段可以独立通读的纯物理，和一份贴着它的工程对照。

代码引用同样偏冗余：产物一节把成员涉及的各步骤连落点一并列出，一个成员能摊出 9 条引用（实测 `thermal` 篇 23 条、12 篇共 90 条），而这些步骤落点多数是 atlas 回落的**整函数区间**（`650-747` 这种），真正算出这个量的往往只有几行；另有 3 个步骤小节只剩标题、没有落点。工程一节的落点要定位到**核心的那几行代码**，而不是把碰过的函数都列一遍。

## What Changes

- **结构改为两节**：`#` 块标签 → `## 物理` → `## 工程`。
  - `## 物理`：只讲物理——读进哪些物理量、按哪些公式算出哪些物理量。该给公式就给公式，用行内 `$...$` 与独立成行 `$$...$$`。`MUST NOT` 出现代码标识（文件与目录名、函数名、参数名、行号、反引号包起来的任何东西）与工程叙述。
  - `## 工程`：贴着上一节的物理逐条对齐——物理里的哪个成员、哪一步，落在哪个文件的哪几行，**输入什么、产出什么**。只讲这一层；`MUST NOT` 写效率、并行分块、内存布局、构建打包这类枝节。
- **真源字段重构**：`module.inputs` + `module.algorithm` + `module.products[].note` → `module.physics`（纯物理条目）+ `module.products[] {id, in, out}`（工程口径的输入与产出）。成员的物理一句话并入物理节；工程节的代码引用改取真源逐条核定的**核心行**（`codeSites`），不再直接用 atlas 回落的整函数区间。
- **落点收紧到核心行**：一个成员只给核定的那 1–2 条**核心行**（文件 + 行区间 + 该区间内必须出现的标识），不列它碰过的整个函数；步骤小节按所在函数复用同一条核定，不再逐步骤各列一遍。为此补齐 13 个尚未核定核心行的单元；核不到的 `MUST NOT` 渲染成只有标题的空壳小节。
- **渲染器与闸门跟着改口径**：两节齐全、物理节无代码痕迹、工程节逐成员给核定的核心行与"输入 / 产出"、磁盘内容 = 重新生成；每条落点都要能追到真源核定，空壳小节判失败。
- 形状文档同步：`docs/notes/physics-chain/README.md`、`docs/notes/graphify/G4-物理链.md`、`docs/DIRECTORY.md`，以及任何写着"三节"的地方。
- **BREAKING**：真源 `module` 字段名与文档小节名同时变更；指向旧小节（`## 输入` / `## 算法` / `## 产物`）的链接与锚点需重定。

## Capabilities

### New Capabilities
无。

### Modified Capabilities

- `graphify-physics-chain`：模块文档的形状与叙述纪律——由固定三节改为 **物理 / 工程** 两节；物理节禁代码与工程内容、该给公式给公式；工程节逐成员逐步骤给出**核定的核心行**与输入产出，禁枝节工程叙述，禁整函数区间与空壳小节。

## Impact

- 真源：`docs/notes/physics-chain/chain.json` 的 12 个块 `module`（10 个过程块 + 2 个层）。
- 真源落点：13 个尚未核定核心行的单元要逐条读源码补核定——`S01.2.2`（`inputs.py`）、`S06.1.1`（`Constants.c`）、`S06.2.2`（`_inputparams_wrapper.h`）、`S07.4.2`（`interpolation.c`）、`S08.1.2`（`hmf.c`）、`S08.1.3`（`hmf.c`）、`S12.1.1`（`scaling_relations.c`）、`S13.4.4`（`interp_tables.c`）、`S14.6.3`（`heating_helper_progs.c`）、`S14.7.1`（`thermochem.c`）、`S16.3.1`（`interpolation.c`）、`S16.4.1`（`debugging.c`）、`S16.4.2`（`debugging.c`）。
- 生成器与闸门：`Graphify/scripts/build-physics-chain.mjs`（模块文档渲染）、`Graphify/scripts/check-physics-chain.mjs`（形状、两节齐、覆盖、幂等、物理节禁代码、`in` / `out` 非空、落点来源、无空壳，共八组）。
- 生成物：`docs/notes/physics-chain/modules/*.md` 12 篇（重写）。
- 形状文档：`docs/notes/physics-chain/README.md`、`docs/notes/graphify/G4-物理链.md`、`docs/DIRECTORY.md`。
- 规格：`openspec/specs/graphify-physics-chain/spec.md`（Requirement「模块文档写输入算法产物」与「笔记引用指向真实存在的文档」）。
- 不动：应用视图代码（`Graphify/src` 不读 `module` 散文），一级块数、接口边 21 条、回流边 2 条、成员 39 个。生成物数据会跟着变：补上的核心行进 `codeSites`，画布「源码」标签页因此少几处整函数区间、换成一截核心行。
