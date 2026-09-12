## 1. 基线建立

- [x] 1.1 定位 FDM 引入边界 commit，确认 `d8f67b76` 为 FDM 前最后一个提交
- [x] 1.2 创建 git tag `baseline/pre-fdm` → `d8f67b76`
- [x] 1.3 验证基线纯净度（`FDM`/`m22`/`dndm_FDM`/`HMF_FINDEX` 零命中）
- [x] 1.4 输出 FDM 完整改动清单并区分「纯 FDM」与「混入的非 FDM」

## 2. 代码事实复核

- [x] 2.1 定位 fork 中 `EvaluateSigma` / `EvaluatedSigmasqdm` / `Sigma_InterpTable_CDM` / `dndm_FDM` / `conditional_hmf` 的全部引用点
- [x] 2.2 确认条件 HMF 的 sigma2 经 `EvaluateSigma` 退化为 CDM σ（`interp_tables.c:317/435/518/599/632/692/741`）
- [x] 2.3 复核论文 Eq.(5) 分子项 $\delta_{\rm FDM}$ 的来源（`cosmology.c:297-300`，ICs 含 $T_F$）

## 3. 审计报告

- [x] 3.1 编写 `docs/FDM_audit_report.md`：三方对照表、逐条裁决、论文 Eq.(2)–(5) 原文引用
- [x] 3.2 补证据索引（路径/行号/基准版本）与基线说明
- [x] 3.3 注明桌面 md 副本不同步风险
- [x] 3.4 记录 §6 数值复算结果（全部吻合）

## 4. 文档修订

- [x] 4.1 修订 `docs/FDM_hmf_design.md`：撤销「不能加 `dndm_FDM`」，补 Eq.(5) 三要素，标注「无公式」已过时
- [x] 4.2 修订 `docs/FDM_MCG_modeling.md`：撤回 σ mix bug 误判，标注方案 2 与 Eq.(5) 冲突，强化权威基准
- [x] 4.3 修订 `docs/FDM_cooling_report.md`：加审计报告交叉引用
- [x] 4.4 修订 `docs/FDM_mcrit_algorithm.md`：附录 A 加静态势模型不可用警告

## 5. 代码注释与脚本处置

- [x] 5.1 修正 `src/py21cmfast/src/fdm.c:47` 注释 high-mass cutoff → low-mass suppression
- [x] 5.2 给 `scripts/compute_fdm_mcrit.py` 加弃用头部警告

## 6. 数值交叉核对

- [x] 6.1 用 `.venv/bin/python scripts/calibrate_fdm_mcrit.py` 复算 `FDM_mcrit_algorithm.md` §6 表格
- [x] 6.2 记录复算结果——三张表逐项吻合，无误

## 7. 归档

- [x] 7.1 运行 `openspec validate` 确认变更完整
- [ ] 7.2 归档 change 至 `openspec/changes/archive/`
