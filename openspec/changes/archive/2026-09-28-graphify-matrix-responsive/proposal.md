# graphify-matrix-responsive

## Why

参数矩阵的表格宽度被写死成 680px（`176 + 9×56`）：宽屏下它是一块靠左的固定小表、右侧一大片空白，进程列永远 56px 也不成比例；卡片又固定撑满工作区高度，内容只有约 600px 高、下面留一条空白卡面。用户的要求是"**整个表的界面没有做自适应，要美观贴合**"。

## What Changes

- **宽度自适应**：表格改为跟随容器（`w-full min-w-[680px]`）。参数列仍钉 176px，**9 个过程列不再写宽度**，由 `table-layout: fixed` 均分剩余空间 ⇒ 窗口越宽列越宽、右侧不留白；容器窄于 680px（每列保底 56px）时横向滚动。
- **纵向贴合**：滚动口从卡片上移到矩阵视图那一层，卡片改成 `w-fit min-w-full`（宽度不小于容器、高度裹住表格）。内容不足时不再出现纵向滚动与空白卡面；**列头吸顶与参数列吸左仍绑在同一个滚动口**上。
- **窄屏适配**：说明条折行、图例换行，"15 参数 · 9 过程 · 33 有色格"的计数在 < 768px 隐藏，读法说明保留。
- 不变：15 行 × 9 列 × 33 有色格、行内"变量名 + 中文物理名"、空格读法、tooltip 三项、列尾支配参数 Top-3、点格子开过程详情、`?view=matrix` 视图切换；数据、生成物与生成脚本一律不动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-matrix`：修改 `矩阵视图的读法与内容`——补"表格宽度随容器自适应（参数列钉死、过程列均分、每列保底宽度）、卡片贴合内容高度、窄屏说明条折行与计数让位"，并加对应场景。

## Impact

- 修改：`src/components/MatrixView.tsx`（根加 `overflow-auto`、卡片 `w-fit min-w-full`、表格 `w-full min-w-[680px]`、`colgroup` 去掉进程列宽度、说明条折行与计数隐藏）、`README.md`、`docs/DESIGN.md`。
- 不改：`MatrixCell.tsx`（格高 22px）、`src/lib/physicsMatrix.ts`、`src/lib/paramAliases.json`、`scripts/check-physics-graph.mjs`、生成物与服务端。
