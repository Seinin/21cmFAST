## 1. 排查与准备

- [x] 1.1 只读探查三处落点：`scripts/lib/ic-chains.mjs` 的 `IC_DUPLICATES`（4 条映射：`ic:vel:proc-sample`→`ic:proc-sample`、`ic:vel:proc-conj`→`ic:proc-conj`、`ic:vcb:proc-sample`→`ic:proc-sample`、`ic:vcb:proc-conj`→`ic:proc-conj`）、`scan-param-tags.mjs` 的 C 改造点（`enclosingDefLine` / `functionRange` / `stringMask` / `PROSE` 四处）、`check-canvas.mjs` 读图方式（`fs.readFile('data/graph.json')` + esbuild 载入 palette）— 验证：探查结论已用于后续实现，未二次试探
- [x] 1.2 备份图谱并记录基线 — 验证：`data/graph.before-ic-annotations.json` 存在，基线与现状计数一致（IC 标签非空 0、`conditional: true` 的 IC 节点 1、注册表 25）

## 2. 数据修复（走草稿合并，不动版面）

- [x] 2.1 写 `data/ic-annotations-repair.json`：12 个 `ic:proc-*` + `ic:art-inputs` 的标签逐条**从 builder 源码解析**（不手抄）；4 个重复份按 `IC_DUPLICATES` 继承同名原份；只写 `tags` / `conditional` / `refs` — 验证：`apply-annotations.mjs --dry-run` 显示「节点 +0 / 更新 17、关系 +0 / 更新 8」——无新增节点（11 个已退休的 `ic:art-*` 未混入）
- [x] 2.2 同一份草稿标 `ic:proc-2lpt-phi` / `ic:proc-2lpt-v` 与三条 2LPT 关系、以及 vcb 支路的两个重复份与五条关系（`conditional: true`；关系 label 从现有图谱原样抄）— 验证：dry-run 中这些全是 update、没有新增边；导入后回读 8 条关系全部 `conditional`
- [x] 2.3 给 IC 过程节点补源码引用：Python 落点（`outputs.py:563` / `:591` / `:576`）+ C 落点（`rng.c:30-89`、`cosmology.c:536-545`、`InitialConditions.c` 各步骤区间，取自 `docs/notes/INITIAL_CONDITIONS.md` 的标题）— 验证：回读 `ic:proc-seed` = `rng.c:30-89`、`ic:proc-2lpt-phi` = `outputs.py:563` + `InitialConditions.c:366-544` 等 11 个节点全部有源码引用
- [x] 2.4 导入并回读校验 — 验证：`ic:*` 叶子 17/17 带标签；2LPT 两节点与三条边、vcb 两节点与五条边均 `conditional: true`；注册表 25 → 43；每个标签都有 `docId`；自由标签不带 color
- [x] 2.5 幂等复验 — 验证：再应用一次，节点/关系数量不变、标签不重复（`check:graph` 的"标签列表不重复"断言亦通过）

## 3. 生成器与扫描器（让构建能表达、能发现）

- [x] 3.1 `scripts/build-initial-conditions-graph.mjs`：spec 增 `conditional`（vcb 由标题文字改成字段、2LPT 两个节点显式声明），`pushNode` 写进草稿节点 — 验证：`--stdout` 输出中这两个步骤带字段，校验 0 错误
- [x] 3.2 同脚本加两条闸门：①标签非空 ②标题含「（可选）」⇒ `conditional === true` — 验证：**负例**把 vcb 的 tags 清空并去掉 conditional，脚本报出两条错误并以退出码 1 拒绝产出；改回后 0 错误
- [x] 3.3 `scripts/scan-param-tags.mjs` 支持 C：`enclosingFunctionLine`（Python 找 `def`、C 找函数定义行、跳过分号声明与控制语句）、`cFunctionRange`（花括号配对）、`cStringMask`（块注释 / `//` / 引号）、`PROSE` 加 Doxygen — 验证：dry-run 命中 C 区间（`过程⑦ 一阶速度场@InitialConditions.c:310`、`过程① 逐线程种子派生@rng.c:36` 等）
- [x] 3.4 同脚本改成"只增不减"：只刷新 `tag:<已知参数名>`，其余标签保留；dry-run 打印"将新增 / 将保留" — 验证：本轮新增 9 个参数标签的同时，**18 个自由标签全部保留**（`tag:初始条件`…`tag:P01`）
- [x] 3.5 顺带修 `scripts/lib/ic-chains.mjs` 的三处"重建即重置"：成员节点整节点展开（标注原样保留）、重复份的 `conditional` 由 `IC_CONDITIONAL_DUPLICATES` 声明、关系 `conditional` 改为"计划声明或保留既有" — 验证：在内存里跑 `applyIcChains`，17 个叶子标签数量不变、5 个可选节点与 8 条可选关系仍为 `conditional`、容器仍无标签、节点/关系数量幂等

## 4. 检查与回归

- [x] 4.1 新增 `scripts/check-graph.mjs` + `npm run check:graph`：标签覆盖（叶子非空 + 与 builder 源码一致）、可选性（生成器声明的可选步骤 / 关系 / 重复份、2LPT 支路整体）、参数标签确实产出、注册表两条硬规则、标签列表不重复 — 验证：13 项断言全绿；**负例**（篡改副本：清空 `ic:proc-2lpt-phi` 标签 + 关掉它和一条边的 conditional）报出 7 条失败、退出码 1
- [x] 4.2 全套回归 — 验证：`npx tsc -b` 干净、`npm run lint` 仅 2 处既有警告、`npm run build` ✓、`check:graph` 13 项 ✓、`check:code` 48 项 ✓、`check:canvas` ✓、`check:styles` ✓
- [x] 4.3 顺带修掉"回归慢"的元凶：`check-canvas.mjs` 结束时 `await esbuild.stop()`（此前 esbuild 常驻服务让 Node 永不退出，每次运行只能靠外层 `timeout` 兜着、还留孤儿进程）— 验证：后台跑 `npm run check:canvas`，脚本自行结束（日志出现"✓ 全部符合预期"且进程消失）

## 5. 文档与归档

- [x] 5.1 `README.md`：补"注册表里有两类标签（参数标签 / 自由标签）"、"两条 schema 硬规则（每个标签必须有文档、标签只长在叶子上）"、参数标签"只认源码引用"的新口径、`apply-annotations.mjs` 与两条纪律（只增不减 / 可选性是数据不是标题）、自检脚本一行加 `check:graph` 与 `check:code` — 验证：README 相应小节已更新
- [x] 5.2 归档变更并把 delta 同步进主 specs — 验证：`openspec validate graphify-graph-annotations --strict` 通过，归档后 `openspec/specs/graphify-graph-annotations/spec.md` 存在
