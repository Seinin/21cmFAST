# LLM 建图接口

Graphify 预留了一个标准化的建图端口，让模型或脚本可以「读 notes 库 → 产出草案 → 写入图谱」。整个流程是幂等的，可以安全重放。

服务启动后（默认 `http://localhost:5178`），接口都在 `/api/graph` 下。

## 一分钟流程

```bash
# 1. 读文档列表（含标题大纲，大纲的 slug 就是引用锚点）
curl -s localhost:5178/api/md

# 2. 读某篇文档原文
curl -s "localhost:5178/api/md/content?docId=FDM.md"

# 3. 拿到字段说明（JSON Schema）
curl -s localhost:5178/api/graph/schema

# 4. 先干跑，确认差异
curl -s -X POST "localhost:5178/api/graph/import?dryRun=1" \
  -H 'Content-Type: application/json' \
  -d @draft.json

# 5. 确认无误后正式写入
curl -s -X POST localhost:5178/api/graph/import \
  -H 'Content-Type: application/json' \
  -d @draft.json
```

## 读取接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/md` | 文档列表：`docId`、`title`、`summary`、`headings`（含 `depth`/`text`/`slug`/`line`）、字数 |
| `GET` | `/api/md/content?docId=<docId>` | 单篇原文与大纲，返回 `content` 与 `absolutePath` |
| `POST` | `/api/md/refresh` | 强制重新扫描 notes 目录（新增文档后调用） |
| `GET` | `/api/code` | 源码文件列表：`path`/`name`/`dir`/`ext`/`language`/`size`；可带 `q=` 按路径过滤 |
| `GET` | `/api/code/content?file=<相对路径>&start=<行>&end=<行>&context=<行数>` | 源码行窗口：带行号的 `lines` 与要高亮的 `highlightStart`/`highlightEnd` |
| `POST` | `/api/code/refresh` | 强制重新扫描源码目录 |
| `GET` | `/api/graph` | 当前整图 |
| `GET` | `/api/graph/schema` | 导入契约的 JSON Schema |
| `GET` | `/api/graph/versions` | 快照列表 |

`headings[].slug` 就是用引用锚点：把 `<docId>` 和这个 slug 一起写进节点的 `refs`，前端点击时就能定位到那一节。
要引用**源码**时改用 `file` + `line`（可加 `endLine`）写在同一个 `refs` 项里，例如
`{"file": "src/py21cmfast/src/thermochem.c", "line": 536, "endLine": 545}`；
`file` 是相对**仓库根**的路径（索引根可用 `GRAPHIFY_CODE_DIR` 改），越界路径会返回 400。

## 写入接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/graph/import` | **推荐入口**，批量导入草案，支持 `?dryRun=1` |
| `POST` | `/api/graph/nodes` | 单个新建节点 |
| `PATCH` | `/api/graph/nodes/:id` | 修改节点（部分字段） |
| `DELETE` | `/api/graph/nodes/:id` | 删除节点并级联删除其关系 |
| `POST` | `/api/graph/edges` | 单个新建关系 |
| `PATCH` | `/api/graph/edges/:id` | 修改关系 |
| `DELETE` | `/api/graph/edges/:id` | 取消关系 |
| `PUT` | `/api/graph` | 整图替换（谨慎使用） |
| `POST` | `/api/graph/versions/:id/rollback` | 回滚到某份快照 |

## 草案格式

```json
{
  "mode": "merge",
  "meta": { "name": "21cm 物理图谱", "description": "由模型从 notes 库抽取" },
  "nodes": [
    {
      "label": "亮温方程",
      "type": "concept",
      "summary": "决定 21cm 微分亮温的三个因子之积",
      "tags": ["21cm", "辐射"],
      "refs": [{ "docId": "FDM.md", "anchor": "核心结论速览", "label": "FDM 建模文档（整合版）" }]
    },
    { "label": "自旋温度", "type": "concept" }
  ],
  "edges": [
    { "source": "亮温方程", "target": "自旋温度", "label": "依赖", "type": "depends_on" }
  ]
}
```

### 字段规则

- `mode`
  - `merge`（默认）：按 `id` 或 `label` 去重合并，**幂等**，推荐；
  - `replace`：先清空再写入，只在明确要重建时使用。
- `nodes[].id`：可省略，服务端会生成 `n_xxxxxxxxxx`。
- `nodes[].label`：必填，1–140 字。
- `nodes[].type`：`group` | `concept` | `doc` | `section` | `method` | `result` | `question` | `dataset` | `tool`，默认 `concept`。
  `group` 是**大框**（画布容器）：把子节点的 `parent` 指向它，画面上就会把小框圈进这个框里。
- `nodes[].parent`：父节点 id（可指向 `group` 构成大框层级，也可指普通节点只画父子连线）；
  悬空、自指或**成环**的写法会被降级为顶层（不会报错，但也不生效）。
- `nodes[].conditional`：`true` 表示这一步是**条件/可选**的，画布上用**虚线框**表达
  （例如「仅 lagrangian 源模型时才执行」的步骤）。
- `nodes[].position`：初始坐标 `{x, y}`。**只在新建节点时采用**；合并已有节点时不覆盖其坐标
  （否则重跑一次导入就会把用户手摆的版面冲掉）。迁移既有图纸时给上坐标，导入即摆好版面。
- `nodes[].conditional`：`true` 表示这一步是**条件/可选**的（画布虚线框）；合并时会随草案更新。
- `nodes[].refs[]`：一条引用可以指向**文档**或**源码**，两者至少填一个：
  - `docId`：相对 `docs/notes/` 的路径，使用正斜杠，例如 `FDM.md` 或 `子目录/note.md`；
  - `anchor`：文档大纲里的 `slug`；留空表示指向文档开头；
  - `file`：相对**仓库根**的源码路径，例如 `src/py21cmfast/src/thermochem.c`；
  - `line` / `endLine`：源码行区间（1 起、含两端），只给 `line` 即单行。
- `edges[].source` / `edges[].target`：**可以是节点 id，也可以是节点名称**，服务端会自动解析。
- `edges[].label`：必填，显示在连边上。
- `edges[].type`：`depends_on` | `relates_to` | `derives_from` | `references` | `contradicts` | `extends`，默认 `relates_to`。
- `edges[].directed`：默认 `true`，为 `false` 时不显示箭头。
- `edges[].sourcePort` / `edges[].targetPort`：箭头吸附端口，取值 `n` | `e` | `s` | `w`（上/右/下/左）；
  留空或 `null` 表示自动吸到离对端最近的那条边。界面里拖线时靠近边中点即会写入这组字段。
- `edges[].conditional`：`true` 表示这条数据流是**条件性**的，画布上用**虚线**表达
  （例如「halobox 可能是 None 时才成立」的那条依赖）。

### 字段名宽容

除上表字段外，接口同时接受一组 snake_case 别名，**规范名优先**（两者都给时以规范名为准）：

| 别名 | 规范名 |
| --- | --- |
| `name_label` | `label` |
| `category` | `type` |
| `identifier` | `id` |
| `doc_id`（节点与 `refs` 内均可） | `docId` |
| `dry_run` | `dryRun` |

这组映射是为 Python 侧管线准备的：docling-graph 按 JSON Schema 生成的 Pydantic 模板会把 `label` 规范成 `name_label`、`type` 规范成 `category`，因此模型按模板输出的 JSON 可以**原样提交**，不必手工改写字段名。多余字段（如模板根上的 `document_reference`）会被忽略。

### 合并语义

- 节点按 `id` 优先、其次按 `label`（忽略大小写与首尾空白）匹配；命中则**合并**：标签、类型、摘要被新值覆盖，`tags` 与 `refs` 取并集。
- 关系按 `id` 优先、其次按 `(source, target, label)` 匹配；命中则更新类型、方向与备注。
- 无法解析的边不会写入，而是出现在返回结果的 `errors` 里，并带 `index` 指回草案中的位置。
- 节点缺 `label`（或全为空白）会被跳过并报 `label 不能为空`，不会建出空标签节点；边缺 `label` 同理。这条护栏是必要的：空标签节点一旦落库，所有靠名称解析的边都会集体失配，而错误信息只会指向边，看不出根因。

### 全局标签（tags / tagDetails）

图谱有一份图级**标签注册表** `meta.tags`（`{id, name, description, color?}`），节点上的 `tags`
存的是**注册表 id**（不是自由文本）——这样改标签名不会让任何节点的归属失效。草案侧不用关心这点：

- 草案里 `tags` **写标签名即可**（`"tags": ["宇宙学", "随机数"]`）。合并时按「先当 id 找、再当名字找、
  都没有就登记一个新标签」解析；登记出来的 id 形如 `tag:宇宙学`。
- 落盘数据里节点只留 id；`GET /api/graph` 返回的 `meta.tags` 是名称与说明的权威来源。
- 节点还有一个 `tagDetails` 字段：`{ [标签 id]: [{ label, kind, note, ref }] }`——标签在**这个节点**
  上具体是什么（如「参数参与」下面是「参数名 · 用法（赋值 / 入公式 / 开关）· 出处 file:line」）。
  **导入草案不写它**（草案里的该字段会被忽略），明细由脚本通过 `PATCH /api/graph/nodes/:id` 或直接
  按 `scripts/tag-parameters.mjs` 那样写文件生成。
- 注册表端点：`POST /api/graph/tags`（登记，按名称幂等复用）、`PATCH /api/graph/tags/:id`（改名/说明/颜色，
  id 不变）、`DELETE /api/graph/tags/:id`（注销，并把所有节点上的归属与明细一并摘掉）。

## 返回格式

```json
{
  "dryRun": true,
  "preview": {
    "applied": { "nodes": 2, "edges": 1 },
    "createdNodes": [{ "id": "n_fde997a1d9", "label": "亮温方程" }],
    "updatedNodeIds": [],
    "createdEdges": [{ "id": "e_d20fa686d0", "label": "依赖" }],
    "updatedEdgeIds": [],
    "errors": [{ "index": 1, "reason": "source 未匹配到节点：不存在" }]
  }
}
```

正式导入（不带 `dryRun`）会额外返回 `graph` 字段，即写入后的完整图谱。

请求体上限默认 8 MB（`GRAPHIFY_JSON_BODY_LIMIT`）；`nodes` 默认最多 2000 条、`edges` 默认最多 6000 条（**可否决**：`GRAPHIFY_MAX_NODES` / `GRAPHIFY_MAX_EDGES` 可改成别的数字，或设为 `off` 关掉上限，见 README 的「上限开关」一节）。`GET /api/graph/schema` 返回的 `maxItems` 就是当前生效值——关掉上限时该字段不出现。

## 推荐的提示词

界面「导入」对话框里的「复制 LLM 指令」按钮会生成下面这段内容（含当前 notes 库的文档清单），可以直接粘给模型：

```
你是 Graphify 的建图助手。请阅读下列 markdown 文档，抽取实体与关系，输出一份可直接导入的 JSON。

【notes 数据库】
- FDM.md（FDM 建模文档（整合版））
- XRAY_physics_manual.md（21cmFAST X-ray 物理手册）
...

【读取方式】
GET /api/md             → 文档列表（含标题大纲）
GET /api/md/content?docId=<docId> → 文档原文
GET /api/graph/schema   → JSON Schema 与字段说明

【输出契约】
{ "mode": "merge", "nodes": [...], "edges": [...] }

【约束】
1. type 取值：concept / doc / method / result / question / dataset / tool
2. 关系 type 取值：depends_on / relates_to / derives_from / references / contradicts / extends
3. 边的 source/target 可以直接写节点名称，服务端会自动解析
4. merge 模式按 id 或 label 去重，可安全重复提交
5. 提交方式：POST /api/graph/import?dryRun=1 先预览，再去掉 dryRun 正式写入
```

## 与 docling-graph 的关系

仓库内的 `docling-graph`（`../docling-graph/`）能把 PDF、图片、Office、Markdown 文档抽成 NetworkX 图谱。它和本接口有两条**完全不同**的对接路径，不要混淆：

### 推荐：用它的 Pydantic 契约产出草案

docling-graph 能按 JSON Schema 生成 Pydantic 模型，其字段名会规范成 snake_case（`label`→`name_label`、`id`→`identifier`、`type`→`category`、`refs[].docId`→`refs[].doc_id`）。这组别名已被本接口接受（见「字段名宽容」），所以：

```python
draft = GraphifyLLM.model_validate(llm_json_output)      # 用 docling-graph 生成的契约校验
requests.post(f"{base}/api/graph/import?dryRun=1", json=llm_json_output)   # 原样投递即可
```

模型按该模板输出的 JSON 可以直接导入，无需重写字段名。

### 不适用：它的 NetworkX / JSON 导出

`JSONExporter` 导出的 `graph.json`（`{"nodes": [...], "edges": [...], "metadata": {...}, "graph": {...}}`）是**对象图 dump，不是建图草案**：

- 它的「节点」是模板里的**每个子对象**——引用对象会自成一个节点（`__class__` 为 `Ref`，`label` 为类名 `Ref`），根对象本身也占一个节点；
- 它的边 `label` 是 **Pydantic 字段名**（如 `HAS_REFS`、`HAS_NODES`、`HAS_EDGES`），表达的是「包含」而非语义关系；
- 它的 `type` 是 `entity`，不在本接口的类型枚举内。

把它投给 `/api/graph/import` **不会报错**，但会得到一批以类名命名的节点与 `HAS_*` 连边——那是没有意义的。该导出适合拿去做可视化或图分析；要入库请走上面的契约草案。字段语义差异另见 `DESIGN.md`。

### 本仓库已落地的抽取管线

`docling-graph/` 下有一份可复用的实现，把它的抽取结果映射成本接口的草案（即上面那条「导出不是草案」的解法）：

```bash
cd docling-graph
.venv/bin/python run_notes_graph.py            # 用 LLM 逐篇抽取 docs/notes/*.md
.venv/bin/python build_notes_draft.py          # 映射成 Graphify 草案
cd ../Graphify && node scripts/import-graph.mjs data/notes-draft.json --replace
```

映射规则（见 `docling-graph/build_notes_draft.py`）：

- 节点只取 `__class__` 为 `Entity` 的条目（丢弃模板根对象与 `Ref` 引用对象），边只保留 6 种语义关系，丢弃根节点发出的 `entities` 边；
- 用节点 provenance 里的 `chunk_id` 反查 `docling/chunks.json` 的 `headings`，取最深一级标题转成锚点 slug，实现「实体 → 章节」精确定位（`docs/notes` 全量抽取时 1200+ 个锚点零失配）；
- 跨文档同名实体按 `label` 合并，`refs` 与 `tags` 取并集；
- `hmf.c:489` 这类「文件:行号」标签折叠回文件级节点并纠正类型（源码 → `tool`，文档 → `doc`），避免行号碎片变成概念节点。

### 权威做法

`GET /api/graph/schema` 返回的 JSON Schema 就是契约本身。无论用 docling-graph、其他抽取框架还是直接让 LLM 生成，都按它产出 `{ mode, nodes, edges }` 即可。
