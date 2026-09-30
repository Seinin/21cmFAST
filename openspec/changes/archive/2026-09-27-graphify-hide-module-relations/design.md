## Context

见 proposal.md 的 Why。与做法相关的现状（已逐处核对，不是上一轮的旧记忆）：

- **没有画布元素 ↔ 数据节点的 id 映射**：`GraphCanvas` 里那句 `element.data('refId')` 恒走 `?? id` 兜底，`refId` 从未被写入。因此关系隐藏的端点判定就是边数据的 `source` / `target`——与 `applyVisibility()` 现有写法完全一致。
- **层级是 compound、不是边**：`syncCompoundParents()` 用 `element.move({ parent })` 表达父子；边元素是普通语义关系，`classes` 只挂 `conditional`，**没有 `hierarchy` 类**。
- `applyVisibility()`（`cytoscapeSetup.ts` L511–555）是可见性的**唯一落地出口**：先 `removeStyle('display')` 全还原，再按条件 `style('display','none')`；边循环里目前只有话题过滤一条规则。`sync()` 之后会重新调用它，因此放在渲染器字段里的集合跨 `sync` 持续生效。
- `hiddenTopicIds`（`graphStore.ts` L50–55）是纯视图状态的先例：注释口径「不入撤销栈、不落盘」；`setHiddenTopics`（L150–169）里有一段**选中兜底**——选中的对象变不可见就落回 `initialSelection`。
- `usePanelWidth.ts` 是本仓 localStorage 的唯一先例：独立命名空间键、`try/catch` 降级、写失败只影响"下次打开的记忆"。
- **`Inspector` 是纯 props 驱动**：内部没有 `useGraphStore`，所有数据与回调由 `App.tsx` 注入（`selectedNode`、`onPatchNode`…）。
- `check-canvas.mjs` 只有 rAF 垫片，**没有 localStorage 垫片**；它用 `g()` 造节点（坐标必须互不相同）、`check` / `styleCheck` 断言、`renderer.sync(graph)` 后再断言 `visible()`。

## Goals / Non-Goals

**Goals:**

- 两处入口（右键菜单、属性面板）行为完全一致，且都是"切一下立刻生效、不动版面"。
- 状态只有一份真源，刷新后保持，且**绝不**碰到图谱数据与撤销栈。
- 实现落在既有幂等链路上（`display` 切换 + 渲染器字段），不新增重建/重排路径。

**Non-Goals:**

- 不做全局一键收起（原定义挂在已撤的「复用件」清单上）。
- 不恢复小扳手标识、审计脚本、数据标记、图例项、菜单说明行。
- 不重构 `usePanelWidth`，不改话题过滤 / `conditional` / 红点标记 / 初始条件三块骨架。
- 不新增服务端接口与 schema 字段（本次零服务端改动）。

## Decisions

**D1：端点判定直接读边数据，不引入 id 映射。**
仓库里根本没有映射（`refId` 是死代码兜底），凭空造一套等于给未来留一个没人维护的抽象。后果：子图里若有"代表卡"这类转发元素，端点判定会落空——但当前代码里不存在这种元素，等它出现时再处理。

**D2：层级不需要特判。**
计划里曾写"显式跳过 `hierarchy` 类边"，实际代码里层级是 compound、边没有这个类，所以**不加**这段：写一个永远为假的判断只会误导后来的人。改为在注释里写明"层级不是边元素，所以这条规则碰不到它"。

**D3：一份真源放在 store，持久化只在"初值读取 + 每次切换写入"两处。**
隐藏集合有三处消费者（画布、右键菜单、属性面板），`usePanelWidth` 那种"一个 hook 管一个组件"的形态会造成三份状态。持久化收敛为两个调用点：模块初始化读一次、每次切换写一次（一次点击一次写，无高频写风险）。

**D4：`Inspector` 的状态与回调经 `App.tsx` 注入。**
它不接 store 是既有架构约定（全靠 props）。因此新增两个 props（`relationsHidden` / `onToggleRelations`），由 `App.tsx` 从 store 取值传入——不为了这一个开关破例让 Inspector 直连 store。

**D5：`reset()` 不复位隐藏集合。**
`reset()` 挂在图谱加载/重载路径上，复位它会让"刷新后仍隐藏"在**真实刷新路径**上失效（页面重载 → 重置 → 显示全部）。改为：集合保留，**应用时对现有节点做一次过滤**（未知 id 直接忽略），从而既满足"刷新后保持"，又不会残留幽灵状态。这也与 D3 的持久化方向一致。

**D6：`display:none` 只切可见性。**
与话题过滤同一条路：元素不删、坐标不动、不重建、不重排，因此反复切换天然幂等，也不进撤销栈。

**D7：入口幂等。**
`setHiddenRelations(ids)` 在集合相等时直接返回，不重复调用 `applyVisibility()`——与 `setTopicFilter` 的入口风格一致，避免每次无关重渲染都重算一遍全图可见性。

## Risks / Trade-offs

- **`check-canvas.mjs` 没有 localStorage 垫片**：助手必须用 `typeof window === 'undefined'` 直接返回默认值（不要依赖 `try/catch` 去捕获 `ReferenceError`——虽然能捕获，但那是靠错误控制流程）。
- **持久化的键与数据寿命**：节点被删除后旧 id 会留在本地存储里。D5 的过滤保证界面正确；存储里的僵尸 id 会一直留着（无副作用，且用户下次切换时会被覆盖掉）。
- **多标签页**：两个标签页各自持有隐藏集合，后切换的会覆盖本地存储（不做跨页同步）。与面板宽度同类，属于可接受的口径。
- **探针环境**：Edge 的 DevTools 只监听 Windows 回环，浏览器实测必须在 Windows 侧跑；且 `check-canvas.mjs` 跑完不会退出（esbuild 服务让事件循环不空转），必须用 `timeout` 包着跑，否则会留常驻进程。
- **误伤风险**：改动横跨 7 个前端文件，其中 `cytoscapeSetup.ts` 的 `applyVisibility()` 是话题过滤、compound 补刀等既有行为的公共路径——新增规则必须只追加"命中就藏"的一支，不修改既有分支的顺序与语义。
