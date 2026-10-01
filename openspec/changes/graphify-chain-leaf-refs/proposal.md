## Why

物理链页右侧栏现在给的是两个**点不开的摘要**：块的「代码锚」（一个文件名 + 一个函数名）与「阶段号」（`S14` 之类）。它们既没有行号、也不能打开，读的人拿不到可核验的落点。而真正能核验的两样东西——**代码引用**（文件 + 行区间）与**笔记引用**（`docs/notes` 下的文档）——在模块层是**空的**：12 个块的 `refs` 是空数组（`build-physics-chain.mjs:1008` 写死的 `refs: []`），于是模块上的「看实现 (0) / 看文献 (0)」什么都不显示；就连最深的 21 个叶子（`step:S*`）也只有 34 条代码引用、**0 条笔记引用**。

用户口径（2026-10-01）：**不要**右侧栏这两个摘要，改成**每一个节点都带可点的代码引用与笔记引用**，而且**从叶子开始添加**——叶子写最细的落点，往上逐层汇总。

## What Changes

- **右侧栏移除两个展示项**：块的「代码锚」与「阶段号」、量的「阶段号」退场。字段本身保留在数据里（块的 `codeAnchor` 仍是"与代码同构"的可证伪依据、被自检逐条断言；`stage` 仍是检索命中面），只是**不再有界面出口**。
- **引用口径改成自底向上汇总，并写成可证伪的单一规则**：叶子（`step:S*`，实测 21 个、深度 2、无子节点）是最细的落点；上级节点的引用 = **自己的引用 ∪ 全部后代引用的并集**（去重后稳定排序）；模块（12 个块）的引用 = **其全部成员的并集**。视图 MUST NOT 自己重算，读生成物给的 `refs`；自检 MUST 独立重算一遍并逐条对拍，**多一条、少一条都失败**。
- **补齐缺口，让"每个模块都有引用"成立**：
  - 12 个块 MUST 各至少有一条**代码引用**与一条**笔记引用**（L1 共享内核层的成员是 16 个头文件名、不是图上节点，它的引用要直接给，不能靠汇总凭空产生）；
  - 4 个零引用量 `matter_power` / `vcb` / `perturb_field` / `filtered_xray` 补代码落点；
  - 21 个叶子补笔记引用。
- **新建笔记承载骨架**：`docs/notes/physics-chain/` 下按模块建骨架文档（标题 + 待填小节，先搭框架，内容后续补）。骨架 MUST 能被 notes 库打开——`docId` 就是相对 `docs/notes/` 的 POSIX 路径，服务端按目录扫描（`Graphify/server/lib/mdIndex.mjs`），无需另行登记。
- **BREAKING（对本页）**：右侧栏不再出现「代码锚 / 阶段号」字样；`Inspector` 的 `codeAnchorText`、块 `stages`、量 `stage` 三个展示口子退场。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-chain`: 证据纪律收紧——从"代码与文献各有一个默认收起的入口"扩到"**每个节点（含 12 个模块）的两个入口都必须非空**，且检查器 MUST NOT 另设代码锚 / 阶段号这类点不开的摘要展示项"（改既有要求）；并新增"**引用自底向上汇总**（叶子最细，祖先 = 自己的 ∪ 后代的）"与"**笔记引用必须指向真实存在的 notes 文档**（骨架文档先建）"两条要求。

## Impact

- **真源**：`docs/notes/physics-chain/chain.json` —— `nodes[].code.sites` 补齐 4 个零引用量；叶子与模块的笔记引用落点（新 notes 文档的 `docId`）。
- **生成器**：`Graphify/scripts/build-physics-chain.mjs` —— 块的 `refs: []`（`:1008`）改成自底向上汇总；L1 层（成员是文件名，不是节点）的引用直接给；汇总排序口径写成一处函数。
- **自检**：`Graphify/scripts/check-physics-chain.mjs` —— 新增三类断言：①汇总结果与独立重算逐条一致（多/少都失败并指名差在哪）②每个块至少各一条代码引用与笔记引用 ③每条笔记引用的 `docId` 在 `docs/notes/` 下真实存在。
- **前端**：`Graphify/src/components/Inspector.tsx`（删代码锚行 `:459-470`、块阶段号行 `:472-481`、量阶段号行 `:621-633`）、`Graphify/src/components/PhysicsChainView.tsx`（不再拼 `codeAnchorText` / `blockStages`）、`Graphify/src/lib/physicsChain.ts`（若 `stages` / `stage` 不再有展示出口则收窄其对外读取）。
- **文档**：`docs/notes/physics-chain/`（新增骨架 md）、`docs/notes/graphify/G4-物理链.md`、`docs/DIRECTORY.md` 记一笔口径变更。
- **不改**：`src/py21cmfast/` 下任何代码（只读取落点）；`Graphify/data/graph.json` 与画布页行为；不新增第三方依赖。
- **change 卫生**：`graphify-chain-code-modules`（27/31，未归档）的 5.1 曾给属性页加过"代码锚"一行；本变更撤销该**展示**。该 change 的规格要求「块的代码锚可证伪」只讲**数据与自检**、不含界面条款，与本变更**不冲突**（不需要改它的 delta；在 design 里记一笔即可）。
