## ADDED Requirements

### Requirement: 矩阵视图与画布视图的状态隔离

矩阵视图 SHALL 是**自洽的一页**：不渲染画布与检查器时，MUST NOT 继续呈现画布的状态、也 MUST NOT 接受画布的操作。切到矩阵视图时 SHALL 清空画布侧的选中、连线模式与引用拖拽状态；画布专属快捷键（新建、连线、删除、重排、适应屏幕、聚焦搜索、撤销、重做）MUST NOT 生效；顶栏 MUST NOT 再给出画布专属入口；底部状态条 SHALL 换成矩阵口径（参数数、过程数、有色格数与当前动作），MUST NOT 显示选中对象、布局、缩放或本视图节点数。`Esc` SHALL 能关闭已打开的过程详情。切回画布视图 MUST 与切换前一致，且切换本身 MUST NOT 写入任何数据。

#### Scenario: 切到矩阵视图后没有残留的选中

- **WHEN** 在画布上选中一个节点或关系后切到参数矩阵
- **THEN** 状态条 MUST NOT 出现「已选中节点」或「已选中关系」，也 MUST NOT 出现布局、缩放、本视图节点数

#### Scenario: 矩阵页的快捷键不作用于画布

- **WHEN** 在矩阵页按下 Delete / N / C / L / F / `/` / 撤销 / 重做
- **THEN** 页面 MUST NOT 发生任何变化：MUST NOT 删除或新建节点、MUST NOT 弹出节点或关系编辑框、MUST NOT 产生快照

#### Scenario: 矩阵页保留通用快捷键

- **WHEN** 在矩阵页按下 `Ctrl/Cmd + S` 或 `?`
- **THEN** SHALL 仍然另存为一份保留副本、或打开操作指南

#### Scenario: 顶栏不提供画布专属入口

- **WHEN** 处在矩阵视图
- **THEN** 顶栏 MUST NOT 显示搜索框、撤销/重做、布局、话题、标签、导入与图谱统计；视图切换、另存、历史、帮助 MUST 仍可用

#### Scenario: 状态条按视图切换口径

- **WHEN** 处在矩阵视图
- **THEN** 状态条 SHALL 显示参数数、过程数、有色格数，并在打开过程详情或聚焦某个参数行时显示当前动作；MUST NOT 显示选中对象、布局、缩放与本视图节点数

#### Scenario: Esc 关掉过程详情

- **WHEN** 在矩阵视图打开了一个过程的详情后按 Esc
- **THEN** 该详情 SHALL 关闭

#### Scenario: 切回画布不受影响

- **WHEN** 从矩阵视图切回画布
- **THEN** 画布 SHALL 回到与切换前一致的渲染与面板，且本次切换 MUST NOT 产生任何写盘（快照数与工作文件不变）
