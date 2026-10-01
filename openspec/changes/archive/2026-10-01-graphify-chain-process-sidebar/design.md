## Context

见 `proposal.md` 的 Why。落地前必须交代的现状与约束：

- 真源 `docs/notes/physics-chain/chain.json` 顶层键：`version, note, sources, drivers, nodes, blocks, edges, params, degeneracies, algorithms, algorithmPending, feedback`——**没有** `processes`。
- 现真源一级共 12 块（10 个代码模块 + 2 个层）：`block:cosmo` M1 / `block:initial` M2 / `block:grav` M3 / `block:halocat` M4 / `block:galaxy` M5 / `block:halobox` M6 / `block:xray` M7 / `block:thermal` M8 / `block:ionization` M9 / `block:obs` M10 / `block:const` L0 / `block:kernel` L1。成员总量：23 个 node + 5 个 driver（`fstar` / `zeta` / `tvir_min` / `lx` / `k_target`）。
- **旧稿的「天体物理过程」划分仍全文在仓库里**：`docs/notes/physics-chain/chain.json.bak-20260930` 的 `blocks.items`。其 `note` 写明口径：**一个过程 = 一组按等式串起来的量，能独立读懂**；`kind: process` 是过程（块内连通），`kind: band` 是带（成员间无块内边，进不去子图）。
- `graphify-chain-code-modules`（in-progress）已把一级换成代码模块口径，但**没有**把过程清单另存为一条平行的数据。
- 左栏现在只有一个面：`ChainSearchPanel.tsx` 的参数词条（分组名取生成物 `param.group`），并在同一处渲染了跨分组的「N 个代码类」总计数徽标。
- 本页检索已是四路（`physicsChain.ts`：参数 / 物理量 / 过程名 / 论文出处），`param.paper` 字段与「文献」那一路的聚合已经存在，本变更**复用**它、不新建论文索引。

## Goals / Non-Goals

**Goals:**

- 把旧稿的「天体物理过程」轴复活成**左栏的一个检索面**，与参数面构成矩阵；过程清单有单一真源、可被自检钉住。
- 8 条过程的成员的并集覆盖"旧划分当时就有"的全部量；覆盖不到的项**显式收纳**而不是硬凑归属。

**Non-Goals:**

- 不改一级划分（仍按代码模块），不把过程面当成第三条一级轴。
- 不改本页检索的四路口径、状态条口径、画布页任何行为。
- 不替旧划分覆盖不到的量编造过程名；不给过程起圆圈数字编号。

## Decisions

### D1. 过程清单落在真源 `processes`，逐条转录自旧稿

**定：** 真源新增 `processes`（`processes.note` 记口径与转录来源；`processes.items` 一条 = 一个过程/带）。转录来源是 `chain.json.bak-20260930` 的 `blocks.items`，成员 id 沿用**现真源**的 id（已逐条核对，8 条过程 + 2 条带的成员全部存在于现真源）。

成员划分（转录结果）：

| 过程 / 带 | 种类 | 成员 | 主块 |
| --- | --- | --- | --- |
| 暗物质晕质量函数 | process | `hmf_impl`, `dn_dm` | M4 |
| 晕质量阈值 | process | `tvir_min`, `mmin` | M4 |
| 星系形成与源项 | process | `scaling_relations`, `rho_star`, `source_grid` | M5 / M6 |
| 电离史 | process | `zeta`, `nion`, `q_hii` | M6 / M9 |
| 气体热史 | process | `lx`, `eps_heat`, `tk` | M8 |
| Lyα 耦合 | process | `jalpha`, `xalpha` | M8 |
| 自旋温度 | process | `xc`, `ts` | M8 |
| 亮温方程 | process | `dtb` | M10 |
| 环境与给定 | band | `tgamma`, `fstar`, `k_target` | L0 |
| 观测量 | band | `p21`, `phi_uv`, `tau_e` | M10 / M5 |

**为什么不是另外两条路：**

- 从现有一级块（M1…M10）推导 → 得不出 `Lyα 耦合`，它已被并进 `M8`；而用户点名的就是它。
- 从现有 `algorithms`（60 条）推导 → 键是量 / 边，不是过程；且 60 条里只有 1 条提到年份或 arXiv，推不出过程名与论文归属。
- 视图里写死这 8 条 → 违反本页「MUST 按生成物渲染、MUST NOT 写死名单」的既有纪律。

### D2. 两条轴并存，过程 → 主块是多对一

过程面与一级（代码模块）**不是同一层**，且映射是多对一：`气体热史` / `Lyα 耦合` / `自旋温度` 三个过程同属 `M8`。点过程 → 定位到它的**主块**并选中；过程名 MUST NOT 用 `M*` 形式，也 MUST NOT 再引入圆圈数字（同屏已有三套 `⓪`…`⑨`，代码模块块已改用 `M1`…`M10` 正是为此）。

### D3. 覆盖不到的 4 条量进兜底小节，不编过程名

8 条过程 + 2 条带的成员并集 = 24 个 id，而现真源有 28 个（23 node + 5 driver）。差的 4 条是 `matter_power`（M1）、`vcb`（M2）、`perturb_field`（M3）、`filtered_xray`（M7）——它们出生在旧稿之后的新代码模块里。

**定：** 不替它们编过程名（本仓「不凭印象补」纪律），改为过程面里一个常驻、默认收起的兜底小节承载；自检断言「8 过程 + 2 带 + 兜底小节」的并集恰好等于全部 23 个量 + 5 个驱动量，且无重复。这样缺口是**显示出来的**而不是被合并粉饰掉的。

**备选（否决）：** 把它们硬塞进最贴近的过程（`filtered_xray` → 气体热史，其余 → 环境与给定）——物理上说得通，但等于我替用户定归属，且会让「旧划分追不上代码新模块」这个事实从数据里消失。

### D4. 矩阵口径复用 `paramMatrix`，不另造归属表

过程 → 参数 = 过程成员量 →（既有「参数 × 节点矩阵」）→ 参数。反方向同理。自检对拍两侧结果，保证只有一份归属。

### D5. 删「N 个代码类」徽标无契约代价

`graphify-chain-param-sidebar` 的 ADDED 要求只写「分组与词条 MUST 给出条数」，没有要求跨分组总计数；主 spec 的条数要求落在状态条（物理过程数 / 子过程数 / 参数数 / 文献数），与这个徽标无关。故删除它属实现细节，不需要改任何既有要求。

### D6. 不重复修改「本页检索与来源标注」

`graphify-chain-param-sidebar`（in-progress，13/14）已 MODIFIED 那条要求。本变更**只 ADD 新要求**，不改动同一条，避免两份 delta 互相覆盖。本变更因此**依赖它先归档**：否则「参数面（按代码类名分组的参数词条）」在主 spec 里尚无依据。

**实施时实测（2026-10-01）：** `openspec list --json` 显示 `graphify-chain-param-sidebar` 仍在 `openspec/changes/` 下（13/14）、`openspec/changes/archive/` 里没有它——即**尚未归档**。故本变更的代码可以照常落地（只 ADD、不碰那条 MODIFIED，互不覆盖），但**归档顺序上它必须先、本变更在后**：它归档前，主 spec 里没有「参数面（按代码类名分组的词条）」这条要求，先归档本变更会让主 spec 短暂出现「过程面引用了尚未并入的参数面」的空档（功能不受影响，只是文档链的顺序问题）。

## Risks / Trade-offs

- [过程名与一级块名同屏出现，可能被误读成有两套一级] → 过程面标题写明「过程 = 按论文等式打包，不是一级的代码模块」；过程名一律不用 `M*`、不编号。
- [旧划分的成员并集追不上代码新模块，兜底小节会长期存在] → 这是有意暴露的缺口；真源 `processes.note` 写明来源与这一事实，自检钉住并集。
- [过程 → 参数反查可能为空] → UI 显式写「无」，不允许静默空面板。
- [两个 in-progress 变更并行（code-modules / param-sidebar）] → 本变更不动一级划分、不动检索要求，冲突面只剩生成器与左栏组件；实施前先确认那两个变更的 tasks 状态。

## Migration Plan

1. 真源先加 `processes`（增量字段，不动任何既有键）→ 重新生成，生成物多一个 `processes` 键，既有读法不受影响。
2. 自检先加「不重不漏」「成员悬空」「不吃 order」三条断言，跑 `npm run check:chain` 全绿后再改视图。
3. 视图：先加页签与过程词条、再删徽标，最后接矩阵反查。
4. 回滚：删真源 `processes` 与生成物同名字段、移除页签与兜底小节、补回徽标即可；不涉及 C / Python，不需重建扩展。

## Open Questions

- `filtered_xray`（X 射线加热）是否要从「气体热史」里单列成一条过程？用户点名过「X 射线」，但旧稿把它算在气体热史里。本轮**不单列**、不替它起名。
- M1/M2/M3 三个新代码模块（`matter_power` / `vcb` / `perturb_field`）是否各起一条过程名？本轮进兜底小节。
