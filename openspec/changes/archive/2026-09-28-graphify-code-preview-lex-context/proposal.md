## Why

预览是**按段**请求的（每段 300 行），但语法高亮曾经是**按段各做一次**：抽屉把每个已加载段渲染成独立代码块，一段一个词法环境。于是：

- 任何跨 300 行接缝的构造都会被切断——Python 的文档字符串、C 的块注释、JS 的模板串，表现为"接缝之后整片变色"。
- 更常见的是**跳进文件中间**。用户报的那一处就是这样：`src/py21cmfast/drivers/lightcone.py` 的 `r"""` 文档串从 590 行开到 639 行，而为 644 行取的窗口是 601–900——**开引号不在窗口里**，Prism 便把 639 行那个本该是闭引号的 `"""` 当成开引号，644 行往后整片变成字符串色，而 VS Code 显示正常。
- 同一类偏差在 C 的块注释、JS/TS 的模板串、TOML 的三引号上完全一样，只是这个仓里 C 的注释块比 Python 文档串还多。

## What Changes

- **显示层以「连续区间」为单位做语法分析**：段仍是读取与传输单位，抽屉把已加载的**首尾相接**的段合并成一个代码块（一次 tokenize），跳转造成的空洞才分块。窗口数 = 已加载的不连续区间数，与请求次数无关。
- **服务端新增一行「词法前缀」**：`readCodeWindow` 两个取法都增量返回 `lexPrefix: { start, text } | null`——窗口起点落在跨行构造内部时给出开启该构造的那一行的原文与行号，否则 `null`（不扫描、零开销）。新增 `server/lib/lexState.mjs`：按语言家族（`#` / `//` / `!` 行注释、块注释、三引号、反引号模板串、反斜杠续行）从文件头扫到窗口起点；注释与字符串内部的标记不算构造起点。
- **前端把它拼进待分析文本但不显示**：`CodeBlock` 拼上前缀行、按行号隐藏它；`startingLineNumber` 从窗口首行往前挪「前缀行数」格，让可见行拿回**真实文件行号**（否则隐藏行会把后面每一行顶掉一位，滚动定位与高亮区间全错位——实测：`code-line-644` 里装的会是第 654 行）。
- **合并逻辑做成纯函数** `mergeRuns(segments)`（`useCodeLibrary.ts`）：区间要高亮的行 = 引用区间与区间的交集。
- **既有行为一字不改**：段仍 300 行、页边界对齐、边界自动续段、向上续段滚动锚定、三个定位按钮、大文件说明、「区间已被截断」提示、三个出口，以及选择器的 `highlight` 取法。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-code-preview`：分段浏览的契约补上"显示层以连续区间为单位整体高亮（段只是传输单位）"，并新增一条要求——从跨行构造内部开始的窗口由一行词法上下文摆正；该行只参与语法分析、不显示，也不改变任何可见行的行号。

## Impact

- **服务端**：新增 `server/lib/lexState.mjs`；`server/lib/codeIndex.mjs` 的 `readCodeWindow` 两个取法都增量返回 `lexPrefix`（既有字段、夹紧口径与段元数据一律不动）。改动需**重启 dev 服务**才生效。
- **前端**：`src/lib/types.ts`（`LexPrefix` + `CodeWindow.lexPrefix`）、`src/hooks/useCodeLibrary.ts`（`CodeWindowRun` + `mergeRuns`）、`src/components/CodeSnippet.tsx`（抽出 `CodeBlock`，`CodeSnippet` 变薄封装）、`src/components/CodePreviewDrawer.tsx`（按区间渲染）。`CodePickerDialog` 不改，自动受益。
- **脚本与文档**：`scripts/check-code-preview.mjs` 新增 17 项断言（共 48 项）；`README.md` 的「源码引用与行预览」一节补两条。
- 不引入新依赖：词法上下文是自写的小状态机，高亮仍是既有的 `react-syntax-highlighter`（Prism 1.30）。
