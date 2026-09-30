import physicsGraphData from '../generated/physics-graph.json'
import { aliasOf } from './paramAliases'
import type { Graph, GraphNode, GraphRef, TagDefinition } from './types'

/**
 * 物理视角图谱 → 矩阵模型。
 *
 * 数据源是 `src/generated/physics-graph.json`（由 `npm run build:physics` 从 atlas 分层文档
 * 与源码生成，**不是**画布那份 `data/graph.json`）。这里只做纯函数换算：
 *   行 = 天体物理参数（按 AstroParams / AstroOptions 分带）
 *   列 = 物理过程（按主题分块，块内按文档顺序）
 *   格 = 该参数在此过程中的角色（入公式 / 赋值 / 开关）+ 作用说明 + 出处
 *
 * 读法沿用仓库既有矩阵约定（`docs/notes/atlas/figures/README.md`）：
 * **有色格 = 有关系，空格 = 无关；矩阵的形状本身就是结论。**
 */

export type RoleKind = '入公式' | '赋值' | '开关'

/** 支配度权重：入公式 > 赋值 > 开关——"进公式"比"被读一下就存起来"更支配 */
export const KIND_WEIGHT: Record<RoleKind, number> = { 入公式: 3, 赋值: 2, 开关: 1 }

export interface MatrixCell {
  tagId: string
  paramName: string
  kind: RoleKind
  note: string
  ref: GraphRef
  processId: string
  processLabel: string
}

export interface MatrixRow {
  tagId: string
  name: string
  group: string
  /** 中文物理名（显示层命名，见 `paramAliases.ts`；没有就空串，行里只显示变量名） */
  alias: string
  /** 中文物理名的依据（源码行号或文档锚点），tooltip 里给出来源 */
  aliasSource: string
  /** 行头说明：来自源码 docstring 的第一句；源码没写就是空串（不编造） */
  description: string
  /** 该参数在每个过程里的角色（只含有角色的那几列） */
  cells: Map<string, MatrixCell>
  /** 管了几个过程 */
  processCount: number
  /** 加权支配度（用于排序与列尾的 Top-N） */
  weight: number
}

export interface MatrixColumn {
  id: string
  code: string
  name: string
  label: string
  summary: string
  anchors: GraphRef[]
  cells: MatrixCell[]
  topicId: string
  dominant: MatrixRow[]
}

export interface MatrixBand {
  group: string
  rows: MatrixRow[]
}

export interface MatrixColumnGroup {
  topicId: string
  name: string
  description: string
  columns: MatrixColumn[]
}

export interface MatrixModel {
  name: string
  description: string
  bands: MatrixBand[]
  rows: MatrixRow[]
  columnGroups: MatrixColumnGroup[]
  columns: MatrixColumn[]
  filled: number
}

export const physicsGraph = physicsGraphData as unknown as Graph

/** 行带顺序：物理量在前、开关在后（与文档里两个结构的语义一致） */
const GROUP_ORDER = ['AstroParams', 'AstroOptions']

function roleOf(node: GraphNode, tagId: string): { kind: RoleKind; note: string; ref: GraphRef } | null {
  const item = (node.tagDetails ?? {})[tagId]?.[0]
  if (!item) return null
  const kind = (['入公式', '赋值', '开关'] as const).includes(item.kind as RoleKind) ? (item.kind as RoleKind) : '入公式'
  return {
    kind,
    note: item.note ?? '',
    ref: item.ref ?? { docId: '', anchor: '', label: '', file: '', line: null, endLine: null },
  }
}

export function buildMatrix(graph: Graph = physicsGraph): MatrixModel {
  const tags = [...graph.meta.tags].sort((left, right) => {
    const order = GROUP_ORDER.indexOf(left.group ?? '') - GROUP_ORDER.indexOf(right.group ?? '')
    return order !== 0 ? order : left.name.localeCompare(right.name)
  })

  const processes = graph.nodes.filter((node) => node.type !== 'group')
  const rows: MatrixRow[] = tags.map((tag: TagDefinition) => {
    const alias = aliasOf(tag.id)
    return {
      tagId: tag.id,
      name: tag.name,
      group: tag.group ?? '未分组',
      alias: alias?.short ?? '',
      aliasSource: alias?.source ?? '',
      description: tag.description ?? '',
      cells: new Map<string, MatrixCell>(),
      processCount: 0,
      weight: 0,
    }
  })
  const rowByTag = new Map(rows.map((row) => [row.tagId, row]))

  const columns: MatrixColumn[] = processes.map((node) => {
    const cells: MatrixCell[] = []
    for (const [tagId, items] of Object.entries(node.tagDetails ?? {})) {
      const row = rowByTag.get(tagId)
      const role = items[0] ? roleOf(node, tagId) : null
      if (!row || !role) continue
      const cell: MatrixCell = {
        tagId,
        paramName: row.name,
        kind: role.kind,
        note: role.note,
        ref: role.ref,
        processId: node.id,
        processLabel: node.label,
      }
      cells.push(cell)
      row.cells.set(node.id, cell)
      row.processCount += 1
      row.weight += KIND_WEIGHT[role.kind]
    }
    return {
      id: node.id,
      code: node.label.split(' ')[0] ?? node.id,
      name: node.label.split(' ').slice(1).join(' ') || node.label,
      label: node.label,
      summary: node.summary ?? '',
      anchors: (node.refs ?? []).filter((ref) => ref.docId),
      cells,
      topicId: node.topics?.[0] ?? 'phys-product',
      dominant: [] as MatrixRow[],
    }
  })

  for (const column of columns) {
    column.dominant = rows
      .filter((row) => row.cells.has(column.id))
      .sort((left, right) => {
        const leftKind = left.cells.get(column.id)?.kind ?? '开关'
        const rightKind = right.cells.get(column.id)?.kind ?? '开关'
        return KIND_WEIGHT[rightKind] - KIND_WEIGHT[leftKind] || left.name.localeCompare(right.name)
      })
  }

  const bands: MatrixBand[] = GROUP_ORDER.map((group) => ({
    group,
    rows: rows.filter((row) => row.group === group),
  })).filter((band) => band.rows.length > 0)

  const columnGroups: MatrixColumnGroup[] = graph.meta.topics.map((topic) => ({
    topicId: topic.id,
    name: topic.name,
    description: topic.description ?? '',
    columns: columns.filter((column) => column.topicId === topic.id),
  }))
  const grouped = new Set(columnGroups.flatMap((group) => group.columns.map((column) => column.id)))
  const rest = columns.filter((column) => !grouped.has(column.id))
  if (rest.length) columnGroups.push({ topicId: 'other', name: '未分组过程', description: '', columns: rest })

  return {
    name: graph.meta.name,
    description: graph.meta.description ?? '',
    bands,
    rows,
    columnGroups,
    columns,
    filled: columns.reduce((sum, column) => sum + column.cells.length, 0),
  }
}
