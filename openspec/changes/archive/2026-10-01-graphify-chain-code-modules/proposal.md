## Why

物理链页一级现有的划分口径是「一个天体物理过程 = 一个块」（`graphify-physics-chain-tree`，10 块 = 8 过程 + ⓪⑨两条带），依据是 Pritchard & Loeb 2012 的方程式叙事。实测这个划分**与代码结构不同构**，产生四类硬伤：

1. **切碎了代码里的一个单元**：`ComputeTsBox` 一次产出 `kinetic_temp_neutral` / `xray_ionised_fraction` / `J_21_LW` / `spin_temperature`（`SpinTemperatureBox.c:87`），被拆成 ⑤气体热史 / ⑥Lyα 耦合 / ⑦自旋温度三块；
2. **依赖方向画反了**：现有档位把「电离史」放在「气体热史」之下，而代码里 `ComputeIonizedBox(..., TsBox *spin_temp, ...)`（`IonisationBox.c:1315-1318`）是电离**吃**自旋温度（`IonisationBox.c:430, 539, 542` 用 `J_21_LW` / `xray_ionised_fraction` / `kinetic_temp_neutral`）；
3. **画了一条代码里不存在的边**：`q_hii → eps_heat`（P&L Eq.7 的叙事）。代码里加热率只来自 `XraySourceBox.filtered_xray`（`SpinTemperatureBox.c:766, 1676`），不吃 `q_hii`；
4. **漏了最重要的几条边**：反馈回流（`HaloBox.c:487, 495, 496` 的 `lowres_vcb` / `lyman_werner_threshold` / `reionization_feedback` 三条改写 `M_turn` 的边）、主序数据流、以及"源项只有一个出口"这个中心化设计。

作者本人已经把模块边界写在代码里，不必外求：**一个输出盒子 ↔ 一个 `Compute*` 函数 ↔ 一个 `.c` 文件**（`wrapper/outputs.py` 里 9 个盒子的 `_c_compute_function` 从 `lib.ComputeInitialConditions`(:508) 一路到 `lib.ComputeBrightnessTemp`(:1544)）；`_outputstructs_wrapper.h:54-59` 亲笔写着 `n_ion` / `whalo_sfr` / `halo_sfr` / `halo_xray` 是"**For IonisationBox.c and SpinTemperatureBox.c**"；`_inputparams_wrapper.h` 末尾写着参数结构应当"只含相关参数、**look at HaloBox.c**、随 `.c` 文件走"。按这个意图重切，一级与代码同构，而且**不牺牲"表面讲物理"这条纪律**——`ComputeTsBox` 这个单位本身就是物理量（"气体热与自旋温度"），不是"怎么算"。

时机：`graphify-physics-chain-tree` 的块表已经落地进生成物与页面（19/23），其 6.1/6.2/6.3 仍列着未决项，此刻重切只动块声明，代价最小。

## What Changes

- **划分依据易主**：一级的划分依据从「天体物理过程（按论文等式打包）」改为「**代码模块（按作者的 `.c` + `Compute*` + 输出盒子）**」。
- **块表重切为 10 过程 + 2 层**：10 个过程块（M1 宇宙学背景与功率谱 … M10 亮温与观测）+ 2 个非过程层（L0 常数与网格层、L1 共享内核层）。每个块 MUST 带一条机器可查的**代码锚**（`.c` 文件 + `Compute*` 函数 + 输出盒子结构名）。
- **跨块关系改成代码里的三类数据事实**（写进关系栏，带文件行号，不带论文等式）：①主序（同一 z 内的调用顺序，由函数签名决定）；②反馈（跨 z 逆序回流，`HaloBox.c:487/495/496` 三条）；③共享内核（按 `#include` 计数，如 `cosmology.h` 被 21 个 `.c` 引用）。
- **删除不存在的边**：`q_hii → eps_heat` 退场（代码里加热率不经 `q_hii`）。
- **补齐反馈边**：三条改写 `M_turn` 的回流必须在主图上可见（电离反馈 / LW 反馈 / vcb），否则一级无法表达"晕质量阈值是被反馈改写的参数"这一代码事实。
- **BREAKING**：作废 `graphify-physics-chain-tree` 的块表口径（①…⑨ + ⓪⑨ 两条带）。该 change 的子图机制、块节点类型、渲染层实现由本变更**继承**，只换块表与关系。
- **BREAKING**：`tier`（档位）不再手写分层，改为"循环内顺序 + 反馈反向"由数据推出，页面 MUST NOT 用档位做语义判断（沿用既有"分档只是视觉"纪律）。
- **代码锚可证伪**：自检 MUST 断言每个块的代码锚在仓库里真实存在（文件存在 + 函数名在该文件里出现），锚失效即失败。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-chain`：核心改动。「一级只呈现物理主链」的替代口径从"按天体物理过程打包"改为"按代码模块切块"；新增块的**代码锚纪律**、跨块关系的**三类数据事实**（主序 / 反馈 / 共享内核）、反馈边必须上主图；「旁路与实现细节默认收起且一键可达」保持 REMOVED；检索、状态条、子图展开三条既有口径沿用（块名与块数变了，机制不变）。

## Impact

- **真源**：`docs/notes/physics-chain/chain.json` —— `blocks` 段重写（9+2 块、每块带 `codeAnchor`）；`nodes` 的 `parent` 与 `tier` 重算；`edges` 删 1 条（`q_hii→eps_heat`）、补反馈边与主序边；`drivers` 重新归块。
- **生成器与自检**：`Graphify/scripts/build-physics-chain.mjs`（块与 `codeAnchor` 落进生成物）、`Graphify/scripts/check-physics-chain.mjs`（块断言改写为"代码锚存在 + 成员唯一归属 + 反馈边覆盖 + 层不进一级"）。
- **前端**：`Graphify/src/lib/physicsChain.ts`（块/层/反馈边的读取与检索口径）、`Graphify/src/components/PhysicsChainView.tsx`（反馈边反向画法、层与块的区分）、`Graphify/src/graph/styles.ts`（层样式）。
- **文档**：`docs/notes/physics-chain/README.md` 第一、二节（划分依据由"物理上独立"改为"与代码同构"）、`docs/notes/graphify/G4-物理链.md`、`docs/DIRECTORY.md`。
- **change 卫生**：`graphify-physics-chain-tree` 的块表口径被本变更取代 → 该 change 需先作为"被取代"收口（不归档其块需求），否则主规格里会同时存在两条互斥的一级口径。归档顺序：先 tree，后本变更。
- 不新增第三方依赖；不改动 `Graphify/data/graph.json`（画布 atlas）与画布页行为；不改动 `src/py21cmfast/` 下任何代码（本次只读代码取锚）。
