## Why

现有主图谱是一棵「Nion 积分」物理分解树（59 节点 / 3 话题），回答的是「电离光子预算怎么算」；而代码本身（`src/py21cmfast/src` 的 31 个 C 计算单元）没有任何自顶向下的逻辑拓扑，读代码只能沿函数调用链平铺地看。需要一棵按「代码执行阶段」组织的框架树：每一层只给最粗糙的骨架，下一层用同一逻辑再拆，把繁琐细节压到树的末端。

## What Changes

- **新增框架文档** `docs/notes/CODE_TOPOLOGY.md`：自顶向下承载整棵代码拓扑树，章节与树节点一一对应（顶层阶段用 H2，逐层 H3/H4/H5）；每节先写「这一层最粗糙的骨架是什么、下一层交给谁」，函数名、参数值、行号只出现在最末层。
- **新增大纲** `Graphify/data/code.outline.json`：话题注册表按代码执行阶段切分，扁平节点用 `parent` 表达层级，引用只写标题文本或正则。
- **新增生成器** `Graphify/scripts/build-code-graph.mjs`：以既有 Nion 生成器为蓝本，输入/输出路径参数化指向 `code.outline.json` / `code-draft.json`，分层深度上限由大纲声明（本树为 5），逐条保留锚点解析与歧义、超长字段、单父、DFS 无环、不可达节点、话题未注册等校验，任一问题报错退出。
- **BREAKING**（图谱内容）：`Graphify/data/graph.json` 被 `import-graph.mjs --replace` 覆盖为代码拓扑树，现主图不再默认显示。原图可由 `node scripts/build-nion-graph.mjs && node scripts/import-graph.mjs data/nion-draft.json --replace` 一行命令重建，且写入前会自动快照到 `Graphify/data/history/`，界面历史面板可回滚。
- **文档登记** `docs/DIRECTORY.md`：§1 目录树、§2 权威分工表、§7 变更记录、§8 图谱说明四处同步，并保留原主图的重建方式。
- 不改服务端 schema、不改前端源码、不引入新依赖。

## Capabilities

### New Capabilities

- `graphify-code-topology`: 代码逻辑拓扑树本身的口径与保证——递归同构的分层规则（每层只给最粗糙框架、细节只在末端、不等深 3–5 层）、顶层按代码执行阶段切分且覆盖范围内的全部计算单元、话题切分与可见预算相容、文档章节与树节点一一对应且锚点由标题回填（零失配）、大纲 + 生成器一条命令可重建。

### Modified Capabilities

- `graphify-tree-authoring`: 「深度与规模约束」由写死的 4 层改为**由大纲声明的上限**（Nion 树声明 4、代码拓扑树声明 5），并明确「根节点直接子节点数固定」只适用于 Nion 主话题；「主话题不使用语义边」由仅指 Nion 主话题泛化为**所有人工作策的主树**（含代码逻辑拓扑主树）都零边。

## Impact

- 新增：`docs/notes/CODE_TOPOLOGY.md`、`Graphify/data/code.outline.json`、`Graphify/data/code-draft.json`（生成物）、`Graphify/scripts/build-code-graph.mjs`
- 修改：`Graphify/data/graph.json`（主图被覆盖）、`docs/DIRECTORY.md`
- 不变：`Graphify/server/**`（schema 已支持话题与多归属）、`Graphify/src/**`（前端运行时行为不变）、Python/C 源码、构建产物
- 验证手段：`node scripts/build-code-graph.mjs --stdout`（零落盘预览统计与逐条锚点解析）、`node scripts/import-graph.mjs data/code-draft.json --dry-run`（差异预览）、`npx tsc -b` 与 `npx eslint src scripts`（前端回归）
