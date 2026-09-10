# FDM 实现中 HMF 的处理方案

## 无条件 HMF vs 条件 HMF 的用途

| 函数 | 范围 | 用在哪 |
|------|------|--------|
| **无条件 HMF** (`unconditional_hmf`) | 全局、全宇宙平均 | 归一化因子、光度函数、再电离历史 ODE |
| **条件 HMF** (`conditional_hmf`) | 逐格点、依赖 δ(x) | 每个格点的 f_coll / N_ion / X-ray 积分 + 离散采样表 |

### 无条件 HMF 的用途

1. **全局归一化 / mean-fixing**

   计算整个模拟箱的平均坍缩比例、平均光子产率、平均中性质数密度等**全局量**，用作对条件结果的归一化基准：

   ```c
   // IonisationBox.c — 全局平均 f_coll
   curr_box->mean_f_coll = Fcoll_General(z, lnMmin, lnMmax);  // → 用无条件 HMF 积分

   // IonisationBox.c — 全局平均 N_ion
   f_coll_curr = Nion_General(z, lnMmin, lnMmax, mturn, &sc);  // → 也用无条件 HMF 积分
   ```

   这些全局平均值后续被用来对每个格点的条件积分结果做 mean-fixing：

   ```c
   // SpinTemperatureBox.c:1619
   avg_fix_term = mean_sfr_zpp[R_ct] / ave_fcoll;
   // 全局平均 / 条件平均 → 修正因子
   ```

2. **光度函数**

   计算 UV 光度函数时，直接乘无条件 HMF：

   ```c
   // LuminosityFunction.c
   log10phi = log10( unconditional_hmf(...) / M * exp(-M_turn/M) * const * duty_factor / dMuvdM );
   ```

3. **全局再电离历史**

   光子守恒积分（独立于格点的全局 ODE）：

   ```c
   // photoncons.c
   Nion0 = Nion_General(z0, lnMmin, lnMmax, mturn, &sc);  // 无条件
   ```

### 条件 HMF 的用途

1. **每个格点的条件 f_coll / N_ion 计算**

   `IonisationBox.c` 中，对每个格点 (x⃗)，用**该格点的 δ** 计算条件积分：

   ```c
   Splined_Fcoll = EvaluateNion_Conditional(curr_dens, ...);
   // 对质量从 M_min 到 M_cond 积分 c_nion_integrand
   ```

   被积函数链：
   ```
   c_nion_integrand → nion_fraction × c_mf_integrand → nion_fraction × conditional_hmf
   ```

   条件 HMF 是每个格点 f_coll 的核心输入。

2. **离散采样的采样表**

   `stoc_set_consts_cond` 在建立 F⁻¹ 插值表时用的也是条件 HMF（`initialise_dNdM_tables` 内部调用）。

### 关系总结

条件 HMF 给出格点之间的相对差异，无条件 HMF 提供全局归一化基准。格点的物理量：

$$\text{格点物理量} = \text{条件积分结果} \times \frac{\text{全局无条件平均}}{\text{格点条件平均}}$$

确保箱平均和全局一致。

---

## FDM 修改：条件 HMF 应当如何改

> **【2026-09-09 修订】** 本节原有结论「条件 HMF 不能加 `dndm_FDM`」已被**推翻**。
> 经对照 Liu et al. 2025 (PRD 112, 103534) 论文原文与 `D:\v21cmFAST` 原始源码核实：
> Liu 论文**明确要求**条件 HMF 保留 $f_{\rm FDM}$ 因子，且给出了环境调制的 ansatz（Eq.(5)）。
> 详见 `docs/FDM_audit_report.md` §3–§5。以下保留原文并附更正。

**这是故意设计的，不是遗漏。**——此判断**已过时**，见下 §3 更正。

### 1. σ(M) 统一用 CDM 参考值

在 FDM 模式下，`EvaluateSigma` 和 `EvaluatedSigmasqdm` 实际走的是 `sigma_z0_pre`（CDM reference，不含 $T_F$），这是全局设定：

```c
// interp_tables.c
// FDM: use CDM-reference sigma table (no T_F cutoff) for HMF calculations
if (matter_options_global->FDM)
    return EvaluateRGTable1D_f(lnM, &Sigma_InterpTable_CDM);
```

所以无条件和条件 HMF 用的都是**同一套 CDM σ(M)**，保证了数学自洽性。

> **【修订注】** 这个「统一」恰恰是问题所在。按 Liu Eq.(5)，条件 HMF 的分母应为
> $\sigma^2_{\rm CDM}(m) - \sigma^2_{\rm FDM}(M)$——**两个 σ 语义相反**：
> - $\sigma_1 = \sigma_{\rm CDM}(m)$（晕质量）→ 用 CDM 表 ✓
> - $\sigma_2 = \sigma_{\rm FDM}(M)$（条件尺度）→ 应用**含 $T_F$ 的 FDM 表**
>
> 而 `EvaluateSigma` 在 FDM 下**无条件**返回 CDM σ，导致 $\sigma_2$ 退化为 $\sigma_{\rm CDM}(M)$，
> 偏离 Eq.(5)。条件 HMF 的 $\sigma_2$ 全部经该函数取得
> （`interp_tables.c:317/435/518/599/632/692/741` 共 7 处）。
> 详见 `docs/FDM_audit_report.md` §4.1。

### 2. 无条件 HMF → 可以加 `dndm_FDM`

`dndm_FDM(M)` 是 Schive+2016 对**全局 N-body 模拟 HMF** 的拟合——整箱平均，不分 δ：

```c
// hmf.c
// FDM: apply Schive+2016 HMF suppression factor
if (matter_options_global->FDM) {
    result *= dndm_FDM(exp(lnM));
}
```

### 3. 条件 HMF → **应当加**（原「不能加」结论已推翻）

#### 3.1 原论据及其错误

原论据：把 `dndm_FDM(M)` 硬乘到条件 HMF 上会破坏闭合关系
$\langle \text{unconditional}_{\text{FDM}}(M) \rangle_{\delta} \neq \text{conditional}_{\text{FDM}}(M|\delta)$，
导致 mean-fixing 失效。

**该论据数学上不成立。** $f_{\rm FDM}(M)$ 只依赖 $M$、不依赖 $\delta$，可从 $\delta$ 平均中提出：

$$\big\langle (dn/dM)|_{\delta}^{\rm CDM} \times f_{\rm FDM}(M) \big\rangle_{\delta}
= f_{\rm FDM}(M) \times \big\langle (dn/dM)|_{\delta}^{\rm CDM} \big\rangle_{\delta}
= f_{\rm FDM}(M) \times (dn/dM)^{\rm CDM}
= (dn/dM)^{\rm FDM}$$

**闭合关系严格成立**，不会破坏 mean-fixing。

#### 3.2 Liu+25 的论文依据

论文 Eq.(3) 定义全局 FDM HMF，其中 $f_{\rm FDM}$ 乘在 $(dn/dm)|_{\rm CDM}$ 上：

$$\left.\frac{dn}{dm}\right|_{\rm FDM} = \left.\frac{dn}{dm}\right|_{\rm CDM} \cdot \left[1+\left(\frac{m}{M_0}\right)^{\alpha}\right]^{-2.2}$$

论文 Eq.(5) 只改写了 peak height $\nu$，并明确说明它「affects the FDM HMF in Eq. (3) **via the $(dn/dm)|_{\rm CDM}$ term**」——
即 **$f_{\rm FDM}$ 因子依然保留**，Eq.(5) 并未取消它。

论文自述闭合性：

> "On very large scales ($M\to\infty$), the density-modulated HMF resulting from this ansatz reduces to the global average, Eq. (3), as expected."

若条件 HMF 不含 $f_{\rm FDM}$，则在 $M\to\infty$ 极限下**无法**回归 Eq.(3) 的全局 FDM HMF——闭合反而被破坏。
这从论文自身反证了 $f_{\rm FDM}$ 必须保留。

#### 3.3 条件 FDM HMF 三要素（Eq.(3)+(5)）

1. **分子**用 $\delta_{\rm FDM}$（FDM 线性密度场）
2. **分母**用 $\sigma^2_{\rm CDM}(m) - \sigma^2_{\rm FDM}(M)$ —— **混合 σ**
3. **整体保留** $f_{\rm FDM}(m)$

三者**同时具备**，不是二选一。

> 原文档「FDM 抑制如何随 δ 变化？目前没有任何模拟数据或解析公式能回答」——
> 该表述在本仓库撰写时成立，但 Liu+25 已给出 Eq.(5)（论文自称首次提出），故**已过时**。

### 4. 实际效果上的部分保护

即使条件 HMF 没加 `dndm_FDM`，它的**积分结果本身也不完全错**。因为条件 EPS 公式里的

$$\frac{1}{(\sigma^2 - \sigma_{\text{cond}}^2)^{3/2}}$$

在 $\sigma(M) \to \sigma_{\text{cond}}$ 时自然截止——FDM 对 σ(M) 的效果虽然没体现在条件 HMF 的 σ 上（目前用的是 CDM σ），但 $\sigma_{\text{cond}}$ 本身（格点尺度的 σ）也是用同套 CDM σ 算的，两者一起偏移，**比值关系相对稳定**。

---

## 总结

> **【原结论已推翻】** 原表述：「`dndm_FDM` 只在无条件 HMF 上乘，是明知条件 HMF 缺少 FDM 修正下的保守做法」。
>
> **更正**：按 Liu+25 Eq.(3)+(5)，条件 HMF **应当**保留 $f_{\rm FDM}(m)$，本仓库 `hmf.c` 的改动方向是**正确的**。
> 真正的问题不是「该不该乘 $f_{\rm FDM}$」，而是条件 HMF 的分母 $\sigma_2$ 退化为 CDM σ（应为 FDM σ）。

### 当前状态（对照 Liu Eq.(5)）

| 要素 | 要求 | 本仓库现状 |
|---|:-:|:-:|
| ① $\sigma_{\rm CDM}(m)$ for $\sigma_1$ | ✓ | ✓ |
| ② $\sigma_{\rm FDM}(M)$ for $\sigma_2$ | ✓ | **✗ 退化为 $\sigma_{\rm CDM}(M)$** |
| ③ $\times f_{\rm FDM}(m)$ | ✓ | ✓（`hmf.c`，未提交） |
| ④ 分子用 $\delta_{\rm FDM}$ | ✓ | ✓（ICs 含 $T_F$） |

**仅要素②偏离。**

### 未来改进方向

1. **修复要素②**：给 `EvaluateSigma` 增加区分 $\sigma_1$/$\sigma_2$ 语义的参数（或新增 `EvaluateSigmaConditional`），
   使 $\sigma_2$ 取含 $T_F$ 的 FDM σ。**不能**简单删除现有 FDM 分支——那会破坏 $\sigma_1$ 的正确行为。
2. **验证闭合条件**：$\langle dn/dM(M,\delta)\rangle_\delta = dn/dM(M)$，
   确认 $M\to\infty$ 时条件 HMF 回归 Eq.(3) 的全局 FDM HMF。
3. （长期）若追求更高精度，可考虑 Du+17 的完整 FDM excursion set 解（质量依赖 barrier），
   但需解决与现有 top-hat 滤波器的兼容性，工作量约 2–3 月。
