## Context

见 `proposal.md - Why`。约束来自既有基建（全部已存在，本次不新建管线）：

- **大纲 v2 管线**：`Graphify/scripts/build-nion-graph.mjs`（人工大纲 → 严格校验 → 草案）与 `Graphify/scripts/import-graph.mjs`（草案 → `--replace` 覆盖主图）。
- **锚点回填**：`Graphify/server/lib/mdIndex.mjs` 解析任意深度的标题，`slugify` 保留中文字符；重名标题自动加 `-1` 后缀（这正是必须用「唯一标题 + 正则」而绝不手写 slug 的原因）。
- **生成器现状**：`MAX_DEPTH = 4` 写死在 Nion 生成器里；`links` 只给警告不报错；已有 `--outline=<file>`、`--stdout`、`--anchors`、`--topics[=id]` 开关。
- **画布预算**：`MAX_VISIBLE_NODES = 25`（`Graphify/src/graph/hierarchy.ts`）；`MAX_TOPICS = 12`（`server/lib/schema.mjs`）。
- **快照**：`server/lib/store.mjs#writeGraph` 在写盘前自动 `snapshot(currentGraph, reason)`，导入器走的就是这条路径（`writeGraph(diff.graph, 'cli:import')`），所以 `--replace` 本身自带回滚点。
- **文档根**：`docs/notes/`，`docId` 即相对该目录的路径。

## Goals / Non-Goals

**Goals:**

- 一棵可维护、可重建的代码逻辑拓扑树，人工成本集中在**一份**文件：框架文档；大纲与草案都由它派生。
- 每层只给骨架、细节只在末端；简单分支 3 层收、复杂分支到 5 层。
- 打开图谱任一话题都能一次看清该话题骨架，不被可见预算拦截。

**Non-Goals:**

- 不做代码级调用图（不抽 call graph、不解析 C 语法）。树的内容是人工阅读后策划的框架。
- 不改服务端 schema、不改前端源码、不引入新依赖、不动 Python/C 源码。
- 不保留「Nion 积分」与「代码拓扑」两棵主树共存（主图只有一份）；Nion 树退化为备选，由它自己的一条命令重建（需要时覆盖回来）。
- 不为跨分支语义引入关系边（沿用零边口径）。

## Decisions

### D0：大纲由框架文档派生，不手工誊抄

181 个节点的「层级 + 话题 + 摘要」如果手写进大纲，改一次文档就要对一次账（每节首段、`parent`、话题归属都会漂移）。因此加一层 `scripts/export-code-outline.mjs`：它把文档的标题层级翻译成 `parent`、把 `##` 阶段翻译成话题（阶段标题 → 话题 id 的映射表写死在脚本里，出现未登记阶段即报错）、把每节首段当作节点摘要（`关键函数`/`关键量` 条目属于末端细节，不进摘要）、把标题本身当作 `refs` 的正则（转义元字符）。这样**唯一人工来源是文档**，大纲与草案都是派生物，重建链变成「文档 → 导出 → 生成 → 导入」四步。**备选**（手写大纲）被否：两份内容会立刻开始互相漂移，而本次的规模（181 节点）让这种漂移几乎必然发生。

### D1：新增 `build-code-graph.mjs`，不改 Nion 生成器的既有行为

以 Nion 生成器为蓝本复制一份，做三处参数化：输入/输出路径指向 `code.outline.json` / `code-draft.json`、深度上限改为读取大纲声明、文案与文件头注释改为代码拓扑语境。**备选**（把两者公共逻辑抽成 `scripts/lib/outline-core.mjs`）被否：抽公共模块要同时改动一份正在被使用的生成器，收益只是少一份重复，风险与本次目标不成比例。

同时把两条 spec 要求落到两份生成器上：Nion 生成器也改为读取 `meta.maxDepth`（缺省 4，并在 `nion.outline.json` 显式写上 `"maxDepth": 4`），使「深度上限由大纲声明、不得写死常量」对两份生成器都成立。

### D2：深度上限由大纲声明

`meta.maxDepth`（整数，含阶段根算第 1 层）是唯一来源：**缺失或不是 1–6 的整数即报错退出**，不设隐形兜底常量（`nion.outline.json` 已显式补上 `"maxDepth": 4`）。超深节点报错退出并指出节点 id 与深度；实测最大深度小于上限时照常产出（允许不等深）。

### D3：顶层阶段由 C 端入口定义，不按文件目录排

权威来源是 `src/py21cmfast/src/_functionprototypes_wrapper.h`：它是 cffi 唯一对 Python 可见的函数集合，其分组（OutputStruct COMPUTE FUNCTIONS / PHOTON CONSERVATION / Non-OutputStruct / Initialisation）直接给出执行阶段顺序。顶层阶段依次为：输入与全局配置 → 宇宙学背景 → 质量函数与统计工具 → 初始条件 → 微扰场与速度 → 晕目录与位移 → 天体物理源 → 电离与复合 → 热与自旋温度 → 亮温输出，外加「跨阶段基建与校准」一列。其中「质量函数与统计工具」（`hmf.c` + `fdm.c`）从原先的「结构形成」里独立出来，一是它在执行顺序上先于晕识别（先把统计工具备好），二是它被 `HaloBox.c`、`IonisationBox.c`、`SpinTemperatureBox.c` 等下游阶段反复调用，本身就是一个跨阶段的工具层。

### D4：话题与阶段一一对应，成员数按画布预算封顶

实际切成 11 个话题（`MAX_TOPICS = 12` 之内），每个话题的成员数都 ≤25（与 `MAX_VISIBLE_NODES` 同值），因此打开任一话题都能一次看清它的完整骨架：

| 话题 | 覆盖的计算单元 | 单元数 | 成员数（含阶段根） |
| :--- | :--- | ---: | ---: |
| `code-inputs` | InputParameters.c、Constants.c | 2 | 7 |
| `code-cosmo` | cosmology.c、interp_tables.c、integral_wrappers.c | 3 | 21 |
| `code-hmf` | hmf.c、fdm.c | 2 | 18 |
| `code-ic` | InitialConditions.c、dft.c、rng.c | 3 | 18 |
| `code-perturb` | PerturbedField.c、filtering.c | 2 | 15 |
| `code-structure` | HaloCatalog.c、Stochasticity.c、PerturbedHaloCatalog.c、map_mass.c | 4 | 18 |
| `code-sources` | scaling_relations.c、HaloBox.c、LuminosityFunction.c | 3 | 17 |
| `code-ion` | IonisationBox.c、recombinations.c、bubble_helper_progs.c | 3 | 24 |
| `code-thermal` | SpinTemperatureBox.c、thermochem.c、elec_interp.c、heating_helper_progs.c | 4 | **25** |
| `code-output` | BrightnessTemperatureBox.c | 1 | 9 |
| `code-crosscut` | photoncons.c、indexing.c、interpolation.c、debugging.c | 4 | 9 |

合计 31 个单元，无遗漏。与初稿的差异有两处，都是策划过程中按「成员数 ≤25」这条硬线调整的结果：① 原「结构形成」一个话题要装 6 个单元、32 个成员，超预算，故拆成 `code-hmf`（统计工具层）与 `code-structure`（晕目录与位移）；② 原「横切」话题把 `interp_tables.c`、`integral_wrappers.c` 也算进去，改按「主归属」分别归到 `code-cosmo`（它们服务的是宇宙学背景与统计量查询）与保留 `code-crosscut`（纯基建）。**多归属最终没有使用**：每个节点只归一个话题，跨阶段耦合（源项横跨电离与热温度、`map_mass.c` 同时搬密度与属性等）写进节点摘要与文档附录，避免同一节点在第二个话题里被提升成孤立顶层块。**备选**（每个 `.c` 一个话题）被否：31 个话题超过 `MAX_TOPICS`，且话题粒度等于文件时「阶段骨架」这一层就丢了。

### D4b：树是森林——11 个阶段各自是一个话题顶层节点

不设跨越全部话题的单一总根：每个阶段节点就是它所在话题的顶层节点（`parent: null`），11 个阶段合起来构成森林（生成器本就允许森林，`parent` 为空即顶层）。深度按「从该话题顶层算起」计：**第 1 层 = 阶段，第 2 层 = 子过程，第 3 层 = 由哪个计算单元负责（简单分支在此收尾），第 4–5 层 = 关键过程与关键量（仅复杂分支）**。实测深度分布 L1 11 / L2 49 / L3 61 / L4 52 / L5 8——第 5 层只出现在 hmf 的三条积分路径、电离的逐格点塌缩分数取值、热温度的五类演化项这三处。「全部话题」视图（不过滤）在画布顶层就并排显示这 11 个阶段，即整条计算链的骨架。**备选**（加一个共享总根）被否：总根会出现在每个话题里，使每个话题视图多出一层只有一个可见子节点的单链，而它并不承载额外的分解信息。

### D5：单文件 `docs/notes/CODE_TOPOLOGY.md`，标题即锚点

文档 H1 是文档标题（不建节点）；顶层阶段用 H2（depth 1），逐层用 H3（子过程）、H4（由哪个计算单元负责）、复杂分支再下探 H5/H6（关键过程与关键量）。标题文本与大纲节点的 `label` 逐字一致（树内全局唯一，这也是 node 级校验的一部分），`refs` 只写该节点自身标题并转义正则元字符。**备选**（按阶段拆成 11 个 md）被否：节点跳转要在多个文件间分散，`DIRECTORY.md` 的登记项也从 1 条变 11 条；而单文件在 mdIndex 里仍逐标题建锚点，跳转精度不变。实测 183 个标题（含文档 H1 与附录 H2）、无重名、最长 30 字，181 个节点全部命中。

### D6：主树零边，跨支关系写摘要

沿用 Nion 树口径：层级只由 `parent` 表达，`links` 不写。跨阶段耦合（例如 `HaloBox` 的源项同时喂给电离与热温度、`map_mass.c` 同时搬密度与属性、电子分数在电离与热温度之间回流）写进节点摘要与文档末尾的「阶段间耦合速查」附录；本次**没有**使用多话题归属（见 D4）。

## Risks / Trade-offs

- [话题成员数超过 25 的预算] → 已按硬线调整：原「结构形成」拆成 `code-hmf`（18）与 `code-structure`（18），原「横切」里的 `interp_tables.c` / `integral_wrappers.c` 按主归属挪回 `code-cosmo`；实测最宽的 `code-thermal` 为 25，恰好等于预算上限。
- [标题改名导致锚点失配] → 锚点全部由生成器从文档标题回填，改名后重新生成即报错并指出节点；文档头写明「节点标题即锚点，改名需同批更新大纲」。
- [同名标题被自动加 `-1` 后缀造成静默错位] → 节点标题全局唯一（层级前缀已足够区分），生成器对「一个标题文本匹配到多个标题」报错退出。
- [覆盖主图后 Nion 树入口消失] → 导入前 `writeGraph` 自动快照（`cli:import`），历史面板可回滚；`nion.outline.json` + Nion 生成器仍在，一条命令可重建。**实施中发现该命令当时是坏的**：`FDM_nebrin_mcrit_plan.md` 的一行 `~~~~~~` 被 `mdIndex` 当成 `~~~` 围栏，该文档只剩前 4 个标题进索引、两条 nebrin 锚点失效，生成器报错拒绝出草案；改成 `≈≈≈≈≈≈` 后 106/106 命中，重建路径恢复可用（这也说明「回滚靠旧命令」这条假设必须实测，不能想当然）。
- [`--replace` 会清空旧节点 id，若浏览器正开着旧图会看到空图] → 前端对新旧 id 无硬编码依赖（选中项在不可见时被清空），刷新即恢复；导入后按既有约定核对一次渲染。
- [框架文档体量偏大] → 每节只写「本层骨架 + 下一层交给谁」，细节只出现在叶节；用 `--anchors` 检查引用覆盖率而非靠人眼通读。

## Migration Plan

1. `node scripts/export-code-outline.mjs --stdout` → 零落盘预览：话题数、节点数、深度分布、逐话题成员数（含是否越 25）。
2. `node scripts/build-code-graph.mjs --stdout` → 零落盘预览：锚点是否全部命中、环/深度/话题/长度校验结论、逐话题顶层方块数。
3. `node scripts/import-graph.mjs data/code-draft.json --dry-run` → 预览与现有主图的差异。
4. `node scripts/import-graph.mjs data/code-draft.json --replace` → 覆盖主图（自动快照 + 写后回读校验；实测落盘与服务端读回两侧指纹一致）。
5. 浏览器核对：任一话题打开即可看到骨架、逐层展开不被预算拦截、点击节点跳到文档对应章节。
6. 回滚：历史面板选 `cli:import` 之前的快照；或跑 Nion 生成器 + `--replace` 恢复旧主图（该命令已在本次实施中修复并实测）。

## Open Questions

- 无。原计划的「是否为每个阶段补 ASCII 流程图」按「先不补」执行：文档已用「本层骨架 + 下一层交给谁」的分层文字承载结构，流程图属可选装饰，不影响 specs 与任务分解；若阅后觉得骨架不够直观，随时在对应 H2 下补一张即可（不影响图谱，因为只有标题进大纲）。
