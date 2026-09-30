## MODIFIED Requirements

### Requirement: 隐藏关系是本地记忆的视图状态

隐藏关系 SHALL 是**纯视图状态**：MUST NOT 写入图谱数据、MUST NOT 进入撤销栈、MUST NOT 触发任何写盘（既不写工作文件，也不产生快照）。它 SHALL 记在**浏览器本地存储**，刷新或重开页面后保持上次的隐藏集合；换机器或用别人的链接打开 MUST NOT 带上它。本地存储不可用或内容损坏时，系统 SHALL 降级为「全部显示」，且 MUST NOT 报错。已不存在的模块 id SHALL 被忽略，MUST NOT 因此报错或留下幽灵状态。

#### Scenario: 刷新后仍然隐藏

- **WHEN** 用户收起了某个模块的关系，随后刷新页面
- **THEN** 该模块的关系仍然不绘制

#### Scenario: 不写图谱数据

- **WHEN** 用户收起或恢复某个模块的关系
- **THEN** 图谱数据 MUST NOT 被修改、写盘 MUST NOT 发生（工作文件与历史快照都不变）、撤销栈 MUST NOT 变化

#### Scenario: 本地存储不可用时降级

- **WHEN** 浏览器禁用本地存储，或存下的内容已损坏（非数组、非法 JSON）
- **THEN** 行为回退为「全部显示」，且 MUST NOT 出现报错或白屏
