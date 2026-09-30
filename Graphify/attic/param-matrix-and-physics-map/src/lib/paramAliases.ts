import aliasData from './paramAliases.json'

/**
 * 天体物理参数的**中文物理名**（显示层命名，不进生成物）。
 *
 * 数据在 `paramAliases.json`（前端与 `npm run check:physics` 共用同一份，避免两处抄写）：
 *   · 为什么不写进 `src/generated/physics-graph.json`：那份生成物的契约是"完全由 atlas 文档与源码推导、
 *     内容哈希戳记、可幂等重跑"；中文名是**命名**（不是解释），属于界面层。
 *   · 为免变成"无据的手写"，每条都强制带 `source`（源码行号或文档锚点），自检会断言齐全。
 *   · 命名取自源码 docstring 里的物理说法，不是另造术语；`R_MAX_TS` / `N_STEP_TS` /
 *     `PHOTONCONS_CALIBRATION_END` 三个源码没写 docstring，依据落在它们真正被用到的那行代码 / 文档伪代码上。
 */
export interface ParamAlias {
  tagId: string
  /** 中文物理名（短名，行内单行显示用；完整依据在 tooltip 里） */
  short: string
  /** 依据：`文件:行` 或 `文档#锚点` */
  source: string
}

export const PARAM_ALIASES: ParamAlias[] = aliasData

const BY_TAG = new Map(PARAM_ALIASES.map((alias) => [alias.tagId, alias]))

/** 取某个参数的中文物理名（没有就返回 null，界面据此退化只显示变量名） */
export function aliasOf(tagId: string): ParamAlias | null {
  return BY_TAG.get(tagId) ?? null
}
