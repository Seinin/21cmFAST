## Why

在 FDM 宇宙学下，构建 `sigma(M)` 插值表的最左端质量节点落在 `T_F(k)` 压制造成的**饱和区**：`sigma^2(M)` 几乎不随 `M` 变化，其斜率 `d(sigma^2)/dM` 从 CDM 的 `9.7e-05` 塌缩到 `7.8e-09`。GSL 的收敛判据是相对判据（`epsabs=0`、`epsrel=1e-6`），要求的绝对精度随之降到 `7.8e-15`，跌破求积法则自身的舍入地板（实测 `error=3.51e-14`），于是返回 `GSL_EROUND`。

旧实现把 `GSL_EROUND` 与真实失败一并交给 `CATCH_GSL_ERROR`（触发条件仅为 `status > 0`，不区分错误码），其 `Throw` 展开为 `longjmp(*the_exception_context->penv, 1)`。而 `get_global_SFRD_z` / `get_global_Nion_z` 是 Python 经 cffi **直接**调用的入口，调用链上没有任何 `Try`，`penv` 保持静态零初始化值 `NULL`，于是变成 `longjmp(*NULL, 1)` —— 进程级段错误，Python 侧 `try/except` 完全无从捕获。

后果：FDM 下任何走到全局积分的下游量（MCG 电离率、SFRD、UVLF）都会让整个解释器崩溃。这是本 fork 的 FDM 工作流的**阻塞性缺陷**。

**为什么现在做**：该修复已存在于工作树并经验证（`docs/bug-report-gsl-roundoff-fdm.md`，状态「已修复」），但从未进入任何 OpenSpec change，因而在 `fix-fdm-mcrit-envelope` 的收尾排查中被误判为「与 m_crit 无关的杂项改动」，多花了一轮才定位归属。本次将既有改动正式收口为可追溯的变更，并为其建立行为契约，避免后续同类入口（§7 的 6 处）重复踩坑。

## What Changes

- **`cosmology.c` 的 `sigma_z0` / `dsigmasqdm_z0`：把 `GSL_EROUND` 从"真失败"分流出来。** 命中 `GSL_EROUND` 时降级为警告并采用双精度下可得的**最佳估计**（该值仅作插值节点）；其余非零错误码路径与原实现逐字一致，仍走 `CATCH_GSL_ERROR`。
- **两处数值钳位**：`sigma_z0` 由 `sqrt(result)` 改为 `sqrt(fmax(result, 0.0))`（舍入可能把严格正的积分推成极小负数，开方得 NaN）；`dsigmasqdm_z0` 由 `result` 改为 `-fabs(result)`（`d(sigma^2)/dM < 0` 是构造性结论，且调用方取 `log10(-值)`，符号翻转会得 NaN）。
- **`integral_wrappers.c` 的两个 cffi 直调入口加异常边界**：`get_global_SFRD_z`、`get_global_Nion_z` 的 `initialiseSigmaMInterpTable` 调用包 `Try/Catch`，捕获时把输出数组填 `NAN` 并正常返回，让 Python 看到 NaN 而非崩溃；补 `#include "cexcept.h"`、`#include "exceptions.h"`。
- **告警语义调整**：`GSL_EROUND` 不再输出那 3 行 `LOG_ERROR`（否则 FDM 正常运行会被假 error 刷屏），改用 `LOG_WARNING`。注意默认 `LOG_LEVEL=1` 下 `LOG_WARNING` 被预处理掉，事件静默。

无 **BREAKING**：CDM 路径的两个钳位均为恒等操作，且 CDM 实测 0 次 roundoff，分流分支不进入；补丁前后同一 CDM 调用返回值逐位相同。

## Capabilities

### New Capabilities

- `fdm-integral-robustness`: FDM 功率谱压制区下 `sigma(M)` 积分表的容错语义——何为"舍入受限而非真失败"、如何降级、以及 cffi 直调入口在表构建失败时的异常边界与对调用方的可见行为（NaN 而非崩溃）。

### Modified Capabilities

（无。`fdm-mcrit-model` 的既有要求不因本变更改变。）

## Impact

**代码**
- `src/py21cmfast/src/cosmology.c`（`sigma_z0`、`dsigmasqdm_z0`）
- `src/py21cmfast/src/integral_wrappers.c`（`get_global_SFRD_z`、`get_global_Nion_z`）

**行为**
- FDM：`cfuncs.evaluate_SFRD_z` / `evaluate_Nion_z` 由段错误变为正常返回数值；表构建失败时返回 `NaN` 而非终止进程。
- CDM：数值逐位不变。

**构建与分发**
- 需 `.venv/bin/python build_cffi.py` 重建，并**必须**把新 `.so` 复制到 `src/py21cmfast/` 才对脚本生效（脚本优先加载 `src/` 下的 `.so`）。观察 roundoff 告警需 `LOG_LEVEL=2` 重建。

**不在本次范围**
- bug 报告 §7 的 6 处同类 cffi 直调入口（`get_sigma`、`get_halo_chmf_interval`、`get_conditional_FgtrM` / `_SFRD` / `_Nion` / `_Xray`）仍无异常边界；它们是否被触发取决于各自的最小源质量（红移越高越可能避开饱和区）。本次不加固，仅在设计文档中记录为后续项。
- 不改 `initialiseSigmaMInterpTable` 内部（与调用方语义耦合更深）。
- 不改变 `GSL_EROUND` 的判定阈值或 GSL 参数（`epsabs`/`epsrel`/`GSL_INTEG_GAUSS61`）。

**验证依据**
- `docs/bug-report-gsl-roundoff-fdm.md`（含最小复现、根因、实测数值表与验证矩阵）
