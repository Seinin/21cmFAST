## 1. 前置与记账

- [x] 1.1 【已查 2026-09-30】真源 `docs/notes/physics-chain/` **整体未被 git 跟踪**（`?? `，`git ls-files` 为空，未被 ignore 命中）→ `git add` 与否待你定，本次先走 1.3 备份
- [x] 1.2 【已办 2026-09-30】`graphify-physics-chain-tree` 的 `proposal.md` 顶部已加"状态：已被取代"状态行（指向本 change，并写明判据：它的"块"是人按过程手写，本 change 的"块"由模块边界给出、自检逐条核对）。验证：`openspec/specs/graphify-physics-chain/spec.md` 里一级口径需求**只有一条**（`### Requirement: 一级只呈现物理主链`；tree 未归档 → 其块需求不进主规格）
- [x] 1.3 备份真源：`chain.json.bak-20260930`（56298 B，与真源同尺寸），验证 `blocks` 段可读

## 2. 真源：块表与节点（design D1/D2/D4/D5）

- [x] 2.1 【口径修订】重写 `blocks` 段为 **10 过程块 + 2 层 = 12 个块**（本任务原写"9 过程块 + 2 层 = 11"，是 D1 定稿前的数），每块带 `codeAnchor`。验证：`blocks.items` 长度 12、每块有 `codeAnchor`（过程块 `{kind:'compute',file,function,struct}`，层 `{kind:'files',files:[…]}`），自检逐条打开文件找函数名
- [x] 2.2 【口径修订】把对象重新挂到新块，验证 `node.parent` 取值集合恰为 12 个块 id、无 `stage:*` 残留。**对象数 24 → 28**：按 D2 补了 M1 `matter_power` / M2 `vcb` / M3 `perturb_field` 三个盒子产物，再加 M7 的 `filtered_xray`
- [x] 2.3 新增 M7 的成员 `filtered_xray`（X 射线加热源），验证该成员存在且 `parent = block:xray`
- [x] 2.4 拆解旧 ⓪ 带：`tgamma` → L0、`fstar` → M5、`k_target` → M10，验证 `block:env` 已不存在且三者 parent 正确（自检断言"零残留旧块 id"）
- [x] 2.5 移除旧 ② 块：`tvir_min` / `mmin` 归 M4，验证 `block:mmin` 已不存在
- [x] 2.6 【口径修订，需你定】真源里手写的 `tier` 已删除，验证通过（自检断言真源无 `tier`）。**但位次不是"由主序拓扑深度推出"**：实现是"真源手写 `order`（0=层、1..10=主序）+ 自检强制它与主序 / 反馈边方向一致（正向跨正位次、回流跨负位次）"。原因：L0/L1 与主序各块之间有接口边，纯按拓扑深度会把 M8 算到第 2 层（L0 → M8 那条边），位次就与主序错位。→ **design D4 里"自动推出"那句与实现不符，建议改 D4 而不是改实现**（要不要我改，等你一句话）

## 3. 真源：关系（design D3）

- [x] 3.1 删除 `q_hii -> eps_heat`（`Eq.7`）这条代码里不存在的边，验证真源 `edges` 里不再有该边
- [x] 3.2 【口径修订，需你定】反馈边最终是 **2 条**（M8→M6 `HaloBox.c:495`、M9→M6 `HaloBox.c:496`），D3 表里的第三条（M2→M6 `HaloBox.c:487` `lowres_vcb`）**落在主序接口边 M2→M6 上**、没有进 `feedback` 段——因为 M2→M6 本来就是一条主序依赖，D3 想表达的是"这条依赖同时有跨红移的含义"，实现里写进了那条接口边的 `note`。自检断言"回流边与真源 `feedback` 段逐条对应（不多不少）"→ 现在 2 条自洽。**若你要 D3 的三条**：在真源 `feedback` 段补 `block:initial -> block:halobox`（`HaloBox.c:487`）即可，但会与"块对唯一 / 每条 iface 恰被两端认领一次"类断言相撞，需一并看
- [x] 3.3 主序边补齐：**21 条接口边**，每条带 `codeRef`（或论文 `eq`）。含 `M6 → M9` 的 `n_ion/whalo_sfr` 与 `M8 → M9` 的 `J_21_LW/xray_ionised_fraction/kinetic_temp_neutral`；自检核对每条边两端存在且带出处
- [x] 3.4 给 L1 层写入按 `#include` 计数的共享内核清单（16 个头文件，每个带计数）。**验证比任务写的更强**：自检自己读源码重算每个头文件被几个 `.c` 引用，断言 ①清单顺序 = 引用面降序 ②每个成员头文件都被真引用过 ③注释里写的计数逐个与重算一致（够狠：改一个数字即失败，见 4.2 的反面演练）
- [x] 3.5 【口径修订】边上的 `eq` **没有全部改写**成 `codeRef`：46 条量间边保留论文 `eq`，反馈边与跨块接口边必须带 `codeRef`。自检两条都查（"每条边两端存在且带出处（Eq 或代码锚）"）

## 4. 生成器与自检（design D6）

- [x] 4.1 生成物里 12 个块都带 `codeAnchor`、边带 `kind`/`spanKind`，层类型落进生成物
- [x] 4.2 五条断言已加（锚存在、函数名在文件里、成员唯一归属且覆盖真源全部 28 个对象、10 个过程块各至少 1 个成员、零残留 `stage:*` 与旧块 id）。**反面演练已做**（原来只是注释里写着"必须失败"）：把 M8 锚改成 `ComputeTsBoxXYZ` → 自检报"`SpinTemperatureBox.c` 里找不到「ComputeTsBoxXYZ」"并退出码 1；把 L1 注释里 `cosmology.h 21` 改成 `22` → 报"写 22 / 实测 21"；真源随后还原、产物重建（幂等 ✓）
- [x] 4.3 "不存在的边"拦截已生效：手工抹掉一条边的 `eq` 与 `codeRef` → 自检报"每条边两端存在且带出处（Eq 或代码锚） — tvir_min->mmin"并失败
- [x] 4.4 "层不进过程数"已生效：`blocks.stats` 报 `processBlocks: 10` / `layerBlocks: 2`，状态条按 `kind === 'process'` 现算，自检断言

## 5. 前端（design D4/D5）

- [x] 5.1 `src/lib/physicsChain.ts` 按新块表读取（块 / 层 / `kind` / `order` / 反馈边），检索命中的块标注随之改成"过程块 · 主序第 N 步"与"横切层"。**补做**：`codeAnchor` 原来**没有任何界面出口**（视图侧 grep 为空）——现在属性页有"代码锚"一行（`SpinTemperatureBox.c · ComputeTsBox() · TsBox`；L1 拼成 `cosmology.h / hmf.h 等 16 个`），由 `PhysicsChainView` 拼好文案、`Inspector` 只渲染（维持"检查器不认识物理链"的分工）
- [x] 5.2 【半做，需你定】反馈边**反向画**已满足（数据就是下游→上游：M8→M6、M9→M6），与主序边的样式/图例区别**只做了一半**：反馈边挂 `.cross-link`（点线 + 弧线 + 自己一档颜色），但**这一页没有"主序边 / 回流边"的文字图例**——任务里"图例写明两者区别"未实现。要不要加一个画布角上的小图例（两条样式样本 + 一句话）？
- [x] 5.3 层不可进入、过程块可进入：双击 L0/L1 只弹一句（"这是一层，不是一个过程…"），双击 M8 进得去；画布不给层挂光晕/呼吸
- [x] 5.4 【口径修订】状态条按新口径报数，验证为**过程块 10、物理量 28**（本任务原写"9 / 2 / 24"）。层数不进状态条；数物理量读 `stats.members`（＝ `quantityMemberCount` 之和），否则会把 L1 的 16 个头文件当"物理量"报出 44

## 6. 文档

- [x] 6.1 `docs/notes/physics-chain/README.md` 第一、二节的划分依据仍按旧依据（论文等式 / 物理上独立）写，**未改**：文中还拿 S12.1/S12.2 之类当例子。待你定：是我按"与代码同构（一个 `.c` + `Compute*` + 盒子 = 一个块）"改写，还是先只加一段"口径已换"的说明 —— **由 `graphify-chain-block-anatomy` 接管**（它 4.4 已按"与代码同构"重写 README 第一、二节） —— 已由 `graphify-chain-block-anatomy` 的 4.4 完成（README 第一、二节按「与代码同构」重写：一个 `.c` + `Compute*` + 输出盒子 = 一个块），本 change 随之收口
- [x] 6.2 `docs/notes/physics-chain/papers.md` 的等式对照表**未按新块表改写**（仍是旧编号口径） —— **由 `graphify-chain-block-anatomy` 接管**（它 4.4 按新块表改写等式对照） —— 已由 `graphify-chain-block-anatomy` 的 4.4 完成（等式对照表按新块表改写）
- [x] 6.3 `docs/notes/graphify/G4-物理链.md` 与 `docs/DIRECTORY.md` 里 2026-09-30 的补记**只记到上一轮**（"按代码阶段 → 按天体物理过程打包"），**本次"一个块 = 一个代码模块 + 2 个横切层 + 代码锚 + 自检"这一轮没有条目** —— **由 `graphify-chain-block-anatomy` 接管**（它 4.5 补记：G4 全文重写、DIRECTORY §8 + §7 变更记录） —— 已由 `graphify-chain-block-anatomy` 的 4.5 完成（G4 全文重写、DIRECTORY §8 要素表与 §7 变更记录各补一条）

## 7. 验收

- [x] 7.1 【已跑 2026-09-30】`check:chain` 179 项 ✓ / `check:canvas` ✓ / `check:styles` 60 条规则 ✓ / `check:tabs` 34 项 ✓ / `check:graph` 13 项 ✓ / `check:code` 48 项 ✓ / `check:store` 39 项 ✓、`tsc --noEmit` 干净（`Inspector.tsx:221` 那条 `exhaustive-deps` 告警是旧的、与本次无关）、`eslint` 无 error、`npm run build` 成功
- [x] 7.2 浏览器实走（主图 12 个块/层 → 悬浮 M6 看 2 条反馈边 → 进 M8 / M9 / M5 三个子图 → 检索一个旋钮看命中块 → 状态条报 10/28）**需要你实走**：数据侧的等价事实已由 7.1 的自检覆盖，但"看着对不对"只有你能判 —— 实走：主图 12 个块/层；悬浮「网格化源项」见 2 条回流边；进入「气体热与自旋温度」「电离场」「晕到星系属性」三个子图正常；检索一个旋钮命中块正确；状态条报「过程块 10 · 物理量 39」（本条原文的 28 是上一轮成员数，现行为 39）

## 8. 先记账、后决定（不自作主张）

- [x] 8.1 【已定 2026-09-30】块**不给圆圈数字**（同屏三套 ⓪…⑨/①②③ 会串号）：稳定身份用语义 id（`block:*`，已在用），显示用 `M1…M10` 前缀，论文对照表写"新块名 ← 旧 ①…⑨"。旧编号清单已清（`check-physics-chain.mjs`、前端 5 文件、`build-physics-chain.mjs`；本轮又把 `blockKind: 'band'` → `'layer'`、`tier` → `order` 的残留一并清干净，`bandRules` 改名 `layerRules`）
- [x] 8.2 【已定 2026-09-30】层用 **A** 方案：L0/L1 是 `kind:'layer'` 节点，**带成员清单**（L1 成员 = 16 个头文件 + `#include` 计数），检查器可逐条列；层不可进入子图、不计入过程数。**补做**：层的 `note` 原来没地方显示 → 属性页现在先渲染这段注释，阶段号为空时按块类型说"无（成员是文件，不是物理量）"
- [x] 8.3 【已定 2026-09-30】`phi_uv` 放 M5（按产出模块，`LuminosityFunction.c` 吃 `hmf.h`/`thermochem.h`/`interp_tables.h`）
- [x] 8.4 【已查 2026-09-30】`docs/notes/physics-chain/` **整体未被 git 跟踪**（`git status --short` 显示 `?? docs/notes/physics-chain/`，`git ls-files` 为空，且未被任何 gitignore 规则命中）→ 本次改动无法 diff / revert，1.1（先 `git add`）或 1.3（落备份）**必须先做**
