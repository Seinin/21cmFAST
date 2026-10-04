## Why

画布上「选中」与「点亮」是两套状态，而点空白只清掉了第一套。渲染器早有 `cy.on('tap')` + `event.target === cy` → `onClearSelection`（两页共用），所以检查器会空；但**点亮还亮着**：物理链页点空白后左栏那一行仍高亮、画布上红点仍亮（`activeParam` / `activeProcess` / `activeTagIds` 都还在），画布页点空白后标签勾选与红点也照旧。表现就是「点了空白，检查器空了，可画布上还亮着」——看着像点空白没生效，也让人以为"选中"还没取消。

## What Changes

- **点画布空白 = 回到未选中态**：单击空白处（不落在节点、连线、标签与浮层控件上）MUST 清空这一页的选中，并同时熄灭**这一页自己点亮的标记**——画布页的标签勾选与红点、物理链页的参数 / 过程词条点亮与红点。两页口径一致，不许只清一半。
- **清空落点写在数据源**：`GraphSource` 增 `clearHighlight()`，画布页（共享 store）实现为「清选中 + 清标签勾选」，物理链页（provider）实现为「清选中 + 熄参数 / 过程 / 标签点亮」；画布模板的空白回调改调它，两页各清各的。
- **不让这个手势顺手改别的东西**：子图标签页（看到哪儿）MUST NOT 被关；右键点空白仍只弹菜单、MUST NOT 取消选中；连线模式下点空白仍沿用既有的「取消这次连线」。清空 MUST 幂等（双击空白连发两次 tap 与一次结果相同），MUST NOT 改图谱数据、节点坐标与布局。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `graphify-canvas-appearance`：新增「点画布空白回到未选中态」——手势的适用面、清什么、不清什么与幂等性（两页共用的画布模板）。
- `graphify-global-tags`：「顶栏标签勾选」补上一条出口——单击画布空白 MUST 把勾选集合清空（回到默认「一个都不勾」），仍是纯视图状态，MUST NOT 落盘。
- `graphify-physics-chain`：新增「点亮随点空白熄灭」——四个点亮来源（参数词条 / 过程词条 / 检索命中 / 点红点）在点空白后 MUST 一起熄灭，MUST NOT 只清选中。

## Impact

- `Graphify/src/graph/graphSource.tsx`：`GraphSource` 接口 + 缺省（store）实现。
- `Graphify/src/components/GraphCanvas.tsx`：渲染器回调 `onClearSelection` 那一段（改调 `clearHighlight()`）。
- `Graphify/src/components/PhysicsChainView.tsx`：本页 provider 的实现。
- 画布页（`App.tsx`）无需改动：清选中与清勾选都在缺省数据源里。
- 数据层、生成物与既有手动清空入口（顶栏标签入口的「清除」）不动：本次只多一个手势，不删任何出口。
- 门禁：`check:copy`（页面文案）、`tsc -b`、`eslint`（改动文件）、`check:canvas`、`check:chain`。
