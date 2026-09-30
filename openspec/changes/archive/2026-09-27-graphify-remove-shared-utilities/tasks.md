## 1. 立项与规则撤除

- [x] 1.1 新建 `graphify-remove-shared-utilities`，三份 delta 用 `## REMOVED Requirements` 写出 8 条（code-topology 3 / canvas-appearance 2 / topic-views 3），每条带 Reason 与 Migration —— 验证：`openspec validate graphify-remove-shared-utilities` 通过；标题与主规格逐字一致
- [x] 1.2 删除未归档的 `openspec/changes/graphify-shared-utilities/` 整目录 —— 验证：`openspec list` 不再出现该变更，`openspec validate --specs` 仍 12/12

## 2. 服务端与数据

- [x] 2.1 `server/lib/schema.mjs` 去掉节点 schema 里的该字段；`server/schema/graph.schema.json` 去掉其属性声明 —— 验证：两处文件内检索无该字段名
- [x] 2.2 `server/routes/graph.mjs` 去掉创建与更新处的字段处理；`server/lib/mergeDraft.mjs` 去掉新建草案节点的默认值与相关注释 —— 验证：全局检索无残留
- [x] 2.3 **重启 dev 服务**（`default` 会回填，必须先重启）—— 验证：`/api/graph` 返回 200
- [x] 2.4 用审计脚本的清理模式清掉 13 个标记（写前备份、断言节点/关系数不变）—— 验证：数据为 59 节点 / 54 关系，且任意节点都不含该键
- [x] 2.5 删除 `scripts/mark-shared-utilities.mjs` —— 验证：文件不存在，`package.json` 无脚本引用它
- [x] 2.6 回读 `/api/graph` 确认字段彻底消失（若仍出现说明服务未加载新 schema，停下排查）—— 验证：返回的节点对象里检索不到该键

## 3. 前端拆除

- [x] 3.1 `src/lib/types.ts` 去掉节点字段与注释；`src/graph/palette.ts` 去掉三个标识常量 —— 验证：`npx tsc -b` 通过（此时其余引用点会报错，作为待清理清单）
- [x] 3.2 `src/graph/cytoscapeSetup.ts` 去掉节点 data 字段、标记上报方法、隐藏集合字段、端点映射与设置入口、可见性里的隐藏规则、为此加的类型导入 —— 验证：该文件内无相关符号
- [x] 3.3 `src/state/graphStore.ts` 成组去掉两个纯视图字段、三个动作、派生与选中兜底助手、初始状态与 `reset()` 中的对应项 —— 验证：该文件内无相关符号
- [x] 3.4 `src/components/GraphCanvas.tsx` 去掉标记状态与右上角 DOM、隐藏集合订阅与 effect、图例传参、右键菜单状态字段与回调、相关图标与调色导入；**保留**三处浮层刷新 —— 验证：三处 `refreshRef.current()` 仍在
- [x] 3.5 `src/components/ContextMenu.tsx` / `Inspector.tsx` / `TopBar.tsx` / `CanvasOverlays.tsx` 四个文件去掉各自入口与导入 —— 验证：`npx tsc -b` 与 `npm run lint` 全绿
- [x] 3.6 全局语义检索确认无残留符号（字段名、隐藏集合、上报方法、调色常量、store 动作）—— 验证：检索结果为 0 命中（注释里的历史说明也应清掉）

## 4. 自检与文档

- [x] 4.1 `scripts/check-canvas.mjs` 删除「标识 + 关系收起」断言块（含其注释），**保留**其后「真实数据：初始条件三块骨架」断言块 —— 验证：`npm run check:canvas` 全绿，三块断言仍逐条执行
- [x] 4.2 删除 `README.md` 的复用件整节，并检查其它段落无残留提法 —— 验证：`grep 复用件 README.md` 无命中
- [x] 4.3 检查 `docs/` 与 `src/**` 注释里是否有残留提法（只清理与本功能相关的，三块骨架相关说明保留）—— 验证：检索结论逐条记录

## 5. 验证

- [x] 5.1 跑 `npx tsc -b`、`npm run lint`、`npm run check:canvas`、`npm run check:styles` —— 验证：四项全绿（既有 warning 除外）
- [x] 5.2 无头 Edge 探针确认四处界面入口消失：画布无标识、右键菜单无「隐藏它的关系」、顶栏无该控件、属性面板无该开关 —— 验证：探针日志全为「不存在」
- [x] 5.3 探针同时确认**未误伤**：初始条件子图仍是三块骨架（框 3 + 步骤 13）、红点标记与类型配色正常 —— 验证：探针断言通过；探针文件用完即删

## 6. 归档与同步

- [x] 6.1 归档本变更（内联把 8 条 REMOVED 同步进三份主规格）—— 验证：三份主规格不再出现那 8 条 requirement 与相关场景
- [x] 6.2 确认 `openspec validate --specs` 仍 12/12，且 `git diff` 只动了预期文件 —— 验证：校验全绿、改动清单与 design 的范围一致
