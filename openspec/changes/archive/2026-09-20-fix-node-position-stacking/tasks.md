## 1. 坐标自愈与不再回存占位

- [x] 1.1 新增纯函数模块 `src/graph/positions.ts`：`STACK_THRESHOLD = 3` 与 `ignoredPositionIds(nodes)`（同一坐标被 ≥3 个节点占用即判定为堆叠占位，返回这些节点 id）；验证：核验脚本断言真实 `data/graph.json` 上被判为占位的节点集合恰好等于那批共享 `(0,0)` 的节点（≥100 个），且保留坐标的节点都不是堆叠坐标；阈值边界用例通过（2 个共享不触发 / 3 个触发 / 无坐标不入判定）
- [x] 1.2 `cytoscapeSetup.sync()` 接入 `ignoredPositionIds`：被忽略的节点按「无坐标」加入（`position: undefined` + `enter`），`needsLayout` 也把它们算作需要排布；新增 `placedIds` 记账（sync 接受坐标、`runLayout` 完成、局部布局完成、拖拽 `free` 四处登记，并在节点被删除时出账）；`emitPositions()` 只回存「当前可见且已排布」的节点；验证：脚本断言回存结果只含可见且已排布的节点、隐藏节点不在其中；grep 确认 `emitPositions` 仍是唯一回存入口且带双重过滤

## 2. 新揭示的节点必须落位

- [x] 2.1 渲染器新增 `ensurePlaced()`（存在「可见但未登记」节点时 `runLayout(kind, { fit: false })` 并返回 true；`layoutInFlight` 防重入；首屏让位给 `layoutIfPending()`），`resetExpansion()` 末尾调用它并改为返回 boolean；`sync()` 的 `needsLayout` 分支在首屏标志未消费时直接返回（避免「只排根节点 → 再补排一次」）；`GraphCanvas.tsx` 的话题 effect 按返回值决定是否再 `fit()`；验证：`npx tsc -b` 通过，headless 脚本用真实布局参数断言「未排布兄弟节点进场时叠在原点 → 排布后各自落位」，以及真实数据 25 个默认可见节点排布后坐标两两不同

## 3. 悬停命中包含标签矩形

- [x] 3.1 `labels.ts` 新增 `hitTestNode(cy, point)`：**先判已显示的标签矩形**（跳过 `label-off`，多命中按「已叠加显示 → 优先级 → id 稳定序」），未命中再判节点方块（不含标签）；`cytoscapeSetup.mount()` 的悬停收敛为核心级 `mousemove` / `mouseout` 单一入口，经 `setHoveredId()`（未变化即返回）驱动 `handlers.onHoverNode` 与 `syncPinnedLabels()`，并在 `GraphCanvas` 容器 `pointerleave` 上兜底 `clearHover()`；验证：脚本断言「标签文字中心命中写它的节点（即使该点落在下方节点的方块内）」「节点方块中心命中自己」「被省略标签不参与命中」；grep 确认节点级 `mouseover` / `mouseout` 处理器已无残留

## 4. 验证与归档

- [x] 4.1 回归三件套：`npx tsc -b` 无输出、`npx eslint src scripts` 0 error（仅 2 条既有 warning）、`npm run build` 成功；grep 核对了 `emitPositions` / `placedIds` / `ensurePlaced` / `resetExpansion` / `hitTestNode` / `ignoredPositionIds` 的全部引用点，确认接线无遗漏（计划里点名的 `lsp-code-analysis` skill 在可用列表里不存在，改用 grep 逐调用点核对）
- [x] 4.2 一次性 node 脚本（跑完即删）**16 项断言全过**：① 自愈在真实数据上命中那批堆叠节点且保留坐标者都不是堆叠坐标；② 阈值边界（2 不触发 / 3 触发 / 无坐标不入判定）；③ 合成树里 4 个未排布兄弟进场叠在原点（复现根因）→ 跑真实布局参数后 8 个节点两两落位；④ 真实数据 25 个默认可见节点排布后坐标两两不同；⑤ 回存只含可见且已排布的节点、隐藏节点不写入；⑥ 标签文字中心命中写它的节点、节点方块中心命中自己、被省略标签不抢命中。脚本用 headless cytoscape + 真实 `buildLayoutOptions('breadthfirst')`（headless 无动画帧，故关掉动画跑同一套参数）
- [x] 4.3 登记 `docs/DIRECTORY.md`：§7 追加 2026-09-20 变更记录（现象、两条根因、四处修复、验证结论），§8.1 新增「坐标与排布」一行（坐标只来自真实排布或拖动；回存只覆盖可见且已排布的节点；≥3 个节点共享坐标判为占位并补排；补排优先于「切换话题不重排」）
- [x] 4.4 用 openspec-archive-change 归档：三份 delta 同步进主 spec（`graphify-canvas-layout` 新增「节点坐标必须是真实排布结果」并把取景要求限定到补排例外、`graphify-canvas-appearance` 追加「悬停命中包含已显示的标签矩形」、`graphify-topic-views` 给「切换话题不重排」加补排例外），change 移入 `openspec/changes/archive/`
