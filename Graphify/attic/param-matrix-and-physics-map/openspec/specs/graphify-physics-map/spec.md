# graphify-physics-map Specification

## Purpose
规定「物理图谱」——与画布（工程视角）、参数矩阵并列的第三页。它把 21cmFAST 的代码实现翻成**物理语言的图谱**：让懂天体物理但不熟这套代码的研究者能够（1）说清每个物理过程在算什么、被哪些参数支配、产物喂给谁；（2）按参数、物理量、过程名一步定位到代码段；（3）从过程跳到引用它的论文，或从论文反查全部引用点。数据由 `docs/notes/atlas/` 分层文档**单向生成**（文档是真源），不呈现代码结构本身，但每一跳都落到真实源码行。

## Requirements

### Requirement: 物理图谱由 atlas 文档与源码单向生成

物理图谱 SHALL 是**独立于工程视角图谱与参数矩阵的第三份数据**，由脚本从 `docs/notes/atlas/` 分层文档与 `src/py21cmfast` 源码**生成**；工程视角图谱（`data/graph.json`）与矩阵数据（`src/generated/physics-graph.json`）MUST NOT 被以任何方式改写。生成 SHALL 幂等：文档与源码不变时产出逐字不变（戳记用内容哈希，MUST NOT 用时间戳）。生成物 SHALL 入库跟踪，MUST NOT 落在被版本控制忽略的目录。

#### Scenario: 重跑幂等

- **WHEN** 在文档与源码未变的情况下重跑生成
- **THEN** 产出 MUST 与上一次逐字一致

#### Scenario: 既有两份数据不受影响

- **WHEN** 生成物理图谱
- **THEN** `data/graph.json` 与 `src/generated/physics-graph.json` MUST 保持逐字不变

### Requirement: 层级与粒度

物理图谱 SHALL 以 **16 个阶段**（`L1-stages.md` 的 S01–S16，含 Python 侧的装配/编排/缓存）为骨干节点，以 **71 个子过程**（`L2-subprocesses.md`）为下钻层；**208 个计算单元 MUST NOT 画成节点**，只作为过程的「实现落点」。每个阶段与子过程节点 SHALL 携带物理语言字段：作用与意义、关键过程、关键量、涉及参数、上下游产物、负责入口、实现落点、论文出处。字段值 MUST 取自文档与源码原文；文档与源码都没有的字段 SHALL 留空，MUST NOT 编造。

#### Scenario: 覆盖完整

- **WHEN** 检查生成物的骨干层与下钻层
- **THEN** 骨干 MUST 是 16 个阶段，下钻层 MUST 覆盖 71 个子过程，且每个子过程 MUST 归属到它的阶段

#### Scenario: 计算单元不占节点

- **WHEN** 检查生成物的节点集合
- **THEN** MUST NOT 出现计算单元（三段编号）作为节点；它们只出现在过程的「实现落点」字段里

#### Scenario: 缺失留空

- **WHEN** 某个字段在文档里没有对应写法
- **THEN** 该字段 SHALL 为空值，MUST NOT 由脚本推断或编造内容

### Requirement: 过程的边以产物为枢纽

阶段的边 SHALL 由 `L1-stages.md` 的「输入产物 / 输出产物」推导：某阶段产出的产物（P 编号）被另一阶段消费时，SHALL 生成一条"产出者 → 消费者"的边，边标签 SHALL 写该产物的名称。MUST NOT 用节点 id、文件名或函数名作为边标签。

#### Scenario: 产物链可读

- **WHEN** 查看任一阶段的出边
- **THEN** 每条边 MUST 指向"消费它产物的那个阶段"，且标签是产物名（如「P02 初始条件」）

#### Scenario: 自己消费自己的产物不连边

- **WHEN** 某阶段既是某产物的产出者又是它的消费者
- **THEN** MUST NOT 生成自环边

### Requirement: 实现落点可一步定位到代码段

每个过程 SHALL 给出至少一个「实现落点」：由 `L3-units.md` 的「承担者」字段取出源文件与符号，再由脚本在源码里**定位该符号的函数体**得到行区间；MUST NOT 使用"引用行 ± 固定窗口"这类会吸进整段代码的口径。视图 SHALL 能从落点一跳打开源码预览并高亮该行区间。承担者只给文件名（或写明"各函数"）时 SHALL 退化为整文件落点，并在生成日志里列明。

#### Scenario: 点落点即看代码

- **WHEN** 在物理图谱里点某个过程的某个实现落点
- **THEN** SHALL 打开源码预览并定位到该文件的那段行区间

#### Scenario: 落点必须可核对

- **WHEN** 自检读取落点里的 `file` 与行区间
- **THEN** 该文件 MUST 存在，且行区间 MUST 落在文件行数之内

### Requirement: 参数与物理量随过程呈现

物理图谱 SHALL 呈现项目跟踪的天体物理参数（与参数矩阵同一份口径，取自 `wrapper/inputs.py` 的 `AstroParams` / `AstroOptions`），并 SHALL 自动抽取每个参数的**默认值、是否以 log10 存储、取值范围**；这些信息 SHALL 只来自源码结构，MUST NOT 凭印象填写。每个过程 SHALL 列出与之相关的参数（沿用矩阵的归属口径）与它的「关键量」（取自 `L4-key-processes.md`）。

#### Scenario: 默认值与范围来自源码

- **WHEN** 检查任一参数的默认值/范围/log10 标记
- **THEN** 它们 MUST 与 `inputs.py` 里该字段的 `default`、`validator`、`logtransformer` 一致

#### Scenario: 参数与矩阵口径一致

- **WHEN** 把物理图谱里"参数出现在哪些阶段"裁到矩阵覆盖的阶段范围（后端物理阶段），再与参数矩阵的有色格比较
- **THEN** 两者 MUST 一致（同一份归属口径，不得出现两套答案）；物理图谱因覆盖含 Python 侧与基建在内、比矩阵多出的命中 SHALL 被视为预期，并 SHALL 在自检日志里报出数量

### Requirement: 论文出处取自源码注释

物理图谱 SHALL 提供文献索引：文献 SHALL 只从源码注释与文档字符串里**真实出现的引用**抽取（如 `Scoccimarro R., 1998, MNRAS, 299, 1097`、`Meiksin et al. 2021`），MUST NOT 由脚本补充、扩写或凭印象生成文献条目。每篇文献 SHALL 去重成实体，并列出**全部引用点**（`file:line`），视图 SHALL 支持点击引用点跳到那一行源码。抽不到文献的过程 SHALL 留空。

#### Scenario: 引用点可回读

- **WHEN** 自检读取某篇文献的任一引用点
- **THEN** 该行源码 MUST 含有该文献的作者或年份信息

#### Scenario: 没有引用就不写

- **WHEN** 某过程对应的源码里没有任何文献引用
- **THEN** 该过程的论文出处 SHALL 为空，MUST NOT 出现推测性的文献

### Requirement: 四路检索

物理图谱 SHALL 提供单一检索入口，按**参数名、物理量（关键量）、过程名**（含 `INDEX.md` 里"我想知道…"的问句）与**论文**四类给出结果，选中结果 SHALL 定位到对应节点或引用点。检索 SHALL 在已加载的生成物内完成，MUST NOT 引入运行时网络请求。

#### Scenario: 按参数定位

- **WHEN** 在检索里输入一个参数名（如 `F_STAR10`）
- **THEN** SHALL 列出该参数及其相关过程，选中后定位到对应过程

#### Scenario: 按论文定位

- **WHEN** 在检索里输入一篇文献的作者或年份
- **THEN** SHALL 列出该文献及其全部引用点，选中引用点 SHALL 定位到那一行源码

### Requirement: 物理图谱与其它视图的状态隔离

物理图谱 SHALL 遵守与参数矩阵相同的隔离口径：切到该视图时 SHALL 清空画布侧的选中、连线模式与引用拖拽状态；画布专属快捷键（新建、连线、删除、重排、适应屏幕、聚焦搜索、撤销、重做）MUST NOT 生效；顶栏 MUST NOT 显示搜索框、撤销/重做、布局、话题、标签、导入与图谱统计；状态条 SHALL 显示本视图口径（阶段数、子过程数、参数数、文献数之一与当前动作）；切换视图本身 MUST NOT 写入任何数据。

#### Scenario: 切过去不留画布痕迹

- **WHEN** 在画布上选中节点后切到物理图谱
- **THEN** 状态条 MUST NOT 出现「已选中节点」或「已选中关系」，也 MUST NOT 出现布局、缩放与本视图节点数

#### Scenario: 切视图不写盘

- **WHEN** 在三个视图之间来回切换
- **THEN** 快照数与工作文件 MUST NOT 变化

### Requirement: 物理图谱不做评估层

物理图谱 SHALL 只呈现**事实**（文档与源码里的原文与位置），MUST NOT 提供审读批注、评估结论、评级或任何可写标注字段，也 MUST NOT 新增写接口。对实现合理性的判断 SHALL 由使用者自行完成。

#### Scenario: 没有可写入口

- **WHEN** 检查物理图谱相关的接口与数据
- **THEN** MUST NOT 存在新增的写端点或可写标注字段
