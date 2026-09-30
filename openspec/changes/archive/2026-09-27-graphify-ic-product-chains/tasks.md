## 1. 定义与规则

- [x] 1.1 delta spec 写一条要求（`剖分图内部的展示份可按产物链重复`）并 `openspec validate graphify-ic-product-chains --strict` 通过 — 验证：四项工件 done、校验无错
- [x] 1.2 新增 `scripts/lib/ic-chains.mjs`（由 `ic-blocks.mjs` 改写）：五块成员表（前置 / 密度链 / 速度链 / vcb 链 / 收尾）+ `IC_RETIRED_BLOCK_IDS`（`ic:g-core`）+ `IC_DUPLICATES`（4 个副本 → 原份）+ `IC_CHAIN_EDGES`（26 条）+ `layoutIcChains()` + `applyIcChains()` + `icPlanIssues()`；导出形状沿用 `ic-blocks.mjs` — 验证：`node --check` 通过；`icPlanIssues()` 在迁移与断言里都会先跑一遍
- [x] 1.3 删除 `scripts/lib/ic-blocks.mjs` 与 `scripts/restructure-initial-conditions-blocks.mjs` — 验证：全仓检索 `ic-blocks` 仅剩归档变更与 `ic-chains.mjs` 里的历史说明

## 2. 数据迁移

- [x] 2.1 新增 `scripts/restructure-ic-product-chains.mjs`：dry-run 默认（打印五块成员与节点/边增减）→ `--apply`（写前备份 `data/graph.before-ic-chains.json` + 原子写 + `tryParseGraph`）；写前断言：五块形状、重复份逐字一致且不同框、IC 边与计划一致、`atlas:*` 未被改动、id 唯一、坐标有限且互不相同 — 验证：dry-run 输出与计划吻合；`--apply` 后 `ic:` 节点 16→22、IC 内部边 21→26（全图 59→65 / 54→59）
- [x] 2.2 幂等验证：连跑两次，第二次报告「已是目标形状」且不动数据 — 验证：第二次输出该句、节点/边计数不变

## 3. 脚本面同步

- [x] 3.1 `import-atlas-graph.mjs` 第二步改调 `applyIcChains`（不再自己拼三块），`restructure-tabs.mjs` / `reset-atlas-nodes.mjs` 改 import 路径与注释 — 验证：`npx tsc -b`、`npm run lint` 通过；`grep -rn "三块" scripts/` 无命中
- [x] 3.2 `restructure-tabs.mjs` 的归位与子数断言对五块同样成立（用 `IC_MEMBER_BLOCK` 归位、`block.members.length` 校验）— 验证：脚本头部注释与断言口径已同步（五块 3·4·5·3·2 取自 `IC_BLOCKS`，不另抄一份）

## 4. 断言与文档

- [x] 4.1 `check-canvas.mjs` 的 IC 断言块重写为链口径：顶层恰为五框、每框成员与声明一致、4 份重复标签逐字一致且不同框、「抽样」出现 3 次、旧容器 `ic:g-core` 不存在、模块直接子节点 = 5、`ic:*` 与成员表一一对应、IC 边与 `IC_CHAIN_EDGES` 一致、实空间化只剩 2 条出边、除前置外无节点挂 3 条以上出边、五框互不重叠 — 验证：`timeout 150 npm run check:canvas` 全绿「全部符合预期」
- [x] 4.2 `README.md` 五处提法同步（层带举例、剖分图举例、配色表、脚本清单与说明、"三块骨架"整段改为按产物链分块）— 验证：`grep -n "三块" README.md` 无命中；脚本清单里多了 `restructure-ic-product-chains.mjs`

## 5. 验证与归档

- [x] 5.1 跑 `npx tsc -b`、`npm run lint`、`timeout 150 npm run check:canvas`、`npm run check:styles`、`npm run check:code` — 验证：五条全绿（lint 仅剩 2 条既有警告）
- [x] 5.2 Windows 侧无头 Edge 探针实测：IC 子树 22 节点、五块成员数 3/4/5/3/2、抽样与共轭在三条链里同名、旧容器与大框都不存在、实空间化只剩 2 条出边、子图标签页真的画出五个框且 17 个步骤、五框互不重叠、主图仍正常 — 验证：探针 19 项断言全过，探针文件已删、无残留进程
- [x] 5.3 归档变更并内联同步 `graphify-code-topology` 主规格，确认 `openspec validate --specs --strict` 全绿、主规格里出现新要求 — 验证：`openspec list` 不再出现该变更；specs 校验全通过
