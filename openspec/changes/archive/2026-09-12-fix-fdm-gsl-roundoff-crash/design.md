## Context

动机见 `proposal.md - Why`。塑造本方案的技术事实（均见 `docs/bug-report-gsl-roundoff-fdm.md`）：

- `sigma(M)` 插值表以对数等距节点铺满 `[M_min, 1e20]`，FDM 下最左端节点落入 `T_F^2(k)` 造成的 `sigma^2(M)` 饱和区：`sigma^2` 从 `M=1e5` 到 `3.56e5` 仅由 `3.8568` 变到 `3.8566`，故斜率 `d(sigma^2)/dM` 从 CDM 的 `9.7e-05` 塌缩到 `7.8e-09`。
- GSL 的收敛判据为 `|ΔI| <= epsabs + epsrel·|I|`，本仓库取 `epsabs=0`、`epsrel=1e-6`，即**纯相对**判据。`|I|` 越小，索要的绝对精度越小：`rel_tol·|result| = 7.8e-15`，跌破求积法则自身舍入地板（实测 `error=3.51e-14`），GSL 返回 `GSL_EROUND`（值 `18`）。
- `exceptions.h` 的 `CATCH_GSL_ERROR` 触发条件是 `status > 0`，**不区分**错误码，故舍入受限与真失败被同一条路径处理。
- `Throw` 展开为 `longjmp(*the_exception_context->penv, 1)`：先解引用 `penv` 再跳转。`penv` 仅由 `Try` 赋值；`the_exception_context` 为静态零初始化，故无 `Try` 时 `penv == NULL`。
- `get_global_SFRD_z` / `get_global_Nion_z` 是 `cfuncs.py` 经 cffi **直接**调用的入口（`cfuncs.py:672` / `:702`），调用链上不存在 `Try`。
- 下游 `interp_tables.c:1185` 会对表值做 `isfinite` 检查并在失败时 `Throw(TableGenerationError)`；`interp_tables.c:1175` 取 `log10(-值)`。

## Goals / Non-Goals

**Goals:**

- FDM 宇宙学下全局积分入口（`evaluate_Nion_z` / `evaluate_SFRD_z`）不再段错误。
- 数值语义正确：`sigma(M) >= 0`、`d(sigma^2)/dM <= 0` 的定义域不变式在舍入干扰下仍成立。
- CDM 行为完全无操作（逐位一致）。
- 错误分流可审计：真失败仍按原路径报错，不被"容忍舍入受限"这一改动顺带掩盖。

**Non-Goals:**

- 不加固 bug 报告 §7 的 6 处同类入口（`get_sigma`、`get_halo_chmf_interval`、`get_conditional_FgtrM` / `_SFRD` / `_Nion` / `_Xray`）。
- 不改 GSL 参数（`epsabs` / `epsrel` / `GSL_INTEG_GAUSS61` / 工作区大小）。
- 不改 `CATCH_GSL_ERROR` 的全局语义（不触碰 `exceptions.h`）。
- 不让降级告警在默认构建下可见（不改 `LOG_LEVEL` 默认值）。
- 不推广到 `sigma_z0` / `dsigmasqdm_z0` 以外的积分函数。

## Decisions

### D1：在调用点分流 `GSL_EROUND`，而非放宽全局错误宏

`sigma_z0` 与 `dsigmasqdm_z0` 内改为 `if (status == GSL_EROUND) {...} else if (status != 0) {...}`，后者逐字保留原 `CATCH_GSL_ERROR` 路径与三行 `LOG_ERROR`。

**备选与否决理由：**

- *改 `exceptions.h` 让 `CATCH_GSL_ERROR` 忽略 `GSL_EROUND`*：影响所有调用者，且 `GSL_EROUND` 在别处可能确为真问题——把"某函数的正常工况"提升为全局豁免，会掩盖真实失败。
- *设置非零 `epsabs` 下限*：直接改变数值结果，破坏 CDM 逐位一致这一硬约束；且掩盖饱和区的真实物理。
- *把 `GSL_EROUND` 抛成更友好的异常*：饱和区节点**每次建表必命中**，异常化等于宣告 FDM 不可用。

### D2：钳位放在被调函数的返回值处，而非下游吸收

`sigma_z0` 返回 `sqrt(fmax(result, 0.0))`，`dsigmasqdm_z0` 返回 `-fabs(result)`。

**理由**：下游 `interp_tables.c` 的 `isfinite` 检查会把 `NaN` / `-inf` 升级为 `Throw(TableGenerationError)`——在那里吸收只是治标，还要把符号约定泄漏到表构建方。在源头钳位可保证定义域不变式，且对正常符号是**恒等操作**，从而使 CDM 零影响成为构造性结论而非经验结论。

### D3：异常边界加在 cffi 直调入口，而非表构建函数内部

`get_global_SFRD_z` / `get_global_Nion_z` 用 `Try initialiseSigmaMInterpTable(...); Catch(status) {...}` 包住建表调用（`Catch` 块内 `return` 合法，见 `cexcept.h:146-150`）。

**理由**：只有入口知道"该怎么降级"——该填哪些输出数组、填什么值；表构建函数不知道调用方语义。

**代价（已接受）**：每个入口需各自加固，故 §7 的 6 处仍为 latent 风险，本次显式记为后续项。

**备选与否决理由**：*在 `initialiseSigmaMInterpTable` 内部自处理* —— 与调用方语义耦合更深（报告 §5 已注明），且无法决定降级值。

### D4：降级值用 `NaN`，不用哨兵或异常

**理由**：调用方是 Python/numpy，`NaN` 天然可判读（`np.isnan`），无需新增协议或哨兵约定；且与"非有限值已会触发下游 `Throw`"这一既有约定方向一致——差别在于现在停在入口而非穿透进程。

### D5：降级日志用 `LOG_WARNING`，接受默认静默

**理由**：`GSL_EROUND` 不再走那 3 行 `LOG_ERROR`，否则 FDM 正常运行会被大量假 error 刷屏（报告 §3.3 顺带指出：若用 grep 过滤 `gsl integration error` 行再做统计，这些事件会被完全掩盖）。

**代价（已接受）**：`LOG_WARNING` 在默认 `LOG_LEVEL=1` 下被预处理掉（`logger.h:112-117` 要求 `>= 2`），故事件默认不可见，需 `LOG_LEVEL=2` 重建才能观测。

## Risks / Trade-offs

- **[接受 `GSL_EROUND` 可能掩盖别处真实舍入问题]** → 分流只作用于这两个函数，作用域最小化；真失败仍走原路径；回归要求 CDM 零降级（`Requirement: CDM 数值兼容性不得改变`）。
- **[`d(sigma^2)/dM` 真值恰为 0 时 `-fabs(0) = -0.0`，下游 `log10(-(-0.0)) = log10(0) = -inf` 仍会 `Throw`]** → 属既有显式失败路径，非本次引入；由入口的 `Catch` 转成 `NaN`。已在报告 §8 记录。
- **[§7 的 6 处入口在 FDM 下仍可崩溃]** → 显式记为后续项；报告已说明是否触发取决于各入口的最小源质量（红移越高、最小源质量越大，越可能避开饱和区）。
- **[钳位是否改动了 FDM 数值]** → FDM 此前直接崩溃，不存在可比基线；且实测命中点上 `result` 符号已正确，钳位为恒等操作，只在"舍入翻转符号"的边界情形生效。
- **[`.so` 未同步导致补丁看似无效]** → 构建流程强制 `build_cffi.py` + 复制 `.so` 到 `src/py21cmfast/`（脚本优先加载该路径）。

## Migration Plan

- **无需数据迁移**：FDM 路径此前不可用（进程崩溃）；CDM 逐位不变。
- **部署**：`.venv/bin/python build_cffi.py` 重建 → 复制新 `.so` 到 `src/py21cmfast/`。
- **回滚**：还原 `cosmology.c` 与 `integral_wrappers.c` 两个文件并重建。
- **验证**：以报告 §2 的最小复现为准——FDM 下由段错误转为返回数值；CDM 与变更前逐位比对。

## Open Questions

- 是否统一加固 §7 的 6 处同类入口（或在表构建内部自处理）——需另立 change，不影响本变更的规范与任务分解。
- 是否提供编译期开关让降级告警在默认构建下可见——属日志策略，与本变更的容错语义无关。
