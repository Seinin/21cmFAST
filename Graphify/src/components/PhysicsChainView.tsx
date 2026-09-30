/**
 * 物理链页（与「画布」并列的那一页）。
 *
 * **复用第一页的前端模板，但不复用它的数据。**
 *   · 模板：同一个 `GraphCanvas`（取景/缩放/选中/标签高亮）、同一个右侧 `Inspector`、
 *     同一套抽屉（`CodePreviewDrawer` 看源码、`MdReaderDrawer` 看文档）。
 *   · 数据：这一页有自己的数据源（`GraphSourceProvider`，读生成物里的图 + 本地选中/标签），
 *     **不碰画布那个共享 store** —— 所以两边数据彻底分开，物理链的坐标不可能写进画布的数据里。
 *
 * 三条硬规矩：
 *   1. **只读**：这张图由生成物驱动（真源 `docs/notes/physics-chain/chain.json`），页面上的
 *      编辑动作一律说明"只读"，不假装能用。保存（Ctrl+S / 保存按钮）也走不到这一页。
 *   2. **首屏只有物理**：工程节点（"实现细节"话题）默认收起；代码与文档是"证据"，点开才出现。
 *   3. 视图只读生成物：阶段名单、参数、开关、落点全部来自 `physics-chain.json`，界面不写死。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { toast } from 'sonner'
import chainArtifact from '../generated/physics-chain.json'
import { GraphCanvas, type CanvasApi } from './GraphCanvas'
import { Inspector } from './Inspector'
import { CodePreviewDrawer } from './CodePreviewDrawer'
import { MdReaderDrawer } from './MdReaderDrawer'
import { GraphSourceProvider, type GraphSource } from '../graph/graphSource'
import { TabBar } from './TabBar'
/** 标签页的形状直接取自 `TabBar` 的入参（TabBar 没导出它的类型，也不猜字段） */
type TabInfo = ComponentProps<typeof TabBar>['tabs'][number]
import { type GraphRef, type Selection, type SelectionKind } from '../lib/types'
import type { LayoutKind } from '../graph/layout'
import { topicVisibility, topicVisibilityFingerprint } from '../lib/topics'
import {
  CHAIN_GRAPH,
  COLLAPSED_LAYER_LABEL,
  COLLAPSED_TOPIC_IDS,
  isCollapsedLayerObject,
  searchChain,
  type ChainHit,
} from '../lib/physicsChain'
import { cn } from '../lib/utils'

/** 生成物里另外两段：参数 → 作用的物理量/边，以及参数分组 */
const ARTIFACT = chainArtifact as unknown as {
  paramMatrix: Record<string, { nodes: string[]; edges: string[] }>
  params: {
    drivers: { name: string }[]
    astro: { name: string }[]
    numeric: { name: string }[]
    /** 宇宙学数值参数（与天体物理**分开**列：它们进的是公式系数与背景量，不是天体物理过程的旋钮） */
    cosmo?: { name: string }[]
    /** 效应开关：`gatesEdges` 就是它门控的那几条边（"开关写在箭头上"的依据） */
    effects: { name: string; role?: string; default?: unknown; gatesEdges?: string[]; basis?: string }[]
  }
}
const PARAM_MATRIX = ARTIFACT.paramMatrix
/**
 * 抽屉里的两组词条：**天体物理参数**与**宇宙学参数**分开列（用户口径）。
 * 只列"能落到图上某个量/边"的（在 `paramMatrix` 里有条目），否则点了也点不亮什么。
 */
const PARAM_SECTIONS: { title: string; names: string[] }[] = [
  {
    title: '天体物理参数',
    names: [...ARTIFACT.params.drivers, ...ARTIFACT.params.astro]
      .map((item) => item.name)
      .filter((name) => name in PARAM_MATRIX)
      .sort(),
  },
  {
    title: '宇宙学参数',
    names: (ARTIFACT.params.cosmo ?? [])
      .map((item) => item.name)
      .filter((name) => name in PARAM_MATRIX)
      .sort(),
  },
]
const PARAM_TOTAL = PARAM_SECTIONS.reduce((sum, section) => sum + section.names.length, 0)

/** 图例顺序＝首屏最常看的几类 */

/** 四路检索的类别标签（顺序＝命中面：参数 → 物理量 → 过程 → 文献） */
const HIT_LABELS: Record<ChainHit['kind'], string> = {
  param: '参数',
  quantity: '物理量',
  process: '过程',
  paper: '文献',
}

const readOnlyNotice = () =>
  toast.info('物理链是只读的', {
    description: '这一页由 physics-chain.json 生成；要改请改真源 docs/notes/physics-chain/chain.json 后重新生成。',
  })

/** 顶栏检索的一次性定位请求；`nonce` 让"再点一次同一条结果"也能重新定位 */
export interface ChainFocusRequest {
  kind: 'node' | 'edge'
  id: string
  nonce: number
}

interface PhysicsChainViewProps {
  /** 一次性定位请求（顶栏检索给出，由本页消费）；按 `nonce` 去重 */
  focus?: ChainFocusRequest | null
  /** 把「当前选中的对象名」报给 App（状态条要显示它） */
  onSelectionChange?: (label: string | null) => void
}

export function PhysicsChainView({ focus, onSelectionChange }: PhysicsChainViewProps) {
  /* -------- 这一页自己的数据：本地选中、本地标签，不借画布的 store -------- */
  const [selection, setSelection] = useState<Selection>({ kind: null, id: null })
  const [activeTagIds, setActiveTagIds] = useState<string[]>([])
  const [hoveredNodeId, setHovered] = useState<string | null>(null)
  const [hiddenRelationIds, setHiddenRelationIds] = useState<string[]>([])
  const select = useCallback((kind: SelectionKind, id: string | null) => setSelection({ kind, id }), [])

  const source: GraphSource = useMemo(
    () => ({
      graph: CHAIN_GRAPH,
      selection,
      select,
      hoveredNodeId,
      setHovered,
      activeTagIds,
      hiddenRelationIds,
      toggleHiddenRelations: (nodeId: string) =>
        setHiddenRelationIds((ids) => (ids.includes(nodeId) ? ids.filter((item) => item !== nodeId) : [...ids, nodeId])),
    }),
    [selection, select, hoveredNodeId, activeTagIds, hiddenRelationIds],
  )

  /* -------- 视图状态 -------- */
  /**
   * **手动摆放**：用生成物里那套"观测量在上、参数在下"的坐标。
   * 不用自动排布的原因：画布在"待排布"时会**跳过取景**（`if (!willPlace && active && !layoutIfPending()) fit()`），
   * 而布局本身一律不取景（`layout.ts` 写明"取景交给 fit()"）——于是初始大小与视野都会不对。
   */
  const [layout, setLayout] = useState<LayoutKind>('manual')
  /**
   * **子图**：与画布页同一套做法——双击一个模块就"进"到它里面（画布聚焦到该模块），
   * 顶部标签条记着走过的层级，可以来回切。此前这一页把 `onEnterSubgraph` 接成了只读提示，
   * 等于**一个子图都进不去**；现在真建。
   */
  const [tabs, setTabs] = useState<TabInfo[]>([{ id: 'chain:root', focusId: null, label: '物理链' }])
  const [activeTabId, setActiveTabId] = useState('chain:root')
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const openSubgraph = (nodeId: string) => {
    const id = `chain:${nodeId}`
    setTabs((list) => (list.some((tab) => tab.id === id) ? list : [...list, { id, focusId: nodeId, label: labelOf(nodeId) }]))
    setActiveTabId(id)
  }
  const closeTab = (id: string) => {
    setTabs((list) => list.filter((tab) => tab.id !== id))
    if (activeTabId === id) setActiveTabId('chain:root')
  }
  /** 「旁路与实现细节」是否展开：**默认收起**（首屏只有物理主链）；折叠条与检查器写同一个状态 */
  const [restOpen, setRestOpen] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [paramQuery, setParamQuery] = useState('')
  const [activeParam, setActiveParam] = useState<string | null>(null)
  const canvasApi = useRef<CanvasApi | null>(null)
  /** 证据出口：源码预览 / 文档阅读（与画布页同一套抽屉） */
  const [codeViewer, setCodeViewer] = useState<{ open: boolean; file: string | null; line: number | null; endLine: number | null }>({
    open: false,
    file: null,
    line: null,
    endLine: null,
  })
  const [reader, setReader] = useState<{ open: boolean; docId: string | null; anchor: string | null }>({
    open: false,
    docId: null,
    anchor: null,
  })

  /**
   * **首屏只有物理**：把「实现细节」与「旁路与后处理接口」两个话题一起关掉，
   * 一级于是只剩物理主链——用的是画布既有的过滤机制，不另造一套隐藏逻辑。
   * 展开折叠条时整图不过滤（`topicFilter` 传 null）。
   */
  const restVisibility = useMemo(() => topicVisibility(CHAIN_GRAPH, COLLAPSED_TOPIC_IDS), [])
  /** 折叠条上的 N：**现算**（挂了这两个话题的节点＝被收起来的那批），不写死数字 */
  const collapsedCount = useMemo(
    () =>
      CHAIN_GRAPH.nodes.filter((node) =>
        ((node as { topics?: string[] }).topics ?? []).some((topicId) => COLLAPSED_TOPIC_IDS.includes(topicId)),
      ).length,
    [],
  )

  const selectedNode = useMemo(
    () => (selection.kind === 'node' ? (CHAIN_GRAPH.nodes.find((node) => node.id === selection.id) ?? null) : null),
    [selection],
  )
  const selectedEdge = useMemo(
    () => (selection.kind === 'edge' ? (CHAIN_GRAPH.edges.find((edge) => edge.id === selection.id) ?? null) : null),
    [selection],
  )
  /** 这条连线上的开关：从生成物里"效应开关"那一组按 `gatesEdges` 认领，不手抄 */
  const edgeSwitches = useMemo(
    () => (selectedEdge ? ARTIFACT.params.effects.filter((effect) => (effect.gatesEdges ?? []).includes(selectedEdge.id)) : []),
    [selectedEdge],
  )

  const labelOf = useCallback((id: string) => CHAIN_GRAPH.nodes.find((node) => node.id === id)?.label ?? id, [])

  /**
   * 顶栏检索选中的对象：这一页的选中是**本地状态**（不碰画布那个共享 store），
   * 所以由 App 递一个一次性请求过来，按 `nonce` 消费。若命中项属于**被收起的那一层**
   * （旁路 / 实现细节），先展开折叠条——否则会出现"选中了却看不见"。
   */
  const lastFocusNonce = useRef<number | null>(null)
  useEffect(() => {
    if (!focus || lastFocusNonce.current === focus.nonce) return
    lastFocusNonce.current = focus.nonce
    if (isCollapsedLayerObject(focus.kind, focus.id)) setRestOpen(true)
    select(focus.kind, focus.id)
  }, [focus, select])

  /** 当前选中的对象名：报给 App，状态条显示它（本页的选中在本地，App 看不到） */
  const selectionLabel = useMemo(() => {
    if (selection.kind === 'node') return selection.id ? labelOf(selection.id) : null
    if (!selectedEdge) return null
    return selectedEdge.label || `${labelOf(selectedEdge.source)} → ${labelOf(selectedEdge.target)}`
  }, [selection, selectedEdge, labelOf])
  useEffect(() => {
    onSelectionChange?.(selectionLabel)
  }, [selectionLabel, onSelectionChange])
  /** 子图索引（生成物里就有）：模块 id → 它内部的步骤。检查器的「进入子图」按它决定显不显示 */
  const subgraphs = (CHAIN_GRAPH as unknown as { subgraphs?: Record<string, { steps: string[] }> }).subgraphs ?? {}
  /** 直系子节点数：有子节点的模块才显示「进入子图 ↗」（数字现算，不写死） */
  const childCountOf = (id: string | null) =>
    id ? (subgraphs[id]?.steps.length ?? CHAIN_GRAPH.nodes.filter((node) => node.parent === id).length) : 0

  /** 点参数词条＝把它作用的模块点亮（画布的标签高亮），再选中最前面那个 */
  const showParam = (name: string) => {
    if (activeParam === name) {
      setActiveParam(null)
      setActiveTagIds([])
      return
    }
    setActiveParam(name)
    setActiveTagIds([`tag:${name}`])
    const first = PARAM_MATRIX[name]?.nodes?.[0]
    if (first) select('node', first)
  }

  const paramList = useMemo(
    () =>
      PARAM_SECTIONS.map((section) => ({
        title: section.title,
        names: section.names.filter((name) => name.toLowerCase().includes(paramQuery.trim().toLowerCase())),
      })),
    [paramQuery],
  )

  /**
   * 本页检索：空查询＝默认的两组参数词条；有查询＝**四路命中**
   * （参数 / 物理量 / 过程名 / 论文出处，每条带来源标注与数量说明）。
   * 命中收起层里的对象时，点一下先展开折叠条再选中——检索能直达一切，但不污染一级。
   */
  const chainHits = useMemo(() => searchChain(paramQuery), [paramQuery])
  const searching = Boolean(paramQuery.trim())
  const focusHit = (hit: ChainHit) => {
    if (hit.kind === 'param') {
      setActiveParam(hit.id)
      setActiveTagIds([`tag:${hit.id}`])
    } else {
      setActiveParam(null)
      setActiveTagIds([])
    }
    if (hit.layer === 'bypass') setRestOpen(true)
    if (hit.focus) select(hit.focus.kind, hit.focus.id)
  }

  /** 「看引用」：有源码落点就开源码预览，否则开文档阅读（与画布页的判断口径一致：先看 file） */
  const openRef = (ref: GraphRef) => {
    if (ref.file) {
      setCodeViewer({ open: true, file: ref.file, line: ref.line ?? null, endLine: ref.endLine ?? null })
      return
    }
    if (ref.docId) {
      setReader({ open: true, docId: ref.docId, anchor: ref.anchor ?? null })
      return
    }
    toast.info('这条引用没有可打开的内容', { description: '既没有源码落点，也没有文档锚点。' })
  }

  return (
    /* 右侧是检查器，所以这一页横向分两栏：画布（弹性）+ 检查器（定宽、可收起） */
    <div className="relative flex min-h-0 min-w-0 flex-1 gap-2">
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <GraphSourceProvider value={source}>
          <GraphCanvas
            // key 按标签页：换子图就换实例，渲染器才会按新的聚焦重新装配
            key={activeTabId}
            focusId={activeTab.focusId}
            active
            ready
            layout={layout}
            connectSource={null}
            refDragPayload={null}
            topicFilter={restOpen ? null : restVisibility}
            topicKey={restOpen ? 'rest-open' : topicVisibilityFingerprint(restVisibility)}
            onLayoutChange={setLayout}
            onEnterSubgraph={openSubgraph}
            onOpenTagDetail={(nodeId, tagId) => {
              select('node', nodeId)
              setActiveTagIds([tagId])
            }}
            onConnectComplete={readOnlyNotice}
            onConnectCancel={readOnlyNotice}
            onAddRefToNode={readOnlyNotice}
            onRequestCreateNode={readOnlyNotice}
            onRequestCreateEdge={readOnlyNotice}
            onRequestEditNode={readOnlyNotice}
            onRequestEditEdge={readOnlyNotice}
            onRequestDeleteNode={readOnlyNotice}
            onRequestDeleteEdge={readOnlyNotice}
            onFocusLibrary={readOnlyNotice}
            onOpenImport={readOnlyNotice}
            onPositionsSettled={() => {}}
            onPositionEditStart={() => {}}
            registerApi={(api) => {
              canvasApi.current = api
            }}
          />
        </GraphSourceProvider>

        {/* 顶部：子图标签条（双击模块进去、点标签来回切；与画布页同一个组件） */}
        {tabs.length > 1 || activeTab.focusId ? (
          <div className="pointer-events-auto absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <TabBar tabs={tabs} activeTabId={activeTabId} onActivate={setActiveTabId} onClose={closeTab} />
          </div>
        ) : null}

        {/* 左上：这一页是什么、为什么只读；图例按种类分色 */}
        <div className="pointer-events-none absolute left-4 top-4 max-w-[22rem] space-y-2">
          {/* 天体物理参数抽屉：词条可检索；选中就点亮它作用的模块 */}
          <div className="pointer-events-auto w-[21rem] rounded-lg border border-slate-200 bg-white/94 shadow-sm backdrop-blur">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-semibold text-slate-700"
              onClick={() => setDrawerOpen((open) => !open)}
            >
              <span>检索与参数词条（{PARAM_TOTAL}）</span>
              <span className="text-slate-400">{drawerOpen ? '收起' : '展开'}</span>
            </button>
            {drawerOpen ? (
              <div className="border-t border-slate-100 px-3 py-2">
                <input
                  value={paramQuery}
                  onChange={(event) => setParamQuery(event.target.value)}
                  placeholder="搜参数、物理量、过程或论文出处"
                  className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-[12px] outline-none focus:border-slate-400"
                />
                <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                  {searching ? (
                    /* 有查询＝四路命中：参数 / 物理量 / 过程名 / 论文出处；每条写明来源与数量说明 */
                    chainHits.hits.length ? (
                      chainHits.hits.map((hit) => (
                        <button
                          key={`${hit.kind}:${hit.id}`}
                          type="button"
                          onClick={() => focusHit(hit)}
                          title={hit.label}
                          className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-100"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                              {HIT_LABELS[hit.kind]}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-800">{hit.label}</span>
                            {hit.layer === 'bypass' ? (
                              <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                                {COLLAPSED_LAYER_LABEL}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{hit.detail}</span>
                        </button>
                      ))
                    ) : (
                      <p className="px-2 py-1 text-[11px] text-slate-500">没有匹配的参数、物理量、过程或论文出处</p>
                    )
                  ) : (
                    /* 空查询＝默认词条：天体物理参数与宇宙学参数各一组 */
                    paramList.map((section) => (
                      <div key={section.title}>
                        <div className="px-1 pb-1 text-[10px] font-medium text-slate-400">
                          {section.title}（{section.names.length}）
                        </div>
                        <ul className="space-y-0.5">
                          {section.names.map((name) => (
                            <li key={name}>
                              <button
                                type="button"
                                onClick={() => showParam(name)}
                                className={cn(
                                  'flex w-full items-center justify-between rounded px-2 py-1 text-left font-mono text-[11px]',
                                  activeParam === name ? 'bg-amber-100 text-amber-900' : 'text-slate-700 hover:bg-slate-100',
                                )}
                              >
                                <span className="truncate">{name}</span>
                                <span className="ml-2 shrink-0 text-slate-400">{PARAM_MATRIX[name]?.nodes.length ?? 0} 处</span>
                              </button>
                            </li>
                          ))}
                          {section.names.length ? null : <li className="px-2 py-1 text-[11px] text-slate-500">没有匹配</li>}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
                {activeParam ? (
                  <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-5 text-slate-600">
                    <span className="font-medium text-slate-700">{activeParam}</span> 作用于：
                    {(PARAM_MATRIX[activeParam]?.nodes ?? []).map((id) => labelOf(id)).join('、') || '（还没定位到模块）'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 选中连线时：箭头上的开关（是哪个开关、默认值、关掉会怎样；依据默认收起） */}
          {selectedEdge ? (
            <div className="pointer-events-auto w-[21rem] rounded-lg border border-slate-200 bg-white/94 px-3 py-2 shadow-sm backdrop-blur">
              <div className="text-[12px] font-semibold text-slate-800">
                连线{selectedEdge.label ? ` · ${selectedEdge.label}` : ''}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">
                {labelOf(selectedEdge.source)} → {labelOf(selectedEdge.target)}
              </div>
              {edgeSwitches.length ? (
                <ul className="mt-2 space-y-1.5">
                  {edgeSwitches.map((effect) => (
                    <li key={effect.name} className="rounded border border-slate-100 px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-semibold text-slate-800">{effect.name}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">默认 {String(effect.default)}</span>
                      </div>
                      {effect.role ? <p className="mt-1 text-[11px] leading-5 text-slate-600">{effect.role}</p> : null}
                      {effect.basis ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-slate-500">看依据（代码读点）</summary>
                          <p className="mt-1 text-[11px] leading-5 text-slate-500">{effect.basis}</p>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">这条没有开关：它在任何配置下都走。</p>
              )}
            </div>
          ) : null}
        </div>

        {/*
          底部居中：**常驻折叠条**。一级只讲物理主链——「旁路与后处理接口」与「实现细节」
          默认一起收起，需要时一键展开；N 现算（挂了这两个话题的节点数），不写死。
        */}
        <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
          <button
            type="button"
            onClick={() => setRestOpen((open) => !open)}
            aria-expanded={restOpen}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] shadow-sm backdrop-blur transition-colors',
              restOpen
                ? 'border-slate-300 bg-white/95 text-slate-700 hover:bg-white'
                : 'border-slate-200 bg-white/90 text-slate-600 hover:bg-white',
            )}
          >
            <span className="font-medium">旁路与实现细节（{collapsedCount} 项）</span>
            <span className="text-slate-400">· 不属于物理链</span>
            <span className="text-slate-500">{restOpen ? '收起' : '展开'}</span>
          </button>
        </div>
      </div>

      {/* 右侧：第一页同款检查器（它就是纯入参组件，所以能原样复用） */}
      <Inspector
        node={selectedNode}
        edge={selectedEdge}
        sourceLabel={selectedEdge ? labelOf(selectedEdge.source) : ''}
        targetLabel={selectedEdge ? labelOf(selectedEdge.target) : ''}
        topics={CHAIN_GRAPH.meta.topics ?? []}
        // 检查器里点这两个话题与底部折叠条是**同一个状态**：展开「旁路与实现细节」
        onOpenTopic={(topicId) => {
          if (COLLAPSED_TOPIC_IDS.includes(topicId)) setRestOpen(true)
        }}
        onPatchNode={readOnlyNotice}
        onPatchEdge={readOnlyNotice}
        onRemoveNode={readOnlyNotice}
        onRemoveEdge={readOnlyNotice}
        onEditEdge={readOnlyNotice}
        onConnectFrom={readOnlyNotice}
        onOpenRef={openRef}
        onRemoveRef={readOnlyNotice}
        onAddCodeRef={readOnlyNotice}
        // 证据（代码落点 / 文献引用）默认收起：这一页先讲物理，点「看实现 / 看文献」才铺开
        evidence="collapsed"
        groupOptions={[]}
        childCount={childCountOf(selectedNode?.id ?? null)}
        onEnterSubgraph={() => {
          if (selectedNode) openSubgraph(selectedNode.id)
          else readOnlyNotice()
        }}
        tagRegistry={CHAIN_GRAPH.meta.tags ?? []}
        activeTagId={activeTagIds[0] ?? null}
        onCreateTag={readOnlyNotice}
        onSelectRelation={(edgeId) => select('edge', edgeId)}
        relationsHidden={false}
        onToggleRelations={(nodeId) => source.toggleHiddenRelations(nodeId)}
        width={336}
        collapsed={inspectorCollapsed}
        onToggleCollapsed={() => setInspectorCollapsed((value) => !value)}
        onClose={() => select(null, null)}
      />

      {/* 证据出口：源码预览（文件 + 行区间）与文档阅读（docId + 锚点） */}
      <CodePreviewDrawer
        open={codeViewer.open}
        onOpenChange={(open) => setCodeViewer((state) => ({ ...state, open }))}
        file={codeViewer.file}
        line={codeViewer.line}
        endLine={codeViewer.endLine}
        canAddRef={false}
        onAddRef={readOnlyNotice}
      />
      <MdReaderDrawer
        open={reader.open}
        onOpenChange={(open) => setReader((state) => ({ ...state, open }))}
        docId={reader.docId}
        anchor={reader.anchor}
        canAddRef={false}
        onAddRef={readOnlyNotice}
      />
    </div>
  )
}
