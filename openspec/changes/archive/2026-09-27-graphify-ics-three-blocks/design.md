## Context

见 proposal.md 的 Why。这里只记与做法相关的现状与约束：

- 现状结构：`③ 备料层` → `atlas:fig1:prep:ics`（`compute_initial_conditions`，method）→ `atlas:ic-frame`（「初始条件（S09）」，group）→ 13 个 `ic:*` 节点、21 条框内边；框与框外**零连线**；`atlas:ic-frame` 无 tags / refs / topics / 边，自身摘要写明"收进大框，一级视图才不会被它铺满"（而它挂在模块内部，从不进一级视图）。
- 全图只有两处「模块下挂 group」：`入口 B`（3 条 E lane）与 `compute_initial_conditions`（1 个框）。
- 既有约束：容器不参与关系；产物写在边标签上（不新增产物节点）；同名模块同实例；子图不派生父层关系；脚本 dry-run + 断言 + 写前备份；数据经 `PUT /api/graph` 写入（服务端自动快照并过 schema）。
- 维护该结构的脚本带着旧形状的断言（`restructure-tabs.mjs` 的 `IC_FRAME` 常量、`expectChildren(IC_FRAME, 13)`、"`ic:*` 应全部在 S09 框里"、布局段 7c），重跑会把新结构压回去。

## Goals / Non-Goals

**Goals:**

- `compute_initial_conditions` 的子图给出**三块骨架**，且该层不再只有单个子节点。
- 三块成员由**代码/文档证据**决定（可复核），不按标签顺序凭感觉分。
- 归属约束强度不降低：改成「三块成员集合精确相等」+「`ic:*` 全在该模块子树内」。
- 工具链、追溯表与文档同步到新形状，重跑脚本不再压回旧形状。

**Non-Goals:**

- 不新增/删除任何 `ic:*` 步骤节点，不改框内 21 条关系，不新增产物节点。
- 不改前端、服务端 schema 与任何画布行为（`group` 的处理已通用）。
- 不给 atlas 加第六个根、不动五条层带的顶层划分（那会与「顶层按代码执行阶段切分」冲突）。
- 不改 `data/graph.before-*.json` 与 `data/graph.history/` 里的历史备份。

## Decisions

**D1：删掉 `atlas:ic-frame`，三块直接挂在模块下（而不是"框内再分组"）。**
- 只有删掉它，`compute_initial_conditions` 才不再"只有单个子节点"——空壳层才算真修掉；框内再分组的话这一层仍然是 1 个子节点。
- 删掉后与 `入口 B → E1/E2/E3 → 步骤` 完全同构（模块 → 若干 lane 框 → 步骤），符合「递归同构」。
- 深度：根(层带) → 模块 → 三块框 → 步骤 = 4 层，落在「三至五层」区间；保留该框会到 5 层且带一层冗余。
- 该框的图号/出处身份不丢：写进三块的标题与摘要（并指向 atlas S09.x 编号）。
- 备选（被否）：把它提为第六个根图——与「顶层按代码执行阶段切分」冲突。

**D2：三块成员按代码阶段划分，每条都能指到证据。**
| 块 | 成员 | 证据 |
|---|---|---|
| 初始加载 | `ic:art-inputs`、`ic:proc-seed`、`ic:proc-ps` | 主函数 try 块开头的一次性准备：`init_ps()`（`cosmology.c:536-545`）、`seed_rng_threads`（`rng.c:30-89`）、`InputParameters`；三者占用的资源在收尾被释放 |
| 核心计算 | `ic:proc-sample`、`ic:proc-conj`、`ic:proc-realize`、`ic:proc-lowres`、`ic:proc-v1`、`ic:proc-vcb`、`ic:proc-2lpt-phi`、`ic:proc-2lpt-v` | `ConjugateInputBox/dft_r2c_cube` → `filter_box` → `compute_relative_velocities` → `compute_velocity_fields` → 代码自带 `BEGIN/END 2LPT PART` 注释；文档 §3.1 主函数骨架、§4.3–4.9 |
| 产物与收尾 | `ic:proc-cleanup`、`ic:proc-downstream` | try 块末尾 "deallocate"：`fftwf_cleanup_threads/cleanup/forget_wisdom`、`fftwf_free`×2、`free_ps()`、`free_rng_threads(r)`；5 个输出由下游 S10 消费（文档 §1.5） |

`ic:proc-cleanup` 形式上是"收尾"，但它释放的正是前两块占用的资源、又是最后一步，故与"交付下游"合为第三块；单列会立刻变成新的"一块只有一两个节点"问题。

**D3：归属断言改写为子树口径（改写而非删除）。**
`expectChildren(IC_FRAME, 13)` → 三个框各自 `expectChildren`（3 / 8 / 2）；"`ic:*` 应全部在 S09 框里" → "`ic:*` 全部落在 `atlas:fig1:prep:ics` 子树内"。断言强度不降。

**D4：位置按既有 `pack` 口径算，不手工摆。**
子图顶层是框 → 单列竖排；容器内部 ≤7 横排、>7 折成固定 4 列。因此：初始加载 3 个一行、核心计算 8 个四列两行、产物与收尾 2 个一行。由重排脚本按 `src/graph/pack.ts` 的同口径写入坐标（与 `scripts/normalize-layout.mjs` 一致）。

**D5：`skip_specs: true`。**
本次没有新的行为契约（不改接口、数据模型、画布行为），只是让数据满足既有 requirement 的字面要求。为过校验造一条假 requirement 反而污染规格。

## Risks / Trade-offs

- [重跑 `restructure-tabs.mjs` 会压回旧形状] → 同步改它的常量、断言与布局段；新脚本幂等（识别已存在的分组框就地更新 parent）。
- [漏改某个引用 `atlas:ic-frame` 的脚本] → 实现前先做一次全仓引用扫描，产出按文件的改动清单再动手。
- [三块成员分错] → 每条成员归属都要能指到文件行号；脚本断言"成员集合精确相等"（不多不少）。
- [跨块箭头看起来像"连线穿越容器"] → 这是既有形态（主图有 18 条跨带模块边）；`ic:proc-cleanup` 有来自三块的 4 条入边，属正常。
- [删框导致 `ic:*` 的归属感变弱] → 三块标题写明覆盖的 atlas S09.x 编号，摘要写出证据；追溯表同步。
- [数据写坏] → 脚本 dry-run 默认 + 写前备份 + 服务端 PUT 自动快照 + 断言不过不写盘。

## Migration Plan

1. 全仓扫描 `atlas:ic-frame` / "初始条件（S09）" 的引用面，产出改动清单。
2. 新增重排脚本（dry-run 打印三块成员与证据 → 断言 → 备份 → `--apply`）。
3. 先 dry-run 核对，再 `--apply` 写入（节点 57→59、关系 54 不变）。
4. 同步三个脚本的常量/断言/布局段 + 自检断言。
5. 跑 `npx tsc -b`、`npm run lint`、`npm run check:canvas`、`npm run check:styles`；无头探针实地进该子图核三块与跨块箭头。
6. 更新 README 与 `INITIAL_CONDITIONS.md` §8；归档变更。

回滚：`data/graph.json` 写前有备份，服务端每次 PUT 也有快照；前端未改动，无需回滚代码。
