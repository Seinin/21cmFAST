## Context

- `src/py21cmfast/src/integral_wrappers.c` 是"从 Python 直接求积分"的门面：文件中 10 个计算型入口**全部**经 `wrapper/cfuncs.py` 用 cffi 直接调用，C 源码内没有任何内部调用者（已核查）。因此这些入口处不存在外层 `Try`，`cexcept` 的 `Throw` 会 longjmp 穿过 NULL 异常上下文。
- 已归档变更只在 `get_global_SFRD_z` / `get_global_Nion_z` 建立了边界，且该边界**只包住 `initialiseSigmaMInterpTable` 这一行**；其余 8 个入口无边界。
- 这 8 个入口内部会触发的建表调用分散在多处：`initialiseSigmaMInterpTable`（sigma 表）、`InitialiseSigmaInverseTable`（采样逆表）、`initialise_dNdM_tables` / `initialise_dNdM_inverse_table` / `initialise_J_split_table`（条件采样残差表）、`initialise_GL`、`initialise_FgtrM_delta_table`、`initialise_SFRD_Conditional_table`、`initialise_Nion_Conditional_spline`、`initialise_Xray_Conditional_table`。这些调用中，`interp_tables.c` 有 15 处 `Throw`，`Stochasticity.c` 有 10 处 `Throw`。
- `stoc_set_consts_z`（`Stochasticity.c:78`）既会建表，也会因参数非法（`redshift_desc > 0 && redshift < redshift_desc`）`Throw(ValueError)`。`get_halo_chmf_interval`、`get_condition_integrals`、`get_halomass_at_probability` 都会经它。
- 输出全部经指针参数传出，Python 侧用 numpy 缓冲承接并原样返回（`cfuncs.py:480-743`），所以非数是可判读的失败信号。
- `cexcept` 的 `Catch(status)` 会把异常类型编号写入 `status`；`Catch` 块内可以 `return`（`cexcept.h:146-150`）。异常类型编号是区分 `GSLError` / `TableGenerationError` / `ValueError` 的唯一线索。
- 构建与验证环境：必须用 `.venv/bin/python`；改 C 扩展后跑 `build_cffi.py`，并把新的 `.so` 同步到 `src/py21cmfast/`。

## Goals / Non-Goals

**Goals:**

- 本文件内全部 cffi 直调入口的异常边界**完备**：任何异常都不穿过 Python ↔ C 边界。
- 失败语义与已归档契约一致：全部输出填非数 + `LOG_ERROR` + 正常返回。
- 保持两类失败可分流：建表失败（数值降级，报非数）与参数非法（用户错误，报异常）。
- 正常路径数值不变（CDM 逐位一致、FDM 不崩且结果可用）。

**Non-Goals:**

- 不改 cffi 函数签名、不改 `cexcept` 异常类型体系、不引入"C 入口返回状态码"的新协议。
- 不回头改动已归档并已验收的 `get_global_SFRD_z` / `get_global_Nion_z`。
- 不处理 `cfuncs.py:95` 那条"Python 直接 cffi 调用建表函数"的路径（另记备查）。
- 不为其它文件自身的 `Throw` 做改造（例如 `Stochasticity.c` 里以内部调用者身份抛出的情况）。
- 不把非数语义扩散到 Python 公开 API 的异常契约（非法参数仍 `raise`）。

## Decisions

### D1 守卫粒度取"整个函数体"，而不是"只包住建表调用"

8 个入口各在函数体最外层套一个 `Try`/`Catch`。

- 理由：单个入口内的建表点有 3~4 处且位置分散（见 Context），逐点包只要漏一处就等于没修；整体包住后"异常不逃逸"升级为**函数级不变量**，可以机械核查，也不会因为以后新增一处建表调用而失效。
- 否决备选一：逐点 `Try`（与已归档两处同构）——需要约 10 处守卫，且脆弱（漏一处即失效）。
- 否决备选二：在 Python/cffi 调用侧加防护——不可行，longjmp 已经在 C 内发生，Python 拿不到控制权。
- 与已归档两处的风格差异是有意的：那两处的边界只覆盖建表调用，本次 8 处覆盖整个函数体（含 `init_ps()`）。因为 `init_ps()` 内部会经 `sigma_z0` 求 `sigma_norm`，同样无法保证不抛；函数级不变量更易陈述与验证。

### D2 捕获后填充"本调用声明的全部输出数组"为非数，然后 `return`

各入口的输出清单（`N` 为对应维度的长度）：

| 入口 | 需填非数的输出 | 长度 |
| --- | --- | --- |
| `get_sigma` | `sigma_out`, `dsigmasqdm_out` | `n_masses` |
| `get_condition_integrals` | `out_n_exp`, `out_m_exp` | `n_conditions` |
| `get_halo_chmf_interval` | `out_n` | `n_conditions * n_masslim`（按 `i*n_masslim + j` 展平，填充时用连续下标） |
| `get_halomass_at_probability` | `out_mass` | `n_conditions` |
| `get_conditional_FgtrM` | `out_fcoll`, `out_dfcoll` | `n_densities` |
| `get_conditional_SFRD` | `out_sfrd`, `out_sfrd_mini` | `n_densities` |
| `get_conditional_Nion` | `out_nion`, `out_nion_mini` | `n_densities` |
| `get_conditional_Xray` | `out_xray` | `n_densities` |

- `mini` 变体在 `USE_MINI_HALOS` 关闭时正常路径也不写，但失败路径仍填非数：与已归档契约"含其 mini 变体"一致，宁可多填，也不留未初始化元素。
- 否决备选：只填到出错位置为止（例如 `get_halo_chmf_interval` 填到当前 `i`）——会让"部分非数 + 部分未初始化"混在一起，调用方无法判断，违反"不得留下未初始化元素"。

### D3 `Catch` 内只使用形参与 `status`

`setjmp`/`longjmp` 之后，在 `Try` 与 `Catch` 之间被修改过的自动变量取值不确定。因此 `Catch` 内只读：`status`（由 cexcept 写入）、以及各 `n_*` 长度与输出指针（均为形参，函数体内不被赋值）。已核对这 8 个入口的 `n_*` 全部是形参。

### D4 日志记录入口名 + 异常类型编号

`LOG_ERROR("<入口名>: ... (exception type %d); returning NaN", status)`。类型编号是唯一能区分 `GSLError` / `TableGenerationError` / `ValueError` 的线索，缺了它排障只能靠猜。

### D5 参数校验前移到 Python 包装层

在**每个把用户提供的 `redshift_prev` 透传给 cffi 入口**的 Python 包装层里，当 `redshift_prev` 为正且晚于 `redshift` 时 `raise ValueError`。适用处共 3 个：`evaluate_condition_integrals`、`integrate_chmf_interval`、`evaluate_inverse_table`（第三个用 `if redshift_prev is None: redshift_prev = -1` 的写法，容易漏检，已实测确认）。

- 理由：`stoc_set_consts_z` 的 `Throw(ValueError)` 是**有意的用户错误上报**；整体守卫会把它吞成非数，等于把"你参数写错了"降级成"结果不可用"，信息量更低。前移校验后，建表失败（→非数）与参数非法（→异常）保持分流。
- 判定条件与 C 端逐字对应（`Stochasticity.c:80` 的 `redshift_desc > 0 && redshift < redshift_desc`）：只查这一条，不复制 C 端全部校验逻辑，避免两处规则漂移；`redshift_prev == redshift` 及非正值仍按 C 端的既有行为放行（不额外收紧）。
- C 端 `Throw` 原样保留作兜底（Python 校验之后理论上不可达，但守卫不依赖这一点）。
- 否决备选：在 C 入口按异常类型分流（表构建→非数、`ValueError`→经出参回传错误码）——需要改 cffi 签名/新增出参协议，超出本次范围。
- 否决备选：把校验写成 `redshift_prev >= redshift`——会拦下 C 端当前接受的相等取值，属行为收紧，超出"把 C 的校验前移"这一目标。

### D6 不引入返回码协议

失败信号仍统一为"输出为非数"，与已归档契约一致；不新增 `int status` 出参，Python 侧无需改造调用约定。

### D7 更新过期注释

删除 `integral_wrappers.c:124-125` 的 NOTE（它列举的"待修入口"本次已修完），替换为"本文件内 cffi 直调入口均已建立异常边界"的说明，防止注释过期后误导后续维护。

## Risks / Trade-offs

- **R1 静默化**：非数可能被上游当成有效数值继续参与求和/插值，把"崩溃"换成了"看起来跑通但结果无意义"。缓解：`LOG_ERROR` + 测试断言输出含非数；调用方约定非数即"该次调用不可用"。这是已归档契约的既定取舍，本变更不改变它。
- **R2 范围大于用户点名的 6 个**：多包 2 个入口（`get_condition_integrals`、`get_halomass_at_probability`），影响面变大。缓解：proposal 已显式标注这 2 个为可裁剪项，其暴露机制与 6 个完全同类。
- **R3 整体包住会连 `init_ps()` 的失败一起吞掉**（例如 `signal_norm` 相关计算失败）。权衡：在 cffi 直调场景下，"崩溃"永远比"非数"更糟，且这类失败本来也无法被 Python 感知。属有意取舍，已在 D1 记录。
- **R4 longjmp 与优化的交互**：若在 `Catch` 中引用被 longjmp 打破的局部变量会读到垃圾值。缓解：严格遵守 D3；并且端到端验证不可省（只编译通过不能证明正确）。
- **R5 与已归档两处风格不一致**（函数级 vs 只包建表）。缓解：本次不改动已验收代码，在 Open Questions 记录，后续可单独统一。
- **R6 Python 校验与 C 校验规则漂移**：缓解：Python 只查 z 顺序一条，其余规则仍以 C 为权威。
- **R7 CDM 回归风险**：加 `Try`/`Catch` 会引入 `setjmp`，理论上影响优化与寄存器分配。缓解：CDM 逐位比对作为验收项（不设容差）。

## Open Questions

- 是否把已归档的 `get_global_SFRD_z` / `get_global_Nion_z` 也升级为函数级守卫（当前 `init_ps()` 在 `Try` 之外），以统一本文件风格？本次不动，避免重开已验收变更。
- 旁路发现（本变更**不**处理，仅记录）：`EvaluateRGTable1D_f`（`interpolation.c:123`）对 `x` 不做定义域检查，直接以 `table->y_arr[idx]` 取值；而 `get_sigma`（用户给 `mass_values`，表域为 `[M_MIN_INTEGRAL, 1e20]`）与 `get_conditional_*`（用户给 `R`，表域下界为 `minimum_source_mass(z, true)`）都直接吃用户输入。因此"传入越出表定义域的值"会**越界读内存**，而不会 `Throw`——这是与异常边界不同的缺陷类别，本次加固**不能**覆盖它，也不应被误认为已修。需要后续单独评估（例如加定义域钳位或前置校验）。
- `cfuncs.py:95` 的"Python 直调建表函数"路径是否另开一单处理？
- 非数契约是否应上移到 Python 公开 API（例如返回带掩码的数组或直接 `raise`）？超出本能力范围。
- 旁路发现二（本变更**不**处理，仅记录）：条件积分入口的**零宽参数区间**。`initialise_Nion_Conditional_spline` / `initialise_SFRD_Conditional_table` / `initialise_Xray_Conditional_table` 以用户数组的 min/max 为建表区间；当某个数组全为同一常数（例如 `log10mturn` 恒为 6.0）时区间宽度为 0，随后求值发生**越界读**而不是 `Throw`。实测：`evaluate_Nion_cond`（`USE_MINI_HALOS=True`、`log10mturn` 常量数组）SIGSEGV；**变更前的基线二进制同样崩溃**（已用基线 `.so` 复核），故与本次守卫无关。因此本次验证向量改用非退化区间（`np.linspace(5, 8.5, 5)`）。后续可评估建表前对区间宽度钳位或前置校验。
- 旁路发现三（本变更**不**处理，仅记录）：**cat 模式下条件值非法**。`redshift_prev > 0` 时条件数组被解释为质量 $M$；传入非正值（例如误把密度反差 $\delta$ 当质量传）会先取 `log(M)` 再查插值表，越界读内存而非 `Throw`。实测：`evaluate_condition_integrals` 在 `redshift_prev == redshift` 下传含负值的数组即 SIGSEGV。Python 层校验（D5）有意只覆盖 `redshift_prev` 顺序，不校验条件值语义。
- 旁路发现四（本变更**不**处理，仅记录）：本文件之外仍有 cffi 直调、且可能 `Throw` 的入口没有外层边界：`init_ps`、`initialiseSigmaMInterpTable`、`initialise_GL`、`dicke`、`get_delta_crit`、`expected_nhalo`、`ComputeTau`、`ComputeLF`、`single_test_sample`、`test_halo_props`、`Broadcast_struct_global_all`、`CreateFFTWWisdoms`、`Free_cosmo_tables_global`（`cfuncs.py` 直调的 23 个 `lib.*` 中不在本文件顶层的 13 个）。故障注入实验（任务 4.2）证明 `initialiseSigmaMInterpTable` 抛出的异常会传到调用它的本文件入口并被捕获；同一异常若由 Python 直接调该建表函数触发，仍会崩溃。与 Non-Goals 中"`cfuncs.py:95` 路径另记备查"同源，建议合并为一单跟进。
