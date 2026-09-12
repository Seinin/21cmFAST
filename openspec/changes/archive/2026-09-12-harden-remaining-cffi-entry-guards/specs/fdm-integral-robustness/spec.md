## MODIFIED Requirements

### Requirement: cffi 直调入口以非数而非崩溃报告表构建失败

`src/py21cmfast/src/integral_wrappers.c` 中经 cffi 被 Python 直接调用的**每一个**积分入口，SHALL 在该入口的函数体范围内建立异常边界；函数体内任意位置抛出的插值表、逆表、残差表或样条构建异常 MUST NOT 穿过该边界。捕获后该入口 SHALL 把本调用声明的**全部**输出数组填为非数、记录错误日志，然后正常返回。（相对原要求：范围从"全局积分入口"扩展为本文件全部 cffi 直调入口，且不再局限于 `sigma(M)` 表构建这一处调用。）

#### Scenario: 表构建失败

- **WHEN** 表构建抛出任意异常
- **THEN** 该入口 SHALL 把全部输出数组填为非数并返回，进程 MUST 存活，且调用方 MUST 能观察到非数

#### Scenario: 输出数组不得留下未初始化元素

- **WHEN** 在异常处理分支中返回
- **THEN** 该入口声明的每个输出数组（含其 mini 变体）SHALL 已全部被写为非数

#### Scenario: FDM 下全局积分可正常调用

- **WHEN** 在 FDM 宇宙学下调用电离率与恒星形成率密度的全局积分入口
- **THEN** 调用 MUST 正常返回数值数组，MUST NOT 出现进程级崩溃

#### Scenario: 异常边界对本文件入口完备

- **WHEN** 检查 `integral_wrappers.c` 中每一个 cffi 直调入口
- **THEN** 每个入口 SHALL 存在覆盖其整个函数体的异常边界，MUST NOT 存在无处理器的建表调用

#### Scenario: sigma 与采样入口在建表失败时不崩溃

- **WHEN** 调用 `get_sigma`、`get_halo_chmf_interval`、`get_condition_integrals` 或 `get_halomass_at_probability`，且其建表抛出异常
- **THEN** 异常 SHALL 被捕获并转换为该入口全部输出数组的非数，进程 MUST 存活

#### Scenario: 条件积分入口在建表失败时不崩溃

- **WHEN** 启用按条件建表且在极端参数下调用 `get_conditional_FgtrM`、`get_conditional_SFRD`、`get_conditional_Nion` 或 `get_conditional_Xray`，且其建表抛出异常
- **THEN** 异常 SHALL 被捕获并转换为该入口全部输出数组的非数，进程 MUST 存活

## ADDED Requirements

### Requirement: 输入校验错误仍以异常上报

cffi 直调入口内部的异常边界只用于兜底建表失败。调用方传入的非法参数（至少包括 `redshift_prev` 晚于 `redshift` 这一红移顺序错误）SHALL 在每个把用户提供的 `redshift_prev` 透传给 cffi 入口的 Python 包装层先行校验，并以 Python 异常上报；MUST NOT 退化为静默的非数返回值。判定条件 SHALL 与 C 端一致（仅当 `redshift_prev` 为正且晚于 `redshift` 时判为非法）。

#### Scenario: 非法 redshift_prev

- **WHEN** 以晚于 `redshift` 的正 `redshift_prev` 调用 `evaluate_condition_integrals`、`integrate_chmf_interval` 或 `evaluate_inverse_table`
- **THEN** Python 侧 SHALL 抛出 `ValueError`，MUST NOT 返回非数数组，进程 MUST 存活

#### Scenario: 合法 redshift_prev 不受影响

- **WHEN** 以合法的 `redshift_prev`（早于 `redshift`，或为非正值、缺省值）正常调用
- **THEN** 返回结果 MUST 与变更前逐位相同
