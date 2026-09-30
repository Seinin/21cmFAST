## 1. 引用盘点

- [x] 1.1 盘点自动保存、整图 PUT、保存文案与断言的引用（含 `renameGraph` 借整图 PUT、relayout 间接触发、脚本三类写盘通道）— 验证：得到按文件分组的清单；确认现有 `check:styles`/`check:canvas`/`check:code`/`check:graph` 均不断言自动保存；额外发现 `renameGraph` 借整图 PUT 写一个字段（需增量端点）、relayout 是隐性整图写入口

## 2. 存储与接口

- [x] 2.1 `server/lib/paths.mjs`：`DATA_DIR` 支持 `GRAPHIFY_DATA_DIR` 覆盖（默认不变）— 验证：`check-store.mjs` 全程跑在临时目录，自检首项即断言工作文件与历史目录都在临时目录内
- [x] 2.2 `server/lib/store.mjs`：`snapshot()` 支持保留标记（文件名 `-keep` 后缀 + 文件内 `pinned: true`）、时间戳加 4 位随机后缀防撞名；新增"只快照不覆盖"的 `writeArchive()` — 验证：`POST /api/graph/save` 产出 `graph-…-keep.json` 且工作文件字节不变
- [x] 2.3 `server/lib/store.mjs`：`pruneSnapshots()` 跳过保留副本、`listSnapshots()` 回传 `pinned` — 验证：轮转上限调到 3、连写 6 次后保留副本仍在，自动快照被裁到 3 份
- [x] 2.4 `server/routes/graph.mjs`：新增 `POST /positions`（批量、空对象不写盘、未知 id 与非法坐标记入 `skipped`）、`POST /save`（写保留副本、严格校验、绝不写工作文件）、`DELETE /versions/:id`（只允许删保留副本）、`PATCH /meta`（只改名称）— 验证：四个端点各自跑到；`updatedAt` 只在预期路径前进
- [x] 2.5 `server/routes/graph.mjs`：更新整图 PUT 护栏处注释（前端已不再整图 PUT，护栏现在防脚本/外部调用）— 验证：注释与 `README.md` 脚本一节口径一致

## 3. 服务端断言

- [x] 3.1 新增 `scripts/check-store.mjs`（临时 `GRAPHIFY_DATA_DIR` + 随机端口起真服务；空 positions 不写盘、批量只产一份快照、另存不动工作文件、轮转跳过保留副本、只允许删保留副本、改名不整图替换、坏数据不进档案、保留副本可回滚）— 验证：`npm run check:store` 39 项全绿
- [x] 3.2 `package.json` 新增 `check:store` 脚本 — 验证：`npm run check:store` 可直接运行

## 4. 前端同步层

- [x] 4.1 `src/hooks/useGraphSync.ts`：删除 `AUTOSAVE_DELAY` / `debouncedPersist` / 自动保存 effect / `persist`；`undo`/`redo` 只回退本机 — 验证：`npx tsc -b` 干净、`npm run lint` 无新增问题；浏览器里重排后等 2.2 秒工作文件与快照数都不动
- [x] 4.2 `src/hooks/useGraphSync.ts`：`saveNow` 改为两步（先 `updatePositions` 再 `saveSnapshot`），失败如实报错并保持未保存（第一步成功、第二步失败时提示"坐标已写入工作文件，但副本没生成"）— 验证：浏览器 Ctrl+S 后恰好新增两份快照（`node:positions` + `-keep.json`），顶栏回"已保存"、Toast 给出副本名
- [x] 4.3 `src/state/graphStore.ts`：新增 `pendingPositionIds`（`applyPositions` 收集、`applyServerGraph` 合并保留、`markSaved`/`loadGraph` 清空）；`undo`/`redo` 置脏 — 验证：`check-store` + 浏览器探针口径一致
- [x] 4.4 `src/api/client.ts`：新增 `updatePositions` / `saveSnapshot` / `deleteVersion` / `patchMeta`；`putGraph` 标注"仅脚本/CLI 使用" — 验证：全仓检索 `putGraph` 只剩定义处，前端无调用点
- [x] 4.5 新增 `src/hooks/useUnsavedWarning.ts` 并在 `App.tsx` 接入；`renameGraph` 改走 `patchMeta` — 验证：浏览器里导航离开时弹出原生 `beforeunload` 确认；`PATCH /api/graph/meta` 只改名称字段（`check-store` 断言节点/边逐字未变）
- [x] 4.6 前端源码里不再有整图 PUT 调用点 — 验证：`grep -rn putGraph src/` 只有 `api/client.ts` 的定义与注释

## 5. 文案与文档

- [x] 5.1 `TopBar.tsx`（Tooltip 改"另存为一份保留副本"）、`HelpDialog.tsx`（`Ctrl+S` 与 `Ctrl+Z` 说明、可逆性段落补"撤销只改本机"）— 验证：界面不再出现"保存到 data/graph.json"字样
- [x] 5.2 `HistoryPanel.tsx`：新增 `node:positions`「调整坐标（手动保存）」、`graph:save-as`「另存为保留副本」、`graph:rename`「改图谱名称」；保留副本带"保留"徽标 + 单独删除入口（确认后调 `deleteVersion`）；面板说明与空态改为新口径 — 验证：另存后列表出现带徽标且带删除按钮的副本；删自动快照被服务端 400 拒绝（`check-store` 覆盖）
- [x] 5.2b 历史遗留理由（`graph:autosave` / `history:undo` / `history:redo`）**保留标签但标注「（旧）」**，而不是直接删除：本机历史目录里还有改动前留下的旧快照，去掉标签会让它们显示成原始英文 id。计划原文为"去掉这三条"，此处按"旧数据仍可读"调整，行为口径（不再产生这三类快照）已由代码与断言保证
- [x] 5.3 `README.md`：功能导览「坐标自动保存」→「坐标手动保存」、新增「保存 = 另存为」一行、可逆性一行补"仅当前会话"、快捷键表与自检脚本表同步 — 验证：README 中不再出现"坐标自动保存"与"立即保存"
- [x] 5.4 `docs/DESIGN.md`：状态分层表去掉"自动保存/撤销落盘"；可逆性改为三级并删掉"撤销会把整图 PUT 回服务端"；坐标与并发改为"只改本机 + 保存时批量写坐标" — 验证：DESIGN 与实现一致，无 650ms/去抖残留表述

## 6. 回归与归档

- [x] 6.1 全套回归：`npx tsc -b`、`npm run lint`（仅 2 处既有警告）、`npm run build`、`npm run check:code`（48）、`npm run check:canvas`、`npm run check:styles`、`npm run check:graph`（13）、`npm run check:store`（39）— 验证：全部通过
- [x] 6.2 浏览器实测（Windows 侧无头 Edge + CDP，探针用完即删）：重排后 2.2 秒不写盘、Ctrl+S 恰好新增两份快照且顶栏回"已保存"、Ctrl+Z 不产快照、脏状态导航离开弹原生确认 — 验证：15 项断言全绿
- [x] 6.3 归档本变更并把三条 delta（新增 `graphify-graph-persistence`、修改 `graphify-canvas-layout` / `graphify-topic-views`）同步进主 specs — 验证：`openspec validate graphify-manual-save-only --strict` 通过，归档后主 specs 呈现新口径且旧"回写保存"表述消失
