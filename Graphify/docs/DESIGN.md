# 设计说明

记录 Graphify 的数据模型、可逆性机制、交互约定与扩展点，便于后续修改时不走偏。

## 数据模型

唯一持久化文件是 `data/graph.json`：

```jsonc
{
  "meta": { "version": 1, "name": "未命名图谱", "description": "", "updatedAt": "ISO-8601" },
  "nodes": [
    {
      "id": "n_8f3a1c2b7d",
      "label": "FDM 冷却通道",
      "type": "concept",
      "summary": "一句话说明",
      "tags": ["fdm"],
      "refs": [{ "docId": "FDM_mcrit_report.md", "anchor": "56-a", "label": "§5.6 A′" }],
      "position": { "x": 120, "y": 80 },
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "edges": [
    {
      "id": "e_1b2c3d4e5f",
      "source": "n_8f3a1c2b7d",
      "target": "n_44aa02bb19",
      "label": "依赖",
      "type": "depends_on",
      "directed": true,
      "note": "",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ]
}
```

要点：

- 节点与边都是**扁平结构**，没有嵌套 `properties`，便于人工查看与让 LLM 直接生成。
- `position` 为 `null` 表示还没有布局结果，前端会在首次出现时为它跑一次力导向布局并把坐标回写。
- 引用指向的是 **notes 库内的相对路径 + 标题锚点**（`docId` 相对 `docs/notes/`），不保存绝对路径，因此整个 `Graphify/` 目录可以整体搬移。

### 锚点规则

标题锚点由标题文本推导，服务端（`server/lib/mdIndex.mjs`）与前端（`src/lib/slug.ts`）**必须保持一致**：

```
1. 去掉首尾空白并转小写
2. 移除所有非「字母 / 数字 / 空白 / - / _」的字符（中日韩文字属于字母，会被保留）
3. 把连续空白替换为单个连字符
4. 合并重复连字符、去掉首尾连字符
5. 同一文档内出现重复标题时，追加 -1、-2 …
```

例：`## 5.6 A′ 乘性路由` → `56-a-乘性路由`。

修改任何一侧都必须同步另一侧，否则点击引用会定位不到标题。

## 服务端

单个 Node 进程：Express 提供 `/api/*`，开发期加载 Vite 中间件（热更新），生产期托管 `dist/` 静态产物。这样「一条 `npm run dev` 就能跑起来」，不必维护两套启动流程。

### 存储层（`server/lib/store.mjs`）

- **原子写**：先写 `graph.json.tmp-xxxx`，再 `rename` 覆盖，避免进程中断留下半截文件。
- **串行写队列**：所有写入挂在同一条 Promise 链上，单进程内不会出现并发写导致的丢更新。
- **写前快照**：每次写入前把旧内容存进 `data/history/graph-<时间戳>.json`，并记录操作来源（如 `node:delete`），超出上限（默认 50）从最旧开始清理。
- **读取容错**：文件缺失时自动创建空图；解析或校验失败时打印原因并回退为空图，保证服务不整体挂掉。

因此**回滚本身也会先产生一份快照**，回滚之后还能再滚回来。

### notes 索引（`server/lib/mdIndex.mjs`）

- 递归扫描 `MD_DIR`（即仓库根的 `docs/notes/`，见 `server/lib/paths.mjs`），只收 `.md` / `.markdown`，跳过点开头的文件与目录；文档所在子目录记入 `folder`，供前端分组展示。
- 用「文件数量 + 大小 + mtime」组成签名做缓存键，只有内容变化才重新解析；`readDoc` 每次直读磁盘，因此外部编辑器改完文档，刷新即是最新内容。
- 解析时跳过围栏代码块，抽取标题树与首个摘要段落。
- **路径穿越防护**：`docId` 经 `path.resolve` 后必须仍位于 `MD_DIR` 之内，否则返回 400；越界请求（如 `../../../etc/passwd`）会被拒绝。

### 校验与合并（`server/lib/schema.mjs`、`mergeDraft.mjs`）

- 用 zod 定义唯一可信的结构，节点/边/引用/导入草案各有 schema，前后端共享同一套字段语义。
- 导入时按 `id` → `label` 的顺序解析节点，按 `id` → `(source, target, label)` 的顺序解析边，实现幂等合并；解析失败的条目不会写入，而是逐条回报。

## 前端

### 状态分层

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 图谱数据与选择 | `src/state/graphStore.ts`（zustand） | 节点/边、选中项、脏标记、撤销栈 |
| 撤销栈算法 | `src/state/undo.ts` | 纯函数式的快照栈推进与回退 |
| 画布渲染 | `src/graph/cytoscapeSetup.ts` | Cytoscape 实例、增量同步、事件分发 |
| 服务端同步 | `src/hooks/useGraphSync.ts` | 手动另存（先批量写回坐标、再归档保留副本）、结构性写操作 |

Cytoscape 实例保存在 `ref` 中，通过命令式接口增量更新元素（不整体重建），React 只承载数据与 UI 状态，避免大图重渲染。

### 可逆性

三级保障，互为补充：

1. **会话内撤销栈**（100 步）：每次变更前把整图深拷贝压栈。整图快照比「逐条记录逆操作」实现简单、任何复杂操作都可逆，代价是内存随节点数线性增长——百级节点下开销可忽略。
2. **服务端快照**（50 份）：每次写入前落盘一份，刷新页面甚至换浏览器后依然能回滚。
3. **保留副本**（手动另存，`Ctrl/Cmd + S`）：不参与轮转、不设上限，由用户在历史面板里单独删除。

注意一个细节：**撤销/重做只改本机、不写盘**（整图覆盖已随自动保存一起取消），所以撤销不会产生快照、也不改变工作文件；要让撤销后的状态留存，走手动保存另存一份保留副本。保存动作本身同样分两步：先把本机坐标批量写回工作文件（一份快照），再归档副本（一份保留副本）。

删除类操作除了进撤销栈，还会在 Toast 里附带「撤销」按钮，让误删可以在一秒内恢复。

### 坐标与并发

拖拽节点属于高频变更，但**不自动落盘**（自动保存已取消）：

- 拖拽开始时只记录一个撤销点（`pushHistoryPoint`）；
- 拖拽过程中直接更新 Cytoscape 内部坐标，松手时把结果写回 store；
- 只在本机改过的坐标记进 `pendingPositionIds`，顶栏显示「有未保存改动」；自动重排（整理布局、打开时按当前布局重排）走同一条路；
- 手动保存时**一次请求**把这批坐标批量写回工作文件（`POST /api/graph/positions`：一次写盘 = 一份快照），不逐节点写——否则几十次拖拽就能把 50 份历史刷满坐标噪声。

为了避免「服务端响应覆盖刚拖好的位置」，`applyServerGraph` 会在本地存在未保存改动时，把本地坐标合并进服务端返回结果并保持脏标记——自动保存取消后 `dirty` 会长期为真，这段合并因此更要紧。

### 物理视角图谱与参数矩阵（已归档）

> 这一节与下一节「物理图谱（第三页）」记录的是**已归档**的两页（参数矩阵 `?view=matrix`、物理图谱
> `?view=physics`）。两页连同生成物 `src/generated/physics-graph.json` / `physics-map.json`、命令
> `build:physics` / `build:physics-map`、自检 `check:physics` / `check:physics-map` 与那份参数中文名表
> 都已随对应变更归档，下面只作历史记录；现在的第三页是**物理链**（`?view=chain`，见下文
> 「物理链（第三页）与分层语言纪律」）。

画布那份 `data/graph.json` 是**工程视角**（调度链、文件、函数、产物）。物理视角是**另一份图谱**：
`src/generated/physics-graph.json`，由 `npm run build:physics` 生成，**入库跟踪**（不能放 `data/`——那里被
gitignore，构建期 import 会缺文件），形状沿用同一套 schema，因此能直接过 `parseGraph`、也能直接 import。

生成规则（`scripts/build-physics-graph.mjs` + `scripts/lib/atlasDocs.mjs` + `scripts/lib/paramScan.mjs`）：

- **过程**取自 `docs/notes/atlas/` 的 L1 阶段（该层明确声明"不出现函数名、文件路径、变量名"），
  名字与「作用与意义」都按 markdown 解析，**不硬编码**；
- **参数**取自 `wrapper/inputs.py` 的 `AstroParams` / `AstroOptions`（字段归属与 docstring 说明也按源码解析）；
- **归属**按 L3 计算单元「承担者」给出的函数体扫描（C 按花括号配对、Python 按缩进，注释与字符串先屏蔽），
  不沿用旧图谱"节点 refs ±窗口"的口径——那套窗口会把整个函数吸进来，正是那四个参数曾被误挂到"输出层"的原因；
  承担者只写"各函数"时退化为**整文件归属**，两种情况都在生成日志里列明；
- 戳记用**内容哈希**（`generated-<hash>`）：文档与源码不变时产物逐字不变，`check:physics` 据此断言幂等。

页面是应用内的第二个视图（`?view=matrix`），与画布共用顶栏与状态条；矩阵的读法沿用仓库既有约定
（有色格 = 有关系、空格 = 无关）。**点格子看的是过程的物理描述（文档原文），不是源码**——这是刻意的：
物理视角要的是"这是哪一步、为什么需要这些参数"，代码细节在画布视图里看。

矩阵的两处排版约束值得记下来（都是踩过才知道的）：

- **只有一个滚动口**：纵向与横向都由矩阵视图那一层容器（`flex-1` + `overflow-auto`）负责，列头 `sticky top-0`
  与参数列 `sticky left-0` 才吸在同一个滚动口上。曾把横向滚动拆到内层 `overflow-x-auto` 的 div 上，
  结果按 CSS 规范另一个轴会被算成 `auto`、内层也成了"纵向滚动口"（虽然它并不滚），`top` 的 sticky 挂到它身上、
  列头随页面一起滚走。
- **列宽一钉一放**：表格用 `colgroup` + `table-layout: fixed`。**参数列钉 176px**（否则最长的几个参数名
  `INTEGRATION_METHOD_ATOMIC`、`PHOTONCONS_CALIBRATION_END` 等 23–25 字符会把整列撑到 240px；装不下的部分
  行内截断，完整内容在 tooltip 里）；**其余过程列不写宽度**，由 `table-layout: fixed` 把剩余空间均分 ⇒ 窗口越宽
  列越宽、右侧不留白。表格 `w-full min-w-[680px]`，680 = 176 + 9×56 是"每列保底 56px"的推导值，
  窄于它时由滚动口横向滚动。
- **滚动口在视图根、卡片不参与滚动**：`overflow-auto` 挂在矩阵视图那一层容器上，卡片是
  `w-fit min-w-full`（宽度不小于容器、高度裹住表格）。卡片一旦带上 `overflow-*` 就会抢走滚动口、
  让 sticky 挂到它身上（列头随页面滚走）；一旦 `flex-1` 撑满高度，内容不足时下面会留一条空白卡面。
- **窄屏让位**：说明条 `flex-wrap`，读法段 `basis-[220px]`，图例换行，计数 `hidden md:inline`
  （< 768px 隐藏）；列宽保底由 `min-w-[680px]` 兜住，不再自造断点。

参数行的中文物理名放在界面层（`src/lib/paramAliases.json`，前端与 `check:physics` 共用），**不写进生成物**：
那份产物的契约是"完全由文档与源码推导、内容哈希戳记、可幂等重跑"，而中文名是**命名**不是解释。
为免变成无据的手写，每条都强制带 `source`（源码行号或文档锚点），自检会断言齐全与长度上限。

### 物理链（第三页）与分层语言纪律

与「画布」（工程视角）并列的第三页（`?view=chain`），回答的是**从观测量往下追到参数**：过程框 = 物理主链阶段，
边写的是产物（谁产出、谁消费、哪个开关门控哪条边），检查器**先讲物理**、再给代码与论文的**证据**。

分层与既有链路一致：真源 `docs/notes/physics-chain/chain.json`（配 `src/py21cmfast` 源码回读）→
生成物 `src/generated/physics-chain.json`（内容哈希戳记、幂等、可重跑）→ 纯函数 `src/lib/physicsChain.ts`
→ 视图 `src/components/PhysicsChainView.tsx`。视图不解析真源、不读源码；字段只取原文，缺失留空，不编造；
页面上不做任何评估——那是使用者的事。

**每一层只讲一种语言**——这是这一页的骨架，也是自检拦着的那条线：

| 层 | 只讲什么 | 内容 | 工程 / 代码痕迹 |
| --- | --- | --- | --- |
| 一级（物理链） | 物理过程与它们之间的产物 | 物理主链阶段（`PHYSICS_CHAIN_STAGES`）的过程框，边写产物 | **零**：一级节点的名字与摘要不得出现文件行号、`Python`、`后端`（`check:chain` 断言） |
| 二级（子过程） | 每个过程里的计算步骤 | 双击过程框进入子图，看该阶段下的量、步骤与开关 | 只有承担者级名称，不含行号 |
| 三级（证据） | 怎么落到代码与论文 | 检查器里的源码落点与文献引用点 | **默认收起**：`看实现 (N)` / `看文献 (M)` 展开前不生成任何路径与行号 DOM |
| 旁路（旁路与实现细节） | 旁路出口与实现细节 | 旁路阶段（`BYPASS_STAGES`）下辖的诊断出口 + 工程节点（`topic:impl`） | 画布区底部**折叠条**默认收起，标题写明「不属于物理链」，一键展开 |

**判据不新造、只放一处**：`Graphify/scripts/lib/physicsStages.mjs` 导出 `PHYSICS_CHAIN_STAGES` /
`BYPASS_STAGES` / `stageLayerOf` / `stageOfHint` / `isBypassHint` / `LAYER_LABELS`，注释写明出处
（`docs/notes/atlas/L1-stages.md` 的历史口径「S07 起才是物理」+ 真源里**实际出现**的阶段）。生成器
`scripts/build-physics-chain.mjs` 与自检 `scripts/check-physics-chain.mjs` import 同一份 ⇒「一级有哪些过程」
只有一个答案：真源冒出未登记的阶段、或名单里写了真源没有的阶段（如 S09/S10/S11 尚且没有量），自检两边都报。

**判据放数据、视图只读标记**：生成物给每个过程框写 `chain: 'main' | 'bypass'`、给旁路阶段下辖的量与框挂
`topic:bypass`，视图不写死阶段号，只按标记分组渲染 ⇒ 要调一级范围，改那份名单 + 重跑生成器，视图不动。

### 交互约定

- 悬停节点 → 高亮邻居并弱化其余元素；选中 → 额外的脉冲光晕（每 1.6s 一个周期，只对单个节点运行 rAF 循环）。
- 连线有两条路径：选中节点后拖拽节点右侧的蓝色手柄到目标节点；或按 `C` 进入连线模式后点目标节点。两者都会弹出关系对话框，先确认再写入。
- 加引用有三条路径：在左侧面板点文档条目、点章节右侧的 `+`、把文档拖到节点上（拖拽经过节点时该节点会高亮吸附）。
- 破坏性操作（删除节点/取消关系）一律二次确认，确认后仍可撤销。
- 所有动效遵循 `prefers-reduced-motion`，命中该偏好时退化为淡入淡出。

## 与 docling-graph 的字段差异

调研仓库内 `../docling-graph/` 后发现三处**同名异义**，互导时需要留意：

| 字段 | docling-graph 语义 | Graphify 语义 |
| --- | --- | --- |
| 节点 `label` | 模板类名（如 `Invoice`） | 节点显示名称 |
| 节点 `type` | 恒为 `"entity"` | 语义分类（concept / doc / …） |
| 边 `label` | 关系类型（如 `issued_by`） | 连边显示文字 |

Graphify 的 `label` + `type` 分工更清晰，因此**保留自己的语义**，不为了对齐而牺牲可读性；只保证结构上兼容：docling-graph 导出的 `nodes` / `edges` 可以直接被 `/api/graph/import` 接收。两侧都用 Cytoscape.js 做可视化，前端经验可互相借鉴。

## 扩展点

- **新增节点类型**：在 `server/lib/schema.mjs` 与 `src/lib/types.ts` 的枚举/标签/配色各加一项即可，图例与下拉会自动出现。
- **多图谱**：当前为单图谱。若要支持多份，把 `data/graph.json` 换成 `data/graphs/<id>.json`，并在 `store.mjs` 中按 id 选择文件即可，前端只需增加图谱切换入口。
- **实时协作**：`store.mjs` 已把写入收敛成串行队列，替换为基于版本号的乐观并发控制（写入带 `meta.version`，不匹配则拒绝）即可支持多客户端。
- **接入 docling-graph 自动抽取**：让它的 pipeline 直接产出 Graphify 草案格式，或在其输出后加一层字段映射，通过 `/api/graph/import` 写入。
