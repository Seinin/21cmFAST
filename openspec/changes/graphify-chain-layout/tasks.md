> **本变更的范围**：一级摆位与容器（三段横排 + 四个段容器）＋ 分层模型退场 ＋ 撤总线，即 1.1–1.10、2.1、2.2，已实现且全门禁绿。
> 2.3、2.4 与 §3–§5（线型收敛、图例、关系类型枚举与 schema 收窄、文档）**未开工**，留待另开变更承接；本变更不 archive。

## 1. 真源与生成器

- [x] 1.1 真源 `docs/notes/physics-chain/chain.json` 给每块标段（预备 / 循环 / 收尾）与**红移内步序**（数据侧字段，不上屏）；验证：`npm run build:chain` 后逐块对照，循环段的步序与 `src/py21cmfast/drivers/coeval.py` 的 `_redshift_loop_generator` 里的调用序（`compute_halo_grid` → `compute_xray_source_field` → `compute_spin_temperature` → `compute_ionization_field` → `brightness_temperature`）逐条一致
- [x] 1.2 生成器坐标改为「三段竖摞 + 段内横排」：段内 x 由位次决定、同段同一条 y，段高取该段最高框、段间空隙 = `GAP`；验证：重建后自检输出「一级版面 宽 × 高」一行，且新增的「同段同一条 y」断言通过
- [x] 1.3 **（已作废：总线方案已撤，见 1.10）** 实现**分道**（区间图着色：按左端点升序 / 区间长降序 / 边 id 升序放入第一个不冲突的道），把道号写进产物；验证：重建两遍产物逐字一致（幂等），且自检的「同道区间不重叠」「道数 = 最大嵌套深度」两条通过
- [x] 1.4 删掉 `crossLevel` 全家（`levels` / `backbone` / `parentOf` / `sibling` / `coarse` / `bypass` / `gap` / `stats`）与边上的 `levelSpan` / `spanKind`；验证：产物里搜不到这些字段，`npm run check:chain` 无一处再引用它们
- [x] 1.5 产物补上端口（跨块边：源块下沿出、目标块下沿进）与红移内步序字段；验证：逐条抽查跨块边都带端口，视图据此能画出下沿到下游的折线（21 条 `iface:*` 全部 `sourcePort: 's'` / `targetPort: 's'`，自检新增一条独立断言把非 `s` 端口与漏写一起抓；`check:chain` 261 项）——**端口那半已作废（见 1.10），红移内步序与它那条断言保留**
- [x] 1.6 块的成员排布改用**块内拓扑序**（从入到出），不再按层号；验证：自检逐块独立重算 Kahn 拓扑序并与画上的横向次序对拍（`block:thermal` 实测 `eps_heat → jalpha → tk → xalpha → xc → ts`）
- [x] 1.7 **段用容器承载**（`type: 'group'`，见 design D8 与 spec「段是容器，不参与关系与导航」）：产物为四个段（横切层 / 预备 / 逐红移循环 / 收尾）各出一个容器节点，块的 `parent` 指向所属段容器（循环那个装下循环段全部块）；容器标题取短段名（长解释挪进 `summary`）；只有没有块的收尾段需要存档坐标（其余由子节点包围盒推导）；自检口径改为"容器只许是这四个段容器"（原来的"产物里没有 `group`"一并收窄）、"每个块恰有一个段容器作父级"、"循环容器装下循环段全部块"、"容器不参与关系 / 不可进入 / 不带标签"；验证：`npm run build:chain` 后产物里容器恰 4 个、块恰 12 个且都带 `parent`，`check:chain` 全过（262 项，`check:tags` 实测链页容器 4 个）
- [x] 1.8 渲染层撤掉缎带那一套（原 1.7 的做法按新口径作废）：`types.ts` 的类型联合、名字表与色表去掉 `band`；`styles.ts` 删段带规则；`cytoscapeSetup.ts` 删"尺寸由数据给"的口子与"悬停点亮同段"的分支（容器自有 compound 与 LOD 豁免）；自检里三处按 `type === 'band'` 的豁免与两处可见集计数改按容器。图例那条排除改成**按页声明**：`GraphCanvas` 增 `legendHiddenTypes`，链页传 `['group']`——画布页的层带按 `graphify-canvas-appearance` 照旧列进要素种类，两页口径不同只能按页给；验证：`check:chain` / `check:canvas` / `check:styles` / `check:tabs` / `check:tags` / `check:graph` 全过，`npx tsc -b` 无输出，一级静息版面是"四个容器 + 12 个块"

- [x] 1.9 段间让位改为**按段框算**（取代 1.2「段间空隙 = `GAP`」的口径）：`boxSize.mjs` 增 `FRAME_PADDING`（26，与样式表 `node:parent.padding` 同源——容器一旦有子节点就命中那条规则，它的 26 覆盖 `node.container` 声明的 14）与 `BADGE_LINE`（画布上块比模型高的一档：`.branch` 徽标「名字 · N」多折一行）；空段框的存档坐标改用容器口径（`measureGroupSize` + `GROUP_PADDING`）；自检把"相邻两段"改成量**框到框**（那一圈**从 `styles.ts` 读**，不抄副本），新增"框的那一圈两份口径一致"与"相邻两段的框不相压"两条断言。验证：`check:chain` 264 项全过、空隙仍是**一个**数（24.0）；真产物喂真渲染器（无头 cytoscape）实测相邻两段的框本体叠 **0** 对（改前 `seg:layer` 压进 `seg:prep` 45.6、`seg:prep` 压进 `seg:loop` 42.1）、四个容器仍各自装住本段块

- [x] 1.10 **撤掉总线**（口径变更：一级静息只剩块与四个段容器，跨步依赖回到悬浮箭头）：生成器删掉分道整段（`bus.channel` / `bus.lane`、`LANE_STEP`、通道按行分）与交付边的端口写入（`sourcePort` / `targetPort: 's'`），收尾空容器的存档坐标不再为道区留空档；产物里 `bus` 与端口 **0** 条（21 条交付边只剩 `id/source/target/label/type/directed/conditional/surface/focusOnly/crossLink/note`）；自检删掉五条（道号存在 / 端口 / 同道区间不重叠 / 道号重算一致 / 道数 = 最大嵌套深度），条数 264 → **259**，一级版面行与空隙数一字未变（`731.0 × 305.0`、空隙 `24.0`）；spec delta 的「跨步依赖按区间分道」整条 Requirement 与其四个场景删除，`graphify-canvas-appearance` delta 里两处「折线」与 design 的 D3 / D4 标为作废。验证：`check:chain` 259 项全过，产物里搜不到 `bus` 与端口

## 2. 自检

- [x] 2.1 删除整节「分层：骨干树 + 跨层成因」及其全部断言（`mismatchedSpan` / `descending` / `spanningBackbone` / `badParent` / `wrongCoarse` / `wrongBypass` / `wrongSibling` / `silent` / `duplicated` / `listed` / `declaredGaps` 等）；验证：`npm run check:chain` 通过（**273 → 259 项**，删掉 14 条），且输出里不再打印那一节
- [x] 2.2 **（已作废：总线方案已撤，见 1.10）** 新增三条分道断言（同道区间不重叠 / 道数 = 最大嵌套深度 / 道号与区间独立重算一致）；验证：人为把一条边的道号从 0 改成 8 后，三条断言同时失败并逐条指名（已实测，见 1.3）
- [ ] 2.3 新增「循环段块的横向次序 == 主循环调用序」断言；验证：把真源里两步的步序对调后重建，自检失败并指名那两块
- [ ] 2.4 记下断言条数变化（273 → **259**）并核对新增条目的可证伪性（能被一次人为破坏触发）；验证：结论写进 `G4` §七 第 7 条，数字与 `npm run check:chain` 实跑一致

## 3. 样式与图例

- [ ] 3.1 `palette.ts` 档位收敛到四档（交付 / 跨红移回流 / 对外输入 / 条件 / 可选），删 `cross-link`、`relates_to`、`contradicts`、`undirected` 与 `CROSS_LINK_COLOR`，虚线节奏统一为一档；验证：`npm run check:styles` 与图例节奏同源断言通过
- [ ] 3.2 `styles.ts` 撤掉全部 `dotted`、每条虚线显式写 `line-dash-pattern`（首项 ≥ 8）且线宽 ≥ 1.7；验证：`npm run check:styles` 的两条新断言（不出现 dotted、虚线必须带节奏且首项 ≥ 8）通过
- [ ] 3.3 「条件 / 可选」改由线上开关框表达（线型随所属档，不再用虚线）；验证：同屏条件边与非条件边的线型、线宽、颜色逐字相同，只差一枚框
- [ ] 3.4 图例样例线段支持挂框，且每一档的节奏取自样式表同一来源；验证：`npm run check:canvas` 的「图例节奏 = 样式表节奏」断言通过，物理链页图例里两条（同红移内的数据流 / 跨红移回流）一实一虚
- [ ] 3.5 段标题与循环体大框在静息可读；验证：关掉所有连线开关、指针移出画布后，仍能读出三段标题与循环范围（人工逐条目视，配合 `check:chain` 的版面行数字）

## 4. 数据 schema 与编写面

- [ ] 4.1 `types.ts` 删三种关系类型、`EdgeStyleId` 收敛、删 `backbone` / `levelSpan` / `spanKind`；验证：`npx tsc -b` 无输出、`npx eslint src` 不新增告警
- [ ] 4.2 新建 / 编辑边对话框的类型下拉只剩「依赖」与「派生」；验证：打开对话框逐项确认，且改一条边的类型后保存仍正常
- [ ] 4.3 `data/graph.json` 的 schema 与 `check:graph` 断言收窄（三类必须不存在、声明与外观里也搜不到）；验证：`npm run check:graph` 通过，且手动塞一条 `contradicts` 边后自检失败

## 5. 文档与收尾

- [ ] 5.1 `G0-绘制规范.md`：把「虚线只表示条件 / 可选」整句改写为「虚线 = 跨轮（跨红移）」，并补线型收敛与"条件挂框"的口径；验证：`npm run check:copy` 通过，且 G0 里搜不到旧的虚线口径
- [ ] 5.2 `G4-物理链.md`：更新摆位（三段 + 段内横排）、图例两处、§七 第 10 条（那 5 条假告警随模型删除作废）与第 7 条的自检条数；验证：`npm run check:copy` 通过，且 G4 里的块序表与新真源逐条一致
- [ ] 5.3 `docs/DIRECTORY.md` §7 加一条变更记录（问题、做法、落点、验收）；验证：`npm run check:copy` 通过
- [ ] 5.4 全门禁与视觉复核；验证：`npx tsc -b` 无输出、`npx eslint src` 不新增告警，`check:copy` / `check:latex` / `check:chain` / `check:canvas` / `check:styles` / `check:graph` / `check:tags` / `check:store` / `check:tabs` / `check:code` 全过；浏览器里逐条目视物理链页静息版面（只有块与段容器）与悬浮时的依赖箭头
