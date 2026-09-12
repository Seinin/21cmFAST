## 1. C 端：为 8 个入口建立函数级异常边界

> 统一写法：在函数体最外层加 `int status;` + `Try { <原函数体> } Catch(status) { LOG_ERROR("<入口名>: ... (exception type %d); returning NaN", status); <把本入口全部输出填 NAN>; return; }`。
> 硬性约束（design D3）：`Catch` 内**只**允许使用 `status` 与形参（各 `n_*` 与输出指针）；不得读取函数体内被赋值的局部变量（longjmp 后取值不确定）。
> `math.h`、`cexcept.h`、`exceptions.h` 已在本文件 include，无需新增。

- [x] 1.1 `get_sigma`（原 20-31 行）：包住整个函数体；`Catch` 内把 `sigma_out[i]`、`dsigmasqdm_out[i]`（`i < n_masses`）填 `NAN`
- [x] 1.2 `get_condition_integrals`（原 43-59 行）：包住整个函数体；`Catch` 内把 `out_n_exp[i]`、`out_m_exp[i]`（`i < n_conditions`）填 `NAN`（覆盖 `stoc_set_consts_z` 的建表与参数异常）
- [x] 1.3 `get_halo_chmf_interval`（原 64-91 行）：包住整个函数体；`Catch` 内把 `out_n` 的 `n_conditions * n_masslim` 个元素全部填 `NAN`（按连续下标填充，注意与正常路径的 `i * n_masslim + j` 展平一致）
- [x] 1.4 `get_halomass_at_probability`（原 93-110 行）：包住整个函数体；`Catch` 内把 `out_mass[i]`（`i < n_conditions`）填 `NAN`
- [x] 1.5 `get_conditional_FgtrM`（原 206-238 行）：包住整个函数体；`Catch` 内把 `out_fcoll[i]`、`out_dfcoll[i]`（`i < n_densities`）填 `NAN`
- [x] 1.6 `get_conditional_SFRD`（原 240-280 行）：包住整个函数体；`Catch` 内把 `out_sfrd[i]`、`out_sfrd_mini[i]`（`i < n_densities`）填 `NAN`（`mini` 变体无论 `USE_MINI_HALOS` 是否开启都填，与已归档契约一致）
- [x] 1.7 `get_conditional_Nion`（原 282-336 行）：包住整个函数体；`Catch` 内把 `out_nion[i]`、`out_nion_mini[i]`（`i < n_densities`）填 `NAN`
- [x] 1.8 `get_conditional_Xray`（原 338-373 行）：包住整个函数体；`Catch` 内把 `out_xray[i]`（`i < n_densities`）填 `NAN`
- [x] 1.9 更新过期注释：把 124-125 行的 NOTE（列举"待修入口"）替换为"本文件内 cffi 直调入口均已建立异常边界"，避免注释与代码状态不符
- [x] 1.10 核对：8 个入口的 `Catch` 块均未引用任何在函数体内被赋值的局部变量；`get_global_SFRD_z` / `get_global_Nion_z` 未被改动（`git --no-pager diff` 中只有本次新增的守卫）

## 2. Python 端：非法 `redshift_prev` 前置校验

- [x] 2.1 新增 `_validate_redshift_prev(redshift, redshift_prev)` 辅助函数，并接入 `evaluate_condition_integrals`（`lib.get_condition_integrals(` 调用前）：当 `redshift_prev is not None and redshift_prev > 0 and redshift_prev > redshift` 时 `raise ValueError`（判定与 C 端 `Stochasticity.c:80` 逐字对应，不收紧相等取值）
- [x] 2.2 接入 `integrate_chmf_interval`（`lib.get_halo_chmf_interval(` 调用前，与既有 shape 校验并列）
- [x] 2.3 补检遗漏点：`evaluate_inverse_table`（同样把用户 `redshift_prev` 透传给 `lib.get_halomass_at_probability(`，但用的是 `if redshift_prev is None: redshift_prev = -1` 写法，初版清单漏检）→ 同样接入校验，并同步更新 spec 与 design D5

## 3. 重建与部署

- [x] 3.1 以默认日志级别重建：`.venv/bin/python build_cffi.py`，确认无编译错误、无新增告警
- [x] 3.2 把新 `.so` 同步到 `src/py21cmfast/`，并用校验和比对两处一致（脚本优先加载 `src/` 下的 `.so`）

## 4. 验证：异常边界确实生效

- [x] 4.1 **真实输入向量（确定性，可长期回归）**：绕过 Python 校验、直接经 cffi 调用 `lib.get_condition_integrals(redshift=5, redshift_desc=10, ...)`（即 `z_prev > z`），确认 `stoc_set_consts_z` 的 `Throw(ValueError)` 被边界捕获：进程存活、返回值全为非数、日志出现入口名与异常类型编号。对 `lib.get_halo_chmf_interval`、`lib.get_halomass_at_probability` 做同样调用（变更前这三者均为进程崩溃）
- [x] 4.2 **系统性向量（临时故障注入）**：临时在 `initialiseSigmaMInterpTable` 开头插入 `Throw(TableGenerationError);`，重建 + 同步后**逐个**调用 8 个入口（经 `cfuncs.py` 包装），确认每个入口都返回"声明的每个输出数组全部为非数"且进程存活；验证后**回滚注入**（`git checkout -- src/py21cmfast/src/interp_tables.c`）、重建并再次同步 `.so`，并以 `git --no-pager diff --stat` 确认注入未残留
- [x] 4.3 覆盖核对：4.2 中对 8 个入口逐一断言 `np.isnan(out).all()`（含 `out_sfrd_mini` / `out_nion_mini`），确认无输出数组留有未写入元素（`== 0.0` 的残留即未写入）
- [x] 4.4 校验向量：`evaluate_condition_integrals` / `integrate_chmf_interval` / `evaluate_inverse_table` 传入"为正且晚于 `redshift`"的 `redshift_prev` 时抛 `ValueError`，且进程存活、不返回非数数组；`redshift_prev == redshift` 与缺省值仍按原行为放行

## 5. 验证：正常路径无回归

- [x] 5.1 CDM 逐位比对：在变更前/变更后两个构建下调用 8 个入口（典型参数），确认返回值逐位相同（不设容差）
- [x] 5.2 FDM 全局入口沿用 `docs/bug-report-gsl-roundoff-fdm.md` §2 的最小复现（`m22=1`、`z=10`、`M = mcrit_cdm(10)=9.084e5`）：确认 `nion_mini ≈ 1.32053608e-08`、进程存活、无非数
- [x] 5.3 FDM 条件入口：在 FDM `m22=1` 下调用 `get_conditional_FgtrM` / `_SFRD` / `_Nion` / `_Xray`，确认正常返回数值数组（无崩溃、无异常非数）
- [x] 5.4 合法 `redshift_prev`（`redshift_prev < redshift`）下 `integrate_condition` / `integrate_chmf_interval` 返回值与变更前逐位一致（对齐 `Scenario: 合法 redshift_prev 不受影响`）

## 6. 边界完备性核查

- [x] 6.1 机械核查：对 `integral_wrappers.c` 中每个 cffi 直调入口（10 个）逐一确认存在覆盖整个函数体的 `Try`/`Catch`，且 `Catch` 内填充了该入口声明的全部输出数组；确认无可抛异常的建表调用落在边界之外（含已归档两处）
- [x] 6.2 交叉核查入口清单：以 `grep -o "lib\.[a-zA-Z_]*( wrapper/cfuncs.py"` 去重结果与 `integral_wrappers.c` 的顶层函数定义比对，确认本文件内所有 cffi 直调入口均已加固

## 7. 收尾

- [x] 7.1 记录旁路发现（不修，仅记录）：`EvaluateRGTable1D_f` 对越界输入无检查而直接下标访问，因此"输入越出插值表定义域"会越界读而非抛异常——这属于与本次不同的缺陷类别，写入 `design.md` 的 Open Questions
- [x] 7.2 确认改动范围：`git --no-pager diff --stat` 仅含 `integral_wrappers.c` 与 `cfuncs.py`；未改 cffi 签名、未改 `exceptions.h`、未改 GSL 参数
- [x] 7.3 运行 `openspec validate harden-remaining-cffi-entry-guards --strict`，验证通过
- [x] 7.4 同步 `docs/bug-report-gsl-roundoff-fdm.md`：§7「未修的同类落点」所列入口已被本变更修复，需更新为已修状态（并补记 `get_condition_integrals` / `get_halomass_at_probability` 这两个经 `stoc_set_consts_z` 暴露的同类入口），避免文档声称仍未修。此项为实现期间发现的文档一致性问题，已显式列入而非静默吸收
