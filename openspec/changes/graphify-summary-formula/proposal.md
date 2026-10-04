## Why

物理链页的检查器把「摘要」摆成一个**输入框**：选中一个物理量，框里躺着一行 Unicode 拼出来的伪公式（`ρ̇*(z) = f* · ρ̄_b · ∫_{M_min}^{∞} …`）——它既不是这一页该给读者看的样子（站点的公式都是排过版的），也不该是可编的（这一页整页只读）。同一栏里还有第二处重复：块属性页在「块 · 过程」标题下又印一遍块的一级注释，而同一句话已经在「摘要」里躺着。

真源的 `docText` 里每个成员**恰好一个 LaTeX 公式**（生成物 `physics-chain.json` 只带了它的散文与文档，没把公式带出来），这份公式已经排进了成员那篇文档，却在检查器里用不上。

## What Changes

- **物理量的摘要位置给公式**：生成物给每个带公式的对象（真源 `docText[id].formula` 非空者 = 34 个节点 + 5 个驱动量）补一份 **LaTeX** `formula`，由生成器从真源逐字转录；物理链页的检查器在摘要位置**渲染**它（KaTeX，独立成行的 display 公式），**不出输入框**。没有公式的对象（12 个块、16 个文件成员、大框）照旧走原来的输入框路径——判据落在数据上，不按种类手写名单。
- **块的一级注释只印一遍**：删掉块属性页里「块 · 过程」标题下那行灰色注释（`BlockDetail.note` 的渲染与它的传参一并退场）；那句话仍在摘要位置、仍在生成物的 `blocks.items[].note` 上（数据一个字段都不删）。
- 「摘要」的纯文本内容（`summary`）不退场：它仍是数据、仍是检索命中说明的来源，只是**带公式的对象不再把它铺在摘要框里**。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-physics-chain`：
  - ADDED「物理量的摘要位置给公式」——生成物带 LaTeX `formula`、检查器在摘要位置渲染它且不出输入框、没有公式的对象不变；
  - ADDED「块的一级注释只印一遍」——块属性页 MUST NOT 重复印块的一级注释（它只印在摘要位置）。

## Impact

- 生成器：`Graphify/scripts/build-physics-chain.mjs`（表面节点的 `gNodes` 补 `formula`，取 `chain.docText[item.id].formula`）→ 生成物 `Graphify/src/generated/physics-chain.json`。
- 视图：`Graphify/src/components/Inspector.tsx`（摘要位置的公式分支 + 删块注释那段 JSX）、新增一个公式渲染件（KaTeX，`katex` 已是直接依赖 `^0.16.47`，`MdReaderDrawer` 已在用同一套渲染栈）、`Graphify/src/components/PhysicsChainView.tsx`（不再往 `BlockDetail` 递 `note`）、`Graphify/src/lib/types.ts` + `Graphify/src/lib/physicsChain.ts`（`GraphNode` / `ChainGraphNode` 补 `formula?`）。
- 自检：`Graphify/scripts/check-physics-chain.mjs`（生成物公式与真源逐字对拍、块与文件成员不带公式、视图的公式分支与「不再出输入框」、反面断言：块属性页不再印块注释）。
- 不动：真源 `docs/notes/physics-chain/chain.json`（`docText.formula` 已在，逐字不改）、`modules/**` 文档、画布页数据与行为（画布节点没有 `formula`，走的是原路径）。
- 门禁：`npm run check:chain`、`check:copy`、`check:latex`、`tsc -b`、`eslint`。
