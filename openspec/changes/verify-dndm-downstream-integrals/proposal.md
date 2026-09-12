## Why

P0 改动（`dndm_FDM` 接入条件 HMF，提交 `104a63f9`）把条件路径三要素改为 σ₁ = σ_CDM(m)、σ₂ = σ_FDM(M)、分子 = δc − δ_FDM，并去掉整体乘 f_FDM。该改动的**可观测后果落在下游产物上**：MCG 电离率 `evaluate_Nion_z`、SFRD `evaluate_SFRD_z`、UVLF `compute_luminosity_function(component="mcg")` 都以积分形式消费条件 HMF。

现状是"上游已证明、下游未验证"：

- HMF 层已证明与 Liu et al. 2025（PRD 112, 103534）一致，中位相对误差 3e-13（`train/_verify_*.py`）；
- 推进这条验证链时撞上 FDM `GSL_EROUND` → NULL 解引用段错误（`fix-fdm-gsl-roundoff-crash`），该修复又暴露 cffi 直调入口缺异常边界的结构性缺陷（`harden-remaining-cffi-entry-guards`）。两个前置已分别归档并入库（`4d16fa7c`、`90c673ed`）；
- 但"验证本身"仍未完成：现有证据只有占位级——FDM `m22=1, z=10` 单点 `nion_mini=1.3205360818e-08` 与四个条件入口的存活检查，没有曲线级、没有自洽性检查、没有 P0 前后对照；
- B 阶段的下游曲线证据全部躺在被 `.gitignore` 忽略的 `train/` 里，仓库内不可复现（这是最硬的缺口）。

为什么现在做：前置已清障、工作区已提交干净（git 可当对照实验的安全网），把 P0 改动的最后一个未闭环项做完，并让结论在仓库内可复现。

## What Changes

- 新增 `scripts/verify_dndm_downstream.py`：FDM 下按 z 网格调用 21cmFAST 自身的 `evaluate_Nion_z` / `evaluate_SFRD_z` / `compute_luminosity_function(component="mcg")` 出三条下游曲线，输出 JSON（可 `json.load`）+ 图。
- 新增**默认关闭**的 C 侧验证开关（旧条件路径：σ₂ 取 CDM σ，并乘 `dndm_FDM`），使 P0 前后两条路径能在**同一次构建**内切换对照；关闭时默认路径必须与引入前逐位一致。
- 加入自洽性断言：`∫ dndm_FDM dlnM` 归一化、UVLF 积分得到的 ρ_UV 与 SFRD 的一致性、Q(z) 配平。
- 量化 P0 前后下游偏移（m22 ∈ {0.1, 1, 10}），与 HMF 层已知的 σ₂ 差异量级（m22 ≥ 1 时 < 0.04%、m22 = 0.1 时 1.5%）对照；超出量级即标注需追查。
- 更新 `docs/FDM.md`：写入可复现脚本与结论，替代当前指向 `train/` 的引用。

无 **BREAKING**：开关默认关闭，默认数值路径与 Python API 签名均不变。

## Capabilities

### New Capabilities

- `fdm-downstream-verification`: FDM 下下游产物（MCG 电离率 / SFRD / UVLF）积分验证的能力契约——固定调用接口、P0 前后同构建对照开关的默认行为、自洽性断言、偏移量化的判据与产物格式。

### Modified Capabilities

（无。`fdm-integral-robustness` 与 `fdm-mcrit-model` 的 requirement 不变：本变更不改变默认数值行为，只增加默认关闭的验证开关与仓库内验证脚本。）

## Impact

- **C 源码**：`src/py21cmfast/src/hmf.c`（旧条件路径分支，默认关闭）、`src/py21cmfast/src/interp_tables.c`（旧路径的 σ 选择）；改动后需 `build_cffi.py` 重建并将新 `.so` 同步到 `src/py21cmfast/`。
- **脚本**：新增 `scripts/verify_dndm_downstream.py`；不改 `tests/`，不改 Python API 签名。
- **文档**：`docs/FDM.md`。
- **运行成本**：曲线级 FDM 验证含多次积分调用与一次重建，属慢速验证，不进 CI。
- **风险与缓解**：把验证开关写进产品代码 → 必须给出"默认路径逐位一致"的证据，复用现有 CDM 汇总 sha `abb32794530393dce3ed19c5048291ad` 作为回归锚点。
