## Context

见 proposal.md 的 Why。与做法相关的现状（已逐处核对）：

- **配色有单一来源的先例**：`src/graph/palette.ts` 集中定义画布用色（`NODE_TYPE_COLORS` 的映射在 `src/lib/types.ts`），全文件都是"一行注释 + 一行 `export const`"，没有任何透明度合成助手。
- **`TagDefinition` 早有两个字段**：`group`（分类，值就是 `inputs.py` 里 `InputStruct` 的子类名，顶栏弹层按它分组）与 `color`（注释写着"预留：标签主色。当前画布红点用固定色"，25 个标签**一个都没填、前端无处消费**）。服务端 `schema.mjs` / `routes/graph.mjs` 早已校验并接受 `#RRGGBB`（`createTag` / `updateTag` 都带这个通道）。
- **右侧面板的标签三处渲染**都在 `src/components/NodeTags.tsx`：`NodeTagEditor` 的已选 chips 与选择器弹层、`NodeTagSection` 的标签行；明细块按「用法」（赋值/入公式/开关）分组，与类别是正交维度。
- **`NodeTags.tsx` 只被 `Inspector.tsx` 用**；顶栏参数弹层是自己渲染的（`TopBar.tsx`），两者不共享组件，所以"只改右侧面板"在代码上是隔离的。
- **四个标签相关脚本都不会剥掉 `color`**：`prune-tags` / `normalize-tag-rules` / `classify-params` 都是"原地改自己的字段"，`migrate-global-tags` 只对**新登记**的标签构造对象。
- **`check-canvas.mjs` 的"真实数据"段**：读 `data/graph.json` 后逐条 `styleCheck`；它已经用 esbuild 把 TS 模块打包成临时 `.mjs` 再 import（`load(entry, name)`），所以能直接把 `palette.ts` 载进来做断言。清理段列了 `.check-*.mjs`，新增包名要记得加一行。

## Goals / Non-Goals

**Goals:**

- 面板里"这是哪一类标签"一眼可辨：同类同色、异类异色，且不与出处链接的青色、画布红点的玫红混淆。
- 命名口径回到"一律用原变量名"，且重跑扫描脚本不会把中文名带回来。
- 配色只有一处"意图来源"（表），数据里的 `color` 是它 seed 出来的默认值，两处漂移能被自检抓住。

**Non-Goals:**

- 不改画布：红点仍是固定玫红、仍只显示第一个命中的标签；`node.tagged` 的柔光底色不动（用户明确"画布不区分"）。
- 不改顶栏参数弹层（本次范围只有右侧面板）。
- 不给标签做"每类一个可配置的颜色选择器"——类别色是常量表，不是用户可编辑的设置。

## Decisions

**D1：行内 CSS 变量 + 静态类名，不拼 Tailwind 类名。**
Tailwind 只认**静态**类名：`text-${accent}` 这种拼接构建时会被丢掉，而且不报错、线上就是没颜色。做法是把类名写成固定的 `text-[var(--tag-accent)]` / `bg-[var(--tag-accent-8)]` 这类**任意值**（字面量，能被扫描到），真正的色值由 `style` 里的自定义属性带进来（`accentVars(accent)` 生成 6 个变量：本体 + 70%/25%/20%/8%/4% 透明度）。构建后已确认这 6 个 `var(--tag-accent-*)` 都出现在产物 CSS 里。

**D2：两张同值表 + 一条断言，而不是让脚本去读 TS。**
前端渲染用 `src/graph/palette.ts` 的 `TAG_GROUP_COLORS`；脚本（`.mjs`，直接 import 不了 TS）用 `scripts/lib/tag-groups.mjs` 里的同值表。为防漂移，`check-canvas.mjs` 载入 `palette.ts` 后断言真实数据里每个标签的 `color` 等于其 `group` 的表值。备选方案（给 palette 配一个 `.mjs` 孪生文件让前端反过来 import）会把 build 的依赖面搞乱，不采用。

**D3：面板按 `tagAccentOf` 取色，`color` 优先、`group` 兜底。**
`color` 优先是为了留出"单独调某一个标签"的口子（服务端接口早就支持），缺省按 `group` 派生让新建标签自动有色。

**D4：seed 走独立的一次性脚本 `scripts/color-tags.mjs`，而不是只改 `scan-param-tags.mjs`。**
扫描脚本只在"参数标签"的范围内重建注册表；本次要动的是**注册表里的既有数据**（改名 + 补色），且要能在不跑扫描的前提下一次做完。脚本沿用迁移脚本的既有约定：dry-run 默认、写前备份（`data/graph.before-tag-colors.json`）、原子写、`tryParseGraph` 校验、幂等。同时 `scan-param-tags.mjs` 也按表写色，保证下次重跑不会把色丢掉或写歪。

**D5：断言里区分"被管的标签"与"用户自建的标签"。**
`group` 在配色表里的（即扫描出来的参数标签）要求 **`color` 严格等于表值、名字里没有中文**；其余（用户在界面上自建的，没有 `group`）只要求"要么没有 `color`、要么等于未分类兜底色"。这样既钉住了 seed 的一致性，又不会因为用户合法地新建一个中文名标签而让 `check:canvas` 失败。想单独给某个**被管**标签调色时，得先把它从这条口径里排除（改 `group` 或改表），避免断言空转。

## Risks / Trade-offs

- [Tailwind 动态类名] 见 D1；已在构建产物里核对过 `var(--tag-accent-*)` 确实生成。
- [两表漂移] 见 D2；断言直接失败而不是悄悄不一致，README 也写明"改配色时两张表一起改"。
- [用户自建标签被误伤] 见 D5 的白名单口径。
- [误改画布] `TAG_DOT_COLOR` / `styles.ts` 的 underlay / `GraphCanvas` 的徽标都不碰，并新增一条断言盯住红点常量。
- [数据与浏览器不同步] 数据只改注册表，但**前端改了要 `npm run build`**（服务端只托管 `dist/`），页面刷新才看得到新配色；`dist/` 是构建产物，无需入版本库。

## Migration Plan

1. palette 加表与助手 → 面板三处上色（行内 CSS 变量）→ `tsc` + `build`（确认任意值类名进了 CSS）。
2. `scripts/lib/tag-groups.mjs` + `scripts/color-tags.mjs`；dry-run 核对（1 改名 / 25 补色）→ `--apply`（写前备份 + schema 校验）→ 幂等复跑。
3. `scan-param-tags.mjs` 删覆盖表 + 两处按 `group` 写色；`types.ts` 两个字段注释改写；README 命名规则段与配色表。
4. `check-canvas.mjs` 新增标签断言（真实数据段 + 清理新增的 `.check-palette.mjs`）。
5. 验证：`npx tsc -b`、`npm run lint`、`npm run build`、`timeout 150 npm run check:canvas`、`npm run check:styles`、`npm run check:code` + Windows 侧无头 Edge 探针（面板出现 ≥2 种类别色且都来自表、选择器里无中文且能看到 `BOX_LEN`、勾选标签后画布红点仍是 `#E11D48`）。
6. 归档（`skip_specs`，口径落 README）；确认 `validate --specs --strict` 全绿、未归档的 `graphify-global-tags` 未被触碰。

回滚：`data/graph.before-tag-colors.json`；代码为新增常量与改 class，`git` 可回退（若该目录已纳入版本控制）。
