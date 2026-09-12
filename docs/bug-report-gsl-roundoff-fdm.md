# FDM 下 $I=\mathrm{d}\sigma^2/\mathrm{d}M$ 的舍入受限积分：`GSL_EROUND` → NULL 解引用 → 段错误

| 项       | 内容                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| 状态     | 已修复（§5）                                                                       |
| 组件     | `cosmology.c`、`integral_wrappers.c`                                            |
| 触发条件 | $\text{FDM} \wedge \text{USE\_INTERPOLATION\_TABLES}>0$，表左端 $M=10^5M_\odot$ |
| 严重性   | 进程级段错误，Python`try/except` 不可捕获                                         |

## 0. 符号

| 符号                                                                              | 含义（代码名）                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| $\sigma^2(M)$                                                                   | 密度涨落方差（`sigma_z0` 返回的是 $\sigma$，非 $\sigma^2$） |
| $I(M)$                                                                          | $\mathrm{d}\sigma^2/\mathrm{d}M<0$（`dsigmasqdm_z0`）         |
| $R(M)$、$W(x)$                                                                | 平滑半径、窗口（式 1、2）                                         |
| $P(k)$、$T_F(k)$                                                              | 线性功率谱、FDM 转移函数（式 6）                                  |
| $k_{1/2}$、$M_{1/2}$                                                          | $T_F(k_{1/2})=1/2$ 及其对应质量（`M0`）                       |
| $\epsilon_{\rm abs},\epsilon_{\rm rel}$                                         | 积分器容差$0,\ 10^{-6}$                                         |
| $\Delta I$、$\delta$ | 积分器自报误差、求积自身的舍入地板（$\sim10^{-14}$） |                                                                   |

## 1. 判据与结论

$$
R(M)=\left(\frac{3M}{4\pi\bar\rho}\right)^{1/3},\qquad \bar\rho=\Omega_m\rho_{\rm crit} \tag{1}
$$

$$
\sigma^2(M)=\frac{1}{2\pi^2}\int_0^\infty k^2P(k)\,W^2(kR)\,\mathrm{d}k \tag{2}
$$

$$
I=\int_0^\infty g(k)\,\mathrm{d}k,\qquad g(k)=\frac{k^2P(k)}{2\pi^2}\cdot 2W(x)\frac{\partial W}{\partial x}\cdot k\frac{\mathrm{d}R}{\mathrm{d}M},\quad x=kR \tag{3}
$$

GSL 收敛判据与它隐含的门槛：

$$
|\Delta I|\le\epsilon_{\rm abs}+\epsilon_{\rm rel}|I|,\quad \epsilon_{\rm abs}=0,\ \epsilon_{\rm rel}=10^{-6}
\quad\Longrightarrow\quad |I|\gtrsim\frac{\delta}{\epsilon_{\rm rel}}\approx10^{-8} \tag{4}
$$

| 宇宙学          | $|I|$               | $\epsilon_{\rm rel}|I|$ | $\Delta I$           | 判定                                                 |
| --------------- | --------------------- | ------------------------- | ---------------------- | ---------------------------------------------------- |
| CDM             | $9.70\times10^{-5}$ | $9.7\times10^{-11}$     | —                     | 通过                                                 |
| FDM             | $7.83\times10^{-9}$ | $7.8\times10^{-15}$     | $3.51\times10^{-14}$ | $\Delta I>\epsilon_{\rm rel}|I|$ → `GSL_EROUND` |
| FDM（同一节点） | $\sigma=3.857$      | $3.9\times10^{-6}$      | —                     | 通过（0 次命中）                                     |

**结论**：FDM 返回值的可认证相对精度为

$$
\frac{|\Delta I|}{|I|}=\frac{3.51\times10^{-14}}{7.83\times10^{-9}}=4.5\times10^{-6}\quad(\text{6 位有效数字})
$$

即 `GSL_EROUND` 只说明**未达到** $\epsilon_{\rm rel}=10^{-6}$（差 4.5 倍），不是 $I$ 的值无效。这一路（导数）与方差一路（$\sigma$）在 (4) 下被分开：$\epsilon_{\rm rel}|I|$ 随 $|I|$ 线性收缩，而 $\delta$ 不随 $|I|$ 变。

## 2. 为什么 FDM 必然：探测带被移出通带

$M$ 只通过 $R$ 进入 (2)，故导数只作用在 $W^2$ 上。两个被积量的权重：

$$
\text{权重}_{\sigma^2}=k^2P\,W^2,\qquad \text{权重}_{I}\propto k^3P\cdot 2W\frac{\partial W}{\partial x}
$$

$W\simeq1-\frac{x^2}{10}$（$x\ll1$）$\Rightarrow 2W\partial_xW\simeq-\frac{2x}{5}$：$\sigma^2$ 的权重在 $kR\ll1$ 处 $\to1$（宽频带 $k\lesssim1/R$），$I$ 的权重 $\propto(kR)^4\to0$——**$M$ 是通过 $R\propto M^{1/3}$ 把一条固定宽度的窄探测带沿 $k$ 平移**。实测（$M=10^5M_\odot$，真实 $P(k)$，权重分位）：

| 被积量       | 16% / 50% / 84% 分位$kR$ | 对应$k\ [\mathrm{Mpc}^{-1}]$ |
| ------------ | -------------------------- | ------------------------------ |
| $\sigma^2$ | $0.04/0.30/1.17$         | —                             |
| $I$        | $1.05/1.93/2.91$         | $124$–$228$               |

FDM 下 $P_{\rm FDM}=T_F^2P_{\rm CDM}$，而 $T_F^2(124\text{–}228)\lesssim10^{-21}$，于是探测带贡献被抹掉，$I$ 只剩逃逸带 $kR\ll1$（$k\approx2.3$–$3.6\,\mathrm{Mpc}^{-1}$，在 $k_{1/2}$ 之下）。在逃逸带内取 $W\simeq1-\frac{x^2}{10}$：

$$
g(k)\simeq-\frac{2}{5}\frac{k^4P(k)}{2\pi^2}\,R\frac{\mathrm{d}R}{\mathrm{d}M}
\quad\Longrightarrow\quad
I_{\rm esc}\simeq-\frac{R^2}{15\pi^2M}\int_0^{k_{1/2}}\!\!k^4P(k)\,\mathrm{d}k \tag{5}
$$

数值（$M=10^5M_\odot$，$1/R=118.1\,\mathrm{Mpc}^{-1}$，$\int_0^{5.078}k^4P\,\mathrm{d}k=1.505\times10^{3}$）：

$$
I_{\rm esc}=-7.29\times10^{-9}\quad\text{vs 代码 }-7.83\times10^{-9}\ (\text{差 }7\%)
$$

**无相消**：$\int|g|\,\mathrm{d}k\big/\big|\int g\,\mathrm{d}k\big|=1.000$（FDM）、$1.024$（CDM）。故 $I$ 小不是大数相减，而是权重 $(kR)^4$ 本身小——物理压制，非数值噪声。由 (5)，$I_{\rm esc}\propto R^2/M\propto M^{-1/3}$。

## 3. 质量依赖与 $M_{1/2}$

$$
T_F(k)=\frac{\cos\!\left(x^3\right)}{1+x^8},\qquad x=\frac{1.61\,m_{22}^{1/18}}{9\,m_{22}^{1/2}}\,k\propto m_{22}^{-4/9}k \tag{6}
$$

$$
T_F(x_{1/2})=\tfrac12\ \Rightarrow\ x_{1/2}=0.9084\ (\text{与 }m_{22}\text{ 无关})\ \Rightarrow\ k_{1/2}\propto m_{22}^{4/9}
\ \Rightarrow\ M_{1/2}\propto \bar\rho\,k_{1/2}^{-3}\propto m_{22}^{-4/3} \tag{7}
$$

归一化取 Schive+16 的 HMF 压制拟合 $M_{1/2}=1.6\times10^{10}m_{22}^{-4/3}M_\odot$；$m_{22}=1$ 时 $x$ 的系数给 $k_{1/2}=5.078\,\mathrm{Mpc}^{-1}$（数值求根）。$(7)$ 只定标度，归一化与 $k\leftrightarrow M$ 的换算约定（$R=1/k$ 还是 $\pi/k$）差 $\pi^3$ 量级。

抑制比随质量的变化（$I_{\rm FDM}$ 取闭式 (5)，$I_{\rm CDM}$ 取分瓣积分）：

| $M/M_\odot$ | $1/R\ [\mathrm{Mpc}^{-1}]$ | $I_{\rm FDM}$（式 5） | $I_{\rm CDM}$        | $|I_{\rm FDM}/I_{\rm CDM}|$ |
| ------------- | ---------------------------- | ----------------------- | ---------------------- | ----------------------------- |
| $10^{5}$    | 118.1                        | $-7.29\times10^{-9}$  | $-9.70\times10^{-5}$ | $7.5\times10^{-5}$          |
| $10^{6}$    | 54.8                         | $-3.38\times10^{-9}$  | $-8.15\times10^{-6}$ | $4.2\times10^{-4}$          |
| $10^{7}$    | 25.4                         | $-1.57\times10^{-9}$  | $-6.69\times10^{-7}$ | $2.4\times10^{-3}$          |
| $10^{8}$    | 11.8                         | $-7.29\times10^{-10}$ | $-5.34\times10^{-8}$ | $1.4\times10^{-2}$          |
| $10^{9}$    | 5.48                         | $-3.38\times10^{-10}$ | $-4.12\times10^{-9}$ | $8.2\times10^{-2}$          |

$M$ 越小，$1/R$ 越高、离 $k_{1/2}$ 越远、抑制比越低，式 (4) 越容易被违反 ⇒ 命中的是表左端的少数节点（本复现 $M=10^5M_\odot=M_{\min}$）。

注：(4) 中的 $\delta$ 是求积法则对被积核自身的舍入地板，随 $M$ 变化，故 (4) 只作量级判据；实测命中的是 $M$ 最小的若干节点（§6）。

## 4. 结构层：为什么 `GSL_EROUND` 升级为段错误

$$
\underbrace{\text{status}=18>0}_{\texttt{exceptions.h:23}}\Rightarrow\texttt{CATCH\_GSL\_ERROR}\Rightarrow\texttt{Throw}\Rightarrow\texttt{longjmp}\big(\ast\texttt{penv},\,1\big),\qquad
\texttt{penv}\Big|_{\text{无 }\texttt{Try}}=\texttt{NULL}\ (\text{静态零初始化}) \tag{8}
$$

三点事实：

1. 触发条件只有 $\text{status}>0$，故 (4) 意义上的"容差不可达"与真失败不可分。
2. `penv` 只由 `Try` 赋值（`cexcept.h:211/242`，`debugging.c`）；cffi 直调链上没有 `Try` ⇒ $\ast\texttt{NULL}$ 先被解引用 ⇒ 段错误。
3. 崩溃在 C 层，Python 无 `try/except` 机会。

## 5. 修复

| 对象                | 补丁前                        | 补丁后                                                                          | 数学理由                                                                                     |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `status`          | $\ne0\Rightarrow$ `Throw` | $=\texttt{GSL\_EROUND}\Rightarrow$ 告警并接受；其余 $\Rightarrow$ `Throw` | (4)：ERROUND$\Leftrightarrow\Delta I>\epsilon_{\rm rel}|I|$，是容差不可达，不是 $I$ 无效 |
| $\sigma^2$ 返回前 | $\sqrt{r}$                  | $\sqrt{\max(r,0)}$                                                            | 舍入可把$\sigma^2>0$ 推成 $r=-\epsilon<0$，$\sqrt{r}$ 无定义                           |
| $I$ 返回前        | $r$                         | $-\lvert r\rvert$                                                             | 由 (3) 及$W$ 单调段 $I<0$ 为构造性结论；调用方取 $\log_{10}(-I)$                       |
| 建表入口            | 无守卫                        | `Try/Catch` ⇒ 输出填 `NaN`、正常返回（日志带异常类型）                              | 消除 (8) 中的$\texttt{penv}=\texttt{NULL}$ 分支                                            |

为何不抛更友好的异常：$M<M_{1/2}$ 的节点每次建表都命中（式 7），属 FDM 正常工况；异常化等于禁用 FDM。

日志可见性：`LOG_WARNING` 需 $\texttt{LOG\_LEVEL}\ge2$（`build_cffi.py:74` 默认 1），故 (5) 的告警默认静默；补丁同时使 `GSL_EROUND` 不再走 `LOG_ERROR`。

## 6. 验证

| 场景                      | roundoff 事件              | `nion_mini(z=10, M=9.084e5)` | 进程               |
| ------------------------- | -------------------------- | ------------------------------ | ------------------ |
| 纯 CDM（`FDM=False`）   | 0                          | 0.05335485                     | 正常               |
| FDM（$m_{22}=1$）补丁前 | —                         | —                             | Segmentation fault |
| FDM（$m_{22}=1$）补丁后 | 1（容忍，无`LOG_ERROR`） | $1.32053608\times10^{-8}$    | 正常               |

- 命中节点（`LOG_LEVEL=2`）：`dsigmasqdm_z0` at $M=1.0\times10^5$，$result=-7.828783\times10^{-9}$，$error=3.511761\times10^{-14}$；同运行中 `sigma_z0` 命中 0 次，与 (4) 中 $3.9\times10^{-6}\gg7.8\times10^{-15}$ 一致。
- 区间性：$M=1.0,1.41,2.24\times10^5$ 等左端若干节点均命中，与 §3 表抑制比单调上升一致。
- CDM 不变：CDM 下 $\max(r,0)$、$-\lvert r\rvert$ 均为恒等映射（$r$ 符号恒定），且 CDM 0 次命中 ⇒ 补丁不改变任何 CDM 数值。
- 交叉印证：$1.32\times10^{-8}/0.0534=2.5\times10^{-7}$，与 $M/M_{1/2}=9.08\times10^5/1.6\times10^{10}=5.7\times10^{-5}$ 同处强压制区。

## 7. 同类落点：已加固

「(8) 中无 `Try`」是结构性隐患。同一缺陷类别在 `integral_wrappers.c` 的其余入口上已全部加固（函数级 `Try` / `Catch(status)`，失败时把声明的全部输出填非数并记 `LOG_ERROR`）：

| 函数                            | 定义行 | 守卫行 |
| ------------------------------- | ------ | ------ |
| `get_sigma`                   | :20    | :25    |
| `get_condition_integrals`     | :58    | :64    |
| `get_halo_chmf_interval`      | :97    | :103   |
| `get_halomass_at_probability` | :141   | :147   |
| `get_global_SFRD_z`           | :175   | :191   |
| `get_global_Nion_z`           | :227   | :237   |
| `get_conditional_FgtrM`       | :270   | :276   |
| `get_conditional_SFRD`        | :321   | :327   |
| `get_conditional_Nion`        | :382   | :389   |
| `get_conditional_Xray`        | :457   | :463   |

前四个与后四个的守卫由后续变更 `harden-remaining-cffi-entry-guards` 引入，后加的两个入口（`get_condition_integrals` / `get_halomass_at_probability`）来自 §2 表的「其余 cffi 直调建表入口」；`get_global_SFRD_z` / `get_global_Nion_z` 的建表级守卫来自本报告对应的前一变更。这 10 个即为 `integral_wrappers.c` 的全部顶层 `lib.*` 入口。

触发条件仍是 §6 的 GSL 舍入路径，是否命中取决于各自最小源质量对应的 $1/R$ 与 $k_{1/2}$ 之比；差别只在于现在表现为**输出非数**而不是段错误。

验证：CDM 下这 10 个入口（含 cat / grid 两种条件模式，共 10 组调用）逐位回归与加固前完全一致；故障注入（临时在 `initialiseSigmaMInterpTable` 开头 `Throw`）下每个入口的每个输出数组 100% 为非数、进程存活。

## 8. 已知限制

- $M_{\min}=10^5M_\odot$ 下 $|\Delta I|/|I|=4.5\times10^{-6}$：接受该估计意味着 $I$ 有 $\sim5\times10^{-6}$ 的相对误差，经 $\mathrm{d}\ln\sigma^2/\mathrm{d}\ln M$ 传入 HMF，远低于模型自身不确定度。
- $I\equiv0$ 的边界情形：返回 $-0.0$ ⇒ $\log_{10}(0)=-\infty$ ⇒ 触发既有的 `isfinite` 失败路径（非本次引入；补丁的 `Catch` 会转成 `NaN`）。
- §7 的 10 个入口曾长期未加固，现已由后续变更补齐（见 §7）；其非数降级语义与 §4 相同。

## 9. 速查

| 位置                                 | 内容                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `cosmology.c:398` / `:469`       | `sigma_z0` / `dsigmasqdm_z0`                                |
| `cosmology.c:421` / `:492`       | 新增`GSL_EROUND` 分流                                         |
| `cosmology.c:451` / `:516`       | 钳位$\sqrt{\max(r,0)}$ / $-\lvert r\rvert$                  |
| `integral_wrappers.c:25`–`:463`     | 10 个顶层入口的函数级 `Try/Catch` 守卫（`get_global_SFRD_z` / `get_global_Nion_z` 仍为建表级）              |
| `interp_tables.c:1143` / `:1188` | `initialiseSigmaMInterpTable` / 非有限值 `Throw`            |
| `fdm.c:35` / `:54`               | $T_F(k)$ / `dndm_FDM`（常数 $M_0=M_{1/2}$）               |
| `exceptions.h:23`                  | `CATCH_GSL_ERROR`（条件 $\text{status}>0$）                 |
| `cexcept.h:211` / `:242`         | `Try` / `Throw`                                             |
| `debugging.c:22`                   | `the_exception_context[1]`（$\texttt{penv}=\texttt{NULL}$） |
| `cfuncs.py:534`                    | `_validate_redshift_prev`（Python 侧 `redshift_prev` 顺序校验，3 处调用点） |
| `cfuncs.py:691` / `:721`         | `get_global_SFRD_z` / `get_global_Nion_z` 直调              |

复现：`.venv/bin/python -c "import sys; sys.path.insert(0,'train'); from _sens_mcrit_kpg import build_inputs, mcrit_cdm, nion_mcg; print(nion_mcg(build_inputs(True,1.0), [10.0], [mcrit_cdm(10.0)]))"`（补丁前段错误，补丁后 `1.32053608e-08`）。

复算：`.venv/bin/python build_cffi.py && cp -p py21cmfast/*.so src/py21cmfast/`（观察告警加 `LOG_LEVEL=2`）。
