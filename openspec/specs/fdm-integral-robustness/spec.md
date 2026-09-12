# fdm-integral-robustness Specification

## Purpose

规定 FDM 功率谱压制区下 `sigma(M)` 积分表在数值上"舍入受限"时的容错语义，以及经 cffi 直接调用的积分入口在表构建失败时的异常边界，使 FDM 全局积分路径返回可判读的数值而不是让宿主进程崩溃。

## Requirements

### Requirement: 舍入受限必须与真实失败分流

当数值求积因相对容差无法在双精度内被证实而返回"舍入受限"状态时，系统 SHALL 认为该结果可用并采用本次求积给出的最佳估计继续，MUST NOT 将其视为失败而终止。其余非零状态码 SHALL 保持既有错误处理路径不变。该判定 MUST 以具体状态码为依据，MUST NOT 以"状态码非零"这一条件代替。

#### Scenario: 压制区斜率积分命中舍入受限

- **WHEN** 在 FDM 宇宙学下对建表最左端质量节点求 `d(sigma^2)/dM`，且求积返回舍入受限状态
- **THEN** 系统 SHALL 返回该次求积的最佳估计值，且进程 MUST 保持存活

#### Scenario: 真实失败不得被静默接受

- **WHEN** 求积返回非零且非舍入受限的状态码
- **THEN** 系统 SHALL 记录错误并沿既有异常机制传播，MUST NOT 静默返回该次结果

#### Scenario: 降级事件不得伪装为错误

- **WHEN** 发生舍入受限降级
- **THEN** 日志 SHALL 以警告级别标记该事件，MUST NOT 输出错误级别记录

### Requirement: 积分结果的符号与定义域钳位

`sigma(M)` 的返回值 MUST 非负，`d(sigma^2)/dM` 的返回值 MUST 非正，二者 MUST NOT 因舍入误差越出定义域。

#### Scenario: 舍入使积分越出定义域

- **WHEN** 舍入误差把某插值节点上的积分推至定义域之外
- **THEN** 返回值 SHALL 被钳位回定义域内，且对 `sigma(M)` 取平方根 MUST NOT 产生非数

#### Scenario: 钳位对正常符号为恒等操作

- **WHEN** 积分结果已处于定义域内
- **THEN** 返回值 MUST 与钳位前逐位相同

### Requirement: cffi 直调入口以非数而非崩溃报告表构建失败

经 cffi 被 Python 直接调用的全局积分入口，在构建 `sigma(M)` 插值表抛出异常时，SHALL 捕获该异常、把该调用声明的**全部**输出数组填为非数，然后正常返回。异常 MUST NOT 穿过没有异常处理活动上下文的调用边界。

#### Scenario: 表构建失败

- **WHEN** 表构建抛出任意异常
- **THEN** 该入口 SHALL 把全部输出数组填为非数并返回，进程 MUST 存活，且调用方 MUST 能观察到非数

#### Scenario: 输出数组不得留下未初始化元素

- **WHEN** 在异常处理分支中返回
- **THEN** 该入口声明的每个输出数组（含其 mini 变体）SHALL 已全部被写为非数

#### Scenario: FDM 下全局积分可正常调用

- **WHEN** 在 FDM 宇宙学下调用电离率与恒星形成率密度的全局积分入口
- **THEN** 调用 MUST 正常返回数值数组，MUST NOT 出现进程级崩溃

### Requirement: CDM 数值兼容性不得改变

本能力的全部行为在 CDM 宇宙学下 MUST 为无操作：结果数值逐位不变，且 MUST NOT 进入舍入受限降级分支。

#### Scenario: CDM 结果逐位一致

- **WHEN** 在 CDM 宇宙学下调用受影响的积分路径
- **THEN** 返回值 MUST 与变更前逐位相同

#### Scenario: CDM 不触发降级

- **WHEN** 在 CDM 宇宙学下构建插值表
- **THEN** SHALL 出现零次舍入受限降级
