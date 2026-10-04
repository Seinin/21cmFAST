## 1. 基线

- [x] 1.1 跑现有门禁留基线：`cd Graphify && npm run check:chain`（记下项数与全绿状态），并记下当前"界面出口上带编号的字符串"清单（块标签 12、步骤标签 21、成员明细右列、命中说明、引用落点、骨架标题）。验证：命令输出与清单都在手，作为改动前的对照 —— 实跑：改动前 **210 项全绿**；出口清单：块标签 12 条（`M8 气体热与自旋温度` …）、步骤标签 21 条（`S14.3.1 · 解自旋温度` …）、成员明细右列（`S14`）、命中说明（`物理量 · 属于 … · 代码 S14`）、引用落点（`physics-chain/modules/M8-thermal.md` + `M8-thermal.md#members`）、骨架标题（H1 `M8 气体热与自旋温度` / `### S14.3.1 · 解自旋温度`）

## 2. 真源：名字去码（design D1/D2/D3）

- [x] 2.1 `chain.json` 的 12 个块 `label` 去掉模块码前缀（`M8 气体热与自旋温度` → `气体热与自旋温度`），`order` 与 `id` 不动。验证：生成物里 12 个块标签都不匹配 `^[MLS]\d` —— 实跑：12 个 `label` 去前缀，`id`（`block:thermal` …）与 `order` 逐字未动；生成物里 12 个块标签无编号
- [x] 2.2 `chain.json` 的 12 处 `noteDoc` 改成 "块 id 去掉 `block:` 前缀" 的文件名（`physics-chain/modules/thermal.md`）。验证：自检的「文档存在」断言通过，且新加的"文件名 = id"断言通过 —— 实跑：12 处 → `physics-chain/modules/{const,kernel,cosmo,initial,grav,halocat,galaxy,halobox,xray,thermal,ionization,obs}.md`；自检「笔记引用的文档真实存在且锚点能定位到小节」「落点不带编号」通过
- [x] 2.3 改写真源散文里的模块码：`blocks.note`（含"显示用 M1…M10"那句旧口径）、`blocks.items[].note`（5 条）、`processes.note`、`processes.items[].note`（10 条）、`processes.uncovered.note`、`edges[].note`（1 条）。验证：真源里这些字段的字符串都不匹配编号形状；生成物同步（重新生成） —— 实跑：改写 24 处（`blocks.note` 3 + `blocks.items[].note` 5 + `processes.note` 4 + `processes.items[].note` 10 + `processes.uncovered.note` 1 + `edges[].note` 1），改写前后都用同一 dump 参数（`indent=2, ensure_ascii=False`）往返校验、逐字可复现；剩下带编号的只有账本字段（`stage` / `codeHints` / `codeAnchor` / `algorithms` / `implementedAs` / `theory`）与量的符号名 `m22`（长得像编号、但不是）
- [x] 2.4 重新生成产物：`node scripts/build-physics-chain.mjs`。验证：生成物里 `graph.nodes[].label`、`blocks.items[].label` 无编号；`refs[].label`（`模块笔记：<标题>`）无编号 —— 实跑：生成器重跑后 `graph.nodes[].label`、`blocks.items[].label`、`refs[].label` 三类都不匹配编号形状；真源散文里**进产物**的那几处（顶层 `note`、`blocks.items[].note`、`processes.*`、`edges[].note`）已随重生成同步换成块名（`blocks.note` 不进产物，是纯真源说明，一并改了）

## 3. 骨架文档（design D3）

- [x] 3.1 12 份 `docs/notes/physics-chain/modules/*.md` 改名成 `{块 id 去前缀}.md`（`M8-thermal.md` → `thermal.md`）。验证：`docs/notes/physics-chain/modules/` 下 12 个文件名都不匹配编号形状 —— 实跑：`git mv` 12 份 → `const.md` `kernel.md` `cosmo.md` `initial.md` `grav.md` `halocat.md` `galaxy.md` `halobox.md` `xray.md` `thermal.md` `ionization.md` `obs.md`
- [x] 3.2 文档标题去码：H1 = 块名、步骤小节 = 步骤名（成员 `##` 小节本来就没有编号）。验证：自检的"骨架形状：标题清单 = 标签清单"与"锚点落在小节上"两条断言通过（标题改坏就当场失败） —— 实跑：12 个 H1 换成块名、21 个 `###` 小节去掉 `S14.3.1 · ` 前缀；自检「12 份骨架的形状」「锚点能定位到小节」通过，且 21 个 `step:*` 标签在各自文档内无重名
- [x] 3.3 改名要同步引用：`docs/DIRECTORY.md`、`docs/notes/physics-chain/README.md`、`docs/notes/graphify/G4-物理链.md` 里指向旧文件名的链接与示例。验证：全仓 `grep -rn "M8-thermal\|L0-const\|M10-obs"` 只剩历史记录（change 归档里的原文） —— 实跑：同步 `docs/DIRECTORY.md` §8（骨架命名口径、落点示例、断言项数 210→220、§7 变更记录补一行）、`docs/notes/physics-chain/README.md`（骨架文档一节 + `docId` 示例）、`docs/notes/graphify/G4-物理链.md` §五/§六（落点示例 + `modules/*.md`）、`Graphify/src/lib/types.ts` 与 `Graphify/scripts/check-physics-chain.mjs` 的注释示例、`graphify-chain-leaf-refs` 的 spec/proposal/design 示例；全仓 grep 旧名只剩**记录性**命中（`Graphify/src/generated/physics-chain.json.bak`、change 归档、以及"当时的名字"那几句叙述）

## 4. 生成器：步骤标签去码（design D1）

- [x] 4.1 `build-physics-chain.mjs:1149` 的步骤标签不再拼 `${unit} · ${name}`，只留步骤名；单元号仍进数据（`stage` / 落点 / 检索面）。验证：生成物里 21 个 `step:*` 标签无编号，且同一文档内无重名（自检的锚点断言通过） —— 实跑：21 个 `step:*` 标签无编号；单元号仍在 `stepId`（`step:S14.3.1`）与源码引用的 `label`（21 种）里；框宽也改成按去码后的标签实测
- [x] 4.2 连跑两次生成器产物逐字一致（`stamp` 也一致）。验证：第二次跑报"产物无变化"，`sha256` 一致 —— 实跑：`sha256 = cc831a5d0a026d5c493c7b8f2d7ecb855bb83ec7d83f8e0d20b462a030bb1ec1`，两次戳记都是 `generated-024d7c1776de`，第二次报「产物无变化（幂等）」

## 5. 前端：撤掉最后三处出口（design D4）

- [x] 5.1 块「成员明细」撤掉右列（阶段号）：`Inspector.tsx:542` 那一格与 `PhysicsChainView.tsx:314` 的 `stage:` 项。验证：`check:chain` 的"块属性页只从生成物读成员"断言仍通过；`tsc -b` 无输出 —— 实跑：成员行只剩成员名，`members` 类型去掉 `stage`，视图不再查 `CHAIN_GRAPH.nodes…stage`；自检「块属性页只从生成物读成员」通过，`tsc -b` 无输出
- [x] 5.2 检索命中说明去掉 `· 代码 ${node.stage}`（`physicsChain.ts:724`），命中面保留阶段号。验证：按 `S14` 检索仍返回命中，且说明里不含 `代码 S14` —— 实跑：说明改为「物理量 · 属于 气体热与自旋温度」；自检**真跑** `searchChain('S14')` 仍命中 **7 条**，且没有一条说明里带头编号
- [x] 5.3 检索框占位文案去掉 `（S14 也行）`（`ChainSearchPanel.tsx:306`）；相关注释里的"命中说明里的「代码 S14」保持"一并改正。验证：`npm run check:copy` 通过；`Inspector.tsx:667` 那段注释不再承诺印编号 —— 实跑：占位文案 → 「搜参数 / 物理量 / 过程 / 文献」；`check:copy` 通过；那段注释改成"字段仍是数据与检索命中面，只是不再有任何界面出口"，并加了去注释后的源码断言

## 6. 自检：守住这件事（design D5）

- [x] 6.1 新增"界面出口不含内部编号"一组断言（标签面 / 落点面 / 散文面 / 骨架面），全部在生成物与真源上重算。验证：断言出现在 `check:chain` 输出里，全绿 —— 实跑：新增 `[呈现面：名字与落点不含内部编号]` 一节 **10 项**，覆盖标签面 / 落点面 / 散文面 / 骨架面 / 命中说明面（真源与生成物各重新读一遍、不借上一节的作用域），另有"编号仍在数据里"的反向断言。散文面只扫**成句的散文**（顶层说明 / 块注 / 过程面注 / 边注 / 兜底注），不做全量字段扫描：账本字段带编号是本职，而量的符号名 `m22` 会被编号形状误伤（试扫全量时它当场报假失败，故收敛口径）；`check:chain` 210 → **220 项**全绿
- [x] 6.2 新增一条反面断言：`searchChain` 的说明拼装不许再读 `node.stage`（源码层查，去注释后查）。验证：断言可见、通过 —— 实跑：两条反面断言——① `detail:` 拼装行（去注释后）不许出现 `stage`；② `member.stage` 不许出现；另加检索框占位文案不带编号示例；三条全绿
- [x] 6.3 反面演练（真跑，不许只写在注释里）：①把某个块的 `label` 改回 `M8 气体热与自旋温度` → 标签面断言指名该块；②把某条笔记引用的 `anchor` 塞回 `m8-…` → 落点面断言指名；③复原后 `sha256` 与演练前一致、重跑生成器报"产物无变化"。验证：三步的实际输出 —— 实跑三步：

  **① 标签面**：把 `block:thermal` 的 `label` 改回 `M8 气体热与自旋温度` → 重跑生成器 → 自检失败 5 / 220，其中新增的三条当场指名（另两条是既有的「锚点能定位到小节」「骨架形状」，说明改坏名字会连带把锚点与标题一起带歪）：

  ```
  ✗ 界面上的名字是纯名字：块 / 量 / 步骤 / 过程词条的标签都不带阶段号与模块码 — block:thermal：M8 气体热与自旋温度
  ✗ 引用卡片上的落点不带编号（`thermal.md#updatexraysourcebox`：真实文件名 + 真有的小节） — block:thermal：笔记引用的 anchor ＝ m8-气体热与自旋温度 | block:thermal：笔记引用的 label ＝ 模块笔记：M8 气体热与自旋温度
  ✗ 命中说明里不印阶段号（说明只写"属于哪个块"） — ε_heat(z) · X 射线加热率：物理量 · 属于 M8 气体热与自旋温度 | T_K(z) · 气体动力学温度：… | J_α(z) · Ly-α 辐射场强度：…
  ```

  **② 落点面**：复原 `label`，把 `noteDoc` 与骨架文件名塞回 `m8-thermal.md` → 重跑生成器 → 自检失败 **2 / 220**，且**只有新增的两条**（余 218 项全过——这次演练是"自洽的回归"，除了这两条没有别的断言抓得住它）：

  ```
  ✗ 引用卡片上的落点不带编号（…） — eps_heat：笔记引用的 docId ＝ physics-chain/modules/m8-thermal.md | tk：… | jalpha：…
  ✗ 12 份骨架的文件名与标题不带编号（标题＝名字，锚点由它算出来） — physics-chain/modules/m8-thermal.md：文件名带编号
  ```

  **③ 复原**：`git mv` 改回 + 真源从备份拷回 → 重跑生成器**逐字重建**出演练前的产物（`cc831a5d…`，与演练前一致）→ 再跑一次报「产物无变化（幂等）」；真源 `sha256 = 215bfe198f963223f9b1fcdd4ca6a0585f4fb3a43b834e9347e02d9fa03edc85`，与演练前一致（`.bak` 一并换回干净产物，不留演练残迹）

## 7. 验收与收口

- [x] 7.1 全门禁：`npm run check:chain`、`npm run check:copy`、`npx tsc -b`、`npx eslint src scripts`、`npm run build`。验证：五条命令的实际输出 —— 实跑：`check:chain` 220 项全过（`✓ 物理链自检通过（220 项断言）`）；`check:copy` 通过（`✓ 表面文案自检通过`）；`tsc -b` 无输出、exit 0；`eslint src scripts` 0 error / 3 warning（`Inspector.tsx:235` 的 `useEffect` 依赖告警 + 两处 `react-refresh` 告警，改动前就在、与本次无关）；`npm run build` ✓ built in 11.09s
- [x] 7.2 浏览器实走（**需你实走**）：一级框上没有 `M8` → 进一个量的子图，步骤框上没有 `S14.3.1` → 选中块看成员明细没有阶段号 → 展开「文献」点一条，落点是 `thermal.md#…` 且文档标题与块名逐字相同 → 按 `S14` 检索能命中、说明里没有「代码 S14」 —— 实走：一级框上没有 `M8`；进一个量的子图，步骤框上没有 `S14.3.1`；选中块看成员明细没有阶段号；展开「文献」点一条，落点是 `thermal.md#…` 且文档标题与块名一致
- [x] 7.3 【收口】确认 `graphify-chain-leaf-refs` 已在主规格里落位后再归档本变更（它的规格 delta 与本变更无冲突，见 design D6） —— 已确认 `graphify-chain-leaf-refs` 先归档（其 delta 已落主规格），本 change 随后归档
