## Context

**两处实现的现状**（都在 `Graphify/src/components/Inspector.tsx`，组件都在 `NodeTags.tsx`）：

- 顶部 `Field plain label="全局标签"`（第 605–616 行）挂 `NodeTagEditor`：已归属标签渲染成一排**胶囊**，每个胶囊带 `X`（`NodeTags.tsx:103`）点了即摘；旁边一个虚线「+ 标签」Popover 负责多选与新建。
- 下方 `section`（第 692–706 行）标题也叫「全局标签」，挂 `NodeTagSection`：同样的标签名再列一遍，每个可展开明细。

**判据要用的既有口径**（不新造）：

- 直系子节点数 = `graph.nodes.filter(n => n.parent === id).length`，三处已有同一算法：`App.tsx:270`、`graph/cytoscapeSetup.ts:625`、`PhysicsChainView.tsx:280`；Inspector 已经收这个数（`childCount` 入参，画布页 `App.tsx:887` 传、链页 `PhysicsChainView.tsx:558` 传）。
- 「有子节点的模块不自己挂标签，它的标签是子图叶子标签的并集、由前端派生」已写在主规格 `graphify-graph-annotations`「标签只服务参数」；物理链生成物正是派生结果：12 个块里 11 个带标签（`block:galaxy` 19 个、`block:halobox` 18 个、`block:ionization` 18 个）。

**自检环境**：`Graphify/scripts/check-*.mjs` 用 esbuild 直接加载 TS 模块并断言纯函数（`check-tabs.mjs` 加载 `graphStore.ts` / `hierarchy.ts`，`check-canvas.mjs` 甚至造一份假图跑渲染器）。所以"判据"必须是一个**无 React 依赖的纯函数**才进得了自检。

**"重新继承"这一半今天只落了一半**（用户口径 2026-10-01：没有子图就是叶子；建了子图就要重新继承叶子的属性）：

- 物理链页**能**显示块的并集，但那是 `build-physics-chain.mjs` 把并集**烘进生成物**的（`physics-chain.json`：20 个有子方，19 个自带 `tags` + `tagDetails`），由 `graphify-chain-param-sidebar` 认领，视图只是读它。
- 画布页（`data/graph.json`）**没有任何并集**：65 个节点里 15 个有子方，`tags` / `tagDetails` **全为空**；50 个叶子中 33 个带标签。前端也没有沿子树聚合标签的代码（`descendantIdsOf` 只用于"哪些框能装"这类判断）。
- 后果：画布上选中一个模块，面板里标签区块会是**空的**，而这次要写的只读文案却说"它只读，标签来自子图成员"——话与屏幕对不上。所以"有子图者显示当前叶子的并集"不是可选项，是这次文案成立的前提。

## Goals / Non-Goals

**Goals:**

- 面板里标签名只列一处、编辑入口只有一处（撤销带叉号那套）。
- 「谁能增删标签」有**一条**判据、只写一份代码，且能被自检逐身份验一遍。
- 只读态给出理由与去处，而不是把控件灰掉或弹出无信息提示。

**Non-Goals:**

- 不改数据格式、服务端校验、`physics-chain.json` 等生成物。
- 不改画布红点与筛选口径（那由 `graphify-graph-annotations`「标签只服务参数」管）。
- 不改容器（大框）既有"不参与标签"的行为。
- 不改链页块标签的**来源**（那份并集由生成物带、归 `graphify-chain-param-sidebar` 管，本变更只读它）。
- 不做"链页块并集标签的呈现收敛"（块最多 19 个并集标签、多数只有归属没有明细，长条怎么排见 Open Questions）。

## Decisions

### D1 保留明细区块，删掉胶囊行；「+ 标签」搬进区块标题行

`NodeTagSection` 留下并成为**唯一**的标签区块：标题行右侧放「+ 标签」Popover（原 `NodeTagEditor` 里的 Popover 原样搬过来，只去掉胶囊与 `X`），下面仍是按标签展开明细。`NodeTagEditor` 与胶囊行整体删除。

- 备选 A：反过来删明细区块、留胶囊行——**否决**：规格要求的是"列出标签（名称 + 说明）并可展开明细条目"，明细是契约的核心，胶囊只是同一份归属的第二份显示。
- 备选 B：只删胶囊、把「+ 标签」留在原来那一行（面板里仍有两个「全局标签」标题）——**否决**：留着两个标题就没解决"两处实现"，用户要撤的是那一处。

### D2 判据只写一份：`canEditNodeTags(node, childCount)`

新增 `Graphify/src/lib/tagEdit.ts`（纯 TS、无 React），导出 `canEditNodeTags`：`node.type !== 'group' && childCount === 0`。组件（`NodeTags.tsx`）与自检共同 import 它，页面里 MUST NOT 再写一遍。

- 为什么不看"有没有 tags"：有子图的节点恰恰**有**标签（并集），这条会把要禁的放过。
- 为什么不看链页的 `enterable`：那是块自己的字段（层返回 0），只在物理链页成立，换页就失真。
- 为什么必须抽成纯函数：自检要在 Node 下验它，`.tsx` 进不了现有 esbuild 加载路径。

### D3 最终可编辑性 = 页面允许编辑 AND 节点是叶子

`NodeTagSection` 收一个 `editable` 入参，由 Inspector 算：`tagsEditable !== false && canEditNodeTags(node, childCount)`。Inspector 新增 `tagsEditable?: boolean`（默认允许），物理链页（`PhysicsChainView.tsx`）传 `false`。

- 理由：链页读的是生成物，编辑类回调本来就全接在 `readOnlyNotice` 上；只按身份判，链页的叶子（成员量）会长出一个"看着能点、点了只弹提示"的勾选界面——那是这次要清掉的同一类毛病。
- 备选：链页维持现状——**否决**（同上）。

### D4 摘除手势：Popover 里取消勾选

胶囊上的 `X` 消失后，摘标签走「+ 标签」Popover（原来就能取消勾选，`NodeTags.tsx:141` 的 `toggle`）。这是本次唯一的**手势**变化。

### D5 只读文案按身份分叉

- 叶子：标题行右侧「+ 标签」，空态「还没有全局标签。点这里从注册表里选，或新建一个。」
- 有子图（模块 / 块）：标题行右侧写一句"只读 · 标签来自子图成员"，空态与有标签时都补一句"要改就去子图成员上改"。
- 容器：沿用现状（整段不出现；万一带着标签，只列明细、不可编）。

### D6 自检：新增 `scripts/check-tags.mjs`（`npm run check:tags`）

四组断言：

1. **身份**：叶子模块 → `true`；`childCount > 0` 的非容器模块 → `false`；容器（`type: 'group'`）→ `false`（含"容器且有子节点"这一格）。
2. **真数据**：读 `data/graph.json` 与 `src/generated/physics-chain.json` 数一遍，报出"可编叶子 / 只读模块 / 容器"各多少，并断言两者都非零（防止判据写反或永远 false）。
3. **只有一处**：`Inspector.tsx` 源码里 `NodeTagEditor` 不得再出现，`<NodeTagSection` 恰好一处（防第二处实现长回来；只盯组件引用，不盯文案字面量）。
4. **反面演练**（做完后临时种回）：把 `canEditNodeTags` 改成恒 `true`，自检必须红——与既有自检的"种回病看是否抓住"习惯一致。

### D7 有子图者的标签 = 当前叶子并集，现算（不落地、不缓存）

用户口径（2026-10-01，含一轮澄清与一次选择）：**没有子图就是叶子；建了子图就要重新继承叶子的属性**——继承是**现算**的：叶子有更新就跟着变；叶子被删光就**没有标签**（MUST NOT 保留删之前那份）；它自己原来那份也不参与显示（"本来的属性没那么重要"）。

1. **判据就是"有没有子图"**（D2 已如此），身份一变，可编辑性立刻变。
2. **现算**：`src/lib/tagEdit.ts` 导出纯函数 `inheritedTagsOf(nodes, id)`——子树叶子标签的并集 + 明细按叶子归并（每条带来源叶子）。有子图的节点显示的就是它算出来的结果；叶子一增一删一改，下一次渲染自然就是新值。
3. **删光就是空**：子树里没有叶子 → 算出来是空 → 显示为空。
4. **不落地**：MUST NOT 把并集写回 `tags` / `tagDetails`（载入、切页、选中节点都不写）；页面编辑不改它自己那份数据，但那份也不参与显示。所以"删除叶子"不需要任何清理或补偿动作——不需要刷新、不需要回填。
5. **链页照读生成物**：链页的块标签是生成物烘好的并集（归 `graphify-chain-param-sidebar`），链页不调 `inheritedTagsOf`——它的成员与步骤是两层，现算会算到另一层上去。

- 备选：把并集落进节点数据、删叶子时保留旧值——**否决**（用户 2026-10-01 明确选择"现算、不保留"）：保留需要额外的刷新/缓存机制，而结果（删光就没标签）反而是最自然的。
- 备选：把并集烘进生成物/生成器——**否决**：编辑叶子在页面上就能发生，不该绕一圈重新生成数据。

## Risks / Trade-offs

- 链页叶子从"能点（弹只读提示）"变成"纯文案" → 少了即时反馈。缓解：文案写清"标签来自源码扫描、这一页只读"，比弹提示更早说清。
- 源码级断言（组件引用计数）对重构敏感 → 缓解：只断言组件被引用次数与"不再引用被删组件"，不锁文案与行号。
- 块的并集标签（最多 19 个，多数无明细）在唯一区块里会更显眼地铺开 → 本变更不处理；见 Open Questions。

## Migration Plan

- 纯前端改动，无数据迁移、无接口变更；老数据（含容器带标签的历史数据）照旧可读。
- 回滚：还原 `NodeTags.tsx` / `Inspector.tsx` / `PhysicsChainView.tsx`，删 `src/lib/tagEdit.ts` 与 `scripts/check-tags.mjs`。
- 上线前跑全套：`check:tags`（新）+ `check:tabs` / `check:canvas` / `check:styles` / `check:graph` / `check:code` / `check:store` / `check:chain`。

## Open Questions

- 块的并集标签（如 `block:galaxy` 19 个）大多只有归属没有明细，唯一区块里会排成长条。是否要给它一个"成员明细折叠 / 只显示前 N 个"的呈现？纯呈现问题，可后答，不动本次规格。
