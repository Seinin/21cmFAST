## Purpose

定义 FDM 分子冷却阈值 `m_crit^FDM` 的中心估计、不确定度表达与参数敏感性报告的行为契约，使该量的取值由隐式方程 (1) 自洽决定，而不是由一个不含真值的参数族任意取值。

## Requirements

### Requirement: 中心估计必须自洽满足隐式方程 (1)

`m_crit^FDM` 的中心估计 SHALL 是隐式方程 (1) `η_p(u) · (u/r)^γ = 1`（`u = m_crit^FDM/M_sol`，`r = m_crit^CDM/M_sol`，`η_p(x) = x^p/(1+x^p)`）的解，且回代残差相对误差 MUST ≤ 1e-9。

#### Scenario: 残差检验

- **WHEN** 对给定 `(m22, z, p, γ)` 计算中心估计
- **THEN** 将其代回 eq.(1) 的左端，`|LHS - 1|` MUST ≤ 1e-9

#### Scenario: gamma 退化输入

- **WHEN** 输入 `γ ≤ 0`
- **THEN** 系统 SHALL 显式报告「该参数下 eq.(1) 退化、无解」，而不是返回任一数值

### Requirement: 参数族近似必须做可表示性检查

当使用 `m_k = [(m_crit^CDM)^k + M_sol^k]^(1/k)` 族作为 eq.(1) 的近似或不确定度包络时，系统 SHALL 检查精确解是否落在该族可表示范围内——该族在 `k` 上单调递减，下确界为 `max(m_crit^CDM, M_sol)`。

#### Scenario: 精确解低于族下确界

- **WHEN** `m_exact ≤ max(m_crit^CDM, M_sol)`
- **THEN** 系统 SHALL 标记该样本为「低于包络下限」，MUST NOT 返回下确界作为 `k_eff`

#### Scenario: 反解 k_eff 的回代校验

- **WHEN** 反解出 `k_eff` 使 `m_k(k_eff) = m_exact`
- **THEN** 回代 `m_k(k_eff)` 与 `m_exact` 的相对误差 MUST ≤ 1e-6

### Requirement: 不确定度不得用不含解的参数族表达

当 `k ∈ [1, ∞]` 不包含 eq.(1) 的解时，系统 SHALL 报告实际 `k_eff` 与偏差因子 `m_exact / m(k=2)`，MUST NOT 将 `[k=1, k=∞]` 区间表述为覆盖真值的包络。

#### Scenario: 报告包络包含率

- **WHEN** 生成敏感性报告
- **THEN** 报告 SHALL 给出「精确解落在 `[k=∞, k=1]` 内」的样本比例，并在该比例低于 100% 时明确标注包络失效

#### Scenario: k_eff 低于 1

- **WHEN** 存在样本的 `k_eff < 1`
- **THEN** 报告 SHALL 指出「`k=2` 中心值在此参数点低估 `m_crit^FDM`」，并给出低估倍数

### Requirement: 参数敏感性报告

系统 SHALL 报告 `k_eff`（或「不可反解」标记）随 `γ`、`p`、`m22`、`z` 的依赖，`γ` 与 `p` 的取值范围 MUST 至少覆盖文档给出的先验区间（`γ ∈ [0.05, 0.15]`、`p ∈ [0.5, 2]`）。

#### Scenario: 逐组统计

- **WHEN** 按 `(p, γ)` 分组统计
- **THEN** 每组 SHALL 输出 `k_eff` 中位数；若该组全部样本不可反解，SHALL 输出非数值标记而非边界值

#### Scenario: 覆盖先验区间

- **WHEN** 扫描参数
- **THEN** `γ` 与 `p` 的取值集合 MUST 覆盖 `[0.05, 0.15]` 与 `[0.5, 2]` 的端点

### Requirement: 下游响应必须经 21cmFAST 自身 Mturn 接口注入

把 `m_crit^FDM` 传播到下游量（MCG 电离光子发射率、SFRD、UVLF）时，系统 SHALL 通过 21cmFAST 自身的 turnover-mass 接口注入，MUST NOT 另实现一份下游积分或光度函数。

#### Scenario: 使用上游 C 积分

- **WHEN** 计算下游 MCG 曲线
- **THEN** 结果 SHALL 来自 21cmFAST 的全局积分与光度函数接口，且不同 `m_crit` 变体之间除该 turnover 外无其他输入差异

### Requirement: 验证材料必须成对呈现族内展宽与族外偏离

关于该参数族的验证材料 SHALL 同时给出 (i) 族内因 `k` 变化产生的展宽，与 (ii) eq.(1) 精确解相对该族的偏离；MUST NOT 仅呈现展宽，以免暗示该族可用。展宽 SHALL 以比值形式（相对 `m(k=∞)`）表达，并 SHALL 给出其解析式 `R_{1∞} = 1 + min(m_crit^CDM, M_sol)/max(m_crit^CDM, M_sol) ∈ (1, 2]`。

#### Scenario: 验证主图的信息完整性

- **WHEN** 生成验证主图
- **THEN** 同一图内 SHALL 同时包含 `k` 族曲线（或比值曲线）与 eq.(1) 精确解曲线，且图题 SHALL 说明「族内展宽小」与「解在族外」的关系

#### Scenario: 展宽的解析性

- **WHEN** 给出族内展宽
- **THEN** SHALL 以解析式给出并在参数平面上呈现，MUST NOT 仅依赖数值求根结果

#### Scenario: 主图不得单独呈现窄带

- **WHEN** 图纸/版面受限只能保留一个面板
- **THEN** 该面板 MUST 仍同时含族内曲线与精确解曲线；否则 SHALL 放弃该图而非只画窄带
