> 本变更 `skip_specs: true`（外观 + 命名口径，无新行为契约），因此没有 `specs/` 目录；口径落在 README。

## 1. 配色与面板

- [x] 1.1 `src/graph/palette.ts` 增 `TAG_GROUP_COLORS`（四类：`MatterOptions` `#1D4ED8` / `SimulationOptions` `#047857` / `AstroOptions` `#B45309` / `AstroParams` `#7E22CE`）、`TAG_GROUP_FALLBACK_COLOR`（未分类 `#4B5563`）、`tagAccentOf(tag)`（`color` → `group` → 兜底）与 `withAlpha(hex, alpha)`；`TAG_DOT_COLOR` 等画布常量原样不动 — 验证：`npx tsc -b` 通过
- [x] 1.2 `src/components/NodeTags.tsx` 三处按类别上色（已选 chips / 选择器勾选框与候选名 / 标签行的边框·淡底·图标·名称），用 `accentVars()` 注入 6 个 CSS 变量、类名保持静态；明细块、计数、展开箭头、行分隔线与「＋标签」入口保持中性 — 验证：`npm run build` 后 `grep -o "var(--tag-accent[^)]*)" dist/assets/*.css` 六个变量类名齐全（Tailwind 动态类名坑已绕开）

## 2. 数据与脚本

- [x] 2.1 `scripts/lib/tag-groups.mjs`（脚本侧同值表 + `tagColorOf`）与 `scripts/color-tags.mjs`（一次性：`tag:BOX_LEN` 改名 + 按 `group` 补色；dry-run 默认 + 断言 + 写前备份 + 原子写 + `tryParseGraph` + 幂等）— 验证：dry-run 报"改名 1 个 · 补色 25 个"，`--apply` 后 `meta.tags` 25 个都有 `color`、无中文名，再跑报"无需改动"
- [x] 2.2 `scripts/scan-param-tags.mjs` 删掉 `NAME_OVERRIDES`（显示名即变量名），新建与重建标签两处都按 `group` 写 `color` — 验证：`grep -n "NAME_OVERRIDES\|盒子共动边长" scripts/*.mjs` 无命中
- [x] 2.3 `src/lib/types.ts` 的 `TagDefinition.color` / `group` 注释改写（`color` 从"预留"改为"右侧面板按它上色；缺省按 group 派生；与表值一致性由 check:canvas 断言"）；README 命名规则段改为"一律用原变量名"并加类别配色表 — 验证：`grep -n "盒子共动边长" README.md` 只出现在"已撤销"的历史说明里

## 3. 漂移守卫

- [x] 3.1 `scripts/check-canvas.mjs` 的"真实数据"段新增：被管的标签（`group` 在表里）`color` 严格等于表值、名字无中文；非被管标签要么没色要么等于兜底色；`tag:BOX_LEN` 的 `name === 'BOX_LEN'`；`TAG_DOT_COLOR` 仍为 `#E11D48`；并清理新增的 `data/.check-palette.mjs` — 验证：`timeout 150 npm run check:canvas` 四项新断言全绿、`data/.check-*` 无残留

## 4. 验证

- [x] 4.1 跑 `npx tsc -b`、`npm run lint`、`npm run build`、`timeout 150 npm run check:canvas`、`npm run check:styles`、`npm run check:code` — 验证：全绿（lint 仅剩 2 条既有警告）
- [x] 4.2 Windows 侧无头 Edge 探针实测：面板里出现 ≥2 种类别色且都来自配色表、每个标签的 `color` 等于其类别表值、选择器候选名无中文且能看到 `BOX_LEN`、勾选标签后画布红点仍是 `rgb(225, 29, 72)` — 验证：探针 14 项断言全过；探针文件已删、无残留 `msedge.exe`

## 5. 归档

- [x] 5.1 归档本变更（`skip_specs`，不产生 spec 改动）— 验证：`openspec list` 不再出现它；`openspec validate --specs --strict` 仍全绿；未归档的 `graphify-global-tags` 未被触碰
