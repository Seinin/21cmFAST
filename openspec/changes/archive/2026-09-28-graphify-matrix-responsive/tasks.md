## 1. 布局自适应

- [x] 1.1 宽度均分撑满：表格 `w-full min-w-[680px]`、`colgroup` 只保留参数列 176px、删掉写死的 table width — 验证：宽屏 1400px 下表格宽度与容器差 ≤2px、进程列宽 136px（> 56）
- [x] 1.2 滚动口上移到视图根：根加 `overflow-auto`，卡片改 `w-fit min-w-full` 并去掉 `flex-1`/`min-h-0`/`overflow-*` — 验证：矮窄视口 640×330 下纵滚后第一行表头贴顶（≤8px）、第二行表头在其下、横滚后参数列贴左（≤8px）
- [x] 1.3 纵向贴合：内容不足时不出现纵向滚动、卡片高度 ≈ 表格高度 — 验证：1400×900 下 `rootScrollsY === false`、卡片高与表高差 ≤2px
- [x] 1.4 窄屏让位：说明条 `flex-wrap`、读法段 `basis-[220px]`、图例 `flex-wrap`、计数 `hidden md:inline` — 验证：640×800 下计数隐藏（`offsetParent === null`）、图例仍在、每列 ≥56px 且横向可滚

## 2. 回归与实测

- [x] 2.1 三视口浏览器实测（1400×900 / 640×800 / 640×330，Windows 侧无头 Edge + CDP，探针用完即删） — 验证：20 项断言全绿（含既有指标：参数列 ≤180px、行高 22px、15×9×33、行内两个名字、行内无"管了"、tooltip 三项、点格子开详情）
- [x] 2.2 全套回归：`tsc` / `lint`（仅 2 处既有告警）/ `build` / `check:code` / `check:canvas` / `check:styles` / `check:graph` / `check:store` / `check:physics` — 验证：全部通过；数据侧 28 项断言保持全绿（说明没误伤数据）

## 3. 文档与归档

- [x] 3.1 `README.md`（参数矩阵一行补自适应与贴合）与 `docs/DESIGN.md`（把"列宽钉死"改成"一钉一放"、补"滚动口在视图根、卡片不参与滚动"与窄屏让位） — 验证：两处都能读到自适应行为与两条踩坑结论
- [x] 3.2 归档本变更并把 `MODIFIED 矩阵视图的读法与内容` 同步进主 specs — 验证：`openspec validate --strict` 通过；归档后该要求含既有 7 个场景 + 新增 3 个场景、标题未变
