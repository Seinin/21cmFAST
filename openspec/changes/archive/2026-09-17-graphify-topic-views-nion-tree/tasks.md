## 1. 接线点核实（先做，避免加字段后保存丢数据）

- [x] 1.1 用 code-explorer 产出「符号 → 文件:行号 → 一句话职责」对照清单，覆盖 `server/lib/schema.mjs` 的节点/元数据字段与校验入口、`server/lib/store.mjs` 与 `server/lib/mergeDraft.mjs` 的字段透传与深拷贝处、`src/state/graphStore.ts` 的状态形状、`src/App.tsx` 向画布与顶栏下传的属性、`src/graph/cytoscapeSetup.ts` 中 `applyCollapseState`/`collapseAll` 的实际行范围；验证：清单中每项都给出可复核的文件行号

## 2. 数据模型与服务端校验

- [x] 2.1 在 `src/lib/types.ts` 增加 `Topic` 接口、`GraphNode.topics`、`GraphMeta.topics`，并在 `cloneGraph()` 深拷贝新字段；验证：`npx tsc --noEmit` 通过且 `cloneGraph` 产物修改原图不影响副本
- [x] 2.2 在 `server/lib/schema.mjs` 的节点 schema 增加 `topics`（数组、单项 ≤40 字符、≤12 项、缺省 `[]`），在元数据 schema 增加话题注册表，并校验节点话题 id 必须存在于注册表；验证：构造含未注册话题 id 的图谱时校验报错且错误信息含节点 id
- [x] 2.3 核对保存/加载链路上新字段不丢失，旧图（无 `topics`）仍可打开；验证：一次「保存 → 重载」往返后话题归属与注册表完全一致，且骨架视图草案可正常导入

## 3. 话题视图的交互与可见性

- [x] 3.1 在 `src/state/graphStore.ts` 增加 `activeTopicId` 与 setter，明确其不进入 undo 栈；验证：切换话题后撤销栈长度不变
- [x] 3.2 在 `src/components/TopBar.tsx` 参照既有布局选择器的下拉样板加入「话题」选择项，显示当前话题与各话题可见节点数；验证：界面上可切换话题且条目显示数量
- [x] 3.3 在 `src/App.tsx` 用 `useMemo` 计算当前话题可见集（成员 ∪ 祖先闭包）并下传画布；验证：选中一个「父级不在本话题」的节点所在话题时，其祖先仍在可见集内
- [x] 3.4 在 `src/graph/cytoscapeSetup.ts` 增加话题过滤入口，并把「话题隐藏」与「折叠隐藏」合并到同一处可见性计算；验证：切换话题不残留上一话题节点、无悬空父子关系告警
- [x] 3.5 在 `src/components/GraphCanvas.tsx` 于初次加载与话题切换后按新可见集重排一次；验证：往返切换话题后同一节点位置不变
- [x] 3.6 在 `src/components/Inspector.tsx` 显示节点所属话题 chips 并可点击切换；验证：查看多归属节点时列出全部话题且点击即切图

## 4. 收纳与默认折叠深度

- [x] 4.1 让容器折叠能力支持深度参数，初始折叠深度设为 1（可见「根 + 两个乘子」= 3 个方块），「全部收起」保持只留顶层；验证：首次打开 Nion 主话题时画布恰有 3 个方块
- [x] 4.2 验证任意深度容器可收起/展开且方块标题含「名称 · 后代数量」；验证：双击第 3 层容器后其后代全部隐藏、再双击恢复

## 5. 主图重建（大纲 v2 + 生成器）

- [x] 5.1 把 `data/nion.outline.json` 改为 v2 格式（话题注册表 + 扁平节点），写入主话题四层约 40 节点（根严格两个乘子、零边）、实现话题与待确认话题；验证：JSON 可解析且根节点只有两个直接子节点
- [x] 5.2 重写 `scripts/build-nion-graph.mjs`：适配 v2 大纲，在既有锚点零失配与超长字段报错之外新增单父、无环、深度 ≤4、话题引用存在与话题闭包校验，并支持 `--topics` 预览某话题可见集与顶层方块数；验证：`--stdout` 运行时锚点解析零失配、警告为 0，人为制造环时脚本报错退出
- [x] 5.3 生成草案并核对统计（节点总数、各话题规模、深度分布、边数为 0）；验证：`node scripts/build-nion-graph.mjs` 输出的统计与大纲一致
- [x] 5.4 先 `--dry-run` 再 `--replace` 覆盖主图；验证：替换后逐话题检查顶层方块数与节点数，`data/history/` 新增快照

## 6. 收尾验证与文档

- [x] 6.1 端到端校验：落盘图谱通过服务端 schema 校验，`npm run build` 与 `npx eslint src scripts` 无新增问题；验证：命令输出为通过且 error 数为 0
- [x] 6.2 更新 `docs/DIRECTORY.md` §8.1（两乘子树、话题机制、默认折叠深度、重建命令）与 §7 变更记录；验证：文档中的重建命令可照抄执行成功
- [x] 6.3 归档本次 change 并确认主 specs 同步；验证：change 移入 `openspec/changes/archive/`，`openspec status` 无残留待办
