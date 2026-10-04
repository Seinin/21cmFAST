# 展开前的基线清单

来源：真源快照 `docs/notes/physics-chain/chain.json.bak-20261001`，产物快照 `git show HEAD:Graphify/src/generated/physics-chain.json`。两份对拍一致：12 个块、每块的成员数与物理量成员数逐条相同、28 个物理量（23 节点 + 5 驱动）、46 条边。

## 12 个块与成员（成员 44 项 = 28 个物理量 + 16 个公共头文件）

| 块 | 名字 | 种类 | 成员 |
| --- | --- | --- | --- |
| `block:const` | 常数与网格层 | `layer` | `tgamma` |
| `block:kernel` | 共享内核层 | `layer` | `cosmology.h` `hmf.h` `interp_tables.h` `dft.h` `thermochem.h` `filtering.h` `scaling_relations.h` `fdm.h` `Stochasticity.h` `elec_interp.h` `heating_helper_progs.h` `map_mass.h` `photoncons.h` `bubble_helper_progs.h` `recombinations.h` `LuminosityFunction.h` |
| `block:cosmo` | 宇宙学背景与物质功率谱 | `process` | `matter_power` |
| `block:initial` | 初始条件 | `process` | `vcb` |
| `block:grav` | 引力扰动 | `process` | `perturb_field` |
| `block:halocat` | 晕目录与质量函数 | `process` | `hmf_impl` `dn_dm` `mmin` `tvir_min` |
| `block:galaxy` | 晕到星系属性 | `process` | `scaling_relations` `rho_star` `phi_uv` `fstar` `lx` |
| `block:halobox` | 网格化源项 | `process` | `source_grid` `nion` `zeta` |
| `block:xray` | X 射线源的历史卷积 | `process` | `filtered_xray` |
| `block:thermal` | 气体热与自旋温度 | `process` | `eps_heat` `tk` `jalpha` `xalpha` `xc` `ts` |
| `block:ionization` | 电离场 | `process` | `q_hii` |
| `block:obs` | 亮温与观测 | `process` | `dtb` `p21` `tau_e` `k_target` |

## 接口边 21 条（块对，`from > to`；跨界流动的量写在括号里）

| # | 块对 | 跨界流动的量 |
| --- | --- | --- |
| 1 | `block:halocat > block:galaxy` | `dn_dm`(dn/dM(M,z)) → `rho_star`(ρ̇*(z))<br>`mmin`(M_min(z)) → `scaling_relations`(标度关系(M_h))<br>`mmin`(M_min(z)) → `phi_uv`(φ(M_1500, z)) |
| 2 | `block:galaxy > block:halobox` | `scaling_relations`(标度关系(M_h)) → `source_grid`(源项的实现)<br>`fstar`(f*) → `nion`(Ṅ_ion(z))<br>`rho_star`(ρ̇*(z)) → `nion`(Ṅ_ion(z)) |
| 3 | `block:halobox > block:ionization` | `nion`(Ṅ_ion(z)) → `q_hii`(Q_HII(z) = 1 − x_HI(z)) |
| 4 | `block:galaxy > block:thermal` | `lx`(L_X) → `eps_heat`(ε_heat(z))<br>`rho_star`(ρ̇*(z)) → `jalpha`(J_α(z)) |
| 5 | `block:const > block:thermal` | `tgamma`(T_γ) → `tk`(T_K(z))<br>`tgamma`(T_γ) → `xalpha`(x_α)<br>`tgamma`(T_γ) → `ts`(T_S(z)) |
| 6 | `block:ionization > block:obs` | `q_hii`(Q_HII(z) = 1 − x_HI(z)) → `dtb`(δT_b(z))<br>`q_hii`(Q_HII(z) = 1 − x_HI(z)) → `p21`(P_21(k,z))<br>`q_hii`(Q_HII(z) = 1 − x_HI(z)) → `tau_e`(τ_e) |
| 7 | `block:thermal > block:obs` | `ts`(T_S(z)) → `dtb`(δT_b(z)) |
| 8 | `block:const > block:obs` | `tgamma`(T_γ) → `dtb`(δT_b(z)) |
| 9 | `block:cosmo > block:initial` | `matter_power`(σ(R) / Δ²(k)) → `vcb`(v_cb) |
| 10 | `block:cosmo > block:halocat` | `matter_power`(σ(R) / Δ²(k)) → `dn_dm`(dn/dM(M,z)) |
| 11 | `block:initial > block:grav` | `vcb`(v_cb) → `perturb_field`(δ(x), v(x)) |
| 12 | `block:initial > block:thermal` | `vcb`(v_cb) → `ts`(T_S(z)) |
| 13 | `block:initial > block:ionization` | `vcb`(v_cb) → `q_hii`(Q_HII(z) = 1 − x_HI(z)) |
| 14 | `block:grav > block:halocat` | `perturb_field`(δ(x), v(x)) → `dn_dm`(dn/dM(M,z)) |
| 15 | `block:grav > block:thermal` | `perturb_field`(δ(x), v(x)) → `tk`(T_K(z)) |
| 16 | `block:grav > block:ionization` | `perturb_field`(δ(x), v(x)) → `q_hii`(Q_HII(z) = 1 − x_HI(z)) |
| 17 | `block:grav > block:obs` | `perturb_field`(δ(x), v(x)) → `dtb`(δT_b(z)) |
| 18 | `block:xray > block:thermal` | `filtered_xray`(X 射线加热率) → `eps_heat`(ε_heat(z)) |
| 19 | `block:halocat > block:halobox` | `dn_dm`(dn/dM(M,z)) → `source_grid`(源项的实现) |
| 20 | `block:halobox > block:xray` | `source_grid`(源项的实现) → `filtered_xray`(X 射线加热率) |
| 21 | `block:initial > block:halobox` | `vcb`(v_cb) → `nion`(Ṅ_ion(z)) |

## 回流边 2 条（反向、不进主序拓扑）

| # | 从 | 到 | 源头量 → 被改的量 | 落点 |
| --- | --- | --- | --- | --- |
| 1 | `block:thermal` | `block:halobox` | `ts` → `nion` | `HaloBox.c:495（签名：SpinTemperatureBox.h 的 ComputeHaloBox 收 previous_spin_temp）` |
| 2 | `block:ionization` | `block:halobox` | `q_hii` → `nion` | `HaloBox.c:496（签名：HaloBox.c:563 的 ComputeHaloBox 收 previous_ionize_box）` |

## 计数

- 块 12（过程 10 + 层 2）
- 物理量 28（节点 23 + 驱动 5）
- 边 46（块内 16 + 跨块 30；跨块落在 21 个块对上）
- 过程 10 个，兜底名单 4 个成员

