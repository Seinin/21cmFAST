import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Boxes,
  ChevronsRight,
  CornerUpRight,
  ExternalLink,
  FileCode,
  FileText,
  Link2,
  PanelRightOpen,
  Plus,
  Tags,
  Trash2,
  X,
} from 'lucide-react'
import { Badge, DotBadge, Separator } from './ui/badge'
import { Button } from './ui/button'
import { Field, Input, Textarea } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Switch } from './ui/switch'
import { Tooltip } from './ui/tooltip'
import {
  EDGE_TYPE_LABELS,
  EDGE_TYPE_ORDER,
  NODE_TYPE_COLORS,
  NODE_TYPE_LABELS,
  NODE_TYPE_ORDER,
  codeRefLocation,
  isCodeRef,
  type EdgeType,
  type GraphEdge,
  type GraphNode,
  type GraphRef,
  type NodeType,
  type TagDefinition,
  type Topic,
} from '../lib/types'
import { PANEL_RAIL_WIDTH } from '../hooks/usePanelWidth'
import { NodeTagEditor, NodeTagSection } from './NodeTags'

/** 节点的一条关系（跨层的也列出：画布只画同视图内的边，其余在这里看） */
export interface RelationItem {
  id: string
  label: string
  /** 对端节点 id */
  otherId: string
  otherLabel: string
  /** true = 本节点是起点（→ 对端）；false = 本节点是终点（对端 →） */
  outgoing: boolean
  /** 对端是否在当前标签页可见（跨层关系为 false） */
  sameView: boolean
}

interface InspectorProps {
  node: GraphNode | null
  edge: GraphEdge | null
  sourceLabel: string
  targetLabel: string
  /** 话题注册表：用来把节点上的 topic id 翻译成可读名字 */
  topics: Topic[]
  /** 点击节点所属的某个话题：确保该话题未被关闭（不影响其它话题）并选中该节点 */
  onOpenTopic: (topicId: string) => void
  onPatchNode: (patch: Partial<GraphNode>) => void
  onPatchEdge: (patch: Partial<GraphEdge>) => void
  onRemoveNode: () => void
  onRemoveEdge: () => void
  onEditEdge: () => void
  onConnectFrom: (nodeId: string) => void
  onOpenRef: (ref: GraphRef) => void
  onRemoveRef: (index: number) => void
  /** 打开「添加源码引用」选择器 */
  onAddCodeRef?: () => void
  /**
   * 引用的呈现方式（证据层）：
   *   · `inline`（默认）＝引用卡片直接铺开（画布页用的就是它，行为改动前后一致）；
   *   · `collapsed`＝先只给「看实现（N）」「看文献（M）」两个**默认收起**的入口
   *     （物理链页用：一级先讲物理，证据展开才出现），且**收起时不生成任何路径与行号 DOM**。
   * `collapsed` 时这一段还会被移到「关系 / 子图入口」之后 —— 物理在前、证据在最后。
   */
  evidence?: 'inline' | 'collapsed'
  /** 可选的所属大框（已排除自身与自己的子孙，避免把大框塞进自己身体里） */
  groupOptions?: { id: string; label: string }[]
  /** 选中节点的直系子节点数（模块 > 0 时显示「进入子图 ↗」） */
  childCount?: number
  /** 进入该模块的子图标签页（仅模块显示） */
  onEnterSubgraph?: () => void
  /** 选中节点的全部关系（含跨层），点击可选中该关系 */
  relations?: RelationItem[]
  /** 全局标签注册表：标签编辑从这里多选，明细区块用它显示名称与说明 */
  tagRegistry?: TagDefinition[]
  /** 由点画布红点带过来的标签 id：该标签的明细自动展开 */
  activeTagId?: string | null
  /** 新建一个全局标签（写进注册表）并归属到当前节点 */
  onCreateTag?: (name: string) => void
  onSelectRelation?: (edgeId: string) => void
  /** 选中模块的关系是否已收起（纯视图状态，记在本机浏览器里） */
  relationsHidden?: boolean
  /** 收起 / 展开该模块的关系 */
  onToggleRelations?: (id: string) => void
  /** 受控宽度（由 usePanelWidth 管理，纯视图状态） */
  width: number
  /** 是否收起为细条 */
  collapsed: boolean
  onToggleCollapsed: () => void
  onClose: () => void
}

/** 「所属大框」下拉里代表「顶层」的哨兵值：Select 不能把 null 当 value */
const NO_GROUP = '__top__'

const panelMotion = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 18 },
  transition: { type: 'spring' as const, stiffness: 260, damping: 26 },
}

export function Inspector({
  node,
  edge,
  sourceLabel,
  targetLabel,
  topics,
  onOpenTopic,
  onPatchNode,
  onPatchEdge,
  onRemoveNode,
  onRemoveEdge,
  onEditEdge,
  onConnectFrom,
  onOpenRef,
  onRemoveRef,
  onAddCodeRef,
  evidence = 'inline',
  groupOptions = [],
  childCount = 0,
  onEnterSubgraph,
  relations = [],
  onSelectRelation,
  relationsHidden = false,
  onToggleRelations,
  tagRegistry = [],
  activeTagId = null,
  onCreateTag,
  width,
  collapsed,
  onToggleCollapsed,
  onClose,
}: InspectorProps) {
  const [label, setLabel] = useState('')
  const [summary, setSummary] = useState('')

  // 同一节点可在多个话题里出现；这里只做 id → 名字的翻译，注册表缺项就跳过
  const nodeTopics = (node?.topics ?? [])
    .map((topicId) => topics.find((topic) => topic.id === topicId))
    .filter((topic): topic is Topic => Boolean(topic))

  useEffect(() => {
    if (!node) return
    setLabel(node.label)
    setSummary(node.summary)
  }, [node?.id, node])

  const edgeLabelState = useState(edge?.label ?? '')
  const edgeNoteState = useState(edge?.note ?? '')

  useEffect(() => {
    edgeLabelState[1](edge?.label ?? '')
    edgeNoteState[1](edge?.note ?? '')
  }, [edge?.id, edge])

  const commitNodeLabel = () => {
    if (!node) return
    const trimmed = label.trim()
    if (!trimmed || trimmed === node.label) {
      setLabel(node.label)
      return
    }
    onPatchNode({ label: trimmed })
  }

  const commitSummary = () => {
    if (node && summary !== node.summary) onPatchNode({ summary: summary.trim() })
  }



  /** 证据入口的展开状态（只在 `evidence="collapsed"` 下用）；换一个节点就复位为收起 */
  const [evidenceOpen, setEvidenceOpen] = useState({ impl: false, paper: false })

  useEffect(() => {
    setEvidenceOpen({ impl: false, paper: false })
  }, [node?.id])

  /**
   * 「notes / 源码引用」这一段。两种呈现方式：
   *   · `inline`（默认，画布页用的就是它）：引用卡片直接铺开；
   *   · `collapsed`（物理链页）：先只给「看实现（N）」「看文献（M）」两颗按钮，
   *     **没展开时一个路径、一个行号都不渲染**（DOM 里根本没有，而不是视觉上藏起来），
   *     点开才把卡片铺出来——证据默认收起，一级先讲物理。
   */
  const renderRefs = (target: GraphNode) => {
    const codeRefs = target.refs.filter((ref) => isCodeRef(ref) && Boolean(ref.file))
    const docRefs = target.refs.filter((ref) => !isCodeRef(ref) && Boolean(ref.docId))
    /**
     * 引用卡片：两类引用共用一张（图标与第二行按目标类型切换）。
     * `index` 取它在**原数组**里的下标（收起态按类型过滤过），删除时才删得对。
     */
    const card = (ref: GraphRef, index: number) => {
      const code = isCodeRef(ref)
      const location = code ? codeRefLocation(ref) : `${ref.docId}${ref.anchor ? `#${ref.anchor}` : ''}`
      return (
        <li
          key={`${location}-${index}`}
          className="group flex items-start gap-2 rounded-md border border-black/[0.07] bg-black/[0.03] px-2.5 py-2 transition-colors hover:border-primary/35 hover:bg-primary/[0.06]"
        >
          {code ? (
            <FileCode className="mt-[2px] h-3.5 w-3.5 shrink-0 text-teal-700/80" />
          ) : (
            <FileText className="mt-[2px] h-3.5 w-3.5 shrink-0 text-cyan-700/80" />
          )}
          <button
            type="button"
            onClick={() => onOpenRef(ref)}
            className="min-w-0 flex-1 cursor-pointer text-left"
          >
            <span className="block truncate text-micro font-medium text-foreground/90">
              {ref.label || ref.anchor || location}
            </span>
            <span className="block truncate font-mono text-micro text-muted-foreground/70">
              {location}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Tooltip content={code ? '预览这几行' : '打开文档'}>
              <Button variant="ghost" size="icon-sm" onClick={() => onOpenRef(ref)}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Tooltip>
            <Tooltip content="移除引用">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive/85 hover:bg-destructive/12"
                onClick={() => onRemoveRef(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Tooltip>
          </div>
        </li>
      )
    }

    return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-micro font-semibold uppercase tracking-wide text-muted-foreground/80">
            notes / 源码引用
          </h3>
          <div className="flex items-center gap-2">
            <Tooltip content="在左侧 notes 数据库点击或拖拽文档即可添加">
              <span className="flex cursor-default items-center gap-1 text-micro text-muted-foreground/60">
                <Plus className="h-3 w-3" />
                文档
              </span>
            </Tooltip>
            <Tooltip content="选一个源文件与行区间，挂到本节点">
              <button
                type="button"
                onClick={() => onAddCodeRef?.()}
                className="flex cursor-pointer items-center gap-1 text-micro text-cyan-700 transition-colors hover:text-cyan-800"
              >
                <FileCode className="h-3 w-3" />
                源码
              </button>
            </Tooltip>
          </div>
        </div>

        {target.refs.length === 0 ? (
          <p className="rounded-md border border-dashed border-black/10 px-2.5 py-3 text-micro leading-relaxed text-muted-foreground">
            还没有引用。在左侧选择文档或章节，或点上方「源码」把某几行代码锚到这个节点上。
          </p>
        ) : evidence === 'collapsed' ? (
          <>
            {codeRefs.length ? (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setEvidenceOpen((state) => ({ ...state, impl: !state.impl }))}
                  aria-expanded={evidenceOpen.impl}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-black/[0.07] bg-black/[0.03] px-2.5 py-2 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.06]"
                >
                  <FileCode className="h-3.5 w-3.5 shrink-0 text-teal-700/80" />
                  <span className="min-w-0 flex-1 truncate text-micro font-medium text-foreground/90">
                    看实现（{codeRefs.length}）
                  </span>
                  <span className="shrink-0 text-micro text-muted-foreground/70">
                    {evidenceOpen.impl ? '收起' : '展开'}
                  </span>
                </button>
                {evidenceOpen.impl ? (
                  <ul className="flex flex-col gap-1.5">
                    {codeRefs.map((ref) => card(ref, target.refs.indexOf(ref)))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {docRefs.length ? (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setEvidenceOpen((state) => ({ ...state, paper: !state.paper }))}
                  aria-expanded={evidenceOpen.paper}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-black/[0.07] bg-black/[0.03] px-2.5 py-2 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.06]"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-700/80" />
                  <span className="min-w-0 flex-1 truncate text-micro font-medium text-foreground/90">
                    看文献（{docRefs.length}）
                  </span>
                  <span className="shrink-0 text-micro text-muted-foreground/70">
                    {evidenceOpen.paper ? '收起' : '展开'}
                  </span>
                </button>
                {evidenceOpen.paper ? (
                  <ul className="flex flex-col gap-1.5">
                    {docRefs.map((ref) => card(ref, target.refs.indexOf(ref)))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <ul className="flex flex-col gap-1.5">{target.refs.map((ref, index) => card(ref, index))}</ul>
        )}

        {target.type === 'group' ? (
          <p className="flex items-start gap-1.5 rounded-md border border-teal-600/20 bg-teal-600/[0.06] px-2.5 py-2 text-micro leading-relaxed text-teal-800">
            <Boxes className="mt-[1px] h-3 w-3 shrink-0" />
            这是一个大框（容器）：把模块拖进它的范围（或在模块的「所属大框」里选中它）即可装进来。
            <br />
            容器只作分组，<span className="font-semibold">不参与关系</span>——关系只建立在模块之间。
          </p>
        ) : null}
      </section>
    )
  }

  const open = Boolean(node || edge)

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          key="inspector"
          {...panelMotion}
          className="glass-panel flex shrink-0 flex-col overflow-hidden rounded-lg"
          style={{ width: collapsed ? PANEL_RAIL_WIDTH : width }}
        >
          {collapsed ? (
            <div className="flex flex-col items-center gap-2 py-3">
              <Tooltip content="展开节点详情">
                <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label="展开节点详情">
                  <PanelRightOpen className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
              <Tags className="h-3.5 w-3.5 text-primary" />
            </div>
          ) : node ? (
            <>
              <header className="flex shrink-0 items-start justify-between gap-2 px-3.5 pb-2.5 pt-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <DotBadge color={NODE_TYPE_COLORS[node.type]}>{NODE_TYPE_LABELS[node.type]}</DotBadge>
                    <Badge tone="muted">
                      {node.refs.length} 引用 · {node.tags.length} 标签
                    </Badge>
                  </div>
                  <h2 className="mt-2 truncate text-tiny font-semibold text-foreground/92" title={node.label}>
                    {node.label}
                  </h2>
                  {nodeTopics.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {nodeTopics.map((topic) => (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => onOpenTopic(topic.id)}
                          title={topic.description || `显示话题「${topic.name}」并选中该节点`}
                          className="flex cursor-pointer items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.08] px-2 py-[2px] text-micro text-primary/90 transition-colors hover:border-primary/45 hover:bg-primary/[0.14]"
                        >
                          <Tags className="h-2.5 w-2.5" />
                          {topic.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Tooltip content="收起面板">
                    <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label="收起节点详情">
                      <ChevronsRight className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                  <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="收起检查器">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </header>

              <Separator />

              <ScrollArea className="min-h-0 flex-1" viewportClassName="px-3.5 py-3">
                <div className="flex flex-col gap-3">
                  <Field label="节点名称">
                    <Input
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      onBlur={commitNodeLabel}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitNodeLabel()
                        if (event.key === 'Escape') setLabel(node.label)
                      }}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="类型">
                      <Select value={node.type} onValueChange={(value) => onPatchNode({ type: value as NodeType })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NODE_TYPE_ORDER.map((item) => (
                            <SelectItem key={item} value={item}>
                              {NODE_TYPE_LABELS[item]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="标签数" hint="明细见下方「全局标签」">
                      <div className="flex h-8 items-center rounded-md border border-black/10 bg-black/[0.03] px-2.5 text-micro text-muted-foreground">
                        {node.tags.length} 个已归属
                      </div>
                    </Field>
                  </div>

                  {/* 全局标签：从注册表多选，也可当场新建（自由文本输入已移除）。
                      容器只作分组，不参与标签/关系，所以整块对它不显示。 */}
                  {node.type !== 'group' ? (
                    <Field plain label="全局标签" hint="勾选注册表里的标签；画布上点红点看明细">
                      <NodeTagEditor
                        node={node}
                        registry={tagRegistry}
                        onPatchNode={onPatchNode}
                        onCreateTag={onCreateTag}
                      />
                    </Field>
                  ) : null}

                  {/* 大框归属：手动建立层级的第二种入口（第一种是画布上把节点拖进大框） */}
                  <Field label="所属大框" hint="画布上拖进框里也可以">
                    <Select
                      value={node.parent ?? NO_GROUP}
                      onValueChange={(value) => onPatchNode({ parent: value === NO_GROUP ? null : value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_GROUP}>（顶层 · 不在任何大框里）</SelectItem>
                        {groupOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* 条件 / 可选：画布上用虚线框表达（对应流程图的「这一步只在某些配置下才存在」） */}
                  <div className="flex h-8 items-center justify-between rounded-md border border-black/10 bg-black/[0.03] px-2.5">
                    <span
                      className="text-micro text-muted-foreground"
                      title="虚线框：这一步只在某些配置下才存在（例如「仅 lagrangian 源模型」）"
                    >
                      条件 / 可选（虚线框）
                    </span>
                    <Switch
                      checked={Boolean(node.conditional)}
                      onCheckedChange={(value) => onPatchNode({ conditional: value })}
                    />
                  </div>

                  {/* 收起关系：连线一多就先把它们收起来，只看节点本身。
                      纯视图动作——不删关系、不改数据、不动坐标；状态记在本机浏览器里，刷新后保持。
                      大框不参与关系，因此不显示这一行。 */}
                  {node.type !== 'group' ? (
                    <div className="flex h-8 items-center justify-between rounded-md border border-black/10 bg-black/[0.03] px-2.5">
                      <span
                        className="text-micro text-muted-foreground"
                        title="只把它的连线收起来：节点、坐标与层级都不变；状态记在本机浏览器里，刷新后保持"
                      >
                        收起它的连线
                      </span>
                      <Switch
                        checked={relationsHidden}
                        onCheckedChange={() => onToggleRelations?.(node.id)}
                      />
                    </div>
                  ) : null}

                  <Field label="摘要">
                    <Textarea
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      onBlur={commitSummary}
                      placeholder="一句话说明"
                      className="min-h-[56px]"
                    />
                  </Field>

                  {evidence === 'inline' ? (
                    <>
                      <Separator />
                      {renderRefs(node)}
                    </>
                  ) : null}

                  <Separator />

                  {/* 全局标签明细：标签在**这个节点**上具体是什么（如「参数参与」下的参数名 · 用法 · 出处）。
                      容器不参与标签，整块跳过。 */}
                  {(node.type !== 'group' || node.tags.length > 0) ? (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-micro font-semibold uppercase tracking-wide text-muted-foreground/80">
                        全局标签
                      </h3>
                      <NodeTagSection
                        node={node}
                        registry={tagRegistry}
                        activeTagId={activeTagId}
                        onOpenRef={onOpenRef}
                      />
                    </section>
                  ) : null}

                  {/* 关系（含跨层）：画布只画两端都在本视图的边，其余在这里看全。
                      大框是容器，不参与关系，所以这里对容器整段不显示。 */}
                  {node.type !== 'group' && relations.length ? (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-micro font-semibold uppercase tracking-wide text-muted-foreground/80">
                        关系（{relations.length}）
                      </h3>
                      <ul className="flex flex-col gap-1.5">
                        {relations.map((relation) => (
                          <li key={relation.id}>
                            <button
                              type="button"
                              onClick={() => onSelectRelation?.(relation.id)}
                              title={relation.sameView ? relation.label : `${relation.label}（对端不在当前标签页）`}
                              className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-black/[0.07] bg-black/[0.03] px-2.5 py-1.5 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.06]"
                            >
                              <span className="min-w-0 flex-1 truncate text-micro text-foreground/90">
                                {relation.outgoing ? `→ ${relation.otherLabel}` : `← ${relation.otherLabel}`}
                              </span>
                              <span className="shrink-0 text-micro text-muted-foreground/70">{relation.label}</span>
                              {!relation.sameView ? (
                                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[9.5px] text-amber-700">
                                  跨层
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {/* 模块入口：子图在新标签页打开（与双击模块等效） */}
                  {node.type !== 'group' && childCount > 0 ? (
                    <Button variant="secondary" onClick={() => onEnterSubgraph?.()}>
                      <CornerUpRight className="h-3.5 w-3.5" />
                      进入子图 ↗（{childCount} 个子节点）
                    </Button>
                  ) : null}

                  {/*
                    证据层排在最后（物理在前、证据在后）：物理链页把引用收成
                    「看实现 / 看文献」两个默认收起的入口，展开前一个路径与行号都不渲染。
                  */}
                  {evidence === 'collapsed' ? (
                    <>
                      <Separator />
                      {renderRefs(node)}
                    </>
                  ) : null}

                  {/* 大框是容器，不参与关系：不给「拉出关系」入口 */}
                  {node.type !== 'group' ? (
                    <Button variant="secondary" onClick={() => onConnectFrom(node.id)}>
                      <Link2 className="h-3.5 w-3.5" />
                      从此节点拉出关系
                    </Button>
                  ) : null}
                </div>
              </ScrollArea>

              <Separator />
              <div className="shrink-0 p-3">
                <Button variant="danger-ghost" className="w-full" onClick={onRemoveNode}>
                  <Trash2 className="h-3.5 w-3.5" />
                  删除节点（连带其关系）
                </Button>
              </div>
            </>
          ) : edge ? (
            <>
              <header className="flex shrink-0 items-start justify-between gap-2 px-3.5 pb-2.5 pt-3.5">
                <div className="min-w-0">
                  <Badge tone="primary">{EDGE_TYPE_LABELS[edge.type]}</Badge>
                  <h2 className="mt-2 flex items-center gap-1.5 text-tiny font-semibold text-foreground/92">
                    <span className="truncate">{sourceLabel}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="truncate">{targetLabel}</span>
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Tooltip content="收起面板">
                    <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label="收起节点详情">
                      <ChevronsRight className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                  <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="收起检查器">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </header>

              <Separator />

              <ScrollArea className="min-h-0 flex-1" viewportClassName="px-3.5 py-3">
                <div className="flex flex-col gap-3">
                  <Field label="关系名称" hint="显示在连边上">
                    <Input
                      value={edgeLabelState[0]}
                      onChange={(event) => edgeLabelState[1](event.target.value)}
                      onBlur={() => {
                        const next = edgeLabelState[0].trim()
                        if (next && next !== edge.label) onPatchEdge({ label: next })
                        else edgeLabelState[1](edge.label)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                        if (event.key === 'Escape') edgeLabelState[1](edge.label)
                      }}
                    />
                  </Field>

                  <div className="grid grid-cols-2 items-end gap-3">
                    <Field label="类型">
                      <Select value={edge.type} onValueChange={(value) => onPatchEdge({ type: value as EdgeType })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EDGE_TYPE_ORDER.map((item) => (
                            <SelectItem key={item} value={item}>
                              {EDGE_TYPE_LABELS[item]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="flex h-8 items-center justify-between rounded-md border border-black/10 bg-black/[0.03] px-2.5">
                      <span className="text-micro text-muted-foreground">有向</span>
                      <Switch checked={edge.directed} onCheckedChange={(value) => onPatchEdge({ directed: value })} />
                    </div>
                  </div>

                  {/* 条件 / 可选流动：画布上用虚线表达（例如「halobox 可能是 None」这类只在特定配置下成立的数据流） */}
                  <div className="flex h-8 items-center justify-between rounded-md border border-black/10 bg-black/[0.03] px-2.5">
                    <span
                      className="text-micro text-muted-foreground"
                      title="虚线连线：这条数据流只在某些配置下才成立"
                    >
                      条件 / 可选（虚线）
                    </span>
                    <Switch
                      checked={Boolean(edge.conditional)}
                      onCheckedChange={(value) => onPatchEdge({ conditional: value })}
                    />
                  </div>

                  <Field label="备注" hint="可选">
                    <Textarea
                      value={edgeNoteState[0]}
                      onChange={(event) => edgeNoteState[1](event.target.value)}
                      onBlur={() => {
                        if (edgeNoteState[0] !== edge.note) onPatchEdge({ note: edgeNoteState[0].trim() })
                      }}
                      placeholder="记录依据或前提"
                      className="min-h-[56px]"
                    />
                  </Field>

                  <Separator />

                  <Button variant="secondary" onClick={onEditEdge}>
                    用对话框编辑
                  </Button>
                </div>
              </ScrollArea>

              <Separator />
              <div className="shrink-0 p-3">
                <Button variant="danger-ghost" className="w-full" onClick={onRemoveEdge}>
                  <Trash2 className="h-3.5 w-3.5" />
                  取消这条关系
                </Button>
              </div>
            </>
          ) : null}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
