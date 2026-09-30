## 1. 引用面扫描与证据复核

- [x] 1.1 扫描全仓对 `atlas:ic-frame` / 「初始条件（S09）」的引用（脚本常量、断言、布局白名单、README、atlas 文档、话题/引用），产出按文件的改动清单 —— 验证：清单覆盖 `restructure-tabs.mjs`、`reset-atlas-nodes.mjs`、`import-atlas-graph.mjs` 三处已知引用，且每处写明该改成什么口径
- [x] 1.2 复核 13 步的三块归属，输出带文件行号的归属表（`InitialConditions.c` 主函数 try 块阶段、`BEGIN/END 2LPT PART`、末尾 deallocate、`rng.c:30-89`、`cosmology.c:536-545`、文档 §3.1/§4.1–4.10）—— 验证：13 个节点各有唯一归属，合计 3+8+2=13

## 2. 数据结构重排

- [x] 2.1 新增 `scripts/restructure-initial-conditions-blocks.mjs`：默认 dry-run 打印三块成员与证据；`--apply` 前断言（节点 59 / 关系 54、三块成员集合精确相等、框内 13 节点与 21 边守恒、三个新框 `type=group` 且无 tags/refs/边、`ic:*` 全在 `atlas:fig1:prep:ics` 子树内）并写前备份 —— 验证：dry-run 输出与 design.md 的成员表逐项一致
- [x] 2.2 `--apply` 写入：删 `atlas:ic-frame`、新增三个分组框、重挂 13 个节点的 `parent`、按 `pack` 口径写坐标 —— 验证：`GET /api/graph` 回读为 59 节点 / 54 关系，`atlas:ic-frame` 不存在，`atlas:fig1:prep:ics` 的三个子节点即三块
- [x] 2.3 幂等性：脚本重复跑不产生差异（识别既有分组框就地更新） —— 验证：第二次 `--apply` 后数据与第一次逐字节等价（除 `updatedAt`）

## 3. 工具链与断言同步

- [x] 3.1 `scripts/restructure-tabs.mjs`：`IC_FRAME` 常量与断言改为三块口径（三个框各自 `expectChildren` 3/8/2；"`ic:*` 在 `atlas:fig1:prep:ics` 子树内"；InputParameters 输出边落在同子树过程上）；布局段 7c 改为"三框竖排 + 框内横排网格" —— 验证：静态检查无 `IC_FRAME === 'atlas:ic-frame'` 残留，断言文案与新口径一致
- [x] 3.2 `scripts/reset-atlas-nodes.mjs`：保留名单由单个 `IC_FRAME_ID` 改为三个分组框 id —— 验证：脚本对三块的节点不误删（dry-run 打印保留清单）
- [x] 3.3 `scripts/import-atlas-graph.mjs`：`frameId` 回退值不再指向 `atlas:ic-frame` —— 验证：文件内无 `atlas:ic-frame` 残留引用
- [x] 3.4 `scripts/check-canvas.mjs`：新增断言（进 `compute_initial_conditions` 子图时可见顶层恰为三块框；三块成员归属正确；`ic:*` 全在模块子树内） —— 验证：`npm run check:canvas` 全绿

## 4. 验证与文档

- [x] 4.1 跑 `npx tsc -b`、`npm run lint`、`npm run check:canvas`、`npm run check:styles` —— 验证：四项全绿（既有 warning 除外）
- [x] 4.2 无头 Edge 探针实地进该子图：截图为三块框、跨块箭头照常绘制、模块徽标显示「进入子图 · 3」 —— 验证：探针日志断言全为真，探针文件用完即删
- [x] 4.3 `docs/notes/INITIAL_CONDITIONS.md` §8 追溯表补「三块 ↔ atlas S09.1–S09.5」对照 —— 验证：每条 S09.x 都能指到某一块的成员
- [x] 4.4 `Graphify/README.md` 子图一节补这条口径（进 `compute_initial_conditions` 看到三块骨架及其划分依据） —— 验证：文档含三块名称与"为什么去掉了 S09 框"一句

## 5. 收尾

- [x] 5.1 `openspec validate graphify-ics-three-blocks` 通过；`openspec validate --specs` 仍全绿 —— 验证：两条命令均返回 valid / 12 passed
- [x] 5.2 归档变更（`openspec-archive-change`），工作区回到无活动变更状态 —— 验证：`openspec list` 中不再有该变更
