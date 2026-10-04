# 任务：docs-surface-copy

## 1 规则与脚手架

- [x] 1.1 建规则 `.codebuddy/rules/no-chatter-in-docs.md`（alwaysApply：禁话类别 / 允许的技术事实 / 命名规范 / `check:copy` 落地 / 过程工作区豁免）。验证：frontmatter `alwaysApply: true`，四节齐（不许出现 / 允许 / 命名 / 落地）
- [x] 1.2 写本变更 proposal / design / tasks 与能力 delta spec。验证：`openspec validate docs-surface-copy` valid=true

## 2 站点文档清话（`docs/notes`）

- [x] 2.1 `THREE_PIPELINES.md`：「交给你」「每个你关心的时刻」「你点名的时刻」→ 中性（对外交付 / 选定的时刻）
- [x] 2.2 `upstream-wiki-report.md`（改名后）：同口径改写
- [x] 2.3 `atlas/README.md` 表头「你的目的」→「目标」
- [x] 2.4 `FDM.md`：「你复现论文上游图时」「本次不修复任何偏离」
- [x] 2.5 `ACG_MCG_dataflow.md`「先给你一张全景」、`INITIAL_CONDITIONS.md`「若你以为…」、`FDM_mcrit_report.md`「要求你**自己算**」、`FDM_baryon_density_review.md`「张力与未决」→「张力与开放问题」
- [x] 2.6 `physics-chain/README.md`：「本轮不管（用户 2026-09-29 定）」「待补名单为空」
- [x] 2.7 `graphify/G0–G4`：G4 开篇「口径转换的补记」「旧口径」「（2026-09-30 起，用户口径：…）」、G4 §七「先记账，不自作主张」、G0 同类、G1/G3「（本轮只列不改）」
- [x] 2.8 12 份 `physics-chain/modules/*.md` 第 3 行「变更 `graphify-chain-leaf-refs` 只交付框架」→ 中性表述（自检的骨架形状断言只看标题层级，安全）
- [x] 2.9 验证：`cd Graphify && npm run check:copy` 通过（禁用措辞 0 命中）

## 3 页面与仓库表面

- [x] 3.1 `Graphify/src/**` 13 处「（用户口径 YYYY-MM-DD）」→ 中性断言（只改措辞，不改断言语义）
- [x] 3.2 `Graphify/README.md`、`Graphify/docs/DESIGN.md` 同类措辞同改
- [x] 3.3 `docs/DIRECTORY.md`：变更表去掉"用户：…"式引用与「应"…"之问」，保留日期 + 结论；文档清单里的命名同步
- [x] 3.4 真源 `chain.json` 散文按新口径改写并重新生成（生成器幂等）

## 4 命名去过程词

- [x] 4.1 四个文件改名 + 标题内容化（D3 清单）：`PLAN.md`→`design.md`、`DEEPWIKI_21CMFAST_DIGEST.md`→`upstream-wiki-report.md`、`FDM_nebrin_mcrit_plan.md`→`FDM_nebrin_mcrit.md`、`FDM_code_migration_plan.md`→`FDM_code_migration.md`
- [x] 4.2 引用同步：`docs/DIRECTORY.md`、跨文档链接、`docId`、`Graphify/data`。验证：旧名在仓库 0 命中（`docling-graph/outputs/**` 与 `Graphify/attic/**` 除外）
- [x] 4.3 验证：`check:chain` 全绿（含"笔记引用的文档真实存在且锚点能定位"）

## 5 门禁

- [x] 5.1 `Graphify/scripts/check-copy.mjs` + `package.json` 的 `check:copy`
- [x] 5.2 反面演练：临时插「用户口径 2026-10-01 / 本轮只列不改」→ 失败并指名三类命中（`docs/notes/_drill_tmp.md:3`）；删掉 → 绿
- [x] 5.3 命名检查：临时建 `docs/notes/X_plan.md` → 失败（命中 `/plan/` 与 `/_plan/`）

## 6 收口

- [x] 6.1 全门禁：`check:copy`、`check:chain`、`check:tabs`、`tsc -b`、`eslint`、`build`
- [x] 6.2 `openspec validate docs-surface-copy` valid=true
