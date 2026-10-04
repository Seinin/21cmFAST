# 变更：文档表面不留对话痕迹

## Why

Graphify 站点与 `docs/notes/**` 是**给其他用户读的**，可现在里面混着只能对我说的话：「你点名的时刻会改变结果吗」「你说过的」「（用户口径 2026-10-01）」「本轮只列不改」「先记账，不自作主张」「变更 `graphify-chain-leaf-refs` 只交付框架」。

文件名也长出了过程词与内部工具痕迹：`physics-chain/PLAN.md`、`DEEPWIKI_21CMFAST_DIGEST.md`、`FDM_nebrin_mcrit_plan.md`、`FDM_code_migration_plan.md`。

这些话在对话里是必要的交接信息，摊到表面上就是废话：读者既不是"我"，也不关心我们第几步做到哪。根因不是某份文档的疏漏，而是**没有纪律**——每轮口径变更都把"用户口径 + 日期 + 变更名"写进正文与注释，于是表面越积越脏。

## What Changes

1. **立规则**（不是一次性清理）：`.codebuddy/rules/no-chatter-in-docs.md`（alwaysApply）——禁用类别、允许的技术事实、命名规范、落地门禁、过程工作区豁免，一次写死。
2. **清站点文档**：`docs/notes/**` 的第二人称、引用用户口径、记账与施工痕迹（7 份文档 ~14 处）；12 份模块骨架文档开头「变更 `…` 只交付框架」改成中性表述。
3. **清页面与仓库表面**：`Graphify/src/**` 13 处「（用户口径 2026-09-30 / 10-01）」类注释改成中性断言；`Graphify/README.md`、`Graphify/docs/DESIGN.md` 同类措辞同改；`docs/DIRECTORY.md` 的变更表去掉"用户：…"式引用与「应"…"之问」，保留日期与结论。
4. **真源与生成物**：`docs/notes/physics-chain/chain.json` 里会印在页面上的散文按新口径改写，重新生成 `Graphify/src/generated/physics-chain.json`（不手改生成物）。
5. **命名去过程词**：4 个文档改名 + 标题内容化，引用（`docs/DIRECTORY.md`、跨文档链接）同步。
6. **新门禁**：`Graphify/scripts/check-copy.mjs` + `npm run check:copy`——扫站点文档、页面文案、生成物与 `docs/notes` 文件名，命中即失败并指名文件与行；白名单显式登记技术事实词（`迷你晕`、`未实现`、`上一快照`…）并写明理由。

## Impact

- 新增能力规格 `docs-house-style`：三条要求（表面文案只对读者说话 / 命名只由内容命名 / 口径变更记在过程工作区）。
- 站点侧：`docs/notes/**`（7 份文档 + 12 份骨架）、`Graphify/src/**`（注释）、`Graphify/src/generated/physics-chain.json`、`Graphify/README.md`、`Graphify/docs/DESIGN.md`、`docs/DIRECTORY.md`。
- 命名：`physics-chain/PLAN.md` → `physics-chain/design.md`；`DEEPWIKI_21CMFAST_DIGEST.md` → `upstream-wiki-report.md`；`FDM_nebrin_mcrit_plan.md` → `FDM_nebrin_mcrit.md`；`FDM_code_migration_plan.md` → `FDM_code_migration.md`。
- 门禁：`Graphify/package.json` 新增 `check:copy`（独立脚本，`check:chain` 项数不变）。
- 不含 `openspec/**` 与 `.codebuddy/**`（过程工作区，规则里显式豁免）。

## Out of scope

- 不动技术内容、结论、数字与规格条款本身，只改措辞与命名。
- 不动 `docling-graph/outputs/**`（某次运行的历史快照，含旧文件名）。
- 「内部施工类文档是否整体移出站点文档库」不在本变更内（见 design D5）。
