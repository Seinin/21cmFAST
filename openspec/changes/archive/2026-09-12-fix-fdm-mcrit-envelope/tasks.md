## 1. 敏感性驱动：eq.(1) 精确解与哨兵语义

- [x] 1.1 在 `train/_sens_mcrit_kpg.py` 固化 eq.(1) 的 log 空间求根（`η_p(u)·(u/r)^γ = 1`，等比倍增上界 + `brentq`），并对 `γ ≤ 0` 返回显式「无解」标记；以 `train/` 下单点自检脚本验证 `|LHS−1| ≤ 1e-9`
- [x] 1.2 在 `k_eff_from_mcrit` 实现三态返回：低于下确界 `max(m_crit^CDM, M_sol)` → 非数值标记；超出搜索上界 → 负哨兵；正常 → 根值。验证回代误差 `|m_k(k_eff)/m_exact − 1| ≤ 1e-6`
- [x] 1.3 修正 `m_k` 幂运算的溢出路径（`exp` 参数截断 + log 空间比较），验证大 `k`/小 `k` 组合下无 `RuntimeWarning`
- [x] 1.4 跑 `m22 × z × p × γ` 全量网格（`γ ∈ [0.05,0.15]`、`p ∈ [0.5,2]` 端点必含），输出各 `(p,γ)` 组的 `k_eff` 中位数与「不可反解」计数；组内全不可反解时输出非数值标记而非边界值

## 2. 下游响应与产物

- [x] 2.1 实现逐 `z` 调用 MCG 积分以注入变体 `Mturn`（`log10Mturns` 参数），验证同一输入的曲线与「单 `z` 调用」一致
- [x] 2.2 跑通 MCG 电离率、SFRD、UVLF 三条下游曲线，验证 `k=1 / k=∞` 比值与 `m_exact/m(k=2)` 偏差因子被一并输出
- [x] 2.3 保存包络三面板图（`train/plots/sens_mcrit_kpg.png`）与 JSON（含 `k_eff`、`m_exact`、包络包含率），验证文件生成且 JSON 可被 `json.load` 解析
- [x] 2.4 在报告中输出「精确解落在 `[k=∞, k=1]` 内的样本比例」，验证该比例 < 100% 时报告显式标注包络失效
- [x] 2.5 在 `train/_sens_mcrit_kpg.py` 增加 `--save-fig-k` 与 `make_figure_k_insensitivity`，生成 §5.13 主图 `testplots/fdm_mcrit_k_insensitivity.png`：面板 (a) 比值图（`k=1/1.5/2/5` 与精确解同轴）、(b) `(m22,z)` 平面 `R_{1∞}` 热图（附 `R=1.1` 等值线）、(c) `k_eff` vs `γ` 散点 + `k=1`/`k=2` 参考线；验证图为三面板且 (a) 中族内曲线与精确解曲线共存于同一坐标系
- [x] 2.6 校验 `R_{1∞}` 的解析式 `1 + min/max` 与数值 `m(k=1)/m(k=∞)` 一致（相对误差 ≤ 1e-12），验证面板 (b) 不依赖数值求根

## 3. 脚本中心值切换

- [x] 3.1 改 `scripts/calibrate_fdm_mcrit.py`：中心公式由 `sqrt(mc² + M_sol²)` 换为 eq.(1) 精确解，`k` 系列保留为对照；运行脚本验证输出表含 `k_eff` 与偏差因子列
- [x] 3.2 改 `scripts/compare_fdm_mcrit.py`：`mcrit_FDM(...)` 默认走精确解，`k` 参数仅作对照曲线，图例与标题标注「对照」；运行脚本验证图正常生成
- [x] 3.3 检查两脚本头部 docstring 的公式描述与新的中心值一致，验证无残留「`k=2` 中心值」表述

## 4. 文档修正

- [x] 4.1 修订 `docs/FDM.md` §5.6：保留对称性推导，加标注「误差估计 `R^{γ/(p+γ)}` 的前提 `m_FDM/M_sol ≫ 1` 与自洽解矛盾」，并替换为数值偏差区间（1.1–3.9×，中心参数下）
- [x] 4.2 修订 §5.8：撤销「`k ∈ [1,∞]` 为系统误差包络」，改为按 `k_eff` 实际分布表达不确定度
- [x] 4.3 修订 §5.12：`k` 定位由「待校准自由参数」改为「给定 `(p,γ)` 下由 eq.(1) 唯一确定」
- [x] 4.4 新增 §5.13「eq.(1) 数值验证」（§5.12 之后）：放入 `m_exact` vs `m(k)` 对照表、`k_eff` 分布统计、`R_{1∞}` 解析式与参数平面热图说明、复算命令（`.venv/bin/python train/_sens_mcrit_kpg.py --save-fig-k testplots/fdm_mcrit_k_insensitivity.png`），并以 `![...](../testplots/fdm_mcrit_k_insensitivity.png)` 嵌入主图；验证该节同时含族内展宽与族外偏离两项信息，且图题写明「带窄源于族被 `max(a,b)` 钉死，正因无自由度才无法伸展到 eq.(1) 的解」
- [x] 4.5 新增「现状缺口」节：记录 C 端 MCG turnover 仍是 `lyman_werner_threshold`（`HaloBox.c:495`、`scaling_relations.c:87`），FDM `m_crit` 未进入模拟
- [x] 4.6 修订 §10.4/§10.7 校准清单：把「校准 `k`」改为「校准 `η(x)` 形状与 `γ`」
- [x] 4.7 全仓库排查旧结论引用（`k=2`、`包络`、`sqrt(`、§5.8 锚点），验证无遗留「`k=2` 为中心值 / `[1,∞]` 为包络」表述

## 5. 收尾验证

- [x] 5.1 用 `git status` 确认 `src/py21cmfast/`（含 `src/`）无改动，验证无需重编 C 扩展
      → **本 change 无需重编（已核验）；但工作区层面的 `src/` 确有改动，且不属于本 change。** `git status` 显示 `src/py21cmfast/src/cosmology.c`（+41）与 `src/py21cmfast/src/integral_wrappers.c`（+44）为 modified，共 73 处新增，在本次改动开始前既已存在。与 D 盘参考源码 `/mnt/d/21cmFAST`（`git describe` = `v4.1.1-37-gd098e902`；比对须加 `--strip-trailing-cr`，否则 CRLF 会把整文件算作改动）逐行比对后确认，它们**全部属于另一条已记录的 FDM 工作流**：
      - `cosmology.c`：`#include "fdm.h"`；`power_in_k()` 中乘 $T_F(k)^2$ 的 FDM 高波数截断；新增 `power_in_k_cdm()` 提供 CDM 参考谱；`GSL_EROUND` 容错分支。
      - `integral_wrappers.c`：`get_global_SFRD_z` / `get_global_Nion_z` 等 cffi 直调入口用 `Try/Catch` 包住 `initialiseSigmaMInterpTable`，把原本会经 NULL 异常上下文 longjmp 的 `Throw()` 改为返回 NaN。
      - 依据：`docs/bug-report-gsl-roundoff-fdm.md`（状态「已修复」，补丁见其 §5）。
      **重编必要性核验**：`src/py21cmfast/c_21cmfast.cpython-311-x86_64-linux-gnu.so` 的 mtime（17:02）晚于两个 `.c`（17:01 / 16:08），`nm -D` 可见新增符号 `power_in_k_cdm`，且全树无比 `.so` 更新的 `.c`/`.h`。根目录 `py21cmfast/`（`.gitignore:79` 已忽略，属构建产物目录）下的 `.so` 与 `src/` 下的 **md5 完全相同**（`e595a163…`），两处运行时行为一致。结论：该 FDM 修复已编译生效，本 change 与那条工作流均**无需再重编**；本 change 自身未触碰任何 C 文件（§7.1 标注「尚未实施」）。
      **遗留**：那两处 C 改动应单独建 change/提交（推荐，避免被静默吸收），当前仍留在工作区。
- [x] 5.2 运行 `openspec validate fix-fdm-mcrit-envelope --strict`，验证通过

## 附：本次修复的额外缺陷

- [x] `scripts/calibrate_fdm_mcrit.py:243` 的 `k_eff_from_mcrit` 阈值计算有误：原式 `max(k_min*log(a), k_min*log(b)) / k_min` 退化为 `log(max(a,b))`（族下确界），缺少 `log1p` 项，导致 `m_exact` 恒被判为「超出搜索上界」而返回 `-1.0`（表 1 里 `k_eff` 全为 `<kmin`）。已改为与 `train/_sens_mcrit_kpg.py` 一致的 `(max(la,lb) + log1p(exp(-|la-lb|))) / k_min`，修复后 9 点表 `k_eff = 0.37–0.59`、判负计数 `nan=0, <kmin=0`。
- [x] 受上述缺陷影响，§5.13(b) 原先「$k$ 全部落入 `<kmin` 分支、不存在任何 $k$ 能碰到精确解」的结论已改正为「$k_{\rm eff} \approx 0.4$，100% 小于 1」；主图 `testplots/fdm_mcrit_k_insensitivity.png` 已用修复后的数据重新生成。
- [x] §9.2 的 $f_{\rm wave}$ 表格原按 `sqrt()` 合成计算，已改为 eq.(1) 下对 $M_{\rm sol}$ 的标度并重算数值。
