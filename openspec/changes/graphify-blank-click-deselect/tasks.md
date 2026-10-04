## 1. 数据源多一条「回到未点亮」的通路

- [x] 1.1 `Graphify/src/graph/graphSource.tsx`：`GraphSource` 增 `clearHighlight(): void`（注释写明它清的是"选中 + 本页点亮"，比清选中多），缺省（共享 store）实现为 `select(null, null)` + `setActiveTags([])`；验证：`npx tsc -b` 不因缺实现报错
- [x] 1.2 `Graphify/src/components/PhysicsChainView.tsx`：本页 provider 实现 `clearHighlight`（清选中 + 熄 `activeParam` / `activeProcess` / `activeTagIds`），并进 `source` 的依赖数组；验证：`npx eslint src/components/PhysicsChainView.tsx` 无新增告警

## 2. 画布模板把手势接到这条通路上

- [x] 2.1 `Graphify/src/components/GraphCanvas.tsx`：渲染器回调 `onClearSelection` 里把 `select(null, null)` 换成 `sourceRef.current.clearHighlight()`（关菜单、取消连线两条不动）；验证：`npx eslint src/components/GraphCanvas.tsx` 无新增告警，且该段不再直接调用 `select(null, null)`

## 3. 两页的点亮都跟着熄

- [ ] 3.1 物理链页：点亮一个参数（红点亮、该行高亮、脚上区铺开）→ 点画布空白 → 红点全灭、行不再高亮、脚上区收起、检查器空；再试过程词条、检索命中、点红点三条来源，结果一致
- [ ] 3.2 画布页：勾一个标签（红点亮）→ 点画布空白 → 勾选清空、入口计数归零、红点全灭，且图谱仍是「已保存」（不标脏）
- [ ] 3.3 手势边界：点子图标签页里的空白 → 标签页不被关；右键点空白 → 菜单照弹、选中不变；连点两下空白 → 结果与点一下一致

## 4. 规格与文档

- [x] 4.1 `openspec validate graphify-blank-click-deselect --strict` 通过
- [x] 4.2 文档记账：`docs/notes/graphify/G0-绘制规范.md`（画布页读法旁补「点空白 = 回到什么都没点亮」）、`docs/notes/graphify/G4-物理链.md`（物理链页同款口径），`docs/DIRECTORY.md` 变更表补一条

## 5. 自检

- [x] 5.1 `cd Graphify && npx tsc -b`、`npx eslint`（改动的三个文件）、`npm run check:copy` 全绿
- [x] 5.2 `npm run check:canvas` 与 `npm run check:chain` 全绿（只动交互回调，数据与断言口径不动）
