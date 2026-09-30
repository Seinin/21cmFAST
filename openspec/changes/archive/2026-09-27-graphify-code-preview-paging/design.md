## Context

预览链路是单一的：`CodePreviewDrawer` → `useCodeWindow(file, line, endLine, 10)` → `GET /api/code/content?file&start&end&context` → `readCodeWindow()`。该函数返回的是**一个窗口**："高亮区间 ± context"，其中 `pad = min(200, context)`，高亮区间自身再被 `CODE_MAX_WINDOW_LINES`（默认 400）夹紧——所以一次最多几百行，且**没有任何续读入口**。

已有的相关信息服务端都算出来了（`totalLines` / `clamped` / `oversized` / `bytes`），但前端只用了 `clamped`（"区间已被截断"），`oversized` 从未使用。

约束：
- 选择器 `CodePickerDialog` 复用同一个 hook（`context = 6`），其行为不能被牵动。
- 滚动容器是 Radix `ScrollArea`（`ui/scroll-area.tsx`），当前不暴露 viewport，因此拿不到 `scroll` 事件与 `scrollTop/scrollHeight`。
- 越界防护集中在 `resolveCodePath()`（必须在 `CODE_DIR` 内 + 扩展名白名单），新增参数必须继续经过它。
- 单次响应体积必须有上限兜底，否则"给全文"就是把大文件塞进浏览器。

## Goals / Non-Goals

**Goals:**

- 同一份 UI 路径同时覆盖大文件与小文件（不做"小文件走整文件"的分支），把状态不一致的面收敛到一处。
- 段的边界严格对齐，使行号与 DOM id（`code-line-N`）天然唯一，去重不依赖额外逻辑。
- 任何"少给内容"都在界面上有可判读的原因；正常文件不出现这些提示。
- 既有三个出口（VS Code / 复制位置 / 加入引用）与选择器行为零变化。

**Non-Goals:**

- 不做一次性全文加载，也不做"整文件高亮"。
- 不在服务端维护"页游标"（无状态请求，可重复、可并发）。
- 不改 `useCodeWindow` 与 `CodePickerDialog`。
- 不做代码搜索、折叠、最小地图、diff 等编辑器能力。

## Decisions

**1. 服务端加 `mode: 'range'`，而不是让前端把 `context` 调大。**
`'highlight'`（默认，现状）= "围绕引用行给一段"；`'range'` = "就要这个行区间"（`start/end` 即窗口，不叠加 `context`）。选它而不是新开一个路由，是因为语言判定、行号夹紧、越界防护全部复用，路由只多一个参数；而调大 `context` 走不通——`pad` 被硬夹在 200，拿不到 300 行。

**2. 段大小 300 行，页边界按 `from = 300k + 1` 对齐。**
300 < 单次上限 400，留余量，避免"请求被夹紧"变成常态（夹紧时仍会照实报告，但不该总发生）。对齐后段与段互不重叠，因此 `code-line-N` 不会重复、行号天然连续。

**3. 前插（向上续段）必须锚定。**
先记录插入前的 `scrollHeight` 与 `scrollTop`，插入后把 `scrollTop` 加上 `ΔscrollHeight`。备选 `scrollIntoView(已看行)` 被否决：行未被显式记录，且会打断用户正在进行的滚动手势。

**4. `ScrollArea` 只加一个可选 `viewportRef`。**
转发到 Radix `Viewport`，纯增量；既有调用方零影响，滚动条样式与键盘行为保持。换成原生 `div` 被否决（要重做滚动条样式，且是一处行为回退）。

**5. `oversizedReason` 由服务端给。**
字节超限（`CODE_MAX_FILE_BYTES`）与行数超阈值（新增 `CODE_LARGE_FILE_LINES`，默认 3000）都在服务端判定，前端只显示文案。前端复制一份阈值必然漂移。

**6. `useCodePager` 与 `useCodeWindow` 并列存在。**
抽屉用 pager，选择器继续用 window。pager 内部以 `Map<页号, CodeWindow>` 存段，对外按页号排序输出 `segments`；`hasPrev/hasNext` 由"已加载段的最小/最前页号"与总页数推出。

## Risks / Trade-offs

- **插入段与自动续段的相互触发**：插入会改变 `scrollTop/scrollHeight`，若边界判定在插入过程中再次命中，可能连取多段。缓解：用一个"正在加载"标志 + `requestAnimationFrame` 节流，插入完成后按补偿后的位置重新判定。
- **超大文件（>2 MB / >3000 行）仍可读但读取成本随时间累积**：每次请求服务端都整文件读取并按行切片（O(行数) 线性）。可接受——成本被"用户滚到哪取到哪"限制住，且单请求体积有上限兜底。
- **服务端改动需重启 dev 服务**：旧进程的路由不认识 `mode=range`，会把参数当旧参数处理（拿到 400 行上限的窗口而非请求区间）。因此实现后必须重启，并在自检脚本里直接 import 模块做断言（不依赖进程）。
- **"跳到文件尾"在超长文件上只取最后一段**：不加载中间段，因此已加载段集合不是"1..N 全覆盖"。这符合分段语义（`code-line-N` 仍唯一），但要求跳转逻辑按页号计算而非按"已加载数量"累加。
