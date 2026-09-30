## Why

源码抽屉目前只能读到引用行附近的一小段，而且"看不全"这件事没有任何解释：

- 服务端 `readCodeWindow` 把 `start/end` 当作**要高亮的区间**，返回窗口 = 该区间 ± `context`，前端只请求 ±10 行（选择器 ±6），因此打开抽屉最多看到几十行。
- 高亮区间本身还被单次上限 `CODE_MAX_WINDOW_LINES`（默认 400 行）夹紧，**没有任何续读入口**——想看上下文只能去 VS Code。
- `readCodeWindow` 早已返回 `oversized` / `bytes` / `totalLines`，但前端从未使用 `oversized`；真正因为文件过大而少给内容时，界面上一句解释都没有（只显示 `clamped` 的"区间已被截断"）。

## What Changes

- **服务端**：`readCodeWindow` 增加 `mode: 'range'`——此时 `start/end` 直接就是窗口（1 起、含两端），不再叠加 `context`，仍受 `CODE_MAX_WINDOW_LINES` 夹紧；返回体补 `segmentStart / segmentEnd / hasPrev / hasNext / oversizedReason`，`highlightStart/End` 取"引用区间与本段的交集"（无交集给 0）。`paths.mjs` 新增行数阈值 `CODE_LARGE_FILE_LINES`（默认 3000，`GRAPHIFY_CODE_LARGE_LINES` 可覆盖）。`GET /api/code/content` 支持 `mode=range&from=&to=`，**旧参数 `start/end/context` 行为一字不改**。
- **前端数据层**：新增 `readCodeRange(file, from, to)`；`CodeWindow` 补上列字段；新增 `useCodePager()`（按 300 行对齐分段、边界续段、三段跳转、页边界去重）。`useCodeWindow` 与源码选择器 `CodePickerDialog` 行为保持不变。
- **滚动容器**：`ui/scroll-area.tsx` 增加**可选** `viewportRef`（转发到 Radix `Viewport`，纯增量、既有调用方零影响）。
- **抽屉**：多段渲染 + 滚到顶/底 200px 内自动续段（**前插先测量再插入并补偿 `scrollTop`**，避免视图跳走）+ 显示"行 x–y / 共 N 行"与超限原因 + 三个定位按钮（文件头 / 引用行 / 文件尾）。
- **既有出口不变**：在 VS Code 中打开、复制位置、加入当前节点引用，三者行为与位置保持原样。
- **自检与文档**：新增 `scripts/check-code-preview.mjs`（挂 `npm run check:code`）；README「源码引用与行预览」一节改写。

## Capabilities

### New Capabilities

- `graphify-code-preview`: 源码预览的行为契约——分段连续浏览（每段 ≤300 行、滚到边界自动续段、标注当前范围与总行数）、打开即定位并可跳转文件头/引用行/文件尾、任何"少给内容"必须显式说明原因、既有三个出口保持不变。

### Modified Capabilities

（无）

## Impact

- **服务端**：`server/lib/codeIndex.mjs`、`server/lib/paths.mjs`、`server/routes/code.mjs`——改动需**重启 dev 服务**才生效。
- **前端**：`src/api/client.ts`、`src/lib/types.ts`、`src/hooks/useCodeLibrary.ts`、`src/components/ui/scroll-area.tsx`、`src/components/CodePreviewDrawer.tsx`。
- **脚本与文档**：`scripts/check-code-preview.mjs`（新增）、npm scripts 增 `check:code`、`README.md`。
- 不引入新依赖；越界防护（`resolveCodePath`：必须在 `CODE_DIR` 内 + 扩展名白名单）继续覆盖新参数，不因新增 `from/to` 而放宽。
