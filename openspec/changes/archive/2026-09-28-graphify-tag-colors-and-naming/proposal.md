## Why

两件事：

1. **标签显示名里混着一个中文名**：`tag:BOX_LEN` 的名字是「盒子共动边长 L」——25 个参数标签里只有它一个带中文，读图时反而要来回对照变量名。用户要求改回原变量名。
2. **右侧属性面板里的标签全是一个玫红**：25 个标签分属四类（`inputs.py` 里 `InputStruct` 的子类：`MatterOptions` / `SimulationOptions` / `AstroOptions` / `AstroParams`），但面板里看不出类别——用户要求"这几类标签的颜色要做区分"。

范围由用户当场定死：**只改右侧属性面板**；画布上的红点保持现在的固定玫红、不按类别变色（免得让人以为"面板里的色 = 画布上那个点"）；顶栏参数弹层本次不动。

## What Changes

- **命名**：`tag:BOX_LEN` 的显示名改回 `BOX_LEN`。`scripts/scan-param-tags.mjs` 里的 `NAME_OVERRIDES`（中文名覆盖表）删除，重跑扫描不会把中文名写回来；README 的命名规则段从"物理量用中文名 + 符号，其余用变量名"改为**一律用原变量名**，并留下这次撤销的记录。
- **类别配色（只落在右侧面板）**：`src/graph/palette.ts` 新增 `TAG_GROUP_COLORS`（四类各一色）+ `TAG_GROUP_FALLBACK_COLOR`（未分类中性灰）+ `tagAccentOf(tag)`（取色：标签自己的 `color` → 按 `group` 派生 → 兜底）+ `withAlpha(hex, alpha)`（同一色算底色/描边）。
- **面板三处跟着上色**（文字与边框都用类别色，替换原来的玫红）：已选标签 chips、标签选择器（勾选框与候选名）、标签区块的标签行（边框/淡底/图标/名称）。明细块里的「用法」分组标题与出处链接保持原样——那是另一个维度。
- **数据自描述**：把类别色按同一张表 seed 进注册表的 `color` 字段（用户选择"两者都要"）。前端取色优先用 `color`、缺省按 `group` 派生；`npm run check:canvas` 加一条断言要求"被管的标签 `color` 严格等于其 `group` 的表值"，两处漂移直接失败。
- **画布不动**：`TAG_DOT_COLOR`、`node.tagged` 的 underlay、`GraphCanvas` 的 DOM 徽标一行都不改；check-canvas 里既有的红点断言继续通过，并新增一条"红点常量未被改成类别色"。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——本次是外观与命名口径，不新增/修改行为契约；`skip_specs: true`，口径落 README。未归档的 `graphify-global-tags` 不碰。）

## Impact

- **前端**：`src/graph/palette.ts`（新增配色表与两个助手）、`src/components/NodeTags.tsx`（三处渲染改用行内 CSS 变量上色）、`src/lib/types.ts`（`TagDefinition.color` / `group` 的注释改写——`color` 从"预留"变成"面板按它上色"）。
- **脚本**：`scripts/lib/tag-groups.mjs`（新增，脚本侧的同一张表）、`scripts/color-tags.mjs`（新增一次性 seed：改名 + 补色，dry-run/断言/备份/`--apply`）、`scripts/scan-param-tags.mjs`（删覆盖表、重建标签时按 `group` 写色）、`scripts/check-canvas.mjs`（新增标签断言）。
- **数据**：`data/graph.json` 的 `meta.tags`——1 个 `name` + 25 个 `color`；节点与关系零改动（65 节点 / 59 关系不变），备份在 `data/graph.before-tag-colors.json`。
- **文档**：`README.md` 的命名规则段改写 + 新增类别配色表。
- **服务端**：零改动（`color` 早有 schema 与接口通道）。
- 不引入新依赖。前端改了所以要 `npm run build`；数据只改注册表、刷新页面即可见。
