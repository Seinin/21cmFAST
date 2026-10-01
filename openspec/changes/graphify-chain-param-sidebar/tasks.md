## 1. 生成物：块的标签 = 成员标签并集

- [x] 1.1 `build-physics-chain.mjs` 给块节点与 `graph.blocks.items[]` 各写 `tags`（成员标签并集，去重排序）+ `tagDetails`（`kind: '块'`，note 写明"成员里有 N 个量读它：…"），验证 `node -e` 读生成物：10 个块**每个都有** `tags`，且与成员并集逐块相等（`block:galaxy` 16 个 / `block:ionization` 27 个）
- [x] 1.2 跑 `npm run build:chain`，验证生成脚本幂等（重跑结果与磁盘产物一致）

## 2. 渲染器：放行非装饰父节点

- [x] 2.1 `cytoscapeSetup.ts` 的 `activeTagsOf` 判据由 `isParent()` 收紧为 `type === 'group'`（装饰容器才无标签），验证选中 `F_STAR10` 时 ③星系形成与源项 / ④电离史 / ⑤气体热史 三个块亮红点、进 ③ 后 `ρ̇*(z)` 也亮
- [x] 2.2 跑 `npm run check:canvas`，验证画布页「容器不亮红点」断言口径不变（34 条断言全过）

## 3. 数据层：参数类分组与检索项

- [x] 3.1 `physicsChain.ts` 新增 `paramEntries()` / `paramClassGroups()` / `paramEntryOf()` / `paramBlocks()` 与 `PARAM_GROUP_FALLBACK`，分组读生成物 `param.group`（不按数组名），词条只留在 `paramMatrix` 里有条目的参数并给出作用处数，验证 `R_MAX_TS`（在 `numeric` 数组里、`group` 是 `AstroParams`）出现在 `AstroParams` 组；`ChainParamClassGroup` / `ChainParamEntry` 类型随之外露
- [x] 3.2 `searchChain()` 的命中项补齐：参数命中写「代码类 · 落到哪几个块 · 多少个量 · 门控几条边」，节点命中写阶段号且 `node.stage` 进命中面（输 `S14` 能找到算在那段代码里的量），`counts` 随命中推送，验证检索 `F_STAR10` 的 detail 里出现 `AstroParams` 与块名、检索 `S14` 有命中

## 4. 页面：左栏改真侧栏与选中口径

- [x] 4.1 新增 `ChainSearchPanel.tsx`（纯入参）：词条按代码类名分组可折叠、四类命中分组显示 + 每类计数、键盘 ↑/↓ 走命中 · Enter 定位 · Esc 清空、选中参数后脚上给「代码类 + 落在哪几个块 + 可点的量清单」、收起态给 36px 细条（展开按钮 + 词条数）
- [x] 4.2 `PhysicsChainView.tsx` 改三列（左栏 + 画布 + 检查器）：`usePanelWidth({ storageKey: 'chainSidebar', side: 'left', defaultWidth: 304, containerWidth, peerWidth })` + `ResizeHandle`，验证可拖宽 / 双击复位 / 拖过最小宽度收成细条 / 刷新后宽度与收起状态保持；原先 `absolute left-4 top-4 w-[21rem]` 的浮窗与页面里的 `PARAM_SECTIONS` 手写分组退场
- [x] 4.3 选中口径改「落在它作用的第一个块」（不再落在藏在块里的成员上），左栏「作用于…」每项可点（`revealNode` + `select`），验证点 `F_STAR10` 后右侧栏给过程块属性页、点清单里的量能进块并选中它

## 5. 自检、文档与验收

- [x] 5.1 `check-physics-chain.mjs` 加块标签并集的**独立重算**（不信任生成器）+ 两处出口一致 + 块标签都在 `meta.tags` 注册表里，验证 `npm run check:chain` **156 项断言全过**
- [x] 5.2 `npx tsc -b` + `npx eslint`（改动的三个文件）+ `check:styles` / `check:canvas` / `check:tabs` 全绿
- [x] 5.3 文档记账：`docs/notes/graphify/G4-物理链.md`（§五 参数与标签：左栏机制、块标签并集、选中落在块上、断言数 152 → 156；"参数进抽屉"改口径）、`docs/notes/graphify/G0-绘制规范.md`（§五：左栏入口 + `type = 'group'` 是"装饰容器不亮红点"的判据）、`docs/DIRECTORY.md` §7 补 2026-09-30 同日跟进条目
- [x] 5.4 与 `graphify-panel-layout` 既有规格对账：左栏复用同一套面板机制（可拖 / 双击复位 / 越界收细条 / 宽度与收起状态只进本地存储），四条既有需求本身就是**面板无关**的通用措辞，故本变更不产出该能力的 delta（`proposal.md` 里"修改 `graphify-panel-layout`"一句按此理解为"沿用其既有机制"，实现与验收不依赖新 delta）
- [ ] 5.5 在浏览器走一遍：检索 `S14` → 键盘 ↓↓Enter 定位 → 点 `F_STAR10` 看块亮 → 拖窄侧栏到细条 → 刷新确认宽度记住；再切到画布页确认选中状态未被污染
