/**
 * 物理图谱（应用第三页）的数据访问与四路检索。
 *
 * 数据源 `src/generated/physics-map.json`（`npm run build:physics-map` 生成）：
 * 骨干 = atlas 的 16 个物理阶段，下钻 = 71 个子过程，208 个计算单元只作「实现落点」。
 *
 * 注意别与矩阵页的数据源混：那是 `src/generated/physics-graph.json`（`physicsMatrix.ts`），
 * 是"参数 × 过程"的格子表；本文件是"阶段 → 子过程 → 落点/参数/文献"的图谱。
 *
 * 这里只做纯函数换算：视图不解析文档、不读源码，所有事实都来自生成物。
 */

import raw from '../generated/physics-map.json'

export interface MapPlace {
  unit: string
  unitName: string
  symbol: string
  file: string
  line: number
  endLine: number | null
  fileWide: boolean
}

export interface MapProductRef {
  p: string
  name: string
  anchor: string
}

export interface MapQuestion {
  text: string
  target: string
  docId: string
  section: string
}

export interface MapUnitRef {
  e: string
  name: string
}

export interface MapSubprocess {
  id: string
  name: string
  stageId: string
  anchor: string
  summary: string
  inputs: MapProductRef[]
  output: { text: string; products: MapProductRef[] }
  params: string[]
  keyProcess: string[]
  keyQuantities: string[]
  units: MapPlace[]
  papers: string[]
  questions: MapQuestion[]
}

export interface MapStage {
  id: string
  name: string
  side: string
  anchor: string
  summary: string
  inputs: MapProductRef[]
  outputs: MapProductRef[]
  entryPoints: MapUnitRef[]
  subprocessIds: string[]
  params: string[]
  keyQuantities: string[]
  units: MapPlace[]
  papers: string[]
  questions: MapQuestion[]
  upstream: string[]
  downstream: string[]
}

export interface MapParam {
  name: string
  group: string
  docstring: string
  default: number | string | boolean | null
  log10: boolean
  range: { min: number | null; max: number | null } | null
  choices: string[] | null
  validatorText: string
  stages: string[]
  subprocesses: string[]
  papers: string[]
}

export interface MapPaperRef {
  file: string
  line: number
  text: string
  precision: 'line' | 'file'
  stageId: string | null
  subprocessId: string | null
}

export interface MapPaper {
  key: string
  label: string
  year: number
  venues: string[]
  refs: MapPaperRef[]
  stages: string[]
  params: string[]
}

export interface MapEdge {
  from: string
  to: string
  via: { p: string; name: string }
}

export interface PhysicsMapData {
  version: number
  stamp: string
  source: { atlas: string[]; inputsPy: string; note: string; files: string[]; citationsFrom: string[] }
  stats: Record<string, number>
  stages: MapStage[]
  subprocesses: MapSubprocess[]
  edges: MapEdge[]
  params: MapParam[]
  papers: MapPaper[]
  questions: MapQuestion[]
}

export const physicsMap = raw as unknown as PhysicsMapData

export const stageById = new Map(physicsMap.stages.map((stage) => [stage.id, stage]))
export const subprocessById = new Map(physicsMap.subprocesses.map((node) => [node.id, node]))
export const paramByName = new Map(physicsMap.params.map((param) => [param.name, param]))
export const paperByKey = new Map(physicsMap.papers.map((paper) => [paper.key, paper]))

export const subprocessesOfStage = (stageId: string) => physicsMap.subprocesses.filter((node) => node.stageId === stageId)

/** 某阶段的上下游边（标签就是产物名，沿用画布"产物写在边标签上"的读法） */
export const edgesOfStage = (stageId: string) => ({
  out: physicsMap.edges.filter((edge) => edge.from === stageId),
  in: physicsMap.edges.filter((edge) => edge.to === stageId),
})

/** 阶段按"侧"分两组：Python 侧（装配/编排/缓存/旁路/交界）与后端物理阶段 */
export function stageGroups(): { name: string; hint: string; stages: MapStage[] }[] {
  const python = physicsMap.stages.filter((stage) => /Python/.test(stage.side))
  const backend = physicsMap.stages.filter((stage) => !/Python/.test(stage.side))
  return [
    { name: 'Python 侧：装配与编排', hint: '参数怎么进来、三条流水线怎么排、结果存在哪', stages: python },
    { name: '后端：物理推进链', hint: '每个红移重复的计算主体（按物理顺序）', stages: backend },
  ].filter((group) => group.stages.length > 0)
}

export type Selection = { kind: 'stage' | 'subprocess' | 'param' | 'paper'; id: string }

/** 文档锚点 → 选择项：问句表里那些"我想知道…"要能落到对应节点上 */
const anchorToSelection = new Map<string, Selection>()
for (const stage of physicsMap.stages) anchorToSelection.set(stage.anchor, { kind: 'stage', id: stage.id })
for (const node of physicsMap.subprocesses) anchorToSelection.set(node.anchor, { kind: 'subprocess', id: node.id })

export interface SearchHit {
  kind: 'process' | 'subprocess' | 'param' | 'quantity' | 'paper' | 'question'
  label: string
  detail: string
  selection: Selection
}

const KIND_ORDER: SearchHit['kind'][] = ['process', 'subprocess', 'param', 'quantity', 'paper', 'question']

/** 参数一行看全：默认值 + 存储尺度 + 范围（都来自源码，缺就不写） */
export function describeParam(param: MapParam): string {
  const parts: string[] = []
  if (param.default !== null) parts.push(`默认 ${param.default}`)
  if (param.log10) parts.push('log10 存储')
  const range = formatRange(param)
  if (range) parts.push(range)
  if (param.choices?.length) parts.push(`${param.choices.length} 个选项`)
  return parts.join(' · ') || '源码未写默认值'
}

/** 范围：优先用解析出的 min/max，缺一边时退回校验器原文（不猜） */
export function formatRange(param: MapParam): string {
  if (param.range) {
    const { min, max } = param.range
    if (min !== null && max !== null) return `范围 [${min}, ${max}]`
    if (min !== null) return `下界 ${min}`
    if (max !== null) return `上界 ${max}`
  }
  return param.validatorText ? `约束 ${param.validatorText}` : ''
}

/**
 * 四路检索：参数、物理量（关键量）、过程名（阶段/子过程 + atlas 的"我想知道…"问句）、论文。
 * 全部在已加载的生成物里做内存匹配——不新增任何运行时请求。
 */
export function searchPhysicsMap(query: string, limit = 40): SearchHit[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return []
  const scored: { hit: SearchHit; score: number }[] = []
  const seen = new Set<string>()

  const add = (hit: SearchHit, haystack: string[]) => {
    const lowered = haystack.map((text) => String(text ?? '').toLowerCase())
    if (!lowered.some((text) => text.includes(keyword))) return
    const key = `${hit.kind}|${hit.label}|${hit.selection.kind}|${hit.selection.id}`
    if (seen.has(key)) return
    seen.add(key)
    scored.push({ hit, score: lowered.some((text) => text.startsWith(keyword)) ? 0 : 1 })
  }

  for (const stage of physicsMap.stages) {
    add({ kind: 'process', label: `${stage.id} ${stage.name}`, detail: stage.summary, selection: { kind: 'stage', id: stage.id } }, [stage.id, stage.name])
  }
  for (const node of physicsMap.subprocesses) {
    add({ kind: 'subprocess', label: `${node.id} ${node.name}`, detail: node.summary, selection: { kind: 'subprocess', id: node.id } }, [node.id, node.name])
  }
  for (const param of physicsMap.params) {
    add(
      { kind: 'param', label: param.name, detail: describeParam(param), selection: { kind: 'param', id: param.name } },
      [param.name, param.group, param.docstring],
    )
  }
  for (const node of physicsMap.subprocesses) {
    for (const quantity of node.keyQuantities) {
      add({ kind: 'quantity', label: quantity, detail: `${node.id} ${node.name}`, selection: { kind: 'subprocess', id: node.id } }, [quantity])
    }
  }
  for (const paper of physicsMap.papers) {
    add(
      {
        kind: 'paper',
        label: paper.label,
        detail: `${paper.year}${paper.venues.length ? ` · ${paper.venues.join(' / ')}` : ''} · ${paper.refs.length} 处引用`,
        selection: { kind: 'paper', id: paper.key },
      },
      [paper.label, paper.key, String(paper.year), ...paper.venues, ...paper.refs.map((ref) => ref.file)],
    )
  }
  for (const question of physicsMap.questions) {
    const selection = anchorToSelection.get(question.target)
    if (!selection) continue
    add({ kind: 'question', label: question.text, detail: question.section, selection }, [question.text])
  }

  return scored
    .sort(
      (left, right) =>
        left.score - right.score ||
        KIND_ORDER.indexOf(left.hit.kind) - KIND_ORDER.indexOf(right.hit.kind) ||
        left.hit.label.localeCompare(right.hit.label),
    )
    .slice(0, limit)
    .map((item) => item.hit)
}
