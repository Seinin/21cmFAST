## 1. 确认既有改动与规范一致

> 说明：本变更的代码改动已存在于工作树（`git status` 显示 `src/py21cmfast/src/cosmology.c`、`src/py21cmfast/src/integral_wrappers.c` 已修改）。本节任务是把既有改动与 `specs/fdm-integral-robustness/spec.md` 逐条对齐，并确认**未改动路径与上游逐字一致**。判定基准为 D 盘参考源码 `/mnt/d/21cmFAST`（`git describe` = `v4.1.1-37-gd098e902`），取精确发布树用 `git -C /mnt/d/21cmFAST show v4.1.1:<路径>`。

- [x] 1.1 以 `git --no-pager diff --ignore-cr-at-eol` 读出两文件改动；确认 `sigma_z0` / `dsigmasqdm_z0` 已按 `status == GSL_EROUND` 与 `status != 0` 分流，且**非 `GSL_EROUND` 分支与 `git -C /mnt/d/21cmFAST show v4.1.1:src/py21cmfast/src/cosmology.c` 对应片段逐字一致**（对齐 `Requirement: 舍入受限必须与真实失败分流`）
- [x] 1.2 确认 `GSL_EROUND` 分支只输出 `LOG_WARNING`、不含任何 `LOG_ERROR`；对照 `exceptions.h:23` 确认 `CATCH_GSL_ERROR` 的触发条件仍为 `status > 0` 且未被本变更修改（对齐 `Scenario: 降级事件不得伪装为错误`）
- [x] 1.3 确认两处钳位为 `sqrt(fmax(result, 0.0))` 与 `-fabs(result)`；以正/负符号用例（含 `result = 0`）验证钳位在定义域内为恒等操作、在域外回钳且开方不产生非数（对齐 `Requirement: 积分结果的符号与定义域钳位`）
- [x] 1.4 确认 `get_global_SFRD_z` / `get_global_Nion_z` 的 `initialiseSigmaMInterpTable` 调用已包 `Try/Catch`，`Catch` 块内把该入口声明的**全部**输出数组（含 `out_sfrd_mini` / `out_nion_mini`）填 `NAN` 后 `return`，无遗漏元素；确认 `#include "cexcept.h"`、`#include "exceptions.h"` 已补入，且其余函数体与 v4.1.1 一致（对齐 `Requirement: cffi 直调入口以非数而非崩溃报告表构建失败`）

## 2. 重建与部署

- [x] 2.1 以默认日志级别重建：`.venv/bin/python build_cffi.py`，确认编译无错误、无新增告警
- [x] 2.2 把新 `.so` 同步到 `src/py21cmfast/`，并以校验和比对两处 `.so` 一致（脚本优先加载 `src/` 下的 `.so`，未同步则改动对脚本不生效）

## 3. 行为验证

- [x] 3.1 跑 `docs/bug-report-gsl-roundoff-fdm.md` §2 的最小复现：FDM（`m22=1`）、`z=10`、`M = mcrit_cdm(10)=9.084e5`，验证返回 `nion_mini ≈ 1.32053608e-08` 且**进程存活**（变更前为 `Segmentation fault`，对齐 `Scenario: FDM 下全局积分可正常调用`）
- [x] 3.2 CDM 对照：同调用在 `FDM=False` 下返回 `0.05335485`，并与变更前构建的返回值**逐位比对**一致（对齐 `Requirement: CDM 数值兼容性不得改变`）
- [x] 3.3 以 `LOG_LEVEL=2 .venv/bin/python build_cffi.py` 重建 + 同步 `.so`，在 FDM `m22=1`、`z=10` 下按 `roundoff-limited integral` 行计数，确认 `dsigmasqdm_z0` 命中（实测 `M=1.000000e+05`、`result=-7.828783e-09`、`error=3.511761e-14`）且 `sigma_z0` 命中 0 次；随后**恢复默认级别重建并再次同步 `.so`**，避免把调试构建留在原地
- [x] 3.4 同一（`LOG_LEVEL=2`）构建下确认 CDM 运行出现**零次**舍入受限降级，且 stderr 无 `gsl integration error occured!` 行（对齐 `Scenario: CDM 不触发降级`）

## 4. 文档与范围收口

- [x] 4.1 确认 `docs/bug-report-gsl-roundoff-fdm.md` 的 §5 补丁代码、§6 验证矩阵与 §9 行号速查表同实际改动一致（行号若因本次重建偏移需同步修正）
- [x] 4.2 确认 bug 报告 §7 的 6 处未加固入口（`get_sigma`、`get_halo_chmf_interval`、`get_conditional_FgtrM` / `_SFRD` / `_Nion` / `_Xray`）在本变更中**未**被声称已修复，且已作为后续项记录（对齐 `design.md` 的 Non-Goals 与 Open Questions）
- [x] 4.3 确认变更范围未越界：未修改 GSL 参数（`epsabs` / `epsrel` / `GSL_INTEG_GAUSS61`）、未修改 `exceptions.h`、未修改 `LOG_LEVEL` 默认值；`git --no-pager diff --stat` 仅含两个 C 文件

## 5. 规范校验

- [x] 5.1 运行 `openspec validate fix-fdm-gsl-roundoff-crash --strict`，验证通过
