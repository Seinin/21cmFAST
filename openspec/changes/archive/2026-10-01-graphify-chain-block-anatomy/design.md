## Context

一级已切成 12 个块（10 过程 + 2 层），块表、代码锚、接口边（21 条）、回流边（2 条）、投影与落点样式都已自检覆盖（见 `graphify-chain-code-modules` 与 `graphify-chain-feedback-toggle`）。本轮的四件事都落在**块的内部**：成员够不够、关系真不真、落点准不准、文档写没写清。现状数字：5 个过程块只有 1 个成员（`cosmo` / `initial` / `grav` / `xray` / `ionization`）；成员落点由 atlas 文档的「承担者」字段推得，那里写成文件名就退化成整文件（32 条从第 1 行起，最长 `heating_helper_progs.c:1-1374`）；12 篇模块 md 共 5–41 行且含施工说明。

另一个约束来自既有口径：**可进入性由真源 `kind` 决定，不由块内连通决定**（成员分两簇的过程块照旧可进入）。

## Goals / Non-Goals

**Goals：**

- 每个可进入的块进入后都有结构可看（≥2 成员、≥1 条块内关系），且每条块内关系在代码里查得到。
- 成员落点从"atlas 猜"变成"真源逐条核定"，并把"这几行算的是这个量"做成可判定断言。
- 模块 md 与代码同源：由真源生成，固定写 输入 / 算法 / 产物，只讲物理。

**Non-Goals：**

- 不改一级的块划分与块数，不动块的代码锚，不新增跨块关系或回流关系。
- 不改子图的画法（样式、投影、回流开关、落点曲线）。
- 不动 C 代码；不把输出盒子里每个字段都做成节点（只取与链有关的）。

## Decisions

**D1 判据落在"成员下限 + 一条块内关系"，不落在"块内连通"。**
单节点子图的问题不是连通性，是成员数。新增两条下限：可进入的块 MUST 至少 2 个成员、MUST 至少一条两端都是本块成员的数据边。今天 12 个块里凡成员 ≥2 的都恰好满足第二条（`halocat` 2 条、`galaxy` 4 条、`halobox` 2 条、`thermal` 6 条、`obs` 2 条），所以这条不追溯改任何既有块。要求"连通"（单簇）会误伤 `halocat`，也会误伤展开后的初始条件块——故不要求。

**D2 五个块逐块展开，成员只从各自的输出盒子字段取。**

| 块（锚） | 现有 | 新增成员 | 块内关系（出处） | 接口边 |
| --- | --- | --- | --- | --- |
| `cosmo`（`cosmology.c · init_ps · CosmoTables`） | `matter_power` | `transfer_fn`（T(k)：`transfer_function()` :213 按 `TF_TYPE` 分派 EH/BBKS/Efstathiou/Peebles/White/CLASS） | `transfer_fn → matter_power`（σ(R) 由 P(k)=T²kⁿ 积分：`sigma_z0` :398、`dsigmasqdm_z0` :450） | 不动（`matter_power → vcb`、`matter_power → dn_dm`） |
| `initial`（`InitialConditions.c · ComputeInitialConditions · InitialConditions`） | `vcb` | `initial_density`（δ_i）、`zeldovich_velocity`（一阶位移/速度）、`second_order_velocity`（二阶 LPT） | `initial_density → zeldovich_velocity`、`initial_density → second_order_velocity`（一阶 :593、二阶 :596，都由密度场经位移场算子算出） | 不动（`matter_power → vcb`；`vcb → perturb_field/ts/q_hii/nion`） |
| `grav`（`PerturbedField.c · ComputePerturbedField · PerturbedField`） | `perturb_field` | `perturb_velocity`（v(x)，红移空间畸变用）；`perturb_field` 的符号收窄为 δ(x) | `perturb_field → perturb_velocity`（密度 :455 写入后由 k 空间变换出速度 :466/:471） | 不动（`vcb → perturb_field`；`perturb_field → dn_dm/tk/q_hii/dtb`） |
| `xray`（`SpinTemperatureBox.c · UpdateXraySourceBox · XraySourceBox`） | `filtered_xray` | `filtered_sfr`、`mean_sfr` | `filtered_sfr → mean_sfr`（同一环形滤波同时给出滤波场与它的体积平均：:762-763 出滤波场、:743 回平均、:769 赋给 `mean_sfr`） | 不动（`source_grid → filtered_xray`、`filtered_xray → eps_heat`） |
| `ionization`（`IonisationBox.c · ComputeIonizedBox · IonizedBox`） | `q_hii` | `gamma_12`（`ionisation_rate_G12`）、`recomb`（`cumulative_recombinations`）、`mfp`（`mean_free_path`）、`z_reion` | 逐条按代码核（`q_hii → mfp`、`recomb → q_hii`、`gamma_12 → q_hii`、`q_hii → z_reion`），每条带 `codeRef` | 不动（`nion → q_hii`；`q_hii → dtb/p21/tau_e`） |

不把 `XraySourceBox` 的 `mean_log10_Mcrit_LW` 收为成员：它在 :776 只是上游晕盒子体积平均的拷贝，收进来会凭空多出一条跨块关系（违背 D3）。同理 `IonizedBox` 里成对的 `mean_f_coll` / `log10_Mturnover_ave` 本轮不取——它们与迷你晕支路绑定，留待需要时再单开一轮。

**D3 接口边冻结：展开 MUST NOT 新开跨块关系。**
一级的 21 条接口边与 2 条回流边牵着位次、色带、回流开关、落点投影与"同端点对叠住"几组断言。成员展开若顺带改接口端点，会把这些全带进来，且 `nion → q_hii` 这一条正是回流开关那一版里"落点与本轮产物边同端点对"的那一对，改指会把那边的断言打空。代价：新成员与上游的字面输入关系（如 `initial_density ← matter_power`）不画，改由块内关系与上游既有接口边表达。补这些关系是独立的一轮。
- 备选（按成员精度重排接口边）被否：收益是省线条的准确度，代价是动到四组视图断言，不划算。

**D4 落点：真源逐条核定 + "区间内必须出现的代码标识"。**
真源每个成员加 `codeSites: [{file, symbol, line, endLine, needles: []}]`，`needles` 是 MUST 出现在该区间里的代码标识（通常就是输出盒子的字段名，如 `neutral_fraction`）。生成器有 `codeSites` 就用它；没有才回落到 atlas 的「承担者」，且回落路线 MUST NOT 再产出整文件落点——找不到函数体就报"待补"，不再画 `1-文件末行`。自检三查：①每个非驱动量成员都有 `codeSites`；②没有一条落点的区间等于整文件；③每条落点的 `needles` 在该区间内至少命中一次。
- 为什么用 `needles` 而不是只查行号：行号会随代码编辑漂移，"行区间存在"挡不住落点错位；`needles` 把"这几行算的是这个量"变成可判定的。
- 跨度上限：单条落点 MUST ≤ 60 行（一段公式或一个核循环都在这个量级），超限即失败；一个成员可以有多条落点，但 MUST NOT 用"函数从头到尾"凑覆盖。

**D5 模块 md 由真源生成。**
真源每块加 `module: {inputs, algorithm, products}`（短句散文），生成器写 `docs/notes/physics-chain/modules/<id>.md`；自检查三节齐全、产物一节覆盖该块全部成员（带符号与落点）、磁盘内容与重新生成的结果一致。
- 备选（手写 md + 结构断言）被否：成员与落点在真源里，手写等于两处维护，必然漂移；这正是"配套的 md 要配合代码"要避免的。
- 散文进真源也意味着同一段话会出现在界面出口上，改一处两处都变——这是要的效果，不是副作用。

**D6 只有一件事的块的处置是"合并"，不是"留一个进不去的入口"。**
规范允许"并入相邻块"（一级块数随之减少）。今天的五个块经核定都能展开（各自的输出盒子都有 ≥2 个物理量字段），所以本轮不触发合并。将来若某块只剩一个成员，处置是并入相邻块，而不是把 `enterable` 改成假——后者会留下"块还在、点不进"的半个入口。层（`const` / `kernel`）本来就不进入子图；`kernel` 的成员是 16 个头文件、不是图上节点，属既有口径，不在本轮范围。

**D7 记账口径：物理量 28 → 39。**
11 个新成员都是 `kind: quantity`：节点 23 → 34，加 5 个驱动量 = 39。自检里写死的 28、"23 nodes + 5 drivers"两处同步改；`processes` 与 `algorithms` 段 MUST 收编新成员（"不重不漏"那条断言会抓）。

## Risks / Trade-offs

- [成员展开了，但块内关系在代码里找不到出处] → apply 里逐块读源码核定，每条关系带 `codeRef`；查不到就换一条真实关系，或该成员不进（宁可少一个成员，不可编一条关系）。
- [落点行号随代码编辑漂移] → 判据是 `needles` 出现在区间内，行号只作展示；行号变了但标识还在，自检不报警，落点仍指得住。
- [60 行上限误伤确需更宽区间的量] → 上限先按 60 行落；若核定中确有量必须跨更宽（例如一次求解的迭代循环），把该条记为显式豁免并写进本文件，不悄悄放宽。
- [`nion → q_hii` 被顺手改指到新成员] → D3 冻结接口，自检按展开前的 21 条逐条比对端点与条数。
- [md 由生成器写，改真源散文时误伤界面文案] → `check:copy` 与幂等自检双查；真源与界面共用一段话是要的效果。
- [新增 11 个成员后一级观感变化] → 一级画布只画块与层，成员只在子图与状态条报数里出现；这一条由"一级画布只画块"的断言守。
