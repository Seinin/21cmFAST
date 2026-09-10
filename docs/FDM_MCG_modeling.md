# FDM 分子冷却晕（MCG）建模方案

> 基于代码现状分析和文献调研，给出 FDM 对分子冷却晕建模的可行方案。

---

## 1. 现有代码 FDM 基础设施

代码已有 FDM 基础设施（`fdm.c`），但**只覆盖了无条件 HMF 路径**：

| 已有 | 文件 | 作用 |
|------|------|------|
| `T_F(k)` | `fdm.c:35-41` | FDM 线性传递函数，Hu, Barkana & Gruzinov (2000) Eq. (8)-(9) |
| `dndm_FDM(M)` | `fdm.c:51-56` | Schive+16 HMF 压制因子。~~仅作用于 `unconditional_hmf`~~ → **【2026-09-09 更正】本仓库 `hmf.c:457` 已将其加入 `conditional_hmf`（未提交）；Liu 原码则仅用于无条件路径** |
| `sigma_z0_pre(M)` | `fdm.c:92-127` | CDM 参考 σ(M)，不含 FDM 截止 |
| `dsigmasqdm_z0_pre(M)` | `fdm.c:150-185` | CDM 参考 dσ²/dM，不含 FDM 截止 |

### 无条件 HMF 路径（已有 FDM 支持）

```c
// hmf.c:480-502 — unconditional_hmf
double unconditional_hmf(double growthf, double lnM, double z, int HMF) {
    // ... PS 或 ST 质量函数计算 ...
    // FDM: apply Schive+2016 HMF suppression factor
    if (matter_options_global->FDM) {
        result *= dndm_FDM(exp(lnM));
    }
    return result;
}
```

### 条件 HMF 路径（完全未修改）

```c
// hmf.c:438-452 — conditional_hmf，无 FDM 修正
double conditional_hmf(double growthf, double lnM, double delta, double sigma, int HMF) {
    if (HMF == 0) return dNdM_conditional_EPS(...);     // EPS
    if (HMF == 1) return dNdM_conditional_ST(...);       // Sheth-Tormen
    if (HMF == 4) return dNdlnM_conditional_Delos(...);  // Delos
}
```

### MCG 相关路径（完全未修改）

MCG 的质量函数积分为 `nion_fraction_mini()`（`hmf.c:397-546`），使用 `Nion_ConditionalM_MINI()` 做条件积分，底层调用 `conditional_hmf()`，因此同样不含 FDM 修正。

MCG 质量阈值为 `lyman_werner_threshold()`（`thermochem.c:282-300`），基于 LW 反馈 + VCB 效应，也不含 FDM 效应。

---

## 2. 核心困难

**FDM 的条件 HMF 没有现成的半解析经验公式可直接用。**

原因不是没人研究，而是 FDM 的 excursion set 问题本质上比 CDM 难：

1. **CDM 的 EPS 依赖 sharp-k 滤波器** —— 恰好对应的马尔可夫过程使 first-crossing 概率有解析解
2. **FDM 的量子压力天然对应 sharp-k 截止** —— 但 Du et al. (2017) 证明即使使用 sharp-k，FDM 的 barrier 也是**质量依赖的**（不再是常数 δ_c），这导致解析解复杂得多
3. Du+17 确实解了这个问题（用修正的 Lacey & Cole 形式 + GALACTICUS 半解析模型），但公式涉及**双重数值积分 + 质量依赖 barrier 的 Taylor 展开**，不是一条解析公式能写完的

### 文献现状

- **Jones et al. (2021)**: 直接用的 `dndm_FDM` 乘在 ST HMF 上（和代码现有做法一样），未专门处理 minihalo
- **Liu et al. (2025)**: 更近一步把 FDM 的 σ(M) 代入了条件 HMF，但也**没有专门处理分子冷却晕**

**FDM 的分子冷却阈值目前没有一篇文献给出过可直接用的解析公式。所有现有工作都回避了这个问题 —— 要么不做 minihalo，要么直接用 CDM 的 M_turn + FDM HMF 压制。**

---

## 3. 可行方案

### 方案 1：最小改动 —— 只改 M_turn

利用现有 FDM 基础设施，**只修改分子冷却质量阈值**：

$$M_{\text{turn}}^{\text{FDM}} = \max\left(M_{\text{cool}},\; M_{1/2}\right), \quad M_{1/2} = 1.6\times 10^{10}\; m_{22}^{-4/3}\; M_\odot$$

其中 $M_{\text{cool}}$ 是现有的分子冷却阈值（含 LW 反馈，来自 `lyman_werner_threshold()`），$M_{1/2}$ 是 Schive+16 半模质量。物理直觉：FDM 量子压力压制了低于 $M_{1/2}$ 的晕形成，因此 MCG 的下限至少为 $M_{1/2}$。

**修改位置**: `thermochem.c:lyman_werner_threshold()` 返回前取 max，或 `hmf.c:nion_fraction_mini()` 的 `Mturn_mcg` 处。

**优点**：~10 行代码，`dndm_FDM` 已经定义了 $M_{1/2}$
**缺点**：忽略了 FDM 对条件 HMF 形状的修正 —— 在 σ(M)~σ(R) 附近，FDM 的条件 HMF 形状和 CDM 明显不同（Du+17 图 3）

---

### 方案 2：条件 HMF 也乘 FDM 压制因子

在 `conditional_hmf` 里加和 `unconditional_hmf` 一样的 `dndm_FDM` 乘积：

```c
// hmf.c:438-452 — conditional_hmf，新增 FDM 修正
double conditional_hmf(double growthf, double lnM, double delta, double sigma, int HMF) {
    double result;
    if (HMF == 0) {
        result = dNdM_conditional_EPS(growthf, lnM, delta, sigma);
    } else if (HMF == 1) {
        result = dNdM_conditional_ST(growthf, lnM, delta, sigma);
    } else if (HMF == 4) {
        result = dNdlnM_conditional_Delos(growthf, lnM, delta, sigma);
    } else {
        result = dNdM_conditional_EPS(growthf, lnM, delta, sigma);
    }
    // FDM: apply suppression factor (same as unconditional path)
    if (matter_options_global->FDM) {
        result *= dndm_FDM(exp(lnM));
    }
    return result;
}
```

**物理自洽性分析**：

初看似乎有问题——Schive+16 的 `f_FDM(M)` 是为无条件 HMF 拟合的，乘到条件 HMF 上有理论依据吗？

答案是**有，而且是物理自洽的**。关键认知（见附录 A.2）：

- `f_FDM(M)` 是 Schive+16 从 N-body 模拟直接拟合的 **FDM/CDM HMF 比值**，完整吸收了一切 FDM 效应（量子压力、功率谱截断、非线性效应）
- 条件 HMF 和无条件 HMF 描述的是**同一个物理过程**——halo collapse——只是前者多了一个环境密度的约束
- FDM 的量子压力对 halo collapse 的抑制是**普适的、不依赖环境的**——一个晕是否被量子压力阻止坍塌，取决于它自身的 M，不取决于它在哪个大尺度环境中
- 因此 f_FDM(M) 适用于**任何 CDM HMF 基准**：无条件 HMF、条件 HMF、甚至 merger tree 分支——因为它们描述的 collapse 物理是同一个

对比：如果说 "ST 质量函数的参数 (a, p, q) 是为无条件 HMF 拟合的，用来构造 ST 条件 HMF 没有理论依据"——这显然说不通，因为条件 ST 解析导出自无条件 ST。f_FDM 同理。

**缺点**：f_FDM 的经验拟合误差会传播到条件 HMF，且质量接近 M_{1/2} 时 σ 的差异（CDM vs FDM）可能影响 1/(σ²-σ_cond²)^{3/2} 项的形状。但这属于**精度问题**，不是自洽性问题

> **【2026-09-09 重要更正】** 本方案主张「条件公式内部**全用 CDM σ** + 事后乘 $f_{\rm FDM}$」，
> 与 Liu+25 论文 Eq.(5) **冲突**：Eq.(5) 要求分母为 $\sigma^2_{\rm CDM}(m) - \sigma^2_{\rm FDM}(M)$，
> 即 $\sigma_2$（条件尺度）必须用 **FDM σ**，不能全用 CDM σ。
>
> 本仓库按此方案实施后，导致 $\sigma_2$ 退化为 $\sigma_{\rm CDM}(M)$（见附录 A.5）。
> **乘 $f_{\rm FDM}$ 的方向是正确的**，但「全用 CDM σ」这部分需要修正。
> 正确公式见附录 A.6。

---

### 方案 3：FDM σ(M) 修正条件 HMF（替代方案，不推荐）

思路：让 FDM 物理从 σ(M) 通道进入——条件 HMF 公式中的 σ(M) 和 σ(M_cond) 都改用 FDM σ（含 T_F(k) 截止），利用 1/(σ²-σ_cond²)^{3/2} 在小质量端的发散自然产生截止，**不额外加 dndm_FDM**。

$$\boxed{\frac{dn}{dM}\Big|_{\text{FDM, alt}}^{\text{cond}} = \frac{dn}{dM}_{\text{CDM}}^{\text{cond}}\big(\sigma_{\text{FDM}}(M),\; \sigma_{\text{FDM}}(M_{\text{cond}})\big)}$$

**与方案 2 互斥**：方案 2（CDM σ + f_FDM）和方案 3（FDM σ，无 f_FDM）是两套不同的物理通道，**不能混用**。如果用 FDM σ 同时又乘 f_FDM，构成双重计数——f_FDM 本身就是用 CDM σ 做分母拟合的。

**σ mix 陷阱**（这就是 Liu+25 代码的 bug）：如果 sigma1 用 CDM σ 而 sigma2 用 FDM σ，σ1²-σ2² 在 FDM 截止区会出现非物理行为（两者来自不同的 σ 函数）。

**缺点**：方案 3 虽然概念上有吸引力（σ 通道自然截止），但其经验有效性未经 N-body 模拟检验——Schive+16 的 f_FDM 是直接拟合 HMF 的，没有独立检验 σ 通道的压制效果。推荐方案 2。

---

### 方案 4：实现 Du+17 的 FDM 条件 HMF

Du et al. (2017, ApJ, 838, 63) 提供了完整的 FDM excursion set 解。核心公式（Eq. 6-9）：

$$\frac{dn}{d\ln M}\bigg|_{\delta} = \frac{M_{\text{cond}}}{M} \cdot \frac{\Delta\delta}{\sqrt{2\pi\Delta S}}\cdot\exp\!\left(-\frac{\Delta\delta^2}{2\Delta S}\right)\cdot\frac{dS}{d\ln M}\cdot\frac{1}{\Delta S}\cdot\text{Taylor terms}$$

其中 barrier 不再是常数 δ_c，而是质量依赖的：

$$\delta_{\text{FDM}}(M, z) = \delta_c \cdot \left[1 + a_1\!\left(\frac{M_{1/2}}{M}\right)^{b_1} + a_2\!\left(\frac{M_{1/2}}{M}\right)^{b_2}\right]$$

参数 (a₁, b₁, a₂, b₂) 是质量依赖 barrier 的拟合系数。

**优点**：理论正确，和 Du+17 的 merger tree 结果一致
**缺点**：

- 需要在 `conditional_hmf` 里新增一个函数，改写 excursion set 的 barrier
- 工作量大，且 Du+17 的拟合公式依赖 sharp-k 滤波器，和代码现有的 top-hat 滤波器不完全兼容
- 估计 2-3 个月工作量

---

## 4. 实施建议

| 阶段 | 方案 | 目标 | 工作量 |
|------|------|------|--------|
| **短期**（立即可做） | 方案 1 + 方案 2 | M_turn 用 max(M_cool, M_{1/2})，条件 HMF 乘 `dndm_FDM` | ~20 行代码 |
| **中期**（可选） | 方案 4 | 实现 Du+17 完整 FDM 条件 HMF | 2-3 月 |

**推荐方案 1+2**：f_FDM(M) 是 Schive+16 从 N-body 模拟拟合的 FDM/CDM HMF 比值，完整吸收了一切 FDM 效应。它作为 halo collapse 的普适压制因子，在无条件 HMF 和条件 HMF 中都适用——物理自洽，实现简单。Jones+21 和 Liu+25 在无条件路径已经验证了该做法在 21cm 功率谱层面的效果。

**关于方案 3（σ 通道）**：不推荐。方案 3 与方案 2 互斥（不能既改 σ 又乘 f_FDM），且 σ 通道的压制效果未经 N-body 检验。短期用方案 2 即可。

**诚实的困难**：FDM 的分子冷却阈值目前没有一篇文献给出过可直接用的解析公式。所有现有工作（Jones+21, Liu+25）都回避了这个问题。要做 FDM minihalo，就是在做一件**文献上没有先例的事**。

---

## 5. 相关文件索引

| 文件 | 内容 |
|------|------|
| `src/py21cmfast/src/fdm.c` | `T_F(k)`, `dndm_FDM(M)`, `sigma_z0_pre(M)` |
| `src/py21cmfast/src/fdm.h` | FDM 函数声明 |
| `src/py21cmfast/src/hmf.c` | `unconditional_hmf`（有 FDM）, `conditional_hmf`（无 FDM）, `nion_fraction_mini`（MCG integrand） |
| `src/py21cmfast/src/thermochem.c` | `lyman_werner_threshold()`（MCG 质量阈值） |
| `src/py21cmfast/src/cosmology.c` | `EvaluateSigma`, `power_in_k_cdm`, `MtoR`, `TtoM` |

## 6. 参考文献

- Hu, Barkana & Gruzinov (2000), PRL 85, 1158 — FDM 线性传递函数 T_F(k)
- Schive et al. (2016), PRL 116, 201302 — FDM HMF 压制因子 dndm_FDM(M)
- Du et al. (2017), ApJ 838, 63 — FDM excursion set / 条件 HMF
- Jones et al. (2021) — FDM 21cm，使用 dndm_FDM × ST（和代码现有做法一致）
- Liu et al. (2025), PRD 112, 103534 — FDM 21cm，σ(M) 代入条件 HMF

---

## 附录 A: Liu+25 论文 vs 实际代码 —— 公式级对比

> **论文路径**: `D:\v21cmFAST`（WSL 挂载于 `/mnt/d/v21cmFAST`），版本 **v3.3.1**，
> 全文 `ps.c` **4544 行**，FDM 相关逻辑集中在 `dndm_FDM`、`dNdM_st_F`、`dNdM_conditional`、`sigma_z0_pre`、`dsigma_dk_pre`。
>
> **⚠ 这是唯一的 Liu 源码权威基准。**
> **禁止**用 `/home/dministrat/v21cmFAST` 或 `/mnt/d/21cmFAST3.3.1fdm版本` 核对——
> 那两个是**本仓库的重构版**（commit `1945bf0`，`ps.c` 4423 行，FDM 函数已被抽出到独立 `fdm.c`），
> 行号与 Liu 原码不一致。此前一次审计因误用该副本得出过错误结论。

### A.1 σ(M) 的两套计算

代码中有两个独立的被积函数，用于计算不同含义的 σ(M)：

| 函数 | 被积函数 | 功率谱 | 本质 |
|------|---------|--------|------|
| `sigma_z0(M)` | `dsigma_dk` (line 350) | FDM 时: `p = k^{n_s} · T_CDM² · T_F(k)²` | **FDM σ** |
| `sigma_z0_pre(M)` | `dsigma_dk_pre` (line 450) | 始终: `p = k^{n_s} · T_CDM²` | **CDM σ** |

插值表（`ps.c:1692-1694`）：

```c
Sigma_InterpTable[i]     = sigma_z0(M)       →   σ_FDM(M)
Sigma_InterpTable_CDM[i] = sigma_z0_pre(M)   →   σ_CDM(M)
```

命名具有误导性：`Sigma_InterpTable` 反而是 FDM σ，`Sigma_InterpTable_CDM` 才是 CDM σ。

---

### A.2 无条件 HMF

#### 关键物理认知：f_FDM(M) 是一个完整的经验压制因子

Schive+16 的 `f_FDM(M)` 是从 FDM N-body 模拟直接拟合的 FDM/CDM HMF 比值。它**不是**某种部分修正——它已经完整吸收了 FDM 的所有效应：量子压力对 halo collapse 的抑制、T_F(k) 对小尺度功率的截断在 halo 统计上的体现、以及任何非线性效应。

因此正确的用法是：

$$\boxed{\frac{dn}{dM}_{\text{FDM}} = \frac{dn}{dM}_{\text{CDM}}\big(\sigma_{\text{CDM}}\big) \;\times\; f_{\text{FDM}}(M)}$$

**ST 公式中的 σ 必须保持 CDM σ**——因为 f_FDM 就是用 CDM HMF 做分母拟合出来的。如果换成 FDM σ，分母变了，但 f_FDM(M) 还是原来的值，两者不匹配，会引入系统性偏差。在接近 M_{1/2} 的质量范围内，σ_FDM 和 σ_CDM 差异显著，这种「既改 σ 又乘 f」的做法实际上是**双重计数**。

#### 代码实际（`dNdM_st_F`, line 1032-1034）—— 正确

```c
double dNdM_st_F(double growthf, double M) {
    return dNdM_st(growthf, M) * dndm_FDM(M);
}
```

其中 `dNdM_st`（line 1005-1012）在 FDM 模式下**故意**用 `Sigma_InterpTable_CDM`（CDM σ）：

$$\boxed{\frac{dn}{dM}\Big|_{\text{code}}^{\text{global}} = \frac{dn}{dM}_{\text{ST}}\big(\hat{\nu}_{\text{CDM}}\big) \;\times\; f_{\text{FDM}}(M)}, \quad \hat{\nu}_{\text{CDM}} = \frac{\sqrt{a}\,\delta_c}{D(z)\,\sigma_{\text{CDM}}(M)}$$

**这个选择是物理上正确的，不是 bug。**

#### 论文公式的不精确之处

论文 Eq. (3) 把 f(FDM) 写成「嵌入 HMF 定义」的形式，并暗示 ν 用 FDM σ：

$$dn/dM|_{\text{FDM}} = f_{\text{FDM}} \cdot \text{ST}\big(\nu(\sigma_{\text{FDM}})\big)$$

但在代码层面，无条件 HMF 实际是 CDM σ + 事后 f_FDM。论文的公式描述和代码实现之间存在术语上的不精确，但代码的**做法是正确的**。

---

### A.3 条件 HMF

#### 论文描述（Eq. 5-6）

环境调制作用于 FDM HMF 的 peak height：

$$\nu_{\text{cond}}^{\text{FDM}} = \frac{(\delta_c - \delta_{\text{FDM}}(x,z))^2}{\sigma_{\text{FDM}}^2(M) - \sigma_{\text{FDM}}^2(M_R, z)}$$

论文声称 f(FDM) 从 Eq. (3)「自然继承」到条件 HMF：

$$\boxed{\frac{dn}{dM}\Big|_{\text{FDM}}^{\text{cond}} = f_{\text{FDM}}(M) \cdot \frac{dn}{dM}_{\text{CDM}}^{\text{cond}}\big(\nu_{\text{cond}}^{\text{FDM}}\big)}$$

#### 条件 HMF 的正确做法（基于 A.2 的物理论证）

既然 `f_FDM(M)` 是完整经验压制因子，条件 HMF 应该延续同样的逻辑：

$$\boxed{\frac{dn}{dM}\Big|_{\text{FDM, correct}}^{\text{cond}} = \frac{dn}{dM}_{\text{CDM}}^{\text{cond}}\big(\sigma_{\text{CDM}}(M),\; \sigma_{\text{CDM}}(M_{\text{cond}})\big) \;\times\; f_{\text{FDM}}(M)}$$

即：**条件公式内部全用 CDM σ，事后乘 f_FDM(M)**。和论文的区别在于 ν_cond 是否用 FDM σ——但根据 A.2 的论证，ν_cond 也应该保持 CDM σ，否则构成双重计数。

#### 代码实际（`dNdM_conditional`, line 2240-2286）

> **【2026-09-09 修订】** 原判定的「问题①：σ mix 是 bug」**予以撤回**。
> 经对照论文 Eq.(5) 核实，混合 σ 正是论文要求（分母 $\sigma^2_{\rm CDM}(m)-\sigma^2_{\rm FDM}(M)$），
> Liu 代码此处是**正确实现**。真正的问题只有「缺少 $f_{\rm FDM}$ 因子」一项，且它与 σ 通道是**同时具备**关系，非二选一。
> 详见 `docs/FDM_audit_report.md` §5。

```c
// line 2251-2256: sigma1 (halo mass) → CDM σ  ← 对（符合 Eq.(5) 分母第一项）
if (!user_params_ps->FDM) {
    sigma1 = Sigma_InterpTable[...];       // σ_FDM(M)   [CDM 模式]
} else {
    sigma1 = Sigma_InterpTable_CDM[...];   // σ_CDM(M)   [FDM 模式]
}

// line 2845: sigma2 (conditioning mass) → FDM σ  ← 对（符合 Eq.(5) 分母第二项）
sigma2 = Sigma_InterpTable[...];           // σ_FDM(M_cond)
```

条件 HMF 公式（line 2274-2276）是标准 PS 条件形式，**无 f(FDM) 因子**：

$$\boxed{\frac{dn}{d\ln M}\Big|_{\text{code}}^{\text{cond}} = \frac{\delta_1 - \delta_2}{D(z)} \cdot \frac{2\sigma_1\cdot|d\sigma_1/dm|}{(\sigma_1^2 - \sigma_2^2)^{3/2}} \cdot \exp\!\left[-\frac{(\delta_1-\delta_2)^2}{2D^2(z)(\sigma_1^2 - \sigma_2^2)}\right]}$$

其中：

$$\sigma_1 = \sigma_{\text{CDM}}(M), \quad \sigma_2 = \sigma_{\text{FDM}}(M_{\text{cond}})$$

#### 仅有的一处问题

| # | 问题 | 现状 | 正确做法 | 影响 |
|---|------|------|---------|------|
| ① | ~~σ(M_cond) 来源~~ | σ_FDM（`Sigma_InterpTable`） | **维持现状**——符合 Eq.(5) | ~~原判「bug」已撤回~~ |
| ② | f(FDM) 因子 | **无** | 乘 `dndm_FDM(M)` | 全质量范围 FDM 压制缺失 |

**关于①（撤回说明）**：sigma1 用 `Sigma_InterpTable_CDM`、sigma2 用 `Sigma_InterpTable`，
正是论文 Eq.(5) 分母 $\sigma^2_{\rm CDM}(m) - \sigma^2_{\rm FDM}(M)$ 的精确实现。
原判定认为「两者应统一为 CDM σ」是**错误的**——它基于「f_FDM 与 σ 通道互斥」的前提，
而论文实际要求**两者同时具备**（$f_{\rm FDM}$ 由 Eq.(3) 保留，σ 由 Eq.(5) 决定）。

**关于②**：确实缺失。$f_{\rm FDM}$ 应作为 Eq.(3) 的因子保留在条件 HMF 上，
与 Eq.(5) 的 ν 改写是叠加关系而非互斥。

> 补充：论文 Eq.(5) 还要求分子用 $\delta_{\rm FDM}$（FDM 线性密度场）。
> Liu 代码中 ICs 由含 $T_F$ 的功率谱生成，故该项自动满足。

---

### A.4 σ 来源的可视化（混合 σ **符合 Eq.(5)**，非 bug）

> **【2026-09-09 修订】** 本节原标题「σ 来源混用的可视化」及「✗ 错误」标注**已更正**。

```
  Liu+25 代码中，FDM 模式下条件 HMF 的 σ 来源:

  σ(M) 曲线
  │
  │  σ_CDM  ──────────────  ← sigma1 (Sigma_InterpTable_CDM) ✓ 符合 Eq.(5) 第一项
  │     ╲
  │      ╲  σ_FDM  ───────  ← sigma2 (Sigma_InterpTable)      ✓ 符合 Eq.(5) 第二项
  │       ╲   (FDM 截止)        （原"应使用 CDM 表"的标注已撤回）
  │        ╲___
  └───────────────── log M
    小质量            M_cond

  sigma1 和 sigma2 来自不同的 σ 函数 → 这正是 Eq.(5) 的
  σ²_CDM(m) − σ²_FDM(M) 所要求的，不是缺陷
```

MCG 积分中 `M_cond` 是分子冷却的 M_turn 附近的值，而 halo mass M 积分下限是 M_min，两者都在 FDM 截止敏感的范围内（~10⁶–10¹⁰ M⊙）。

**正确做法（修订）**：

- $\sigma_1$ 用 `Sigma_InterpTable_CDM`（CDM σ）
- $\sigma_2$ 用 `Sigma_InterpTable`（**FDM σ**，含 $T_F$）——维持 Liu 原实现
- 条件 HMF 结果**再乘** `dndm_FDM(M)`

即「混合 σ」与「乘 $f_{\rm FDM}$」**同时具备**。

---

### A.5 Liu+25 代码与 Fork 代码的对比

> **【2026-09-09 修订】** 原表的「✗ / 正确做法」判定已按论文 Eq.(5) 更正。

| 维度 | Liu+25 代码 (`D:\v21cmFAST`) | 本 Fork (`src/py21cmfast/`) | 论文要求 (Eq.3+5) |
|------|------------------------------|---------------------------|---------|
| 无条件 HMF (FDM) | `dNdM_st`(CDM σ) × dndm_FDM ✓ | `unconditional_hmf`(CDM σ) × dndm_FDM ✓ | ← 同 |
| 条件 HMF: σ(M_halo) = σ₁ | CDM σ ✓ | CDM σ ✓ | **CDM σ** |
| 条件 HMF: σ(M_cond) = σ₂ | **FDM σ ✓** | **CDM σ ✗ 偏离** | **FDM σ** |
| 条件 HMF: 分子 δ | δ_FDM ✓（ICs 含 $T_F$） | δ_FDM ✓ | δ_FDM |
| 条件 HMF × dndm_FDM? | **无** ✗ | **有** ✓（`hmf.c:457`，未提交） | **乘 dndm_FDM** |

**更正说明**：

- 原判「σ mix 是 bug」**撤回**——混合 σ 是 Eq.(5) 的要求，Liu 代码正确。
- 原判「Fork 的 σ(M_cond) 用 CDM σ 是 ✓」**反转**——这恰是 Fork 的偏离点。
- Fork 已补上 Liu 缺失的 `f_FDM`（✓），但把 σ₂ 改成了 CDM σ（✗）。**两边各缺一半。**

### A.6 修正后的公式（按论文 Eq.(3)+(5)）

**条件 FDM HMF 三要素同时具备**：

$$\boxed{\frac{dn}{dM}\Big|_{\text{FDM}}^{\text{cond}} = f_{\text{FDM}}(M)\;\cdot\; \frac{dn}{dM}_{\text{CDM}}^{\text{cond}}\big(\nu_{\rm cond}^{\rm FDM}\big)},\qquad
\nu_{\rm cond}^{\rm FDM} = \frac{[\delta_c - \delta_{\rm FDM}]^2}{\sigma^2_{\rm CDM}(m) - \sigma^2_{\rm FDM}(M)}$$

即：

1. $\sigma_1 = \sigma_{\rm CDM}(m)$（晕质量）
2. $\sigma_2 = \sigma_{\rm FDM}(M)$（条件尺度，**含 $T_F$**）
3. 分子用 $\delta_{\rm FDM}$
4. 整体**再乘** $f_{\rm FDM}(M)$

> **与本文档正文方案 2 的差异**：正文方案 2 主张「条件公式内部**全用 CDM σ** + 事后乘 $f_{\rm FDM}$」，
> 与 Eq.(5) 要求 $\sigma_2$ 用 FDM σ **冲突**。本仓库照方案 2 实施后引入了上述偏离。
> 修复时应改用本节公式，**不能**简单地把 `EvaluateSigma` 的 FDM 分支删掉（那会破坏 $\sigma_1$）。

**关于方案 3（全 FDM σ 路径）**：仍不推荐——它与 Eq.(5) 的混合 σ 要求不符，且与 $f_{\rm FDM}$ 的叠加关系未经 N-body 检验。
