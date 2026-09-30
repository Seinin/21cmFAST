## 1. 深度上限参数化与生成器

- [x] 1.1 让 Nion 生成器改读大纲声明的 `meta.maxDepth`，并在 `Graphify/data/nion.outline.json` 的 `meta` 里显式写上 `"maxDepth": 4`；验证 `node scripts/build-nion-graph.mjs` 仍报告上限 4 层，且产物与改动前**逐字节一致**（`diff` 无输出：59 节点 / 0 关系 / 106 条锚点）。实施中把「缺失时兜底 4」改成「缺失即报错退出」，避免上限以隐形常量的形式留在代码里
- [x] 1.2 新增 `Graphify/scripts/build-code-graph.mjs`：输入/输出指向 `data/code.outline.json` / `data/code-draft.json`，深度上限取自大纲的 `meta.maxDepth`，逐条保留锚点解析与歧义、超长字段、类型、单父、DFS 无环、不可达节点、话题未注册等校验与 `--stdout`/`--anchors`/`--topics[=id]` 开关；对一份刻意写坏的临时大纲（悬空 parent、超深节点、未注册话题、解析不到的标题各一处）实测**四条错误逐条列出**、退出码非零且不产出草案

## 2. 框架文档

- [x] 2.1 用 code-explorer 递归阅读 31 个计算单元，产出 `docs/notes/CODE_TOPOLOGY.md`：顶层阶段用 H2、逐层用 H3/H4/H5/H6，每节先写「本层最粗糙的骨架 + 下一层交给谁」，函数名/参数/行号只出现在该分支末节；实测 183 个标题（含文档 H1 与附录 H2）、无重复标题、最长标题 30 字
- [x] 2.2 把 31 个计算单元与节点逐项比对：31 个单元全部出现在某条从根到叶的路径上（脚本核验 `.c` 名全覆盖）、无遗漏；并脚本核验「`关键函数`/`关键量` 只出现在没有子节点的分支末节」——36 处命中全部是叶子节点

## 3. 大纲策划与编译

- [x] 3.1 产出 `Graphify/data/code.outline.json`：`meta.maxDepth = 5`，**11 个阶段话题**（`code-inputs`/`code-cosmo`/`code-hmf`/`code-ic`/`code-perturb`/`code-structure`/`code-sources`/`code-ion`/`code-thermal`/`code-output`/`code-crosscut`），181 个扁平节点用 `parent` 表达层级，`refs` 只写标题正则。实施中新增 `scripts/export-code-outline.mjs` 把文档导出成大纲（唯一人工来源是文档），因此大纲不是手写的
- [x] 3.2 运行 `node scripts/build-code-graph.mjs --stdout`：锚点 **181/181 命中**、无环、实测最大深度 5（L1 11 / L2 49 / L3 61 / L4 52 / L5 8）、每话题成员数 7–25（最宽 `code-thermal` = 25）、话题数 11 ≤ 12、零边；重跑导出与生成产物逐字节一致（幂等）

## 4. 覆盖导入与文档登记

- [x] 4.1 运行 `node scripts/import-graph.mjs data/code-draft.json --dry-run` 预览差异：`节点 +181 / 更新 0`、`关系 +0`，无被跳过的条目
- [x] 4.2 运行 `node scripts/import-graph.mjs data/code-draft.json --replace` 覆盖主图：写后回读校验两侧一致（落盘与服务端各为「话题 11 · 归属 181 · 节点 181 · 引用 181 · 关系 0」），历史里多出一条 `cli:import` 快照 `graph-2026-09-19T11-52-40-787Z.json`
- [x] 4.3 同步 `docs/DIRECTORY.md`：§1 目录树加入 `CODE_TOPOLOGY.md`、§2 分工表声明它是「代码逻辑拓扑」的唯一权威、§7 变更记录追加本次（含顺带修复的围栏问题）、§8 主图改写为代码拓扑树并把 Nion 树降为 §8.2 备选（保留其重建命令）

## 5. 验证与归档

- [x] 5.1 前端回归：`npx tsc -b` 无输出（退出码 0）；`npx eslint src scripts` 0 error（仅 2 条既有 warning，位于本次未触碰的文件）；本次未改 `Graphify/server/**` 与 `Graphify/src/**`，无需重启 dev 服务（导入时的服务端探测已顺带证明服务端读回一致）
- [x] 5.2 运行 `openspec validate --all`（本 change 与全部主 spec 通过；唯一失败的 `fix-fdm-soliton-scalings` 是本次之前就存在的、与本变更无关）与 `openspec validate add-code-topology-tree --strict`（通过）
- [x] 5.3 用 openspec-archive-change 归档本 change：同步 delta spec 进主 spec（新建 `graphify-code-topology`、修改 `graphify-tree-authoring`），change 移入 `openspec/changes/archive/`
