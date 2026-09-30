## 1. 规则与状态

- [x] 1.1 delta spec 写两条要求（`按模块隐藏关系` / `隐藏关系是本地记忆的视图状态`）并 `openspec validate graphify-hide-module-relations --strict` 通过 — 验证：四项工件 done，校验无错
- [x] 1.2 `src/lib/viewPreferences.ts` 新增：命名空间键 `graphify.hiddenRelations.v1` + 字符串数组的容错读写（`typeof window === 'undefined'` 直接返回默认；缺失/非法 JSON/非数组/存储抛错一律降级）— 验证：`npx tsc -b` 通过；`npm run check:code`（Node 侧 import 服务端模块）不受影响
- [x] 1.3 `src/state/graphStore.ts` 增 `hiddenRelationIds: string[]`（初值读本地存储）+ `toggleHiddenRelations(nodeId)` + `setHiddenRelationIds(ids)`（归一化去重、过滤不存在的节点、写存储）；切换里带选中兜底（照 `setHiddenTopics` 的口径）— 验证：`npx tsc -b` 通过；探针断言「没有进入撤销栈」通过（past 长度不变）

## 2. 渲染器

- [x] 2.1 `src/graph/cytoscapeSetup.ts` 增私有字段 `hiddenRelationIds: Set<string>`（`topicFilter` 旁）与公开幂等入口 `setHiddenRelations(ids)`（集合相等直接返回；否则 `emitVisibility(applyVisibility())`）— 验证：与 `setTopicFilter` 同风格，`npx tsc -b` 通过
- [x] 2.2 `applyVisibility()` 的边循环里追加隐藏规则：话题过滤未命中时继续判隐藏集合，端点任一命中即 `display:none`；注释写明"层级是 compound、不是边" — 验证：`check:canvas` 关系收起断言组 7 项全过，且话题过滤与三块骨架断言不受影响

## 3. 两个入口

- [x] 3.1 `src/components/GraphCanvas.tsx`：订阅隐藏集合指纹字符串 + 一个推给渲染器的 effect；`onNodeContextMenu` 补 `relationsHidden`；`<ContextMenu>` 传 `onToggleRelations` — 验证：`npx tsc -b` + `npm run lint` 通过
- [x] 3.2 `src/components/ContextMenu.tsx`：`ContextMenuState` 增 `relationsHidden?`、props 增 `onToggleRelations?`，节点菜单在「移出大框」与「删除节点」之间插入一项（`Eye`/`EyeOff`，容器不入列）— 验证：探针「菜单里有『隐藏它的关系』」+「点中后它的关系全部不画了」通过；容器上该项不存在
- [x] 3.3 `src/components/Inspector.tsx` 增 `relationsHidden` / `onToggleRelations` 两个 props + 一行开关（复用整行样式 + `Switch`，`node.type !== 'group'` 才显示）；`src/App.tsx` 从 store 取值注入 — 验证：探针「属性面板里有该行」「开关跟着显示为已收起」「点开关恢复」通过；容器属性面板无该行

## 4. 自检、实测与文档

- [x] 4.1 `scripts/check-canvas.mjs` 增关系收起断言组（基线 / 单端点 / 共同端点 / 幂等 / 容器不影响 / 清空恢复 / 坐标未变）— 验证：`timeout 150 npm run check:canvas` 全绿「全部符合预期」，三块骨架断言仍在执行
- [x] 4.2 `npm run build` 后用 Windows 侧无头 Edge 探针实测：右键项存在且能收起（可见连线 18→15）、其它连线不受影响、属性面板开关同步、恢复后存储记录清掉、**刷新后仍隐藏**、图谱数据逐字节未变、撤销栈未变、容器无入口 — 验证：探针 30 项断言全通过，探针文件已删、无残留进程
- [x] 4.3 顺带清洁：`server/lib/codeIndex.mjs` 的局部变量 `shared` → `base`；README 画布章节补一句用法 — 验证：`grep shared Graphify/server/lib/codeIndex.mjs` 无命中；README 有该句
- [x] 4.4 归档变更并内联同步主规格，确认 `openspec validate --specs --strict` 全绿、主规格里出现两条新要求 — 验证：`openspec list` 不再出现该变更；13 → 13 项 spec 校验全通过（topic-views 内新增两条要求）
