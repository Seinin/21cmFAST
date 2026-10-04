## Context

动因见 `proposal.md - Why`。这里只记设计所依赖的现状与约束。

**代码现状（本次只读，取锚用）**

- 作者把模块边界写在三处：①`wrapper/outputs.py` 里 9 个输出盒子各自绑定一个 C 函数（`_c_compute_function`：`ComputeInitialConditions`(:508)、`ComputePerturbedField`(:676)、`ComputeHaloCatalog`(:766)、`ComputePerturbedHaloCatalog`(:873)、`ComputeHaloBox`(:1010)、`UpdateXraySourceBox`(:1158)、`ComputeTsBox`(:1249)、`ComputeIonizedBox`(:1379)、`ComputeBrightnessTemp`(:1544)）；②`_outputstructs_wrapper.h:54-59` 亲笔注明 `n_ion` / `whalo_sfr` / `halo_sfr` / `halo_xray` / `halo_sfr_mini` 是"For IonisationBox.c and SpinTemperatureBox.c"；③`_inputparams_wrapper.h` 末尾写着参数结构应"只含相关参数、look at HaloBox.c、随 `.c` 文件走"。
- 依赖方向由签名给定：`ComputeIonizedBox(float redshift, float prev_redshift, PerturbedField *perturbed_field, PerturbedField *previous_perturbed_field, IonizedBox *previous_ionize_box, TsBox *spin_temp, HaloBox *halos, InitialConditions *ini_boxes, IonizedBox *box)`（`IonisationBox.c:1315-1318`）——**电离吃自旋温度**。
- 三条反馈写在 `HaloBox.c`：`:487` 取 `ini_boxes->lowres_vcb`；`:495` `M_turn_m = lyman_werner_threshold(consts->redshift, J21_val, curr_vcb)`；`:496` `M_turn_r = reionization_feedback(consts->redshift, Gamma12_val, zre_val)`；`:497-498` 再与 `astro_params_global->M_TURN` 取 max。`ComputeTsBox` 的签名里**没有** `IonizedBox`。
- `T_γ` 是常数不是过程：`Constants.c:25` `.T_cmb = 2.7255`，用的时候写 `physconst.T_cmb * (1 + z)`。
- `#include` 面（实测）：`cosmology.h` 21 个 `.c`、`hmf.h` 11、`interp_tables.h` 11、`dft.h` 8、`thermochem.h` 8、`filtering.h` 7、`scaling_relations.h` 5、`fdm.h` 4、`heating_helper_progs.h` 3、`map_mass.h` 3、`Stochasticity.h` 3、`photoncons.h` 3、`elec_interp.h` 3、`recombinations.h` 2、`bubble_helper_progs.h` 2、`LuminosityFunction.h` 1。
- 真源现状：`docs/notes/physics-chain/chain.json` 有 19 节点 + 5 drivers（共 24 个对象）、34 条边、10 个块。其中 `block:env` 的成员是 `tgamma` / `fstar` / `k_target`（三种性质不同的东西混在一个"带"里）；34 条边里 `q_hii -> eps_heat`（标 `Eq.7`）在代码里没有实现。

**约束**

- 页面既有机制（子图标签页、块节点类型、渲染层、参数检索、状态条）由 `graphify-physics-chain-tree` 与 `graphify-chain-param-sidebar` 落地，本次**继承不改**，只换块表与关系。
- "表面讲物理、实现进子图"这条纪律保留。本设计不违背它：代码的 `Compute*` 步本身就是物理单元（"气体热与自旋温度"是物理量，不是"怎么算"）。

## Goals / Non-Goals

**Goals**

- 一级的块与代码同构：块边界 = 作者划的模块边界，块成员 = 该模块产出的量。
- 跨块关系可证伪：每条关系附代码出处，且能按"主序 / 反馈 / 共享内核"归位。
- 把代码里真实存在、旧方案没有对应物的东西显式化：`XraySourceBox` 这个整块、三条反馈边、共享内核层。

**Non-Goals**

- 不动 `src/py21cmfast/` 任何代码（本次只读代码取锚）。
- 不重做子图机制、渲染层、检索与状态条。
- 不追求"把代码里所有量都搬上图"——成员集以现有 24 个对象为底，只补块表必需的少量新成员。

## Decisions

### D1 一级 = 10 个过程块 + 2 个层（块边界取代码锚）

一个过程块对应代码里一个"算一次、能单独缓存"的盒子，块名用物理语言，成员 = 该盒子产出的量。

| 块 | 物理名 | 代码锚（`.c` / `Compute*` / 盒子） | 主要旋钮 |
|---|---|---|---|
| M1 | 宇宙学背景与物质功率谱 | `cosmology.c` / `init_ps`,`dicke`,`sigma_z0`,`evaluate_sigma` / `CosmoTables` | `CosmoParams`、`POWER_SPECTRUM` |
| M2 | 初始条件 | `InitialConditions.c` / `ComputeInitialConditions` / `InitialConditions` | `SimulationOptions`、`USE_RELATIVE_VELOCITIES` |
| M3 | 引力扰动 | `PerturbedField.c` + `map_mass.c` / `ComputePerturbedField` / `PerturbedField` | `PERTURB_ALGORITHM`、`PERTURB_ON_HIGH_RES` |
| M4 | 晕目录与质量函数 | `HaloCatalog.c` + `hmf.c` + `Stochasticity.c` + `integral_wrappers.c` / `ComputeHaloCatalog` / `HaloCatalog` | `SOURCE_MODEL`、`SAMPLE_METHOD`、`HMF_FINDEX`、`FDM` |
| M5 | 晕到星系属性 | `scaling_relations.c` + `PerturbedHaloCatalog.c` + `LuminosityFunction.c` / `ComputePerturbedHaloCatalog` / `PerturbedHaloCatalog` | `F_STAR10`、`ALPHA_STAR`、`t_STAR`、`L_X`、`F_ESC10`、`POP2/3_ION` |
| M6 | 网格化源项 | `HaloBox.c` / `ComputeHaloBox` / `HaloBox` | `USE_MINI_HALOS`、`INHOMO_RECO`、`USE_TS_FLUCT` |
| M7 | X 射线源的历史卷积 | `heating_helper_progs.c` / `UpdateXraySourceBox` / `XraySourceBox` | `N_STEP_TS`、`R_MAX_TS`、`NU_X_*`、`HEAT_FILTER` |
| M8 | 气体热与自旋温度 | `SpinTemperatureBox.c` + `thermochem.c` + `elec_interp.c` / `ComputeTsBox` / `TsBox` | `USE_X_RAY/CMB/LYA_HEATING`、`CLUMPING_FACTOR` |
| M9 | 电离场 | `IonisationBox.c` + `recombinations.c` + `bubble_helper_progs.c` + `photoncons.c` / `ComputeIonizedBox` / `IonizedBox` | `INHOMO_RECO`、`CELL_RECOMB`、`R_BUBBLE_MAX`、`PHOTON_CONS_TYPE` |
| M10 | 亮温与观测 | `BrightnessTemperatureBox.c` + `ComputeTau` + 光锥 / `ComputeBrightTemp` / `BrightnessTemp` | `MAX_DVDR`、`compute_tau` |
| L0 | 常数与网格层 | `Constants.c` + `SimulationOptions` | `HII_DIM`/`DIM`/`BOX_LEN`/`Z_HEAT_MAX` |
| L1 | 共享内核层 | `cosmology.h`(21)、`hmf.h`(11)、`interp_tables.h`(11)、`dft.h`(8)、`thermochem.h`(8)、`filtering.h`(7)… | — |

**Alternatives considered**：把 M4 拆成"质量函数"与"晕抽样"（对应 `SOURCE_MODEL` 两条实现路径）→ 否决，两条路径产出同一个 `HaloCatalog`，是同一模块内的实现选择，按页面纪律进子图。把 M7 并进 M8 → 否决，`XraySourceBox` 是独立缓存盒子且有独立旋钮组。

### D2 现有 24 个对象的归块映射

| 新归属 | 对象 |
|---|---|
| M1 | **新增** `matter_power`（`CosmoTables` 的 Δ²(k)；旧方案的 24 个对象里没有它） |
| M2 | **新增** `vcb`（`InitialConditions` 的 `lowres_vcb`；同一条也是 M2→M6 反馈边的源） |
| M3 | **新增** `perturb_field`（`PerturbedField` 的密度/速度盒子） |
| M4 | `hmf_impl`、`dn_dm`、`mmin`、`tvir_min` |
| M5 | `scaling_relations`、`rho_star`、`phi_uv`、`fstar`、`lx` |
| M6 | `source_grid`、`nion`、`zeta` |
| M7 | **新增** `filtered_xray`（X 射线加热源；旧方案无对应物） |
| M8 | `eps_heat`、`tk`、`jalpha`、`xalpha`、`xc`、`ts` |
| M9 | `q_hii` |
| M10 | `dtb`、`p21`、`tau_e`、`k_target` |
| L0 | `tgamma` |
| L1 | 16 个公共头文件（层成员，不是"量"） |

**总数从 24 变 28**：`tgamma`/`fstar`/`k_target` 从 ⓪ 带散到 L0 / M5 / M10，另**新增 4 个节点** `matter_power` / `vcb` / `perturb_field` / `filtered_xray`。这 4 个正是"旧方案按论文抄、于是完全没对应物"的四个盒子产物（`CosmoTables`、`InitialConditions`、`PerturbedField`、`XraySourceBox`）；不加它们，M1/M2/M3/M7 在图上就是空块——切块的判据既然改成"代码模块"，块就必须有成员，否则图会把四个真实存在的计算环节画成不存在。`zeta` 保留在 M6 并标为"旧口径的等效旋钮"（对应 `HaloBox.n_ion` 的整体归一化）。

**Alternatives considered**：让 M1/M2/M3 允许空成员（规格上合法）→ 否决，10 个过程块里 3 个空着、另 4 个有成员的块之间没有上游可画，主序会被截断；只补 `filtered_xray` 一个（保持 24）→ 否决，同一把尺子要么全用要么全不用。若你要回到 24，做法是删这 4 个节点、同时允许空成员块，两者必须一起改。

**Alternatives considered**：`phi_uv` 单列一块（它有独立的 `ComputeLF`）→ 否决，`LuminosityFunction.c` 吃 `hmf.h` / `thermochem.h` / `interp_tables.h`，是 M4+M5 的派生观测；若你要"观测量集中"，可改列为 M10 成员（可逆，见文末）。

### D3 关系 = 三类数据事实（每条带代码出处，不带论文等式）

**① 主序（同一红移内，由签名决定）**

```
L0 ──(常数/网格)──▶ 全部
M1 ──(σ(R), dn/dM, D(z))──▶ M2, M4
M2 ──(线性场/位移/vcb)──▶ M3, M6, M9
M3 ──(欧拉密度/速度)──▶ M4, M8, M9, M10
M4 ──(晕质量/位置)──▶ M5, M6
M5 ──(sfr/ion_emissivity/xray/fesc)──▶ M6
M6 ──(halo_sfr, halo_xray)──▶ M7
M6 ──(halo_sfr, halo_sfr_mini)──▶ M8
M6 ──(n_ion, whalo_sfr)──▶ M9
M7 ──(filtered_xray)──▶ M8
M8 ──(J_21_LW, xray_ionised_fraction, kinetic_temp_neutral)──▶ M9
M8 ──(spin_temperature)──▶ M10
M9 ──(neutral_fraction)──▶ M10
```

**② 反馈（跨红移逆序回流，全部回到 M6 的 `M_turn`）**

| 边 | 代码 | 含义 |
|---|---|---|
| M8 → M6 | `HaloBox.c:495` `lyman_werner_threshold(z, J21_val, curr_vcb)` | LW 背景改写 `M_turn_m` |
| M9 → M6 | `HaloBox.c:496` `reionization_feedback(z, Gamma12_val, zre_val)` | 电离反馈改写 `M_turn_r` |
| M2 → M6 | `HaloBox.c:487` `ini_boxes->lowres_vcb` | 相对速度改写 `M_turn` |

**③ 共享内核**：按 Context 里的 `#include` 计数排序，作为 L1 层的成员清单。

**Alternatives considered**：把反馈画成"同一红移内的边"→ 否决，会与主序混淆且丢掉"跨红移"这个唯一特征；把反馈边只放进子图不上一级 → 否决，一级会重新变成"无法表达反馈环"。

### D4 `tier` 退场，改由"顺序 + 反馈"推出

代码里没有层级，只有"一个 z 内的调用顺序"与"跨 z 回流"。故块的纵向位置由主序拓扑深度算出，反馈边反向画（箭头朝上、独立样式），不再在真源里手写 `tier`。档位若保留，只能作美术，MUST NOT 参与筛人（沿用既有的"分档只是视觉"纪律）。

**Alternatives considered**：保留手写 `tier` → 否决，它会再次与代码顺序矛盾（现状 ④ 在 ⑤ 之下就是手写档位造成的）。

### D5 三处旧口径的处置

- **⓪ 环境带拆解**：`tgamma` → L0（`Constants.c` 的常数，不是"环境过程"）；`fstar` → M5（`AstroParams` 旋钮）；`k_target` → M10（分析侧输入）。旧 ⓪ 带作废。
- **② 晕质量阈值降级**：`tvir_min` / `mmin` → M4 成员。`M_TURN` 在代码里是**被反馈改写的参数**（`HaloBox.c:495-498`），不是独立过程。这与 D3 的反馈边是一体两面。
- **⑨ 观测带拆解**：`phi_uv` → M5；`tau_e` / `p21` → M10。观测不再是"带"，而是 M10 的产物 + M5 的派生量。

### D6 代码锚的校验方式

块的 `codeAnchor` 写成 `{ file, function, struct }`。自检（`check-physics-chain.mjs`）断言：①`file` 在工作区里存在；②`function` 出现在该文件里（纯文本匹配即可）；③成员互不重复且全量覆盖真源全部 28 个对象；④10 个过程块各至少 1 个成员；⑤零残留 `stage:*` 与旧块 id。锚失效即失败并报出块 id 与失效段。

### D7 与 `graphify-physics-chain-tree` 的取代与顺序

本变更**取代**该 change 的块表口径，继承其子图机制、块节点类型与渲染层。为避免主规格里同时存在两条互斥的一级口径：**先让 tree 作为"被取代"收口（不归档其块需求），再归档本变更**。本变更的 delta 写成自足形态（自行 REMOVE 旧的「一级只呈现物理主链」与「旁路与实现细节默认收起且一键可达」），因此不依赖 tree 先落地。

### D8 FDM 的画法（本仓库自带）

`fdm.c` / `fdm.h` 是 fork 自带（上游 v4.1.1 无此文件），被 `cosmology.c` / `hmf.c` / `interp_tables.c` 等 4 个 `.c` 引用，横切 M1 与 M4。画法：`fdm.h` 列进 L1 的共享内核清单，同时 M1 / M4 的子图里以"横切修正"身份显现（`MatterOptions.FDM` / `HMF_FINDEX` / `CosmoParams.m22` 三个旋钮挂 M4）。

## Risks / Trade-offs

- [新旧块表在真源里并存，容易改半套] → 一次到位：`blocks` 段整体重写，节点 `parent` 全量重算，自检加零残留断言（D6⑤）。
- [M8 合并了 6 个对象，块会明显偏大] → 这是代码事实（一次 `ComputeTsBox`），不是切分失误；块内用子图标签页分层展开，主图只画块。
- [反馈边反向画，可能被误读成"数据倒流"] → 用独立样式 + 图例写明"跨红移回流：下游的量在下一红移回到上游阈值"。
- [`q_hii → eps_heat` 删除后，旧稿引用它的地方会悬空] → 迁移时全局替换：`docs/notes/physics-chain/` 下引用该边的文字与 `papers.md` 的等式对照表同步改写。
- [tree change 未收口就归档本变更 → 主规格两条互斥口径] → D7 明确顺序；归档前先跑 `openspec list` 确认 tree 已收口。

## Migration Plan

1. **先记账**：把 `docs/notes/physics-chain/chain.json` 纳入版本管理（它的 git 状态需要你确认），否则真源改动无法 diff / revert。
2. 改真源 `blocks` 段（9+2 块、成员、`codeAnchor`）与 `nodes.parent`，删 `q_hii→eps_heat`，补反馈边与主序边。
3. 跑生成器 → 自检（D6 五条断言）→ 前端口径（`physicsChain.ts` / `PhysicsChainView.tsx` / `styles.ts`）。
4. 文档同步：`docs/notes/physics-chain/README.md` 第一、二节的划分依据、`docs/notes/graphify/G4-物理链.md`、`docs/DIRECTORY.md`。
5. **回滚**：真源单文件改动，`git checkout -- docs/notes/physics-chain/chain.json` 即可；生成物重跑即可再生。

## Open Questions（可延后，不影响规格与任务分解）

- 无。编号、层画法、`phi_uv` 归属、`chain.json` 版本管理四项均已定（见下）。

## 已定的四项（2026-09-30）

1. **编号**：块**不给圆圈数字**。理由实测：同屏已有三套 ⓪…⑨（①画布页层带 `build-atlas-graph.mjs:158/172/201/234` 手写"① 入口层/② 编排层/③ 备料层/④ 红移循环"，层带内步骤又是另一套"① compute_halo_grid…"；②IC 链 `ic-chains.mjs` 的 ③…⑨）。稳定身份用语义 id（`block:*`，已在用），显示用 `M1…M10`，论文对照表写"新块名 ← 旧 ①…⑨"。旧编号作废清单：`check-physics-chain.mjs` 9 处 + 前端 5 文件 6 处 + 生成器 1 处。
2. **层画法**：**A 方案**——L0/L1 是 `kind:'layer'` 节点，**带成员清单**（L1 成员 = 16 个头文件 + `#include` 计数），层不可进入子图、不计入过程数。
3. **`phi_uv`** → M5（按产出模块）。
4. **`chain.json` 的版本管理**：`docs/notes/physics-chain/` 整体**未被 git 跟踪**（`??`，`git ls-files` 为空，未被 ignore 命中）→ 本次先落备份 `chain.json.bak-20260930`，是否 `git add` 待定。
