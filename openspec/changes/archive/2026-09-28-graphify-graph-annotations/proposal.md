## Why

初始条件（S09）这条链在画布上现在"看着像一整条必走流程"，而事实不是：

- 22 个 IC 节点**标签全为空**（`data/graph.json`）：勾选任何标签都不会让它们亮红点，这一专题筛不出来。丢字段的是一次性重构脚本——`data/graph.before-param-tag.json` 里还有 `tag:初始条件` / `tag:2LPT`，到 `data/graph.before-ics-blocks.json` 就成了 `[]`；那支脚本已删，重跑现有构建也拿不回来。
- 二阶修正（2LPT）两个步骤与它的三条关系**没有虚线**，看起来与 ZA 一样必走——实际只在 `PERTURB_ALGORITHM == "2LPT"` 时执行（`src/py21cmfast/wrapper/outputs.py:563`，C 侧 `src/py21cmfast/src/InitialConditions.c:366-544`）。IC builder 的节点对象里**没有 `conditional` 字段**，"可选"只以标签文字存在（vcb 的 label 里那个"（可选）"），而 builder 自己的分组说明写着"三条各自独立的可选支路"——意图在源码里，没变成数据。
- 自动构建发现不了：唯一会产标签的脚本（`scan-param-tags.mjs`）只从**源码引用**所在的函数体里扫参数，而 IC 节点一条源码引用都没有（只锚 `.md`）；它还会把 `meta.tags` 注册表重写成自己扫出的那批，自由标签连注册表都留不下。构建与检查都只看格式（标签条数 / 长度、ref 能否解析、topic 是否注册），不看"有没有标签""可选有没有标"。

## What Changes

- **恢复 IC 链标注**（不重跑全量构建）：走既有草稿合并通道（`scripts/import-graph.mjs` → `POST /api/graph` → `server/lib/mergeDraft.mjs`），12 个 `ic:proc-*` 按 `build-initial-conditions-graph.mjs` 的 spec 逐条写回标签，`ic:art-inputs` 用 `['输入','P01']`，4 个重复份继承同名原份，5 个分组挂「初始条件」；`applyDraft` 不更新坐标，手摆版面与手改内容不受影响。
- **补可选性**：`ic:proc-2lpt-phi` / `ic:proc-2lpt-v` 与三条 2LPT 关系均标 `conditional: true`（画布虚线），并核对 vcb 支路的节点与关系。
- **补源码引用**：给 IC 过程节点补 `file:line`——Python 落点先做（`outputs.py` 的 2LPT / vcb / `PERTURB_ON_HIGH_RES` 分支），C 落点在扫描器扩展后加，使参数标签（`tag:PERTURB_ALGORITHM`、`tag:USE_RELATIVE_VELOCITIES` 等）能自动产出。
- **让构建能表达**：IC builder 的 spec 增加 `conditional` 字段并写进草稿，校验加两条闸门：label 含「（可选）」⇔ `conditional === true`；`method` / `dataset` 节点 `tags` 非空。
- **让扫描器不再漏**：`scan-param-tags.mjs` 支持 C 文件（花括号配对替代缩进），并把 `meta.tags` 的写法从"重建"改成"只增不减"。
- **让检查兜住**：新增 `npm run check:graph`，断言 IC 链标签非空、IC 标签与 builder 的 spec 一致、2LPT（及 vcb）支路的节点与关系都标 `conditional`、注册表不因重扫缩水。

## Capabilities

### New Capabilities

- `graphify-graph-annotations`: 图谱数据的标注契约——流程节点必须可被标签筛出（至少一条，且与作者源一致）、可选支路必须在节点与关系上标"条件"、参数标签必须能由源码引用自动产出、标签注册表只增不减、标注修复不得改动版面。

### Modified Capabilities

（无。画布上"虚线 = 条件 / 可选"的视觉口径已由 `graphify-canvas-appearance` 规定，本次不改它，只是把数据补上。）

## Impact

- **数据**：`data/graph.json`（22 个 IC 节点的 `tags` / `refs` / `conditional` 与 `meta.tags` 注册表）；改动前按仓库惯例留 `data/graph.before-ic-annotations.json` 备份；写回一律经 `POST /api/graph`，不手改文件。
- **脚本**：`scripts/build-initial-conditions-graph.mjs`（spec + 两条校验）、`scripts/scan-param-tags.mjs`（C 支持 + 只增不减）、新增 `scripts/check-graph.mjs` 与 npm script `check:graph`、新增一次性修复草稿 `data/ic-annotations-repair.json`。
- **前端**：不改代码。标签红点与 `conditional` 虚线都是既有渲染（`src/graph/styles.ts:147` / `:395`、`src/graph/cytoscapeSetup.ts:678/727`）。
- 不引入新依赖；既有检查口径不变，尤其 `check:canvas` 要求"不在配色表里的标签必须没有 color"，因此自由标签一律不带 color。
