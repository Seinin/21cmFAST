# FDM 建模文档（整合版）

> 本册由原 `docs/FDM_*.md` 六份文档整合而成，内容完整保留，仅统一结构与导航。
> 整合日期：2026-09-10

## 阅读导航

| 篇章             | 内容                                                                                                            | 状态 |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| **第一篇** | HMF 通道：dndm、Eq.(3)(4)(5)、excursion set 出发点、$\sigma_1$/$\sigma_2$、Liu 源码实现、对照实验、回退记录 | 现行 |
| **第二篇** | 冷却通道：CDM 拟合因子的依赖审计（A–E 分类）                                                                   | 现行 |
| **第三篇** | 分子冷却阈值$m_{\rm crit}$ 的 FDM 迁移方案（含 §6 数值表，已复算验证）                                       | 现行 |
| **第四篇** | 一致性审计与冲突裁决、基线说明                                                                                  | 现行 |
| **第五篇** | 备选方案存档（未实施）：只改$M_{\rm turn}$、Du+17 完整解                                                      | 参考 |

> 已删除的无价值内容：原第五篇（「条件 HMF 应当加 $f_{\rm FDM}$」与 2026-09-10 回退后的代码**直接矛盾**）、
> 原第六篇的方案 2（已回退）/方案 3（不推荐）/实施建议（已作废）/文件索引/重复参考文献/
> 附录 A 诊断（已被第一篇 §8 修正）。正确结论见第一篇 §8–§9。

## 核心结论速览

1. **FDM 的 dndm = 用 CDM σ 算出的 CDM dndm × $f_{\rm FDM}(m)$**。σ 恒用 CDM，
   FDM 效应由 $f_{\rm FDM}$ 表达（唯一例外：条件 HMF 的 $\sigma_2$ 用 FDM σ）。
2. **全局（无条件）路径**：本仓库与 Liu+25 源码**严格一致**（实测中位相对误差 $3\times10^{-13}$），
   故功率谱与无条件 HMF 的复现结果必然相同。
3. **条件 HMF** 已于 2026-09-10 回退对齐 Liu：不乘 $f_{\rm FDM}$、$\sigma_2$ 取 FDM σ。
4. **最大缺口是冷却通道**：$M_{\rm sol}\ll M_{\rm hm}$（$m_{22}{=}1$：$1.5\times10^7$ vs $1.6\times10^{10}$），
   冷却抑制比 HMF 截断早约 3 个量级生效，但 `mcrit_noLW` 与 SM13 仍为纯 CDM。
5. **事实基准**：Liu et al. 2025, PRD 112, 103534 + Liu 源码 `D:\v21cmFAST`
   （v3.3.1，`ps.c` 4544 行）。**禁止**用 `/home/dministrat/v21cmFAST`（重构版，4423 行）核对行号。
6. **基线**：`git tag baseline/pre-fdm` → `d8f67b76`（FDM 引入前最后一个提交）。

---

# 第一篇　HMF 通道：dndm 与条件质量函数

> 来源：`docs/FDM_dndm_report.md`　状态：**现行**

**日期**：2026-09-09
**事实基准**：Liu et al. 2025, *Phys. Rev. D* **112**, 103534（Eq.2–5）

+ Liu 源码 `D:\v21cmFAST`（v3.3.1，`ps.c` 4544 行）
  **审阅对象**：本仓库 fork（v4 开发版）
  **相关文档**：`FDM_audit_report.md`（冲突裁决与本报告的审计依据）

---

### 0. 一句话总结

```
FDM 的 dndm = [用 CDM σ 算出的 CDM dndm] × [FDM 压制因子 f_FDM(m)]
                        ↑ 恒用 CDM σ              ↑ 唯一显式表达 FDM 的地方
```

**σ 永远用 CDM 的，FDM 效应全部由 $f_{\rm FDM}(m)$ 表达。** 这是理解全部问题的钥匙。

唯一例外是条件 HMF 的 $\sigma_2$（见 §7）——它不参与坍缩统计，属环境参数，须用 FDM σ。

---

### 1. 什么是 dndm / HMF

**HMF**（Halo Mass Function）$dn/dm$：单位体积、单位质量区间内暗物质晕的数量。

- 量纲：${\rm Mpc^{-3}}\,M_\odot^{-1}$
- 等价写法：$dn/d\ln m = m\cdot dn/dm$（每对数质量区间）

在 21cmFAST 中 HMF 决定**每个质量区间有多少个晕**，是恒星形成率、电离光子产额、21cm 信号的基础输入。

#### 1.1 两种 HMF

|           | 无条件 HMF                             | 条件 HMF                                            |
| --------- | -------------------------------------- | --------------------------------------------------- |
| 记号      | $dn/dm$                              | $dn/dm\|_\delta$                                  |
| 含义      | 全宇宙平均                             | 给定局部密度$\delta$ 时的晕分布                   |
| 依赖      | 只依赖$m,z$                          | 额外依赖格点$\delta$ 与条件尺度 $M$             |
| 用途      | 全局归一化、光度函数、再电离历史 ODE   | 逐格点$f_{\rm coll}$/N_ion/X 射线积分、离散采样表 |
| fork 代码 | `unconditional_hmf`（`hmf.c:489`） | `conditional_hmf`（`hmf.c:438`）                |

两者关系：条件 HMF 给出格点间的相对差异，无条件 HMF 提供全局归一化基准。
格点物理量 = 条件积分结果 ×（全局无条件平均 / 格点条件平均），即 mean-fixing。

---

### 2. CDM 的 dndm —— Eq.(4)

$$
\left.\frac{dn}{dm}\right|_{\rm CDM} = -\frac{\bar\rho_m}{m}\,f(\nu)\,\frac{d\ln\sigma}{dm}
$$

#### 2.1 三个因子

| 因子                                                                                                                  | 含义                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| $-\bar\rho_m/m$ | 数密度归一化（$\bar\rho_m$ 为平均物质密度；$1/m$ 把质量换成个数）。负号因 $d\ln\sigma/dm<0$ |                                                                                    |
| $d\ln\sigma/dm$                                                                                                     | σ 随质量的变化率。小质量 σ 大、大质量 σ 小                                      |
| $f(\nu)$                                                                                                            | **晕多重度函数**（multiplicity function）：峰值高度 $\nu$ 处的坍缩概率密度 |

#### 2.2 峰值高度 ν

$$
\nu \equiv \frac{\delta_c}{\sigma(m,z)},\qquad \delta_c \approx 1.686
$$

- $\nu$ 大（大质量晕 / 高红移）→ 稀有 → $f(\nu)$ 小
- $\nu$ 小（小质量晕）→ 常见

#### 2.3 多重度函数的两种选择

| 模型                        | $f(\nu)$                                                                                                        | 说明       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| Press-Schechter (PS)        | $\sqrt{2/\pi}\,\nu\,e^{-\nu^2/2}$                                                                               | 球对称坍缩 |
| **Sheth-Tormen (ST)** | $A\sqrt{2/\pi}\,[1+(a\nu^2)^{-p}]\sqrt{a}\,\nu\,e^{-a\nu^2/2}$ | 椭球坍缩，$a{=}0.73,\ p{=}0.175,\ A{=}0.353$ |            |

**Liu+25 采用 Sheth-Tormen**（论文原文："the functional form of $f(\nu)$ based on the ellipsoidal collapse model is adopted"）。

#### 2.4 代码对应

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

### 3. FDM 的压制 —— Eq.(3)

$$
\left.\frac{dn}{dm}\right|_{\rm FDM}(m,z) = \underbrace{\left.\frac{dn}{dm}\right|_{\rm CDM}(m,z)}_{\text{Eq.(4)}}\;\cdot\;\underbrace{\left[1+\left(\frac{m}{M_0}\right)^{\alpha}\right]^{-2.2}}_{f_{\rm FDM}(m)}
$$

#### 3.1 参数

| 参数       | 值                                                                                                                  | 含义                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| $M_0$    | $1.6\times10^{10}\,m_{22}^{-4/3}\,M_\odot$ | 特征压制尺度。$m_{22}$ 越小（轴子越轻）→ $M_0$ 越大 → 压制越强 |                           |
| $\alpha$ | $-1.1$                                                                                                            | 幂指数，**负值**    |
| 外指数     | $-2.2$                                                                                                            | Schive+16 N-body 模拟拟合 |

#### 3.2 行为（为什么压制的是小质量）

因 $\alpha=-1.1<0$：

| 区间                  | $(m/M_0)^{-1.1}$ | $f_{\rm FDM}$           | 结果                       |
| --------------------- | ------------------ | ------------------------- | -------------------------- |
| $m \gg M_0$（大晕） | $\to 0$          | $\to[1+0]^{-2.2}=1$     | **无压制，回归 CDM** |
| $m = M_0$           | $=1$             | $=2^{-2.2}\approx0.22$  | FDM 晕数约为 CDM 的 22%    |
| $m \ll M_0$（小晕） | $\to\infty$      | $\to(m/M_0)^{2.42}\to0$ | **强烈压制**         |

**物理**：FDM 的量子压力（波动力学 Jeans 尺度）阻止小尺度结构坍缩，因此小质量晕数量被压低，大质量晕不受影响。

#### 3.3 数值示例

| $m_{22}$ | $M_0\ [M_\odot]$    |
| ---------- | --------------------- |
| 0.1        | $3.45\times10^{11}$ |
| 0.5        | $4.03\times10^{10}$ |
| 1.0        | $1.60\times10^{10}$ |
| 5.0        | $1.87\times10^{9}$  |
| 10.0       | $7.43\times10^{8}$  |

#### 3.4 代码对应

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

### 4. 组合规则：CDM σ + $f_{\rm FDM}$（为什么不能双重计数）

#### 4.1 规则

计算 Eq.(4) 的 CDM HMF 时，**σ 必须用 CDM 的**（不含 $T_F$ 截断）。

#### 4.2 为什么

$f_{\rm FDM}$ 是 Schive+16 用 N-body 模拟拟合的**比值**：

$$
f_{\rm FDM}(m) = \frac{(dn/dm)_{\rm FDM}^{\rm 模拟}}{(dn/dm)_{\rm CDM}^{\rm 理论}}
$$

分母是 **CDM HMF**。所以：

| σ 的选择                                               | Eq.(4) 的结果  | 再乘$f_{\rm FDM}$ | 判定 |
| ------------------------------------------------------- | -------------- | ------------------- | ---- |
| CDM σ                                                  | 真正的 CDM HMF | 正确                | ✅   |
| FDM σ（含$T_F$，σ 更小 → ν 更大 → HMF 已被压低） | 已被压低       | **压了两次**  | ❌   |

#### 4.3 代码体现

| 代码                                    | 位置                     | FDM 模式行为                     |
| --------------------------------------- | ------------------------ | -------------------------------- |
| fork`EvaluateSigma`                   | `interp_tables.c:1210` | 返回`Sigma_InterpTable_CDM` ✅ |
| Liu`dNdM_st` 的 σ 分支               | `ps.c:1005-1011`       | 用`Sigma_InterpTable_CDM` ✅   |
| Liu`dNdM_conditional` 的 $\sigma_1$ | `ps.c:2255`            | 用`Sigma_InterpTable_CDM` ✅   |

**两边一致，都是对的。**

---

### 5. 无条件 vs 条件 HMF 的 FDM 版

#### 5.1 无条件

直接套 Eq.(3)：

$$
\left.\frac{dn}{dm}\right|_{\rm FDM}^{\rm global} = \left.\frac{dn}{dm}\right|_{\rm CDM}^{\rm global}\big(\nu_{\rm CDM}\big)\times f_{\rm FDM}(m)
$$

代码（fork `hmf.c:509`）：

```c
if (matter_options_global->FDM) {
    result *= dndm_FDM(exp(lnM));
}
```

#### 5.2 条件

条件 HMF 多一个环境维度，标准 EPS 形式：

$$
\left.\frac{dn}{dm}\right|_{\delta} \propto \frac{\delta_1-\delta_2}{D}\cdot\frac{2\sigma_1|d\sigma_1/dm|}{(\sigma_1^2-\sigma_2^2)^{3/2}}\cdot\exp\!\left[-\frac{(\delta_1-\delta_2)^2}{2D^2(\sigma_1^2-\sigma_2^2)}\right]
$$

可写成 peak height 形式 $\nu_{\rm cond}^2 = \dfrac{(\delta_1-\delta_2)^2}{\sigma_1^2-\sigma_2^2}$。

FDM 版：

$$
\boxed{\left.\frac{dn}{dm}\right|_{\rm FDM}^{\rm cond} = \underbrace{\left.\frac{dn}{dm}\right|_{\rm CDM}^{\rm cond}\big(\nu_{\rm Eq.(5)}\big)}_{\text{条件版，ν 按 Eq.(5) 取}} \times f_{\rm FDM}(m)}
$$

**形式与无条件完全一样**：CDM dndm × $f_{\rm FDM}$。
区别只在于那个「CDM dndm」是**条件版**的，且 ν 按 Eq.(5) 取。

---

### 6. 条件 HMF 的出发点与 $\sigma_1$、$\sigma_2$

#### 6.1 理论出发点：excursion set（随机游走）

条件 HMF 出自 Bond et al. (1991) 的 **excursion set** 形式体系
（Lacey & Cole 1993 给出条件质量函数）。

**设定**：用尺度 $R$ 平滑线性密度场，得 $\delta_R$，其方差 $\sigma^2(R)$。
当 $R$ 由大变小（等价质量 $M$ 由大变小），$\sigma^2$ 单调**递增**——
因为小尺度包含更多功率。

把 $\delta_R$ 看成随"方差距离" $\sigma^2$ 演化的**随机游走**（布朗运动）：

|                      | 起点                               | 问题                                                                                                         |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **无条件 HMF** | 从原点$(0,\,0)$ 出发             | 首次穿越壁垒$\delta_c$ 发生在哪个 $\sigma^2(m)$？→ 晕质量 $m$                                         |
| **条件 HMF**   | 从$(\sigma_2^2,\,\delta_0)$ 出发 | 已知环境尺度$M$ 处密度超标为 $\delta_0$，继续向小尺度走，首次穿越 $\delta_c$ 的尺度？→ 子晕质量 $m$ |

**条件 HMF 的"条件"就体现在起点不是原点**——环境的涨落已经实现、被固定为 $\delta_0$，
不再是随机的。

#### 6.2 转移概率 → 条件 HMF 公式

从 $(\sigma_2^2,\delta_0)$ 出发，在方差距离 $\Delta\sigma^2=\sigma_1^2-\sigma_2^2$ 内
首达 $\delta_c$ 的概率，就是布朗运动的转移概率：

$$
f(\delta_c,\sigma_1^2\mid\delta_0,\sigma_2^2)=\frac{1}{\sqrt{2\pi(\sigma_1^2-\sigma_2^2)}}\exp\!\left[-\frac{(\delta_c-\delta_0)^2}{2(\sigma_1^2-\sigma_2^2)}\right]
$$

配上质量权重 $|d\sigma_1^2/dm|$，得到条件质量函数（PS 形式）：

$$
\left.\frac{dn}{dm}\right|_{\delta} \propto \frac{\delta_c-\delta_0}{D}\cdot\frac{2\sigma_1|d\sigma_1/dm|}{(\sigma_1^2-\sigma_2^2)^{3/2}}\cdot\exp\!\left[-\frac{(\delta_c-\delta_0)^2}{2D^2(\sigma_1^2-\sigma_2^2)}\right]
$$

#### 6.3 $\sigma_1$ 与 $\sigma_2$ 分别表征什么

|                            | 数学定义                                          | **物理表征**                                                       |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| $\sigma_1^2=\sigma^2(m)$ | 用**晕质量** $m$ 对应尺度平滑的密度场方差 | **晕自身尺度**的涨落总幅度——决定坍缩有多"难"                     |
| $\sigma_2^2=\sigma^2(M)$ | 用**条件尺度** $M$ 平滑的密度场方差       | **环境已实现**的那部分涨落——已由 $\delta_0$ 固定，不再是随机的 |

**两者之差才是关键量**：

$$
\boxed{\Delta\sigma^2 \equiv \sigma_1^2-\sigma_2^2}
$$

= 从尺度 $M$ 走到尺度 $m$ 之间**新增的小尺度功率**（方差增量）。

它度量的是：**在环境给定的基础上，还需要多少额外涨落，质量为 $m$ 的晕才能坍缩。**

对应地，peak height 就是"跨越难度"：

$$
\nu_{\rm cond}^2 = \frac{(\delta_c-\delta_0)^2}{\sigma_1^2-\sigma_2^2}
= \frac{(\text{还需跨越的高度})^2}{(\text{可用的方差距离})}
$$

分母越小（$\Delta\sigma^2$ 小）→ $\nu_{\rm cond}$ 越大 → 越难形成 → 条件 HMF 越小。

#### 6.4 为什么必须 $m<M$

$\sigma^2$ 随尺度减小而**增大**，故：

- $m<M$ → $\sigma_1^2>\sigma_2^2$ → $\Delta\sigma^2>0$ → 公式有意义
- $m>M$ → $\sigma_1^2<\sigma_2^2$ → 分母为负 → 无意义

**物理**：子晕不可能比它所在的父区域更大。这也是代码里积分上限取 $M_{\rm cond}$ 的原因。

#### 6.5 随机游走图像（示意）

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

#### 6.6 21cmFAST 中的具体对应

| 符号              | 在 21cmFAST 中                                                                    |
| ----------------- | --------------------------------------------------------------------------------- |
| $M$（条件尺度） | 格点暗物质质量$M_{\rm cond}=\rho_{\rm crit,0}\Omega_m V_{\rm cell}/N_{\rm pix}$ |
| $\delta_0$      | 该格点的密度超标（来自密度场）                                                    |
| $m$             | 子晕质量，积分范围$[M_{\rm min},\ M_{\rm cond}]$                                |
| $\sigma_2$      | `EvaluateSigma(log(M_cond))` —— 每格点一个值                                  |
| $\sigma_1$      | 被积函数内，随积分变量$\ln M$ 变化                                              |

即：**给定每个格点的密度，算出该格点内的晕分布**。
这是逐格点 $f_{\rm coll}$ / N_ion / X 射线积分与离散采样的核心输入。

#### 6.7 FDM 下三者如何取值（对应 Eq.(5)）

| 量                                   | 取值                              | 理由                                                  |
| ------------------------------------ | --------------------------------- | ----------------------------------------------------- |
| 分子$\delta_c-\delta_{\rm FDM}$    | 用**FDM 场**的 $\delta_0$ | 环境就是真实的 FDM 密度场                             |
| $\sigma_1^2=\sigma^2_{\rm CDM}(m)$ | **CDM**                     | 晕坍缩统计走 CDM 基准，避免与$f_{\rm FDM}$ 双重计数 |
| $\sigma_2^2=\sigma^2_{\rm FDM}(M)$ | **FDM**                     | 环境尺度的涨落属真实 FDM 场                           |

于是方差增量为

$$
\Delta\sigma^2 = \sigma^2_{\rm CDM}(m)-\sigma^2_{\rm FDM}(M)
$$

**物理直觉**：

- 环境这端（$\sigma_2$）用真实 FDM 场——FDM 的 $T_F$ 压制了小尺度功率，
  故 $\sigma_{\rm FDM}(M)<\sigma_{\rm CDM}(M)$
- 晕坍缩这端（$\sigma_1$）保持 CDM 基准，FDM 压制由 $f_{\rm FDM}(m)$ 单独表达

**关键**：$\sigma_2$ 只描述环境、不参与坍缩统计，因此**不会**与 $f_{\rm FDM}(m)$ 重叠——
这正是「σ₁ 用 CDM、σ₂ 用 FDM」不矛盾的根本原因（详见 §7.2）。

---

### 7. Eq.(5)：FDM 的条件 HMF ansatz

论文原文：

> "We will work with the ansatz where the peak height variable that affects the FDM HMF in Eq. (3) **via the $(dn/dm)|_{\rm CDM}$ term** should be written as

$$
\nu^2 = \frac{[\delta_c - \delta_{\rm FDM}(z)]^2}{\sigma^2_{\rm CDM}(m,z) - \sigma^2_{\rm FDM}(M,z)}
$$

> where $m$ is the halo mass, $M$ is the total mass within the comoving volume under consideration, $\delta_{\rm FDM}(z)$ is the linear-theory FDM overdensity within this volume at redshift $z$, and $\sigma^2_{\rm FDM}(M,z)$ is the variance of the linear-theory FDM density field smoothed on mass scale $M$."

论文自述闭合性：

> "On very large scales ($M\to\infty$), the density-modulated HMF resulting from this ansatz reduces to the global average, Eq. (3), as expected."

#### 7.1 三要素

| 位置                   | 取值                    | 理由                                  |
| ---------------------- | ----------------------- | ------------------------------------- |
| **分子**         | $\delta_{\rm FDM}$    | 环境就是真实的 FDM 线性密度场         |
| **$\sigma_1$** | $\sigma_{\rm CDM}(m)$ | 避免与$f_{\rm FDM}$ 双重计数（§4） |
| **$\sigma_2$** | $\sigma_{\rm FDM}(M)$ | 环境尺度的涨落是真实 FDM 场           |

论文总结句：

> "the density-modulated environmental effects are treated using **the actual FDM linear density field**, indicated by **the second terms** in both the numerator and the denominator"

（「第二项」= 分子第二项 $\delta_{\rm FDM}$ 与分母第二项 $\sigma^2_{\rm FDM}(M)$）

#### 7.2 核心辨析：σ₁ 用 CDM 与 σ₂ 用 FDM 为什么不矛盾

两条规则作用于**不同对象**：

|                                                                                                                                                            | 角色       | 取值          | 为什么                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------- | ---------------------------------------------------------------- |
| $\sigma_1$                                                                                                                                               | 晕坍缩统计 | **CDM** | 若用 FDM σ，Eq.(4) 本身已被压低，再乘$f_{\rm FDM}$ = 双重计数 |
| $\sigma_2$ | 环境参数 | **FDM** | 与坍缩统计无关；$f_{\rm FDM}$ 是 $m$ 的函数，而 $\sigma_2$ 在给定 $M$ 时是常数，两者**不可能重叠** |            |               |                                                                  |

**判据**：凡是参与「晕形成概率」的量 → 走 CDM 基准；
凡是描述「环境场本身」的量 → 用真实 FDM 场。

#### 7.3 分子 $\delta_{\rm FDM}$ 在代码中自动满足

FDM 模式下 ICs 由含 $T_F$ 的功率谱生成（fork `cosmology.c:297-300`）：

```c
// FDM: multiply by T_F(k)^2 transfer function cutoff
if (matter_options_global->FDM) {
    p *= T_F(k) * T_F(k);
}
```

因此格点的 `curr_dens` **本身就是 FDM 场的 δ**，无需额外处理。

---

### 8. Liu 源码的实现（代码级）

Liu 的处理很巧妙：**$\sigma_2$ 处一行 FDM 代码都没有，却自动正确**。

#### 8.1 两张 σ 表

| 表                            | 由谁计算                                  | CDM 模式 | FDM 模式                       |
| ----------------------------- | ----------------------------------------- | -------- | ------------------------------ |
| `Sigma_InterpTable`（主表） | `sigma_z0`（用 `power_in_k`）         | CDM σ   | **FDM σ（含 $T_F$）** |
| `Sigma_InterpTable_CDM`     | `sigma_z0_pre`（用 `power_in_k_cdm`） | CDM σ   | CDM σ                         |

建表：`ps.c:1694`（`Sigma_InterpTable_CDM[i] = sigma_z0_pre(...)`）
配套 CDM 功率谱：`ps.c:310`（`power_in_k_cdm`）

> **命名反直觉**：主表在 FDM 模式下是 FDM σ，反而是带 `_CDM` 后缀的表才是纯 CDM σ。

#### 8.2 $\sigma_1$：显式切 CDM 表

`ps.c:2251-2256`：

```c
if(!user_params_ps->FDM) {
    sigma1 = Sigma_InterpTable[...];       // CDM 模式：主表（=CDM σ）
} else {
    sigma1 = Sigma_InterpTable_CDM[...];   // FDM 模式：显式切 CDM 表
}
```

→ **$\sigma_1$ 在两种模式下恒为 CDM σ** ✅

#### 8.3 $\sigma_2$：直接读主表

`ps.c:2845`（另有 2930 / 3072 / 3397 / 3507）：

```c
sigma2 = Sigma_InterpTable[MassBin] + ( Mmax - MassBinLow )*(...) *inv_mass_bin_width;
```

→ CDM 模式 = CDM σ；**FDM 模式 = FDM σ（含 $T_F$）** ✅

#### 8.4 小结

```
σ₁：显式切 _CDM 表  → 恒为 CDM σ           （防双重计数）
σ₂：直接用主表      → FDM 模式自动为 FDM σ  （真实环境场）
δ ：由 ICs 自动是 FDM 场
× f_FDM：           → Liu 代码此处缺失（见 §9）
```

**这个设计完全符合 Eq.(5)。**

---

### 9. fork 现状与偏离

> **【2026-09-10 回退】** 本节已按 Liu 源码逻辑回退，当前条件 HMF 与 Liu **严格一致**。
> 回退内容见 §9.6。以下为回退后的状态。

#### 9.1 当前状态（回退后）

| 项                                      | 状态               | 位置                                                                     |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| $\sigma_1$ = CDM σ                   | ✅                 | `EvaluateSigma`→`Sigma_InterpTable_CDM`（`interp_tables.c:1210`） |
| **$\sigma_2$ = FDM σ**         | ✅**已修复** | `EvaluateSigmaConditional`（`interp_tables.c:1252`），7 处调用       |
| 分子$\delta_{\rm FDM}$                | ✅                 | `cosmology.c:297-300`                                                  |
| 无条件 HMF ×$f_{\rm FDM}$            | ✅                 | `hmf.c`（`unconditional_hmf`）                                       |
| **条件 HMF 不乘 $f_{\rm FDM}$** | ✅**已回退** | `hmf.c`（`conditional_hmf`）——与 Liu 一致                          |

**结论：全局路径与条件路径现在均与 Liu 原码一致，无偏离。**

#### 9.2 唯一偏离：$\sigma_2$ 退化为 CDM σ

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

#### 9.3 三方对照

| 要素                     | Liu 论文 | Liu 代码`D:\v21cmFAST` |          fork          |
| ------------------------ | :------: | :----------------------: | :---------------------: |
| $\sigma_1$=CDM σ      |   要求   |     ✅`ps.c:2255`     |           ✅           |
| $\sigma_2$=FDM σ      |   要求   |     ✅`ps.c:2845`     | **❌ 退化为 CDM** |
| 分子$\delta_{\rm FDM}$ |   要求   |            ✅            |           ✅           |
| ×$f_{\rm FDM}(m)$     |   要求   |    **❌ 缺失**    |     ✅`hmf.c:457`     |

**一句话：Liu 代码缺 $f_{\rm FDM}$，fork 补上了但丢了 $\sigma_2$。两边各缺一半。**

#### 9.4 这是重构引入的回归

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

#### 9.5 影响量级：**实测 < 0.5%，实践上可忽略**

> **【2026-09-10 实测修正】** 本节原为粗估（曾判断"轻轴子端可能显著"）。
> 用 `train/_verify_cond_hmf_fdm.py` 实测后**予以修正**：实际影响远小于粗估。

**定性方向**：$\sigma_{\rm FDM}(M)<\sigma_{\rm CDM}(M)$（$T_F$ 压制小尺度功率）
→ 用偏大的 $\sigma_2$ → $(\sigma_1^2-\sigma_2^2)$ 偏小
→ 指数项压得更低 → 条件 HMF 被**额外压低**。

**实测设置**：HII_DIM=64、BOX_LEN=200 → $M_{\rm cond}=1.21\times10^{12}M_\odot$，$z=15$。
对比三种配置：

| 配置                                 | $\sigma_2$ | $\times f_{\rm FDM}$ | 说明                           |
| ------------------------------------ | ------------ | ---------------------- | ------------------------------ |
| **A**（fork **回退前**） | CDM σ       | ✅                     | 2026-09-10 已回退，见 §9.7    |
| **B**（Liu 原码等效）          | FDM σ       | ❌                     | **当前 fork 采用此配置** |
| **C**（论文 Eq.3+5 完整解）    | FDM σ       | ✅                     | 严格按论文，未采用             |

**实测结果**：

| $m_{22}$ | $M_0$              | $\sigma_2$ 相对差异 | A/C 净偏差（晕总数密度） |
| ---------- | -------------------- | --------------------- | ------------------------ |
| 10.0       | $7.4\times10^{8}$  | −0.0008 %            | **1.0000**         |
| 1.0        | $1.6\times10^{10}$ | −0.0323 %            | **0.9999**         |
| 0.5        | $4.0\times10^{10}$ | −0.0983 %            | **0.9997**         |
| 0.1        | $3.5\times10^{11}$ | −1.4926 %            | **0.9950**         |

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

#### 9.6 修复方式（不能简单删分支）

```c
double EvaluateSigma(double lnM);             // σ₁：FDM 下返回 CDM σ（现有逻辑，保留）
double EvaluateSigmaConditional(double lnM);  // σ₂：始终读主表（FDM 下自动为 FDM σ）
```

再把 7 处 $\sigma_2$/$\sigma_{\rm cond}$ 的调用改用 `EvaluateSigmaConditional`。

**切勿**直接删掉 `EvaluateSigma` 的 FDM 分支——那会破坏 $\sigma_1$ 的正确行为。

---

#### 9.7 回退记录（2026-09-10）：条件 HMF 对齐 Liu

**决策**：条件 HMF 回退到与 Liu 原码一致（不乘 $f_{\rm FDM}$、$\sigma_2$ 用 FDM σ）。

**当初这么改的理由**（出处：`docs/FDM_MCG_modeling.md` §3 方案 2，114–125 行）：

> 答案是**有，而且是物理自洽的**（见附录 A.2）：
>
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

| 文件                                                 | 改动                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/py21cmfast/src/hmf.c`                         | `conditional_hmf` 移除 `result *= dndm_FDM(exp(lnM))`，改为详尽注释记录原理由与回退依据                                                                               |
| `src/py21cmfast/src/interp_tables.c`               | **新增** `EvaluateSigmaConditional()`（始终读主表 → FDM 模式下为 FDM σ）；7 处 $\sigma_2$/$\sigma_{\rm cond}$ 调用改用之（`317/435/518/599/632/692/741`） |
| `src/py21cmfast/src/interp_tables.h`               | 声明`EvaluateSigmaConditional`                                                                                                                                          |
| `src/py21cmfast/src/_functionprototypes_wrapper.h` | 声明`EvaluateSigmaConditional`                                                                                                                                          |

$\sigma_1$（`dNdM_conditional_EPS` 内 `hmf.c:288`）**保持不变**，仍走 `EvaluateSigma`（FDM→CDM 表），
避免与 Eq.(5) 要求冲突。

**验证**：编译通过（exit 0），`.so` 已同步至 `src/py21cmfast/`；
实测 $\sigma_2^{\rm FDM}=2.152282$ vs $\sigma_2^{\rm CDM}=2.152299$（差 −0.0008%），
`conditional_hmf` 返回值已不含 $f_{\rm FDM}$。

**回退后条件路径三要素**（与 Liu 一致）：

$$
\sigma_1=\sigma_{\rm CDM}(m),\qquad \sigma_2=\sigma_{\rm FDM}(M),\qquad
\nu^2=\frac{[\delta_c-\delta_{\rm FDM}]^2}{\sigma_1^2-\sigma_2^2},\qquad
\text{不乘 } f_{\rm FDM}
$$

---

### 10. 速查表

| 问题                                                                           | 答案                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| FDM 的 dndm 怎么算？                                                           | CDM dndm（**用 CDM σ**）× $f_{\rm FDM}(m)$       |
| σ 用 CDM 还是 FDM？                                                           | **CDM**（唯一例外：条件 HMF 的 $\sigma_2$ 用 FDM） |
| 为什么不用 FDM σ？                                                            | 会与$f_{\rm FDM}$ 双重计数                               |
| $f_{\rm FDM}$ 压制大质量还是小质量？ | **小质量**（$\alpha=-1.1<0$） |                                                            |
| 条件 HMF 要不要乘$f_{\rm FDM}$？                                             | **要**（Eq.(3) 要求；且闭合性严格成立）              |
| $\sigma_1$ 用什么？                                                          | CDM σ                                                     |
| $\sigma_2$ 用什么？                                                          | FDM σ（fork 当前退化为 CDM，是唯一偏离）                  |
| 分子 δ 用什么？                                                               | FDM 场的 δ（代码自动满足）                                |
| md 的行号引用准确吗？                                                          | **准确**（以 `D:\v21cmFAST` ps.c 4544 行为准）     |
| 基线在哪？                                                                     | `git tag baseline/pre-fdm` → `d8f67b76`               |

---

### 11. 常见误区

| 误区                                                                                                                                                                                                                                                                                                  | 纠正                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 「$f_{\rm FDM}$ 是压制大质量晕的」 | 错。$\alpha=-1.1<0$，压制**小质量**晕                                                                                                                                                                                                                  |                                                                                                                                                |
| 「条件 HMF 乘$f_{\rm FDM}$ 会破坏闭合关系」 | 错。$f_{\rm FDM}(M)$ 只依赖 $M$、不依赖 $\delta$，可提出 $\delta$ 平均之外：$\langle$cond$_{\rm CDM}\times f\rangle_\delta=f\times\langle$cond$_{\rm CDM}\rangle_\delta=f\times$uncond$_{\rm CDM}=$uncond$_{\rm FDM}$，闭合严格成立 |                                                                                                                                                |
| 「σ₁ 用 CDM、σ₂ 用 FDM 是 bug」                                                                                                                                                                                                                                                                   | 错。这正是 Eq.(5) 的明确要求                                                                                                                   |
| 「σ₁ 和 σ₂ 应统一为 CDM σ」                                                                                                                                                                                                                                                                      | 错。$\sigma_2$ 必须是 FDM σ                                                                                                                 |
| 「FDM 效应主要来自 HMF」                                                                                                                                                                                                                                                                              | 不准确。$M_{\rm sol}\ll M_{\rm hm}$（$m_{22}{=}1$：$1.5\times10^7$ vs $1.6\times10^{10}$），**冷却通道才是主导，且目前完全缺失** |
| 「用`/home/dministrat/v21cmFAST` 核对 Liu 行号」                                                                                                                                                                                                                                                    | 错。那是本仓库重构版（`1945bf0`，4423 行，含独立 `fdm.c`），要用 `D:\v21cmFAST`（4544 行）                                               |

---

### 12. 代码索引

#### Liu 源码 `D:\v21cmFAST`（v3.3.1，`ps.c` 4544 行）

| 符号                                           | 位置                                          |
| ---------------------------------------------- | --------------------------------------------- |
| `dndm_FDM`                                   | `ps.c:987`                                  |
| `dNdM_st`                                    | `ps.c:995`                                  |
| `dNdM_st_F`（= `dNdM_st` × `dndm_FDM`） | `ps.c:1032-1034`                            |
| `power_in_k_cdm`                             | `ps.c:310`                                  |
| `dNdM_conditional`                           | `ps.c:2240-2286`                            |
| $\sigma_1$ 的 FDM 分支                       | `ps.c:2251-2256`                            |
| $\sigma_2 = $`Sigma_InterpTable[...]`        | `ps.c:2845`（另 2930 / 3072 / 3397 / 3507） |
| `Sigma_InterpTable_CDM` 建表                 | `ps.c:1684, 1694`                           |

#### 本仓库 fork

| 符号                                            | 位置                                                     |
| ----------------------------------------------- | -------------------------------------------------------- |
| `T_F`                                         | `src/py21cmfast/src/fdm.c:35`                          |
| `dndm_FDM`                                    | `src/py21cmfast/src/fdm.c:51`                          |
| `sigma_z0_pre` / `dsigmasqdm_z0_pre`        | `fdm.c:92` / `fdm.c:150`                             |
| `conditional_hmf`（含 ×`dndm_FDM`）        | `src/py21cmfast/src/hmf.c:438-462`（**未提交**） |
| `unconditional_hmf`（含 ×`dndm_FDM`）      | `src/py21cmfast/src/hmf.c:509`                         |
| $T_F$ 接入功率谱                              | `src/py21cmfast/src/cosmology.c:297-300`               |
| `EvaluateSigma`                               | `src/py21cmfast/src/interp_tables.c:1206-1217`         |
| `EvaluatedSigmasqdm`                          | `interp_tables.c:1219-1231`                            |
| $\sigma_2$/$\sigma_{\rm cond}$ 调用（7 处） | `interp_tables.c:317/435/518/599/632/692/741`          |
| Python 参数`m22` / `FDM` / `HMF_FINDEX`   | `src/py21cmfast/wrapper/inputs.py:456 / 687 / 689`     |

#### 基线

```
git tag baseline/pre-fdm  →  d8f67b76   (FDM 引入前最后一个提交)
git diff baseline/pre-fdm -- src/py21cmfast/src/      # FDM 全部改动（含工作区）
```

---

### 13. 对照实验：为什么 fork 与 Liu 的结果一致？

> **【2026-09-10 实验记录】** 本节回答一个实证问题：
> fork 改了条件 HMF（加了 $f_{\rm FDM}$、$\sigma_2$ 退化为 CDM σ），
> 为何复现 Liu 论文上游结果（功率谱、HMF）时**一模一样**？

**实验脚本**：`train/_verify_fork_vs_liu.py`、`train/_verify_meanfixing.py`
**配置**：A = fork 现状（$\sigma_2$=CDM σ，$\times f_{\rm FDM}$）；
B = Liu 原码等效（$\sigma_2$=FDM σ，无 $f_{\rm FDM}$）
**固定条件**：$z=15$，BOX_LEN=200、HII_DIM=64 → $M_{\rm cond}=1.21\times10^{12}M_\odot$

#### 13.1 实验一：A/B 是 $M_{\min}/M_0$ 的普适函数

$M_0=1.6\times10^{10}m_{22}^{-4/3}$。扫描 $m_{22}$ 与积分下限 $M_{\min}$：

| $M_{\min}/M_0$ | 0.1   | 1         | 10    | 100   | 1000   |
| ---------------- | ----- | --------- | ----- | ----- | ------ |
| **A/B**    | ~0.01 | ~0.3–0.4 | ~0.90 | ~0.99 | ~0.999 |

**A/B 只依赖 $M_{\min}/M_0$，与 $m_{22}$ 本身无关**（各组数据落在同一条曲线上）。

判读：

- $M_{\min}\gg M_0$：积分区间全在 $f_{\rm FDM}\approx1$ 区域 → **A ≈ B**
- $M_{\min}\lesssim M_0$：$f_{\rm FDM}$ 的压制进入积分区间 → **A 显著小于 B**

即：**积分下限越高（相对 $M_0$），fork 与 Liu 越接近**。

#### 13.2 实验二：mean-fixing 才是"一模一样"的主因

21cmFAST 的 mean-fixing：

$$
\text{格点物理量} = \text{条件积分}(\delta)\times\frac{\text{全局无条件平均}}{\text{格点条件平均}}
$$

两者无条件路径**都含** $f_{\rm FDM}$，故分子相同。对 $\delta$ 扫描（$m_{22}{=}10$，$M_{\min}=10^9$，$M_{\min}/M_0=1.35$）：

| $\delta$     | ∫A (fork) | ∫B (Liu)  | **A/B 原始** | **A/B mean-fix 后** |
| -------------- | ---------- | ---------- | ------------------ | ------------------------- |
| −0.50         | 1.706e−07 | 4.758e−07 | 0.359              | 0.933                     |
| −0.20         | 2.115e−05 | 5.680e−05 | 0.372              | 0.969                     |
| **0.00** | 3.420e−04 | 8.901e−04 | 0.384              | **1.0000**          |
| 0.20           | 3.900e−03 | 9.785e−03 | 0.399              | 1.038                     |
| 0.50           | 7.690e−02 | 1.802e−01 | 0.427              | 1.111                     |
| 1.00           | 1.559e+00  | 3.152e+00  | 0.495              | 1.287                     |

> $\delta=2.0$ 处出现负值（条件 HMF 在大 $\delta$ 下数值失效），已排除。

**关键发现**：

1. **$\delta=0$ 处 mean-fix 后 A/B 恰好 = 1.0000**——这是 mean-fixing 的归一化锚点，
   所有全局平均量在此被强制对齐。
2. **原始条件积分差异达 60%**（A/B≈0.38），但 mean-fixing 后压缩到
   $|\delta|\le0.2$ 范围内 <4%。
3. 差异随 $|\delta|$ 增大而显现：$\delta=0.5$ 时 11%，$\delta=1$ 时 29%。

#### 13.3 结论：三层原因

| 层次                                                  | 现象                                     | 原因                                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **上游量**(功率谱、无条件 HMF)                  | **完全一致**                       | 两者实现相同：$T_F$ 都接入 `power_in_k`；无条件 HMF 都乘 $f_{\rm FDM}$。这是 Liu 论文 Fig.1、Fig.2 复现成功的原因 |
| **全局平均量**(δ≈0，全局 21cm 信号、电离历史) | **完全一致**                       | mean-fixing 把条件结果锚定到无条件结果（含$f_{\rm FDM}$），归一化差异被完全吸收                                       |
| **起伏量**(高 δ 区、小尺度功率谱)              | **有差异**(δ=0.5→11%，δ=1→29%) | $f_{\rm FDM}$ 是 $M$ 依赖的形状因子，mean-fixing 只能补一个标量，补不回形状                                         |

**因此**：你复现论文上游图时"一模一样"是**正确且预期的**——
那些图验证的是功率谱与无条件 HMF，本来就不涉及条件 HMF 的分歧。
分歧只在对**密度起伏敏感**的观测量上才显现，且需要 $M_{\min}\lesssim M_0$ 才显著。

#### 13.4 关于 Liu 代码

基于 §8 的证据（$dndm\_FDM$ 在 `ps.c` 仅 2 处：定义 987、$dNdM\_st\_F$ 内 1033），
Liu 条件路径未显式乘 $f_{\rm FDM}$。但由本节实验可知：

- 该缺失**不影响**论文 Fig.1/Fig.2 的上游复现（条件路径不参与）
- 对全局量，mean-fixing 会补偿归一化
- 其残余影响属"起伏形状"层面

故 Liu 代码的整体结果仍自洽，此前报告中"代码缺失"的表述应理解为
**相对论文 Eq.(3)+(5) 的严格形式而言**，而非"结果错误"。

---

### 14. 参考文献

**FDM 物理**：Liu et al. 2025, PRD 112, 103534（Eq.2–5）· Schive et al. 2016, PRL 116, 201302（$f_{\rm FDM}$）· Schive et al. 2014, Nature Phys. 10, 496（孤子核心–晕关系）· Hu, Barkana & Gruzinov 2000, PRL 85, 1158（$T_F$）· Du et al. 2017, ApJ 838, 63（FDM excursion set）

**结构形成**：Sheth & Tormen 2001, MNRAS 323, 1（ST 多重度函数）· Press & Schechter 1974, ApJ 187, 425 · Bond et al. 1991（EPS）· Lacey & Cole 1993（条件质量函数）· Barkana & Loeb 2001, Phys. Rep. 349, 125

**21cmFAST**：Mesinger, Furlanetto & Cen 2011, MNRAS 411, 955 · Park et al. 2019, MNRAS 484, 933

# 第二篇　冷却通道：CDM 拟合因子依赖审计

> 来源：`docs/FDM_cooling_report.md`　状态：**现行**

> **【2026-09-09 交叉引用】** 本报告的姊妹文档 **`docs/FDM_audit_report.md`**
> 处理的是 **HMF 通道**（条件/无条件 HMF 的 FDM 处理）与 Liu+25 论文的一致性审计。
>
> 两文的分工：
>
> - **本文（`FDM_cooling_report.md`）**：冷却链路中 CDM 校准因子的依赖审计（A–E 分类）
> - **审计报告（`FDM_audit_report.md`）**：HMF 通道的三方对照与冲突裁决
>
> 若需查证「条件 HMF 该不该乘 `dndm_FDM`」「σ 混合是否为 bug」「Liu 源码行号」等问题，
> **请直接查阅 `FDM_audit_report.md`**，本文不重复论证。

### 1. 问题陈述

21cmFAST 的气体冷却与反馈模型包含大量从 CDM 模拟中校准的经验参数。在 FDM（Fuzzy Dark Matter）下，是否需要修改这些参数？

**本报告的核心任务**：逐个核查冷却链路中每个参数的物理含义、原始论文校准背景、CDM 依赖程度，给出是否需要 FDM 修正的判定。

---

### 2. 代码冷却链路总览

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

### 3. 分类标准

| 类别        | 定义                                   | 判断准则                                                                          |
| ----------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| **A** | 物理常数，无模拟校准                   | 数值来自量子/分子/原子物理或宇宙学定义                                            |
| **B** | CDM 模拟校准，但描述的是 DM-无关的物理 | 函数形式描述气体化学/辐射转移/流体力学                                            |
| **C** | CDM 校准，且隐含 CDM 晕结构假设        | 校准依赖 NFW 密度轮廓等 CDM 特有属性                                              |
| **D** | 唯象参数，调参即可，无需改公式         | 描述晕内天体物理，不论 CDM/FDM 同类晕不应有系统差异，但最优值会因 dndm_FDM 而不同 |
| **E** | 物理尺度远大于 FDM 截止尺度            | FDM 量子压力影响 < 0.1%，可忽略                                                   |

---

### 4. 完整参数依赖表

#### 4.1 基础物理参数（A类）

| 参数                            | 默认值/公式                                                 | 物理来源                          | 代码路径             |
| ------------------------------- | ----------------------------------------------------------- | --------------------------------- | -------------------- |
| `TtoM(z, T, μ)`              | `7030.97/h · √(Ωm(z)/(Ωm·Δc)) · [T/(μ(1+z))]^3/2` | Virial 定理 (Barkana & Loeb 2001) | `cosmology.c:671`  |
| `deltac_nonlinear(z)`         | `18π² + 82[Ωm(z)-1] − 39[Ωm(z)-1]²`                 | 球对称坍缩 (Bryan & Norman 1998)  | `cosmology.c:658`  |
| `atomic_cooling_threshold`    | `TtoM(z, 10⁴ K, 0.59)`                                   | Lyα 激发能 10.2 eV               | `thermochem.c:278` |
| `molecular_cooling_threshold` | `TtoM(z, 600 K, 1.22)`                                    | H₂ 转动-振动冷却 = 绝热膨胀率    | `thermochem.c:280` |

> **判定**：全部不依赖 CDM。TtoM 中 Δc 的 Bryan-Norman 拟合系数虽然从 SCDM N-body 获得，但球坍模型在 FDM virial 尺度（量子压力亚主导）依旧适用，差异可忽略。

#### 4.2 LW 反馈（B/C 类）

**实现**（`thermochem.c:282`）：

$$
M_{\text{crit}}^{\text{LW}}(z) = \underbrace{3.314\times 10^7 (1+z)^{-1.5}}_{\text{mcrit\_noLW}} \times \underbrace{(1 + A_{\text{LW}} J_{21}^{B_{\text{LW}}})}_{\text{LW 倍增}} \times \underbrace{\left(1 + A_{\text{VCB}} \frac{v_{\text{cb}}}{\sigma_{\text{VCB}}}\right)^{B_{\text{VCB}}}}_{\text{VCB 倍增}}
$$

##### 论文校准链

| 论文                                                             | 贡献                                                        |      DM 模型      |
| ---------------------------------------------------------------- | ----------------------------------------------------------- | :----------------: |
| Stacy, Bromm & Loeb (2011, MNRAS 413, 172)                       | 首次 CDM+gas 分子冷却 cosmological 模拟                     |   **CDM**   |
| Greif et al. (2011, ApJ 737, 75)                                 | 同上，独立验证                                              |   **CDM**   |
| Fialkov, Barkana, Tseliakhovich & Hirata (2012, MNRAS 424, 1335) | 拟合 Stacy+11/Greif+11 模拟，给出 M_min(v_cb, z)            | **CDM 校准** |
| Visbal et al. (2015, Nature 528, 357)                            | 从 Fialkov+12 提取最优拟合：3.314×10⁷ (1+z)^(-1.5)        | **CDM 校准** |
| Schauer, Glover, Klessen & Clark (2020, MNRAS 507, 1775)         | 高分辨率 CDM+gas 模拟，发现 LW 反馈更弱（H₂ 自屏蔽被低估） |   **CDM**   |
| Muñoz et al. (2021, arXiv:2110.13919)                           | 综合多项模拟，推荐 A_LW=2.0, BETA_LW=0.6                    | **CDM 综合** |

> 代码注释 (`thermochem.c:272-278`) 原文：*"correction follows Schauer+20, fit jointly to LW feedback and relative velocities. They find weaker effect of LW feedback than before (Stacy+11, Greif+11, etc.) due to HII self shielding. this follows Visbal+15, which is taken as the optimal fit from Fialkov+12 which was calibrated with the simulations of Stacy+11 and Greif+11"*

##### 逐参数判定

| 参数           | 默认值                       |    类别    | 理由                                                                                                 | 建议                                                                             |
| -------------- | ---------------------------- | :---------: | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `mcrit_noLW` | `3.314×10⁷ (1+z)^(-1.5)` | **C** | 从 CDM NFW 晕的 H₂ 形成模拟中拟合。FDM soliton 平核需更大 M_vir 达到同等中心气体密度                | **FDM 下变化最大的参数。** 建议预留 `FDM_COOLING_BOOST` 占位（默认 1.0） |
| `A_LW`       | 2.0                          | **B** | H₂ 光解离倍增因子。光解离截面是分子物理常数，但数值来自 CDM 模拟拟合                                | 暂保留，待 FDM+gas 模拟校准                                                      |
| `BETA_LW`    | 0.6                          | **B** | 同上                                                                                                 | 同上                                                                             |
| `A_VCB`      | 1.0                          | **B** | v_cb 对气体吸积的影响是流体力学，不依赖 DM。Muñoz+21 确认 A_VCB=1.0 "agrees between different sims" | 暂保留                                                                           |
| `BETA_VCB`   | 1.8                          | **B** | 同上                                                                                                 | 暂保留                                                                           |
| `σ_VCB`     | 29.0 km/s                    | **E** | BAO 尺度（~100 Mpc）≫ FDM 截止尺度（~kpc），T_F(k) 影响 < 0.1%                                      | 不修改                                                                           |

> `inputs.py:1242-1250` 存档了两个版本：Machacek+01（A_LW=22.86, BETA_LW=0.47）和 Muñoz+21（A_LW=2.0, BETA_LW=0.6）。代码默认使用后者。

#### 4.3 再电离反馈（C 类）

**实现**（`thermochem.c:26-30,302-307`，SM13 参数化）：

$$
M_{\text{crit}}^{\text{RE}} = M_0 \times (B \cdot \Gamma_{\text{HII}})^{a} \times \left(\frac{1+z}{10}\right)^{b} \times \left[1 - \left(\frac{1+z}{1+z_{\text{IN}}}\right)^{c}\right]^{d}
$$

其中：

| 符号    | 代码常量          | 默认值                     | 含义                                             |
| ------- | ----------------- | -------------------------- | ------------------------------------------------ |
| $M_0$ | `REION_SM13_M0` | $3\times 10^9\; M_\odot$ | 参考特征质量                                     |
| $a$   | `REION_SM13_A`  | 0.17                       | 电离背景$\Gamma$ 的幂律指数                    |
| $b$   | `REION_SM13_B`  | −2.1                      | $(1+z)/10$ 的幂律指数                          |
| $c$   | `REION_SM13_C`  | 2.0                        | 再电离进度$1-(1+z)/(1+z_{\text{IN}})$ 的内指数 |
| $d$   | `REION_SM13_D`  | 2.5                        | 再电离进度项的外指数                             |
| $B$   | `HALO_BIAS`     | 2.0                        | 晕偏置常数近似                                   |

##### 校准背景

| 论文                                                 | 内容                                                                                   |       DM 模型       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- | :------------------: |
| Sobacchi & Mesinger 2013, Paper I (MNRAS 432, L51)   | 球对称坍缩 +**固定 NFW 暗物质势阱** + 气体流体力学 + UVB 加热，测量 M_min(Γ, z) | **CDM NFW 势** |
| Sobacchi & Mesinger 2013, Paper II (MNRAS 432, 3340) | 将 Paper I 的 M_min 参数化引入半数值再电离模拟                                         |    **CDM**    |

**核心问题**：SM13 使用固定 NFW 势阱（尖点 ρ ∝ r⁻¹）。FDM soliton 平核 → 同一 M_vir 的中心引力势更浅 → 气体更容易被 UVB 光致蒸发吹散 → M_min 更大。

| 参数                         | 默认值        |    类别    | 理由                                                                        | 建议                |
| ---------------------------- | ------------- | :---------: | --------------------------------------------------------------------------- | ------------------- |
| M₀                          | 3×10⁹ M_sun | **C** | CDM NFW 势阱校准                                                            | FDM 下 M₀ 可能偏小 |
| a=0.17, b=-2.1, c=2.0, d=2.5 | —            | **C** | 同上                                                                        | FDM 下可能不同      |
| HALO_BIAS                    | 2.0           | **C** | 常数近似，CDM 下约 2-3。FDM 小晕被压制后有效偏置更高，但差异 < 近似本身误差 | 不修改              |

#### 4.4 晕内天体物理参数（D 类）

**D 类定义**：描述晕内部 gas → 恒星 → 辐射转换效率的参数。它们的公式本身描述的是晕内天体物理，不依赖 DM 类型——FDM 影响的是「有多少晕存在」（通过 `conditional_hmf × dndm_FDM`），而不改变「单个晕是否发光」的物理规律。

**与 C 类的本质区别**：

- **C 类**（如 mcrit_noLW）：公式是 CDM NFW 晕结构 → 气体冷却的映射，FDM soliton 平核下**这条映射本身就变了**，需要 FDM+gas 模拟重新校准公式系数。
- **D 类**（如 F_STAR10, M_TURN）：公式描述恒星形成效率等晕内物理，不论 CDM 还是 FDM 晕，同类晕的 f* 不应有系统差异。所以**公式不需要因 FDM 改写**。但由于 dndm_FDM 砍掉了小晕，同样的参数值在 FDM 下会输出更少的 Nion——如果想匹配同样的观测数据，你自然会为 FDM 选一组不同的参数值。**这是手动调参的行为，不是公式层面的 FDM 修正。**

##### 代码中的角色

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

| 参数字段          | Python 参数          | 默认值                        | 在式中的角色                                                                    |     判定     |
| ----------------- | -------------------- | ----------------------------- | ------------------------------------------------------------------------------- | :-----------: |
| `p.f_star_norm` | `F_STAR7_MINI`     | `F_STAR10 − 3×ALPHA_STAR` | log f*(M=10⁷ M_sun)：分子冷却晕的恒星形成效率归一化                            |  **D**  |
| `p.alpha_star`  | `ALPHA_STAR_MINI`  | `= ALPHA_STAR`              | f*(M) ∝ M^α 的幂律指数                                                        |  **D**  |
| `p.f_esc_norm`  | `F_ESC7_MINI`      | 10⁻²                        | log f_esc(M=10⁷ M_sun)：电离光子逃逸分数                                       |  **D**  |
| `p.alpha_esc`   | `ALPHA_ESC`        | —                            | f_esc(M) 的幂律指数（与 ACG 共用）                                              |  **D**  |
| `p.Mturn_mcg`   | LW+VCB+SM13 联合计算 | 见 4.2/4.3                    | exp(−M_turn/M)：低质量端指数截断                                               | **B/C** |
| `p.Mturn_upper` | `acg_thresh`       | z-dependent (T_vir=10⁴ K)    | exp(−M/M_acg)：高质量端截断（超出分子冷却范围）                                |  **A**  |
| —                | `L_X_MINI`         | `= L_X`                     | X 射线光度 / SFR（`scaling_relations.c:62`），用于 `Xray_General()`         |  **D**  |
| —                | `M_TURN`           | 10^8.7 M_sun                  | ACG 的 SN/光加热截断质量（`scaling_relations.c:80`，仅 ACG 路径使用）         |  **D**  |
| —                | `ION_Tvir_MIN`     | 10^4.7 K                      | 电离源积分下限（`hmf.c:1262`），FDM 的影响在 HMF 中已囊括                     |  **D**  |
| —                | `F_H2_SHIELD`      | 0.0                           | H₂ 自屏蔽因子（`inputs.py:1237-1240`），分子云内部物理，与宿主晕 DM 类型无关 |  **B**  |

#### 4.5 HMF / 结构形成参数

| 参数                              | 默认值            |     类别     | 校准来源                                           |                                      判定                                      |
| --------------------------------- | ----------------- | :-----------: | -------------------------------------------------- | :----------------------------------------------------------------------------: |
| ST HMF (a=0.73, p=0.175, A=0.353) | `hmf.c:269-281` | **B/C** | Sheth & Tormen 2001, 从 Jenkins+01 CDM N-body 校准 | CDM σ + ST 拟合 + dndm_FDM 是 FDM 文献标准 (Schive+16, Du+17, Liu+25)，不修改 |
| EPS 条件质量函数                  | `hmf.c:285-298` |  **A**  | Bond+91 / Lacey & Cole 93                          |                           纯统计框架，不依赖 DM 类型                           |
| dndm_FDM                          | `fdm.c:51-55`   | **—** | Schive+16 SP 模拟                                  |                              **已实现 ✓**                              |
| HMF_FINDEX                        | -1.1              | **—** | Schive+16 拟合                                     |                              **已实现 ✓**                              |
| m22                               | —                | **—** | FDM 粒子质量                                       |                               **用户输入**                               |

> **关于 dndm_FDM 的命名**：代码注释中的 "high-mass cutoff" 是误导性的。实际负指数 -1.1 压制的是 **小质量晕**（M ≪ M₀ → f(M) → 0），应理解为 "low-mass suppression"。

---

### 5. Nion 积分链路的完整依赖标注

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

### 6. 结论与行动建议

#### 6.1 按优先级排序

|      优先级      | 参数                            | 类别 | 行动                                                                                                       |
| :--------------: | ------------------------------- | :--: | ---------------------------------------------------------------------------------------------------------- |
|   **P0**   | dndm_FDM                        |  —  | **已完成** — `conditional_hmf` 和 `unconditional_hmf` 均已接入                                  |
|   **P1**   | mcrit_noLW (3.314×10⁷)        |  C  | **最大不确定性** — 建议预留 `FDM_COOLING_BOOST` 乘法因子（默认 1.0），待 FDM+gas 模拟数据重新校准 |
|   **P1**   | SM13 reionization_feedback 参数 |  C  | 从 CDM NFW 势校准，FDM 平核下光致蒸发更有效，M₀ 和 a/b/c/d 可能需要重校                                   |
|   **P2**   | A_LW, BETA_LW, A_VCB, BETA_VCB  |  B  | 暂保留 CDM 校准值，待 FDM+gas 模拟验证                                                                     |
|   **P3**   | M_TURN, F_STAR7_MINI 等         |  D  | 晕内天体物理公式不需要 FDM 修正；在 FDM 下如需匹配同一组观测数据，这些参数的手动取值会与 CDM 不同          |
| **不修改** | A, E 类全部参数                 | A/E | 物理常数或尺度分离，不受 FDM 影响                                                                          |

#### 6.2 架构正确性确认

冷却管线中的两条链路是独立串联的：

- **`conditional_hmf`**：通过 `dndm_FDM` 决定了 FDM 下有多少晕存在（**一阶效应，已实现**）
- **`nion_fraction`**：决定了给定晕是否发光（冷却/反馈物理，需要评估 CDM 校准依赖）

FDM 的量子压力通过**通道 1**（减少晕的数量，dndm_FDM）已经实现。**通道 2**（soliton 平核影响单晕冷却效率）目前没有公认模型，体现在 C 类参数的不确定性中。

---

### 参考文献

**FDM 物理**：Schive et al. 2016, Nature Physics 12, 191 · Hu, Barkana & Gruzinov 2000, PRL 85, 1158 · Liu et al. 2025 · Du et al. 2017, MNRAS 465, 941

**CDM 冷却/反馈校准**：Machacek, Bryan & Abel 2001, ApJ 548, 509 · Stacy, Bromm & Loeb 2011, MNRAS 413, 172 · Greif et al. 2011, ApJ 737, 75 · Fialkov et al. 2012, MNRAS 424, 1335 · Visbal et al. 2015, Nature 528, 357 · Schauer et al. 2020, MNRAS 507, 1775 · Muñoz et al. 2021, arXiv:2110.13919 · Qin et al. 2020

**CDM 再电离反馈**：Sobacchi & Mesinger 2013 (Paper I), MNRAS 432, L51 · Sobacchi & Mesinger 2013 (Paper II), MNRAS 432, 3340

**CDM 结构形成/宇宙学**：Barkana & Loeb 2001, Phys. Rept. 349, 125 · Bryan & Norman 1998, ApJ 495, 80 · Jenkins et al. 2001, MNRAS 321, 372 · Sheth & Tormen 2001, MNRAS 323, 1 · Tseliakhovich & Hirata 2010, PRD 82, 083520

**21cmFAST**：Park et al. 2018, MNRAS 484, 933

# 第三篇　分子冷却阈值 mcrit 的 FDM 迁移

> 来源：`docs/FDM_mcrit_algorithm.md`　状态：**现行**

### 1. 问题定义

21cmFAST 通过两条链路控制小质量晕的恒星形成效率：

| 链路        | 环境               | 冷却机制                 | 代码入口                     |
| ----------- | ------------------ | ------------------------ | ---------------------------- |
| A: 分子冷却 | 中性 IGM, 再电离前 | H₂ 转动-振动线 (~100 K) | `lyman_werner_threshold()` |
| B: 原子冷却 | 电离 IGM, 再电离后 | H/He 原子线 (~10⁴ K)    | `reionization_feedback()`  |

本报告聚焦**链路 A**：将 `mcrit_noLW` 从 CDM 迁移到 FDM。链路 B 的 SM13 改造见附录 B。

---

### 2. `mcrit_noLW` 在代码中的角色

#### 2.1 作为指数截断尺度（非二元开关）

`thermochem.c:289` 定义 `mcrit_noLW`。下游唯一的消费点位于 `scaling_relations.c:354-355`：

```c
f_sample_mini *= exp(-mturn_mcg / halo_mass - halo_mass / consts->acg_thresh + ...);
```

其中 `mturn_mcg = max(Mturn_RE, max(Mturn_LW, mcrit_noLW))`（含 LW 和相对速度修正）。

关键认识：`mcrit_noLW` **不是**"能否冷却"的二元判定，而是 **`exp(−mturn/M)` 截断曲线的特征质量标度**[20]。当 `halo_mass ≫ mturn` 时 `exp → 1`（无抑制）；当 `halo_mass ≪ mturn` 时恒星形成被指数压低。

#### 2.2 完整调用链

```
lyman_werner_threshold(z, J_21_LW, vcb)       [thermochem.c]
    │
    ├─ mcrit_noLW = 3.314e7 (1+z)^-1.5        ← 当前: CDM Fialkov+12 [9]
    ├─ × f_LW(J_21_LW)                         ← Schauer+21 [11] LW 反馈
    └─ × f_vcb(vcb)                            ← 相对速度修正
        │
        └→ nion_fraction_mini(lnM)             [nion_fractions.c]
               │
               Mturn_mcg = max(Mturn_RE, max(Mturn_LW, mcrit_noLW))
               └→ exp(−Mturn_mcg / M)           ← 低质量指数截断
```

FDM 修改的入口点唯一：替换 `mcrit_noLW` 的数值。所有下游逻辑不变。

---

### 3. CDM 基线：`mcrit_CDM = 3.314e7 (1+z)^(−1.5)` 的物理起源

#### 3.1 最小分子冷却温度

原初气体冷却的主要通道是 H₂ 转动-振动跃迁 [5]，激发温度 ≈ 512 K。只有气体温度 ≳ 200–600 K 时 H₂ 冷却才能有效 [2,3]。维里温度条件为：

$$
T_{\rm vir} = \frac{\mu m_p}{2k_B} \frac{GM_{\rm vir}}{R_{\rm vir}} \gtrsim T_{\rm cool} \approx 600\,{\rm K}
$$

其中 $T_{\rm vir}$ 的定义见 [2]。代入维里定理 $R_{\rm vir} \propto M^{1/3}(1+z)^{-1}$ [2]：

$$
T_{\rm vir} \propto M^{2/3}(1+z) \quad \Rightarrow \quad M_{\rm crit} \propto T_{\rm cool}^{3/2}(1+z)^{-3/2}
$$

这是 $m_{\rm crit} \propto (1+z)^{-1.5}$ 的来源 [9]。但仅温度不足以完全确定前置因子。

> **【2026-09-10 注】** 上式的 $T_{\rm cool}\approx600$ K 是**冷却函数本身有效**的温度下限；
> 而实际拟合对应的维里温度为 $T_{\rm vir}\approx1007$ K（见 §3.3.1），**高于** 600 K。
>
> 原因：冷却能否真正驱动坍缩，不只取决于温度，还须同时满足 $t_{\rm cool}<t_{\rm ff}$
> 与足够的 H₂ 丰度（§3.2）。低质量晕气体密度低、H₂ 丰度小，
> 即便温度越过 600 K 也未必冷却得动——这就把有效阈值推高到 $10^3$ K 量级。

#### 3.2 非平衡 H₂ 化学 + 冷却竞争

> **【2026-09-10 补充】** 原版只给了 $t_{\rm form}$，未给出另外三个时标，也未说明
> 两个条件如何给出**质量下限**。此处补齐。

##### 3.2.1 四个时标

临界质量由四个时标的竞争决定：

| 时标 | 表达式 | 说明 |
|---|---|---|
| **自由落体** | $t_{\rm ff}=\sqrt{\dfrac{3\pi}{32G\rho}}$ | 维里化晕的 $\rho\propto\Delta_c\rho_{\rm bg}\propto(1+z)^3$，**与晕质量无关** |
| **冷却** | $t_{\rm cool}=\dfrac{(3/2)nk_BT}{\Lambda_{\rm H_2}}$，$\Lambda_{\rm H_2}\propto n_{\rm H}^2$ | 因 $\Lambda\propto n^2$，故 $t_{\rm cool}\propto\dfrac{T}{n_{\rm H}x_{\rm H_2}}$ |
| **Hubble** | $t_H=H(z)^{-1}$ | 宇宙膨胀时标 |
| **H₂ 形成** | $t_{\rm form}=\dfrac{1}{k_{{\rm H}^-}x_e n_{\rm H}}$ | 见下 |

> 关于 $t_{\rm ff}$ 与质量无关：维里化后晕的**平均**密度只由 $\Delta_c(z)$ 与背景密度决定，
> 与 $M$ 无关。这一点是把临界条件归结为"温度阈值"的关键。

##### 3.2.2 为什么这两个条件给出**质量下限**

需同时满足 [3]：

1. **$t_{\rm form}<t_H$**：否则宇宙膨胀稀释之前积累不到足够 H₂ 丰度
2. **$t_{\rm cool}<t_{\rm ff}$**：否则气体绝热压缩加热压倒辐射冷却，无法坍缩

对条件 2 做标度分析：$t_{\rm ff}$ 只依赖 $z$，而

$$T_{\rm vir}\propto M^{2/3}(1+z)\quad\Rightarrow\quad M\ \text{越小}\ \Rightarrow\ T_{\rm vir}\ \text{越低}$$

H₂ 是**转动–振动跃迁**冷却，其激发态布居随温度呈类指数衰减。当 $T_{\rm vir}$ 降到
$\sim10^3$ K 以下时，$\Lambda_{\rm H_2}$ 骤降 → $t_{\rm cool}$ 急剧变长 → 越过
$t_{\rm cool}=t_{\rm ff}$ 的临界点。

因此 $t_{\rm cool}=t_{\rm ff}$ **定义**了 $M_{\rm crit}$：**质量大于它才能有效冷却**。
条件 1 是 H₂ 丰度的独立约束。

> **关键推论**：由于 $t_{\rm ff}$ 与 $M$ 无关，这个临界条件本质上等价于
> "**$T_{\rm vir}$ 达到某个临界值**"。这直接连到 §3.3——Fialkov+12 的拟合
> 正对应 $T_{\rm crit}\approx10^3$ K。§3.2 与 §3.3 是同一物理的两种表述。

##### 3.2.3 H₂ 形成通道

原初气体中 H₂ 主要经 ${\rm H}^-$ 催化形成 [4]：

$$
\begin{aligned}
k_{{\rm H}^-} &= 1.0 \times 10^{-18}\, T^{0.88} \;{\rm cm^3\,s^{-1}} \quad {\rm [4,6]}\\[4pt]
x_{{\rm H}_2} &= \min\!\left(\frac{t_H}{t_{\rm form}},\;0.5\right), \quad t_{\rm form} = \frac{1}{k_{{\rm H}^-} x_e n_H}
\end{aligned}
$$

- $x_e$：自由电子分数（原初气体中残余电离，是 H⁻ 形成的催化剂）
- $n_{\rm H}$：氢核数密度，由晕内气体密度决定
- $x_{{\rm H}_2}\le0.5$ 的上限来自 ${\rm H}^-$ 催化循环的**化学计量约束**
  （每两个 H 原子产生一个 H₂ 分子后需再生 ${\rm H}^-$）

#### 3.3 Fialkov+12 的模拟校准

Fialkov+12 [9] 将 Stacy+11 [7] 和 Greif+11 [8] 的 3D 原初气体模拟结果拟合为简洁的幂律：

$$
\boxed{m_{\rm crit}^{\rm CDM}(z) = 3.314 \times 10^7\,M_\odot \cdot (1+z)^{-1.5}}
$$

> **【2026-09-10 更正】** 原版写「$T_{\rm vir}\gtrsim120$ K」**有误**，正确为
> $T_{\rm vir}\approx1.0\times10^3$ K（见下方数值反解）。按 $M\propto T^{3/2}$，
> 120 K 对应的质量比拟合值小约 **24 倍**。

公式在 21cmFAST 的 `thermochem.c:287-289` 中以 `mcrit_noLW` 变量实现。

##### 3.3.1 系数 $3.314\times10^7$ 的物理来源

把拟合式用 `TtoM` 反解，得到它对应的**特征维里温度**：

| z | $m_{\rm crit}^{\rm fit}$ [M⊙] | $T_{\rm vir}$ (μ=1.22 中性) | $T_{\rm vir}$ (μ=0.6 电离) |
|---|---|---|---|
| 5 | 2.255e+06 | 1008.7 | 496.1 |
| 10 | 9.084e+05 | 1007.1 | 495.3 |
| 20 | 3.444e+05 | 1006.9 | 495.2 |
| 30 | 1.920e+05 | 1006.9 | 495.2 |
| 40 | 1.262e+05 | 1006.9 | 495.2 |

$$\boxed{T_{\rm vir}=1007.2\pm0.6\ {\rm K}\quad(\mu=1.22,\ \text{中性气体})}$$

在 $z=5$–$40$ 全域内**恒定**（标准差 0.6 K）。即：

> **$3.314\times10^7$ 就是「$T_{\rm vir}\approx1007$ K 的晕的维里质量」的归一化系数。**

这与 §3.1 自洽：H₂ 转动–振动跃迁激发温度 512 K，气体需热到 $\gtrsim600$–$10^3$ K
才能有效冷却；维里化气体的温度与 $T_{\rm vir}$ 同量级，故阈值在 $10^3$ K 合理。

##### 3.3.2 指数与前置因子的来源分工

| 部分 | 来源 | 能否解析推导 |
|---|---|---|
| **指数 $-1.5$** | 维里标度 $M\propto T^{3/2}(1+z)^{-3/2}$，$T$ 固定即 $M\propto(1+z)^{-1.5}$ | ✅ **可** |
| **前置因子 $3.314\times10^7$** | 由临界温度 $T_{\rm crit}\approx10^3$ K 经 `TtoM` 映射 | ❌ **不能**，须靠模拟拟合 |

**即：解析只能给出指数，绝对归一化必须由模拟提供**
（Stacy+11 / Greif+11 的 3D 原初气体模拟 → Fialkov+12 拟合）。

##### 3.3.3 幂律近似的精度

`TtoM` 严格含 $\Omega_m(z)$ 与 $\Delta_c(z)$ 的 $z$ 依赖，故并非精确幂律。实测：

- 对拟合式做 log–log 线性拟合：斜率 **−1.500000**（精确）
- 用真实 `TtoM` 固定温度计算：斜率 **−1.4990**，偏离 −1.5 仅 **0.0010**

高 $z$ 下宇宙趋于 Einstein–de Sitter（$\Omega_m\to1$），故 $(1+z)^{-1.5}$ 近似极好。

前置因子 $3.314\times10^7$ 继承了 NFW 尖点密度假设 [1]，隐式编码了 CDM 的剖面结构
（见 §5.10 与 §3.4 的讨论）——**这正是 FDM 需要修正它的根本原因**。

> 数值复算脚本：`scripts/probe_mcrit_coeff.py`。

#### 3.4 NFW 尖点的中心密度优势

NFW 密度剖面 [1] $\rho(r) \propto r^{-1}(1 + r/r_s)^{-2}$ 在 $r \to 0$ 处 $\rho \to \infty$（形式发散 [1]）。实际受角动量或自由流截断，但核心密度仍极高。H₂ 冷却率 $\Lambda \propto n_H^2$ [5]，高中心密度 → 高效冷却 → 低质量晕也可形成恒星。

---

### 4. FDM 物理修正

> 本节的目标：从 FDM 的晕结构出发，定量推导出特征质量标度 $M_{\rm sol}(m_{22})$，为后续将其与 $m_{\rm crit}^{\rm CDM}$ 合成做准备。
>
> 关键要理清三个量的定义：
>
> - **$M_h$** — 晕总质量（自变量，决定了晕的全部性质）
> - **$M_{\rm core}(M_h, m_{22})$** — 孤子核心质量（**函数**，通过 Schive+14 核心-晕关系从 $M_h$ 计算得到）
> - **$M_{\rm sol}(m_{22})$** — 孤子-only 质量（**常数**，是 $M_{\rm core}(M_h) = M_h$ 的解；对于给定的轴子质量，有且仅有一个值）

#### 4.1 孤子平核取代 NFW 尖点

FDM 中量子压强制晕中心形成**孤子平核**（soliton core），密度剖面变为（Schive+14 [12], Nature Phys 10, 496, Eq. 2）：

$$
\rho_{\rm FDM}(r) =
\begin{cases}
\rho_c \left[1 + 0.091\,(r/r_c)^2\right]^{-8} & r < r_t \quad \text{(孤子平核)} \\[4pt]
\rho_{\rm NFW}(r) & r > r_t \quad \text{(外包层)}
\end{cases}
$$

**核心结论**：$r \to 0$ 时 $\rho \to \rho_c$（**有限常数**），而非 CDM NFW 的 $\rho \to \infty$。

孤子核心密度与特征半径（Schive+14 Eq. 3-4）：

$$
\rho_c = 4.7 \times 10^{-3}\,m_{22}^{-2}\left(\frac{r_c}{\rm kpc}\right)^{-4}\,M_\odot\,{\rm pc}^{-3}
$$

$$
r_c = 0.59\,m_{22}^{-2/3}\left(\frac{M_h}{M_\odot}\right)^{-1/3}\,{\rm kpc}
$$

联立得 $\rho_c \propto M_h^{4/3}$（由 Schive+14 Eqs. 3–4 导出 [12]）。对比 CDM NFW 有效中心密度 $\rho_{\rm eff}^{\rm CDM} \propto M_h^{2.13}$（由 Bullock+01 [14] 浓度-质量关系 $c(M) \propto M^{-\beta}$、$\beta \approx 0.13$ 和 $\rho_{\rm eff} \propto c^3 M_h$ 导出），**FDM 在低质量端中心密度系统性低于 CDM**。

#### 4.2 $M_{\rm core}(M_h, m_{22})$：Schive+14 核心-晕质量关系

FDM N-body 模拟的拟合结果——孤子核心质量与晕总质量的关系（Schive+14 [12] Eq. 5）：

$$
M_{\rm core}(M_h, m_a) = 3.1 \times 10^7\left(\frac{m_a}{2 \times 10^{-22}\,{\rm eV}}\right)^{-1}\left(\frac{M_h}{10^9\,M_\odot}\right)^{1/3}\,M_\odot
$$

**转换为本 codebase 的 `m22` 惯例**（$m_{22} = m_a / 10^{-22}\,{\rm eV}$）：

$$
\frac{m_a}{2 \times 10^{-22}} = \frac{m_{22} \times 10^{-22}}{2 \times 10^{-22}} = \frac{m_{22}}{2}
$$

$$
\Rightarrow \left(\frac{m_a}{2 \times 10^{-22}}\right)^{-1} = \frac{2}{m_{22}}
$$

$$
\boxed{M_{\rm core}(M_h, m_{22}) = 6.2 \times 10^7\,m_{22}^{-1}\left(\frac{M_h}{10^9}\right)^{1/3}\,M_\odot}
$$

> **为什么 $M_{\rm core}$ 是 $M_h$ 的函数？** 孤子核心不是固定质量——更大的晕孕育更大的孤子。核心-晕关系的物理本质是：外 NFW 势阱的质量决定了中心孤子的特征尺度 $r_c$，进而决定了核心质量。Schive+14 发现这个关系的指数是 $1/3$，与量子流体的标度律一致。

#### 4.3 $M_{\rm sol}(m_{22})$：孤子-only 质量标度

**核心问题**：对于给定的轴子质量 $m_{22}$，多重的晕会使得其孤子核心质量等于晕总质量？

即求解 $M_{\rm core}(M_h, m_{22}) = M_h$：

$$
M_h = 6.2 \times 10^7\,m_{22}^{-1}\left(\frac{M_h}{10^9}\right)^{1/3}
$$

$$
\left(\frac{M_h}{10^9}\right)^{2/3} = \frac{0.062}{m_{22}}
$$

$$
\boxed{M_{\rm sol}(m_{22}) = 0.062^{3/2} \times 10^9\,m_{22}^{-3/2} = 1.54 \times 10^7\,m_{22}^{-3/2}\,M_\odot}
$$

其中 $0.062^{3/2} = 0.062 \times \sqrt{0.062} = 0.01544$。

#### 4.4 以 $M_{\rm sol}$ 为界面的三个区间

核心-晕关系 $M_{\rm core}(M_h) \propto M_h^{1/3}$ 在 $M_h$ 的整个范围内单调递增，但增长率 $(1/3)$ 小于 $1$。这意味着 $M_{\rm core}$ 随 $M_h$ 增长的速度**慢于**线性——只在 $M_h = M_{\rm sol}$ 这一个点处与 $M_h$ 相交。

以 $m_{22}=1$（$M_{\rm sol}=1.54\times 10^7 M_\odot$）为例，代入三个代表质量检验：

| $M_h$ [$M_\odot$]       |                              Schive+14 公式给出的$M_{\rm core}$ |                                     $M_{\rm core} / M_h$                                     | 实际物理结构 |                                            |
| :---------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------: | :-----------: | ------------------------------------------ |
|                                            $10^9$                                            |                                      $6.2 \times 10^7$                                      |     0.062     | 孤子仅占中心极小区域 — 公式**有效** |
|                               $1.54 \times 10^7 = M_{\rm sol}$                               |                                      $1.54 \times 10^7$                                      | **1.0** | 孤子刚好填满 — 公式恰好交于边界           |
|                                            $10^6$                                            | $6.2 \times 10^6$ | **6.2 > 1** | 纯孤子，$M_{\rm core} = M_h$ — 公式**失效** |              |                                            |

> **为什么 $M_h < M_{\rm sol}$ 的晕是存在的，而且 $M_{\rm core} = M_h$？**
>
> Schive+14 的 $M_{\rm core} \propto M_h^{1/3}$ 是在 **$M_h \gg M_{\rm sol}$**（即有 NFW 外包层）的模拟数据上拟合的。外推到 $M_h < M_{\rm sol}$ 得到 $M_{\rm core} > M_h$ 只是说明拟合公式在此处**不适用**—它拟合的对象（含 NFW 层的晕）在这个区间根本不存在。
>
> 在 $M_h < M_{\rm sol}$ 时，晕的**全部质量就是孤子本身**：$M_{\rm core} = M_h$，不存在 NFW 外包层。比 $M_{\rm sol}$ 更小的晕当然存在—它们是更小的纯孤子。$M_{\rm sol}$ **不是最小晕质量**，仅仅是孤子从"核心"变成"全部"的转折标度。

$M_{\rm sol}$ 定义的三个物理区间：

| 区间        | 条件                     | 晕结构                            | 中心气体密度     | 冷却能力         |
| ----------- | ------------------------ | --------------------------------- | ---------------- | ---------------- |
| I: NFW 主导 | $M_h \gg M_{\rm sol}$  | 孤子 ≪ NFW 层，尖点近似恢复      | 高，趋近 CDM     | 接近 CDM         |
| II: 过渡    | $M_h \sim M_{\rm sol}$ | 孤子延伸至维里半径量级            | 显著低于 CDM     | 开始下降         |
| III: 纯孤子 | $M_h < M_{\rm sol}$    | $M_{\rm core} = M_h$，无 NFW 层 | 量子压锁死，极低 | H₂ 冷却无法触发 |

$M_{\rm sol}$ 是区间 I ↔ II 的转折标度。在 II → III 的过程中，即使 Schive+14 公式不再给出合理的 $M_{\rm core}$ 值，物理图景仍是连续的：$M_h$ 越小 → 纯孤子 → $r_c$ 越小但 $\rho_c$ 越低 ($\rho_c \propto M_h^{4/3}$) → 中心气体密度持续降低 → 冷却效率单调衰减到零。

#### 4.5 对气体冷却的影响

冷却率 $\Lambda_{{\rm H}_2} \propto n_H^2 \propto \rho_{\rm gas}^2$ 对密度高度敏感。结合三个区间的气体密度：

$$
n_H(M_h) =
\begin{cases}
n_H^{\rm CDM}(M_h) & M_h \gg M_{\rm sol} \quad \text{(冷却 ≈ CDM)} \\
\text{区间 II: 渐变降低} & M_h \sim M_{\rm sol} \quad \text{(冷却效率下降)} \\
\leq n_H(soliton\;only) & M_h < M_{\rm sol} \quad \text{(H₂ 冷却无法触发)}
\end{cases}
$$

物理本质：**不是冷却物理本身变了，而是同一个 H₂ 化学作用在不同密度的气体上**。孤子平核将 $\rho_{\rm DM}$（进而 $\rho_{\rm gas}$）从一个随 $M_h$ 快速增长的函数（NFW 尖点）变为一个缓慢增加的函数（孤子平核 $\rho_c \propto M_h^{4/3}$ vs CDM $\propto M_h^{2.13}$）。冷却率 $\propto n_H^2$ 对密度平方依赖 → 密度下降一个因子 → 冷却率下降这个因子的平方 → 需要**更大的晕质量**才能维持相同的冷却效率。

---

### 5. 从密度剖面到 $m_{\rm crit}^{\rm FDM}$

#### 5.1 物理起点：同一判据，不同剖面

21cmFAST 中分子冷却的物理链条：

$$
\text{DM 密度剖面} \;\to\; n_H(r) \;\to\; {\rm H}_2\text{ 形成率} \;\to\; t_{\rm cool} < t_{\rm ff}
$$

FDM 仅改变**第一步**（§4.2：孤子平核取代 NFW 尖点）。后续 H₂ 化学与冷却函数不变。这意味着**同样的冷却物理判据应用于不同的 DM 密度剖面**——我们的任务就是跟踪这个差异如何传递到临界质量。

具体地，冷却判据 $t_{\rm cool} = t_{\rm ff}$（§5.2 将其量化为密度条件 $n_H = n_{\rm min}$）在 CDM 和 FDM 中是**同一个不等式**，唯一的变量是气体密度 $n_H$，而 $n_H$ 的不同又完全来自 DM 引力势阱的差异。因此直接写出：

- CDM：$n_H^{\rm CDM}(m_{\rm crit}^{\rm CDM}) = n_{\rm min}$
- FDM：$n_H^{\rm FDM}(m_{\rm crit}^{\rm FDM}) = n_{\rm min}$

定义密度抑制因子 $\eta$ 描述同一质量下 FDM 对 CDM 的 DM 密度比值（§5.2），则上述两个条件自然联立为一个隐式方程。

**关键点是：这里不预设 $m_{\rm crit}^{\rm FDM}$ 是什么形式的函数——既不是"乘性因子"也不是任何其他先验 ansatz。** 形式完全由隐式方程的物理约束决定。以下各节从剖面渐近行为出发逐步求解，最终得到一个显式近似。

#### 5.2 密度抑制因子 $\eta$

冷却的最简判定：冷却半径 $r_{\rm cool}$ 处气体密度达标。这一"最简判定"的直接物理依据是：

> **$t_{\rm cool} < t_{\rm ff}$ 判据 [3] 可以翻译为局部密度条件。** 冷却时标 $t_{\rm cool} = (3/2) n k_B T / \Lambda_{{\rm H}_2}$ [5]，自由落体时标 $t_{\rm ff} = \sqrt{3\pi/(32G\rho_{\rm tot})}$ [2]。H₂ 冷却率 $\Lambda_{{\rm H}_2} \propto n_H^2$ [5]，因此 $t_{\rm cool} \propto T/(n_H \Lambda_{{\rm H}_2}/n_H^2) \propto 1/n_H$。在 $T_{\rm vir} \sim 10^3$ K [2,3] 的 minihalo 中，$t_{\rm cool} < t_{\rm ff}$ 等价于 $n_H > n_{\rm min}$，其中 $n_{\rm min}$ 取决于气体温度和 H₂ 丰度。**这就是将冷却时标竞争简化为密度判据的物理基础。**

定义 $r_{\rm cool}$ 为晕中 $t_{\rm cool}(r) = t_{\rm ff}(r)$ 的临界半径 [3,7]——在 $r < r_{\rm cool}$ 内气体可以冷却。CDM 中该半径处的密度决定了临界质量：

$$
n_H^{\rm CDM}(M_h=m_{\rm crit}^{\rm CDM},\, r_{\rm cool}) = n_{\rm min}
$$

定义密度抑制因子：

$$
\eta(M_h, m_{22}) \equiv \frac{\rho_{\rm DM}^{\rm FDM}(r_{\rm cool})}{\rho_{\rm DM}^{\rm CDM}(r_{\rm cool})}
$$

$\eta \le 1$：孤子平核 [12] 不会使密度超过 CDM NFW 尖点 [1]。$\eta=1$ → 无 FDM 效应，$\eta \ll 1$ → 冷却区密度被严重压低。

#### 5.3 $\eta$ 的自然参数化——为什么必然是 $M_{\rm sol}$

$\eta$ 取决于孤子半径 $r_c$ 与冷却半径 $r_{\rm cool}$ 之比。这一论据的物理基础如下：

- 孤子剖面 $\rho_{\rm sol}(r)$ [12] (Eq. 2) 在 $r \ll r_c$ 近似平坦（$\rho \approx \rho_c$），$r \gg r_c$ 降至 NFW [1] 外包层
- $r_{\rm cool}$ 标记了晕中气体密度满足 $t_{\rm cool} < t_{\rm ff}$ [3] 的最大半径 [7]（亦见 §5.2）
- 因此 $\eta$ 只取决于局部剖面形态——即孤子是否"覆盖"了冷却区：
- $r_c \ll r_{\rm cool}$ → 孤子只影响极中心，$r_{\rm cool}$ 处的 DM 剖面仍为 NFW 尖点 [1] → $\eta \approx 1$
- $r_c \sim r_{\rm cool}$ → 孤子展平冷却区的 DM 密度 → $\eta < 1$

从 Schive+14 [12]（§4.1 Eqs. 3–4）：

$$
r_c \propto M_h^{-1/3}\,m_{22}^{-2}, \qquad r_{\rm cool} \sim 0.1\,r_{\rm vir} \propto M_h^{1/3}(1+z)^{-1}
$$

其中 $r_{\rm cool} \sim 0.1\,r_{\rm vir}$ 来自 $T_{\rm vir} \gtrsim T_{\rm cool}$ 时冷却时标与自由落体时标的竞争——冷却在晕中心最密处最有效，且 minihalo 中 H₂ 冷却区的典型半径约为 $0.05$–$0.15\,r_{\rm vir}$ [2,3]。$r_{\rm vir}$ 标度律为 $r_{\rm vir} \propto M_h^{1/3} (1+z)^{-1}$ [2]。

$$
\frac{r_c}{r_{\rm cool}} \propto M_h^{-2/3}\,m_{22}^{-2}\,(1+z)
$$

$r_c \sim r_{\rm cool}$ 发生在 $M_h \sim M_{\rm sol}(m_{22})$（即 $M_{\rm core}=M_h$ 处的质量，§4.3）。因此：

> **$M_{\rm sol}$ 是 $r_c/r_{\rm cool}$ 比通过 1 时的自然质量标度。这不是主观选择的"第二维度"——任何涉及 FDM 密度剖面对冷却影响的物理量，必须以 $x \equiv M_h/M_{\rm sol}$ 为自变量。这来自维量分析，没有建模自由度。**

$$
\eta(M_h, m_{22}) \equiv \eta\!\left(x \equiv \frac{M_h}{M_{\rm sol}}\right), \qquad \eta(0)=0,\; \eta(\infty)=1,\; \eta'(x) > 0
$$

#### 5.4 隐式方程

FDM 的冷却条件：

$$
n_H^{\rm FDM}(m_{\rm crit}^{\rm FDM}) = \eta\!\left(\frac{m_{\rm crit}^{\rm FDM}}{M_{\rm sol}}\right) \cdot n_H^{\rm CDM}(m_{\rm crit}^{\rm FDM}) = n_{\rm min}
$$

与 CDM 定义 $n_H^{\rm CDM}(m_{\rm crit}^{\rm CDM}) = n_{\rm min}$ 联立：

$$
\boxed{\eta\!\left(\frac{m_{\rm crit}^{\rm FDM}}{M_{\rm sol}}\right) \cdot\, n_H^{\rm CDM}(m_{\rm crit}^{\rm FDM}) = n_H^{\rm CDM}(m_{\rm crit}^{\rm CDM})} \tag{★}
$$

这是**隐式方程**——$\eta$ 依赖待求的 $m_{\rm crit}^{\rm FDM}$ 自身。

$n_H^{\rm CDM}(M_h)$ 取幂律近似 $n_H^{\rm CDM} \propto M_h^{\,\gamma}$。分子冷却域 minihalo 中 $\gamma \approx 0.05$–$0.15$（源于 NFW 集聚度 $c(M_h) \propto M_h^\beta$ [14]，高 $z$ minihalo 中 $\beta \approx -0.1$ [15]，且 $n_H \propto c^3$，因此 $\gamma \approx 3\beta \approx -0.3$ ——但反号是因为 $c$ 下降时气体仍被有效压缩；保守取 $|\gamma| \approx 0.05$–$0.15$）。

#### 5.5 $\eta(x)$ 的函数形式与隐式方程的分析

$\eta(x)$ 的精确形式需从孤子 [12] + NFW [1] 复合剖面在 $r_{\\rm cool}$ 处做数值积分获得。但渐近行为可直接从剖面极限推导：

- **$x \to 0$（纯孤子极限，$M_h \ll M_{\rm sol}$）：** 晕全部为孤子，$r_{\rm cool} \lesssim r_c$。此时 $\rho_{\rm DM}^{\rm FDM}(r_{\rm cool}) \approx \rho_c \propto M_h^{4/3}$ [12] (Eqs. 3–4)，而 $\rho_{\rm DM}^{\rm CDM}(r_{\rm cool})$ 由 NFW 尖点 [1] 决定。因 $\rho_c$ 的 $M_h$ 标度指数 ($4/3$) 低于 CDM 的等效标度指数 ($\sim 2.13$ [14])，$\eta \to 0$ 且行为为 $\propto x^p$ (其中 $p$ 为正数)
- **$x \to \infty$（NFW 主导极限）：** $r_c \ll r_{\rm cool}$，冷却区在 NFW [1] 外包层中，DM 剖面趋近 CDM → $\eta \to 1$

$$
\eta(x \to 0) \propto x^p \;\;(p>0), \qquad \eta(x \to \infty) \to 1
$$

**最简光滑参数化：** 需要一函数内插上述两条渐近线。满足 $\eta(0)=0$、$\eta(\infty)=1$、$\eta'(x)>0$ 且 $x \to 0$ 时 $\eta \propto x^p$ 的最低阶有理函数是 Hill 型函数 [21]：

$$
\eta_p(x) = \frac{x^p}{1+x^p}
$$

这是满足所有约束的、自由度最小的选择——任何更复杂的参数化都会引入额外的自由参数，在无直接剖面校准时无法约束。该类函数在宇宙学拟合中广泛使用：例如晕质量函数的 Sheth-Tormen 形式 [21]（$\nu^{a}/(1+\nu^{b})$ 型有理函数内插）、以及 Fialkov+12 [9] 的 $m_{\rm crit}^{\rm CDM}$ 幂律拟合本身，都体现了用最小参数数捕捉主导物理趋势的方法论。

代入 (★)：

$$
\frac{(m_{\rm crit}^{\rm FDM}/M_{\rm sol})^p}{1 + (m_{\rm crit}^{\rm FDM}/M_{\rm sol})^p} \cdot \left(\frac{m_{\rm crit}^{\rm FDM}}{m_{\rm crit}^{\rm CDM}}\right)^{\gamma} = 1 \tag{1}
$$

**CDM 极限**（$m_{\rm crit}^{\rm CDM} \gg M_{\rm sol}$）：$\eta \approx 1$，方程退化为 $(m_{\rm crit}^{\rm FDM}/m_{\rm crit}^{\rm CDM})^\gamma = 1$ → $m_{\rm crit}^{\rm FDM} \approx m_{\rm crit}^{\rm CDM}$ ✓

**FDM 极限**（$m_{\rm crit}^{\rm CDM} \ll M_{\rm sol}$）：此时 $m_{\rm crit}^{\rm FDM}/M_{\rm sol} \gg 1$ 也成立（因为 $m_{\rm crit}^{\rm FDM} \ge m_{\rm crit}^{\rm CDM}$），$\eta \to 1$——这说明在 FDM 极限下**在临界质量本身处孤子效应已经可以忽略**。方程 (1) 退化为：

$$
\left(\frac{m_{\rm crit}^{\rm FDM}}{m_{\rm crit}^{\rm CDM}}\right)^{\gamma} = 1 \;\Rightarrow\; \frac{m_{\rm crit}^{\rm FDM}}{m_{\rm crit}^{\rm CDM}} \approx 1
$$

**但是**——这个"FDM 极限"要求 $m_{\rm crit}^{\rm CDM} \gg M_{\rm sol}$，即孤子质量远小于冷却质量，FDM 效应本身就不强。真正有趣的参数空间是 $m_{\rm crit}^{\rm CDM} \lesssim M_{\rm sol}$（即孤子与冷却质量可比或更大），此时方程 (1) 的分母 $\approx (m_{\rm crit}^{\rm FDM}/M_{\rm sol})^p$（因该项 $\gg 1$），方程变为：

$$
1 \cdot \left(\frac{m_{\rm crit}^{\rm FDM}}{m_{\rm crit}^{\rm CDM}}\right)^{\gamma} \approx \left(\frac{m_{\rm crit}^{\rm FDM}}{M_{\rm sol}}\right)^{-p}
$$

解得：

$$
\frac{m_{\rm crit}^{\rm FDM}}{m_{\rm crit}^{\rm CDM}} \approx \left(\frac{M_{\rm sol}}{m_{\rm crit}^{\rm CDM}}\right)^{p/(p+\gamma)}
$$

当 $\gamma \ll p$（即化学标度远弱于剖面标度，符合 §5.4 中 $|\gamma| \approx 0.05$–$0.15$ 的估计）时，指数 $p/(p+\gamma) \to 1$，因此：

$$
\frac{m_{\rm crit}^{\rm FDM}}{m_{\rm crit}^{\rm CDM}} \to \frac{M_{\rm sol}}{m_{\rm crit}^{\rm CDM}}, \qquad m_{\rm crit}^{\rm FDM} \to M_{\rm sol}
$$

**物理含义**：无论化学条件多宽松（$z \to \infty$，$m_{\rm crit}^{\rm CDM} \to 0$），FDM 孤子结构将临界质量钳制在 $\sim M_{\rm sol}$——这是 **FDM 冷却的绝对下限**。

#### 5.6 隐式方程的显式近似

隐式方程 (1) 不利于代码实现。需要一个**显式近似** $m_{\rm crit}^{\rm FDM}(m_{\rm crit}^{\rm CDM}, M_{\rm sol})$，其形式不应是任意"内插"，而应从物理约束推导。

**步骤 1 — 列出所有可用的物理约束。** 这些约束不来自"简化"，而是方程 (1) 在不同极限下的精确行为：

|   #   | 极限                                                                                                                                                                | 物理条件                             | 行为                                                            |
| :---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
|  (i)  | $m_{\rm crit}^{\rm CDM} \gg M_{\rm sol}$                   | 高$z$ 大晕 / $m_{22}$ 大 | FDM 效应可忽略：$m_{\rm crit}^{\rm FDM} \to m_{\rm crit}^{\rm CDM}$ |                                      |                                                                 |
| (ii) | $m_{\rm crit}^{\rm CDM} \ll M_{\rm sol}$, $\gamma \ll p$ | 低$z$ 小晕 / $m_{22}$ 小 | 孤子钳制：$m_{\rm crit}^{\rm FDM} \to M_{\rm sol}$                  |                                      |                                                                 |
| (iii) | 对称性                                                                                                                                                              | 模型在$m_{22}$ 与 $z$ 互换下不变 | $m_{\rm crit}^{\rm FDM}(a, b) = m_{\rm crit}^{\rm FDM}(b, a)$ |

约束 (i)–(ii) 来自 §5.5 的渐近分析。约束 (iii) 是**物理对称性要求**：$m_{\rm crit}^{\rm CDM}(z)$ 与 $M_{\rm sol}(m_{22})$ 都只是临界质量的两个独立输入——交换二者不应改变结果（这正是 §5.1 的物理起点的直接推论：判据对 $z$ 通道和 $m_{22}$ 通道是对称的）。

**步骤 2 — 由 (iii) 推导函数形式。** 设 $x \equiv m_{\rm crit}^{\rm CDM}$、$y \equiv M_{\rm sol}$。约束 (iii) 要求显式函数 $f(x, y)$ 满足 $f(x, y) = f(y, x)$。$f$ 在两变量中是对称的，且在 $x \gg y$ 时 $\to x$、$x \ll y$ 时 $\to y$。

满足这三个约束的对称函数族——并且能从一个变量过渡到另一个——是**对称的二元中位数（symmetric mean）**类函数：

$$
f(x, y) = \big(x^k + y^k\big)^{1/k}, \qquad k > 0
$$

对 $k=1$ 是线性求和，$k=2$ 是二次范数（即 RMS），$k \to \infty$ 是逐元素取最大值。**这是从对称性约束导出的——不是任意选取"最简"形式**。其他满足对称性的候选（如 $\sqrt{xy}$）会在极限 (i)–(ii) 中失败（如 $\sqrt{xy}$ 在 $x \gg y$ 时给出 $\to \infty$ 而非 $x$）。

**步骤 3 — 用方程 (1) 的精确解确定 $k$。** §5.5 中方程 (1) 在 $\gamma \to 0$、$\eta(x) = x/(1+x)$（即 $p=1$ 的 Hill 函数，最简单的线性上升过渡）时存在闭式解。代入 (1)：

$$
\frac{m_{\rm crit}^{\rm FDM}/M_{\rm sol}}{1 + m_{\rm crit}^{\rm FDM}/M_{\rm sol}} \cdot 1 = 1 \;\Rightarrow\; \frac{u}{1+u} = 1 \text{（退化）}
$$

退化的原因：$\eta \to 1$（即 $m_{\rm crit}^{\rm FDM}/M_{\rm sol} \to \infty$），这对应 §5.5 末段讨论的 $m_{\rm crit}^{\rm CDM} \ll M_{\rm sol}$ 极限。真正的过渡发生在中间区（$m_{\rm crit}^{\rm CDM} \sim M_{\rm sol}$），此时方程 (1) 给出 $u = u_{\rm crit}$ 满足 $u_{\rm crit}/(1+u_{\rm crit}) = u_{\rm crit}^{-\gamma/p}$——无闭式解，但 $k$ 的标度可通过对中间区做匹配渐近分析得到。

**为避免陷入这种 1 阶参数化细节，我们采用更稳健的策略**：不声称 $k$ 能被精确推导，而是承认 $k$ 的值依赖 $\eta(x)$ 和 $\gamma$ 的具体细节，且这些本身未被校准（§5.9）。所以采用 $k=2$ 作为中心值——它在 §5.7–§5.8 将展示的物理极端之间取中间行为——并以 $k \in [1, \infty]$ 的范围作为系统误差包络。$k=2$ 不是"正确"值，而是"基于两个稳健渐近极限的最稳健选择"。

**$\gamma \to 0$ 近似的误差量化：** §5.4 估计了 $|\gamma| \approx 0.05$–$0.15$。在 $m_{\rm crit}^{\rm CDM} \ll M_{\rm sol}$ 极限，$\gamma=0$ 近似带来的 FDM 极限误差因子约为：

$$
\left(\frac{M_{\rm sol}}{m_{\rm crit}^{\rm CDM}}\right)^{\gamma/(p+\gamma)}
$$

取 $m_{22}=0.5,\;z=20$（$R=126$），$p=1$（最简 Hill 函数），$\gamma=0.1$（中位估计）：低估 $\approx 126^{0.1/1.1} \approx 126^{0.09} \approx 1.6\times$。这是本模型当前最大的数值不确定性来源。

**自我审查的诚实结论：** 即便从对称性约束推出的 $L_k$ 形式，$k=2$ 的具体取值仍然依赖 $p$ 和 $\gamma$ 的未校准细节。**这一节实际上无法从物理推出 $k$ 的精确值**——只能推出"$L_k$ 形式是唯一满足对称性的候选族"。$k$ 必须由数值模拟（§10.4 的 ENZO/AxiREPO）校准。在缺乏校准前，$k=2$ 是中心值，$k \in [1, \infty]$ 是物理允许的范围（§5.8）。

#### 5.7 这为什么是近似而非精确解

上述显式近似依赖 $\gamma \to 0$ 和特定 $\eta(x)$ 形状的假设。更一般地，方程 (1) 的解可写为：

$$
m_{\rm crit}^{\rm FDM} = \left[(m_{\rm crit}^{\rm CDM})^k + M_{\rm sol}^k\right]^{1/k}
$$

其中 $k$ 由 $\eta(x)$ 的剖面形状和 $\gamma$ 决定。两个特例：

| 近似                                                                                  |                       $k$                       | 对应物理假设               |
| ------------------------------------------------------------------------------------- | :------------------------------------------------: | -------------------------- |
| $n_H^{\rm CDM}$ 不随 $M_h$ 变化 ($\gamma=0$)、$\eta(x)$ 在 $x=1$ 处陡峭过渡 | $\infty$  | 冷却阈值严格在$M_{\rm sol}$ 处截断 |                            |
| $n_H^{\rm CDM} \propto M_h$ ($\gamma=1$)、$\eta(x)$ 线性                        |                         1                         | 化学和结构串联作用（过估） |
| 中间情况 ($\gamma \approx 0.05$–$0.15$, $\eta$ 平滑)                           |                   $\approx 2$                   | **中心值**           |

$k=2$ 是我们当前的最佳估计，不是从公理推导的精确值。$k \in [1, \infty]$ 定义了物理允许的范围。

#### 5.8 $k$ 的不确定性与操作建议

|                    $k$                    | 物理含义                                     | 使用场景           |
| :------------------------------------------: | -------------------------------------------- | ------------------ |
|                      2                      | 中心值 — 剖面推导的最佳估计                 | **推荐默认** |
| 1 ($m_{\rm crit}^{\rm CDM} + M_{\rm sol}$) | FDM 效应上界 — 假设两个效应完全独立（过估） | 保守 FDM 排除      |
|            $\infty$ ($\max$)            | FDM 效应下界 — 假设较强者完全主导（欠估）   | 保守 FDM 允许      |

实际操作：以 $k=2$ 为核心预测，以 $k=1$ 和 $k=\infty$ 为系统误差包络。

#### 5.9 为什么不直接从剖面数值计算 $\eta(x)$

理论上可对孤子+NFW 复合剖面做积分计算 $\eta(x)$，然后数值解方程 (1)。但这面临：

| 障碍                                  | 说明                                             |
| ------------------------------------- | ------------------------------------------------ |
| Schive+14 剖面在$z>0$ 未校准        | $r_c$, $\rho_c$ 的红移依赖可能非平凡         |
| $r_{\rm cool}$ 本身是冷却物理的结果 | 需 1D/3D hydro 自洽确定                          |
| FDM 的$c(M)$ 未知                   | NFW 外包层在 FDM 中的集聚度-质量关系可能偏离 CDM |

在这些输入不确定的情况下，数值求解 $\eta(x)$ 所获得的"精度"是虚假的。$k \in [1, \infty]$ 的包络化处理更坦白。

#### 5.10 关于 $m_{\rm crit}^{\rm CDM}$ 的 CDM/NFW 依赖

$m_{\rm crit}^{\rm CDM} = 3.314 \times 10^7 (1+z)^{-1.5} M_\odot$ 的校准来自 Fialkov+12 [9] → Stacy+11 [7] / Greif+11 [8] 的 CDM 3D 模拟，隐式编码了 NFW [1] 尖点密度。严格来说 FDM 中化学阈值应重新校准。但在 $M_h \lesssim M_{\rm sol}$ 时 $M_{\rm sol}$ 主导，且 $(1+z)^{-1.5}$ 标度律是 profile-independent 的（来自 $T_{\rm vir}$ [2]），故此近似合理（亦见 §10.6）。

#### 5.11 渐近行为验证

| 极限                  | 行为                                                                                             | 物理诠释        |
| --------------------- | ------------------------------------------------------------------------------------------------ | --------------- |
| $m_{22} \to \infty$ | $M_{\rm sol} \to 0$，$m_{\rm crit}^{\rm FDM} \to m_{\rm crit}^{\rm CDM}$                     | 回归 CDM ✓     |
| $m_{22} \to 0$      | $M_{\rm sol} \to \infty$，$m_{\rm crit}^{\rm FDM} \approx M_{\rm sol} \propto m_{22}^{-3/2}$ | 孤子支配 ✓     |
| $z \to \infty$      | $m_{\rm crit}^{\rm CDM} \to 0$，$m_{\rm crit}^{\rm FDM} \to M_{\rm sol}$                     | FDM 效应最强 ✓ |
| $z \to 0$           | $m_{\rm crit}^{\rm CDM}$ 增长，$m_{\rm crit}^{\rm FDM} \to m_{\rm crit}^{\rm CDM}$           | FDM 效应减弱 ✓ |

#### 5.12 最终公式

$$
\boxed{m_{\rm crit}^{\rm FDM}(m_{22}, z) = \sqrt{\big[m_{\rm crit}^{\rm CDM}(z)\big]^2 + M_{\rm sol}^2(m_{22})}}
$$

其中：

- $m_{\rm crit}^{\rm CDM}(z) = 3.314 \times 10^7\,(1+z)^{-1.5}\,M_\odot$（Fialkov+12 [9]，Visbal+15 [10] 校准）
- $M_{\rm sol}(m_{22}) = 1.54 \times 10^7\,m_{22}^{-3/2}\,M_\odot$（§4.3，从 Schive+14 [12] 核心-晕关系 Eq. 5 导出）
- **使用 $k=1$ 和 $k=\infty$ 作为系统误差包络**（§5.8）

---

### 6. 数值结果

#### 6.1 $M_{\rm sol}$ 与相对 CDM 的比值

| $m_{22}$ |      $m_a$ [eV]      | $M_{\rm sol}$ [$M_\odot$] | $M_{\rm hm}$ [$M_\odot$] | $R(z{=}10)$ | $R(z{=}20)$ | $R(z{=}30)$ |
| :--------: | :--------------------: | :---------------------------: | :--------------------------: | :-----------: | :-----------: | :-----------: |
|    0.1    | $1.0\times 10^{-23}$ |      $4.87\times 10^8$      |    $3.45\times 10^{11}$    |      536      |     1414     |     2536     |
|    0.2    | $2.0\times 10^{-23}$ |      $1.72\times 10^8$      |    $1.37\times 10^{11}$    |      190      |      500      |      897      |
|    0.5    | $5.0\times 10^{-23}$ |      $4.36\times 10^7$      |    $4.03\times 10^{10}$    |      48      |      126      |      227      |
|    1.0    | $1.0\times 10^{-22}$ |      $1.54\times 10^7$      |    $1.60\times 10^{10}$    |      17      |      45      |      80      |
|    2.0    | $2.0\times 10^{-22}$ |      $5.44\times 10^6$      |     $6.35\times 10^9$     |      6.1      |      16      |      28      |
|    5.0    | $5.0\times 10^{-22}$ |      $1.38\times 10^6$      |     $1.87\times 10^9$     |      1.8      |      4.1      |      7.2      |
|    10.0    | $1.0\times 10^{-21}$ |      $4.87\times 10^5$      |     $7.43\times 10^8$     |      1.1      |      1.7      |      2.7      |
|    50.0    | $5.0\times 10^{-21}$ |      $4.36\times 10^4$      |     $8.69\times 10^7$     |     1.00     |     1.01     |     1.03     |
|    100    | $1.0\times 10^{-20}$ |      $1.54\times 10^4$      |     $3.45\times 10^7$     |     1.00     |     1.00     |     1.00     |

> $R = m_{\rm crit}^{\rm FDM} / m_{\rm crit}^{\rm CDM}$。$M_{\rm hm}$ 为 HMF 截断尺度 [13]（Schive+16 Eq. 7: $M_{\rm hm} = 1.6 \times 10^{10} m_{22}^{-4/3} M_\odot$，已在 `fdm.c` 实现）。
> 关键观察：**$M_{\rm sol} \ll M_{\rm hm}$**（例如 $m_{22}=1$：$1.5 \times 10^7 \ll 1.6 \times 10^{10}$），意味着冷却抑制远早于 HMF 截断生效。

#### 6.2 $m_{\rm crit}^{\rm FDM}(m_{22}, z)$ 绝对值

| $z$ |         CDM         |  $m_{22}{=}0.5$  |  $m_{22}{=}1.0$  |  $m_{22}{=}2.0$  |  $m_{22}{=}5.0$  |  $m_{22}{=}10.0$  |
| :---: | :-----------------: | :-----------------: | :-----------------: | :-----------------: | :-----------------: | :-----------------: |
|   5   | $2.26\times 10^6$ | $4.36\times 10^7$ | $1.56\times 10^7$ | $5.89\times 10^6$ | $2.64\times 10^6$ | $2.31\times 10^6$ |
|  10  | $9.08\times 10^5$ | $4.36\times 10^7$ | $1.54\times 10^7$ | $5.52\times 10^6$ | $1.65\times 10^6$ | $1.03\times 10^6$ |
|  20  | $3.44\times 10^5$ | $4.36\times 10^7$ | $1.54\times 10^7$ | $5.46\times 10^6$ | $1.42\times 10^6$ | $5.96\times 10^5$ |
|  30  | $1.92\times 10^5$ | $4.36\times 10^7$ | $1.54\times 10^7$ | $5.45\times 10^6$ | $1.39\times 10^6$ | $5.24\times 10^5$ |
|  40  | $1.26\times 10^5$ | $4.36\times 10^7$ | $1.54\times 10^7$ | $5.45\times 10^6$ | $1.38\times 10^6$ | $5.03\times 10^5$ |

> 当 $m_{22} \lesssim 1$ 且 $z \gtrsim 10$ 时，$m_{\rm crit}^{\rm FDM}$ 实际上**与 $z$ 无关**——$M_{\rm sol}$ 主导，完全压制了 $m_{\rm crit}^{\rm CDM}$ 的红移演化。

#### 6.3 对 `exp(-Mturn/M)` 截断的定量影响（$z=10$）

| $M_h$ [$M_\odot$] |  CDM  | $m_{22}{=}0.5$ | $m_{22}{=}1.0$ | $m_{22}{=}2.0$ | $m_{22}{=}5.0$ | $m_{22}{=}10.0$ |
| :-------------------: | :----: | :--------------: | :--------------: | :--------------: | :--------------: | :---------------: |
|   $1 \times 10^5$   | 0.0001 |      0.0000      |      0.0000      |      0.0000      |      0.0000      |      0.0000      |
|   $3 \times 10^5$   | 0.048 |      0.0000      |      0.0000      |      0.0000      |      0.004      |       0.032       |
|   $1 \times 10^6$   | 0.403 |      0.0000      |      0.0000      |      0.004      |      0.192      |       0.357       |
|   $3 \times 10^6$   | 0.739 |      0.0000      |      0.006      |      0.159      |      0.577      |       0.709       |
|   $1 \times 10^7$   | 0.913 |      0.013      |      0.214      |      0.576      |      0.848      |       0.902       |
|   $3 \times 10^7$   | 0.970 |      0.234      |      0.598      |      0.832      |      0.947      |       0.966       |
|   $1 \times 10^8$   | 0.991 |      0.647      |      0.857      |      0.946      |      0.984      |       0.990       |

> 值 = $\exp(-m_{\rm crit}/M_h)$：1 = 完全恒星形成，0 = 完全抑制。

**$m_{22}=1$ 在分子冷却域的效应**：$M_h = 10^6 M_\odot$ 处将效率从 40% 压至 $< 10^{-4}$——基本抹平。即使 $M_h = 10^7 M_\odot$，效率也从 91% 降至 21%。这种量级的抑制远超 HMF 截断在此质量处的效应。

#### 6.4 关键数值示例的物理诠释

以 $z=10$，$m_{22}=1$ 为例：

$$
\begin{aligned}
m_{\rm crit}^{\rm CDM} &= 3.314 \times 10^7 \cdot 11^{-1.5} = 8.97 \times 10^5\,M_\odot \\[4pt]
M_{\rm sol} &= 1.54 \times 10^7 \cdot 1^{-1.5} = 1.54 \times 10^7\,M_\odot \\[4pt]
m_{\rm crit}^{\rm FDM} &= \sqrt{(8.97\times 10^5)^2 + (1.54\times 10^7)^2} = 1.54 \times 10^7\,M_\odot
\end{aligned}
$$

对一个 $M_h = 1.54 \times 10^7 M_\odot$ 的晕：

- CDM：$\exp(-0.90/15.4) \approx 0.943$ → 94% 效率
- FDM：$\exp(-15.4/15.4) \approx 0.368$ → 仅 37% 效率

效率压缩 $\sim 2.6\times$。**根本原因不是冷却物理不同**，而是同一个冷却物理作用在**不同的 DM 密度场**上——孤子平核的系统性低密度使冷却效率下降。

---

### 7. `thermochem.c` 实现

#### 7.1 代码修改

在 `lyman_werner_threshold()` 中将：

```c
double mcrit_noLW = 3.314e7 * pow(1. + z, -1.5);
```

替换为：

```c
double mcrit_noLW = 3.314e7 * pow(1. + z, -1.5);
if (cosmo_params_global->m22 > 0) {
    double M_sol = 1.54e7 * pow(cosmo_params_global->m22, -1.5);
    mcrit_noLW = sqrt(mcrit_noLW * mcrit_noLW + M_sol * M_sol);
}
```

#### 7.2 设计要点

| 要点             | 说明                                           |
| ---------------- | ---------------------------------------------- |
| 仅 3 行新增      | 最小侵入性                                     |
| `m22 > 0` 守卫 | CDM 模式（`m22=0`）完全不受影响              |
| 复用已有参数     | `cosmo_params_global->m22` 与 `fdm.c` 一致 |
| 无新 header      | `sqrt()` 在 `math.h` 中，已包含            |
| 可选`f_wave`   | 见 §9.2，建议默认 1.0（保守）                 |

---

### 8. 与已有 FDM 基础设施的关系

#### 8.1 两个互补通道

`fdm.c` 已实现两个 FDM 效应：

| 通道                 | 物理                     | 实现                                           | 特征尺度                                                        |
| -------------------- | ------------------------ | ---------------------------------------------- | --------------------------------------------------------------- |
| **结构形成**   | 功率谱截断 → 晕数量减少 | $T_F(k)$ [13] + `dndm_FDM(M)` [13]         | $M_{\rm hm} = 1.6\times 10^{10}\,m_{22}^{-4/3}\,M_\odot$ [13] |
| **晕内部物理** | 孤子平核 → 冷却效率降低 | $m_{\rm crit}^{\rm FDM}(m_{22},z)$（本方案） | $M_{\rm sol} = 1.54\times 10^7\,m_{22}^{-3/2}\,M_\odot$ [12]  |

由于 $M_{\rm sol} \ll M_{\rm hm}$（例如 $m_{22}=1$：$1.5\times 10^7 \ll 1.6\times 10^{10}$），**冷却抑制远早于 HMF 截断起作用**——在 HMF 还几乎没有抑制的质量范围内，孤子平核已经在压低恒星形成。换言之，**冷却抑制是 FDM 影响小质量恒星形成率的主导通道**。

#### 8.2 与 `dndm_FDM` 的独立性

`dndm_FDM(M)` [13] 控制晕的**数量**（halo abundance），$m_{\rm crit}^{\rm FDM}$ 控制晕的**效率**（star formation efficiency）。两者物理独立，通过不同代码路径消费：

```
fdm.c: dndm_FDM(M)        → hmf.c: 乘到无条件 HMF 上 → 影响 f_coll 积分
本方案: mcrit_FDM(m22,z)  → thermochem.c: 替换 mcrit_noLW → 影响 nion_fraction_mini
```

---

### 9. 与 Tocher+2026 的关系

#### 9.1 互补而非重叠

Tocher+2026 [17] 模拟的晕质量范围（$3\times 10^8$–$8\times 10^9 M_\odot$，原子冷却域）远大于 $M_{\rm sol}$（$10^6$–$10^7 M_\odot$）。其观测到的抑制主要来自**波动力学涨落**（Schrödinger-Poisson 含时演化产生的随机角动量注入），而非孤子平核的几何效应。

|                  | 本方案                                 | Tocher+2026                                            |
| ---------------- | -------------------------------------- | ------------------------------------------------------ |
| 捕获的物理       | 孤子几何（平核 → 中心密度降低）       | 波动力学 + 孤子几何                                    |
| 等价于 Tocher 的 | "Frozen" 模式                          | "Dyn" 模式（完整）                                     |
| 质量域           | $10^5$–$10^8 M_\odot$（分子冷却） | $3\times 10^8$–$8\times 10^9 M_\odot$（原子冷却） |
| 与本方案的关系   | —                                     | 提供波动力学校准锚点                                   |

Tocher 所有晕的质量均满足 $M_h \gg M_{\rm sol}$（$M_{\rm sol}/M_h \sim 0.001$–$0.01$），因此其 $M_{\rm sol}$ 几何效应可以忽略——这确认了 Tocher 观测到的抑制**全部来自波动力学**。

#### 9.2 波动力学修正因子 $f_{\rm wave}$

本方案不含波动力学效应。可保守地引入 $f_{\rm wave} \ge 1$ 作为预留接口（其物理动机来自 Tocher+2026 [17] 中 "Dyn" vs "Frozen" 模式的比较）：

$$
m_{\rm crit}^{\rm FDM} = \sqrt{(m_{\rm crit}^{\rm CDM})^2 + (f_{\rm wave} \cdot M_{\rm sol})^2}
$$

| $m_{22}$ | $f_{\rm wave}$ | $m_{\rm crit}(z{=}10)$ |   vs 无修正   | 说明                       |
| :--------: | :--------------: | :----------------------: | :-----------: | -------------------------- |
|    0.5    |       4.0       |   $1.74\times 10^8$   | $4.0\times$ | 极轻轴子，波动力学完全主导 |
|    1.0    |       3.0       |   $4.62\times 10^7$   | $3.0\times$ | 波动力学主导               |
|    2.0    |       2.0       |   $1.09\times 10^7$   | $2.0\times$ | 波动力学显著               |
|    5.0    |       1.3       |   $2.01\times 10^6$   |    1.22×    | 波动力学次要               |
|    ≥10    |       1.0       |           不变           |     1.0×     | 重轴子，波动力学可忽略     |

> 建议默认 $f_{\rm wave}=1$（保守）。上表为基于 Tocher+2026 数据的外推估计，待其正式拟合公式发布后更新。

---

### 10. 验证策略与认知地位

#### 10.1 核心困境

本方案预测：FDM 孤子平核通过压低中心气体密度，将分子冷却的最小晕质量从 $\sim 10^6 M_\odot$ 提升到 $\sim 10^7 M_\odot$（$m_{22}=1$）。这是一个**定量的、可检验的物理预测**。

但直接检验面临一个根本困境：

> **不存在**能够分辨 $10^5$–$10^7 M_\odot$ 量级 FDM 晕中气体冷却过程的 3D 数值模拟。这需要同时解析：(i) Schrödinger-Poisson 方程的孤子解（空间分辨率 $\sim \lambda_{\rm dB} \sim 100$ pc），(ii) 非平衡 H₂ 化学网络，(iii) 辐射冷却和 LW 反馈——在一个跨越 $10^5$–$10^9 M_\odot$ 的模拟体积中追踪单个晕的形成和塌缩。当前技术条件下这是不可行的。

因此，我们的方法是必要的，但也是**缺乏直接数值校准的**。本节正视这个问题：在这种条件下，什么构成"验证"？

#### 10.2 验证证据的层级

验证证据按说服力从弱到强排列：

| 层级 | 类型                                                                                                                                                                                                                                                                   |               当前状态               | 能证明什么                                                       |
| :--: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------------------------------: | ---------------------------------------------------------------- |
|  L0  | **自洽性检验** — 极限退化、单调性、标度律                                                                                                                                                                                                                       |          ✅ 已完成 (§5.11)          | 模型在数学上不自相矛盾                                           |
|  L1  | **物理约束论证** — 剖面推导：$\eta(x)$ → 隐式方程 → $\sqrt{a^2+b^2}$ 近似 |        ✅ 已完成 (§5.1–5.7)        | 给定$\eta(x)$ 和 $n_H^{\rm CDM}$ 的物理假设下形式是自然的——但 $\eta(x)$ 的形状和 $\gamma$ 的精确值来自有限且部分不确定的输入 |                                      |                                                                  |
|  L2  | **1D 半解析基准** — 球对称 hydro + soliton 势                                                                                                                                                                                                                   |     ⬜ 未完成 (附录 B 描述了路径)     | 与 3D 模拟同构的简化版物理——可检验$k=2$ 是否在简化情形下成立 |
|  L3  | **间接模拟约束** — Tocher+2026 在更高质量处的数据                                                                                                                                                                                                               | ⬜ 部分 —$f_{\rm wave}$ 因子 (§9) | 约束相关物理（波动力学），提供校准锚点                           |
|  L4  | **直接数值检验** — 3D FDM hydro + 化学模拟                                                                                                                                                                                                                      |             ❌ 当前不可行             | 黄金标准：直接验证$m_{\rm crit}^{\rm FDM}(m_{22},z)$           |
|  L5  | **宇宙学可观测量** — 21cm 全局信号、UVLF、高-$z$ SFRD                                                                                                                                                                                                         |               ❌ 未完成               | 终极检验：模型对可观测量的预测与数据对比                         |

**没有任何单一层级可以"证明"模型正确。** 验证是累积性的：L0–L2 告诉我们模型物理自洽，L3–L4 告诉我们定量正确，L5 告诉我们宇宙学相关。当前我们仅完成 L0–L1。

#### 10.3 可以立即做的：L2 半解析基准

**方法**：1D 球对称 Lagrangian/任意 Lagrangian-Eulerian (ALE) hydro 求解器（参照 SM13 [16] Paper I 的方法论），将 DM 势替换为：

$$
\Phi(r) = \Phi_{\rm soliton}(r) \cdot \mathbb{1}[r < r_t] + \Phi_{\rm NFW}(r) \cdot \mathbb{1}[r \ge r_t]
$$

其中 $r_t$ 为孤子与 NFW 外包层的过渡半径（由 Schive+14 密度剖面确定）。在 $(M_h, z, m_{22})$ 参数空间扫描，对每个点运行：

1. 初始化：气体在维里温度、均匀密度
2. 追踪气体向 DM 势阱中心下落
3. 计算 H₂ 形成（含 LW 自屏蔽）
4. 评估 $t_{\rm cool} < t_{\rm ff}$ 条件

得到每个 $(M_h, z, m_{22})$ 的布尔值「冷却/不冷却」→ 拟合 $m_{\rm crit}(z, m_{22})$。

**这能验证什么？**

- 如果 1D 结果给出的 $m_{\rm crit}^{\rm FDM}(m_{22},z)$ 接近 $\sqrt{(m_{\rm crit}^{\rm CDM})^2 + M_{\rm sol}^2}$，则 $k=2$ 近似得到**非平凡的半解析支撑**
- 如果 1D 结果给出的 $m_{\rm crit}^{\rm FDM}$ 更接近 $m_{\rm crit}^{\rm CDM} + M_{\rm sol}$（$k=1$）或其他形式，则说明 §5.4–5.5 的 $\eta(x)$ 形状或 $\gamma \approx 0$ 近似需要修正

**1D 方法的局限**：球对称假设丢失了角动量注入、各向异性吸积和 3D 湍流——这些在 FDM 中比 CDM 中更重要（波动力学涨落会产生随机角动量）。但作为 L2 级别的检验，它比纯解析论证强得多。

#### 10.4 未来需要的：L4 直接数值检验

真正的验证需要专门设计的 FDM 数值模拟：

| 需求       | 说明                                                         |
| ---------- | ------------------------------------------------------------ |
| DM 求解器  | Schrödinger-Poisson（如 AxiREPO [18]、ENZO+FDMSolver [19]） |
| 气体求解器 | 3D AMR hydro + 非平衡 H₂ 化学 [4,6] + LW 辐射转移 [10,11]   |
| 质量范围   | $10^5$–$10^8 M_\odot$（分子冷却域）                     |
| 红移范围   | $z = 10$–$30$                                           |
| 最小分辨率 | $\sim 10$ pc（分辨孤子核心 [12]）                          |
| 模拟体积   | $\sim 1$ cMpc$^3$（足够的晕统计）                        |

这类模拟在当前计算资源下极具挑战性，但并非不可能——特别是针对少数选定的 $(m_{22}, z)$ 点进行 zoom-in 模拟。

#### 10.5 当前模型的认知地位（坦承）

| 方面                                                                                    | 地位                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| $M_{\rm sol}$ 是 FDM 晕的特征尺度                                                     | **可靠** — Schive+14 [12] N-body 模拟直接测量                                                                                                  |
| $M_{\rm sol}$ 增大冷却阈值                                                            | **物理上可信** — 孤子平核压低中心密度是 robust 的几何效应                                                                                      |
| 具体形式$m_{\rm crit}^{\rm FDM} = \sqrt{a^2+b^2}$                                     | **剖面推导的近似解** — 来自 §5.4–5.6 的隐式方程分析，非公理推导。近似依赖于 $\eta(x)$ 形状和 $n_H^{\rm CDM} \propto M_h^\gamma$ 幂律假设 |
| 定量值（例如$m_{22}=1$ 时 $m_{\rm crit}^{\rm FDM} \approx 1.5\times 10^7 M_\odot$） | **量级正确性高、因子 $\sim 2$–$3$ 不确定性**（来自 Schive+14 [12] 的 $\sim 2\times$ 散布、高 $z$ 演化的未知、波动力学效应 [17]）       |

#### 10.6 具体的不确定性来源

| 来源                                                                                                                                                                                                   |                                        定量影响                                        | 缓解方向                                      | 优先级 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------: | --------------------------------------------- | :----: |
| 不含波动力学涨落 [17]                                                                                                                                                                                  |                        低估抑制$\sim 10$–$80\%$（轻轴子端）                        | $f_{\rm wave}$ 因子，待 Tocher+26 [17] 拟合 |   高   |
| Schive+14 [12] 关系有$\sim 2\times$ 散布                                                                                                                                                             |                        $M_{\rm sol}$ 可能偏移 $\sim 3\times$                        | 来自多个模拟组的交叉校准                      |   高   |
| 孤子-晕关系的红移演化                                                                                                                                                                                  | Schive+14 [12] 在$z \sim 0$ 校准，高 $z$ 行为不确定 | 需$z>10$ 的 FDM N-body 模拟 | 中                                            |        |
| 仅孤子几何 [12]，无纤维吸积/角动量/碎裂                                                                                                                                                                |                                  方向不明（竞争效应）                                  | 1D hydro [16]（附录 B）→ 3D hydro (L4)       |   中   |
| $f_{\rm wave}$ 为外推                                                                                                                                 |            表中值可能$\sim 2\times$ 不准确 |                               待 Tocher+26 [17] 正式发表                               | 高                                            |        |
| $m_{\rm crit}^{\rm CDM}$ 的 CDM/NFW [1] 依赖 | §5.10 讨论的隐式 NFW 假设 | FDM 化学阈值重新校准（需 L4 模拟） | 低（$M_{\rm sol}$ 主导区间影响小）                                                |                                                                                        |                                               |        |

#### 10.7 底线

本模型是一个**物理动机充分、剖面推导自洽**的 ansatz，其渐近行为正确（CDM 极限和 FDM 极限均自动满足）。但它尚未经过直接数值模拟的定量验证——在当前技术水平下这是不可能完成的。因此，在使用该模型时，应：

1. **将 $m_{\rm crit}^{\rm FDM}$ 的量级（$10^6$–$10^9 M_\odot$）视为物理上可靠的**——孤子平核 [12] 压低中心密度的方向是明确的
2. **将精确数值视为有 $\mathcal{O}(2$–$3)$ 因子不确定性**——在定量预测中报告该范围
3. **将 $k=2$ 的选择视为 $\pm 1$ 的指数不确定性**——在敏感性分析中测试 $k=1$ 和 $k=\infty$ 作为上下包络（§5.8）
4. **将本模型视为可被未来模拟检验的可证伪预测**——而非已确立的物理事实

---

### 11. 参考文献

> **注**：第三列标注的"见本文 §X.Y"是本文档内部的节号交叉引用，**不是**对应论文的节号。

| 编号 | 论文                                                                                             | 论文贡献与本文讨论处                                                                                                                                                                   |
| :--: | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [1] | **Navarro, Frenk & White 1996** (ApJ 462, 563); **1997** (ApJ 490, 493)              | NFW 密度剖面 — CDM 晕结构基准。见本文 §3.4, §4.1, §5.2–5.3                                                                                                                        |
| [2] | **Barkana & Loeb 2001** (Phys. Rep. 349, 125)                                              | 第一代恒星形成综述 —$T_{\rm vir}$ 定义、$r_{\rm vir}$ 标度律、分子冷却物理框架。见本文 §3.1, §5.3                                                                               |
| [3] | **Tegmark+97** (ApJ 474, 1)                                                                | 暗物质晕中分子冷却的首次系统分析 — 建立了$t_{\rm cool} < t_{\rm ff}$ 冷却判据以及 H₂ 形成 vs Hubble 膨胀的竞争条件。见本文 §3.2                                                   |
| [4] | **Abel, Anninos, Zhang & Norman 1997** (NewA 2, 181)                                       | 原初气体非平衡 H₂ 化学网络 —${\rm H}^- \to {\rm H}_2$ 气相形成通道的速率系数。见本文 §3.2                                                                                         |
| [5] | **Galli & Palla 1998** (A&A 335, 403)                                                      | H₂ 转动-振动冷却函数$L_{\rm LTE}$ 的分析近似形式。见本文 §3.1–3.2, §A.1                                                                                                          |
| [6] | **Glover 2015** (MNRAS 451, 1582)                                                          | H₂ 冷却率的现代拟合 — 本文 §3.2 中$k_{{\rm H}^-}$ 速率系数的现代校准值                                                                                                            |
| [7] | **Stacy, Greif & Bromm 2011** (MNRAS 414, 1860)                                            | CDM 3D AMR 原初气体模拟 —$m_{\rm crit}^{\rm CDM}$ 校准的基础数据。见本文 §3.3, §5.10                                                                                              |
| [8] | **Greif+11** (MNRAS 413, 289)                                                              | 同上 — CDM 分子冷却阈值的 3D 模拟校准。见本文 §3.3, §5.10                                                                                                                           |
| [9] | **Fialkov+12** (MNRAS 424, 1335)                                                           | $m_{\rm crit}^{\rm CDM} = 3.314\times 10^7 (1+z)^{-1.5} M_\odot$ — 基于 Stacy+11 & Greif+11 的 CDM 分子冷却阈值拟合公式。见本文 §3.3, §5.10–5.12                                 |
| [10] | **Visbal, Haiman & Bryan 2015** (MNRAS 453, 4456)                                          | LW 反馈参数化 —$f_{\rm LW}$ 因子在 `thermochem.c` 中的实现。见本文 §2.2, §5.10                                                                                                  |
| [11] | **Schauer+21** (MNRAS 507, 1775)                                                           | LW 反馈最新拟合 —$f_{\rm LW}$ 系数更新。见本文 §2.2                                                                                                                                |
| [12] | **Schive, Chiueh & Broadhurst 2014** (Nature Phys. 10, 496)                                | FDM 孤子核心-晕质量关系 —$\rho_{\rm soliton}(r)$ 剖面 (Eq. 2)、$\rho_c$ 与 $r_c$ 的标度律 (Eq. 3–4)、$M_{\rm core} \propto M_h^{1/3}$ 核心-晕关系 (Eq. 5)。见本文 §4.1–4.3 |
| [13] | **Schive+16** (PRL 116, 201302)                                                            | FDM HMF 截断 —$M_{\rm hm} = 1.6\times 10^{10} m_{22}^{-4/3} M_\odot$，`dndm_FDM` 的物理基础。见本文 §6.1, §8.1                                                                  |
| [14] | **Bullock+01** (MNRAS 321, 559)                                                            | CDM 浓度-质量关系$c(M) \propto M^{-\beta}$ — 本文 §5.4 中 $\beta \approx -0.1$ 和 $\gamma$ 估计的出发点                                                                        |
| [15] | **Angel+16** (MNRAS 460, 1250)                                                             | 高红移 minihalo 浓度-质量关系 — 本文 §5.4 中$\gamma \approx 0.05$–$0.15$ 在高 $z$ 下的标定                                                                                    |
| [16] | **Sobacchi & Mesinger 2013** (MNRAS 432, L51; 432, 3340)                                   | SM13 原子冷却再电离反馈 — 1D hydro 模型及冷却阈值拟合公式。见本文附录 B                                                                                                               |
| [17] | **Tocher+2026** (arXiv:2603.25546)                                                         | FDM 3D AREPO+AxiREPO star formation 模拟 — 波动力学对恒星形成的抑制效应。见本文 §9, §10.2                                                                                           |
| [18] | **May & Springel 2021** (MNRAS 506, 2603)                                                  | AxiREPO: 移动网格宇宙学 Schrödinger-Poisson 求解器 — §10.4 中推荐的 FDM DM 求解器                                                                                                   |
| [19] | **Bryan+14** (ApJS 211, 19)                                                                | ENZO: 自适应网格精化宇宙学模拟代码 — §10.4 中推荐的气体 AMR hydro 平台                                                                                                               |
| [20] | **Mesinger, Furlanetto & Cen 2011** (MNRAS 411, 955)                                       | 21cmFAST 原始论文 — 半解析 21cm 模拟框架，分子冷却截断$\exp(-m_{\rm crit}/M_h)$ 的设计基础。见本文 §2.1                                                                            |
| [21] | **Sheth & Tormen 1999** (MNRAS 308, 119); **Sheth, Mo & Tormen 2001** (MNRAS 323, 1) | 椭球塌缩晕质量函数 — §5.5 中$x^p/(1+x^p)$ 有理函数内插的方法论范例                                                                                                                 |

---

### 附录

#### A. `compute_fdm_mcrit.py` 算法流程

> # ⚠ 本脚本定量结果不可用
>
> **`scripts/compute_fdm_mcrit.py` 的输出不能用于任何定量结论。**
>
> - 该脚本基于**静态 DM 势**的二分查找，**不含气体动力学收缩**
> - 对 FDM 严重高估 $M_{\rm crit}$，误差达 **$10^2$–$10^4$ 倍**
> - 与 Tocher+2026 实测直接矛盾：静态模型判「不冷却」时，模拟实测 $M_h=3\times10^9$ 处仍有 **46% SFE**
> - 在 $m_a \lesssim 5\times10^{-22}\,{\rm eV}$ 时完全失效（返回 `inf`）
>
> **推荐替代**：正文 §5–§7 的解析方案
> $m_{\rm crit}^{\rm FDM} = \sqrt{[m_{\rm crit}^{\rm CDM}(z)]^2 + M_{\rm sol}^2(m_{22})}$，
> 由 `scripts/calibrate_fdm_mcrit.py` 实现（可直接复算 §6 表格）。
>
> 本附录记录该脚本的**缺陷成因与定量证据**，供避免重蹈覆辙之用。

##### A.2 静态模型的根本缺陷

真实物理：DM 势阱 → 气体落入 → 压缩加热 → 冷却 → **进一步收缩** → $\rho$ 上升 → 冷却更快 → runaway

静态模型在固定 DM 密度处评估冷却，**不追踪气体向更高密度的动力学收缩**。对 FDM soliton 平核（中心 DM 密度低至 $0.1$–$50\,{\rm cm}^{-3}$），静态判据几乎总是返回"不冷却"——这直接导致 $M_{\rm crit}$ 高估 $10^2$–$10^4\times$。

##### A.3 与 Tocher+2026 定量鸿沟

|                        $m_a$                        | 静态模型判定                                                | Tocher 实测                  | 鸿沟 |
| :----------------------------------------------------: | ----------------------------------------------------------- | ---------------------------- | :--: |
| $1\times 10^{-22}$ | 所有$M_h \le 10^{10}$: 不冷却 | $M_h=3\times10^9$: 46% SFE                                | ∞                           |      |
|                  $2\times 10^{-22}$                  | 同上                                                        | $M_h=8\times10^8$: 16% SFE |  ∞  |
|                  $1\times 10^{-21}$                  | $M_h=10^{10}$: COOLS          | 外推:$\sim 10^9$ 可冷却 | $\sim 10\times$            |      |

结论：静态模型在 $m_a \lesssim 5\times 10^{-22}$ eV 时完全不可用（返回 `inf`）。推荐方案（正文 §5-7）取代静态模型的二分查找，直接给出物理上自洽的 $m_{\rm crit}^{\rm FDM}$。

---

#### B. SM13 再电离反馈的 FDM 迁移

##### B.1 物理本质

SM13（Sobacchi & Mesinger 2013 [16]）处理**原子冷却域**（$T_{\rm vir} > 10^4$ K）的 UVB 光致蒸发反馈。与分子冷却路径的本质区别：

|      | 链路 A: 分子冷却                                           | 链路 B: SM13 原子冷却       |
| ---- | ---------------------------------------------------------- | --------------------------- |
| 冷却 | H₂ 转动线 (~100 K)                                        | H/He 原子线 (~10⁴ K)       |
| 障碍 | LW 光子摧毁 H₂                                            | UVB 加热气体                |
| 环境 | 中性 IGM ($z \gtrsim 15$) | 电离 IGM ($z \lesssim 15$) |                             |
| 代码 | `lyman_werner_threshold()`                               | `reionization_feedback()` |

##### B.2 FDM 修改策略

SM13 的 CDM 参数化为 [16]：

$$
M_{\rm crit} = M_0 \cdot (B \cdot \Gamma)^a \cdot ((1+z)/10)^b \cdot [1 - ((1+z)/(1+z_{\rm IN}))^c]^d
$$

FDM 修改是将系数 $\{M_0, a, b, c, d\}$ 变为 $m_a$ 的函数。这需要**1D 球对称 Lagrangian hydro** 将 NFW 势替换为 soliton+NFW 势，扫描 $(M_h, z, \Gamma, m_a)$ 参数空间后重新拟合。

##### B.3 可行性

| 方面             | 评估                                                  |
| ---------------- | ----------------------------------------------------- |
| 技术可行性       | 高 — 1D hydro 是成熟技术，方程全部在 SM13 Paper I 中 |
| 代码规模         | ~900 行 Python                                        |
| 工量             | 单人 1–2 周                                          |
| 关键风险         | 低 — CDM 基线可先复现 SM13 原始结果                  |
| 与分子冷却的关系 | 共享同一个 hydro 求解器，仅化学/冷却模块不同          |

---

#### C. `calibrate_fdm_mcrit.py` 说明

`scripts/calibrate_fdm_mcrit.py` 实现了 §5（二次合成）的全部数值计算，包括：

- $M_{\rm sol}(m_{22})$ 计算（含正确的 Schive+14 $m_{22}$ 转换）
- $m_{\rm crit}^{\rm FDM}(m_{22}, z)$ 与 CDM 比值表
- $\exp(-m_{\rm crit}/M_h)$ 截断影响表
- 与 Tocher+2026 的一致性检验
- $f_{\rm wave}$ 因子表
- 可直接复制的 C 代码片段

运行：`.venv/bin/python scripts/calibrate_fdm_mcrit.py`

# 第四篇　一致性审计与冲突裁决

> 来源：`docs/FDM_audit_report.md`　状态：**现行**

**审计日期**：2026-09-09
**审计范围**：本仓库 FDM 实现、`docs/FDM_*.md` 文档与 Liu+25 论文/源码的一致性
**审计类型**：文档审计（不修改任何物理公式）

---

### 0. 摘要

| 问题                     | 结论                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Liu 有没有要改条件 HMF？ | **有**，且是论文自称首次提出的核心创新（Eq.(5)）                                                                                    |
| 两份 md 谁对？           | 各对一半：`FDM_MCG_modeling.md`「应加 `f_FDM`」对；`FDM_MCG_modeling.md` 附录「σ mix 是 bug」错；`FDM_hmf_design.md`「不能加」错 |
| md 的行号过时吗？        | **没有**，`D:\v21cmFAST` 下全部准确（此前判"过时"是误用重构版所致）                                                               |
| fork 相对论文的偏离      | 补上了 Liu 代码缺失的`f_FDM`（✓），但 sigma2 退化为 CDM σ（✗）                                                                       |

---

### 1. 事实基准（务必遵守）

#### 1.1 版本矩阵

| 目录                                     | 版本                | git HEAD                              | 用途                                     |
| ---------------------------------------- | ------------------- | ------------------------------------- | ---------------------------------------- |
| `/mnt/d/v21cmFAST`（`D:\v21cmFAST`） | **v3.3.1**    | `369e5b2` Steven Murray, 2023-09-18 | **Liu 源码，唯一权威基准**         |
| `/mnt/d/21cmFAST`                      | v4.1.1              | `d098e902` 官方 bot, 2026-05-05     | v4 官方干净版（FDM 零命中），本仓库上游  |
| `/mnt/d/21cmFAST3.3.1fdm版本`          | v3.3.1(+41)         | `1945bf0` 王子乐, 2026-07-05        | 本仓库的 v3 重构版                       |
| `/home/dministrat/v21cmFAST`           | 同上                | `1945bf0`                           | 与上一行**同一 commit 的另一副本** |
| `/home/dministrat/21cmFAST_fork`       | **v4 开发版** | `111a0b2a`, 2026-07-09              | 本仓库（工作区）                         |

> **禁止**用 `/home/dministrat/v21cmFAST`（4423 行，含独立 `fdm.c`）核对 Liu 代码行号。
> 该副本是 2026-07-05 由本仓库做的「FDM 模块分离」重构，`dNdM_st_F` 等函数是重构产物，**不是 Liu 原码**。

#### 1.2 论文

Liu et al. 2025, *Phys. Rev. D* **112**, 103534 (2025)
（Shihang Liu, Yilin Liu, Bowen Peng, Mengzhou Xie, Zelong Liu, Bohua Li, Yi Mao）
PDF：`/mnt/c/Users/Administrator/Desktop/Liu et al. 2025.pdf`

#### 1.3 基线（FDM 前）

```
git tag baseline/pre-fdm  →  d8f67b76
```

`d8f67b76` 是 FDM 引入前的最后一个提交（`72df7832^`）。纯净度验证：

| 关键字         | 命中数                                                               |
| -------------- | -------------------------------------------------------------------- |
| `FDM`        | 0                                                                    |
| `m22`        | 0                                                                    |
| `dndm_FDM`   | 0                                                                    |
| `HMF_FINDEX` | 0                                                                    |
| `T_F`        | 17（**全部是 `FRACT_FLOAT_ERR` 的子串误匹配**，与 FDM 无关） |

派生链：

```
d098e902  v4.1.1 官方纯净版
    │  ← 40 commits（本仓库自有改动：训练脚本、LHS 采样、power spectrum 重写…）
    ▼
d8f67b76  ★ baseline/pre-fdm（FDM 前基线）
    │  ← 3 commits：72df7832 → 269c3e8f(fdm.c) → eb55d016(fdm.h)
    ▼
  HEAD     当前（含 FDM）+ 未提交工作区改动
```

常用命令：

```bash
git diff baseline/pre-fdm -- src/py21cmfast/src/      # FDM 全部改动（含工作区）
git diff baseline/pre-fdm HEAD -- src/py21cmfast/src/ # 仅已提交部分
```

---

### 2. FDM 改动清单

相对 `baseline/pre-fdm`，共 **14 文件 +374/−45**。其中：

#### 2.1 纯 FDM 改动（10 文件）

| 文件                              | 改动         | 说明                                                                      |
| --------------------------------- | ------------ | ------------------------------------------------------------------------- |
| `src/py21cmfast/src/fdm.c`      | +185（新增） | `T_F`、`dndm_FDM`、`sigma_z0_pre`、`dsigmasqdm_z0_pre`            |
| `src/py21cmfast/src/fdm.h`      | +16（新增）  | 声明                                                                      |
| `cosmology.c`                   | +34          | `power_in_k` 乘 $T_F^2$（L297-300）、`power_in_k_cdm`（L310）       |
| `cosmology.h`                   | +1           | —                                                                        |
| `hmf.c`                         | ±56         | 无条件 HMF（L509）、**条件 HMF（L457，未提交）** 乘 `dndm_FDM`    |
| `interp_tables.c`               | +47          | `Sigma_InterpTable_CDM` 建表与 `EvaluateSigma` FDM 分支（L1206-1217） |
| `wrapper/inputs.py`             | +8           | `m22`(L456)、`FDM`(L687)、`HMF_FINDEX`(L689)                        |
| `_inputparams_wrapper.h`        | +6           | —                                                                        |
| `_functionprototypes_wrapper.h` | +13          | —                                                                        |
| `debugging.c`                   | ±11         | 仅打印 FDM 参数（L100, L119）                                             |

#### 2.2 混入的非 FDM 改动（**审计时排除**）

| 文件                            | 改动      | 性质                                                                              |
| ------------------------------- | --------- | --------------------------------------------------------------------------------- |
| `indexing.c` / `indexing.h` | +6 / ±16 | `inline` → `static inline` 链接性整理 + `resample_index` 从 header 迁至 .c |
| `.gitignore`                  | ±2       | `py21cmfast/` → `/py21cmfast/` 路径锚定                                      |

> 这些改动与 FDM 逻辑无关，是同期混入的工程性改动。
>
> **【2026-09-10 更新】** 原列于此的 `IonisationBox.c` 条目（`R_index_MINI`/`R_MINI` 字段）
> **已删除**：该 WIP 只赋值未在 `struct RadiusSpec` 中定义，导致编译失败，
> 且上下游 v4.1.1 均无此字段，属未完成的独立改动（与 FDM 无关）。
> 同时修正了该文件中 `maximum_radius`/`minimum_radius` 上下限写反的注释。

---

### 3. 论文核心（原文引用）

#### 3.1 摘要

> "The full FDM dynamics are implemented in reionization simulations, along with **a new ansatz on modulation of the FDM HMF by the linear overdensity**."

#### 3.2 Sec. II A（P3）

> "The nonlinear effects of FDM on halo formation are modeled by (i) a fitting formula for the halo mass function, adopted from full FDM numerical simulations [20,21], (ii) **an ansatz that treats the density-modulated environmental effects in FDM cosmologies, which we introduce for the first time** (Sec. II A 2)."

#### 3.3 公式

**Eq.(2)** — FDM 线性功率谱（Hu+00）：

$$
\frac{P_{\rm FDM}(k,z)}{P_{\rm CDM}(k,z)} = \left[\frac{\cos(x^3)}{1+x^8}\right]^2,\quad x(k)\equiv 1.61\,m_{22}^{1/18}\frac{k}{k_{J,\rm eq}},\quad k_{J,\rm eq}=9\,m_{22}^{1/2}\,{\rm Mpc^{-1}}
$$

**Eq.(3)** — FDM HMF（Schive+16 拟合）：

$$
\left.\frac{dn}{dm}\right|_{\rm FDM}(m,z) = \left.\frac{dn}{dm}\right|_{\rm CDM}(m,z) \cdot \left[1+\left(\frac{m}{M_0}\right)^{\alpha}\right]^{-2.2},\quad M_0\equiv1.6\times10^{10}m_{22}^{-4/3}M_\odot,\ \alpha=-1.1
$$

**Eq.(4)** — 标准 excursion set：$\left.\frac{dn}{dm}\right|_{\rm CDM} = -\frac{\bar\rho_m}{m}f(\nu)\frac{d\ln\sigma}{dm}$，$\nu\equiv\delta_c/\sigma(m,z)$

**Eq.(5)** — 条件 HMF 的 ansatz（**核心**）：

> "We will work with the ansatz where the peak height variable that affects the FDM HMF in Eq. (3) **via the $(dn/dm)|_{\rm CDM}$ term** should be written as

$$
\nu^2 = \frac{[\delta_c - \delta_{\rm FDM}(z)]^2}{\sigma^2_{\rm CDM}(m,z) - \sigma^2_{\rm FDM}(M,z)}
$$

> where $m$ is the halo mass, $M$ is the total mass within the comoving volume under consideration, $\delta_{\rm FDM}(z)$ is the linear-theory FDM overdensity within this volume at redshift $z$, and $\sigma^2_{\rm FDM}(M,z)$ is the variance of the linear-theory FDM density field smoothed on mass scale $M$."

**闭合性自述**：

> "On very large scales ($M\to\infty$), the density-modulated HMF resulting from this ansatz reduces to the global average, Eq. (3), as expected."

#### 3.4 条件 FDM HMF 三要素

由 Eq.(3)+(5) 推出，**必须同时具备**：

1. **分子**用 $\delta_{\rm FDM}$（FDM 线性密度场）
2. **分母**用 $\sigma^2_{\rm CDM}(m) - \sigma^2_{\rm FDM}(M)$（**混合 σ**）
3. **整体保留** $f_{\rm FDM}(m)$（由 Eq.(3) 经 $(dn/dm)|_{\rm CDM}$ 项继承）

> Eq.(5) 只改写 peak height $\nu$，**未取消** Eq.(3) 的 $f_{\rm FDM}$。两者是「同时具备」，非二选一。

---

### 4. 三方对照表

| 要素                                           |       Liu 论文       |                       Liu 代码`D:\v21cmFAST`                       |                 本仓库 fork                 |
| ---------------------------------------------- | :-------------------: | :-------------------------------------------------------------------: | :-----------------------------------------: |
| ①$\sigma_{\rm CDM}(m)$ for sigma1           |         要求         |              ✓`ps.c:2255` (`Sigma_InterpTable_CDM`)              |         ✓`EvaluateSigma`→CDM 表         |
| ②**$\sigma_{\rm FDM}(M)$ for sigma2** | **要求 Eq.(5)** |         ✓`ps.c:2845`（`Sigma_InterpTable`，含 $T_F$）         | **✗ 退化为 $\sigma_{\rm CDM}(M)$** |
| ③**$\times f_{\rm FDM}(m)$**          | **要求 Eq.(3)** | **✗ 缺失**（`dNdM_conditional` 2240-2286 内无 `dndm_FDM`） |          ✓`hmf.c:457`（未提交）          |
| ④ 分子$\delta_{\rm FDM}$                    |         要求         |                    ✓（ICs 用含$T_F$ 的功率谱）                    |          ✓`cosmology.c:297-300`          |

**一句话**：Liu 代码缺 ③，本仓库补上了 ③ 但丢了 ②——**两边各缺一半**。

#### 4.1 fork 偏离点详解

`src/py21cmfast/src/interp_tables.c:1206-1217`：

```c
double EvaluateSigma(double lnM) {
    if (matter_options_global->USE_INTERPOLATION_TABLES > 0) {
        // FDM: use CDM-reference sigma table (no T_F cutoff) for HMF calculations
        if (matter_options_global->FDM)
            return EvaluateRGTable1D_f(lnM, &Sigma_InterpTable_CDM);   // ← 无条件返回 CDM σ
        return EvaluateRGTable1D_f(lnM, &Sigma_InterpTable);
    }
    if (matter_options_global->FDM) return sigma_z0_pre(exp(lnM));
    return sigma_z0(exp(lnM));
}
```

条件 HMF 的 sigma2 全部经 `EvaluateSigma` 取得（`interp_tables.c:317/435/518/599/632/692/741`，共 7 处），
故 FDM 下 $\sigma_2 = \sigma_{\rm CDM}(M)$，偏离 Eq.(5)。`EvaluatedSigmasqdm`（L1219-1231）有同样分支。

**该分支是 FDM 移植时新增的**——v4.1.1 官方基线（`/mnt/d/21cmFAST/src/py21cmfast/src/interp_tables.c:1170-1176`）的 `EvaluateSigma` **无任何 FDM 分支**。
因此这属于**重构引入的回归**：v4 把 σ 取值收敛到统一函数，顺手加了「FDM 用 CDM σ」（对 sigma1 正确），却未意识到 sigma2 需要 **FDM σ**，两者语义相反。

> 修复时需给 `EvaluateSigma` 增加区分 sigma1/sigma2 语义的参数（或新增 `EvaluateSigmaConditional`），
> **不能**简单删除该分支（否则破坏 sigma1 的正确行为）。

---

### 5. 逐条裁决

| #  | 主张                                                                          | 裁决                                  | 依据                                                                                                                                                                                    |
| -- | ----------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | `FDM_hmf_design.md` §3「条件 HMF **不能**加 `dndm_FDM`」           | **错误**                        | Eq.(3) 要求$f_{\rm FDM}$ 经 $(dn/dm)\|_{\rm CDM}$ 保留；论文自述 $M\to\infty$ 时条件 HMF「reduces to Eq.(3)」，不含 $f_{\rm FDM}$ 则无法回归全局 FDM HMF                        |
| 2  | 同上文档「乘$f_{\rm FDM}$ 会破坏 $\langle$cond$\rangle_\delta$=uncond」 | **数学上不成立**                | $f_{\rm FDM}(M)$ 仅依赖 $M$、不依赖 $\delta$，可提出 $\delta$ 平均之外：$\langle$cond$_{\rm CDM}\times f\rangle_\delta=f\times$uncond$_{\rm CDM}=$uncond$_{\rm FDM}$ ✓ |
| 3  | 同上文档「FDM 抑制如何随 δ 变化目前无数据/公式」                             | **过时**                        | Liu+25 已给出 Eq.(5)（自称首次提出）                                                                                                                                                    |
| 4  | `FDM_MCG_modeling.md` A.3「σ mix 是 bug，sigma2 应用 σ_CDM」              | **错误**                        | 混合 σ 正是 Eq.(5) 要求；Liu 代码`ps.c:2255+2845` 是**正确实现**                                                                                                               |
| 5  | 同上文档 A.3「缺少$f_{\rm FDM}$ 因子」                                      | **正确**（论证框架错）          | 非「σ 通道 vs f 通道二选一」，论文要求**两者同时具备**                                                                                                                           |
| 6  | 同上文档正文方案 2「全 CDM σ + 事后乘$f_{\rm FDM}$」                       | **与 Eq.(5) 冲突**              | Eq.(5) 要求分母含$\sigma^2_{\rm FDM}(M)$；本仓库照此实施导致要素②偏离                                                                                                                |
| 7  | 两份 md 的 ps.c 行号引用                                                      | **准确，不应改**                | 以`D:\v21cmFAST`（4544 行）核对全部吻合                                                                                                                                               |
| 8  | `fdm.c:47` 注释 "high-mass cutoff"                                          | **确认为误导**                  | $\alpha=-1.1$ 压制**小质量**晕，应为 low-mass suppression                                                                                                                       |
| 9  | `FDM_MCG_modeling.md` §1「`dndm_FDM` 仅作用于 `unconditional_hmf`」    | 对 Liu 为真，**对 fork 已过时** | fork 条件 HMF 已加（L457）                                                                                                                                                              |
| 10 | `compute_fdm_mcrit.py` 静态势模型                                           | **定量不可用**                  | 高估$M_{\rm crit}$ 达 10²–10⁴ 倍；与 Tocher+26 矛盾（静态判「不冷却」vs 实测 46% SFE）                                                                                             |

#### 5.1 Liu 代码行号索引（基准：`D:\v21cmFAST`，ps.c 4544 行）

| 符号                                | 位置                                                               |
| ----------------------------------- | ------------------------------------------------------------------ |
| `dndm_FDM`                        | `ps.c:987`                                                       |
| `dNdM_st`                         | `ps.c:995`                                                       |
| `dNdM_st_F`                       | `ps.c:1032-1034`（`return dNdM_st(growthf,M) * dndm_FDM(M);`） |
| `dNdM_conditional`                | `ps.c:2240-2286`                                                 |
| sigma1 的 FDM 分支                  | `ps.c:2251-2256`                                                 |
| `sigma2 = Sigma_InterpTable[...]` | `ps.c:2845`（另有 2930 / 3072 / 3397 / 3507）                    |
| `Sigma_InterpTable_CDM` 建表      | `ps.c:1684, 1694`                                                |

---

### 6. FDM 通道覆盖状况（供后续开发参考）

| 通道                                      | 状态                                              | 特征尺度                                             |
| ----------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| ① 功率谱截断$T_F(k)$                   | ✓ 已接入`cosmology.c:298`                      | —                                                   |
| ② HMF 压制$f_{\rm FDM}$                | △ 无条件 ✓ / 条件**部分偏离**（缺要素②） | $M_{\rm hm}=1.6\times10^{10}m_{22}^{-4/3}M_\odot$  |
| ③**分子冷却阈值 $m_{\rm crit}$** | **✗ 完全缺失**                             | $M_{\rm sol}=1.54\times10^{7}m_{22}^{-3/2}M_\odot$ |
| ④**SM13 原子冷却/再电离反馈**      | **✗ 完全缺失**                             | 需 1D hydro 重拟合                                   |
| ⑤ 波动力学$f_{\rm wave}$               | ✗ 无接口                                         | Tocher+26                                            |

**关键量化**：$M_{\rm sol}\ll M_{\rm hm}$（$m_{22}=1$：$1.5\times10^7$ vs $1.6\times10^{10}$）——
冷却抑制比 HMF 截断早约 **3 个量级**生效。即 **FDM 影响小质量恒星形成的主导通道（冷却）目前完全未建模**。

- `thermochem.c:289`：`mcrit_noLW = 3.314e7 * pow(1.+z, -1.5)` —— 纯 CDM
- `thermochem.c:302-307`：`reionization_feedback`（SM13）—— 纯 CDM
- `thermochem.c:278` `atomic_cooling_threshold`、L280 `molecular_cooling_threshold`

#### 6.1 数值复算验证（2026-09-09）

用 `.venv/bin/python scripts/calibrate_fdm_mcrit.py`（exit 0）复算
`FDM_mcrit_algorithm.md` §6 三张表，**全部吻合**：

| 表    | 核对项                                             | 结果                                                                                              |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| §6.1 | $M_{\rm sol}$、$M_{\rm hm}$、$R(z=10/20/30)$ | ✓ 逐项一致（如$m_{22}=1$：$1.54\times10^7$ / $1.60\times10^{10}$ / 16.98 / 44.73 / 80.21） |
| §6.2 | $m_{\rm crit}^{\rm FDM}(m_{22},z)$ 绝对值        | ✓ 逐项一致（如$z{=}10$：CDM $9.084\times10^5$，$m_{22}{=}1$ 为 $1.543\times10^7$）       |
| §6.3 | $\exp(-M_{\rm turn}/M)$ 截断因子                 | ✓ 逐项一致（如$M_h{=}10^7$：CDM 0.9132，$m_{22}{=}1$ 为 0.2138）                             |

结论：`FDM_mcrit_algorithm.md` §6 的数值表格**经复算确认无误**，可作为后续实现 mcrit FDM 迁移的依据。

---

### 7. 遗留问题与风险

1. **要素④ 仅推断**：分子 $\delta_{\rm FDM}$ 由 ICs 含 $T_F$ 推断成立，未逐点追踪 `delta` 传入 `conditional_hmf` 的完整链路。
2. **`72df7832` 混入非 FDM 改动**：`indexing.c/h`、`IonisationBox.c`、`.gitignore`（见 §2.2），审计时已排除。
3. **未提交改动**：`hmf.c`（条件 HMF 加 FDM）与 `IonisationBox.c` 仍在工作区。`git diff baseline/pre-fdm HEAD` **看不到**它们，必须用不带 `HEAD` 的形式。
4. **多副本风险**：`/mnt/c/Users/zile/Desktop/` 存有 5 份 md 副本 + `ps7` 目录，可能与仓库内 `docs/` 不同步。**权威副本为仓库内 `docs/`**。
5. **本次不修复任何偏离**：fork 的 sigma2 退化仍存在，仅记录不修改，超出「审计」范围。

---

### 8. 参考文献

**FDM 物理**：Liu et al. 2025, PRD 112, 103534 · Schive et al. 2016, PRL 116, 201302 · Schive et al. 2014, Nature Phys. 10, 496 · Hu, Barkana & Gruzinov 2000, PRL 85, 1158 · Du et al. 2017, ApJ 838, 63 · Tocher et al. 2026, arXiv:2603.25546

**CDM 冷却/反馈**：Fialkov et al. 2012, MNRAS 424, 1335 · Visbal et al. 2015, Nature 528, 357 · Schauer et al. 2021, MNRAS 507, 1775 · Muñoz et al. 2021, arXiv:2110.13919 · Sobacchi & Mesinger 2013, MNRAS 432, L51 / 3340 · Stacy et al. 2011, MNRAS 413, 172 · Greif et al. 2011, ApJ 737, 75

**结构形成**：Sheth & Tormen 2001, MNRAS 323, 1 · Barkana & Loeb 2001, Phys. Rep. 349, 125 · Bryan & Norman 1998, ApJ 495, 80

# 第五篇　备选方案存档（未实施）

> 本篇仅保留**尚未实施且具备参考价值**的备选方案。
>
> 以下内容已删除，正确结论见**第一篇 §8–§9**：
>
> - 「条件 HMF 乘 $f_{\rm FDM}$」（方案 2）—— 已于 2026-09-10 回退，见第一篇 §9.7
> - 「FDM σ 通道方案」（方案 3）—— 不推荐，与 $f_{\rm FDM}$ 互斥
> - Liu 源码的公式级对比诊断 —— 已被第一篇 §8 修正
> - 已过时的代码基础设施描述、文件索引、重复参考文献

## 1. 核心困难与文献现状

**FDM 的条件 HMF 没有现成的半解析经验公式可直接用。**

原因不是没人研究，而是 FDM 的 excursion set 问题本质上比 CDM 难：

1. **CDM 的 EPS 依赖 sharp-k 滤波器** —— 恰好对应的马尔可夫过程使 first-crossing 概率有解析解
2. **FDM 的量子压力天然对应 sharp-k 截止** —— 但 Du et al. (2017) 证明即使使用 sharp-k，FDM 的 barrier 也是**质量依赖的**（不再是常数 $\delta_c$），这导致解析解复杂得多
3. Du+17 确实解了这个问题（用修正的 Lacey & Cole 形式 + GALACTICUS 半解析模型），但公式涉及**双重数值积分 + 质量依赖 barrier 的 Taylor 展开**，不是一条解析公式能写完的

### 文献现状

- **Jones et al. (2021)**: 直接用的 `dndm_FDM` 乘在 ST HMF 上（和代码现有做法一样），未专门处理 minihalo
- **Liu et al. (2025)**: 更近一步把 FDM 的 $\sigma(M)$ 代入了条件 HMF，但也**没有专门处理分子冷却晕**

**FDM 的分子冷却阈值目前没有一篇文献给出过可直接用的解析公式。所有现有工作都回避了这个问题 —— 要么不做 minihalo，要么直接用 CDM 的 $M_{\rm turn}$ + FDM HMF 压制。**

## 2. 方案 A：只改 $M_{\rm turn}$（最小改动）

利用现有 FDM 基础设施，**只修改分子冷却质量阈值**：

$$
M_{\text{turn}}^{\text{FDM}} = \max\left(M_{\text{cool}},\; M_{1/2}\right), \quad M_{1/2} = 1.6\times 10^{10}\; m_{22}^{-4/3}\; M_\odot
$$

其中 $M_{\text{cool}}$ 是现有的分子冷却阈值（含 LW 反馈，来自 `lyman_werner_threshold()`），
$M_{1/2}$ 是 Schive+16 半模质量。物理直觉：FDM 量子压力压制了低于 $M_{1/2}$ 的晕形成，
因此 MCG 的下限至少为 $M_{1/2}$。

- **修改位置**：`thermochem.c: lyman_werner_threshold()` 返回前取 max，
  或 `hmf.c: nion_fraction_mini()` 的 `Mturn_mcg` 处
- **优点**：~10 行代码，$dndm\_FDM$ 已经定义了 $M_{1/2}$
- **缺点**：忽略了 FDM 对条件 HMF 形状的修正 —— 在 $\sigma(M)\sim\sigma(R)$ 附近，
  FDM 的条件 HMF 形状和 CDM 明显不同（Du+17 图 3）

> 注：与第三篇的 $m_{\rm crit}^{\rm FDM}$ 方案**互斥**（两者都改 $M_{\rm turn}$，
> 但取值不同：本篇用 $M_{1/2}$，第三篇用 $M_{\rm sol}=\sqrt{(\cdot)^2+M_{\rm sol}^2}$ 合成）。
> 因 $M_{\rm sol}\ll M_{1/2}$，第三篇方案物理上更优（冷却抑制主导），
> 本篇仅作备选记录。

## 3. 方案 B：实现 Du+17 的完整 FDM 条件 HMF（长期方向）

Du et al. (2017, ApJ, 838, 63) 提供了完整的 FDM excursion set 解。核心公式（Eq. 6-9）：

$$
\frac{dn}{d\ln M}\bigg|_{\delta} = \frac{M_{\text{cond}}}{M} \cdot \frac{\Delta\delta}{\sqrt{2\pi\Delta S}}\cdot\exp\!\left(-\frac{\Delta\delta^2}{2\Delta S}\right)\cdot\frac{dS}{d\ln M}\cdot\frac{1}{\Delta S}\cdot\text{Taylor terms}
$$

其中 barrier 不再是常数 $\delta_c$，而是质量依赖的：

$$
\delta_{\text{FDM}}(M, z) = \delta_c \cdot \left[1 + a_1\!\left(\frac{M_{1/2}}{M}\right)^{b_1} + a_2\!\left(\frac{M_{1/2}}{M}\right)^{b_2}\right]
$$

参数 $(a_1,b_1,a_2,b_2)$ 是质量依赖 barrier 的拟合系数。

- **优点**：理论正确，和 Du+17 的 merger tree 结果一致
- **缺点**：
  - 需要在 `conditional_hmf` 里新增一个函数，改写 excursion set 的 barrier
  - 工作量大，且 Du+17 的拟合公式依赖 sharp-k 滤波器，和代码现有的 top-hat 滤波器不完全兼容
  - 估计 **2-3 个月**工作量

---

# 附录　速查与常见误区

## A.1 速查表

| 问题                                                                           | 答案                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| FDM 的 dndm 怎么算？                                                           | CDM dndm（**用 CDM σ**）× $f_{\rm FDM}(m)$              |
| σ 用 CDM 还是 FDM？                                                           | **CDM**（唯一例外：条件 HMF 的 $\sigma_2$ 用 FDM）        |
| 为什么不用 FDM σ？                                                            | 会与$f_{\rm FDM}$ 双重计数                                      |
| $f_{\rm FDM}$ 压制大质量还是小质量？ | **小质量**（$\alpha=-1.1<0$） |                                                                   |
| 条件 HMF 要不要乘$f_{\rm FDM}$？                                             | **不要**（已回退对齐 Liu）                                  |
| $\sigma_1$ / $\sigma_2$ 用什么？                                           | $\sigma_1$=CDM σ / $\sigma_2$=**FDM σ**               |
| 分子 δ 用什么？                                                               | FDM 场的 δ（ICs 含$T_F$，自动满足）                            |
| 基线在哪？                                                                     | `git tag baseline/pre-fdm` → `d8f67b76`                      |
| 复现论文图用哪个脚本？                                                         | `train/_plot_ps_dimensionless.py`、`train/_plot_hmf_three.py` |

## A.2 常见误区

| 误区                                                                               | 纠正                                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 「$f_{\rm FDM}$ 是压制大质量晕的」 | 错。$\alpha=-1.1<0$，压制**小质量** |                                                                             |
| 「σ₁ 用 CDM、σ₂ 用 FDM 是 bug」                                                | 错。这正是 Eq.(5) 的要求                                                    |
| 「条件 HMF 乘$f_{\rm FDM}$ 会破坏闭合」                                          | 该论据不成立；但实际已按 Liu 回退为不乘                                     |
| 「FDM 效应主要来自 HMF」                                                           | 不准确。$M_{\rm sol}\ll M_{\rm hm}$，**冷却通道才是主导且完全缺失** |
| 「用`/home/dministrat/v21cmFAST` 核对 Liu 行号」                                 | 错。那是重构版（4423 行），要用`D:\v21cmFAST`（4544 行）                  |

## A.3 验证脚本（`train/`，该目录被 .gitignore 忽略）

| 脚本                          | 用途                                             |
| ----------------------------- | ------------------------------------------------ |
| `_plot_ps_dimensionless.py` | 复现 Liu Fig.1 功率谱                            |
| `_plot_hmf_three.py`        | 复现 Liu Fig.2 HMF（含 FDM I.C.s 对照）          |
| `_verify_global_path.py`    | 验证全局路径 = CDM HMF(CDM σ) ×$f_{\rm FDM}$ |
| `_verify_cond_hmf_fdm.py`   | 定量对比 A/B/C 三配置的条件 HMF                  |
| `_verify_fork_vs_liu.py`    | 扫描$M_{\min}/M_0$ 对 A/B 比值的影响           |
| `_verify_meanfixing.py`     | 验证 mean-fixing 对差异的抹平作用                |
