# graphify-matrix-compact

## Why

参数矩阵页第一版排得太散：参数列被最长的那几个参数名撑到 **240px** 且一行占两行高（变量名 + 英文说明 + "管了 N 个过程"），15 行就铺满整屏；矩阵又被塞进一个固定高度的内部小框里滚动，扫读时表和表头分家。用户的要求是"**不要一下子全部展开**、**参数名那一栏太长了**"。

## What Changes

- **参数列**：从 240px 收到 176px，行内**只留两个名字**——变量名（`F_STAR10`）+ **中文物理名**（"恒星形成效率"）；英文说明与"管了 N 个过程"移进 tooltip。表格改用 `colgroup` + `table-layout: fixed` 钉死列宽（否则最长参数名仍会把列撑开）。
- **中文物理名必须有依据**：新增 `src/lib/paramAliases.json`（15 条 `{tagId, short, source}`），前端与自检共用；`source` 写清源码行号或文档锚点，`check:physics` 断言齐全、一一对应、长度 ≤ 8 字符。**不写进生成物**（生成物仍保持"完全由文档与源码推导、内容哈希戳记、可幂等重跑"）。
- **滚动形态**：矩阵改为**单一滚动口**（矩阵视图那一层 `flex-1` 容器管两轴，撑满工作区），列头吸顶与参数列吸左相对同一个滚动口生效；不做折叠/手风琴。
- **密度**：行高 28px → 22px（角色词仍写得下），过程列 62px → 56px，列头 112px → 92px。
- 不变：行/列分组、空格读法、行/列汇总、点格子开过程详情、`?view=matrix` 视图切换、生成物与生成脚本的口径、画布那一套。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-matrix`：修改 `矩阵视图的读法与内容`——行内容改为"变量名 + 带依据的中文物理名"（行尾计数移进 tooltip）、矩阵改为单一滚动口内整页滚动（表头吸顶、参数列吸左、不做折叠），并补相应的场景。

## Impact

- 修改：`src/components/MatrixView.tsx`（几何、colgroup、单一滚动口）、`src/components/MatrixCell.tsx`（格高 22px）、`src/lib/physicsMatrix.ts`（`MatrixRow` 带 alias）、`scripts/check-physics-graph.mjs`（别名断言）、`README.md`、`docs/DESIGN.md`。
- 新增：`src/lib/paramAliases.json`、`src/lib/paramAliases.ts`。
- 只读：`src/generated/physics-graph.json` 的生成规则与内容、`data/graph.json`、服务端、生成脚本取值口径。
