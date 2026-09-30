## 1. 排查与准备

- [x] 1.1 只读复核"还有谁注入或断言自由标签"：`Graphify/scripts/**`、`Graphify/README.md`、`Graphify/data/*.json` 草稿 — 验证：结论清单已用于后续改动；补充发现 `data/initial-conditions-draft.json` 也是复活源（改生成器后重新导出即可）、前端/服务端**无任何硬编码**（不用改码）
- [x] 1.2 备份 `data/graph.json` → `data/graph.before-prune-free-tags.json`，记录基线 — 验证：基线为注册表 52 / 无 `group` 18 / 带标签节点 38

## 2. 数据清理

- [x] 2.1 跑 `node scripts/prune-tags.mjs` 删除 18 个自由标签 — 验证：注册表 34、每条都带 `group`、无 `group` 0 个
- [x] 2.2 确认后果符合预期 — 验证：`ic:proc-cleanup` / `ic:proc-downstream` / `ic:art-inputs` / `ic:vel:proc-sample` / `ic:vel:proc-conj` 恰为无标签（另有 5 个容器本就无标签）；2LPT / vcb 的 `conditional`、参数标签与 8 条条件边 `note` 全部未受影响
- [x] 2.3 幂等复验 — 验证：再跑一次输出"无可删"，注册表与节点标签计数不变

## 3. 空壳文档与草稿

- [x] 3.1 删 `docs/notes/tags/{OMm,OMb,OMn,hlittle}.md`，4 个参数标签的 `docId` 改指 `docs/notes/graphify/G3-初始条件.md` — 验证：`node scripts/normalize-tag-rules.mjs --dry-run` 报"新绑到既有文档 0 个，新建空壳 0 篇"
- [x] 3.2 清理一次性草稿 `data/ic-annotations-repair.json`：移除注册表条目与节点挂载，只留 `conditional` / `refs` / 边 `note` — 验证：在内存里对 34 状态的图谱重放该草稿，注册表仍 34、无 `group` 0（不会复活）
- [x] 3.3 同步 `data/param-tag-docs.json` — 验证：文件内 4 个标签的 `docId` 已是 `graphify/G3-初始条件.md`，不再出现 `tags/OMm.md` 之类空壳路径
- [x] 3.4 重新导出生成器产物 `data/initial-conditions-draft.json` — 验证：草稿节点带标签数为 0（旧自由标签已清），`conditional` 仍正确落在 2LPT / vcb 上

## 4. 生成器与政策实现

- [x] 4.1 `scripts/build-initial-conditions-graph.mjs`：移除 24 处 `tags:` 声明、`LIMITS.tags/tag`、"节点未带任何标签"闸门，节点对象改 `tags: []` — 验证：`node scripts/build-initial-conditions-graph.mjs --stdout` 报"错误 0"
- [x] 4.2 负例：临时去掉 vcb 的 `conditional` → 报"节点标题写了「（可选）」但 conditional 不为真"并拒绝产出；改回后 0 错误 — 验证：报错文案与退出码符合预期
- [x] 4.3 `scripts/prune-tags.mjs`：注释改为通用政策口径（不再写死数量），并新增 `--file` 模式（无服务时直改文件，写前留快照 + `graphSchema` 校验） — 验证：本次清理即用 `--file` 完成；`--file` 与 API 两条通道写出同一结果

## 5. 断言与文档

- [x] 5.1 `scripts/check-graph.mjs`：撤掉 4 条自由标签断言，新增"注册表里没有无 `group` 的标签" — 验证：`npm run check:graph` 13 项全绿
- [x] 5.2 负例：造一份含无 `group` 标签的副本，经 `GRAPHIFY_GRAPH_FILE` 运行 → 失败、退出码 1 — 验证：失败项即"注册表里没有无 group 的自由标签"
- [x] 5.3 `README.md`：改为"标签只服务参数"，说明自由标签是历史包袱、链归属由 `topics` 与子图并集表达，补充 `prune-tags.mjs` 的 `--file` 用法与两条纪律 — 验证：README 相应小节已改写
- [x] 5.4 顺带修回因草稿整体替换而丢失的标签颜色（9 个标签） — 验证：`node scripts/color-tags.mjs --apply` → 缺 `color` 0 个；`check:canvas` 的"类别配色与表一致"恢复通过

## 6. 回归与归档

- [x] 6.1 全套回归 — 验证：`npx tsc -b` 干净、`npm run lint` 仅 2 处既有警告、`npm run build` ✓、`npm run check:code` 48 项 ✓、`npm run check:canvas` ✓、`npm run check:styles` ✓、`npm run check:graph` 13 项 ✓
- [x] 6.2 归档本变更并把 delta（两条 MODIFIED + 一条 REMOVED）同步进主 specs — 验证：`openspec validate graphify-param-only-tags --strict` 通过；归档后主 spec 出现"标签只服务参数"、不再有"流程节点的标签必须可筛且与作者源一致"
