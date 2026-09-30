## ADDED Requirements

### Requirement: 标签只服务参数

标签 SHALL 只表达"这个节点碰到哪个参数"：注册表里 MUST 只保留**参数标签**（带 `group` 的那些，`group` 来自 `inputs.py` 里 InputStruct 子类名）；无 `group` 的自由标签 MUST NOT 存在于注册表，也 MUST NOT 挂在任何节点上。若发现历史遗留的自由标签，SHALL 通过显式的政策通道（`scripts/prune-tags.mjs`）从注册表、节点 `tags` 与 `tagDetails` 三处一并删除；该清理 MUST 幂等。

节点的参数标签 SHALL 由该节点源码引用所在函数体里出现的参数自动产出——因此**没有源码引用的节点可以没有标签**，这是可接受状态，生成器 MUST NOT 为此拒绝产出。生成器 MUST NOT 自行声明节点标签（它不产出标签，标签由扫描器写）。

有子节点的模块 MUST NOT 自己挂标签——它的标签是子图里所有叶子标签的并集，由前端派生展示（schema 既有规则）。

#### Scenario: 注册表里只剩参数标签

- **WHEN** 政策清理执行完成
- **THEN** 注册表里的每一条标签 MUST 带非空 `group`；无 `group` 的标签 MUST 为 0 条，且 MUST NOT 出现在任何节点的 `tags` / `tagDetails` 中

#### Scenario: 生成器不再产出标签

- **WHEN** 生成器重新导出节点声明
- **THEN** 声明里 MUST NOT 出现 `tags` 字段，生成的草稿节点 MUST NOT 带标签；生成器 MUST NOT 因"标签为空"报错

#### Scenario: 清理是删除的唯一通道且幂等

- **WHEN** 政策清理被重复执行
- **THEN** 第二次执行 MUST 不改变任何数据（无可删即不动），MUST NOT 删掉任何参数标签

#### Scenario: 没有源码引用的节点允许没有标签

- **WHEN** 某个流程节点只有文档引用（扫不出参数）
- **THEN** 它 MAY 没有任何标签；界面 SHALL 如实显示"这个节点还没有全局标签"，MUST NOT 因此报错或阻止保存

#### Scenario: 容器不挂标签

- **WHEN** 需求是"整条链能被某个标签筛出来"
- **THEN** 标签 SHALL 挂在链上的叶子节点；分组容器自身的标签 MUST 为空（筛选靠"子图标签并集"派生）

## MODIFIED Requirements

### Requirement: 参数标签由源码引用自动产出且注册表只增不减

节点的参数标签 SHALL 由该节点源码引用所在函数体内出现的参数自动产出；为此引用 SHALL 能被 C 与 Python 两种函数体识别（前者按花括号配对，后者按缩进），C 侧的注释与字符串 MUST 被屏蔽。重扫 SHALL **只刷新它自己负责的参数标签**（id 形如 `tag:<已知参数名>`）；其余标签与注册表条目 MUST NOT 被扫描器删除或改写——唯一允许的删除通道是显式的政策清理（见"标签只服务参数"）。扫描器 MUST 默认 dry-run，并打印"将新增 / 将保留"的差异，显式 `--apply` 才写回。

#### Scenario: 有源码引用的节点拿到参数标签

- **WHEN** 一个节点的引用落在某个函数体内，而该函数体用到了某些参数
- **THEN** 该节点 SHALL 获得这些参数的标签（`tag:<参数名>`），并带可展开的出处明细

#### Scenario: 扫描器不删东西

- **WHEN** 对一份已有标签的图谱执行一次重扫（dry-run 或 `--apply`）
- **THEN** 注册表条目 MUST NOT 因扫描而减少；除"本扫描器负责的参数标签"外，任何标签 MUST NOT 被摘掉

#### Scenario: 只有文档引用的节点不被误伤

- **WHEN** 某节点（如初始条件链的过程节点）此前没有任何源码引用
- **THEN** 重扫 MUST NOT 清空它已有的参数标签，MUST NOT 从注册表里删掉这些标签条目（要删只能走政策清理）

#### Scenario: 重扫不缩水

- **WHEN** 对一个已带标签的图谱执行一次重扫（dry-run 或 apply）
- **THEN** 注册表条目数 MUST NOT 减少，节点上已有的参数标签 MUST 保持

#### Scenario: 新标签必须有文档

- **WHEN** 扫描产出了注册表里没有的参数标签
- **THEN** 写回前 SHALL 为该标签绑定一篇 notes 文档（`docId` 非空），否则写回 MUST 被拒

## REMOVED Requirements

### Requirement: 流程节点的标签必须可筛且与作者源一致

**Reason**：与"标签只服务参数"冲突——它要求每个流程节点至少一条标签、且与生成器源码的标签声明一致，而生成器自本变更起不再声明标签，历史遗留的自由标签也一并删除。
**Migration**：改用"标签只服务参数"这条要求；`check:graph` 里以自由标签为前提的 4 条断言同步撤掉，并新增"注册表里不得存在无 `group` 的标签"作为政策门。
