# Tasks

## 1. 数据模型与迁移

- [x] 1.1 服务端：`meta.tags` 标签注册表（`{id, name, description, color?}`）+ 节点 `tags` 改为「注册 id 列表」并做交叉校验（未注册 id 拒绝写入并指名节点）+ 新增 `node.tagDetails`（`Record<tagId, {label, kind?, note?, ref?}[]>`）；同步 `server/schema/graph.schema.json`
- [x] 1.2 前端类型：`lib/types.ts` 增加 `TagDefinition` / `TagDetailItem` / `TagDetailMap`；`cloneGraph`（含明细逐层复制）、`emptyGraph` 按新语义更新
- [x] 1.3 迁移脚本 `scripts/migrate-global-tags.mjs`（幂等、默认 dry-run）：18 种自由文本标签按原名登记进注册表（同名合并），13 个节点的 `tags` 改写为 id；断言「带标签节点数不减、节点/关系数不变、整图过 schema」全部通过后 `--apply` 写回（含写前备份）
- [x] 1.4 导入草案兼容：草案里按**名字**写的标签，合并时匹配注册表（匹配不到则登记新标签）；注册表随合并结果一起落盘

## 2. 画布：红点与命中

- [x] 2.1 `graph/styles.ts`：新增 `node.tagged` 规则——左上角 10px 小红点（节点第二层背景位图，屏幕像素尺寸、白描边），容器不适用
- [x] 2.2 `graph/cytoscapeSetup.ts`：按「勾选的标签 ∩ 节点标签」切换 `tagged` 类（容器一律排除）；节点左上角小方区的命中判定 → `onOpenTagDetail(nodeId, tagId)`；捕获阶段的 pointerdown 守卫让红点上的按下不拖动节点
- [x] 2.3 `state/graphStore.ts`：`activeTagIds` 勾选状态 + `toggleActiveTag` / `setActiveTags`（纯视图：不入撤销栈、不落盘，默认空）
- [x] 2.4 `components/GraphCanvas.tsx`：把勾选状态接到渲染器；点红点 = 选中该节点 + 通知面板展开该标签

## 3. 顶栏与属性面板

- [x] 3.1 `components/TopBar.tsx`：「标签」弹层——标签列表 + 命中节点数 + 复选框 + 全不选；入口显示「已勾 N / 总数」与红点提示
- [x] 3.2 `components/NodeTags.tsx`：标签明细区块（名称 + 说明 + 可展开明细，条目含参数名/用法/出处且出处可点开预览）；明细按用法分组
- [x] 3.3 标签编辑改为「注册表多选 + 新建标签」，自由文本输入移除（属性面板与节点对话框都改了；节点对话框不再提交 `tags`，避免空数组抹掉归属）
- [x] 3.4 `activeTagId` 视图状态：点红点后面板自动展开该标签的明细

## 4. 首个标签「参数参与」

- [x] 4.1 `scripts/tag-parameters.mjs`（默认 dry-run）：参数名清单取自 `src/py21cmfast/wrapper/inputs.py` 的 InputStruct 子类（136 个）；按节点源码引用区间匹配，分类「赋值 / 入公式 / 开关」；跳过 docstring 与注释行（散文里的 `X=True` 不算赋值），引用落在函数定义上时扫整个函数体
- [x] 4.2 核对清单后 `--apply` 写回：登记「参数参与」标签（含说明），12 个有源码引用的节点写入归属与明细（④ 红移循环步骤、③ 备料层、图二步骤）；写前备份 `data/graph.before-param-tag.json`
- [x] 4.3 断言与打印：每个被标节点至少 1 条明细、每条明细都有出处 file:line、整图过 schema；未被覆盖的节点不出现该标签

## 5. 验证与收尾

- [x] 5.1 `tsc -b` + eslint + `npm run check:canvas`（新增 8 条红点断言：未勾选没有红点 / 命中才挂类 / 容器不挂 / 数据带 tagIds / 点红点命中 / 点中心不命中 / 取消即熄灭）+ `npm run check:styles` + `npm run build` 全通过
- [~] 5.2 服务端已重启并加载新 schema：`/api/graph` 返回 57 节点 / 19 个注册标签 / 12 个「参数参与」节点（含明细）；`POST /tags`（201、同名复用 200）、`DELETE /tags/:id`（200 且注册表回到 19 项）、给节点写未注册标签（400 且报错点名「节点(atlas:fig1:entry:cli) 引用了未注册的标签：tag:不存在」）逐条实测通过。**待你在浏览器核对**：勾选 → 红点 → 点红点 → 面板明细 → 出处预览
- [x] 5.3 更新 `Graphify/README.md`（标签模型、红点读法、参数参与的口径与覆盖范围、两个脚本用法）与 `docs/LLM_API.md`（标签注册表契约、草案按名字写标签、tagDetails 不随草案写入、注册表端点）
