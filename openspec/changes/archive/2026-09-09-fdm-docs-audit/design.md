## Context

动机见 `proposal.md - Why`。此处只记录决定实施方式的技术约束：

- **事实基准唯一**：Liu et al. 2025, PRD 112, 103534（PDF 在 `/mnt/c/Users/Administrator/Desktop/`）+ Liu 原始源码 `D:\v21cmFAST`（`/mnt/d/v21cmFAST`，v3.3.1，ps.c 4544 行）
- **禁止**用 `/home/dministrat/v21cmFAST` 核对——那是本仓库的重构版（commit `1945bf0`，ps.c 4423 行），已导致过一次错误结论
- **基线已固化**：git tag `baseline/pre-fdm` → `d8f67b76`（FDM 引入前最后一个提交，已验证 `FDM`/`m22`/`dndm_FDM`/`HMF_FINDEX` 零命中）
- **架构代差**：Liu 源码是 v3，本仓库是 v4，行号对比只在 v3 内部有效

## Goals / Non-Goals

**Goals:**

- 产出可追溯、可复算的裁决结论，消除两份 md 的矛盾
- 明确指出 fork 相对 Liu 论文 Eq.(5) 的偏离点
- 建立并固化 FDM 前基线，使后续审计可复现

**Non-Goals:**

- 不修复任何 FDM 物理偏离（本次不改 `thermochem.c` / `hmf.c` 数值逻辑）
- 不实现缺失的 FDM 冷却通道（`mcrit_noLW`、SM13）
- 不重新校准任何系数

## Decisions

### 决策 1：以论文原文为最高裁决依据，代码为次级证据

Liu 代码与论文存在不一致（代码缺 `f_FDM` 因子）。裁决时以论文 Eq.(3)(5) 为准，代码仅用于确认「实际实现了什么」。

*备选*：以代码为准。否决——论文阐述的是作者意图，且代码缺失很可能是实现遗漏（论文自称该 ansatz 是首次提出的核心创新）。

### 决策 2：裁定「条件 HMF 应保留 `f_FDM`」

依据 Eq.(3) 中 `f_FDM` 经 `(dn/dm)|_CDM` 项保留，且论文自述 $M\to\infty$ 时条件 HMF「reduces to Eq.(3)」——不含 `f_FDM` 则无法回归全局 FDM HMF。

`FDM_hmf_design.md` 的「破坏闭合关系」论据不成立：`f_FDM(M)` 仅依赖 $M$、不依赖 $\delta$，可提出 $\delta$ 平均之外，闭合严格成立。

### 决策 3：裁定「混合 σ 不是 bug」

`FDM_MCG_modeling.md` 附录 A.3 称 sigma1 用 CDM 表 / sigma2 用 FDM 表是 bug，**予以撤回**。这正是 Eq.(5) 分母 $\sigma^2_{\rm CDM}(m) - \sigma^2_{\rm FDM}(M)$ 的精确实现。

但正文方案 2「全 CDM σ + 事后乘 `f_FDM`」与 Eq.(5) 冲突——本仓库照此实施，导致 sigma2 退化为 $\sigma_{\rm CDM}(M)$。

### 决策 4：基线选 `d8f67b76`（FDM 前最后一个提交）而非 v4.1.1 官方 tag

`d8f67b76` 精确对应 FDM 引入边界，且已验证不含任何 FDM 内容。v4.1.1 官方（`d098e902`）虽纯净，但与其相差 40 个自有提交，无法隔离 FDM。

*备选*：用 `git worktree` 检出实体目录。作为可选补充，主方案用 tag（零成本、永久锚点）。

### 决策 5：修订时行号改为「函数名 + 路径 + 行号 + 基准标注」

防止重蹈「行号过时」误判。格式如 `ps.c:2240 (dNdM_conditional, v3.3.1, 4544 行版)`。

## Risks / Trade-offs

- **[风险] 论文 Eq.(5) 分子项 $\delta_{\rm FDM}$ 未逐点验证** → 缓解：审计报告中标注为「推断，待复核」，不作为裁决依据
- **[风险] `72df7832` 混入非 FDM 改动**（`indexing.c/h` 的 inline 整理、`IonisationBox.c` 的 R_MINI、`.gitignore`）→ 缓解：改动清单已分类，审计时排除这 4 个文件
- **[风险] 桌面存在 5 份 md 副本可能不同步** → 缓解：只改仓库内 `docs/`，报告中注明风险
- **[权衡] 只改文档不修代码** → fork 的 sigma2 偏离仍然存在，本次仅记录不修复，避免超出「审计」范围
