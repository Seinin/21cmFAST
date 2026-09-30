## Why

节点现在只有一个自由文本 `tags` 字段（图集导入时打的 18 种字符串）：既不能全局查看、不能按标签筛选，也没有地方记录「这个标签在**这个节点**上具体意味着什么」。作者要的是**全局标签**——图级注册的一类标签，勾选后在有该标签的模块左上角点亮小红点，点开后在属性面板看该标签在此节点的明细。

第一个要落的标签是**「参数参与」（用户参数 + 宇宙学参数）**：标出哪些模块里有参数参与——赋值、进入公式、当开关——这是读 21cmFAST「参数怎么影响结果」的起点。

## What Changes

- **图级标签注册表** `meta.tags`：`{ id, name, description, color? }`。节点通过**标签 id** 关联——`node.tags` 从自由文本改为注册表 id 列表（**BREAKING**：数据一次迁移，现有 18 种文本按原名注册；改名不再丢归属）。
- **节点标签明细** `node.tagDetails`：`Record<tagId, TagDetailItem[]>`，`TagDetailItem = { label, kind?, note?, ref? }`——标签在**该节点**上的具体内容（如：参数名 · 用法（赋值/入公式/开关）· 出处 file:line）。
- **顶栏「标签」弹层**（与「话题」并列）：标签列表 + 复选框 + 命中节点数；勾上的标签在画布上点亮红点。
- **画布红点**：持有任一被勾选标签的模块，**左上角出现小红点**；不新增 DOM 覆盖层（用节点背景位图定位左上角，随缩放一起走）。
- **属性面板标签区块**：列出该节点的标签与它们的明细；**点画布红点 = 选中该节点并展开对应标签的明细**（出处可点开源码/笔记预览，复用现有引用预览链路）。
- **编辑器**：属性面板的标签输入从「自由文本」改为「从注册表多选 + 可新建标签」。
- **首个标签的数据**：`参数参与` 先覆盖**源码引用齐全**的节点（S09 初始条件、④ 红移循环、③ 备料层等），明细由脚本从节点引用的源码区间提取（赋值 / 入公式 / 开关），其余节点先留空、以后再补。

## Capabilities

### New Capabilities

- `graphify-global-tags`: 图级标签注册表与节点标签归属、顶栏标签勾选、画布红点标记、属性面板标签明细，以及首个标签「参数参与」的数据形态与提取口径。

### Modified Capabilities

（无。基线 specs 里没有与节点标签 / 标签注册表相关的需求；画布红点是新能力的一部分，不改动既有 requirement。）

## Impact

- **服务端**：`server/lib/schema.mjs`（新增 `meta.tags` 注册表；节点 `tags` 改为注册 id 校验；新增 `tagDetails`）、`server/routes/graph.mjs`（节点创建/更新时的标签与明细校验）、`server/schema/graph.schema.json`、导入草案契约（草案里仍可按标签**名字**写，合并时匹配/登记注册表）。
- **数据**：`data/graph.json` 一次迁移（18 种文本 → 注册表，节点改存 id）；新增脚本 `scripts/tag-parameters.mjs` 从源码引用提取「参数参与」明细并写回。
- **前端**：`src/lib/types.ts`（`TagDefinition` / `TagDetailItem`）、`state/graphStore.ts`（勾选状态，纯视图、不入撤销栈）、`components/TopBar.tsx`（标签弹层）、`graph/cytoscapeSetup.ts` + `graph/styles.ts`（红点标记与命中）、`components/GraphCanvas.tsx`（点红点 → 选中并展开明细）、`components/Inspector.tsx`（标签区块 + 多选）、`components/EntityDialogs.tsx` / `ImportDialog.tsx`（标签输入）。
- **不新增依赖**；服务端改动需要重启 dev 服务才生效。
