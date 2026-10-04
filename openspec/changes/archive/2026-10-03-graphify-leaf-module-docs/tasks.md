## 1. 删掉第三级（函数子图）

- [x] 1.1 `Graphify/scripts/build-physics-chain.mjs`：删掉子图层整段（`subgraphNodes` / `subgraphIndex` / `usedStepIds` / `byUnit` / `stackCenters` 那一段的步骤位置计算），产物里 MUST NOT 再写 `graph.subgraphs`；成员节点不再有 `parent = 成员` 的子节点。验证：产物里搜不到 `step:` 与 `subgraphs`；节点数由 69 降到 51（12 块 + 39 成员）
- [x] 1.2 `Graphify/src/components/PhysicsChainView.tsx`：删掉"成员可进入"那条分支——入口只在块上出现（数据侧给子节点数，视图不另判）。验证：选中任意成员，属性页没有「进入子图 ↗」；双击成员不换画布焦点，只有块能进
- [x] 1.3 `Graphify/scripts/check-physics-chain.mjs`：删掉子图层全部断言（"子图里至少两个步骤"、"步骤节点必带 refs / refs 条数"、"子图内步骤位置"等），并新增一条"图上没有 `step:*`"。验证：自检条数随之下降并打印出来；人为往产物里塞一个 `step:*` 节点即失败
- [x] 1.4 真源 `docs/notes/physics-chain/chain.json`：`hmf_impl` 与 `source_grid` 的 `name` 去掉「（子图）」后缀（label 同步），改名后按 D9 仍各占一个成员节点。验证：真源与产物里搜不到 `（子图）`；`halocat` / `halobox` 成员数与改前一致

## 2. 真源与路径规则

- [x] 2.1 `chain.json`：12 个块的 `module`（块级 `physics` / `products`）与 `noteDoc` 退场；新增顶层 `docText`，键 = 对象 id（`block:*` / 成员 id），层里的头文件成员用 `file:<文件名>`，值 = `{ physics: [段落…], formula: '…' }`。验证：`python3 -c "import json;d=json.load(open('docs/notes/physics-chain/chain.json'));print(list(d))"` 里出现 `docText`，且全部块不再有 `module` / `noteDoc`
- [x] 2.2 填出 `docText` 的**键骨架**（值先留空）：12 个块 + 39 个成员 + 16 个头文件成员。验证：写一段一次性脚本，核键集合 == 「图上对象 ∪ 层成员」，不重不漏；`kernel` 的 16 个 `file:` 键齐全
- [x] 2.3 路径规则落成纯函数（父目录 + 本对象键；块与成员用 `id`、头文件成员用文件名），生成器与自检**各写一份**，互不 import。验证：核对样例 `thermal.md` → `thermal/{eps_heat,tk,jalpha,xalpha,xc,ts}.md`、`kernel/cosmology.h.md`；把其中一处的规则改歪后两处对拍立刻红

## 3. 生成器：67 篇同构文档

- [x] 3.1 `buildModuleDocs` 改为**逐对象写盘**：路径按 2.3，块那篇 + 同名目录，成员是目录里的文件；12 篇扁平的旧文档随生成删除（不动手 `rm`，由生成器保证目录与树一致）。验证：`docs/notes/physics-chain/modules/` 下正好 67 篇 md，`find … -name '*.md' | wc -l` == 67，没有残留的旧版块文档
- [x] 3.2 块那篇 = **成员并集**：物理一节 = 各成员物理环节按成员次序并集，工程一节 = 各成员落点并集（去重、按文件与行号排序）。验证：把 `thermal.md` 的 6 个成员那几篇按序拼接，正文与 `thermal.md` 逐字相同
- [x] 3.3 成员那篇 = `docText` 的成段叙述，小标题不编号；公式渲染成独立成行的 `$$...$$`，**恰好一个**；`docText` 里缺段落或缺公式时**报错退出**、不写占位。验证：临时抽掉 `dn_dm` 的公式重新生成，生成器报错并指名 `dn_dm`
- [x] 3.4 成员的工程一节**逐步骤成小节**：小节标题 = 步骤函数名，每条落点给核定核心行 + 一句说明，末尾给该成员的输入与产出；核不到核心行的步骤**不生成**并报错。验证：`thermal/eps_heat.md` 的工程一节有 5 个步骤小节（`UpdateXraySourceBox`、`one_annular_filter`、`global_reion_properties`、`initialise_SFRD_spline`、`calculate_sfrd_from_grid`）；临时清掉 `stepSites.S14.3.2` 的核定条目，生成器报错并指名该步骤
- [x] 3.5 共享内核层的 16 个头文件成员：物理一节写「承载什么物理、被哪些块引用」，**不给公式**，也不参与"恰好一个公式"的核对。验证：`kernel/cosmology.h.md` 里没有 `$$`，而 `kernel.md`（它的父对象）也没有

## 4. 引用：块与成员各指自己那篇，步骤落点并进成员

- [x] 4.1 生成器里 `noteDocOfBlock` 那套（按块取一篇、用小节标题当锚点）退场；每个对象（块、成员）写自己的笔记引用：`docId` = 自己那篇的路径，`anchor` = 自己标题的 slug；头文件成员的笔记引用由数据直接给出。验证：随便挑块 / 成员两级，产物里两条 `refs` 的 `docId` 不同、且恰好是父子同构关系
- [x] 4.2 成员的直接代码引用 = 它自己 `codeSites` 里的核定落点 ∪ 它全部实现步骤的核定落点（去重、按文件与行号排序）。验证：`eps_heat` 的「源码」标签条数 == 它自己的核定落点与 `S14.3.*` 五个单元落点去重后的条数；**步骤落点一条不少**（逐条对拍）
- [x] 4.3 汇总算法一个字不改：`refs(块) = 去重排序(块自身 ∪ 各成员)` 仍在位，且去重按新路径同样成立。验证：`thermal` 块的 `refs` 条数 == 6 个成员并集去重后的条数；`npm run check:chain` 的汇总对拍仍绿

## 5. 自检（每条都要能被一次人为破坏触发）

- [x] 5.1 「图上没有 `step:*`」：产物里节点 id 不含 `step:` 前缀，`graph.subgraphs` 不含「成员 → 步骤」的索引。验证：手工往产物里加一个 `step:S14.3.1` 节点，自检失败并指名
- [x] 5.2 「路径与 `parent` 同构」：沿 `parent` 链独立重算 67 条路径，与磁盘逐条对拍，多一篇 / 少一篇 / 位置放错都失败并指名。验证：把 `xalpha.md` 挪到 `thermal/jalpha/` 下，自检失败并报出该路径
- [x] 5.3 「`docText` 键集合不重不漏」：== 图上对象 ∪ 层成员。验证：删掉 `obs/k_target` 的键后，自检失败并指名
- [x] 5.4 「每个成员恰好一个公式」：数成员那篇物理一节的 `$$` 块数，非 `1` 即失败（16 个头文件成员豁免）。验证：给 `xalpha.md` 添第二条公式，自检失败并指名
- [x] 5.5 「块那篇是成员并集」：从成员重算正文，与磁盘逐字对拍；并断言块那篇里没有无法由成员重算出来的句子。验证：往 `thermal.md` 手写一句块级散文，自检失败
- [x] 5.6 「子图入口计数只在块上非 0」：跑子节点数那一处判据并钉住三个代表——过程块（＝成员数）、层（0）、成员（一律 0）。验证：把某个成员的计数改回它的步骤数，自检失败并指名
- [x] 5.7 「两节齐全且物理在前」「物理一节无代码标识」「落点只给核心行」三条既有断言改到新粒度（逐对象而非逐块）后仍在位；`cd Graphify && npm run check:copy` 覆盖新增的 67 篇。验证：把一段反引号代码或一句第二人称写进某篇，对应门禁失败并指名文件与行

## 6. 逐块补散文与公式（55 篇叶子）

- [x] 6.1 `const` 与 `kernel`：`tgamma` 1 篇成员（补公式，已有则补齐叙述）+ 16 篇头文件成员（补"承载什么物理"）。验证：这 17 篇过 5.4 / 5.7，生成器对它们的物理一节无代码标识
- [x] 6.2 `cosmo` / `initial` / `grav` / `halocat`：12 篇成员（`matter_power`、`transfer_fn`、`vcb`、`initial_density`、`zelodovich_velocity`、`second_order_velocity`、`perturb_field`、`perturb_velocity`、`hmf_impl`、`dn_dm`、`mmin`、`tvir_min`）。验证：每篇一个公式，且公式能对上成员的 `eq` / `page`
- [x] 6.3 `galaxy` / `halobox`：8 篇成员（`scaling_relations`、`rho_star`、`phi_uv`、`fstar`、`lx`、`source_grid`、`nion`、`zeta`）；`scaling_relations` 与 `source_grid` 的工程一节分别列出 2 个、3 个步骤小节。验证：两个块的并集正文与成员篇拼起来逐字相同
- [x] 6.4 `xray` / `ionization` / `obs`：12 篇成员（`filtered_xray`、`filtered_sfr`、`mean_sfr`、`q_hii`、`gamma_12`、`recomb`、`mfp`、`z_reion`、`dtb`、`p21`、`tau_e`、`k_target`）。验证：同 6.2
- [x] 6.5 `thermal`：6 篇成员（`eps_heat`、`tk`、`jalpha`、`xalpha`、`xc`、`ts`），其中 `eps_heat`（5 步）、`tk`（2 步）、`jalpha`（3 步）、`ts`（3 步）的工程一节逐步骤成小节；顺带把 `S14.7.1` 的标签从 `thermochem.c 率系数` 定成真正的名字。验证：`thermal.md` 并出 6 个成员全部环节，`thermal/eps_heat.md` 列出 5 个步骤小节

## 7. 校对与收尾

- [x] 7.1 逐条复核 25 条新公式的物理正确性：对论文等式（成员的 `eq` / `page`）与代码实现，逐条写下依据。验证：25 条每条都能指到出处；指不到的退回 6.x 重写
- [ ] 7.2 视图侧核「进入子图 ↗」只在块上出现、成员的两个标签页照旧可点开可定位；引用落点文本变长后的显示（如 `thermal/eps_heat.md#ε_heatz-x-射线加热率`）在「文献」标签里读得过去。验证：起站点逐个手点块 / 成员两级各一条，并确认双击成员不再换画布
- [x] 7.3 `docs/notes/physics-chain/README.md` 与 `docs/notes/physics-chain/design.md` 里讲模块文档形状与"成员 → 步骤"子图的段落同步为"一对象一篇、与 `parent` 同构、步骤不上图"；`openspec/specs/graphify-physics-chain/spec.md` 由本变更 archive 时同步。验证：README 里搜不到"每个块 MUST 有一篇模块文档"与"进入成员的子图"这类旧口径
- [x] 7.4 门禁全绿并记下条数变化。验证：`cd Graphify && npm run check:chain && npm run check:copy` 全过，产物节点数（51）、断言条数与 `find docs/notes/physics-chain/modules -name '*.md' | wc -l`（67）写进真源 `design.md`
