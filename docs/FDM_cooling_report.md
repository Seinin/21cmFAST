# FDM 冷却模型中 CDM 拟合因子的依赖审计

> **【2026-09-09 交叉引用】** 本报告的姊妹文档 **`docs/FDM_audit_report.md`**
> 处理的是 **HMF 通道**（条件/无条件 HMF 的 FDM 处理）与 Liu+25 论文的一致性审计。
>
> 两文的分工：
> - **本文（`FDM_cooling_report.md`）**：冷却链路中 CDM 校准因子的依赖审计（A–E 分类）
> - **审计报告（`FDM_audit_report.md`）**：HMF 通道的三方对照与冲突裁决
>
> 若需查证「条件 HMF 该不该乘 `dndm_FDM`」「σ 混合是否为 bug」「Liu 源码行号」等问题，
> **请直接查阅 `FDM_audit_report.md`**，本文不重复论证。

## 1. 问题陈述

21cmFAST 的气体冷却与反馈模型包含大量从 CDM 模拟中校准的经验参数。在 FDM（Fuzzy Dark Matter）下，是否需要修改这些参数？

**本报告的核心任务**：逐个核查冷却链路中每个参数的物理含义、原始论文校准背景、CDM 依赖程度，给出是否需要 FDM 修正的判定。

---

## 2. 代码冷却链路总览

```
Nion_ConditionalM_MINI = ∫ [nion_fraction × conditional_hmf] d(lnM)
                              │
        ┌─────────────────────┴──────────────────────┐
        │ nion_fraction_mini(lnM)                     │ conditional_hmf(lnM)
        │   │                                          │   │
        │   ├─ Fstar = PL(F_STAR7_MINI, α)             │   ├─ dNdM_conditional_EPS(CDM σ_ref)  [ST拟合]
        │   ├─ Fesc  = PL(F_ESC7_MINI, α)              │   └─ × dndm_FDM(exp lnM)              [FDM已实现]
        │   ├─ exp(-M/acg_thresh)                      │
        │   └─ exp(-Mturn_mcg / M)                     │
        │        │                                     │
        │        └─ Mturn_mcg = max( mcrit_RE,         │
        │                            max( mcrit_LW,    │
        │                                 mcrit_noLW)) │
        │              │                               │
        │              ├─ mcrit_noLW  = 3.314e7(1+z)^-1.5            [C类: CDM校准]
        │              ├─ mcrit_LW    = mcrit_noLW × (1+A_LW·J21^B)  [B类: CDM校准]
        │              └─ mcrit_RE    = SM13(Γ, z, z_IN)              [C类: CDM NFW校准]
        │
        └─ TtoM(z, T, μ) 贯穿全程（所有温度阈值 → 质量阈值转换）        [A类: 物理常数]
```

**关键架构认知**：`conditional_hmf`（有多少晕）和 `nion_fraction`（哪些晕发光）是独立串联的。FDM 修正只需在 HMF 层面通过 `× dndm_FDM` 完成，冷却管线中的参数需单独评估 CDM 依赖。

---

## 3. 分类标准

| 类别 | 定义 | 判断准则 |
|------|------|---------|
| **A** | 物理常数，无模拟校准 | 数值来自量子/分子/原子物理或宇宙学定义 |
| **B** | CDM 模拟校准，但描述的是 DM-无关的物理 | 函数形式描述气体化学/辐射转移/流体力学 |
| **C** | CDM 校准，且隐含 CDM 晕结构假设 | 校准依赖 NFW 密度轮廓等 CDM 特有属性 |
| **D** | 唯象参数，调参即可，无需改公式 | 描述晕内天体物理，不论 CDM/FDM 同类晕不应有系统差异，但最优值会因 dndm_FDM 而不同 |
| **E** | 物理尺度远大于 FDM 截止尺度 | FDM 量子压力影响 < 0.1%，可忽略 |

---

## 4. 完整参数依赖表

### 4.1 基础物理参数（A类）

| 参数 | 默认值/公式 | 物理来源 | 代码路径 |
|------|-----------|---------|---------|
| `TtoM(z, T, μ)` | `7030.97/h · √(Ωm(z)/(Ωm·Δc)) · [T/(μ(1+z))]^3/2` | Virial 定理 (Barkana & Loeb 2001) | `cosmology.c:671` |
| `deltac_nonlinear(z)` | `18π² + 82[Ωm(z)-1] − 39[Ωm(z)-1]²` | 球对称坍缩 (Bryan & Norman 1998) | `cosmology.c:658` |
| `atomic_cooling_threshold` | `TtoM(z, 10⁴ K, 0.59)` | Lyα 激发能 10.2 eV | `thermochem.c:278` |
| `molecular_cooling_threshold` | `TtoM(z, 600 K, 1.22)` | H₂ 转动-振动冷却 = 绝热膨胀率 | `thermochem.c:280` |

> **判定**：全部不依赖 CDM。TtoM 中 Δc 的 Bryan-Norman 拟合系数虽然从 SCDM N-body 获得，但球坍模型在 FDM virial 尺度（量子压力亚主导）依旧适用，差异可忽略。

### 4.2 LW 反馈（B/C 类）

**实现**（`thermochem.c:282`）：

$$M_{\text{crit}}^{\text{LW}}(z) = \underbrace{3.314\times 10^7 (1+z)^{-1.5}}_{\text{mcrit\_noLW}} \times \underbrace{(1 + A_{\text{LW}} J_{21}^{B_{\text{LW}}})}_{\text{LW 倍增}} \times \underbrace{\left(1 + A_{\text{VCB}} \frac{v_{\text{cb}}}{\sigma_{\text{VCB}}}\right)^{B_{\text{VCB}}}}_{\text{VCB 倍增}}$$

#### 论文校准链

| 论文 | 贡献 | DM 模型 |
|------|------|:--:|
| Stacy, Bromm & Loeb (2011, MNRAS 413, 172) | 首次 CDM+gas 分子冷却 cosmological 模拟 | **CDM** |
| Greif et al. (2011, ApJ 737, 75) | 同上，独立验证 | **CDM** |
| Fialkov, Barkana, Tseliakhovich & Hirata (2012, MNRAS 424, 1335) | 拟合 Stacy+11/Greif+11 模拟，给出 M_min(v_cb, z) | **CDM 校准** |
| Visbal et al. (2015, Nature 528, 357) | 从 Fialkov+12 提取最优拟合：3.314×10⁷ (1+z)^(-1.5) | **CDM 校准** |
| Schauer, Glover, Klessen & Clark (2020, MNRAS 507, 1775) | 高分辨率 CDM+gas 模拟，发现 LW 反馈更弱（H₂ 自屏蔽被低估） | **CDM** |
| Muñoz et al. (2021, arXiv:2110.13919) | 综合多项模拟，推荐 A_LW=2.0, BETA_LW=0.6 | **CDM 综合** |

> 代码注释 (`thermochem.c:272-278`) 原文：*"correction follows Schauer+20, fit jointly to LW feedback and relative velocities. They find weaker effect of LW feedback than before (Stacy+11, Greif+11, etc.) due to HII self shielding. this follows Visbal+15, which is taken as the optimal fit from Fialkov+12 which was calibrated with the simulations of Stacy+11 and Greif+11"*

#### 逐参数判定

| 参数 | 默认值 | 类别 | 理由 | 建议 |
|------|--------|:--:|------|------|
| `mcrit_noLW` | `3.314×10⁷ (1+z)^(-1.5)` | **C** | 从 CDM NFW 晕的 H₂ 形成模拟中拟合。FDM soliton 平核需更大 M_vir 达到同等中心气体密度 | **FDM 下变化最大的参数。** 建议预留 `FDM_COOLING_BOOST` 占位（默认 1.0） |
| `A_LW` | 2.0 | **B** | H₂ 光解离倍增因子。光解离截面是分子物理常数，但数值来自 CDM 模拟拟合 | 暂保留，待 FDM+gas 模拟校准 |
| `BETA_LW` | 0.6 | **B** | 同上 | 同上 |
| `A_VCB` | 1.0 | **B** | v_cb 对气体吸积的影响是流体力学，不依赖 DM。Muñoz+21 确认 A_VCB=1.0 "agrees between different sims" | 暂保留 |
| `BETA_VCB` | 1.8 | **B** | 同上 | 暂保留 |
| `σ_VCB` | 29.0 km/s | **E** | BAO 尺度（~100 Mpc）≫ FDM 截止尺度（~kpc），T_F(k) 影响 < 0.1% | 不修改 |

> `inputs.py:1242-1250` 存档了两个版本：Machacek+01（A_LW=22.86, BETA_LW=0.47）和 Muñoz+21（A_LW=2.0, BETA_LW=0.6）。代码默认使用后者。

### 4.3 再电离反馈（C 类）

**实现**（`thermochem.c:26-30,302-307`，SM13 参数化）：

$$M_{\text{crit}}^{\text{RE}} = M_0 \times (B \cdot \Gamma_{\text{HII}})^{a} \times \left(\frac{1+z}{10}\right)^{b} \times \left[1 - \left(\frac{1+z}{1+z_{\text{IN}}}\right)^{c}\right]^{d}$$

其中：

| 符号 | 代码常量 | 默认值 | 含义 |
|------|---------|--------|------|
| $M_0$ | `REION_SM13_M0` | $3\times 10^9\; M_\odot$ | 参考特征质量 |
| $a$ | `REION_SM13_A` | 0.17 | 电离背景 $\Gamma$ 的幂律指数 |
| $b$ | `REION_SM13_B` | −2.1 | $(1+z)/10$ 的幂律指数 |
| $c$ | `REION_SM13_C` | 2.0 | 再电离进度 $1-(1+z)/(1+z_{\text{IN}})$ 的内指数 |
| $d$ | `REION_SM13_D` | 2.5 | 再电离进度项的外指数 |
| $B$ | `HALO_BIAS` | 2.0 | 晕偏置常数近似 |

#### 校准背景

| 论文 | 内容 | DM 模型 |
|------|------|:--:|
| Sobacchi & Mesinger 2013, Paper I (MNRAS 432, L51) | 球对称坍缩 + **固定 NFW 暗物质势阱** + 气体流体力学 + UVB 加热，测量 M_min(Γ, z) | **CDM NFW 势** |
| Sobacchi & Mesinger 2013, Paper II (MNRAS 432, 3340) | 将 Paper I 的 M_min 参数化引入半数值再电离模拟 | **CDM** |

**核心问题**：SM13 使用固定 NFW 势阱（尖点 ρ ∝ r⁻¹）。FDM soliton 平核 → 同一 M_vir 的中心引力势更浅 → 气体更容易被 UVB 光致蒸发吹散 → M_min 更大。

| 参数 | 默认值 | 类别 | 理由 | 建议 |
|------|--------|:--:|------|------|
| M₀ | 3×10⁹ M_sun | **C** | CDM NFW 势阱校准 | FDM 下 M₀ 可能偏小 |
| a=0.17, b=-2.1, c=2.0, d=2.5 | — | **C** | 同上 | FDM 下可能不同 |
| HALO_BIAS | 2.0 | **C** | 常数近似，CDM 下约 2-3。FDM 小晕被压制后有效偏置更高，但差异 < 近似本身误差 | 不修改 |

### 4.4 晕内天体物理参数（D 类）

**D 类定义**：描述晕内部 gas → 恒星 → 辐射转换效率的参数。它们的公式本身描述的是晕内天体物理，不依赖 DM 类型——FDM 影响的是「有多少晕存在」（通过 `conditional_hmf × dndm_FDM`），而不改变「单个晕是否发光」的物理规律。

**与 C 类的本质区别**：
- **C 类**（如 mcrit_noLW）：公式是 CDM NFW 晕结构 → 气体冷却的映射，FDM soliton 平核下**这条映射本身就变了**，需要 FDM+gas 模拟重新校准公式系数。
- **D 类**（如 F_STAR10, M_TURN）：公式描述恒星形成效率等晕内物理，不论 CDM 还是 FDM 晕，同类晕的 f* 不应有系统差异。所以**公式不需要因 FDM 改写**。但由于 dndm_FDM 砍掉了小晕，同样的参数值在 FDM 下会输出更少的 Nion——如果想匹配同样的观测数据，你自然会为 FDM 选一组不同的参数值。**这是手动调参的行为，不是公式层面的 FDM 修正。**

#### 代码中的角色

这些参数通过 `set_scaling_constants()` (`scaling_relations.c:36`) 写入 `ScalingConstants` 结构体，然后由 `Nion_General_MINI()` (`hmf.c:904`) 填入 `parameters_gsl_MF_integrals`，最终在 `nion_fraction_mini()` (`hmf.c:397`) 的积分核中使用：

```c
// hmf.c:397-403 — MINI 晕每对数质量区间的电离光子数
double nion_fraction_mini(double lnM, void *param_struct) {
    struct parameters_gsl_MF_integrals p = ...;
    double Fstar = log_scaling_PL_limit(lnM, p.f_star_norm, p.alpha_star, 1e7, p.Mlim_star);
    double Fesc  = log_scaling_PL_limit(lnM, p.f_esc_norm,  p.alpha_esc,  1e7, p.Mlim_esc);
    double M = exp(lnM);
    return exp(Fstar + Fesc - M / p.Mturn_upper - p.Mturn_mcg / M + lnM);
}
```

| 参数字段 | Python 参数 | 默认值 | 在式中的角色 | 判定 |
|----------|------------|--------|-------------|:--:|
| `p.f_star_norm` | `F_STAR7_MINI` | `F_STAR10 − 3×ALPHA_STAR` | log f*(M=10⁷ M_sun)：分子冷却晕的恒星形成效率归一化 | **D** |
| `p.alpha_star` | `ALPHA_STAR_MINI` | `= ALPHA_STAR` | f*(M) ∝ M^α 的幂律指数 | **D** |
| `p.f_esc_norm` | `F_ESC7_MINI` | 10⁻² | log f_esc(M=10⁷ M_sun)：电离光子逃逸分数 | **D** |
| `p.alpha_esc` | `ALPHA_ESC` | — | f_esc(M) 的幂律指数（与 ACG 共用） | **D** |
| `p.Mturn_mcg` | LW+VCB+SM13 联合计算 | 见 4.2/4.3 | exp(−M_turn/M)：低质量端指数截断 | **B/C** |
| `p.Mturn_upper` | `acg_thresh` | z-dependent (T_vir=10⁴ K) | exp(−M/M_acg)：高质量端截断（超出分子冷却范围） | **A** |
| — | `L_X_MINI` | `= L_X` | X 射线光度 / SFR（`scaling_relations.c:62`），用于 `Xray_General()` | **D** |
| — | `M_TURN` | 10^8.7 M_sun | ACG 的 SN/光加热截断质量（`scaling_relations.c:80`，仅 ACG 路径使用） | **D** |
| — | `ION_Tvir_MIN` | 10^4.7 K | 电离源积分下限（`hmf.c:1262`），FDM 的影响在 HMF 中已囊括 | **D** |
| — | `F_H2_SHIELD` | 0.0 | H₂ 自屏蔽因子（`inputs.py:1237-1240`），分子云内部物理，与宿主晕 DM 类型无关 | **B** |

### 4.5 HMF / 结构形成参数

| 参数 | 默认值 | 类别 | 校准来源 | 判定 |
|------|--------|:--:|------|:--:|
| ST HMF (a=0.73, p=0.175, A=0.353) | `hmf.c:269-281` | **B/C** | Sheth & Tormen 2001, 从 Jenkins+01 CDM N-body 校准 | CDM σ + ST 拟合 + dndm_FDM 是 FDM 文献标准 (Schive+16, Du+17, Liu+25)，不修改 |
| EPS 条件质量函数 | `hmf.c:285-298` | **A** | Bond+91 / Lacey & Cole 93 | 纯统计框架，不依赖 DM 类型 |
| dndm_FDM | `fdm.c:51-55` | **—** | Schive+16 SP 模拟 | **已实现 ✓** |
| HMF_FINDEX | -1.1 | **—** | Schive+16 拟合 | **已实现 ✓** |
| m22 | — | **—** | FDM 粒子质量 | **用户输入** |

> **关于 dndm_FDM 的命名**：代码注释中的 "high-mass cutoff" 是误导性的。实际负指数 -1.1 压制的是 **小质量晕**（M ≪ M₀ → f(M) → 0），应理解为 "low-mass suppression"。

---

## 5. Nion 积分链路的完整依赖标注

```
Nion_ConditionalM_MINI
  = ∫ nion_fraction_mini × conditional_hmf  d(lnM)
      │
      ├─ nion_fraction_mini(lnM):
      │    ├─ Fstar(lnM)      → F_STAR7_MINI, ALPHA_STAR_MINI    [D]
      │    ├─ Fesc(lnM)       → F_ESC7_MINI, ALPHA_ESC            [D]
      │    ├─ exp(-M/M_acg)                                       [A]
      │    └─ exp(-Mturn_mcg/M)
      │         │
      │         └─ Mturn_mcg = max( Mturn_RE, max(Mturn_LW, mcrit_noLW) )
      │              ├─ Mturn_RE  → SM13(Γ, z)                    [C]
      │              ├─ Mturn_LW  → mcrit_noLW × (1+A_LW·J21^B)  [B/C]
      │              └─ mcrit_noLW → 3.314e7(1+z)^-1.5            [C]
      │
      └─ conditional_hmf:
           ├─ dNdM_conditional_EPS(CDM σ_ref)                     [B/C]
           └─ × dndm_FDM(lnM)                                     [FDM ✓]
```

---

## 6. 结论与行动建议

### 6.1 按优先级排序

| 优先级 | 参数 | 类别 | 行动 |
|:--:|------|:--:|------|
| **P0** | dndm_FDM | — | **已完成** — `conditional_hmf` 和 `unconditional_hmf` 均已接入 |
| **P1** | mcrit_noLW (3.314×10⁷) | C | **最大不确定性** — 建议预留 `FDM_COOLING_BOOST` 乘法因子（默认 1.0），待 FDM+gas 模拟数据重新校准 |
| **P1** | SM13 reionization_feedback 参数 | C | 从 CDM NFW 势校准，FDM 平核下光致蒸发更有效，M₀ 和 a/b/c/d 可能需要重校 |
| **P2** | A_LW, BETA_LW, A_VCB, BETA_VCB | B | 暂保留 CDM 校准值，待 FDM+gas 模拟验证 |
| **P3** | M_TURN, F_STAR7_MINI 等 | D | 晕内天体物理公式不需要 FDM 修正；在 FDM 下如需匹配同一组观测数据，这些参数的手动取值会与 CDM 不同 |
| **不修改** | A, E 类全部参数 | A/E | 物理常数或尺度分离，不受 FDM 影响 |

### 6.2 架构正确性确认

冷却管线中的两条链路是独立串联的：
- **`conditional_hmf`**：通过 `dndm_FDM` 决定了 FDM 下有多少晕存在（**一阶效应，已实现**）
- **`nion_fraction`**：决定了给定晕是否发光（冷却/反馈物理，需要评估 CDM 校准依赖）

FDM 的量子压力通过**通道 1**（减少晕的数量，dndm_FDM）已经实现。**通道 2**（soliton 平核影响单晕冷却效率）目前没有公认模型，体现在 C 类参数的不确定性中。

---

## 参考文献

**FDM 物理**：Schive et al. 2016, Nature Physics 12, 191 · Hu, Barkana & Gruzinov 2000, PRL 85, 1158 · Liu et al. 2025 · Du et al. 2017, MNRAS 465, 941

**CDM 冷却/反馈校准**：Machacek, Bryan & Abel 2001, ApJ 548, 509 · Stacy, Bromm & Loeb 2011, MNRAS 413, 172 · Greif et al. 2011, ApJ 737, 75 · Fialkov et al. 2012, MNRAS 424, 1335 · Visbal et al. 2015, Nature 528, 357 · Schauer et al. 2020, MNRAS 507, 1775 · Muñoz et al. 2021, arXiv:2110.13919 · Qin et al. 2020

**CDM 再电离反馈**：Sobacchi & Mesinger 2013 (Paper I), MNRAS 432, L51 · Sobacchi & Mesinger 2013 (Paper II), MNRAS 432, 3340

**CDM 结构形成/宇宙学**：Barkana & Loeb 2001, Phys. Rept. 349, 125 · Bryan & Norman 1998, ApJ 495, 80 · Jenkins et al. 2001, MNRAS 321, 372 · Sheth & Tormen 2001, MNRAS 323, 1 · Tseliakhovich & Hirata 2010, PRD 82, 083520

**21cmFAST**：Park et al. 2018, MNRAS 484, 933
