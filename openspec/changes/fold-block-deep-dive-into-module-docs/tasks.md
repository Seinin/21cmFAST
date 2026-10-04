## 1. 前置

- [x] 1.1 归档已完成的 `graphify-leaf-module-docs`（`openspec archive graphify-leaf-module-docs`），使主规格含「模块文档一节点一篇，与子图树同构」。验证：`grep -n "模块文档一节点一篇" openspec/specs/graphify-physics-chain/spec.md` 有命中，且 `openspec list --json` 里不再有该变更

## 2. 真源

- [x] 2.1 `chain.json` 加三个顶层区块 `symbolMap` / `divergences` / `references` 与一张正文登记表（`sourceKey` → 仓内文件路径或空），骨架先空。验证：`python3 -c "import json;print(list(json.load(open('docs/notes/physics-chain/chain.json'))))"` 里四个键都在
- [x] 2.2 把平行页 `docs/notes/晕到星系属性_物理与代码.md` 的内容按对象拆进 `symbolMap` / `divergences` / `references`：`block:galaxy` 与其 5 个成员（`fstar` / `scaling_relations` / `rho_star` / `lx` / `phi_uv`）。验证：这 6 个 owner 各有条目，符号表覆盖该块用到的驱动参数（`F_STAR10`、`ALPHA_STAR`、`SIGMA_STAR`、`t_STAR`、`L_X`、`M_TURN`…），每条带 `site` 与 `conversion`
- [x] 2.3 逐块补齐其余 11 个块与其成员：`const` / `cosmo` / `initial` / `grav` / `halocat` / `halobox` / `thermal` / `ionization` / `obs` / `xray` / `kernel`。验证：`symbolMap` 的 owner 覆盖 12 个块的全部成员；`divergences` 的每条 owner 唯一；`references` 的每条有 `location` 与 `quote`；`kernel` 的 16 个文件成员按例外只给 `references`

## 3. 生成器

- [x] 3.1 `build-physics-chain.mjs` 渲染三节：`## 符号与代码名`（表：符号 / 代码名与默认值 / 进 C 换算 / 落点）、`## 口径分野`（表：对象 / 论文式 / 代码式 / 判据）、`## 参考文献`（表：对象 / 代码位置 / 出处原文 / 本地有无 + 末尾「本地缺正文」清单）；块那篇 = 成员条目并集（去重、按成员次序）。验证：重跑后 `docs/notes/physics-chain/modules/galaxy.md` 有五节且次序为 物理 → 符号与代码名 → 工程 → 口径分野 → 参考文献
- [x] 3.2 写前校验：某个 owner 缺符号行 / 分野判据不在两类里 / 出处缺 `quote` 时，生成器 MUST 报错退出、不写盘，并指名对象。验证：临时删掉一条 `quote`，生成器报错并指名该对象；磁盘文档保持上版
- [x] 3.3 `kernel` 的 16 篇只保留物理与工程两节（不出现新增三节）。验证：`grep -c '^## ' docs/notes/physics-chain/modules/kernel/cosmology.h.md` 为 2

## 4. 自检

- [x] 4.1 加断言：五节齐全且次序固定（层头文件成员例外为两节）。验证：人为删掉某篇的一节，自检失败并指名该篇
- [x] 4.2 加断言：符号表的每一行都有符号、代码名、落点三列；落点逐个打开源码核对（区间合法、跨度内、非整文件、检定标识逐个命中）；符号表覆盖该对象的全部成员用到的驱动参数。验证：把某行行号改偏一行，自检失败
- [x] 4.3 加断言：每条分野的判据只在 `两码事` / `同一算法的细化版` 两类里、归属唯一、块那篇 = 成员条目并集。验证：临时写一个第三类判据，自检失败并指名
- [x] 4.4 加断言：每条 `references` 的 `location` 检定标识命中，`local` 与正文登记表一致（登记文件存在 ⇔ `local: true`）。验证：把 `docs/论文/` 里的某篇挪走，自检失败并指名该条
- [x] 4.5 加断言：磁盘上的模块文档 = 现在重新生成的结果（既有那条对拍覆盖新增三节）；`docs/notes/` 下没有按块复述公式与落点的平行页。验证：手改一篇文档后自检失败；新建一个平行页后自检失败

## 5. 清理与登记

- [x] 5.1 删 `docs/notes/晕到星系属性_物理与代码.md`。验证：文件不存在；全仓 `grep -rn "晕到星系属性_物理与代码"` 0 命中
- [x] 5.2 删 `docs/DIRECTORY.md` 里该页的登记行，并把模块文档的描述改到五节口径。验证：`grep -n "物理与代码\|两节" docs/DIRECTORY.md` 0 命中

## 6. 门禁与收尾

- [x] 6.1 `cd Graphify && npm run build:chain && npm run check:chain && npm run check:copy` 全绿。验证：三条命令退出码为 0，自检打印的断言条数高于变更前
- [x] 6.2 `openspec validate fold-block-deep-dive-into-module-docs --strict` 通过。验证：退出码为 0
- [x] 6.3 内容自查：文档正文里没有施工说明、进度叙述、对话口吻与第二人称；每条"本地缺正文"属实。验证：`npm run check:copy` 0 命中；抽查 3 条 `local: false` 的出处，确认 `docs/论文/` 里确实没有正文
- [ ] 6.4 归档本变更（`openspec archive fold-block-deep-dive-into-module-docs`）。验证：变更进入 `openspec/changes/archive/`，主规格含五节与新三条需求

## 7. 工程一节印代码原文

- [ ] 7.1 生成器：工程一节每条落点跟着印出该区间的代码原文——单行落点印在落点同行，多行落点用代码块逐行印出，逐行取自源码文件本身；共享内核层那 16 篇按例外不印整文件。验证：重跑后 `docs/notes/physics-chain/modules/thermal/eps_heat.md` 的每条落点后面都能读到对应的 C 语句
- [ ] 7.2 生成器写前校验：落点区间读不到源码、或区间与代码行数对不上时 MUST 报错退出、不写盘。验证：临时把某条落点的 `endLine` 改偏一行，生成器报错并指名该条
- [ ] 7.3 自检：独立重读源码逐行对拍文档里印出的代码（单行与代码块两种形态各覆盖），内容或行数对不上 MUST 失败并指名该篇与被指的落点。验证：手改文档里任意一行代码后自检失败并指名

## 8. 参考文献只登记代码给出的出处

- [ ] 8.1 真源：把每个对象落点附近注释与参数 docstring 里**真的引到论文、节号或等式号**的条目补齐登记（`cosmo` / `initial` / `grav` / `halocat` / `thermal` / `ionization` / `xray` / `halobox` / `obs` / `const` 各自的对象），`location` 与 `quote` 逐字取自源码。验证：`references` 的 owner 覆盖全部在这些地方引出处的对象
- [ ] 8.2 真源：删掉没有引出任何论文的条目（只写硬编码、未标出处、口径提醒的那几条）。验证：这两类条目不再出现在任何一篇的参考文献一节里
- [ ] 8.3 自检：每条 `quote` MUST 含论文、节号或等式号的标记；`location` 的检定标识命中源码且 `quote` 是那几行注释的原话。验证：临时把某条 `quote` 换成一句不含出处的注释，自检失败并指名

## 9. 门禁与收尾（第二条）

- [ ] 9.1 `cd Graphify && npm run build:chain && npm run check:chain && npm run check:copy` 全绿；`openspec validate fold-block-deep-dive-into-module-docs --strict` 通过
- [ ] 9.2 逐条演示失效检测（改完即还原）：去掉一条代码原文、把代码印错一行、删掉一条给了出处的登记、登记一条没给出处的注释，各自能让生成器或自检失败并指名
