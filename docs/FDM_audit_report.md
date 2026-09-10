# FDM 实现一致性审计报告

**审计日期**：2026-09-09
**审计范围**：本仓库 FDM 实现、`docs/FDM_*.md` 文档与 Liu+25 论文/源码的一致性
**审计类型**：文档审计（不修改任何物理公式）

---

## 0. 摘要

| 问题 | 结论 |
|---|---|
| Liu 有没有要改条件 HMF？ | **有**，且是论文自称首次提出的核心创新（Eq.(5)） |
| 两份 md 谁对？ | 各对一半：`FDM_MCG_modeling.md`「应加 `f_FDM`」对；`FDM_MCG_modeling.md` 附录「σ mix 是 bug」错；`FDM_hmf_design.md`「不能加」错 |
| md 的行号过时吗？ | **没有**，`D:\v21cmFAST` 下全部准确（此前判"过时"是误用重构版所致） |
| fork 相对论文的偏离 | 补上了 Liu 代码缺失的 `f_FDM`（✓），但 sigma2 退化为 CDM σ（✗） |

---

## 1. 事实基准（务必遵守）

### 1.1 版本矩阵

| 目录 | 版本 | git HEAD | 用途 |
|---|---|---|---|
| `/mnt/d/v21cmFAST`（`D:\v21cmFAST`） | **v3.3.1** | `369e5b2` Steven Murray, 2023-09-18 | **Liu 源码，唯一权威基准** |
| `/mnt/d/21cmFAST` | v4.1.1 | `d098e902` 官方 bot, 2026-05-05 | v4 官方干净版（FDM 零命中），本仓库上游 |
| `/mnt/d/21cmFAST3.3.1fdm版本` | v3.3.1(+41) | `1945bf0` 王子乐, 2026-07-05 | 本仓库的 v3 重构版 |
| `/home/dministrat/v21cmFAST` | 同上 | `1945bf0` | 与上一行**同一 commit 的另一副本** |
| `/home/dministrat/21cmFAST_fork` | **v4 开发版** | `111a0b2a`, 2026-07-09 | 本仓库（工作区） |

> **禁止**用 `/home/dministrat/v21cmFAST`（4423 行，含独立 `fdm.c`）核对 Liu 代码行号。
> 该副本是 2026-07-05 由本仓库做的「FDM 模块分离」重构，`dNdM_st_F` 等函数是重构产物，**不是 Liu 原码**。

### 1.2 论文

Liu et al. 2025, *Phys. Rev. D* **112**, 103534 (2025)
（Shihang Liu, Yilin Liu, Bowen Peng, Mengzhou Xie, Zelong Liu, Bohua Li, Yi Mao）
PDF：`/mnt/c/Users/Administrator/Desktop/Liu et al. 2025.pdf`

### 1.3 基线（FDM 前）

```
git tag baseline/pre-fdm  →  d8f67b76
```

`d8f67b76` 是 FDM 引入前的最后一个提交（`72df7832^`）。纯净度验证：

| 关键字 | 命中数 |
|---|---|
| `FDM` | 0 |
| `m22` | 0 |
| `dndm_FDM` | 0 |
| `HMF_FINDEX` | 0 |
| `T_F` | 17（**全部是 `FRACT_FLOAT_ERR` 的子串误匹配**，与 FDM 无关） |

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

## 2. FDM 改动清单

相对 `baseline/pre-fdm`，共 **14 文件 +374/−45**。其中：

### 2.1 纯 FDM 改动（10 文件）

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/py21cmfast/src/fdm.c` | +185（新增） | `T_F`、`dndm_FDM`、`sigma_z0_pre`、`dsigmasqdm_z0_pre` |
| `src/py21cmfast/src/fdm.h` | +16（新增） | 声明 |
| `cosmology.c` | +34 | `power_in_k` 乘 $T_F^2$（L297-300）、`power_in_k_cdm`（L310） |
| `cosmology.h` | +1 | — |
| `hmf.c` | ±56 | 无条件 HMF（L509）、**条件 HMF（L457，未提交）** 乘 `dndm_FDM` |
| `interp_tables.c` | +47 | `Sigma_InterpTable_CDM` 建表与 `EvaluateSigma` FDM 分支（L1206-1217） |
| `wrapper/inputs.py` | +8 | `m22`(L456)、`FDM`(L687)、`HMF_FINDEX`(L689) |
| `_inputparams_wrapper.h` | +6 | — |
| `_functionprototypes_wrapper.h` | +13 | — |
| `debugging.c` | ±11 | 仅打印 FDM 参数（L100, L119） |

### 2.2 混入的非 FDM 改动（4 文件，**审计时排除**）

| 文件 | 改动 | 性质 |
|---|---|---|
| `indexing.c` / `indexing.h` | +6 / ±16 | `inline` → `static inline` 链接性整理 + `resample_index` 从 header 迁至 .c |
| `IonisationBox.c` | ±18 | `R_index_MINI`/`R_MINI` 字段 + 中文注释（无 FDM/m22 关键字） |
| `.gitignore` | ±2 | `py21cmfast/` → `/py21cmfast/` 路径锚定 |

> 这些改动与 FDM 逻辑无关，是同期混入的工程性改动。

---

## 3. 论文核心（原文引用）

### 3.1 摘要

> "The full FDM dynamics are implemented in reionization simulations, along with **a new ansatz on modulation of the FDM HMF by the linear overdensity**."

### 3.2 Sec. II A（P3）

> "The nonlinear effects of FDM on halo formation are modeled by (i) a fitting formula for the halo mass function, adopted from full FDM numerical simulations [20,21], (ii) **an ansatz that treats the density-modulated environmental effects in FDM cosmologies, which we introduce for the first time** (Sec. II A 2)."

### 3.3 公式

**Eq.(2)** — FDM 线性功率谱（Hu+00）：

$$ \frac{P_{\rm FDM}(k,z)}{P_{\rm CDM}(k,z)} = \left[\frac{\cos(x^3)}{1+x^8}\right]^2,\quad x(k)\equiv 1.61\,m_{22}^{1/18}\frac{k}{k_{J,\rm eq}},\quad k_{J,\rm eq}=9\,m_{22}^{1/2}\,{\rm Mpc^{-1}} $$

**Eq.(3)** — FDM HMF（Schive+16 拟合）：

$$ \left.\frac{dn}{dm}\right|_{\rm FDM}(m,z) = \left.\frac{dn}{dm}\right|_{\rm CDM}(m,z) \cdot \left[1+\left(\frac{m}{M_0}\right)^{\alpha}\right]^{-2.2},\quad M_0\equiv1.6\times10^{10}m_{22}^{-4/3}M_\odot,\ \alpha=-1.1 $$

**Eq.(4)** — 标准 excursion set：$\left.\frac{dn}{dm}\right|_{\rm CDM} = -\frac{\bar\rho_m}{m}f(\nu)\frac{d\ln\sigma}{dm}$，$\nu\equiv\delta_c/\sigma(m,z)$

**Eq.(5)** — 条件 HMF 的 ansatz（**核心**）：

> "We will work with the ansatz where the peak height variable that affects the FDM HMF in Eq. (3) **via the $(dn/dm)|_{\rm CDM}$ term** should be written as

$$ \nu^2 = \frac{[\delta_c - \delta_{\rm FDM}(z)]^2}{\sigma^2_{\rm CDM}(m,z) - \sigma^2_{\rm FDM}(M,z)} $$

> where $m$ is the halo mass, $M$ is the total mass within the comoving volume under consideration, $\delta_{\rm FDM}(z)$ is the linear-theory FDM overdensity within this volume at redshift $z$, and $\sigma^2_{\rm FDM}(M,z)$ is the variance of the linear-theory FDM density field smoothed on mass scale $M$."

**闭合性自述**：

> "On very large scales ($M\to\infty$), the density-modulated HMF resulting from this ansatz reduces to the global average, Eq. (3), as expected."

### 3.4 条件 FDM HMF 三要素

由 Eq.(3)+(5) 推出，**必须同时具备**：

1. **分子**用 $\delta_{\rm FDM}$（FDM 线性密度场）
2. **分母**用 $\sigma^2_{\rm CDM}(m) - \sigma^2_{\rm FDM}(M)$（**混合 σ**）
3. **整体保留** $f_{\rm FDM}(m)$（由 Eq.(3) 经 $(dn/dm)|_{\rm CDM}$ 项继承）

> Eq.(5) 只改写 peak height $\nu$，**未取消** Eq.(3) 的 $f_{\rm FDM}$。两者是「同时具备」，非二选一。

---

## 4. 三方对照表

| 要素 | Liu 论文 | Liu 代码 `D:\v21cmFAST` | 本仓库 fork |
|---|:-:|:-:|:-:|
| ① $\sigma_{\rm CDM}(m)$ for sigma1 | 要求 | ✓ `ps.c:2255` (`Sigma_InterpTable_CDM`) | ✓ `EvaluateSigma`→CDM 表 |
| ② **$\sigma_{\rm FDM}(M)$ for sigma2** | **要求 Eq.(5)** | ✓ `ps.c:2845`（`Sigma_InterpTable`，含 $T_F$） | **✗ 退化为 $\sigma_{\rm CDM}(M)$** |
| ③ **$\times f_{\rm FDM}(m)$** | **要求 Eq.(3)** | **✗ 缺失**（`dNdM_conditional` 2240-2286 内无 `dndm_FDM`） | ✓ `hmf.c:457`（未提交） |
| ④ 分子 $\delta_{\rm FDM}$ | 要求 | ✓（ICs 用含 $T_F$ 的功率谱） | ✓ `cosmology.c:297-300` |

**一句话**：Liu 代码缺 ③，本仓库补上了 ③ 但丢了 ②——**两边各缺一半**。

### 4.1 fork 偏离点详解

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

## 5. 逐条裁决

| # | 主张 | 裁决 | 依据 |
|---|---|---|---|
| 1 | `FDM_hmf_design.md` §3「条件 HMF **不能**加 `dndm_FDM`」 | **错误** | Eq.(3) 要求 $f_{\rm FDM}$ 经 $(dn/dm)\|_{\rm CDM}$ 保留；论文自述 $M\to\infty$ 时条件 HMF「reduces to Eq.(3)」，不含 $f_{\rm FDM}$ 则无法回归全局 FDM HMF |
| 2 | 同上文档「乘 $f_{\rm FDM}$ 会破坏 $\langle$cond$\rangle_\delta$=uncond」 | **数学上不成立** | $f_{\rm FDM}(M)$ 仅依赖 $M$、不依赖 $\delta$，可提出 $\delta$ 平均之外：$\langle$cond$_{\rm CDM}\times f\rangle_\delta=f\times$uncond$_{\rm CDM}=$uncond$_{\rm FDM}$ ✓ |
| 3 | 同上文档「FDM 抑制如何随 δ 变化目前无数据/公式」 | **过时** | Liu+25 已给出 Eq.(5)（自称首次提出） |
| 4 | `FDM_MCG_modeling.md` A.3「σ mix 是 bug，sigma2 应用 σ_CDM」 | **错误** | 混合 σ 正是 Eq.(5) 要求；Liu 代码 `ps.c:2255+2845` 是**正确实现** |
| 5 | 同上文档 A.3「缺少 $f_{\rm FDM}$ 因子」 | **正确**（论证框架错） | 非「σ 通道 vs f 通道二选一」，论文要求**两者同时具备** |
| 6 | 同上文档正文方案 2「全 CDM σ + 事后乘 $f_{\rm FDM}$」 | **与 Eq.(5) 冲突** | Eq.(5) 要求分母含 $\sigma^2_{\rm FDM}(M)$；本仓库照此实施导致要素②偏离 |
| 7 | 两份 md 的 ps.c 行号引用 | **准确，不应改** | 以 `D:\v21cmFAST`（4544 行）核对全部吻合 |
| 8 | `fdm.c:47` 注释 "high-mass cutoff" | **确认为误导** | $\alpha=-1.1$ 压制**小质量**晕，应为 low-mass suppression |
| 9 | `FDM_MCG_modeling.md` §1「`dndm_FDM` 仅作用于 `unconditional_hmf`」 | 对 Liu 为真，**对 fork 已过时** | fork 条件 HMF 已加（L457） |
| 10 | `compute_fdm_mcrit.py` 静态势模型 | **定量不可用** | 高估 $M_{\rm crit}$ 达 10²–10⁴ 倍；与 Tocher+26 矛盾（静态判「不冷却」vs 实测 46% SFE） |

### 5.1 Liu 代码行号索引（基准：`D:\v21cmFAST`，ps.c 4544 行）

| 符号 | 位置 |
|---|---|
| `dndm_FDM` | `ps.c:987` |
| `dNdM_st` | `ps.c:995` |
| `dNdM_st_F` | `ps.c:1032-1034`（`return dNdM_st(growthf,M) * dndm_FDM(M);`） |
| `dNdM_conditional` | `ps.c:2240-2286` |
| sigma1 的 FDM 分支 | `ps.c:2251-2256` |
| `sigma2 = Sigma_InterpTable[...]` | `ps.c:2845`（另有 2930 / 3072 / 3397 / 3507） |
| `Sigma_InterpTable_CDM` 建表 | `ps.c:1684, 1694` |

---

## 6. FDM 通道覆盖状况（供后续开发参考）

| 通道 | 状态 | 特征尺度 |
|---|---|---|
| ① 功率谱截断 $T_F(k)$ | ✓ 已接入 `cosmology.c:298` | — |
| ② HMF 压制 $f_{\rm FDM}$ | △ 无条件 ✓ / 条件**部分偏离**（缺要素②） | $M_{\rm hm}=1.6\times10^{10}m_{22}^{-4/3}M_\odot$ |
| ③ **分子冷却阈值 $m_{\rm crit}$** | **✗ 完全缺失** | $M_{\rm sol}=1.54\times10^{7}m_{22}^{-3/2}M_\odot$ |
| ④ **SM13 原子冷却/再电离反馈** | **✗ 完全缺失** | 需 1D hydro 重拟合 |
| ⑤ 波动力学 $f_{\rm wave}$ | ✗ 无接口 | Tocher+26 |

**关键量化**：$M_{\rm sol}\ll M_{\rm hm}$（$m_{22}=1$：$1.5\times10^7$ vs $1.6\times10^{10}$）——
冷却抑制比 HMF 截断早约 **3 个量级**生效。即 **FDM 影响小质量恒星形成的主导通道（冷却）目前完全未建模**。

- `thermochem.c:289`：`mcrit_noLW = 3.314e7 * pow(1.+z, -1.5)` —— 纯 CDM
- `thermochem.c:302-307`：`reionization_feedback`（SM13）—— 纯 CDM
- `thermochem.c:278` `atomic_cooling_threshold`、L280 `molecular_cooling_threshold`

### 6.1 数值复算验证（2026-09-09）

用 `.venv/bin/python scripts/calibrate_fdm_mcrit.py`（exit 0）复算
`FDM_mcrit_algorithm.md` §6 三张表，**全部吻合**：

| 表 | 核对项 | 结果 |
|---|---|---|
| §6.1 | $M_{\rm sol}$、$M_{\rm hm}$、$R(z=10/20/30)$ | ✓ 逐项一致（如 $m_{22}=1$：$1.54\times10^7$ / $1.60\times10^{10}$ / 16.98 / 44.73 / 80.21） |
| §6.2 | $m_{\rm crit}^{\rm FDM}(m_{22},z)$ 绝对值 | ✓ 逐项一致（如 $z{=}10$：CDM $9.084\times10^5$，$m_{22}{=}1$ 为 $1.543\times10^7$） |
| §6.3 | $\exp(-M_{\rm turn}/M)$ 截断因子 | ✓ 逐项一致（如 $M_h{=}10^7$：CDM 0.9132，$m_{22}{=}1$ 为 0.2138） |

结论：`FDM_mcrit_algorithm.md` §6 的数值表格**经复算确认无误**，可作为后续实现 mcrit FDM 迁移的依据。

---

## 7. 遗留问题与风险

1. **要素④ 仅推断**：分子 $\delta_{\rm FDM}$ 由 ICs 含 $T_F$ 推断成立，未逐点追踪 `delta` 传入 `conditional_hmf` 的完整链路。
2. **`72df7832` 混入非 FDM 改动**：`indexing.c/h`、`IonisationBox.c`、`.gitignore`（见 §2.2），审计时已排除。
3. **未提交改动**：`hmf.c`（条件 HMF 加 FDM）与 `IonisationBox.c` 仍在工作区。`git diff baseline/pre-fdm HEAD` **看不到**它们，必须用不带 `HEAD` 的形式。
4. **多副本风险**：`/mnt/c/Users/zile/Desktop/` 存有 5 份 md 副本 + `ps7` 目录，可能与仓库内 `docs/` 不同步。**权威副本为仓库内 `docs/`**。
5. **本次不修复任何偏离**：fork 的 sigma2 退化仍存在，仅记录不修改，超出「审计」范围。

---

## 8. 参考文献

**FDM 物理**：Liu et al. 2025, PRD 112, 103534 · Schive et al. 2016, PRL 116, 201302 · Schive et al. 2014, Nature Phys. 10, 496 · Hu, Barkana & Gruzinov 2000, PRL 85, 1158 · Du et al. 2017, ApJ 838, 63 · Tocher et al. 2026, arXiv:2603.25546

**CDM 冷却/反馈**：Fialkov et al. 2012, MNRAS 424, 1335 · Visbal et al. 2015, Nature 528, 357 · Schauer et al. 2021, MNRAS 507, 1775 · Muñoz et al. 2021, arXiv:2110.13919 · Sobacchi & Mesinger 2013, MNRAS 432, L51 / 3340 · Stacy et al. 2011, MNRAS 413, 172 · Greif et al. 2011, ApJ 737, 75

**结构形成**：Sheth & Tormen 2001, MNRAS 323, 1 · Barkana & Loeb 2001, Phys. Rep. 349, 125 · Bryan & Norman 1998, ApJ 495, 80
