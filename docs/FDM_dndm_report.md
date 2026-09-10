# FDM 晕质量函数（dndm / HMF）详细报告

**日期**：2026-09-09
**事实基准**：Liu et al. 2025, *Phys. Rev. D* **112**, 103534（Eq.2–5）
+ Liu 源码 `D:\v21cmFAST`（v3.3.1，`ps.c` 4544 行）
**审阅对象**：本仓库 fork（v4 开发版）
**相关文档**：`FDM_audit_report.md`（冲突裁决与本报告的审计依据）

---

## 0. 一句话总结

```
FDM 的 dndm = [用 CDM σ 算出的 CDM dndm] × [FDM 压制因子 f_FDM(m)]
                        ↑ 恒用 CDM σ              ↑ 唯一显式表达 FDM 的地方
```

**σ 永远用 CDM 的，FDM 效应全部由 $f_{\rm FDM}(m)$ 表达。** 这是理解全部问题的钥匙。

唯一例外是条件 HMF 的 $\sigma_2$（见 §7）——它不参与坍缩统计，属环境参数，须用 FDM σ。

---

## 1. 什么是 dndm / HMF

**HMF**（Halo Mass Function）$dn/dm$：单位体积、单位质量区间内暗物质晕的数量。

- 量纲：${\rm Mpc^{-3}}\,M_\odot^{-1}$
- 等价写法：$dn/d\ln m = m\cdot dn/dm$（每对数质量区间）

在 21cmFAST 中 HMF 决定**每个质量区间有多少个晕**，是恒星形成率、电离光子产额、21cm 信号的基础输入。

### 1.1 两种 HMF

| | 无条件 HMF | 条件 HMF |
|---|---|---|
| 记号 | $dn/dm$ | $dn/dm\|_\delta$ |
| 含义 | 全宇宙平均 | 给定局部密度 $\delta$ 时的晕分布 |
| 依赖 | 只依赖 $m,z$ | 额外依赖格点 $\delta$ 与条件尺度 $M$ |
| 用途 | 全局归一化、光度函数、再电离历史 ODE | 逐格点 $f_{\rm coll}$/N_ion/X 射线积分、离散采样表 |
| fork 代码 | `unconditional_hmf`（`hmf.c:489`） | `conditional_hmf`（`hmf.c:438`） |

两者关系：条件 HMF 给出格点间的相对差异，无条件 HMF 提供全局归一化基准。
格点物理量 = 条件积分结果 ×（全局无条件平均 / 格点条件平均），即 mean-fixing。

---

## 2. CDM 的 dndm —— Eq.(4)

$$\left.\frac{dn}{dm}\right|_{\rm CDM} = -\frac{\bar\rho_m}{m}\,f(\nu)\,\frac{d\ln\sigma}{dm}$$

### 2.1 三个因子

| 因子 | 含义 |
|---|---|
| $-\bar\rho_m/m$ | 数密度归一化（$\bar\rho_m$ 为平均物质密度；$1/m$ 把质量换成个数）。负号因 $d\ln\sigma/dm<0$ |
| $d\ln\sigma/dm$ | σ 随质量的变化率。小质量 σ 大、大质量 σ 小 |
| $f(\nu)$ | **晕多重度函数**（multiplicity function）：峰值高度 $\nu$ 处的坍缩概率密度 |

### 2.2 峰值高度 ν

$$\nu \equiv \frac{\delta_c}{\sigma(m,z)},\qquad \delta_c \approx 1.686$$

- $\nu$ 大（大质量晕 / 高红移）→ 稀有 → $f(\nu)$ 小
- $\nu$ 小（小质量晕）→ 常见

### 2.3 多重度函数的两种选择

| 模型 | $f(\nu)$ | 说明 |
|---|---|---|
| Press-Schechter (PS) | $\sqrt{2/\pi}\,\nu\,e^{-\nu^2/2}$ | 球对称坍缩 |
| **Sheth-Tormen (ST)** | $A\sqrt{2/\pi}\,[1+(a\nu^2)^{-p}]\sqrt{a}\,\nu\,e^{-a\nu^2/2}$ | 椭球坍缩，$a{=}0.73,\ p{=}0.175,\ A{=}0.353$ |

**Liu+25 采用 Sheth-Tormen**（论文原文："the functional form of $f(\nu)$ based on the ellipsoidal collapse model is adopted"）。

### 2.4 代码对应

Liu 源码 `ps.c:995`（`dNdM_st`）：

```c
nuhat = sqrt(SHETH_a) * Deltac / sigma;
return (-(cosmo_params_ps->OMm)*RHOcrit/M)   /* ← -ρ̄_m/m   */
     * (dsigmadm/sigma)                      /* ← dlnσ/dm  */
     * sqrt(2./PI)*SHETH_A
     * (1. + pow(nuhat, -2*SHETH_p)) * nuhat * pow(E, -nuhat*nuhat/2.0);
                                             /* ← ST 的 f(ν) */
```

**Eq.(4) 与 FDM 完全无关**——它就是纯 CDM 的 HMF。

---

## 3. FDM 的压制 —— Eq.(3)

$$\left.\frac{dn}{dm}\right|_{\rm FDM}(m,z) = \underbrace{\left.\frac{dn}{dm}\right|_{\rm CDM}(m,z)}_{\text{Eq.(4)}}\;\cdot\;\underbrace{\left[1+\left(\frac{m}{M_0}\right)^{\alpha}\right]^{-2.2}}_{f_{\rm FDM}(m)}$$

### 3.1 参数

| 参数 | 值 | 含义 |
|---|---|---|
| $M_0$ | $1.6\times10^{10}\,m_{22}^{-4/3}\,M_\odot$ | 特征压制尺度。$m_{22}$ 越小（轴子越轻）→ $M_0$ 越大 → 压制越强 |
| $\alpha$ | $-1.1$ | 幂指数，**负值** |
| 外指数 | $-2.2$ | Schive+16 N-body 模拟拟合 |

### 3.2 行为（为什么压制的是小质量）

因 $\alpha=-1.1<0$：

| 区间 | $(m/M_0)^{-1.1}$ | $f_{\rm FDM}$ | 结果 |
|---|---|---|---|
| $m \gg M_0$（大晕） | $\to 0$ | $\to[1+0]^{-2.2}=1$ | **无压制，回归 CDM** |
| $m = M_0$ | $=1$ | $=2^{-2.2}\approx0.22$ | FDM 晕数约为 CDM 的 22% |
| $m \ll M_0$（小晕） | $\to\infty$ | $\to(m/M_0)^{2.42}\to0$ | **强烈压制** |

**物理**：FDM 的量子压力（波动力学 Jeans 尺度）阻止小尺度结构坍缩，因此小质量晕数量被压低，大质量晕不受影响。

### 3.3 数值示例

| $m_{22}$ | $M_0\ [M_\odot]$ |
|---|---|
| 0.1 | $3.45\times10^{11}$ |
| 0.5 | $4.03\times10^{10}$ |
| 1.0 | $1.60\times10^{10}$ |
| 5.0 | $1.87\times10^{9}$ |
| 10.0 | $7.43\times10^{8}$ |

### 3.4 代码对应

fork `src/py21cmfast/src/fdm.c:51`（与 Liu `ps.c:987` 一致）：

```c
double dndm_FDM(double M) {
    double M0 = 1.6e10 * pow(cosmo_params_global->m22, -4./3);
    return pow((1. + pow(M/M0, matter_options_global->HMF_FINDEX)), -2.2);
    /*                                    HMF_FINDEX = -1.1 = α          */
}
```

> **注释误导已修正**：fork `fdm.c:47` 原注释写 "Applies the high-mass cutoff"，
> 但 $\alpha=-1.1<0$ 压制的是**小质量**晕。2026-09-09 审计中已改为 low-mass suppression。

---

## 4. 组合规则：CDM σ + $f_{\rm FDM}$（为什么不能双重计数）

### 4.1 规则

计算 Eq.(4) 的 CDM HMF 时，**σ 必须用 CDM 的**（不含 $T_F$ 截断）。

### 4.2 为什么

$f_{\rm FDM}$ 是 Schive+16 用 N-body 模拟拟合的**比值**：

$$f_{\rm FDM}(m) = \frac{(dn/dm)_{\rm FDM}^{\rm 模拟}}{(dn/dm)_{\rm CDM}^{\rm 理论}}$$

分母是 **CDM HMF**。所以：

| σ 的选择 | Eq.(4) 的结果 | 再乘 $f_{\rm FDM}$ | 判定 |
|---|---|---|---|
| CDM σ | 真正的 CDM HMF | 正确 | ✅ |
| FDM σ（含 $T_F$，σ 更小 → ν 更大 → HMF 已被压低） | 已被压低 | **压了两次** | ❌ |

### 4.3 代码体现

| 代码 | 位置 | FDM 模式行为 |
|---|---|---|
| fork `EvaluateSigma` | `interp_tables.c:1210` | 返回 `Sigma_InterpTable_CDM` ✅ |
| Liu `dNdM_st` 的 σ 分支 | `ps.c:1005-1011` | 用 `Sigma_InterpTable_CDM` ✅ |
| Liu `dNdM_conditional` 的 $\sigma_1$ | `ps.c:2255` | 用 `Sigma_InterpTable_CDM` ✅ |

**两边一致，都是对的。**

---

## 5. 无条件 vs 条件 HMF 的 FDM 版

### 5.1 无条件

直接套 Eq.(3)：

$$\left.\frac{dn}{dm}\right|_{\rm FDM}^{\rm global} = \left.\frac{dn}{dm}\right|_{\rm CDM}^{\rm global}\big(\nu_{\rm CDM}\big)\times f_{\rm FDM}(m)$$

代码（fork `hmf.c:509`）：

```c
if (matter_options_global->FDM) {
    result *= dndm_FDM(exp(lnM));
}
```

### 5.2 条件

条件 HMF 多一个环境维度，标准 EPS 形式：

$$\left.\frac{dn}{dm}\right|_{\delta} \propto \frac{\delta_1-\delta_2}{D}\cdot\frac{2\sigma_1|d\sigma_1/dm|}{(\sigma_1^2-\sigma_2^2)^{3/2}}\cdot\exp\!\left[-\frac{(\delta_1-\delta_2)^2}{2D^2(\sigma_1^2-\sigma_2^2)}\right]$$

可写成 peak height 形式 $\nu_{\rm cond}^2 = \dfrac{(\delta_1-\delta_2)^2}{\sigma_1^2-\sigma_2^2}$。

FDM 版：

$$\boxed{\left.\frac{dn}{dm}\right|_{\rm FDM}^{\rm cond} = \underbrace{\left.\frac{dn}{dm}\right|_{\rm CDM}^{\rm cond}\big(\nu_{\rm Eq.(5)}\big)}_{\text{条件版，ν 按 Eq.(5) 取}} \times f_{\rm FDM}(m)}$$

**形式与无条件完全一样**：CDM dndm × $f_{\rm FDM}$。
区别只在于那个「CDM dndm」是**条件版**的，且 ν 按 Eq.(5) 取。

---

## 6. 条件 HMF 的出发点与 $\sigma_1$、$\sigma_2$

### 6.1 理论出发点：excursion set（随机游走）

条件 HMF 出自 Bond et al. (1991) 的 **excursion set** 形式体系
（Lacey & Cole 1993 给出条件质量函数）。

**设定**：用尺度 $R$ 平滑线性密度场，得 $\delta_R$，其方差 $\sigma^2(R)$。
当 $R$ 由大变小（等价质量 $M$ 由大变小），$\sigma^2$ 单调**递增**——
因为小尺度包含更多功率。

把 $\delta_R$ 看成随"方差距离" $\sigma^2$ 演化的**随机游走**（布朗运动）：

| | 起点 | 问题 |
|---|---|---|
| **无条件 HMF** | 从原点 $(0,\,0)$ 出发 | 首次穿越壁垒 $\delta_c$ 发生在哪个 $\sigma^2(m)$？→ 晕质量 $m$ |
| **条件 HMF** | 从 $(\sigma_2^2,\,\delta_0)$ 出发 | 已知环境尺度 $M$ 处密度超标为 $\delta_0$，继续向小尺度走，首次穿越 $\delta_c$ 的尺度？→ 子晕质量 $m$ |

**条件 HMF 的"条件"就体现在起点不是原点**——环境的涨落已经实现、被固定为 $\delta_0$，
不再是随机的。

### 6.2 转移概率 → 条件 HMF 公式

从 $(\sigma_2^2,\delta_0)$ 出发，在方差距离 $\Delta\sigma^2=\sigma_1^2-\sigma_2^2$ 内
首达 $\delta_c$ 的概率，就是布朗运动的转移概率：

$$f(\delta_c,\sigma_1^2\mid\delta_0,\sigma_2^2)=\frac{1}{\sqrt{2\pi(\sigma_1^2-\sigma_2^2)}}\exp\!\left[-\frac{(\delta_c-\delta_0)^2}{2(\sigma_1^2-\sigma_2^2)}\right]$$

配上质量权重 $|d\sigma_1^2/dm|$，得到条件质量函数（PS 形式）：

$$\left.\frac{dn}{dm}\right|_{\delta} \propto \frac{\delta_c-\delta_0}{D}\cdot\frac{2\sigma_1|d\sigma_1/dm|}{(\sigma_1^2-\sigma_2^2)^{3/2}}\cdot\exp\!\left[-\frac{(\delta_c-\delta_0)^2}{2D^2(\sigma_1^2-\sigma_2^2)}\right]$$

### 6.3 $\sigma_1$ 与 $\sigma_2$ 分别表征什么

| | 数学定义 | **物理表征** |
|---|---|---|
| $\sigma_1^2=\sigma^2(m)$ | 用**晕质量** $m$ 对应尺度平滑的密度场方差 | **晕自身尺度**的涨落总幅度——决定坍缩有多"难" |
| $\sigma_2^2=\sigma^2(M)$ | 用**条件尺度** $M$ 平滑的密度场方差 | **环境已实现**的那部分涨落——已由 $\delta_0$ 固定，不再是随机的 |

**两者之差才是关键量**：

$$\boxed{\Delta\sigma^2 \equiv \sigma_1^2-\sigma_2^2}$$

= 从尺度 $M$ 走到尺度 $m$ 之间**新增的小尺度功率**（方差增量）。

它度量的是：**在环境给定的基础上，还需要多少额外涨落，质量为 $m$ 的晕才能坍缩。**

对应地，peak height 就是"跨越难度"：

$$\nu_{\rm cond}^2 = \frac{(\delta_c-\delta_0)^2}{\sigma_1^2-\sigma_2^2}
= \frac{(\text{还需跨越的高度})^2}{(\text{可用的方差距离})}$$

分母越小（$\Delta\sigma^2$ 小）→ $\nu_{\rm cond}$ 越大 → 越难形成 → 条件 HMF 越小。

### 6.4 为什么必须 $m<M$

$\sigma^2$ 随尺度减小而**增大**，故：

- $m<M$ → $\sigma_1^2>\sigma_2^2$ → $\Delta\sigma^2>0$ → 公式有意义
- $m>M$ → $\sigma_1^2<\sigma_2^2$ → 分母为负 → 无意义

**物理**：子晕不可能比它所在的父区域更大。这也是代码里积分上限取 $M_{\rm cond}$ 的原因。

### 6.5 随机游走图像（示意）

```
  δ
  │                              ┄┄┄┄ δ_c  ← 坍缩壁垒
  │                          ╱
  │                      ╱          ← 从 (σ₂², δ₀) 出发继续游走
  │                  ╱
  │      ● (σ₂², δ₀)                ← 起点：环境已实现
  │      │
  │      │                          ← 已固定，不再随机
  │   ╱──┘
  │ ╱                               ← 从原点出发的部分（无条件情形）
  └──┴──────────────────────────────→ σ²
     0   σ₂²(M)        σ₁²(m)
         └──── Δσ² ────┘
         还需跨越的方差距离
```

**无条件**情形：游走从 $(0,0)$ 出发，$\sigma_2=0,\ \delta_0=0$，
$\nu^2=\delta_c^2/\sigma^2(m)$ —— 正是 §2.2 的定义。**条件 HMF 是无条件的推广。**

### 6.6 21cmFAST 中的具体对应

| 符号 | 在 21cmFAST 中 |
|---|---|
| $M$（条件尺度） | 格点暗物质质量 $M_{\rm cond}=\rho_{\rm crit,0}\Omega_m V_{\rm cell}/N_{\rm pix}$ |
| $\delta_0$ | 该格点的密度超标（来自密度场） |
| $m$ | 子晕质量，积分范围 $[M_{\rm min},\ M_{\rm cond}]$ |
| $\sigma_2$ | `EvaluateSigma(log(M_cond))` —— 每格点一个值 |
| $\sigma_1$ | 被积函数内，随积分变量 $\ln M$ 变化 |

即：**给定每个格点的密度，算出该格点内的晕分布**。
这是逐格点 $f_{\rm coll}$ / N_ion / X 射线积分与离散采样的核心输入。

### 6.7 FDM 下三者如何取值（对应 Eq.(5)）

| 量 | 取值 | 理由 |
|---|---|---|
| 分子 $\delta_c-\delta_{\rm FDM}$ | 用 **FDM 场**的 $\delta_0$ | 环境就是真实的 FDM 密度场 |
| $\sigma_1^2=\sigma^2_{\rm CDM}(m)$ | **CDM** | 晕坍缩统计走 CDM 基准，避免与 $f_{\rm FDM}$ 双重计数 |
| $\sigma_2^2=\sigma^2_{\rm FDM}(M)$ | **FDM** | 环境尺度的涨落属真实 FDM 场 |

于是方差增量为

$$\Delta\sigma^2 = \sigma^2_{\rm CDM}(m)-\sigma^2_{\rm FDM}(M)$$

**物理直觉**：

- 环境这端（$\sigma_2$）用真实 FDM 场——FDM 的 $T_F$ 压制了小尺度功率，
  故 $\sigma_{\rm FDM}(M)<\sigma_{\rm CDM}(M)$
- 晕坍缩这端（$\sigma_1$）保持 CDM 基准，FDM 压制由 $f_{\rm FDM}(m)$ 单独表达

**关键**：$\sigma_2$ 只描述环境、不参与坍缩统计，因此**不会**与 $f_{\rm FDM}(m)$ 重叠——
这正是「σ₁ 用 CDM、σ₂ 用 FDM」不矛盾的根本原因（详见 §7.2）。

---

## 7. Eq.(5)：FDM 的条件 HMF ansatz

论文原文：

> "We will work with the ansatz where the peak height variable that affects the FDM HMF in Eq. (3) **via the $(dn/dm)|_{\rm CDM}$ term** should be written as

$$\nu^2 = \frac{[\delta_c - \delta_{\rm FDM}(z)]^2}{\sigma^2_{\rm CDM}(m,z) - \sigma^2_{\rm FDM}(M,z)}$$

> where $m$ is the halo mass, $M$ is the total mass within the comoving volume under consideration, $\delta_{\rm FDM}(z)$ is the linear-theory FDM overdensity within this volume at redshift $z$, and $\sigma^2_{\rm FDM}(M,z)$ is the variance of the linear-theory FDM density field smoothed on mass scale $M$."

论文自述闭合性：

> "On very large scales ($M\to\infty$), the density-modulated HMF resulting from this ansatz reduces to the global average, Eq. (3), as expected."

### 7.1 三要素

| 位置 | 取值 | 理由 |
|---|---|---|
| **分子** | $\delta_{\rm FDM}$ | 环境就是真实的 FDM 线性密度场 |
| **$\sigma_1$** | $\sigma_{\rm CDM}(m)$ | 避免与 $f_{\rm FDM}$ 双重计数（§4） |
| **$\sigma_2$** | $\sigma_{\rm FDM}(M)$ | 环境尺度的涨落是真实 FDM 场 |

论文总结句：

> "the density-modulated environmental effects are treated using **the actual FDM linear density field**, indicated by **the second terms** in both the numerator and the denominator"

（「第二项」= 分子第二项 $\delta_{\rm FDM}$ 与分母第二项 $\sigma^2_{\rm FDM}(M)$）

### 7.2 核心辨析：σ₁ 用 CDM 与 σ₂ 用 FDM 为什么不矛盾

两条规则作用于**不同对象**：

| | 角色 | 取值 | 为什么 |
|---|---|---|---|
| $\sigma_1$ | 晕坍缩统计 | **CDM** | 若用 FDM σ，Eq.(4) 本身已被压低，再乘 $f_{\rm FDM}$ = 双重计数 |
| $\sigma_2$ | 环境参数 | **FDM** | 与坍缩统计无关；$f_{\rm FDM}$ 是 $m$ 的函数，而 $\sigma_2$ 在给定 $M$ 时是常数，两者**不可能重叠** |

**判据**：凡是参与「晕形成概率」的量 → 走 CDM 基准；
凡是描述「环境场本身」的量 → 用真实 FDM 场。

### 7.3 分子 $\delta_{\rm FDM}$ 在代码中自动满足

FDM 模式下 ICs 由含 $T_F$ 的功率谱生成（fork `cosmology.c:297-300`）：

```c
// FDM: multiply by T_F(k)^2 transfer function cutoff
if (matter_options_global->FDM) {
    p *= T_F(k) * T_F(k);
}
```

因此格点的 `curr_dens` **本身就是 FDM 场的 δ**，无需额外处理。

---

## 8. Liu 源码的实现（代码级）

Liu 的处理很巧妙：**$\sigma_2$ 处一行 FDM 代码都没有，却自动正确**。

### 8.1 两张 σ 表

| 表 | 由谁计算 | CDM 模式 | FDM 模式 |
|---|---|---|---|
| `Sigma_InterpTable`（主表） | `sigma_z0`（用 `power_in_k`） | CDM σ | **FDM σ（含 $T_F$）** |
| `Sigma_InterpTable_CDM` | `sigma_z0_pre`（用 `power_in_k_cdm`） | CDM σ | CDM σ |

建表：`ps.c:1694`（`Sigma_InterpTable_CDM[i] = sigma_z0_pre(...)`）
配套 CDM 功率谱：`ps.c:310`（`power_in_k_cdm`）

> **命名反直觉**：主表在 FDM 模式下是 FDM σ，反而是带 `_CDM` 后缀的表才是纯 CDM σ。

### 8.2 $\sigma_1$：显式切 CDM 表

`ps.c:2251-2256`：

```c
if(!user_params_ps->FDM) {
    sigma1 = Sigma_InterpTable[...];       // CDM 模式：主表（=CDM σ）
} else {
    sigma1 = Sigma_InterpTable_CDM[...];   // FDM 模式：显式切 CDM 表
}
```

→ **$\sigma_1$ 在两种模式下恒为 CDM σ** ✅

### 8.3 $\sigma_2$：直接读主表

`ps.c:2845`（另有 2930 / 3072 / 3397 / 3507）：

```c
sigma2 = Sigma_InterpTable[MassBin] + ( Mmax - MassBinLow )*(...) *inv_mass_bin_width;
```

→ CDM 模式 = CDM σ；**FDM 模式 = FDM σ（含 $T_F$）** ✅

### 8.4 小结

```
σ₁：显式切 _CDM 表  → 恒为 CDM σ           （防双重计数）
σ₂：直接用主表      → FDM 模式自动为 FDM σ  （真实环境场）
δ ：由 ICs 自动是 FDM 场
× f_FDM：           → Liu 代码此处缺失（见 §9）
```

**这个设计完全符合 Eq.(5)。**

---

## 9. fork 现状与偏离

> **【2026-09-10 回退】** 本节已按 Liu 源码逻辑回退，当前条件 HMF 与 Liu **严格一致**。
> 回退内容见 §9.6。以下为回退后的状态。

### 9.1 当前状态（回退后）

| 项 | 状态 | 位置 |
|---|---|---|
| $\sigma_1$ = CDM σ | ✅ | `EvaluateSigma`→`Sigma_InterpTable_CDM`（`interp_tables.c:1210`） |
| **$\sigma_2$ = FDM σ** | ✅ **已修复** | `EvaluateSigmaConditional`（`interp_tables.c:1252`），7 处调用 |
| 分子 $\delta_{\rm FDM}$ | ✅ | `cosmology.c:297-300` |
| 无条件 HMF × $f_{\rm FDM}$ | ✅ | `hmf.c`（`unconditional_hmf`） |
| **条件 HMF 不乘 $f_{\rm FDM}$** | ✅ **已回退** | `hmf.c`（`conditional_hmf`）——与 Liu 一致 |

**结论：全局路径与条件路径现在均与 Liu 原码一致，无偏离。**

### 9.2 唯一偏离：$\sigma_2$ 退化为 CDM σ

fork 把 σ 取值统一到一个函数（`interp_tables.c:1206-1217`）：

```c
double EvaluateSigma(double lnM) {
    if (matter_options_global->USE_INTERPOLATION_TABLES > 0) {
        // FDM: use CDM-reference sigma table (no T_F cutoff) for HMF calculations
        if (matter_options_global->FDM)
            return EvaluateRGTable1D_f(lnM, &Sigma_InterpTable_CDM);   // 一律 CDM σ
        return EvaluateRGTable1D_f(lnM, &Sigma_InterpTable);
    }
    if (matter_options_global->FDM) return sigma_z0_pre(exp(lnM));
    return sigma_z0(exp(lnM));
}
```

$\sigma_1$ 与 $\sigma_2$ **共用此函数**（调用点 `interp_tables.c:317/435/518/599/632/692/741` 共 7 处），
故 $\sigma_2$ 也被强制成 CDM σ —— 而 Liu 原码中 $\sigma_2$ **从不走这个切换**。

同源函数 `EvaluatedSigmasqdm`（`interp_tables.c:1219-1231`）有同样分支。

### 9.3 三方对照

| 要素 | Liu 论文 | Liu 代码 `D:\v21cmFAST` | fork |
|---|:-:|:-:|:-:|
| $\sigma_1$=CDM σ | 要求 | ✅ `ps.c:2255` | ✅ |
| $\sigma_2$=FDM σ | 要求 | ✅ `ps.c:2845` | **❌ 退化为 CDM** |
| 分子 $\delta_{\rm FDM}$ | 要求 | ✅ | ✅ |
| × $f_{\rm FDM}(m)$ | 要求 | **❌ 缺失** | ✅ `hmf.c:457` |

**一句话：Liu 代码缺 $f_{\rm FDM}$，fork 补上了但丢了 $\sigma_2$。两边各缺一半。**

### 9.4 这是重构引入的回归

v4.1.1 官方基线（`/mnt/d/21cmFAST/src/py21cmfast/src/interp_tables.c:1170-1176`）的
`EvaluateSigma` **无任何 FDM 分支**：

```c
double EvaluateSigma(double lnM) {
    if (matter_options_global->USE_INTERPOLATION_TABLES > 0) {
        return EvaluateRGTable1D_f(lnM, &Sigma_InterpTable);
    }
    return sigma_z0(exp(lnM));
}
```

因此该 FDM 分支是 FDM 移植时新增的。**性质是重构回归**，而非方案选择错误：
v4 把 σ 取值收敛到统一函数时，顺手加了「FDM 用 CDM σ」（本意服务 $\sigma_1$，正确），
却未意识到 $\sigma_2$ 需要**相反**的 FDM σ。

### 9.5 影响量级：**实测 < 0.5%，实践上可忽略**

> **【2026-09-10 实测修正】** 本节原为粗估（曾判断"轻轴子端可能显著"）。
> 用 `train/_verify_cond_hmf_fdm.py` 实测后**予以修正**：实际影响远小于粗估。

**定性方向**：$\sigma_{\rm FDM}(M)<\sigma_{\rm CDM}(M)$（$T_F$ 压制小尺度功率）
→ 用偏大的 $\sigma_2$ → $(\sigma_1^2-\sigma_2^2)$ 偏小
→ 指数项压得更低 → 条件 HMF 被**额外压低**。

**实测设置**：HII_DIM=64、BOX_LEN=200 → $M_{\rm cond}=1.21\times10^{12}M_\odot$，$z=15$。
对比三种配置：

| 配置 | $\sigma_2$ | $\times f_{\rm FDM}$ | 说明 |
|---|---|---|---|
| **A**（fork **回退前**） | CDM σ | ✅ | 2026-09-10 已回退，见 §9.7 |
| **B**（Liu 原码等效） | FDM σ | ❌ | **当前 fork 采用此配置** |
| **C**（论文 Eq.3+5 完整解） | FDM σ | ✅ | 严格按论文，未采用 |

**实测结果**：

| $m_{22}$ | $M_0$ | $\sigma_2$ 相对差异 | A/C 净偏差（晕总数密度） |
|---|---|---|---|
| 10.0 | $7.4\times10^{8}$ | −0.0008 % | **1.0000** |
| 1.0 | $1.6\times10^{10}$ | −0.0323 % | **0.9999** |
| 0.5 | $4.0\times10^{10}$ | −0.0983 % | **0.9997** |
| 0.1 | $3.5\times10^{11}$ | −1.4926 % | **0.9950** |

**结论**：

1. **配置 A（回退前 fork）相对论文完整解 C 的净偏差 < 0.5%**（所有 $m_{22}$），
   $m_{22}\ge1$ 时 < 0.01%。
   → $\sigma_2$ 退化是**真实但影响极小**的技术偏离，**不构成实践问题**。
   （2026-09-10 已回退到配置 B，见 §9.7。）
2. 原因：$M_{\rm cond}$（格点质量，通常 $\gtrsim10^{11}M_\odot$）远大于 FDM 压制尺度，
   在此尺度上 $T_F$ 截断几乎不起作用，$\sigma_{\rm FDM}\approx\sigma_{\rm CDM}$。
3. 仅在**单点小质量端**可见偏差（$m_{22}=0.1$、$M/M_{\rm cond}=0.02$ 时 A/C≈0.70），
   但这些质量对总晕数的贡献极小，净效应被摊薄。
4. 作为对照，**B/C = $1/f_{\rm FDM}(M)$**——Liu 原码缺失 $f_{\rm FDM}$ 在压制区
   可导致条件 HMF 高估达数个量级（远超 $\sigma_2$ 的影响）。
   即：**$f_{\rm FDM}$ 才是主导项，$\sigma_2$ 是次要项。**

> **优先级修正**：fork 已具备主导项 $f_{\rm FDM}$（§9.1），
> 缺失的是次要项 $\sigma_2$。因此 fork 在实践上**与论文完整解几乎等价**，
> 无需为 $\sigma_2$ 紧急修改代码。若追求严格符合 Eq.(5)，再按 §9.6 修复即可。

复现命令：

```bash
.venv/bin/python train/_verify_cond_hmf_fdm.py
```

### 9.6 修复方式（不能简单删分支）

```c
double EvaluateSigma(double lnM);             // σ₁：FDM 下返回 CDM σ（现有逻辑，保留）
double EvaluateSigmaConditional(double lnM);  // σ₂：始终读主表（FDM 下自动为 FDM σ）
```

再把 7 处 $\sigma_2$/$\sigma_{\rm cond}$ 的调用改用 `EvaluateSigmaConditional`。

**切勿**直接删掉 `EvaluateSigma` 的 FDM 分支——那会破坏 $\sigma_1$ 的正确行为。

---

### 9.7 回退记录（2026-09-10）：条件 HMF 对齐 Liu

**决策**：条件 HMF 回退到与 Liu 原码一致（不乘 $f_{\rm FDM}$、$\sigma_2$ 用 FDM σ）。

**当初这么改的理由**（出处：`docs/FDM_MCG_modeling.md` §3 方案 2，114–125 行）：

> 答案是**有，而且是物理自洽的**（见附录 A.2）：
> - `f_FDM(M)` 是 Schive+16 拟合的 FDM/CDM HMF 比值，**完整吸收一切 FDM 效应**
> - 条件 HMF 和无条件 HMF 描述**同一个物理过程**——halo collapse——只是前者多了环境约束
> - FDM 量子压力对 halo collapse 的抑制是**普适的、不依赖环境的**
> - 因此 $f_{\rm FDM}(M)$ 适用于**任何 CDM HMF 基准**
>
> 对比：若说"ST 参数是为无条件 HMF 拟合的，用来构造 ST 条件 HMF 没依据"——说不通，
> 因为条件 ST 解析导出自无条件 ST。**f_FDM 同理**。

配套依据在 §4（176、179 行）：列为"短期立即可做"，理由含"Jones+21 和 Liu+25 在**无条件路径**已验证"——
即当时是**从无条件路径类推到条件路径**；文档 §5 亦坦承这是"文献上没有先例的事"。

**回退依据**：该论证物理上有其道理，但与 Liu 源码实现不一致；且实测表明两种配置
在全局量上被 mean-fixing 完全对齐（§13.2），仅在起伏量有 11–29% 差异。
为与参考实现严格对齐，按 Liu 逻辑回退。

**改动清单**：

| 文件 | 改动 |
|---|---|
| `src/py21cmfast/src/hmf.c` | `conditional_hmf` 移除 `result *= dndm_FDM(exp(lnM))`，改为详尽注释记录原理由与回退依据 |
| `src/py21cmfast/src/interp_tables.c` | **新增** `EvaluateSigmaConditional()`（始终读主表 → FDM 模式下为 FDM σ）；7 处 $\sigma_2$/$\sigma_{\rm cond}$ 调用改用之（`317/435/518/599/632/692/741`） |
| `src/py21cmfast/src/interp_tables.h` | 声明 `EvaluateSigmaConditional` |
| `src/py21cmfast/src/_functionprototypes_wrapper.h` | 声明 `EvaluateSigmaConditional` |

$\sigma_1$（`dNdM_conditional_EPS` 内 `hmf.c:288`）**保持不变**，仍走 `EvaluateSigma`（FDM→CDM 表），
避免与 Eq.(5) 要求冲突。

**验证**：编译通过（exit 0），`.so` 已同步至 `src/py21cmfast/`；
实测 $\sigma_2^{\rm FDM}=2.152282$ vs $\sigma_2^{\rm CDM}=2.152299$（差 −0.0008%），
`conditional_hmf` 返回值已不含 $f_{\rm FDM}$。

**回退后条件路径三要素**（与 Liu 一致）：

$$\sigma_1=\sigma_{\rm CDM}(m),\qquad \sigma_2=\sigma_{\rm FDM}(M),\qquad
\nu^2=\frac{[\delta_c-\delta_{\rm FDM}]^2}{\sigma_1^2-\sigma_2^2},\qquad
\text{不乘 } f_{\rm FDM}$$

---

## 10. 速查表

| 问题 | 答案 |
|---|---|
| FDM 的 dndm 怎么算？ | CDM dndm（**用 CDM σ**）× $f_{\rm FDM}(m)$ |
| σ 用 CDM 还是 FDM？ | **CDM**（唯一例外：条件 HMF 的 $\sigma_2$ 用 FDM） |
| 为什么不用 FDM σ？ | 会与 $f_{\rm FDM}$ 双重计数 |
| $f_{\rm FDM}$ 压制大质量还是小质量？ | **小质量**（$\alpha=-1.1<0$） |
| 条件 HMF 要不要乘 $f_{\rm FDM}$？ | **要**（Eq.(3) 要求；且闭合性严格成立） |
| $\sigma_1$ 用什么？ | CDM σ |
| $\sigma_2$ 用什么？ | FDM σ（fork 当前退化为 CDM，是唯一偏离） |
| 分子 δ 用什么？ | FDM 场的 δ（代码自动满足） |
| md 的行号引用准确吗？ | **准确**（以 `D:\v21cmFAST` ps.c 4544 行为准） |
| 基线在哪？ | `git tag baseline/pre-fdm` → `d8f67b76` |

---

## 11. 常见误区

| 误区 | 纠正 |
|---|---|
| 「$f_{\rm FDM}$ 是压制大质量晕的」 | 错。$\alpha=-1.1<0$，压制**小质量**晕 |
| 「条件 HMF 乘 $f_{\rm FDM}$ 会破坏闭合关系」 | 错。$f_{\rm FDM}(M)$ 只依赖 $M$、不依赖 $\delta$，可提出 $\delta$ 平均之外：$\langle$cond$_{\rm CDM}\times f\rangle_\delta=f\times\langle$cond$_{\rm CDM}\rangle_\delta=f\times$uncond$_{\rm CDM}=$uncond$_{\rm FDM}$，闭合严格成立 |
| 「σ₁ 用 CDM、σ₂ 用 FDM 是 bug」 | 错。这正是 Eq.(5) 的明确要求 |
| 「σ₁ 和 σ₂ 应统一为 CDM σ」 | 错。$\sigma_2$ 必须是 FDM σ |
| 「FDM 效应主要来自 HMF」 | 不准确。$M_{\rm sol}\ll M_{\rm hm}$（$m_{22}{=}1$：$1.5\times10^7$ vs $1.6\times10^{10}$），**冷却通道才是主导，且目前完全缺失** |
| 「用 `/home/dministrat/v21cmFAST` 核对 Liu 行号」 | 错。那是本仓库重构版（`1945bf0`，4423 行，含独立 `fdm.c`），要用 `D:\v21cmFAST`（4544 行） |

---

## 12. 代码索引

### Liu 源码 `D:\v21cmFAST`（v3.3.1，`ps.c` 4544 行）

| 符号 | 位置 |
|---|---|
| `dndm_FDM` | `ps.c:987` |
| `dNdM_st` | `ps.c:995` |
| `dNdM_st_F`（= `dNdM_st` × `dndm_FDM`） | `ps.c:1032-1034` |
| `power_in_k_cdm` | `ps.c:310` |
| `dNdM_conditional` | `ps.c:2240-2286` |
| $\sigma_1$ 的 FDM 分支 | `ps.c:2251-2256` |
| $\sigma_2 = $ `Sigma_InterpTable[...]` | `ps.c:2845`（另 2930 / 3072 / 3397 / 3507） |
| `Sigma_InterpTable_CDM` 建表 | `ps.c:1684, 1694` |

### 本仓库 fork

| 符号 | 位置 |
|---|---|
| `T_F` | `src/py21cmfast/src/fdm.c:35` |
| `dndm_FDM` | `src/py21cmfast/src/fdm.c:51` |
| `sigma_z0_pre` / `dsigmasqdm_z0_pre` | `fdm.c:92` / `fdm.c:150` |
| `conditional_hmf`（含 ×`dndm_FDM`） | `src/py21cmfast/src/hmf.c:438-462`（**未提交**） |
| `unconditional_hmf`（含 ×`dndm_FDM`） | `src/py21cmfast/src/hmf.c:509` |
| $T_F$ 接入功率谱 | `src/py21cmfast/src/cosmology.c:297-300` |
| `EvaluateSigma` | `src/py21cmfast/src/interp_tables.c:1206-1217` |
| `EvaluatedSigmasqdm` | `interp_tables.c:1219-1231` |
| $\sigma_2$/$\sigma_{\rm cond}$ 调用（7 处） | `interp_tables.c:317/435/518/599/632/692/741` |
| Python 参数 `m22` / `FDM` / `HMF_FINDEX` | `src/py21cmfast/wrapper/inputs.py:456 / 687 / 689` |

### 基线

```
git tag baseline/pre-fdm  →  d8f67b76   (FDM 引入前最后一个提交)
git diff baseline/pre-fdm -- src/py21cmfast/src/      # FDM 全部改动（含工作区）
```

---

## 13. 对照实验：为什么 fork 与 Liu 的结果一致？

> **【2026-09-10 实验记录】** 本节回答一个实证问题：
> fork 改了条件 HMF（加了 $f_{\rm FDM}$、$\sigma_2$ 退化为 CDM σ），
> 为何复现 Liu 论文上游结果（功率谱、HMF）时**一模一样**？

**实验脚本**：`train/_verify_fork_vs_liu.py`、`train/_verify_meanfixing.py`
**配置**：A = fork 现状（$\sigma_2$=CDM σ，$\times f_{\rm FDM}$）；
B = Liu 原码等效（$\sigma_2$=FDM σ，无 $f_{\rm FDM}$）
**固定条件**：$z=15$，BOX_LEN=200、HII_DIM=64 → $M_{\rm cond}=1.21\times10^{12}M_\odot$

### 13.1 实验一：A/B 是 $M_{\min}/M_0$ 的普适函数

$M_0=1.6\times10^{10}m_{22}^{-4/3}$。扫描 $m_{22}$ 与积分下限 $M_{\min}$：

| $M_{\min}/M_0$ | 0.1 | 1 | 10 | 100 | 1000 |
|---|---|---|---|---|---|
| **A/B** | ~0.01 | ~0.3–0.4 | ~0.90 | ~0.99 | ~0.999 |

**A/B 只依赖 $M_{\min}/M_0$，与 $m_{22}$ 本身无关**（各组数据落在同一条曲线上）。

判读：

- $M_{\min}\gg M_0$：积分区间全在 $f_{\rm FDM}\approx1$ 区域 → **A ≈ B**
- $M_{\min}\lesssim M_0$：$f_{\rm FDM}$ 的压制进入积分区间 → **A 显著小于 B**

即：**积分下限越高（相对 $M_0$），fork 与 Liu 越接近**。

### 13.2 实验二：mean-fixing 才是"一模一样"的主因

21cmFAST 的 mean-fixing：

$$\text{格点物理量} = \text{条件积分}(\delta)\times\frac{\text{全局无条件平均}}{\text{格点条件平均}}$$

两者无条件路径**都含** $f_{\rm FDM}$，故分子相同。对 $\delta$ 扫描（$m_{22}{=}10$，$M_{\min}=10^9$，$M_{\min}/M_0=1.35$）：

| $\delta$ | ∫A (fork) | ∫B (Liu) | **A/B 原始** | **A/B mean-fix 后** |
|---|---|---|---|---|
| −0.50 | 1.706e−07 | 4.758e−07 | 0.359 | 0.933 |
| −0.20 | 2.115e−05 | 5.680e−05 | 0.372 | 0.969 |
| **0.00** | 3.420e−04 | 8.901e−04 | 0.384 | **1.0000** |
| 0.20 | 3.900e−03 | 9.785e−03 | 0.399 | 1.038 |
| 0.50 | 7.690e−02 | 1.802e−01 | 0.427 | 1.111 |
| 1.00 | 1.559e+00 | 3.152e+00 | 0.495 | 1.287 |

> $\delta=2.0$ 处出现负值（条件 HMF 在大 $\delta$ 下数值失效），已排除。

**关键发现**：

1. **$\delta=0$ 处 mean-fix 后 A/B 恰好 = 1.0000**——这是 mean-fixing 的归一化锚点，
   所有全局平均量在此被强制对齐。
2. **原始条件积分差异达 60%**（A/B≈0.38），但 mean-fixing 后压缩到
   $|\delta|\le0.2$ 范围内 <4%。
3. 差异随 $|\delta|$ 增大而显现：$\delta=0.5$ 时 11%，$\delta=1$ 时 29%。

### 13.3 结论：三层原因

| 层次 | 现象 | 原因 |
|---|---|---|
| **上游量**<br>(功率谱、无条件 HMF) | **完全一致** | 两者实现相同：$T_F$ 都接入 `power_in_k`；无条件 HMF 都乘 $f_{\rm FDM}$。这是 Liu 论文 Fig.1、Fig.2 复现成功的原因 |
| **全局平均量**<br>(δ≈0，全局 21cm 信号、电离历史) | **完全一致** | mean-fixing 把条件结果锚定到无条件结果（含 $f_{\rm FDM}$），归一化差异被完全吸收 |
| **起伏量**<br>(高 δ 区、小尺度功率谱) | **有差异**<br>(δ=0.5→11%，δ=1→29%) | $f_{\rm FDM}$ 是 $M$ 依赖的形状因子，mean-fixing 只能补一个标量，补不回形状 |

**因此**：你复现论文上游图时"一模一样"是**正确且预期的**——
那些图验证的是功率谱与无条件 HMF，本来就不涉及条件 HMF 的分歧。
分歧只在对**密度起伏敏感**的观测量上才显现，且需要 $M_{\min}\lesssim M_0$ 才显著。

### 13.4 关于 Liu 代码

基于 §8 的证据（$dndm\_FDM$ 在 `ps.c` 仅 2 处：定义 987、$dNdM\_st\_F$ 内 1033），
Liu 条件路径未显式乘 $f_{\rm FDM}$。但由本节实验可知：

- 该缺失**不影响**论文 Fig.1/Fig.2 的上游复现（条件路径不参与）
- 对全局量，mean-fixing 会补偿归一化
- 其残余影响属"起伏形状"层面

故 Liu 代码的整体结果仍自洽，此前报告中"代码缺失"的表述应理解为
**相对论文 Eq.(3)+(5) 的严格形式而言**，而非"结果错误"。

---

## 14. 参考文献

**FDM 物理**：Liu et al. 2025, PRD 112, 103534（Eq.2–5）· Schive et al. 2016, PRL 116, 201302（$f_{\rm FDM}$）· Schive et al. 2014, Nature Phys. 10, 496（孤子核心–晕关系）· Hu, Barkana & Gruzinov 2000, PRL 85, 1158（$T_F$）· Du et al. 2017, ApJ 838, 63（FDM excursion set）

**结构形成**：Sheth & Tormen 2001, MNRAS 323, 1（ST 多重度函数）· Press & Schechter 1974, ApJ 187, 425 · Bond et al. 1991（EPS）· Lacey & Cole 1993（条件质量函数）· Barkana & Loeb 2001, Phys. Rep. 349, 125

**21cmFAST**：Mesinger, Furlanetto & Cen 2011, MNRAS 411, 955 · Park et al. 2019, MNRAS 484, 933
