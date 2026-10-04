## Context

见 `proposal.md` 的 Why。设计上要接的现状：

- 检查器（`src/components/Inspector.tsx`）是**通用模板**：画布页与物理链页共用，页面的差异靠入参（物理链页 `onPatchNode={readOnlyNotice}`、`tagsEditable={false}`、`blockDetail`）。自检里有一条断言守着它 MUST NOT `import '../lib/physicsChain'`。
- 真源 `docs/notes/physics-chain/chain.json` 的 `docText`（键 = 对象 id，层里的文件成员是 `file:<文件名>`）里，**每个成员恰好一条 `formula`（LaTeX）**：34 个节点 + 5 个驱动量 = 39 条；12 个块与 16 个文件成员的 `formula` 为空（生成器与自检已按「块不自造散文、文件成员不给公式」逐条断言）。
- 生成物 `src/generated/physics-chain.json` 里，表面节点的摘要 `summary` 对量来说是**纯文本公式**（`item.formula`），对块来说是块的一级注释（`block.note`）；`graph.nodes[]` 上没有 LaTeX。
- `katex@^0.16.47` 已是直接依赖；`MdReaderDrawer` 已经引 `katex/dist/katex.min.css` 并用 `remark-math + rehype-katex` 渲染站点文档里的公式。
- 块属性页目前把块的一级注释印两次：摘要位置的通用输入框里一次（`node.summary === block.note`），「块 · 过程」标题下再一次（`BlockDetail.note`）。

## Goals / Non-Goals

**Goals:**

- 物理量（带公式的对象）在摘要位置读到**排过版的公式**，不是可编的伪公式文本。
- 公式的**唯一一份**仍在真源；生成物只是把它带出来，视图只渲染。
- 块的一级注释在右侧栏只印一次。

**Non-Goals:**

- 不动真源、不动 `modules/**` 文档（那批公式已经排进文档，本次只是让检查器也能显示）。
- 不改画布页的数据与行为；不为「没有公式的对象」改环境（块、文件成员、大框的摘要位置形态不变）。
- 不给摘要加新的物理叙述、推导或来源标注（这一页的物理由文档承担）。

## Decisions

### D1：公式由生成器从真源逐字烘进生成物，视图不转录

生成物给每个表面节点补 `formula`，值取真源 `docText[item.id].formula`（驱动量同路径）。视图只读渲染。

- 备选（否）：视图侧把 `summary` 的纯文本公式当公式渲染——它是 Unicode 伪公式，不是 LaTeX，排版不了。
- 备选（否）：把 `docText` 整份塞进生成物让视图现取——把文档的成段散文也带进产物，产物与自己那份文档重复。

### D2：判据就是「有没有公式」，不按 `kind` / `type` 写名单

有 `formula` ⇒ 摘要位置渲染公式；没有 ⇒ 走通用分支。真源里 39 条公式恰好覆盖全部成员对象（含两个 `kind: engineering` 的成员 `hmf_impl` / `source_grid`），块与文件成员天然为空。

- 备选（否）：按 `type !== 'process' / 'group'` 判——把「工程项也是物理链上的量」这条既有口径重新按名字手写一遍，多一处会走样的名单。
- 备选（否）：只给 `type === 'quantity'`——驱动量（`f*`、`L_X`、`ζ`…）也是真源里带公式的量，漏掉它们等于同一栏里两种待遇。

### D3：用一个薄渲染件直接调 KaTeX（display 模式），不引 markdown 管线

新增一个小件：`katex.renderToString(latex, { displayMode: true, throwOnError: false })` + `dangerouslySetInnerHTML`，并引 `katex/dist/katex.min.css`（与 `MdReaderDrawer` 同一份样式）。

- 备选（否）：复用 `MdReaderDrawer` 的 `react-markdown + remark-math + rehype-sanitize + rehype-katex`——为一条公式拖一整套 markdown 管线，还要维持 sanitize 白名单；那条管线的存在理由是「站点文档里 Markdown 与公式混排」。
- `throwOnError: false`：一条坏公式渲染成红字而不是把整栏的 React 树炸掉；**能不能渲染由自检守**——自检对生成物里每条 `formula` 跑一次 `throwOnError: true` 的渲染，失败即报（`check:latex` 已覆盖文档里的同一批公式，这里对产物再断言一次）。
- KaTeX 的输出是可信 HTML、公式来自本仓真源（不是用户输入），与 `MdReaderDrawer` 的判断一致。

### D4：摘要位置只有一条分支，检查器仍是通用模板

`node.formula` 存在 → 渲染公式（不出输入框）；否则 → 现在的输入框原样。检查器不新增「物理链模式」入参、不 import 物理链（自检那条断言继续成立）；画布页节点没有 `formula`，因此一个字都不变。

### D5：块注释退的是**界面出口**，不是数据

删掉 `BlockDetail.note` 与它在 Inspector 里的那段渲染（以及 `PhysicsChainView` 的传参）；生成物 `blocks.items[].note`、块节点的 `summary` 与自检的「注释非空」断言全部保留。所以信息不丢：块的一级注释仍在摘要位置读到。

## Risks / Trade-offs

- [块注释从「成员明细」区删掉后，只看那一段的人以为信息没了] → 它仍在同一栏的摘要位置（紧邻上方），且生成物与自检都还在断言这个字段非空。
- [公式渲染失败在页面上表现为红字] → 自检对生成物里的每条公式跑一次严格渲染；**同时**视图用非严格模式，坏公式不炸整栏。
- [生成物里出现两份「公式」：`summary` 是纯文本、`formula` 是 LaTeX，易混] → 字段注释写明分工（`summary` = 一句话/纯文本，仍是检索说明的来源；`formula` = 排版的 LaTeX）；自检断言两者都在、且 `formula` 与真源逐字相同。
- [将来给某个块也写公式，页面上它会顶掉摘要输入框] → 真源侧本就规定块与文件成员不给公式（生成器写前校验直接报错），这条口径不会悄悄改变。

## Open Questions

（无）
