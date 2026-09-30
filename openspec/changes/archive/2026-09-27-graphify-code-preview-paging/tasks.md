## 1. 服务端：按行区间取样

- [x] 1.1 `server/lib/paths.mjs` 增 `CODE_LARGE_FILE_LINES`（默认 3000，`GRAPHIFY_CODE_LARGE_LINES` 可覆盖），与既有 `CODE_MAX_WINDOW_LINES` 注释口径一致 — 验证：`node -e "import('./server/lib/paths.mjs').then(m=>console.log(m.CODE_LARGE_FILE_LINES))"` 输出 3000
- [x] 1.2 `server/lib/codeIndex.mjs` 的 `readCodeWindow` 增 `mode: 'highlight' | 'range'`：range 模式下 `from`/`to` 即窗口（不叠加 `context`），仍受 `CODE_MAX_WINDOW_LINES` 夹紧；返回值补 `segmentStart/segmentEnd/hasPrev/hasNext/oversizedReason`，`highlightStart/End` 取引用区间与本段交集（无交集给 0）— 验证：range 取法请求 301–600 得到 300 行、`windowStart=301`、`hasPrev=true`；`highlight` 取法返回体除新增字段外与改动前逐字段一致
- [x] 1.3 `server/routes/code.mjs` 的 `GET /api/code/content` 支持 `mode=range&from=&to=`，旧参数 `start/end/context` 行为不变 — 验证：重启后 curl 两种参数各取一次，前者回到 `301–600` 段，后者与改动前同形
- [x] 1.4 `scripts/check-code-preview.mjs`：直接 import `readCodeWindow` 断言——range 行号与请求一致、尾段夹紧到 `totalLines`、`hasPrev/hasNext` 在首/中/尾段正确、单请求超上限被夹、行数超阈值时 `oversizedReason` 置位（临时调小 `GRAPHIFY_CODE_LARGE_LINES` 模拟）、越界路径（`../`、非白名单扩展名）被拒 — 验证：`npm run check:code` 全绿（30 项断言）

## 2. 前端数据层：分段 pager

- [x] 2.1 `src/api/client.ts` 增 `readCodeRange(file, from, to, start?, end?)`（与 `readCode` 并列，语义不同）；`src/lib/types.ts` 的 `CodeWindow` 补 `segmentStart/segmentEnd/hasPrev/hasNext/oversizedReason` — 验证：`npx tsc -b` 通过
- [x] 2.2 `src/hooks/useCodeLibrary.ts` 新增 `useCodePager(file, anchorStart, anchorEnd)`：按 300 行对齐页边界、`Map<页号, 段>` 存段、`loading/error/hasPrev/hasNext`、`loadPrev/loadNext/jumpToTop/jumpToAnchor/jumpToBottom/reset`；目标行已在已加载段内时跳转不重复请求 — 验证：`npx tsc -b` 通过；`useCodeWindow` 未被改动（选择器行为不变）
- [x] 2.3 `src/components/ui/scroll-area.tsx` 增可选 `viewportRef` 转发到 Radix `Viewport` — 验证：`npx tsc -b` + `npm run lint` 通过，既有 9 处 `ScrollArea` 调用方无需改动

## 3. 抽屉：多段渲染与定位

- [x] 3.1 `src/components/CodePreviewDrawer.tsx` 改用 pager 渲染多段 `CodeSnippet`（按 `windowStart` 给真实行号，段不重叠使 `code-line-N` 唯一），不含引用行的段传 `highlightStart/End = 0` — 验证：打开引用后可见引用行高亮，滚动到底部自动出现下一段
- [x] 3.2 边界自动续段：监听 viewport `scroll`（rAF 节流），距顶/底 <200px 且有相邻段时续段；**前插先测 `scrollHeight/scrollTop` 再插入，插入后补偿 `scrollTop`** — 验证：向上续段后原本在看的那一行仍停在同一屏幕位置（探针断言：偏移 23 → 23）
- [x] 3.3 头部显示「已加载 x–y / 共 N 行」，保留既有"高亮 x–y""区间已被截断"提示，并在 `oversizedReason` 非空时显示"大文件：按段加载，完整阅读建议在 VS Code 中打开"及原因 — 验证：正常文件不出现该提示；`GRAPHIFY_CODE_LARGE_LINES=10 GRAPHIFY_CODE_MAX_BYTES=100` 重启后出现
- [x] 3.4 工具栏加三个定位按钮（文件头 / 引用行 / 文件尾），打开或换成另一条引用时 `reset()` 并定位到引用行 — 验证：点"文件尾"后最后一行行号 = 总行数；点"文件头"后第 1 行在视口里

## 4. 自检、实测与文档

- [x] 4.1 npm scripts 挂 `check:code`，跑 `npm run check:code`、`npx tsc -b`、`npm run lint`、`npm run check:canvas`、`npm run check:styles` 全绿 — 验证：五条命令全通过（lint 仅剩 2 条既有警告）
- [x] 4.2 重启 dev 服务后用无头 Edge 探针实测：打开引用 → 滚到底自动续段 → 滚到顶自动续段（位置不跳动）→ 三个跳转按钮 → 大文件提示；探针文件用完即删 — 验证：正常配置 24 项、降阈值 25 项断言全通过，`scripts/_probe*` 已删除、无残留进程
- [x] 4.3 `README.md`「源码引用与行预览」一节改为"可按段连续读完整文件"，说明大文件策略与三个定位按钮 — 验证：README 与界面实际行为一致
