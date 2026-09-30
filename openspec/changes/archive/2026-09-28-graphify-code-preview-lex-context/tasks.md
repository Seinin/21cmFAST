## 1. 服务端：词法上下文

- [x] 1.1 新增 `server/lib/lexState.mjs`：`lexPrefixFor(lines, lineNumber, language)` 返回 `{ start, text } | null`；状态机覆盖行注释（`#` / `//` / `!`）、块注释、三引号（含前缀）、反引号模板串、反斜杠续行；注释/字符串内部的标记不切换状态；`json` / `text` 直接跳过 — 验证：`check:code` 里 13 条合成用例（含 `char *p = "/*";` 不算块注释、`# 他说 """ 就完了` 不算构造、`x = "a" // "b"` 在 fortran 里不算注释）
- [x] 1.2 `server/lib/codeIndex.mjs` 的 `readCodeWindow` 在 `highlight` 与 `range` 两个取法都增量返回 `lexPrefix`（既有字段、夹紧口径、段元数据不动）— 验证：`lightcone.py` 601 起 → `{ start: 590, text: '    r"""' }`；644 起 → `null`；`highlight` 取法窗口 638–656 → 590
- [x] 1.3 `scripts/check-code-preview.mjs` 补 17 项断言：状态机合成用例 13 条 + 真实文件 4 条（601 段带前缀、前缀即那一行原文、644 起不给、`highlight` 取法同样带）+ 通用性质（每段前缀都在窗口之前、不在窗口内、非空）— 验证：`npm run check:code` 全绿（48 项断言）

## 2. 前端：一个连续区间一个代码块

- [x] 2.1 `src/lib/types.ts` 增 `LexPrefix` 与 `CodeWindow.lexPrefix` — 验证：`npx tsc -b` 通过
- [x] 2.2 `src/hooks/useCodeLibrary.ts` 增 `CodeWindowRun` 与纯函数 `mergeRuns(segments)`：按 `prev.endLine + 1 === next.startLine` 合并、区间取首段的 `lexPrefix`、末段的 `hasNext` — 验证：`npx tsc -b` 通过；抽屉改用 `useMemo(() => mergeRuns(segments), [segments])`
- [x] 2.3 `src/components/CodeSnippet.tsx` 抽出 `CodeBlock`（行数组 + 语言 + 首行行号 + 高亮区间 + 可选 `lexPrefix` + compact）：拼上前缀、`startingLineNumber = startLine - 前缀行数`、前缀行 `display: none` 且不挂 id；`CodeSnippet` 保留原签名成为薄封装 — 验证：探针实测 644 行的 innerHTML 含 `rgb(64, 120, 242)`（`=` 运算符）且文档串行没有该颜色
- [x] 2.4 `src/components/CodePreviewDrawer.tsx` 按区间渲染：`runs.map(...)` 每区间一个圆角块（key = 区间首行），高亮取 `highlightOf(run, anchorFrom, anchorTo)`；头部徽标在多个区间时如实写「（共 N 段）」；`evaluate()` / `rememberAnchor()` / `SegmentHint` / 三个出口保持原样 — 验证：探针实测「跳到文件头后两个块 → 滚到 601 续上中间段后合成一个块 699 行」

## 3. 验证

- [x] 3.1 浏览器探针（Windows 侧无头 Edge + CDP，跑完即删）：选中节点「① lightconer 校验」→ 点开源码引用 `lightcone.py:644`，断言 24 项全绿——打开只渲染一个块、可见行 601–699 且行号真实、文档串内部不是代码而 644 行是代码、前缀行隐藏且不挂 id、两段时不硬拼、续段后合成一个 699 行的块、向上续段阅读位置不跳动、无重复 `code-line-N`、跳到文件尾末行在视口里 — 验证：`✓ 浏览器探针通过（24 项断言）`
- [x] 3.2 回归：`npx tsc -b`、`npm run lint`（仅两处既有警告）、`npm run build`、`npm run check:code`（48 项）、`npm run check:canvas`、`npm run check:styles` 全绿 — 验证：逐条命令输出
- [x] 3.3 `README.md` 的「源码引用与行预览」一节补两条：段只是读取与传输单位、连续区间整体高亮；从跨行构造中间打开时由服务端补一行隐藏的词法上下文 — 验证：README 该节含上述两句
