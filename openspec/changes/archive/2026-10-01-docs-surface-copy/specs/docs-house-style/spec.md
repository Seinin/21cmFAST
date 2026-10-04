## ADDED Requirements

### Requirement: 表面文案只对读者说话

站点文档（`docs/notes/**`）、页面渲染字符串与注释、生成物里的散文 MUST NOT 出现只能对作者说的话：第二人称对话（`你` / `您` / `咱们`）、引用用户口径（`用户口径` / `用户明确` / `用户要求` / `你点名的` / `你说过的` / `按你说的`）、记账与施工痕迹（`本轮` / `本次变更` / `先记账` / `待补名单` / `只列不改` / `需你…` / `变更 \`某变更名\``）。

技术事实与状态（`未实现`、`本仓无此符号`、`代码不产出它`、`上一快照`）、规格用词（MUST / MUST NOT）、文献年份与数据快照日期 MUST 保留。白名单 MUST 逐条写明"为什么它是技术事实"，不写理由视为失败。

#### Scenario: 扫站点文档没有命中

- **WHEN** 对 `docs/notes/**` 跑 `npm run check:copy`
- **THEN** 0 命中；白名单里只有登记过并写明理由的技术事实词

#### Scenario: 页面文案与生成物同样干净

- **WHEN** 扫 `Graphify/src/**`（含 `src/generated/physics-chain.json`）
- **THEN** 0 命中；生成物里的散文与真源 `docs/notes/physics-chain/chain.json` 一致（改真源再生成，不手改生成物）

#### Scenario: 门禁拦得住

- **WHEN** 在任一表面文件里插入一句「用户口径 2026-10-01」
- **THEN** `check:copy` 失败并指出该文件与行号

### Requirement: 命名只由内容命名

文档文件名与标题 MUST 只由内容命名（对象 + 用途）。MUST NOT 含过程词（`PLAN` / `TODO` / `DRAFT` / `WIP` / `NOTES` / `DIGEST` / `备份` / `新版` / `最终` / `_plan`）或内部工具名（`deepwiki` / `docling` / `mcp`）；MUST NOT 是问句或口号。

#### Scenario: 改名后引用一致

- **WHEN** 文档改名
- **THEN** 目录文档、跨文档链接与真源 `docId` 全部指到新名（旧名除历史生成快照外 0 命中），且 `check:chain` 全绿

#### Scenario: 过程命名被拦

- **WHEN** 在 `docs/notes/**` 新建 `X_plan.md` 或 `NOTES.md`
- **THEN** `check:copy` 失败并给出该文件名

### Requirement: 口径变更记在过程工作区

口径变更与协作过程 MUST 记在过程工作区（`openspec/**` 与本仓的文档变更表 `docs/DIRECTORY.md`），MUST NOT 写进被读者读的正文与文件名。过程工作区自身不受「只对读者说话」约束。

#### Scenario: 记在该记的地方

- **WHEN** 用户改口径
- **THEN** 变更进 `openspec/changes/**`；`docs/DIRECTORY.md` 变更表只留日期 + 结论（去掉"用户：…"式引用）；站点文档正文不出现该口径的记账
