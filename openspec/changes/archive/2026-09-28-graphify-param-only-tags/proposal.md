## Why

图谱的「标签」功能现在混着两类东西：**参数标签**（一个参数一个标签，由 `scan-param-tags.mjs` 从源码引用扫出）与**历史遗留的自由标签**（「初始条件」「2LPT」「C: rng.c」「仅 CLASS」「S10」…共 18 个）。后者粒度混乱、跟参数筛选混在一起，在顶栏弹层里表现为一整档"未分类"。

而**仓库早已定过政策**：`scripts/prune-tags.mjs` 的文件头写着"只保留「参数」标签，其余标签一律删除……现在约定这个功能只服务**参数**"。也就是说这批自由标签本不该存在，只是被一次性重构脚本抹掉后、又在本次会话里被"恢复"了回来（那一步逆着政策）。

现状实测：注册表 52 条 = 34 个参数标签（带 `group`）+ **18 个无 `group` 的自由标签**；生成器 `build-initial-conditions-graph.mjs` 里仍有 24 处 `tags:` 声明，**不清掉下次构建就会把它们长回来**；`check:graph` 里还留着 4 条以这批自由标签为前提的断言。

## What Changes

- **数据清理**：执行既有工具 `scripts/prune-tags.mjs`（其判据就是"保留有 `group` 的，其余从注册表、节点 `tags`、`tagDetails` 三处一并摘掉"）。注册表 52 → 34，无 `group` 标签归零。改前留 `data/graph.before-prune-free-tags.json`。
- **可接受的后果**：5 个只有主题标签的节点变为无标签（`ic:proc-cleanup`、`ic:proc-downstream`、`ic:art-inputs`、`ic:vel:proc-sample`、`ic:vel:proc-conj`）；链归属信息继续由 `topics`（`ic-pre` / `ic-density` / `ic-velocity` / `ic-boundary`）与容器子图并集表达。
- **生成器不再产标签**：移除 `build-initial-conditions-graph.mjs` 里 24 处 `tags:` 声明与"节点未带任何标签"这条闸门（保留"标题写（可选）必须给 `conditional`"）。
- **断言从"具体对照"改为"政策门"**：`check:graph` 撤掉 4 条自由标签相关断言，**新增**"注册表里不得存在无 `group` 的标签"——让"再引入自由标签"直接失败。
- **空壳文档无损清理**：删 `docs/notes/tags/{OMm,OMb,OMn,hlittle}.md`，同时把这 4 个**参数标签**的 `docId` 改指真实文档 `graphify/G3-初始条件.md`（schema 强制"每个标签都必须有文档"，直接删文档就得删标签，而删标签下次扫描又会长出来）。
- **防复活**：清理一次性草稿 `data/ic-annotations-repair.json`（里面还写着这 18 个标签），避免有人重跑 `apply-annotations.mjs` 时把它们带回来。
- **文档与规格同步**：README 改为"标签只服务参数"；本变更修正主规格里两条与之冲突的要求。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-graph-annotations`：
  - "流程节点的标签必须可筛且与作者源一致" → 改为 **"标签只服务参数"**（注册表只保留带 `group` 的参数标签；节点标签来自源码引用扫出的参数标签；生成器不再声明标签、也不再因标签为空而拒绝产出；容器不挂标签的既有规则保留）。
  - "参数标签由源码引用自动产出且注册表只增不减" → 保留"扫描器只增不减"，但明确**删除只能走显式的政策通道**（`prune-tags.mjs`），扫描器自身不得删除任何标签。

## Impact

- **数据**：`data/graph.json`（`meta.tags` + 节点 `tags`/`tagDetails`）；写回经 `prune-tags.mjs` 的 `PUT /api/graph`，服务端自留快照；另存 `data/graph.before-prune-free-tags.json`。
- **脚本**：`scripts/build-initial-conditions-graph.mjs`、`scripts/prune-tags.mjs`（注释更新为通用政策）、`scripts/check-graph.mjs`；草稿 `data/ic-annotations-repair.json`、`data/param-tag-docs.json` 同步清理。
- **文档**：`README.md`（"标签"一节）、`docs/notes/tags/{OMm,OMb,OMn,hlittle}.md` 删除。
- **前端**：不改代码。效果是顶栏标签弹层里"未分类（18）"那一档消失，参数分组与红点行为不变；那 5 个节点在属性面板显示"这个节点还没有全局标签"。
- 不引入新依赖；`check:canvas` 的配色口径（不在配色表里的标签必须没有 color）保持不动——删完之后注册表里只剩参数标签，天然满足。
