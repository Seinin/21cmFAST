# 修正物理链里 f* 与 UV 光度函数的代码口径

## Why

物理链真源 `docs/notes/physics-chain/chain.json` 里，`f*` 与 `φ(M_1500, z)` 两处的**摘要公式**给的是论文（Pritchard & Loeb 2012）的简式，而代码执行的是另一套表达式。摘要公式按「有 `formula` 就渲染公式」的判据印在属性页与模块文档的物理一节，于是读者读到的是代码里没有的式子。

两处的偏差方向不同：

| 对象 | 现在写的（论文） | 代码实际执行的 | 差在哪 |
| --- | --- | --- | --- |
| `f*` | $f_\star=f_{\star,10}(M/10^{10}M_\odot)^{\alpha_\star}\exp(-M_{\rm turn}/M)\le1$（单幂律 + 指数截断 + 截断到 1） | 单幂律只走低质端；高质端在 `USE_UPPER_STELLAR_TURNOVER` 开且 $\alpha_\star>\alpha_{\rm up}$ 时换成**双幂律**（转折质量 `UPPER_STELLAR_TURNOVER_MASS`、高质端指数 `UPPER_STELLAR_TURNOVER_INDEX`，两者默认值 11.447 / $-0.6$ 与默认 $\alpha_\star=0.5$ 使该支**默认生效**）；每个晕再按**对数正态散射**抽一次（宽度 `SIGMA_STAR`，均值口径抬 $\sigma_\star^2/2$） | 少三项：双幂律、散射、均值抬升 |
| `φ(M_1500, z)` | Schechter 解析式 $\frac{\ln10}{2.5}\phi^\star 10^{0.4(\alpha+1)(M^\star-M_{1500})}e^{-10^{0.4(M^\star-M_{1500})}}$，且记 $\phi^\star,M^\star,\alpha\leftarrow\dot\rho_\star$ | **不拟合 Schechter**：把晕质量函数换元到绝对星等轴 $\phi=\left|\mathrm{d}M_{1500}/\mathrm{d}M_h\right|^{-1}(\mathrm{d}n/\mathrm{d}M_h)e^{-M_{\rm turn}/M_h}f_{\rm duty}$，$M_{1500}$ 由 SFR 乘 UV 转换系数折出（$51.63-2.5\log_{10}(\mathrm{SFR}\,L_{\rm UV/SFR})$），$F_\star$ 用单幂律截断到 1 | 算法本身就不同（换元 vs 拟合式），不是粒度差 |

`f*` 的偏差是**同一套算法的细化版**（PDF 的简式是代码表达式的特例），`φ(M_1500)` 的偏差属于账本 §一 那条「**理论推导与代码实现两码事时，图上以代码为准、理论在文档里给**」——该条已列 `Q_HII / x_HI` 与 `T_S`，本条应补入 `φ(M_1500)`。

同一页的工程一节（来自真源的 `codeSites[].note`）**已经**写的是代码做法（「用 `M_UV(M_h)` 的样条导数把质量函数换算到 `M_UV` 空间」），所以现状是同一篇文档的物理节与工程节互相矛盾。

## What changes

1. `docText.fstar.formula`、`docText.phi_uv.formula`（摘要公式，逐字进产物与模块文档）改成代码表达式。
2. `docText.fstar.physics`、`docText.phi_uv.physics`：物理一节的成段叙述按新公式改写（仍不出现任何代码标识——文件名、函数名、参数名）。
3. `nodes[phi_uv].name` 去掉「（Schechter）」；`nodes[phi_uv].formula`（检索用的一行摘要）、`nature.type` 改成代码口径。
4. 给 `f*` 与 `φ(M_1500)` 补 `theory` 字段：记明论文出处（Eq.1、Eq.12–Eq.14）与「代码用的是另一套 / 多出哪些项」，与 `q_hii` / `ts` 的写法一致。
5. `algorithms.byId.fstar`（`how` / `where`）、`algorithms.byId.phi_uv`（`how`）按代码补全：点出双幂律、散射、截断到 1、样条平滑、$\phi$ 下限 $-30$ 与各自读的参数。
6. `drivers[fstar].codeNames` 补 `SIGMA_STAR`、`UPPER_STELLAR_TURNOVER_MASS`、`UPPER_STELLAR_TURNOVER_INDEX`、`M_TURN`（该量的工程一节就印这份名单）。
7. `docText.fstar.input/output`、`docText.phi_uv.input/output` 按新口径补参数名与产出。
8. 账本 `docs/notes/physics-chain/README.md` §一：把 `f*`（同一算法、代码多修正项 → 摘要给代码完整式）与 `φ(M_1500)`（两码事 → 以代码为准）写进那一条；`papers.md` 的两处标签注明「论文形式 / 代码形式」的分野。
9. 重新生成 `Graphify/src/generated/physics-chain.json` 与 67 篇模块文档，跑 `check:chain` / `check:copy`。

## Impact

- 真源数据（`chain.json`）+ 账本文档 + 生成物；**不改视图代码、不改 C 代码**。
- 受影响界面：`f*` 与 `φ(M_1500)` 的属性页摘要（LaTeX 公式换成代码表达式）、两者的模块文档物理一节、`φ(M_1500)` 在图上与检索里的名字与摘要、`f*` 工程一节的参数名名单。
- 规模不变（对象数、边数、块数、参数数、落点数都不动）。
- 规格面不变：主规格只要求「摘要公式逐字等于真源 `docText.formula`」与「物理一节不写代码标识」，两条在新数据上照旧成立；口径归属记在账本里，故本变更不带 spec delta。
