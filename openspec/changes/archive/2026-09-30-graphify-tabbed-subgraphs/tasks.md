# Tasks

## 1. 数据重构

- [x] 1.1 编写 `Graphify/scripts/restructure-tabs.mjs`：归位按 id 前缀（`ic:*`→ic-frame；`atlas:fig2:eN:*`→E lane；`atlas:fig1:<lane>:*`→对应层带，幂等）；`图一`/`ic-frame`/E lanes 保持 `type: 'group'`（装饰容器）保留；解散 `图二`（E lanes 改挂入口 B）；五个层带 `group`→`section` 成为模块；入口 B、compute_initial_conditions 获得子节点（compute_initial_conditions ← ic-frame）；补 ①→②→③→④→⑤ 流向边；清理指向 `图二` 的边并打印清单
- [x] 1.2 脚本内置断言：无孤儿；根层恰为 `图一` 且框内恰五层；容器子数白名单（入口 B=3、ic-frame=23、E lanes=5/6/7、五层模块子数 1/3/4/8/2、ics=1）；全部通过才 PUT
- [x] 1.3 逐标签页布局：主图五层单列竖链 + 图一框合围；入口 B 三条 lane 横带竖排、步骤横排一行；ic-frame 网格；其余各层网格；运行脚本并人工核对边清理清单（期间发现旧标签页写回旧结构，脚本改为幂等后重跑修复）

## 2. 渲染器改造

- [x] 2.1 `cytoscapeSetup.ts`：构造时固定 focusId；可见性 = 焦点直系子节点 + 装饰框后代递归内联；装饰框渲染为 compound 父节点（自动合围）；模块按标题紧凑尺寸渲染；删除 focusPath/expandedIds/预算/原地展开逻辑
- [x] 2.2 只绘制两端点同标签页可见的边；模块保留 `· N` 计数徽标与光晕（含义为「可进入」）；装饰框无徽标、无进入提示
- [x] 2.3 双击模块触发 `onEnterSubgraph(nodeId)`（容器 dblclick + 命中测试）；双击装饰框/叶子不导航

## 3. 状态与 UI

- [x] 3.1 `graphStore.ts`：tabs 状态（openTab/closeTab/activateTab/renameTab，主图固定）；选中态按标签页存取（selectionStash）；URL `?g=` 同步与启动恢复（非法/叶子/装饰框 id 回退主图）
- [x] 3.2 `App.tsx` + `TabBar.tsx`：标签栏 UI（主图不可关、关闭激活左侧相邻）；每标签页一个 GraphCanvas（非激活 display:none，激活时 resize）；移除返回按钮/面包屑
- [x] 3.3 Inspector：仅模块显示「进入子图 ↗」按钮；新增「关系」列表（跨层关系带「跨层」标记，点击可选中该关系）
- [x] 3.4 添加节点/边落到激活标签页（选中装饰框则 parent=框，否则 parent=焦点）；「整理布局」按当前标签页可见内容执行（手动布局 = `graph/pack.ts` 确定性打包：装饰框自底向上合围、含模块单列竖排；normalize-layout.mjs 支持 scope 参数与同口径三档规则）

## 4. 验证与收尾

- [x] 4.1 `tsc -b` + eslint + `npm run check:canvas` + `npm run check:styles` + `npm run build` 全部通过
- [x] 4.2 浏览器实测：主图五层（无外框）、逐模块进入、装饰框内联渲染、标签切换/关闭、URL 还原、各标签页无重叠（其中「标签切换/关闭、装饰框内联、可见集互斥」已由 `npm run check:tabs` 在 Node 下断言；像素观感、悬停/放大动效与 URL 端到端还原由人工在浏览器确认）
- [x] 4.3 更新 Graphify/README.md 导航说明；tasks 全部打勾

## 5. 复核后追加：要素着色 + 产物文本化 + 去掉外层大框

- [x] 5.1 要素类型扩展：新增 `driver`（驱动/入口）、`variable`（参数/变量）、`artifact`（交付产物）三型；前端 `lib/types.ts`、后端 `server/lib/schema.mjs`、`server/schema/graph.schema.json` 三处枚举同步（`section` 保持「章节」语义不变）
- [x] 5.2 `restructure-tabs.mjs` 扩展：逐节点要素分类白名单；产物节点解散为「生产步骤 → 消费步骤」的边标签（11 个产物、信息不丢）；五层 `parent = null` 且去掉 `图一` 外框；断言更新（根层＝五层、无外框、无产物节点、S09 框 = 12 过程 + 输入参数、类型白名单、任何边不得以容器为端点）
- [x] 5.3 图例只列当前图谱出现的类型；工具条新增「常显边标签」开关（产物名只写在边标签上，默认按需显示）
- [x] 5.4 更新 README（要素配色表、产物写在箭头上、图纸映射表）与 spec/design
- [x] 5.5 运行 `node scripts/restructure-tabs.mjs` 写回数据（57 节点 / 58 关系；产物名落在 11 类边标签上；写前快照已存）
- [x] 5.6 箭头改为「中心连线、只露框外」：`curve-style: straight` + `outside-to-node` + `edge-distances: intersection`（去掉贝塞尔弧与 `control-point-step-size`）
- [x] 5.7 服务端已重启到新枚举（5178 新进程读到 57 节点 / 58 关系、五层根、产物边标签正常），临时 5180 实例已清理；「直线 + outside-to-node + edge-distances: intersection」已写进 `check:canvas` 断言
- [x] 5.8 浏览器核对：要素配色、产物边标签（含标签开关）、箭头形态、五条层带主图（其中「五条层带根层、装饰框内联、要素配色六类、产物边标签、容器不作端点」已由 `npm run check:tabs` 断言；配色观感、标签开关交互、箭头形态由人工在浏览器确认）
- [x] 5.17 修 `closeTab` 关页时选中态 stash 清理被撤销：`closeTab` 先 `delete stash[tabId]` 再调 `activateTab`，而此刻 `activeTabId` 仍是**刚关掉的 id**，`activateTab` 的 `{ ...selectionStash, [activeTabId]: selection }` 把该键原样写回——`delete` 成了死代码，后果是重开同一模块（tab id == focusId）会恢复**关页前**的陈旧选中态。改为「先切左邻页、再删键」；新增 `scripts/check-tabs.mjs`（`npm run check:tabs`，34 条断言：标签页状态机 + 可见集纯函数 + 数据口径），并用 `HEAD` 里的旧版验证过它会红
- [x] 5.16 悬浮放大与字号按反馈加强：模块放大倍数 1.18 → **1.32**、描边 3 → 3.6、填充 0.34 → 0.42、光晕 0.3/10 → 0.34/12；关系名字号 9 → **12**（改用 `labels.ts` 的 `EDGE_FONT_SIZE`，不再在样式表里硬编码），底片内边距 2 → 3；`check:canvas` 的放大倍数断言同步改 1.32 并新增「关系名字号 12」断言
- [x] 5.15 悬停读法强化 + 关系名固定朝向：被指着的模块与其出入关系放大跳出（模块抬到 z-index 60、关系 2.6px + 箭头放大 + z-index 34），其余模块**连文字一起虚化**（`node.dimmed` 加 `text-opacity: 0.22`）；关系标签改为 `text-rotation: none`（一律水平，不再 autorotate），并加不透明白色圆角底片（图纸里的产物标签样式）；`check:canvas` 新增 5 条断言（虚化含文字 / 跳出层级 / 关系放大 / 标签水平 / 虚化关系标签淡出），并把无头环境的 zoom 拨回 1 以免 LOD 干扰文字透明度断言
- [x] 5.14 修「改一个视图的布局，其它视图全被挤在一起」：根因是布局方式是全局状态，切布局时每个已挂载的标签页都会 `runLayout`（各视图节点集合互不相交、坐标空间却共用，于是别的视图被排成一团，再随自动保存写回）。改为**布局方式按标签页独立**（`layoutByTab`），并在 GraphCanvas 里加「隐藏标签页只记录、绝不重排」的保护；顺带用脚本恢复被打散的坐标与 `InputParameters` 归位
- [x] 5.13 修掉归位里的一个错误假设：`ic:art-inputs`（输入｜InputParameters（P01））是 **S09 图的输入参数**（它的两条边只指向 S09 的过程①/②），此前被我当成「红移循环的输入」留在 ④ 带里，两条箭头因此变成跨标签页、哪里都看不见。现改为全部 `ic:*` 归入 S09 框（13 = 12 过程 + 1 输入参数），④ 带回到 7 个纯函数步骤；断言改为「ic:* 必须全部在 S09 框内、InputParameters 的输出边必须落在同框过程上」
- [x] 5.11 容器不参与关系：数据侧撤掉所有涉及大框的边（含早期补的 4 条层带「主链」边，脚本断言封死）；交互侧封住全部入口——选中容器不出连线手柄、拖线吸附跳过容器、连线模式点容器给提示并退出、右键菜单与属性页对容器不提供「拉出关系」、建边对话框提交时二次校验
- [x] 5.12 悬停反馈分工：容器**去掉**悬停特效（不再变色、不再触发邻居高亮，渲染器 `setHoveredId` 直接跳过容器）；模块放大倍数 1.14 → 1.18 并加强描边/光晕，关系悬浮加粗 + 箭头变大 + 显示关系名；`check:canvas` 增加「模块有悬停 / 容器无悬停 / 容器不写悬停 id」三条断言
- [x] 5.9 语义订正：**层 = 容器（`group`），模块 = 类 / 函数**——五条层带回退为装饰容器并提升为根节点、带内直接放模块；只有带子结构的模块（`compute_initial_conditions`、`入口 B`）可进入子图；移除多余的 `layer` 类型；断言更新（层必须是 `group` 且非空、ics/入口 B 必须不是 `group`）
- [x] 5.10 层带排布规则：容器内部「≤7 个单行横排、更多折成固定 4 列网格」——`pack.ts`／`normalize-layout.mjs`／重构脚本三处同口径（不能用 pickColumns：它会按「字最大」把 8 个模块挑成 2 列 × 4 行的竖条，带子就立起来了）
