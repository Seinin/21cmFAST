## 1. 先把判据立起来（口径只有一份）

- [x] 1.1 新增 `Graphify/src/lib/tagEdit.ts`：导出 `canEditNodeTags(node, childCount)`（`node.type !== 'group' && childCount === 0`），纯 TS、不 import React；验证：`npx tsc --noEmit -p tsconfig.json` 通过，且该文件内没有 `react` / `.tsx` 依赖
- [x] 1.2 新增 `Graphify/scripts/check-tags.mjs` 与 `package.json` 的 `"check:tags"`，先落"身份"三格断言：叶子模块 → true、`childCount > 0` 的非容器模块 → false、容器（含"容器且有子节点"）→ false；验证：`npm run check:tags` 绿，且把判据临时改成恒 `true` 时变红

## 2. 面板里只留一处标签区块（撤销带叉号那套）

- [x] 2.1 `Graphify/src/components/NodeTags.tsx`：删掉 `NodeTagEditor` 的**胶囊行**（渲染已归属标签 + `X` 的那一段）与随之无用的 `X` 图标 import，把 Popover（多选 / 新建）抽成独立小组件（如 `TagEditButton`）；验证：文件里不再出现 `X` 图标与胶囊的圆角 class，`npx eslint src` 无未用变量
- [x] 2.2 `NodeTagSection` 收 `editable` 入参：可编辑时标题行右侧渲染「+ 标签」，只读时渲染一句说明（"只读 · 标签来自子图成员，要改去成员上改"）；空态文案按可编辑性分叉；验证：`npx tsc --noEmit` 通过，且标题行右侧两种身份各出现一次（组件里各一条分支）
- [x] 2.3 `Graphify/src/components/Inspector.tsx`：删掉顶部那处 `Field plain label="全局标签"`（含 `NodeTagEditor`）与它的 import，改由标签区块承担编辑入口；区块的 `editable` 传 `tagsEditable !== false && canEditNodeTags(node, childCount)`；`标签数` 那行的提示语改为指向唯一区块；验证：`npx tsc --noEmit` 通过，`grep -n "全局标签" src/components/Inspector.tsx` 只剩一处标题（不再有第二个区块）
- [x] 2.4 `Graphify/src/components/PhysicsChainView.tsx`：新增 `tagsEditable={false}` 入参（整页读生成物，不再显示"看着能点"的勾选界面）；验证：链页选中一个**块**（有子图）与一个**成员量**（叶子），两者的标签区块都只读——前者理由为"来自子图成员"，后者为"这一页只读"

## 3. 有子图者的标签 = 当前叶子并集（现算、不落地）

- [x] 3.1 `Graphify/src/lib/tagEdit.ts` 加 `inheritedTagsOf(nodes, id)`：子树叶子标签并集，明细按叶子归并、每条带来源叶子名；子树里没有叶子就返回空；纯 TS、无 React。验证：`npx tsc --noEmit` 通过；该文件无 `react` / `.tsx` 依赖
- [x] 3.2 视图改用 `inheritedTagsOf` 渲染有子图的节点（面板与画布红点 / 筛选同一份口径；链页除外，照读生成物）；MUST NOT 写回数据。验证：给叶子勾一个标签，其祖先的红点与清单立刻跟着出现；把该叶子删掉，祖先的清单与红点随之少一条；把子图整个删光，祖先显示为空
- [x] 3.3 `check-tags.mjs` 加断言：画布真数据里"有子方"的并集**独立重算**一遍比对；另加"子树叶子删光 → 结果为空"与"函数 MUST NOT 写进节点数据"；把 `inheritedTagsOf` 临时改成读 `node.tags`（模拟不继承）必须红
- [x] 3.4 反面演练记录：临时给 `inheritedTagsOf` 加个"记住上一次结果"的缓存（模拟保留），确认"删光即空"的断言变红、退出码 1；改回后绿——把两次实际输出贴进归档说明
  - 演练①（注入 `const memo = new Map()` + `if (memo.has(id)) return memo.get(id)!` + 出口 `memo.set(id, result)`）：`20 / 21 项` 失败、退出码 1，红的就是那条 —— `✗ 子树叶子删光 → 父显示为空 — 既不留旧并集，也不缓存上一次结果`；还原（`grep -c memo` → 0）后 `21 / 21 项`、退出码 0
  - 注：同一次演练里"叶子挂回来立刻又能算出来"那条**没红**（缓存让删光后仍是旧值，挂回来自然也"对"）——所以"删光即空"必须跟它配对存在，单留后者抓不住缓存

## 4. 自检补齐（防长回来）

- [x] 4.1 `check-tags.mjs` 加**真数据**断言：读 `data/graph.json` 与 `src/generated/physics-chain.json`，报出"可编叶子 / 只读模块 / 容器"三个计数并断言均可编与只读都非零（判据写反或永远 false 会被抓住）；验证：`npm run check:tags` 输出这三个数
- [x] 4.2 `check-tags.mjs` 加**只有一处**断言：`src/components/Inspector.tsx` 里不得再出现 `NodeTagEditor`，且 `<NodeTagSection` 恰好出现一次（防第二处实现长回来；只断言组件引用，不锁文案）；验证：把 `NodeTagEditor` 的调用临时加回去，`npm run check:tags` 变红
- [x] 4.3 反面演练记录：临时把 `canEditNodeTags` 改成恒 `true`（模拟"父节点也能改"），确认 `check:tags` 的身份断言与真数据断言都红、退出码 1；改回后绿——并把这两次的实际输出贴进归档时的说明
  - 演练①（`return true`）：`21 / 27 项` 失败、退出码 1，红的是身份 4 条（`有子图的模块只读` / `有子图且自己带着标签（并集）时仍然只读` / `容器（大框）不可增删` / `容器且有子节点不可增删`）**加上**真数据 2 条（`画布…只读模块非零（0，容器 13）` / `链页…只读模块非零（0，容器 0）`）；还原后 `27 / 27`、退出码 0
  - 演练②（把 `<NodeTagEditor node={node} />` 调用加回 Inspector）：`26 / 27`、退出码 1，红的是 `Inspector 里不再引用被删掉的 NodeTagEditor`；还原后 `27 / 27`
  - 演练③（把 `<NodeTagSection` 复制成两处）：`26 / 27`、退出码 1，红的是 `标签区块 <NodeTagSection 恰好出现一次（实测 2）`——证明这条断言是活的，不只是写着好看
  - 为此把 `census()` 的"可编 / 只读"那一刀改由 `canEditNodeTags` 切（原先脚本自己算 `hasChild`，恒 `true` 时真数据那两条**抓不住**）：口径只有一份这条规矩，自检自己也得守

## 5. 回归与手验

  - 实测：`check:tags` / `check:tabs` / `check:canvas` / `check:styles` / `check:graph` / `check:code` / `check:store` / `check:chain` 全 ✓；`npx tsc --noEmit -p tsconfig.app.json` 无输出；`npx eslint src scripts` 0 error（3 条 warning 全在本次未动的文件：`ui/button.tsx`、`graph/graphSource.tsx`、`Inspector.tsx:237` 的 useEffect 依赖，均为旧有）；`npm run build` ✓ built in 11.92s
  - **`check:canvas.mjs` 的红点断言按新口径改写了**（不是放宽）：旧断言 `勾选后命中的模块亮红点 / 标签 id 写进了节点数据` 拿的是"模块**自己那份**标签"，在新口径下必须**不亮**——脚本换成：① 有子图的模块自己那份不参与（不亮、`tagIds` 为空）② 叶子挂上标签 → 祖先立刻亮、`tagIds` = 并集 ③ 叶子摘掉 → 祖先立刻灭 ④ 挂回来又亮（无缓存）。徽标 / 命中判定 / 取消勾选三段未动（它们只要求"亮的那个是 A1"，现在由叶子继承而来，语义更强）
  - **口径观察（未改，供你定）**：还有三处按 `node.tags` 这一份读数，均**不在**本次 spec 范围内——① `GraphStatsPopover` 的「N 已打标签」（真数据 50，并集口径下会显示标签的节点是 52：多出 2 个只读模块）；② `TopBar` 关键字检索里的 `node.tags.some(...)`（按标签 id 子串命中，不是标签筛选）；③ `graphStore.selectStats().tags`（distinct 标签数，属数据层计数）。真数据实测三者都**没有**数值分叉：有子方且自带 `tags` 的节点 0 个、叶子里的 distinct 标签 34 = 全部 34。要不要一并归到同一份口径，等你拍
- [ ] 5.2 浏览器手验三态：叶子模块可多选 / 新建 / 取消勾选（摘标签）；有子图的模块与链页的块只读且给出理由；容器不出现编辑入口；并确认面板里「全局标签」标题只有一个
- [ ] 5.3 浏览器手验"重新继承"：选中一个有子图的模块，区块里列出的是子树并集（不是空）；到它下面的叶子上摘掉一个标签，回来确认祖先的清单立刻少一条；把该模块的子图整个删光，确认它**变成空**（不残留旧并集）

## 6. 待办（都已记档，不是"以后再说"）

- [ ] 6.1 **口径观察三处，待你拍板**（5.1 已记实测，三者真数据都无分叉，所以不影响本次验收）：
  - `src/components/GraphStatsPopover.tsx` 的「N 已打标签」按 `node.tags` 数（真数据 50；并集口径下"会显示标签的节点"是 52，多出 2 个只读模块）
  - `src/components/TopBar.tsx` 关键字检索里的 `node.tags.some(...)`（按标签 id 子串命中，不是标签筛选）
  - `src/state/graphStore.ts` 的 `selectStats().tags`（distinct 标签数，数据层计数）
  - 三者都不在本次 spec 范围内，**没有静默改**；要归一到 `tagDisplayOf` 就单开一个变更
- [ ] 6.2 **5.2 / 5.3 的浏览器手验**：AI 无法点击验证，留在待办里，等人在浏览器上过一遍（或另开一个变更把面板渲染也搬进无头自检——目前仓库没有 jsdom / testing-library 之类的 DOM 测试环境）
- [ ] 6.3 归档时把 3.4 / 4.3 的三次反面演练实际输出（已在任务里逐条记）连同本次口径改写（`check:tags` 27 项、`check:canvas` 红点段）一并写进归档说明
