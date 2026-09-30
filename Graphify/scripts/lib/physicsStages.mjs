/**
 * 「物理链」页的分层口径——**只此一份**。
 *
 * 生成器（`build-physics-chain.mjs`）与自检（`check-physics-chain.mjs`）都 import 这里；
 * 视图只读生成物里的分层标记（过程框的 `chain`、旁路节点的话题 `topic:bypass`），不写死阶段号。
 *
 * 判据出处（不新造）：
 *   · atlas L1（`docs/notes/atlas/L1-stages.md`）：S01 参数装配与模板 / S02 驱动编排 /
 *     S03 缓存与持久化 / S04 旁路与后处理接口 / S05 后端桥与全局前置 / S06 输入与全局配置 /
 *     S07 宇宙学背景 / S08 质量函数与统计工具 …（历史口径：S07 起才是物理）。
 *   · 真源 `docs/notes/physics-chain/chain.json` 里**实际出现**的阶段（各量的 `codeHints`）：
 *     S04 / S07 / S08 / S12 / S13 / S14 / S15。
 *
 * 两个名单分开：
 *   · `PHYSICS_CHAIN_STAGES`＝物理主链（一级只讲它们）。S09/S10/S11 在真源里**还没有量**，
 *     等有内容再加进来：自检两边都拦——名单里写了真源没有的阶段、或真源冒出没登记的阶段。
 *   · `BYPASS_STAGES`＝旁路 / 诊断出口（算完顺手给出的诊断，不在主链上），默认收起。
 */

/** 物理主链阶段：一级（默认可见）只讲这些过程 */
export const PHYSICS_CHAIN_STAGES = ['S07', 'S08', 'S12', 'S13', 'S14', 'S15']

/** 旁路 / 诊断出口阶段：不属于主链，默认收起 */
export const BYPASS_STAGES = ['S04']

/** 层的取值（过程框的 `chain` 只能是这两个之一） */
export const STAGE_LAYERS = ['main', 'bypass']

const MAIN = new Set(PHYSICS_CHAIN_STAGES)
const BYPASS = new Set(BYPASS_STAGES)

/** `codeHints`（如 `['S12.1']`）→ 阶段号（`S12`）；没有 hint 给空串（驱动量不属于任何过程） */
export const stageOfHint = (hints) => String((Array.isArray(hints) ? hints[0] : hints) ?? '').split('.')[0]

/** 阶段 → 层：`main` / `bypass` / `unknown`（未登记，自检会报） */
export const stageLayerOf = (stage) => (BYPASS.has(stage) ? 'bypass' : MAIN.has(stage) ? 'main' : 'unknown')

/** 这个节点的 `codeHints` 是否落在旁路阶段——与图上 `tag:旁路出口` 同源判据 */
export const isBypassHint = (hints) => stageLayerOf(stageOfHint(hints)) === 'bypass'

/** 层的显示名（自检信息与页面话术共用一份） */
export const LAYER_LABELS = { main: '物理链', bypass: '旁路与实现细节', unknown: '未分层' }

/** 话题 id：页面**默认把注册表里的话题全部关掉**，收起的东西一键展开 */
export const IMPL_TOPIC_ID = 'topic:impl'
export const BYPASS_TOPIC_ID = 'topic:bypass'
