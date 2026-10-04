## 1. 生成物带公式（真源 → 产物）

- [x] 1.1 `src/lib/types.ts` 的 `GraphNode` 与 `src/lib/physicsChain.ts` 的 `ChainGraphNode` 各补一个可选 `formula?: string`，注释写明它是**排版的 LaTeX**（与纯文本的 `summary` 分工：`summary` 仍是一句话/纯文本，也是检索说明的来源）。验证：`npx tsc -b` 通过（退出码 0）
- [x] 1.2 `scripts/build-physics-chain.mjs` 建表面节点处补 `formula`：取真源 `chain.docText[item.id].formula`（空串就不写这个字段），真源不动、逐字转录。验证：`npm run build:chain` 后，生成物里 **39** 个对象带 `formula`（34 节点 + 5 驱动量）、12 个块与 16 个文件成员不带（实测 39 / 块与成员 0）

## 2. 检查器：摘要位置渲染公式

- [x] 2.1 新增公式渲染件（`katex.renderToString(..., { displayMode: true, throwOnError: false })` + `dangerouslySetInnerHTML`，并引 `katex/dist/katex.min.css`）；空公式 MUST 不渲染成空框（返回 `null`）。验证：`npx tsc -b` 与 `npx eslint .` 通过（0 error）；`src/index.css` 补 `.formula-block` 一份收窄间距的 KaTeX 样式与同一套降级样式
- [x] 2.2 `src/components/Inspector.tsx` 的摘要位置分成两条：`node.formula` 存在 → 渲染公式、**不出输入框**；否则走现在的输入框（一行不动）。检查器 MUST NOT 新增物理链依赖（自检继续管着）。验证：见 4.4

## 3. 检查器：块的一级注释只印一遍

- [x] 3.1 删掉 `Inspector.tsx` 里「块 · 过程」标题下的灰色注释渲染，并把 `BlockDetail.note` 字段与 `PhysicsChainView.tsx` 的传参一并退场（生成物 `blocks.items[].note`、块节点的 `summary`、自检的「注释非空」断言全部保留）。验证：见 4.4

## 4. 自检与门禁

- [x] 4.1 `scripts/check-physics-chain.mjs` 补断言：生成物里带 `formula` 的对象与真源 `docText[id].formula` **逐字相同**；该带的没带、不该带的（块 / 文件成员）带了都失败并列出 id；每条 `formula` 用 `throwOnError: true` 渲染一次 MUST 不抛。验证：把 `fstar` 的公式改成 `\frac{1}{`（括号不配对）后自检失败并指名该 id；重新 `npm run build:chain` 后转绿
- [x] 4.2 同脚本补视图侧断言：检查器的公式分支存在且「有公式时不出输入框」（`<Formula` 排在 `<Textarea` 之前）；**反面断言**「块属性页不再印块一级注释」（去注释后的源码里不再出现 `block.note`）。验证：把那段灰色注释加回去，自检失败；撤销后转绿
- [x] 4.3 全量门禁全绿（退出码 0）：`check:chain`（274 项）、`check:copy`、`check:canvas`、`check:tabs`（34 项）、`check:store`（39 项）、`check:code`（48 项）、`check:graph`（13 项）、`check:tags`（27 项）、`check:styles`、`node scripts/check-latex.mjs`、`npx tsc -b`、`npx eslint .`（3 项既有 warning，均不在本轮改动处）
- [x] 4.4 三点实走（渲染层）：拿真产物（`src/generated/physics-chain.json`）喂真组件 `Inspector` 严格渲染一遍——① 选 `fstar`（带公式）：摘要位置出 `katex-display`、无 `katex-error`、无 `<textarea>`、无代码坐标，公式逐字取自真源（KaTeX 的 TeX annotation 即原文）；② 选块 `block:galaxy`（带成员明细）：成员明细在、灰注释不在，且数据层 `summary` 逐块等于真源 `note`（SSR 读不到 `textarea` 的值——它由 effect 填，故这一条对数据）；③ 画布页形态（同一节点去掉 `formula`、不带块明细）：摘要仍是 `<textarea>`、无公式。另起 dev server 确认 Vite 能转译 `Formula.tsx`（`katex.renderToString(...)` 与 `katex/dist/katex.min.css` 均可达，样式 200）与 `Inspector.tsx`（含 `Formula` 与 `node.formula`）

## 5. 顺手修的既有缺陷（真源公式转义）

- [x] 5.1 真源 `docs/notes/physics-chain/chain.json` 里 10 处行内公式的 `\alpha` 被写成 `\u0007lpha`（BEL 顶替反斜杠），模块文档渲染时 KaTeX 解析失败（`check-latex` 报 10 条）。改回 `\alpha` 后重新 `npm run build:chain`（产物 + 模块文档一并重生成），`node scripts/check-latex.mjs` 转绿；真源里已无残留 `\u0007` 转义
