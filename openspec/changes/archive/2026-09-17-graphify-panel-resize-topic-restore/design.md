## Context

动机见 `proposal.md` 的 Why 与 `specs/` 下的能力契约，此处只记录塑造方案的现状与约束：

- 三列布局在 `src/App.tsx:265` 的 `flex min-h-0 flex-1 gap-2` 行内；左栏 `MdLibraryPanel.tsx:179` 与右栏 `Inspector.tsx:121-125` 各自把 `w-[312px]` / `w-[326px] shrink-0 overflow-hidden` 写死在自身根容器里，画布列 `GraphCanvas.tsx:292` 靠 `flex-1` 自适应。右栏受 `open` 条件控制，可随时不存在。
- 视图状态已有既定归属：`src/state/graphStore.ts` 持有 `activeTopicId` 等视图状态且**带撤销栈**，故面板宽度不能放进去。项目已有用 localStorage 的先例。
- 抽屉遮裁的根因已在依赖源码确认：`@radix-ui/react-scroll-area@1.2.18` 的 `dist/index.mjs:125` 在 Viewport 内再包一层 `<div style={{ minWidth: '100%', display: 'table' }}>`，`display:table` 按内容 nowrap 宽度撑开该盒子；超出部分被 Root 的 `overflow-hidden` 直接裁掉且不产生横向滚动。Radix 未暴露关闭该包裹层的 prop。
- 话题字段丢失的时间线：`server/lib/schema.mjs` 加入 topics 于 13:51:04，dev 服务进程 PID 1066 启动于 10:26:35（早于改动），`data/graph.json` 最后写入于 14:22:19。进程内是旧 zod schema，写入时按 zod 默认 strip 行为丢弃了 `meta.topics` 与 `node.topics`；CLI `scripts/import-graph.mjs` 直连 `readGraph`/`writeGraph`（不经 HTTP），每次运行都加载最新源码，因此它不是丢字段的路径。

## Goals / Non-Goals

**Goals:**

- 面板宽度可调、可记忆、可收起恢复，且不侵占画布最小宽度。
- 抽屉右缘文字完整可读，超宽内容自滚动。
- 磁盘图谱恢复话题数据，前端话题下拉重新可用。
- 让「字段被校验层静默剥离」这类问题在导入时立刻暴露，包括**服务端 schema 落后于源码**这一真实成因。

**Non-Goals:**

- 不引入第三方面板分割库（如 react-resizable-panels / allotment）。
- 不把面板宽度持久化到图谱数据文件，也不进入撤销栈。
- 不追溯修改 `data/history/` 里已缺话题的历史快照。
- 不改动话题可见集算法本身（成员 ∪ 祖先闭包）与其在画布上的呈现方式。

## Decisions

### 1. 面板宽度用自写 hook + 原生 Pointer Events

新增 `src/hooks/usePanelWidth.ts`，内部用 `pointerdown/pointermove/pointerup` 配合 `setPointerCapture`，键盘 ←/→（Shift 加倍）、Home/End、双击复位。只存「宽度 + 是否收起」两个值。

- 备选 A：引入 `react-resizable-panels`——功能过剩（嵌套分组、布局序列化），且要为它重排现有三列结构，风险大于收益。
- 备选 B：只用 CSS `resize: horizontal`——手柄不可定制、无键盘可达性、无法与画布最小宽度联动。
- 拖拽中只更新 React state，`pointerup` 时才写一次 localStorage，避免每帧写盘。

### 2. 宽度状态放组件局部状态 + localStorage，不进 zustand

`graphStore` 的所有变更都进撤销栈，面板宽度是纯视图偏好，放进去会让「撤销」出现无意义的宽度回退步骤。

- localStorage 键独立命名空间（`graphify.panelWidth.v1`），读写包 `try/catch` 并做数值与范围校验，任何异常都回退默认值。
- 写入时机：拖拽结束、键盘调整后、收起/恢复切换后。

### 3. 收起判定放在拖拽结束时，而非拖拽过程中

若在拖拽中就把宽度压到收起阈值以下，手柄会随面板一起变成细条，正在进行的拖拽立即失效。因此：拖拽过程中宽度夹紧在 `[MIN_WIDTH, maxWidth]`；仅当指针横向位移越过 `MIN_WIDTH - COLLAPSE_SLACK`（slack 取 48px）才记为「拟收起」，`pointerup` 时应用收起。键盘在收起状态下按 ←/→ 则直接恢复默认宽度。

### 4. 宽度上限用 ResizeObserver 夹紧

在 `App.tsx` 的三列行容器上挂 `ResizeObserver` 观测容器宽度，上限 = `容器宽 − 另一栏当前宽 − CANVAS_MIN_WIDTH(320px) − 手柄宽`。两栏同时拉满、或窗口缩小时都会重新夹紧，保证画布保底宽度。

- 备选：把上限写死为固定像素——窗口变化后会失效。

### 5. 抽屉裁切用全局 CSS 覆盖 Radix 内层包裹盒

在 `src/index.css` 增加：

```css
[data-radix-scroll-area-viewport] > div {
  display: block !important;
  min-width: 0 !important;
}
```

内层是行内样式，必须 `!important` 才能覆盖。放全局而非单点，是一并修好左右两栏与抽屉三处 ScrollArea 的同类问题；表格与代码块已各自包在可横滚容器里，改成 block 不影响它们的横向滚动。

- 备选 A：换掉 Radix ScrollArea 用原生滚动——改动面扩散到三处调用点，收益不成比例。
- 备选 B：只在抽屉里用 Tailwind arbitrary variant 加子选择器——覆盖不了其它 ScrollArea，且内联样式仍需 `!important`。

配套：目录 `nav` 与正文条目补 `min-w-0` 让 `truncate` 真正生效；正文 `article` 加 `break-words`；viewport 右侧留约 10px 内边距，避免文字压在纵向滚动条下。

### 6. 导入校验 = 落盘回读 + 运行中服务接口回读

`scripts/import-graph.mjs` 写盘后做两段校验：

1. **落盘回读**：重新 `readGraph()` 读文件，比对称谓级指纹——`meta.topics` 条数、`node.topics` 归属总条数、节点总数、引用总数。不一致即报差异并非零退出。
2. **服务端回读**（关键）：若 dev 服务在运行，则请求其读接口（默认 `http://127.0.0.1:5178/api/graph`，可用 `--port`/环境变量覆盖）并比对同样指纹。若磁盘有话题而接口返回 0，即可判定「服务端校验层落后于源码」，打印重启提示并非零退出。探测失败（服务未启动、超时）只跳过，不阻塞导入。

只做第 1 段是不够的——正因为 CLI 直连文件、绕开了服务端，才无法发现服务端 schema 陈旧这一真实成因。

开关：默认开启；`--no-verify` 关闭；`--dry-run` 下不写盘故跳过。

### 7. 话题恢复的执行顺序

先重启 dev 服务（加载含话题字段的 schema），再重建并导入草案，最后经读接口确认返回话题数。顺序若颠倒，重启前经接口的核对会因旧 schema 而误报。

## Risks / Trade-offs

- **[重启 dev 服务会中断用户当前会话]** → 先完成全部代码改动再重启；重启后立即探测端口与读接口，确认恢复可用并告知用户如何重新接管进程。
- **[全局覆盖 `viewport > div` 影响三处 ScrollArea]** → 覆盖仅把包裹盒从 `display:table` 改回 `display:block` 并解除 `min-width:100%`，不改变滚动方向；完成时逐一回归左侧 notes 列表、右侧详情、抽屉三处滚动。
- **[面板宽度上限依赖 ResizeObserver，首帧容器宽为 0]** → 容器宽为 0 或测量失败时退回默认宽度，不夹紧；观测到有效宽度后再夹紧。
- **[localStorage 在隐私模式或旧浏览器不可用]** → 读写全部包 `try/catch`，失败即降级为「本次会话有效」，不抛异常。
- **[拖到极窄时收起可能让用户困惑]** → 细条上保留展开按钮与面板图标，并有 `title` 提示；双击手柄同样可复位。
- **[新增校验可能让既有导入流程突然失败]** → 提供 `--no-verify` 逃生开关，且校验失败时同时打印差异数值，便于定位是落盘丢失还是服务端陈旧。

## Migration Plan

1. 前端改动（面板、抽屉）与脚本加固先落地，跑 `npm run build` 与 `npx eslint src scripts`。
2. 重启 dev 服务以加载新 schema（PID 1066，端口 5178）。
3. `node scripts/build-nion-graph.mjs` 重建草案 → `node scripts/import-graph.mjs data/nion-draft.json --replace` 重新导入（带新增回读校验）。
4. 经读接口确认注册表为 3、带归属节点为 59；前端刷新后顶栏出现话题下拉。

回滚：前端改动均为纯视图层，还原文件即可；数据侧的回滚点是用 `data/history/` 快照。历史快照本身也不含话题字段，故本次不依赖它做话题回滚。
