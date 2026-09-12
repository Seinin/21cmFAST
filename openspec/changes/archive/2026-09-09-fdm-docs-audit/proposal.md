## Why

`docs/` 下两份 FDM 设计文档对同一问题给出相反建议，且均与代码现状脱节：

- `FDM_hmf_design.md` §3 主张「条件 HMF **不能**乘 `dndm_FDM`」
- `FDM_MCG_modeling.md` 方案 2 主张「**应该**乘 `dndm_FDM`」
- fork 实际代码（`hmf.c`，未提交）已按方案 2 改动

三者互相矛盾，且此前一轮审计因**误用重构版源码作为基准**得出过错误结论（误判 md 行号过时、误称 Liu 代码的「混合 σ」为 bug）。需要以 Liu+25 论文原文与 `D:\v21cmFAST` 原始源码为唯一事实基准重做裁决，避免后续 FDM 物理开发建立在错误前提上。

同时，本仓库此前**没有可用的 FDM 前基线**（FDM 内容全部为本仓库自行引入），导致无法区分「v4 原生 / 自有改动 / FDM 改动」。本次已通过 git 历史定位并固化基线（`baseline/pre-fdm` → `d8f67b76`）。

## What Changes

- **新增** `docs/FDM_audit_report.md`：审计报告，含「Liu 论文 / Liu 代码 / fork 现状」三方对照表、逐条裁决、论文 Eq.(2)–(5) 原文引用、证据索引、基线说明
- **修订** `docs/FDM_hmf_design.md`：撤销「条件 HMF 不能加 `dndm_FDM`」结论，补 Liu Eq.(5) 三要素，将「FDM 抑制如何随 δ 变化目前无公式」标注为过时
- **修订** `docs/FDM_MCG_modeling.md`：撤回附录 A.3「σ mix 是 bug」的误判（实为 Eq.(5) 要求），标注正文方案 2 与 Eq.(5) 冲突，强化 `D:\v21cmFAST` 为唯一权威基准
- **修订** `docs/FDM_cooling_report.md`：与审计报告交叉引用，避免重复论证
- **修订** `docs/FDM_mcrit_algorithm.md`：附录 A 加显著警告——静态势模型定量不可用
- **修正** `src/py21cmfast/src/fdm.c:47` 注释：high-mass cutoff → low-mass suppression（仅注释文字）
- **处置** `scripts/compute_fdm_mcrit.py`：加弃用头部警告

**不动任何物理公式**：`thermochem.c`、`hmf.c` 的数值逻辑一律不修改。

## Capabilities

### New Capabilities

无。本次为纯文档审计与注释修正，不引入新的 spec 级行为（已设 `skip_specs: true`）。

### Modified Capabilities

无。不改变任何现有能力的需求（`thermochem.c`、`hmf.c` 的数值逻辑保持不变）。

## Impact

- **文档**：`docs/FDM_*.md`（5 份，1 新增 4 修订）
- **代码**：仅 `src/py21cmfast/src/fdm.c` 第 47 行注释文字（无逻辑变更，无需重新编译 C 扩展）
- **脚本**：`scripts/compute_fdm_mcrit.py` 头部注释
- **基线**：git tag `baseline/pre-fdm` → `d8f67b76`（新增，供后续 FDM 审计/回归对比）
- **风险**：`/mnt/c/Users/zile/Desktop/` 存在 5 份 md 副本，与仓库内 `docs/` 可能不同步；本次只改仓库内 `docs/`
