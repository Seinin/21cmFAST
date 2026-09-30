## Context

见 proposal.md 的 Why。现状（第一版矩阵页）与实测数据：

- 参数列 248px 且一行两排（`F_STAR10` + 英文说明小字），行高 28px；浏览器实测该列被最长内容撑到 **240px**（`table-layout: auto` 不会缩到内容以下）。
- 矩阵放在 `glass-panel min-h-0 flex-1 overflow-auto` 的内部框里滚动；列头 `sticky top-0`、参数列 `sticky left-0` 相对它生效。
- 数据侧 15 参数 / 9 过程 / 33 有色格，`MatrixRow` 已带 `description`（源码 docstring 首句）与 `processCount`。

## Goals / Non-Goals

**Goals:** 参数列收窄且行内只留两个名字；行高与列宽给出可断言的确定值；矩阵在单一滚动口内整页滚动（吸顶 + 吸左同时生效）；中文物理名可查、可自检。

**Non-Goals:** 不改数据结构与生成脚本口径；不引入折叠交互；不动画布、服务端、工程视角图谱；不新增依赖。

## Decisions

**D1：中文名放界面层（`src/lib/paramAliases.json`），不写进生成物。**
生成物的契约是"完全由 atlas 文档与源码推导 + 内容哈希戳记 + 可幂等重跑"；中文名是命名不是解释。
为免变成无据的手写，每条强制 `source`（源码行号或文档锚点），由 `check:physics` 断言。放 JSON 而不是 TS，
是为了让前端（`import`）与自检脚本（`fs.readFile + JSON.parse`）共用同一份，不必两处抄写。
替代方案：塞进 `meta.tags[].description`——会把命名和解释混在一个字段里，且污染生成物。

**D2：单一滚动口，而不是"外层纵向 + 内层横向"。**
CSS 规范里一个轴不是 `visible` 时另一个轴会被算成 `auto`；把横向滚动拆到内层 `overflow-x-auto` 的 div，
内层因此也成了"纵向滚动口"（虽然它并不滚），`top` 的 sticky 会挂到它身上 ⇒ 列头随页面滚走（第一版实测就是
表头一路滚到 y=16）。所以两轴都交给矩阵视图那一层（`flex-1` + `overflow-auto`），吸顶与吸左才是同一个滚动口。

**D3：`colgroup` + `table-layout: fixed` 钉死列宽。**
自动布局下参数列等于最长内容的宽度（实测 240px）。固定布局 + 显式列宽后，超出部分由行内 `truncate` 处理，
完整内容进 tooltip。参数列取 **176px**：25 字符的参数名（mono 10px ≈ 138px）放得下，中文名放不下的部分截断。

**D4：行高/列宽都用确定像素（22 / 56 / 176 / 92），便于断言。**
浏览器实测直接量 `getBoundingClientRect()`，避免"看起来差不多"的回归。

**D5：不做折叠。**
列头/行头折叠会掩盖"某过程整列无关"这条形状结论（那是本页的主要产出之一），用户也已明确选择"用滚动代替展开"。

## Risks / Trade-offs

- [中文名长度顶到上限] → 自检断言 `short ≤ 8` 字符；`POP2_ION` 的初稿"Pop II 光子数"（10）因此改成"每重子光子数"（6），Pop II 的限定留在 tooltip 的 docstring 原文里。
- [钉死列宽后长参数名被截断] → tooltip 给全名与依据；参数列 176px 是按最长参数名（25 字符）反推的下限。
- [只留一个滚动口后，窄窗口下横向滚动条与纵向滚动条都在同一层] → 实测在 640×330 视口下两种 sticky 都正确，可接受。

## Migration Plan

纯前端布局与一张静态对照表，无数据迁移。回滚 = 还原这几个组件与表格样式。
