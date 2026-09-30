## 1. 中文物理名与依据

- [x] 1.1 回原文逐条核实 15 个参数的命名依据（12 条取 `inputs.py` docstring、`R_MAX_TS`/`N_STEP_TS` 取 `SpinTemperatureBox.c`、`PHOTONCONS_CALIBRATION_END` 取 `atlas/L0-pipeline.md:94` + L3 单元）— 验证：每条 `source` 都写清 `文件:行` 或 `文档#锚点`
- [x] 1.2 新增 `src/lib/paramAliases.json`（15 条 `{tagId, short, source}`）与 `paramAliases.ts`（类型 + `aliasOf`），前端与自检共用 — 验证：`tsc` 通过、自检能读到同一份
- [x] 1.3 `physicsMatrix.ts` 的 `MatrixRow` 增 `alias` / `aliasSource` — 验证：行里能显示中文名与依据

## 2. 几何与滚动

- [x] 2.1 参数列 248px → 176px、行内只留变量名 + 中文物理名（英文说明与"管了 N 个过程"移进 tooltip）、行高 22px、过程列 56px、列头 92px — 验证：浏览器实测参数列 ≤180px、行高 = 22px、行内无"管了 … 个过程"、tooltip 三项齐备
- [x] 2.2 表格改 `colgroup` + `table-layout: fixed` 钉死列宽 — 验证：25 字符参数名不再撑开列
- [x] 2.3 改为**单一滚动口**（矩阵视图这一层 `flex-1 overflow-auto` 管两轴），列头吸顶与参数列吸左相对同一滚动口 — 验证：浏览器实测"祖先里只有一个滚动口"、纵滚后列头贴顶、第二行表头压在分组行下、横滚后参数列贴左

## 3. 自检与文档

- [x] 3.1 `check:physics` 增断言：15 条别名齐全、tagId 一一对应、每条有 `short` + `source`、`short ≤ 8` 字符 — 验证：`npm run check:physics` 28 项全绿
- [x] 3.2 `README.md`（参数矩阵一行）与 `docs/DESIGN.md`（生成规则一节后补排版约束与中文名来源）同步 — 验证：README 写明"变量名 + 中文物理名（依据见 paramAliases.json）"与"整页自然滚动、表头吸顶、参数列吸左"；DESIGN 记下单一滚动口与钉死列宽两条踩坑结论

## 4. 回归与归档

- [x] 4.1 全套回归：`tsc` / `lint`（仅 2 处既有告警）/ `build` / `check:code` / `check:canvas` / `check:styles` / `check:graph` / `check:store` / `check:physics` — 验证：全部通过
- [x] 4.2 浏览器实测（Windows 侧无头 Edge + CDP，探针用完即删，含窄矮视口 640×330 以压出两轴滚动） — 验证：15 项断言全绿
- [x] 4.3 归档本变更并把 `MODIFIED 矩阵视图的读法与内容` 同步进主 specs（该要求下既有场景一条不少） — 验证：`openspec validate --strict` 通过；归档后主 specs 里该要求含 7 个场景且标题未变
