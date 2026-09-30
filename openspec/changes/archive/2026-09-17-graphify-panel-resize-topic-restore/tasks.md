## 1. 面板可拉伸基座

- [x] 1.1 新增 `src/hooks/usePanelWidth.ts`：维护面板宽度与收起状态，实现 Pointer Events 拖拽（`setPointerCapture`）、键盘 ←/→（Shift 加倍）、Home/End、双击复位；拖拽中只更新 state，`pointerup` 写一次 localStorage；键名 `graphify.panelWidth.v1`，读写包 `try/catch` 与数值校验，异常回退默认值。验证：`npm run build` 通过且该文件无类型错误
- [x] 1.2 在 hook 中实现宽度夹紧：接收容器宽度与「另一栏当前宽」，上限 = 容器宽 − 另一栏宽 − `CANVAS_MIN_WIDTH(320)` − 手柄宽；容器宽无效时不夹紧。折叠阈值 `COLLAPSE_SLACK = 48`，仅在 `pointerup` 时应用收起。验证：单测式手算三组数值（正常/两栏拉满/窗口极窄）均不超过上限
- [x] 1.3 新增 `src/components/ResizeHandle.tsx`：`role="separator"` + `aria-orientation="vertical"` + `tabIndex=0`，hover/拖拽态用 primary 主题色高亮，双击复位，视觉与 `glass-panel` 一致。验证：`npm run build` 与 `npx eslint src` 通过

## 2. 三列布局接入

- [x] 2.1 `src/App.tsx`：接入两个 `usePanelWidth`，在三列行容器上挂 `ResizeObserver` 观测容器宽并驱动夹紧；左栏右侧、右栏左侧各插入一条 `ResizeHandle`。验证：拖拽任一手柄，对应栏宽度变化且画布同步伸缩
- [x] 2.2 `src/components/MdLibraryPanel.tsx`：根容器宽度改为受控（受控宽度 + `collapsed` 时渲染约 36px 细条，含展开按钮与图标、`title` 提示），保留 `glass-panel` 外观。验证：收起后页面无横向溢出，点击细条按钮恢复为默认宽度
- [x] 2.3 `src/components/Inspector.tsx`：同样改为受控宽度与细条渲染，保留 `AnimatePresence`/`motion.aside` 进出场；右栏关闭（`open=false`）时不渲染手柄与占位。验证：关闭右栏后手柄与细条一并消失，重新打开时宽度与关闭前一致
- [x] 2.4 `src/components/GraphCanvas.tsx`：根容器补 `min-w-0` 与画布最小宽度保护，防止被两栏挤没。验证：把两栏都拉到最大，画布仍保有可用宽度且图表正常渲染

## 3. 抽屉遮挡修复

- [x] 3.1 `src/index.css`：新增 `[data-radix-scroll-area-viewport] > div { display: block !important; min-width: 0 !important; }`，覆盖 Radix 内层包裹盒的 `display:table` 裁切；在 `src/components/ui/scroll-area.tsx` 加注释说明该覆盖的来源与位置。验证：重建后抽屉目录与正文右缘文字不再被裁掉
- [x] 3.2 `src/components/MdReaderDrawer.tsx`：目录 `nav` 与正文条目补 `min-w-0` 使 `truncate` 生效；正文 `article` 加 `break-words`；`viewportClassName` 右侧留约 10px 内边距避免文字压滚动条。验证：含超长章节标题与超宽代码块/表格的文档，右缘文字完整、超宽块在自身区域内横滚
- [x] 3.3 回归三处滚动：左侧 notes 列表、右侧节点详情、抽屉目录与正文均能正常纵向滚动，无横向溢出。验证：逐一滚动确认滚动条出现且内容可达底部

## 4. 话题数据恢复

- [x] 4.1 重启 dev 服务进程（PID 1066，端口 5178）以加载含话题字段的 schema，重启后探测 `GET /api/graph` 可访问。验证：端口响应 200 —— 已完成：由用户执行 `kill 1066; setsid nohup node server/index.mjs`，终端回显 `[1]2022`（作业号 1 / 子进程 PID 2022），实际运行进程 PID 2024，端口 5178 正常响应（日志重定向到 `/dev/null` 仅为让 `setsid` 后台进程不持有终端 stdout，非日志落盘）
- [x] 4.2 运行 `node scripts/build-nion-graph.mjs` 重建草案，再 `node scripts/import-graph.mjs data/nion-draft.json --replace` 重新导入。验证：落盘文件 `meta.topics` 为 3、带话题归属节点为 59（`node -e` 统计）—— 已完成：落盘指纹 **话题注册表 3 · 节点话题归属 62 条 · 节点 59 · 引用 106 · 关系 0**（3 个节点双话题归属，故归属条数 62 > 节点数 59）
- [x] 4.3 经读接口 `GET /api/graph` 回读并统计：注册表 3、带归属节点 59。验证：接口返回值与磁盘一致，证明服务端不再剥离话题字段 —— 已完成：`curl -s http://127.0.0.1:5178/api/graph` 回读为 **话题注册表 3（`nion` / `engine` / `pending`）· 带话题节点 59 · 归属总条数 62 · 节点 59 · 引用 106**，与磁盘指纹逐项相等；同一命令下 `import-graph.mjs --replace` 由失败转为 `[校验] 落盘一致` + `[校验] 服务端（端口 5178）读回一致`，**退出码 0**
- [x] 4.4 前端确认顶栏出现话题下拉，切换话题后画布只显示该话题的可见集（成员及其祖先）。验证：三个话题各自可见集规模与生成器 `--topics` 统计一致 —— 已完成（无浏览器环境，改为用**前端真实模块复算**）：`node --experimental-strip-types` 直接加载 `src/lib/topics.ts` 的 `topicView` 作用于落盘 `data/graph.json`，逐话题输出 `nion 成员40/可见40/上下文0`、`engine 14/17/3`、`pending 8/8/0`，与 `build-nion-graph.mjs --topics` 的 `可见 40 / 17 / 8` 三项全等；`topics.length = 3` 为真，`TopBar.tsx:229` 分支成立；`meta.topics` 三条 `id/name/description` 均有值；`TopBar.tsx:114` 的 `count` 由同一个 `topicVisibleCount`（内部即 `topicView`）求得，故下拉显示 40/17/8 与复算一致。**浏览器内的实际点击交互仍需人工确认**

## 5. 导入链路加固

- [x] 5.1 `scripts/import-graph.mjs` 增加写后回读校验：① 重新读落盘文件比对称谓级指纹（`meta.topics` 条数、节点话题归属总条数、节点总数、引用总数）；② 若 dev 服务在运行，经读接口回读并比对同样指纹，接口返回话题为 0 而磁盘非 0 时报「服务端 schema 可能落后于源码，请重启 dev 服务」并非零退出；接口探测失败只跳过不阻塞。验证：正常导入退出码 0 —— 已实现（`fingerprint` / `verifyWritten` / `probeServer`）；写盘与回读共用 `server/lib/store.mjs` 的 `readGraph`/`writeGraph`，为避免与 `mergeDraft` 循环依赖，改用 `FINGERPRINT_FIELDS` 表而非从 store 导入常量
- [x] 5.2 补 `--verify`/`--no-verify` 与端口覆盖开关（`--port` 或环境变量），默认开启校验，`--no-verify` 与 `--dry-run` 下跳过。验证：`--no-verify` 与 `--dry-run` 均不触发回读校验 —— 已实现：`--port=` > `GRAPHIFY_PORT`/`PORT` > 5178；`--no-verify` 与 `--dry-run` 均跳过；探测超时 1500 ms，失败仅打印「跳过服务端探测」不阻塞
- [x] 5.3 实测失败路径：模拟磁盘话题丢失（把 `meta.topics` 置空后导入一份含话题的草案），确认脚本打印差异字段与两侧数值并以非零码退出。验证：退出码非 0 且提示可定位 —— **改由真实故障验证**（无需构造）：陈旧服务进程尚未重启，`node scripts/import-graph.mjs data/nion-draft.json --replace` 实测输出 `[校验] 落盘一致：话题注册表 3 · 节点话题归属 62 · 节点 59 · 引用 106 · 关系 0`，随后 `导入校验失败：运行中的 dev 服务（端口 5178）读回不完整 → 话题注册表(topics) 期望 3，实际 0；节点话题归属(nodeTopics) 期望 62，实际 0`，**退出码 1**；磁盘侧分支（写盘与预期不一致）按代码路径保留，未单独构造

## 6. 验证与文档

- [x] 6.1 运行 `npm run build`（`tsc -b && vite build`）与 `npx eslint src scripts`。验证：build 通过、eslint 0 error 且不新增 warning（既有 2 条 warning 可保留）—— 已完成：`✓ built in 5.95s`；eslint `✖ 2 problems (0 errors, 2 warnings)`，两条均为既有 warning（`Inspector.tsx:100` exhaustive-deps、`ui/button.tsx:53` only-export-components），本次改动未新增
- [x] 6.2 更新 `docs/DIRECTORY.md`：§7 追加变更记录（面板可拉伸、抽屉裁切修复、话题数据恢复与导入校验加固），§8.1 补一句话题数据链路与重建命令的注意项。验证：文档中的命令照抄执行可复现结果 —— 已完成：§7 新增一条变更记录；§8.1 新增「话题数据的落盘与校验」行并在「重建命令」行补上写后回读校验与 `--no-verify`/`--port=` 说明
