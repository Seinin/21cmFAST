## 1. 左栏词条行与命中行只留名字

- [x] 1.1 `ChainSearchPanel.tsx` 的过程词条行只留名字：删掉计数行（量数 / 相关参数数 / 论文出处数）与拟合律一行，把这三项计数加 `fit` 拼进该行的 `title`；验证：光照面/code review 里该行 DOM 只有一个名字 + 状态徽标，悬停提示含计数与拟合律
- [x] 1.2 同一文件：参数词条行删掉 `pl2012` 与「N 处」两处小字（计数与门控边数已在 `title`），检索命中行删掉说明句并把 `hit.detail` 并进 `title`、保留「旁路与实现细节」徽标；验证：`npx eslint src/components/ChainSearchPanel.tsx` 通过，行上无这两类小字
- [x] 1.3 脚上区去掉「作用于 N 个量，落在 …」那句：改成与「属于」对称的「作用于」清单标签，句子内容与 `blocks` 清单进该区 `title`；反查为空时只写「无」；验证：选中 `F_STAR10` 后区里只有参数名、代码类徽标与两个可点清单
- [x] 1.4 画布页 notes 列表：`MdLibraryPanel.tsx` 文档行删掉 `fileName` 一行（`title` 仍是 `docId`）；验证：列表每行只有标题与引用计数徽标

## 2. 脚上区高度封顶

- [x] 2.1 `ChainSearchPanel.tsx` 脚上区容器加 `max-h-[50%] overflow-y-auto`（或等价），使内容超过半栏时在区内滚动；验证：选中 `USE_MINIHALOS` 后脚上区不超过左栏一半高、上面词条清单仍可见，栏宽拖窄后同样成立

## 3. 开关标签去计数

- [x] 3.1 `CanvasOverlays.tsx` 的 `CrossRedshiftFeedbackToggle` 标签只写「跨红移反馈 · 已显现 / 已藏起」，条数与它管的视图面留在 `Tooltip`；`count <= 0` 时那句说明保留；验证：浮层标签上无「· N 条」，悬停可读到条数

## 4. 规格对齐

- [x] 4.1 `graphify-chain-param-sidebar` 的 delta（`specs/graphify-physics-chain/spec.md`）里 ADDED 需求「参数词条按代码类名分组」的「并写出它作用的模块数」改为悬停提示口径，两份 change 不再各带一半口径；验证：`openspec validate graphify-chain-param-sidebar --strict` 通过——**该 change 的既存缺口已补**（MODIFIED「本页检索与来源标注」补上主规格的「命中说明里不印阶段号」场景，正文「节点命中写出阶段号」改为主规格口径「写出属于哪个块、编号只在命中面」；`graphify-physics-chain-tree` 的同名 delta 一并补齐），`openspec validate --all --strict` 31 项全过
- [x] 4.2 本变更自校验：`openspec validate graphify-sidebar-declutter --strict` 通过

## 5. 自检与记账

- [x] 5.1 `cd Graphify && npx tsc -b`、`npx eslint`（改动的三个文件）、`npm run check:copy`（页面文案与站点文档）全绿
- [x] 5.2 `npm run check:canvas` 与 `npm run check:chain` 全绿（只改渲染面，数据与断言口径不动）
- [x] 5.3 文档记账：`docs/notes/graphify/G4-物理链.md` 更新左栏说话口径（词条行只写名字、计数与拟合律退到悬停提示、脚上区半栏封顶、开关标签去计数），`docs/DIRECTORY.md` 变更表补一条
- [ ] 5.4 浏览器走一遍：检索 `F_STAR10`（行上只有名字、悬停有说明）→ 选 `USE_MINIHALOS`（脚上区封顶滚动）→ 切过程面（词条行只有过程名）→ 看开关标签（无条数、悬停有条数）→ 画布页 notes 列表（只有标题）
