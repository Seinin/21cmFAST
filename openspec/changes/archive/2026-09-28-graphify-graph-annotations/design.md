## Context

- 图谱数据在 `Graphify/data/graph.json`，由服务端 schema 校验；写回通道是 `POST /api/graph`，脚本侧入口是 `node scripts/import-graph.mjs <draft.json> [--dry-run]`，合并逻辑在 `Graphify/server/lib/mergeDraft.mjs` 的 `applyDraft`。
- 已核实 `applyDraft` 的性质：既有节点按 id（退化按 label）合并、**坐标不更新**、`tags` 走 `unionTags` 并集、`refs` 走 `unionRefs` 并集、未知标签名由 `resolveTagId` 自动登记进 `graph.meta.tags`、`conditional` 在节点与关系两个分支都会随草案更新。
- 现状（`data/graph.json`）：22 个 IC 节点标签全空、源码引用 0 条；只有 `ic:proc-vcb` 是 `conditional: true`；注册表 25 条全是 `tag:<PARAM>`。
- 标签的唯一自动来源是 `scripts/scan-param-tags.mjs`：从节点源码引用所在函数体里扫参数名（**只认 Python**：`enclosingDefLine` 对 C 返回 null、`functionRange` 按缩进），并把 `meta.tags` 整体重写成自己扫出的那批。
- 画布语义（不改，只依赖）：`conditional` ⇒ 虚线（`src/graph/styles.ts:147/395`）；标签 ⇒ 可筛选并亮红点；`check:canvas` 断言"不在配色表里的标签必须没有 color"。
- 丢失原因（诊断已定）：一支已删除的一次性重构脚本重建 IC 节点时没带 `tags`；IC builder 从不产出 `conditional`；构建与检查都只看格式，不看语义。

## Goals / Non-Goals

**Goals:**
- 把 IC 链（含 2LPT）的标签与可选性补回数据，且**不动版面、不动文案**（只写要改的字段）。
- 让"标签"与"可选性"这两类标注在**生成器**里有表达（spec 字段 + 校验闸门），以后不会静默丢失。
- 让参数标签对 IC 链也能自动产出：扫描器支持 C 函数体，且重扫不再缩水。

**Non-Goals:**
- 不重跑全量 IC 构建（会冲掉手摆版面）。
- 不改前端渲染（虚线、红点都是既有行为）。
- 不追求"所有节点都有标签"——只对生成器产出的流程节点强制；分组容器与图外节点不在闸门范围内。
- 不重命名已有标签或补 `color`。

## Decisions

**1. 走草稿合并通道补数据，而不是直改 `data/graph.json`。**
理由：`applyDraft` 明确保护坐标、按 id 幂等合并、自动登记新标签；直改文件会绕过 schema 校验，也可能与运行中的 dev 服务状态打架。
备选：重跑 `build-initial-conditions-graph.mjs` 再导入 —— 否决，它产出的是**重构前**的节点集合（24 个 id，其中 11 个产物节点已退休），会重新长出一批节点并把版面打乱。

**2. 标签修复以 builder 源码为准，逐条抄，不凭记忆。**
理由：`build-initial-conditions-graph.mjs` 的 PROCESSES / PRODUCTS 是这批标签的唯一权威来源（那次丢失没有别的副本），且检查脚本要用它做对照（同源）。
备选：从旧备份 `graph.before-param-tag.json` 恢复 —— 否决，那份是重构前的节点集合，且标签已被改成 `tag:初始条件` 这种把名字也算进 id 的形态，与现在的 `meta.tags` 命名风格不一致。

**3. 自由标签不带 `color`。**
理由：`check:canvas` 的断言要求"不在配色表里的标签必须没有 color 或等于兜底色"，带色即失败；这类标签只作筛选，不需要配色。

**4. 可选性同时标在节点与关系上。**
理由：图上的"条件"是节点 + 边的联合语义（`cytoscapeSetup` 对两者分别切换 class）；只标节点会出现"虚线节点连着实线边"的怪画面。2LPT 支路的依据是 `outputs.py:563`（含 591/601/624/635）与 `InitialConditions.c:366-544`。

**5. 补引用优先 Python 落点，C 落点等扫描器扩展后再补。**
理由：`outputs.py` 的 2LPT / vcb / `PERTURB_ON_HIGH_RES` 分支今天就能被扫描器命中（Python 函数体 + 参数名出现在同一函数内），一次投入立刻见效；C 落点需要先给扫描器加花括号函数范围识别，属于同一批改动但收益要靠 dry-run 验证（C 侧参数名是否与 `inputs.py` 字段同名）。
备选：只补 C 引用 —— 否决，今天产不出标签，等于把"能自动产出"这条契约悬空。

**6. 扫描器改"只增不减"，并把 C 识别做成函数级而非整文件级。**
理由：整文件扫描会把无关参数也算进节点；函数级与 Python 侧口径一致。C 侧用"向上找函数定义 + 花括号配对"求区间；C 里没有 `def`，签名判定用"行尾 `)` 后跟 `{` 且不在注释内"这一宽口径，靠 dry-run 观察命中质量。
备选：沿用缩进 —— 对 C 无意义。

**7. 检查落在新脚本 `scripts/check-graph.mjs`（`npm run check:graph`）。**
理由：`check:canvas` 关注渲染与配色，`check:graph` 关注数据语义；分开后可单独跑，也避免往画布检查里塞数据断言。
备选：扩展 `check:canvas` —— 否决，职责混杂。

## Risks / Trade-offs

- [C 侧参数名与 `inputs.py` 字段名不同（大小写 / 结构体前缀差异）导致扫不出标签] → 先 dry-run 观察命中情况；不命中就调整识别规则，绝不硬造标签；实在产不出就只保留 Python 落点，并把结论写进 tasks 的验证记录。
- [每个节点补引用撑大检查器噪音或撞 `LIMITS.refs`] → 每个节点新增引用控制在 1–2 条，优先 Python 落点。
- [草稿里误写 `label` / `summary` 会顺带改写文案] → 修复草稿只写要改的字段（`tags` / `conditional` / `refs`），不写 `label` / `summary` / `position`。
- [关系靠 `label` 匹配，文案不一致会新建一条重复边] → 三条 2LPT 边的 `label` 从现有图谱原样抄（`∇²φ₂（k 空间场）` 等），导入前用 `--dry-run` 确认 diff 里只有更新、没有新增边。
- [重扫 `scan-param-tags.mjs` 可能改变既有节点标签] → 改完先 dry-run，对比"将新增 / 将保留"，确认无删除再 `--apply`。

## Migration Plan

1. 备份：把当前 `data/graph.json` 复制为 `data/graph.before-ic-annotations.json`（仓库既有惯例）。
2. 写修复草稿 → `node scripts/import-graph.mjs data/ic-annotations-repair.json --dry-run`：确认 diff 只有「更新 22 个节点 + 更新若干关系」，无新增节点 / 重复边。
3. 正式导入 → `curl /api/graph` 回读，核对 IC 节点的 `tags` / `conditional`、2LPT 边的 `conditional`、`meta.tags` 含有 IC 链用到的标签。
4. 扫描器改动 → `node scripts/scan-param-tags.mjs`（dry-run）看命中，必要时 `--apply`。
5. 新增 `check:graph` 与 builder 闸门 → 跑 `check:graph`、`check:canvas`、`check:code`、`check:styles`、`tsc -b`、`lint`、`build`。

回滚：把 `data/graph.before-ic-annotations.json` 复制回 `data/graph.json` 并在界面上刷新（或走同一条导入通道写回）。

## Open Questions

- IC 链 5 个分组节点挂「初始条件」后，是否也需要在检查器里显示为可筛选的父级？当前实现只作容器，标签仅用于筛选，不亮红点 —— 若将来要改渲染，另立变更。
- vcb 支路的关系是否全部应标 `conditional`（节点已确认）：实施时按"该关系是否只在 vcb 开启时成立"逐条判断，结论记录在 tasks 的验证里。
