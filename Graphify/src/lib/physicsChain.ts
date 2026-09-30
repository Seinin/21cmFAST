/**
 * 物理链的数据层：把 `src/generated/physics-chain.json` 读成视图要用的形状。
 *
 * 口径来自 `docs/notes/physics-chain/README.md`（账本），本文件只做**取数与规则编码**，不做判断：
 *   · **层级**（layer）：表面 / 子图 —— 表面只放物理（公式、物理量、谱、函数、过程），
 *     工程实现与实现选择沉到它所属节点的子图里；**子图不是"工程的去处"**，里面也可以再是物理。
 *   · **种类**（kind）：物理量 / 谱 / 函数 / 过程 / 工程项 —— 颜色按它分。
 *   · **观测量**（observable）：不占颜色，视图上用重边框表示（`δT_b` 既是量又是出口，一个节点只能有一种颜色）。
 *   · **开关**：挂在**边**上（虚线箭头 + 箭头上的虚线框）；`gatesEdges` 里的 `from->to` 就是它门控的边。
 */
import raw from '../generated/physics-chain.json'
import type { Graph } from './types'

export type NodeKind = 'quantity' | 'spectrum' | 'function' | 'process' | 'engineering' | 'driver'
export type NodeLayer = 'surface' | 'subgraph'

export interface ChainNature {
  type?: string
  homogeneity?: string
  coupling?: string
  nonlocal?: string
  degenerate?: string
}

export interface CodeSite {
  file: string
  line: number
  endLine?: number
  symbol?: string
  unit?: string
  unitName?: string
  fileWide?: boolean
}

export interface ChainChoice {
  name: string
  desc: string
}

export interface ChainNode {
  id: string
  symbol: string
  name: string
  kind: NodeKind
  layer?: NodeLayer
  parent?: string
  parentNote?: string
  observable?: boolean
  eq?: string
  page?: number
  formula?: string
  dependsOn?: string[]
  nature?: ChainNature
  sections?: string[]
  codeHints?: string[]
  code?: { count: number; sites: CodeSite[] }
  choices?: ChainChoice[]
  theory?: string
  surfaceNote?: string
  implementedAs?: string
  reviewSection?: string
}

export interface ChainEdge {
  from: string
  to: string
  eq?: string
  page?: number
  note?: string
}

export interface ChainParam {
  name: string
  pl2012?: string
  role?: string
  default?: unknown
  log10?: boolean
  range?: [number | null, number | null] | null
  paper?: string
  switch?: boolean
  gatesEdges?: string[]
  basis?: string
  inCode?: boolean
  group?: string
  choices?: string[]
}

export interface ChainAlgorithm {
  how: string
  when: string
  discretization: string
  where: string
}

/** 生成物里与画布同形状的那份图（视图、顶栏检索、来源标注都读它） */
interface ChainGraphNode {
  id: string
  label: string
  type: string
  summary?: string
  parent?: string
  topics?: string[]
  tags?: string[]
  /** 过程框上的分层标记（只有 `type === 'group'` 的过程框有） */
  chain?: ChainLayer
}

interface ChainGraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

interface ChainGraph {
  nodes: ChainGraphNode[]
  edges: ChainGraphEdge[]
}

interface ChainArtifact {
  drivers: ChainNode[]
  nodes: ChainNode[]
  edges: ChainEdge[]
  params: Record<string, unknown>
  algorithms?: { byId?: Record<string, ChainAlgorithm> }
  paramMatrix?: Record<string, { nodes: string[]; edges: string[] }>
  algorithmPending?: { nodes?: string[]; drivers?: string[]; edges?: string }
  degeneracies?: unknown[]
  stats?: Record<string, number>
  /** 阶段 → 该阶段下辖的量 / 步骤 id（生成器写入；`unassigned` 是还没挂到阶段的） */
  stageIndex?: Record<string, string[]>
  graph?: ChainGraph
}

const chain = raw as unknown as ChainArtifact

/** 生成物里的图：内部按本页要用的少数字段读，对外按画布那份 `Graph` 的形状给出 */
const graph = (chain.graph ?? { nodes: [], edges: [] }) as unknown as ChainGraph

/** 生成物里那份与画布同形状的图（顶栏检索直接读它） */
export const CHAIN_GRAPH: Graph = graph as unknown as Graph

/**
 * 驱动量与物理量合在一起取（视图上都要画，只是种类/层级不同）。
 *
 * 注意：真源里 `drivers` 是**顶层数组**、`nodes` 才带 `kind` ——所以这里给驱动量补上
 * `kind: 'driver'`（它就是一种独立的种类：可调的输入）。不补会让视图按下标取颜色时炸掉。
 */
export const allNodes = (): ChainNode[] => [
  ...chain.drivers.map((node) => ({ ...node, kind: node.kind ?? ('driver' as NodeKind) })),
  ...chain.nodes,
]

/** 表面节点：自顶向下那条链 */
export const surfaceNodes = (): ChainNode[] => allNodes().filter((node) => (node.layer ?? 'surface') === 'surface')

/** 子图节点：属于某个表面节点、默认收起 */
export const subgraphNodes = (parent?: string): ChainNode[] =>
  allNodes().filter((node) => node.layer === 'subgraph' && (!parent || node.parent === parent))

export const nodeById = (id: string): ChainNode | undefined => allNodes().find((node) => node.id === id)

export const edgeKey = (edge: ChainEdge): string => `${edge.from}->${edge.to}`

/** 表面上的边：两端都在表面的才算"这条链上的箭" */
export const surfaceEdges = (): ChainEdge[] => {
  const ids = new Set(surfaceNodes().map((node) => node.id))
  return chain.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to))
}

/** 连到子图的边：不在表面画，归子图内部 */
export const subgraphEdges = (): ChainEdge[] => {
  const ids = new Set(subgraphNodes().map((node) => node.id))
  return chain.edges.filter((edge) => ids.has(edge.from) || ids.has(edge.to))
}

export const incomingEdges = (id: string): ChainEdge[] => surfaceEdges().filter((edge) => edge.to === id)
export const outgoingEdges = (id: string): ChainEdge[] => surfaceEdges().filter((edge) => edge.from === id)

/** 这个节点在链条上的上游（谁决定它）——来自 dependsOn，取存在的节点 */
export const upstreamOf = (id: string): ChainNode[] =>
  (nodeById(id)?.dependsOn ?? []).map((dep) => nodeById(dep)).filter((node): node is ChainNode => Boolean(node))

/** 下游（它决定谁） */
export const downstreamOf = (id: string): ChainNode[] =>
  surfaceEdges()
    .filter((edge) => edge.from === id)
    .map((edge) => nodeById(edge.to))
    .filter((node): node is ChainNode => Boolean(node))

export const algorithmOf = (id: string): ChainAlgorithm | null => chain.algorithms?.byId?.[id] ?? null

export const degeneracies = (): unknown[] => chain.degeneracies ?? []

export const statsOf = (): Record<string, number> => chain.stats ?? {}

/* ---------------- 种类与颜色（颜色只表示"它是什么"，观测量用重边框） ---------------- */

export const KIND_LABELS: Record<NodeKind, string> = {
  quantity: '物理量',
  spectrum: '谱',
  function: '函数 / 关系',
  process: '物理过程',
  engineering: '工程项',
  driver: '驱动量',
}

/** 每个种类一个色相；子图节点统一压暗（仍保留自己的色相，便于分辨种类） */
export const KIND_STYLES: Record<NodeKind, { dot: string; border: string; text: string; bg: string }> = {
  quantity: { dot: 'bg-sky-500', border: 'border-sky-300', text: 'text-sky-900', bg: 'bg-sky-50' },
  spectrum: { dot: 'bg-indigo-500', border: 'border-indigo-300', text: 'text-indigo-900', bg: 'bg-indigo-50' },
  function: { dot: 'bg-violet-500', border: 'border-violet-300', text: 'text-violet-900', bg: 'bg-violet-50' },
  process: { dot: 'bg-emerald-500', border: 'border-emerald-300', text: 'text-emerald-900', bg: 'bg-emerald-50' },
  engineering: { dot: 'bg-slate-400', border: 'border-slate-300', text: 'text-slate-700', bg: 'bg-slate-100' },
  driver: { dot: 'bg-amber-500', border: 'border-amber-300', text: 'text-amber-900', bg: 'bg-amber-50' },
}

/** 取样式时一律走这里：认不出的种类降级成工程项那种暗色，**不抛错**（页面不该因为一个字段崩掉） */
export const kindStyleOf = (node: ChainNode): (typeof KIND_STYLES)[NodeKind] =>
  KIND_STYLES[node.kind] ?? KIND_STYLES.engineering

/** 种类显示名，同样兜底 */
export const kindLabelOf = (node: ChainNode): string => KIND_LABELS[node.kind] ?? String(node.kind ?? '未标种类')

export const isObservable = (node: ChainNode): boolean => Boolean(node.observable)

/** 观测量在视图上用重边框；其余用普通边框 */
export const nodeFrameClass = (node: ChainNode): string => (isObservable(node) ? 'border-2 shadow-sm' : 'border')

/* ---------------- 开关：挂在边上 ---------------- */

interface EffectParam extends ChainParam {
  switch?: boolean
  gatesEdges?: string[]
}

export const effectParams = (): EffectParam[] => (chain.params.effects as EffectParam[] | undefined) ?? []

/** 门控这条边的开关（可能不止一个） */
export const switchesForEdge = (key: string): EffectParam[] =>
  effectParams().filter((param) => (param.gatesEdges ?? []).includes(key))

/** 还没定挂点的开关（账本要求：不许静默留空） */
export const unplacedSwitches = (): EffectParam[] =>
  effectParams().filter((param) => !(param.gatesEdges ?? []).length)

/* ---------------- 参数（抽屉用） ---------------- */

export interface ParamGroup {
  name: string
  label: string
  params: ChainParam[]
}

const GROUP_LABELS: Record<string, string> = {
  drivers: '驱动量',
  astro: '天体物理参数',
  numeric: '数值与精度',
  effects: '效应开关',
}

/** 分组顺序由数据声明（`params.order`）；没声明时退回历史三组 */
export const paramGroups = (): ParamGroup[] => {
  const order = (chain.params.order as string[] | undefined) ?? ['drivers', 'numeric', 'effects']
  return order
    .filter((name) => Array.isArray(chain.params[name]))
    .map((name) => ({
      name,
      label: GROUP_LABELS[name] ?? name,
      params: chain.params[name] as ChainParam[],
    }))
}

export const allParams = (): ChainParam[] => paramGroups().flatMap((group) => group.params)

/** 抽屉检索：按代码名、P&L 写法、中文角色说明匹配 */
export const searchParams = (query: string): ChainParam[] => {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return allParams().filter((param) =>
    [param.name, param.pl2012 ?? '', param.role ?? ''].some((field) => field.toLowerCase().includes(q)),
  )
}

/** 这个参数是不是某个开关：是的话，视图可以用它高亮它门控的边 */
export const gateEdgesOfParam = (param: ChainParam): string[] => param.gatesEdges ?? []

/**
 * 参数 → 模块 的查表（**后端算好的**，见生成器里的参数 × 节点矩阵）。
 * 视图拿它做「选中参数 → 高亮相关模块」：`nodes` 是它被读到的那些节点，`edges` 是开关门控的边。
 * 没有归属的参数不在表里（自检会列出它们，不静默）。
 */
export const paramMatrixOf = (name: string): { nodes: string[]; edges: string[] } | null => {
  const matrix = chain.paramMatrix as Record<string, { nodes: string[]; edges: string[] }> | undefined
  return matrix?.[name] ?? null
}

/** 参数默认值的显示文本（空就是空，不补） */
export const defaultTextOfParam = (param: ChainParam): string => {
  if (param.default === null || param.default === undefined) return '—'
  if (typeof param.default === 'boolean') return param.default ? 'true' : 'false'
  return String(param.default)
}

/* ============ 分层：一级只讲物理（读过程框上的 `chain` 标记） ============ */

/** 过程框上的分层标记（生成物给出：`main`＝物理主链，`bypass`＝旁路与后处理接口） */
export type ChainLayer = 'main' | 'bypass'

/**
 * 默认收起的那两个话题（id 由生成物注册表给出，视图不写死阶段号）：
 *   · `topic:impl`＝实现细节（工程节点）；
 *   · `topic:bypass`＝旁路与后处理接口（算完顺手给的诊断出口）。
 * **单一定义处**：视图的默认收起态、常驻折叠条、检索命中的来源标注都读这里。
 */
export const COLLAPSED_TOPIC_IDS: readonly string[] = ['topic:impl', 'topic:bypass']

/** 收起层的显示名：折叠条与检索结果的来源徽标共用这一句话 */
export const COLLAPSED_LAYER_LABEL = '旁路与实现细节'

const graphNodes = (): ChainGraphNode[] => graph.nodes
const graphEdges = (): ChainGraphEdge[] => graph.edges

/** 阶段框（id 形如 `stage:S04`；也接受裸阶段号 `S04`）——分层标记就写在它身上 */
const stageBoxOf = (stageOrBoxId: string): ChainGraphNode | undefined =>
  graphNodes().find((node) => node.type === 'group' && (node.id === stageOrBoxId || node.id === `stage:${stageOrBoxId}`))

const layerOfBox = (box: ChainGraphNode): ChainLayer => (box.chain === 'bypass' ? 'bypass' : 'main')

/**
 * 一个对象属于哪一层。入参可以是节点 id、阶段框 id（`stage:S04`）或裸阶段号（`S04`）。
 *
 * 判据**只读生成物**：过程框上的 `chain` 标记（由 `scripts/lib/physicsStages.mjs` 的共享口径写入），
 * 不在视图里写死阶段名单；非阶段框沿 `parent` 往上找它挂在哪个过程框下。
 * 找不到的（如挂不上阶段的驱动量）按主链处理——它们是物理输入，不是工程侧。
 */
export const chainLayerOf = (nodeOrStageId: string): ChainLayer => {
  const box = stageBoxOf(nodeOrStageId)
  if (box) return layerOfBox(box)
  const seen = new Set<string>()
  let cursor = graphNodes().find((node) => node.id === nodeOrStageId)
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    if (cursor.type === 'group') return layerOfBox(cursor)
    const parentId = cursor.parent
    cursor = parentId ? graphNodes().find((node) => node.id === parentId) : undefined
  }
  return 'main'
}

const hasCollapsedTopic = (id: string): boolean =>
  (graphNodes().find((node) => node.id === id)?.topics ?? []).some((topicId) =>
    COLLAPSED_TOPIC_IDS.includes(topicId),
  )

/**
 * 这个对象是不是**被折叠条收起来**的那一层（实现细节 + 旁路与后处理接口）。
 * 顶栏检索用它给命中项标注来源：「命中收起层 → 标一下并自动展开」，不藏东西也不污染一级。
 */
export const isCollapsedLayerObject = (kind: 'node' | 'edge', id: string): boolean => {
  if (kind === 'node') return hasCollapsedTopic(id)
  const edge = graphEdges().find((item) => item.id === id)
  return edge ? hasCollapsedTopic(edge.source) || hasCollapsedTopic(edge.target) : false
}

/* ============ 四路检索：参数 / 物理量 / 过程名 / 论文出处 ============ */

export type ChainHitKind = 'param' | 'quantity' | 'process' | 'paper'

export interface ChainHit {
  kind: ChainHitKind
  /** 稳定键：参数名 / 节点 id / 出处原文（一处出处可能被多个参数引，聚合后按原文作键） */
  id: string
  label: string
  /** 命中理由与**数量说明**（都从生成物里数出来，不写死） */
  detail: string
  layer: ChainLayer
  /** 命中后该选中谁；没有可选中对象的（如只在出处里出现的参数）为 null */
  focus: { kind: 'node' | 'edge'; id: string } | null
}

export interface ChainSearchResult {
  hits: ChainHit[]
  counts: Record<ChainHitKind, number>
}

const matches = (fields: (string | undefined)[], query: string): boolean =>
  fields.some((field) => (field ?? '').toLowerCase().includes(query))

/** 图节点上的种类显示名（与 `kindLabelOf` 同一张表，只是入参是字符串的 `type`） */
const kindLabelOfType = (type: string): string => KIND_LABELS[type as NodeKind] ?? type

/**
 * 本页检索：**四路都收**——参数（代码名 / P&L 写法 / 中文角色）、物理量（符号 · 名字 · 公式）、
 * 过程名（过程框 / 过程 / 函数 / 步骤，摘要里"我想知道…"的问法也算命中面）、论文出处。
 *
 * 每条命中都带 `layer`（收起层里的对象也照样能检索到，由视图负责先展开折叠条）
 * 与数量说明。命中口径**以生成物为准**：作用范围走 `paramMatrix`，分层走过程框的 `chain`。
 */
export const searchChain = (query: string): ChainSearchResult => {
  const q = query.trim().toLowerCase()
  const hits: ChainHit[] = []
  const counts: Record<ChainHitKind, number> = { param: 0, quantity: 0, process: 0, paper: 0 }
  if (!q) return { hits, counts }
  const push = (hit: ChainHit) => {
    hits.push(hit)
    counts[hit.kind] += 1
  }
  const focusOf = (nodeId: string | undefined): ChainHit['focus'] =>
    nodeId ? { kind: 'node', id: nodeId } : null

  // 一路：参数。命中后顺手给出它作用于多少个量、门控多少条边（数量来自参数 × 节点矩阵）
  searchParams(q).forEach((param) => {
    const matrix = paramMatrixOf(param.name)
    const nodes = matrix?.nodes ?? []
    const edges = matrix?.edges ?? []
    push({
      kind: 'param',
      id: param.name,
      label: param.pl2012 ? `${param.name} · ${param.pl2012}` : param.name,
      detail: `作用于 ${nodes.length} 个物理量${edges.length ? `，门控 ${edges.length} 条边` : ''}`,
      layer: nodes.length ? chainLayerOf(nodes[0]) : 'main',
      focus: focusOf(nodes[0]),
    })
  })

  // 二路 / 三路：物理量 与 过程名（图上的对象一律可检索；过程框也在内，于是检索阶段名就能直达）
  graphNodes().forEach((node) => {
    if (!matches([node.label, node.summary], q)) return
    const quantity = node.type === 'quantity' || node.type === 'spectrum'
    push({
      kind: quantity ? 'quantity' : 'process',
      id: node.id,
      label: node.label,
      detail: `${quantity ? '物理量' : kindLabelOfType(node.type)} · ${
        chainLayerOf(node.id) === 'bypass' ? '旁路' : '物理主链'
      }`,
      layer: chainLayerOf(node.id),
      focus: focusOf(node.id),
    })
  })

  // 四路：论文出处（按出处原文聚合，给出"引它的参数数 + 这些参数落到的量数"）
  const byPaper = new Map<string, ChainParam[]>()
  allParams().forEach((param) => {
    const paper = (param.paper ?? '').trim()
    if (!paper || !matches([paper], q)) return
    byPaper.set(paper, [...(byPaper.get(paper) ?? []), param])
  })
  byPaper.forEach((params, paper) => {
    const nodes = new Set(params.flatMap((param) => paramMatrixOf(param.name)?.nodes ?? []))
    push({
      kind: 'paper',
      id: paper,
      label: paper,
      detail: `${params.length} 个参数引它，落在 ${nodes.size} 个物理量上`,
      layer: nodes.size ? chainLayerOf([...nodes][0]) : 'main',
      focus: focusOf([...nodes][0]),
    })
  })

  return { hits, counts }
}

/* ============ 本页规模（状态条用；四个数都从生成物里数出来） ============ */

export interface ChainStats {
  /** 物理过程：主链上的过程框数（旁路框不计——它不属于物理链） */
  processes: number
  /** 子过程：主链阶段下辖的量与步骤数（生成物的 `stageIndex`） */
  subprocesses: number
  /** 参数：生成物里登记的全部参数（驱动量 + 天体物理 + 宇宙学 + 数值 + 开关） */
  params: number
  /** 文献：参数上出现的不重复出处数 */
  papers: number
}

export const chainStats = (): ChainStats => ({
  processes: graphNodes().filter((node) => node.type === 'group' && node.chain !== 'bypass').length,
  subprocesses: Object.entries(chain.stageIndex ?? {})
    .filter(([stage]) => stage !== 'unassigned' && chainLayerOf(stage) === 'main')
    .reduce((sum, [, ids]) => sum + ids.length, 0),
  params: allParams().length,
  papers: new Set(allParams().map((param) => (param.paper ?? '').trim()).filter(Boolean)).size,
})
