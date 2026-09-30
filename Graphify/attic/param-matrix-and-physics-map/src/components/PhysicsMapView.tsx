/**
 * 物理图谱（应用第三页）：把代码实现翻成物理语言的图谱。
 *
 * 读法（与画布一致的一条）：**边写的是产物**——「谁产出、谁消费」。卡片是物理阶段，
 * 点开卡片里的「子过程」下钻，每个子过程都有「实现落点」，一跳就是源码那几行。
 *
 * 数据来自 `src/lib/physicsMap.ts`（生成物），本组件不解析文档、不读源码。
 * 页面上不出现函数名与文件路径的**叙述**（那是落点按钮里的事），评估与否由使用者决定。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Atom, ChevronDown, ChevronRight, Info, Search } from 'lucide-react'
import { cn } from '../lib/utils'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { PhysicsMapDetail } from './PhysicsMapDetail'
import type { PhysicsMapStatus } from './StatusBar'
import {
  edgesOfStage,
  paperByKey,
  physicsMap,
  searchPhysicsMap,
  stageById,
  stageGroups,
  subprocessById,
  subprocessesOfStage,
  type MapStage,
  type SearchHit,
  type Selection,
} from '../lib/physicsMap'

interface PhysicsMapViewProps {
  /** 打开源码预览并高亮行区间（由 App 接到既有的 CodePreviewDrawer） */
  onOpenCode: (file: string, line: number | null, endLine: number | null) => void
  /** 打开 atlas 文档锚点（由 App 接到既有的 notes 阅读器） */
  onOpenDoc: (docId: string, anchor: string) => void
  /** 上报状态条口径（阶段/子过程/参数/文献数 + 当前动作） */
  onStatus: (status: PhysicsMapStatus) => void
}

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  process: '阶段',
  subprocess: '子过程',
  param: '参数',
  quantity: '关键量',
  paper: '论文',
  question: '问句',
}

function StageCard({
  stage,
  selection,
  expanded,
  onSelect,
  onToggle,
}: {
  stage: MapStage
  selection: Selection | null
  expanded: boolean
  onSelect: (selection: Selection | null) => void
  onToggle: () => void
}) {
  const edges = edgesOfStage(stage.id)
  const children = subprocessesOfStage(stage.id)
  const isStageSelected = selection?.kind === 'stage' && selection.id === stage.id

  return (
    <article
      className={cn(
        'glass-panel flex w-[252px] shrink-0 flex-col rounded-lg p-2.5 transition-all',
        isStageSelected ? 'ring-2 ring-[#7E22CE]/40' : 'hover:shadow-md',
      )}
    >
      <button type="button" onClick={() => onSelect({ kind: 'stage', id: stage.id })} className="cursor-pointer text-left">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold text-[#7E22CE]">{stage.id}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground/90">{stage.name}</span>
          {stage.side ? <span className="shrink-0 rounded bg-black/[0.05] px-1 py-0.5 text-[9px] text-muted-foreground">{stage.side}</span> : null}
        </div>
        <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{stage.summary}</p>
      </button>

      {stage.outputs.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {stage.outputs.map((product) => (
            <span key={product.p} className="rounded bg-[#7E22CE]/10 px-1.5 py-0.5 text-[10px] leading-tight text-[#7E22CE]">
              {product.p} {product.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="tabular-nums">
          {children.length} 子过程 · {stage.params.length} 参数 · {stage.papers.length} 文献
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex cursor-pointer items-center gap-0.5 rounded px-1 py-0.5 transition-colors hover:bg-black/[0.06] hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          子过程
        </button>
      </div>

      {expanded ? (
        <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-black/[0.06] pt-1.5">
          {children.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelect({ kind: 'subprocess', id: node.id })}
                className={cn(
                  'w-full cursor-pointer rounded px-1.5 py-1 text-left transition-colors hover:bg-black/[0.05]',
                  selection?.kind === 'subprocess' && selection.id === node.id && 'bg-black/[0.07]',
                )}
              >
                <span className="block truncate text-[10px] font-medium text-foreground/85">
                  <span className="mr-1 font-mono text-muted-foreground">{node.id}</span>
                  {node.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex flex-col gap-0.5 border-t border-black/[0.06] pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {edges.in.map((edge) => (
          <button
            key={`in-${edge.from}`}
            type="button"
            onClick={() => onSelect({ kind: 'stage', id: edge.from })}
            className="cursor-pointer text-left transition-colors hover:text-foreground"
            title={`${edge.from} ${stageById.get(edge.from)?.name ?? ''} → 本阶段`}
          >
            ← {edge.from} 带来「{edge.via.p} {edge.via.name}」
          </button>
        ))}
        {edges.out.map((edge) => (
          <button
            key={`out-${edge.to}`}
            type="button"
            onClick={() => onSelect({ kind: 'stage', id: edge.to })}
            className="cursor-pointer text-left transition-colors hover:text-foreground"
            title={`本阶段 → ${edge.to} ${stageById.get(edge.to)?.name ?? ''}`}
          >
            → 「{edge.via.p} {edge.via.name}」交给 {edge.to}
          </button>
        ))}
        {!edges.in.length && !edges.out.length ? <span className="text-muted-foreground/70">不直接产出 L0 产物（供查询或落盘）</span> : null}
      </div>
    </article>
  )
}

export function PhysicsMapView({ onOpenCode, onOpenDoc, onStatus }: PhysicsMapViewProps) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [expandedStage, setExpandedStage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hitsOpen, setHitsOpen] = useState(false)

  const hits = useMemo(() => searchPhysicsMap(query, 36), [query])
  const groups = useMemo(() => stageGroups(), [])
  const stats = physicsMap.stats

  const action = useMemo(() => {
    if (!selection) return null
    if (selection.kind === 'stage') return `已打开阶段：${selection.id} ${stageById.get(selection.id)?.name ?? ''}`
    if (selection.kind === 'subprocess') return `已打开子过程：${selection.id} ${subprocessById.get(selection.id)?.name ?? ''}`
    if (selection.kind === 'param') return `已打开参数：${selection.id}`
    return `已打开论文：${paperByKey.get(selection.id)?.label ?? selection.id}`
  }, [selection])

  useEffect(() => {
    onStatus({
      stages: stats.stages,
      subprocesses: stats.subprocesses,
      params: stats.params,
      papers: stats.papers,
      action,
    })
  }, [action, onStatus, stats.papers, stats.params, stats.stages, stats.subprocesses])

  /** 选中即定位：子过程顺带展开它所属的阶段，阶段顺带展开自己 */
  const pick = useCallback((next: Selection | null) => {
    setSelection(next)
    setHitsOpen(false)
    setQuery('')
    if (next?.kind === 'subprocess') setExpandedStage(subprocessById.get(next.id)?.stageId ?? null)
    if (next?.kind === 'stage') setExpandedStage(next.id)
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="glass-panel flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-1.5">
        <div className="flex min-w-0 flex-1 basis-[300px] items-center gap-2 text-[12px] text-muted-foreground">
          <Atom className="h-3.5 w-3.5 shrink-0 text-[#7E22CE]" />
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground/85">读法</span>
            卡片是物理阶段，边写的是产物（谁产出、谁消费）；点「子过程」下钻，落点一跳就是源码
            <Info className="h-3 w-3 shrink-0 opacity-60" />
          </span>
        </div>

        <div className="relative w-[300px] shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setHitsOpen(true)
            }}
            onFocus={() => setHitsOpen(true)}
            onBlur={() => setTimeout(() => setHitsOpen(false), 160)}
            placeholder="按参数 / 物理量 / 过程名 / 论文检索…"
            className="pl-8"
            aria-label="检索物理图谱"
          />
          {hitsOpen && query.trim() ? (
            <div className="glass-panel absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[360px] animate-in fade-in-0 slide-in-from-top-2 overflow-y-auto rounded-lg p-1">
              {hits.length ? (
                hits.map((hit) => (
                  <button
                    key={`${hit.kind}-${hit.label}-${hit.selection.kind}-${hit.selection.id}`}
                    type="button"
                    onMouseDown={() => pick(hit.selection)}
                    className="flex w-full cursor-pointer items-start justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-black/[0.06]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-micro text-foreground/90">{hit.label}</span>
                      {hit.detail ? <span className="block truncate text-[10px] text-muted-foreground">{hit.detail}</span> : null}
                    </span>
                    <Badge tone={hit.kind === 'paper' ? 'primary' : 'muted'}>{KIND_LABEL[hit.kind]}</Badge>
                  </button>
                ))
              ) : (
                <p className="px-2.5 py-3 text-micro text-muted-foreground">没有匹配的参数、物理量、过程或论文</p>
              )}
            </div>
          ) : null}
        </div>

        <span className="hidden shrink-0 tabular-nums text-[11px] text-muted-foreground/80 xl:inline">
          {stats.stages} 阶段 · {stats.subprocesses} 子过程 · {stats.params} 参数 · {stats.papers} 文献
        </span>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 gap-2">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {groups.map((group) => (
            <section key={group.name} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-[12px] font-semibold text-foreground/85">{group.name}</h2>
                <span className="text-[10px] text-muted-foreground">{group.hint}</span>
                <span className="tabular-nums text-[10px] text-muted-foreground/70">{group.stages.length} 个阶段</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.stages.map((stage) => (
                  <StageCard
                    key={stage.id}
                    stage={stage}
                    selection={selection}
                    expanded={expandedStage === stage.id}
                    onSelect={pick}
                    onToggle={() => setExpandedStage((current) => (current === stage.id ? null : stage.id))}
                  />
                ))}
              </div>
            </section>
          ))}

          <p className="pb-2 text-[10px] leading-relaxed text-muted-foreground/80">
            阶段与子过程的文字、关键量、关键过程都取自 <span className="font-mono">docs/notes/atlas</span> 原文；
            参数默认值与范围取自 <span className="font-mono">wrapper/inputs.py</span>；文献是源码注释里真实出现的引用。
            生成物戳记为 <span className="font-mono">{physicsMap.stamp}</span>，本页只读它，不写任何东西。
          </p>
        </div>

        <PhysicsMapDetail selection={selection} onSelect={pick} onOpenCode={onOpenCode} onOpenDoc={onOpenDoc} />
      </div>
    </div>
  )
}
