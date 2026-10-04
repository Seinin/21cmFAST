## Context

- 两页共用一个视图枚举：`GraphView = 'canvas' | 'chain'`（`Graphify/src/components/TopBar.tsx:52`），顶栏分段控件按 `VIEWS.length > 1` 才渲染（`TopBar.tsx:353`）。
- 默认落在画布：`const [view, setView] = useState<GraphView>('canvas')`（`App.tsx:104`）；URL 同步只在 `view !== 'canvas'` 时写 `?view=`（`App.tsx:260-262`）；启动只恢复 `?g=`（标签页深链，`App.tsx:270`），**不读** `?view=`。
- 画布专属控件已经绑在视图上：`const canvasOnly = view === 'canvas'`（`TopBar.tsx:167`）；快捷键也按 `view !== 'canvas'` 走另一套（`App.tsx:635`）。
- 物理链页复用画布那套渲染与交互（`PhysicsChainView` → 画布渲染栈；生成物侧见 `Graphify/scripts/build-physics-chain.mjs` 里"与画布同形状的图，物理链页直接复用画布那套渲染与交互"的说明），所以画布这套实现不能删。
- 门禁里读画布侧的是数据与样式（`check:canvas` / `check:styles` / `check:tabs` / `check:store` / `check:graph` / `check:tags`），没有门禁扫 `App.tsx` / `TopBar.tsx`。

## Goals / Non-Goals

**Goals:**

- 对外只留物理链页：默认视图、界面入口、URL 三条路都到不了画布。
- 改动可逆且最小：画布要重新开放时只需还原两处。

**Non-Goals:**

- 不删画布相关组件、状态、后端接口与 `data/graph.json`。
- 不改物理链页自身口径（检索、状态条、证据标签页、生成物）。
- 不处理"是否彻底删除画布功能"这个更大的问题（要删得先给物理链页换一套渲染）。

## Decisions

**D1 关入口，不删代码。** 物理链页跑在画布的渲染与交互上，删画布代码等于重写物理链页；而"设置为失效、不对外开放"要的是不可达，不是不存在。代价：画布视图成了不可达代码。

**D2 控件不出现靠既有判据，不逐个屏蔽。** 只让 `view` 永远不等于 `'canvas'`，`canvasOnly`（`TopBar.tsx:167`）与 `App.tsx:635` 的两套判据已经把检索、撤销/重做、布局、话题、标签、导入/历史/另存与编辑类快捷键全挡住了。比逐个在 JSX 里加守卫少改、少分叉，也不会留下"控件还在、只是被藏了"的死角。

**D3 顶栏分段控件靠 `VIEWS.length > 1` 自动消失。** 把 `canvas` 从 `VIEWS`（`TopBar.tsx:54-62`）移除即可，不需要给 JSX 加 `visible` 之类的开关：控件本身早就按"多于一项"决定渲染与否。

**D4 保留 `GraphView` 联合类型与画布分支。** 收窄成 `'chain'` 单值会牵动 `App.tsx` 里一串 `view === 'chain'` 比较、`canvasOnly`、`StatusBar` 的 `layout` 取值与检索分发，收益只是编译期证明，代价是把画布那套判断改得面目全非、将来重开成本升高。

**D5 URL 不留后门，也不加禁用名单。** 初值本来就不读 `?view=`，所以 `?view=canvas` 天然无效；同步分支在 `view === 'chain'` 时写 `view=chain`，地址栏会被就地改正。比新增"受支持视图白名单"更少一层状态。

**D6 不 MODIFIED 既有长需求，用一条总则覆盖。** `graphify-physics-chain` 有三处以画布页为前提的场景（"画布页不受影响" `spec.md:54-57`、"检索后切回画布页" `:100-101`、"从物理链页切回画布页" `:124`），`graphify-topic-views` / `graphify-global-tags` 又要求顶栏出现话题/标签控件。画布页不对外可达后：跨页场景自动成立（不存在可切回去的那一页），控件不出现也不违背。复写这四段长需求要走 MODIFIED，必须整段照抄再改（容易在归档时丢细节），且改的只是措辞前提、不是行为契约；所以在 `graphify-site-surface` 里写一条"以画布视图为载体的旧需求在重新开放前不适用"的总则，把措辞清理留给归档时（见 tasks 2.4）。

## Risks / Trade-offs

- [画布视图成为不可达代码，长期可能腐烂] → 它仍在被使用（物理链页复用同一套渲染与交互），画布侧的数据与样式纪律仍由 `check:canvas` / `check:styles` / `check:tabs` / `check:store` / `check:graph` / `check:tags` 常跑；重开只需还原 D3 的一行与 D2 的初值。
- [有人书签过 `?view=canvas`] → 深链失效但不报错：落在物理链页并把地址栏同步为 `view=chain`（spec 里两个场景钉住）。
- [主 spec 里留着"物理链页（顶栏第二页）"这类前提措辞] → tasks 2.4 记一条归档时的措辞同步。
- [误伤物理链页] → 只动 `App.tsx` 的初值与 `TopBar.tsx` 的 `VIEWS`，不删任何控件；`npm run build` 加全套门禁即可证伪。

## Migration Plan

无数据迁移，无后端改动。回滚＝`view` 初值改回 `'canvas'`、把 `canvas` 项加回 `VIEWS`（两行），刷新即恢复两页。

## 实施记录

- 代码只动两处：`Graphify/src/components/TopBar.tsx`（`VIEWS` 去掉 `canvas` 项，连带 `GraphView` 上方与分段控件处的注释同步为"画布不对外、加回 `VIEWS` 即自动回来"）、`Graphify/src/App.tsx`（`view` 初值 `'chain'`，两段过期注释合成一段、URL 同步处的 `?view=matrix` 笔误改成 `?view=chain`）。`Graphify/README.md` 的「视图切换」一行改写为「站点页面」一行，「物理链（第三页）」与历史注记的页码口径一并同步。
- 核对入口唯一：全仓 `setView(` / `onViewChange` 只被顶栏分段控件（`TopBar.tsx:361`）调用，而该控件按 `VIEWS.length > 1` 决定渲染——没有第二条通往画布的路；`grep "get('view')"` 在 `src` 与 `server` 里无命中，启动只恢复 `?g=`。
- 门禁（本次实施后重跑，全绿）：`npm run build` 通过；`check:styles` 63 条样式规则 / 348 条声明、`check:canvas` 全部符合预期、`check:tabs` 34 项、`check:store` 39 项、`check:graph` 13 项、`check:tags` 27/27、`check:chain` 263 项（与变更前同值）、`check:copy` 无对话痕迹、`check:code` 48 项；`read_lints` 对两个改动文件无诊断。
- 待办：`tasks.md` 2.3 的浏览器手点（首屏落物理链、顶栏无页面切换与画布专属控件、`?view=canvas` 无效）、2.4 的归档时主 spec 措辞同步。落地后站点会停在物理链页，正好接着走 `graphify-leaf-module-docs` 的 7.2。
