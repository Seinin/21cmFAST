## Why

上一个变更（`fix-fdm-gsl-roundoff-crash`，已归档）只在 `get_global_SFRD_z` / `get_global_Nion_z` 两个入口建立了异常边界，并在 `integral_wrappers.c:124-125` 留下 NOTE：同一文件里其余 cffi 直调入口仍然是"没有异常处理活动上下文 + 内部会建表"的组合。

这些入口**只被 `wrapper/cfuncs.py` 通过 cffi 调用**（已核查：C 源码内无内部调用者），所以"边界不存在"这件事无法靠外层补救——崩溃点就落在 Python 与 C 的交界上。一旦内部的建表调用 `Throw`，异常会 longjmp 穿过 NULL 异常上下文，把宿主 Python 进程打崩，机制与 `docs/bug-report-gsl-roundoff-fdm.md` 记录的一致。

## What Changes

1. 为 `src/py21cmfast/src/integral_wrappers.c` 中**剩余的 8 个 cffi 直调入口**建立异常边界：函数体整体置于 `Try` / `Catch`，捕获后把本调用声明的**全部**输出数组填 `NAN`、以 `LOG_ERROR` 记录入口名与异常类型、正常返回。
   - 用户点名的 6 个：`get_sigma`、`get_halo_chmf_interval`、`get_conditional_FgtrM`、`get_conditional_SFRD`、`get_conditional_Nion`、`get_conditional_Xray`。
   - 同类补充 2 个（暴露机制完全相同：均经 `stoc_set_consts_z` 建表且该函数自身会 `Throw`）：`get_condition_integrals`、`get_halomass_at_probability`。这样"本文件所有 cffi 直调入口都有边界"成为可机械核查的完备性质，而不是又留一条"以后再修"的尾巴。若只想做 6 个，删掉这 2 处的守卫即可，其余工件不受影响。
2. 守卫范围取"整个函数体"而非"只包住建表那一行"：这 8 个入口内部的建表调用不止一处（`initialiseSigmaMInterpTable`、`InitialiseSigmaInverseTable`、`initialise_dNdM_tables`、`initialise_dNdM_inverse_table`、`initialise_J_split_table`、`initialise_GL`、`initialise_FgtrM_delta_table`、`initialise_SFRD_Conditional_table`、`initialise_Nion_Conditional_spline`、`initialise_Xray_Conditional_table`），逐点包会漏；整体包住才闭合。已归档的两处保持原样（已验收，不回头改动）。
3. 在 Python 侧补回"输入校验错误"的可见性：`integrate_condition` / `integrate_chmf_interval` 把 `redshift_prev` 原样透传给 `stoc_set_consts_z`，后者在 `redshift_desc > 0 && redshift < redshift_desc` 时 `Throw(ValueError)`。加固后该错误会被兜底吞成静默非数，因此这两个包装函数 SHALL 在 Python 层先行校验并 `raise ValueError`（沿用文件内既有的 shape 校验风格）。这样"建表失败→非数"与"参数非法→异常"两类失败保持可分流。
4. 更新过时注释：删除 `integral_wrappers.c:124-125` 的 NOTE，改为记录本文件入口的边界已完备。

**不改变**：正常路径（CDM 与 FDM）的数值结果、输出数组契约（调用方仍拿到 numpy 数组）、`get_global_*` 两处已归档的行为、以及 cffi 函数签名（输出仍走指针参数）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `fdm-integral-robustness`: 把"cffi 直调入口以非数而非崩溃报告表构建失败"从"全局积分入口（原文只描述 `sigma(M)` 表构建）"扩展为"`integral_wrappers.c` 全部 cffi 直调入口、覆盖函数体内任意位置的建表异常"，并新增两条要求：异常边界的**完备性**、以及**输入校验错误仍以异常上报**。

## Impact

- `src/py21cmfast/src/integral_wrappers.c`：8 个入口加 `Try`/`Catch`；`get_global_SFRD_z` / `get_global_Nion_z` 的 NOTE 注释更新。
- `src/py21cmfast/wrapper/cfuncs.py`：`integrate_condition`、`integrate_chmf_interval` 增加 `redshift_prev` 校验。
- 构建：需重新跑 `build_cffi.py`，并把新的 `.so` 同步到 `src/py21cmfast/`（脚本执行时优先命中该目录）。
- 无新依赖；不改异常类型；不改 Python 公开 API 签名。
- 仍在本次范围之外、但属同一崩溃机制的已知点（记录备查）：`wrapper/cfuncs.py:95` 在 `init_backend_ps` 包装器里**直接**通过 cffi 调用 `lib.initialiseSigmaMInterpTable(...)`——那是"Python 直调建表函数"，不是积分入口，本变更不处理。
- 核查触发条件时发现的**另一类**缺陷（本变更不处理，仅记录）：`EvaluateRGTable1D_f`（`interpolation.c:123`）对越界 `x` 不做检查而直接下标取值，所以"用户传入越出插值表定义域的值"会越界读内存而**不会**抛异常——异常边界无法覆盖这一类，需后续单独评估。
