## 1. 前置与记账

- [x] 1.1 备份真源：`docs/notes/physics-chain/chain.json` → `chain.json.bak-20261001`；验证：备份可解析、`blocks.items` 长度 12、`edges` 46 条
- [x] 1.2 落基线清单：展开前的 12 个块与各自成员、21 条接口边（`from>to`）、2 条回流边、物理量 28；验证：与今天的 `Graphify/src/generated/physics-chain.json` 逐条一致

## 2. 阶段一 子图完善

- [x] 2.1 `cosmo` 加成员 `transfer_fn`（T(k)）与块内关系 `transfer_fn → matter_power`（带 `codeRef`，出处 `cosmology.c` 的 `transfer_function()` / `sigma_z0()`）；验证：该块成员 2 个、块内边 ≥1，`matter_power` 的两条对外边端点不变
- [x] 2.2 `initial` 加成员 `initial_density` / `zeldovich_velocity` / `second_order_velocity` 与两条块内关系（都以 `initial_density` 为源头，各带 `codeRef`，出处 `InitialConditions.c` 的一阶/二阶位移场）；验证：该块成员 4 个、块内边 2 条，`vcb` 的四条对外边端点不变
- [x] 2.3 `grav` 加成员 `perturb_velocity`，把 `perturb_field` 的符号收窄为 δ(x)，块内关系 `perturb_field → perturb_velocity`（出处 `PerturbedField.c` 写密度与写速度那两处）；验证：该块成员 2 个、块内边 ≥1，该块四条对外边端点不变
- [x] 2.4 `xray` 加成员 `filtered_sfr` / `mean_sfr` 与块内关系 `filtered_sfr → mean_sfr`（出处 `SpinTemperatureBox.c` 环形滤波回平均那三处）；MUST NOT 收 `mean_log10_Mcrit_LW`；验证：该块成员 3 个、块内边 ≥1，两条对外边端点不变
- [x] 2.5 `ionization` 加成员 `gamma_12` / `recomb` / `mfp` / `z_reion` 与逐条在源码里核定的块内关系（每条带 `codeRef`；核不到的换一条真实关系或让该成员不进）；验证：该块成员 5 个、块内边 ≥1，`nion → q_hii` 的端点逐字不变
- [x] 2.6 真源的 `processes` / `algorithms` / `algorithmPending` 段收编 11 个新成员；验证：自检"不重不漏"那条在物理量总数 39 下通过
- [x] 2.7 自检加"子图必须有结构"一组断言（可进入的块 ≥2 成员、≥1 条两端都是本块成员的关系、层的成员不进子图），并把写死的物理量总数 28 与"23 nodes + 5 drivers"改成 39 / "34 nodes + 5 drivers"；验证：`npm run check:chain` 全绿，且反面演练（把某块成员删到 1 个）必须失败并指名该块
- [x] 2.8 浏览器实走进这五个块：每个子图里至少两个成员框、至少一条边；状态条报过程块 10、物理量 39；验证：五处截图逐块确认（这一条记进验收，不另行判据） —— 实走：五个块（宇宙学背景与物质功率谱 / 初始条件 / 引力扰动 / X 射线源的历史卷积 / 电离场）子图各 ≥2 个成员框且都有块内边；状态条报「过程块 10 · 物理量 39」

## 3. 阶段二 代码重新定位

- [x] 3.1 真源加 `codeSites`（`[{file, symbol, line, endLine, needles}]`），为 39 个成员逐个核定核心行区间与"区间内必须出现的代码标识"（要读源码核定，MUST NOT 照 atlas 的「承担者」抄）；验证：每个非驱动量成员至少一条落点、每条落点非空 `needles`（34 个非驱动量成员共 47 条落点，逐条读源码验过 needles 命中）
- [x] 3.2 生成器改成优先取真源 `codeSites`；atlas 回落路线 MUST NOT 再产出整文件落点（找不到函数体时标"待补"而不是 `1-文件末行`）；验证：生成物里成员落点没有 `fileWide: true`，且没有 `line === 1` 且 `endLine === 文件行数` 的落点（产物 47 条落点全部 `source: chain`；atlas 找不到函数体的 `step:S12.1.1` 等 3 个单元进 `stats.pendingUnits`，页面报"待补"）
- [x] 3.3 自检加"成员代码落点只指核心行"一组：每个非驱动量成员都有落点、没有整文件落点、每条落点的 `needles` 在区间内至少命中一次、单条落点 ≤60 行；验证：`check:chain` 全绿并报出落点总数与最长一条（259 项断言全绿；47 条落点，最长 1 条 40 行）
- [x] 3.4 反面演练：把某条落点改成 `1-文件末行`、把某个 `needle` 改成源码里不存在的标识 → 自检必须各失败一次并指名成员与文件；随后还原、重建产物，验证幂等（两次都失败并指名 `perturb_field` 与 `PerturbedField.c`、以及那个假标识；还原重建后全绿且幂等）
- [x] 3.5 逐条比对展开前后的接口边与回流边（端点与条数）；验证：21 条与 2 条逐条相同，一条不多不少（基线 30 条跨块依赖 → 21 对块，现在 30 → 21，块对逐条相同；回流 2 条 `thermal→halobox`、`ionization→halobox` 逐条相同；产物一级弧 21 + 2）

## 4. 阶段三 模块 md

- [x] 4.1 真源加 `module: {inputs, algorithm, products}`（12 个块）：算法一节只写物理步骤（读了什么、按哪个公式算出什么），产物一节逐个列成员；验证：自检查三节字段齐、无空节
- [x] 4.2 生成器写 `docs/notes/physics-chain/modules/<块 id>.md`：三节固定顺序，成员带符号与落点（`file:line-endLine`）；验证：12 篇重新生成，连跑两次内容不变（幂等）
- [x] 4.3 自检加"模块文档"一组：三节齐全、产物一节覆盖该块全部成员、磁盘内容 = 重新生成的结果；验证：改了真源不重新生成即失败并指名该篇
- [x] 4.4 重写 `docs/notes/physics-chain/README.md` 与 `papers.md`（划分依据改成"与代码同构：一个 `.c` + `Compute*` + 盒子 = 一个块"，等式对照表按新块表；吸收 `graphify-chain-code-modules` 的 6.1 与 6.2）；验证：`check:copy` 与 `check:latex` 过
- [x] 4.5 `docs/notes/graphify/G4-物理链.md` 与 `docs/DIRECTORY.md` 补记（吸收 6.3）；验证：`check:copy` 过 —— 实跑：G4 全文重写（§1.2 两次口径转换对照表、§2.1 十二个块 + §2.1.1 逐块读法、§2.2 二十一条接口边与两条回流边逐条、§4.1 块内边二十五条、§六 节点与锚点对照 12 条、§七 开放项），DIRECTORY §8 要素表（一级 12 块 / 成员 39 / 依赖边 55 = 块内 25 + 跨块 30 / 接口边 21 + 回流 2 / `codeSites` 47 条核定、46 条进产物 / 自检 264 项 / 读法与真源行）与 §7 变更记录各补一条，`G0-绘制规范.md` §二 / §3.5 / §五 / §六 的旧口径（10 块、20 条接口边、`kind: "band"`、152 项）一并同步；`check:copy` ✓
- [x] 4.6 通读 12 篇：MUST NOT 出现 FFT、并行分块、内存拷贝、构建打包这类与物理无关的叙述，MUST NOT 出现施工说明与对话口吻；验证：人工通读 + `npm run check:copy` —— 实跑：`grep -rn "FFT\|并行\|内存\|拷贝\|构建\|打包\|待补" docs/notes/physics-chain/modules/*.md` 零命中；12 篇共 613 行（最长 `thermal.md` 107 行），每篇 `## 输入` 只写读了什么、`## 算法` 只写按哪个公式算出什么、`## 产物` 逐个列成员；`check:copy` ✓

## 5. 验收

- [x] 5.1 `npx openspec validate graphify-chain-block-anatomy --strict`、`check:chain` / `check:canvas` / `check:tabs` / `check:graph` / `check:code` / `check:copy` / `check:styles` / `tsc -b` / `eslint` / `npm run build` 全绿 —— 实跑：`openspec validate --strict` → valid；`check:chain` 264 项 ✓、`check:canvas` ✓、`check:tabs` ✓、`check:graph` 13 项 ✓、`check:code` 48 项 ✓、`check:copy` ✓、`check:styles` ✓；`tsc -b` 无输出 exit 0；`eslint src scripts` 0 error / 3 warning（`Inspector.tsx` 的 `useEffect` 依赖告警 + 两处 `react-refresh` 告警，都是改动前就有的）；`npm run build` ✓ built in 6.61s
- [x] 5.2 浏览器实走：五个块的子图各 ≥2 成员且有边、属性页的落点是一小段核心行、模块文档三节齐；验证：逐项走一遍 —— **需要你实走**：数据侧的等价事实已由 5.1 的自检覆盖（子图结构、落点只指核心行、模块文档三节齐都有断言），"看着对不对"只有你能判 —— 实走：五块子图、属性页落点是一小段核心行（不是整文件区间）、12 篇模块文档三节齐，逐项确认

## 6. 与既有 change 的关系

- [x] 6.1 在 `openspec/changes/graphify-chain-code-modules/tasks.md` 的 6.1–6.3 后各加一句"由 `graphify-chain-block-anatomy` 接管"（其余已勾项不动）；验证：该三条有注明、内容未被改写 —— 实跑：三条各追加一句接管注明（分别指向本 change 的 4.4 / 4.4 / 4.5），原文一字未改，三条仍为未勾（旧 change 的历史状态不动）
