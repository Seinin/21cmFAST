## Context

见 proposal.md。技术侧的关键现状：

- 政策实现已存在：`scripts/prune-tags.mjs` 的判据是 `keepIds = tags.filter(tag => (tag.group ?? '').trim())`，从注册表、节点 `tags`、`tagDetails` 三处摘除，经 `PUT /api/graph` 写回，幂等；它的文件头明确写着"只保留参数标签，其余一律删除"。
- 生成器 `scripts/build-initial-conditions-graph.mjs` 仍声明 24 处 `tags:`（`L81-307`），并有"节点未带任何标签"闸门（`L412` 附近）；`pushNode` 把这些写进草稿。
- 检查脚本 `scripts/check-graph.mjs` 有 16 条断言，其中 4 条以自由标签为前提（叶子标签非空、与 builder 声明一致、注册表含自由标签、2LPT 保留 `tag:2LPT`），3 条是 flag/可选性（用参数标签，天然继续有效），其余是注册表硬规则与幂等性。
- 一次性草稿 `data/ic-annotations-repair.json` 仍写着这 18 个标签 + 它们的 `docId`；`data/param-tag-docs.json` 记录着 4 个宇宙学参数标签的 `docId`（当前指向 `docs/notes/tags/*.md` 空壳）。
- schema 两条硬规则（`server/lib/schema.mjs`）：每个标签必须有 `docId`；有子节点的模块不挂标签。

## Goals / Non-Goals

**Goals:**
- 让 `data/graph.json`、生成器、断言、文档、规格五处**一致地**表达"标签只服务参数"。
- 保证删除**不再被任何通道复活**（生成器声明、一次性草稿、扫描器）。

**Non-Goals:**
- 不动 IC 链的容器/重复份/版面（不重跑 `restructure-ic-product-chains.mjs` 那类一次性脚本）。
- 不给参数标签补文档正文（空壳之外的内容由既有 `normalize-tag-rules.mjs` 机制维持）。
- 不改前端渲染；"链归属"的可视化若将来要做，走 `topics` 或子图并集，另立变更。

## Decisions

**1. 用现成的 `prune-tags.mjs`，不新写删除逻辑。**
理由：它就是这条政策的实现（判据、幂等、API 通道、注释背景都齐）；新写一份会与它分叉，且以后两处口径会漂移。
备选：写一次性删除脚本 —— 否决。

**2. 空壳文档采用"改指真实文档后删文件"。**
理由：这 4 篇空壳属于 4 个**参数标签**（`group: CosmoParams`），而 schema 强制"每个标签都必须有 `docId`"。只删文件 → 立刻违反 schema（服务端拒绝加载）；连标签一起删 → 下次扫描又扫出来、又没文档 → 写回被拒（死锁）。改指 `docs/notes/graphify/G3-初始条件.md`（该文档确实讨论 `OMb` / `hlittle` / `OMm`）既消掉空壳，又不丢标签、不破管道。
备选：保留空壳（违反用户"删了"的指示）；给扫描器加"忽略参数清单"（新机制，超出本次范围，需要时另立任务）。

**3. 生成器停止声明标签，并去掉"标签非空"闸门。**
理由：标签的唯一来源改为扫描器（参数标签）；生成器若继续要求标签非空，就会逼着别人把自由标签写回去。保留"标题含（可选）⇒ conditional"这条闸门（与本政策无关，仍需要）。
备选：让生成器声明参数标签 —— 不行，参数标签必须由源码引用推出，手写会与代码漂移。

**4. 断言从"具体对照"升级为"政策门"。**
理由：撤掉依赖自由标签的 4 条，新增"注册表里没有无 `group` 的标签"，把政策写成会失败的门（这正是"自动构建注意不到"那类缺口）。flag 踪迹两条保留（`PERTURB_ALGORITHM` / `USE_RELATIVE_VELOCITIES` 都是参数标签）。
备选：只删不加 —— 政策无法自动守住，否决。

**5. 一次性草稿同步清理。**
理由：`data/ic-annotations-repair.json` 里那 18 个标签是"复活源"；不清掉，任何人重跑 `apply-annotations.mjs` 都会把它们带回来。清掉后该草稿只保留 `conditional` / `refs` / 边 `note`（这些仍是有用的修复记录）。

## Risks / Trade-offs

- [5 个节点变为无标签，界面出现"还没有全局标签"] → 用户已确认接受；链归属改由 `topics` 与子图并集表达。
- [有人以后又把自由标签写进草稿] → `check:graph` 的"无 `group` 即违规"会直接失败；`prune-tags.mjs` 可再清理。
- [`ONn` 在任何真实文档里都没出现（只有它自己那篇空壳）] → 该标签的 `docId` 改为 `graphify/G3-初始条件.md` 后仍不满足"文档里真的讲了它"，但满足 schema 的硬规则且比空壳更接近"有处可查"；如果将来要更严格，应给该参数补一篇真正的说明。
- [删除后 specs 与数据不一致的历史窗口] → 本变更同批修正主规格，归档后即一致。

## Migration Plan

1. 备份 `data/graph.json` → `data/graph.before-prune-free-tags.json`。
2. `node scripts/prune-tags.mjs`（先看输出，再确认落盘）→ 回读 `/api/graph` 核对：注册表 34、无 `group` 标签 0、5 个节点归零。
3. 删 4 篇空壳文档；把 4 个参数标签的 `docId` 改指 `graphify/G3-初始条件.md`（草稿 + `apply-annotations.mjs`）→ `normalize-tag-rules.mjs --dry-run` 必须报 0 新建。
4. 生成器移除 24 处 `tags:` 与标签闸门 → `--stdout` 校验 0 错误 + 负例（去掉 conditional 必须报错）。
5. `check-graph.mjs` 撤 4 条、加 1 条 → 全绿 + 负例（含无 `group` 标签的副本必须失败）。
6. README 改写；全套回归（`tsc` / `lint` / `build` / `check:code` / `check:canvas` / `check:styles` / `check:graph`）。
7. 归档本变更，同步主 specs。

回滚：`cp data/graph.before-prune-free-tags.json data/graph.json` 后重启服务（或走界面「历史」回滚到对应快照）。

## Open Questions

- 将来是否要给"链归属"一个一等公民（例如容器上的只读徽标、或把链做成 `topics` 下的视图）？本次不做，若要做另立变更。
- 那 5 个无标签节点是否值得补源码引用（从而拿到参数标签）？属于数据增补，另立任务时再评估。
