/**
 * 物理图谱的详情面板：阶段 / 子过程 / 参数 / 论文，四种选择共用一栏。
 *
 * 面板里的每一行都能往回走一步：
 *   ·「落点」点开是源码预览（文件 + 行区间高亮）；
 *   ·「文献」点开是引用它的那一行源码；
 *   ·「文档」点开是 atlas 原文锚点。
 * 这正是本页的用途——**用物理语言读，用源码核**；面板本身不做任何判断（评估是人做的事）。
 */

import { BookOpen, ChevronRight, Code2, FileCode2, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { Badge, Separator } from './ui/badge'
import { Button } from './ui/button'
import {
  describeParam,
  edgesOfStage,
  formatRange,
  paperByKey,
  paramByName,
  physicsMap,
  stageById,
  subprocessById,
  subprocessesOfStage,
  type MapPlace,
  type Selection,
} from '../lib/physicsMap'

interface PhysicsMapDetailProps {
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  /** 打开源码预览并高亮行区间 */
  onOpenCode: (file: string, line: number | null, endLine: number | null) => void
  /** 打开 atlas 文档锚点 */
  onOpenDoc: (docId: string, anchor: string) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <div className="text-[11px] leading-relaxed text-foreground/85">{children}</div>
    </div>
  )
}

function Chip({ children, onClick, tone = 'slate' }: { children: React.ReactNode; onClick?: () => void; tone?: 'purple' | 'cyan' | 'rose' | 'slate' }) {
  const tones = {
    purple: 'bg-[#7E22CE]/10 text-[#7E22CE] hover:bg-[#7E22CE]/20',
    cyan: 'bg-[#0E7490]/10 text-[#0E7490] hover:bg-[#0E7490]/20',
    rose: 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20',
    slate: 'bg-black/[0.06] text-foreground/80 hover:bg-black/[0.12]',
  } as const
  if (!onClick) return <span className={cn('rounded px-1.5 py-0.5 text-[10px] leading-tight', tones[tone])}>{children}</span>
  return (
    <button type="button" onClick={onClick} className={cn('cursor-pointer rounded px-1.5 py-0.5 text-[10px] leading-tight transition-colors', tones[tone])}>
      {children}
    </button>
  )
}

/** 落点：符号 + 文件行区间，点开即看那几行 */
function Places({ places, onOpenCode }: { places: MapPlace[]; onOpenCode: PhysicsMapDetailProps['onOpenCode'] }) {
  if (!places.length) return <span className="text-muted-foreground">文档未给承担者</span>
  return (
    <ul className="flex flex-col gap-1">
      {places.map((place, index) => (
        <li key={`${place.unit}-${place.file}-${place.line}-${index}`}>
          <button
            type="button"
            onClick={() => onOpenCode(place.file, place.line, place.endLine)}
            className="group flex w-full cursor-pointer items-start gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-black/[0.05]"
          >
            <FileCode2 className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[10px] text-foreground/85">{place.symbol || place.unit}</span>
              <span className="block truncate font-mono text-[9px] text-muted-foreground">
                {place.file}:{place.line}
                {place.endLine ? `-${place.endLine}` : ''}
                {place.fileWide ? '（整文件）' : ''}
              </span>
            </span>
            <Code2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function PaperChips({ keys, onSelect, onOpenCode }: { keys: string[]; onSelect: PhysicsMapDetailProps['onSelect']; onOpenCode: PhysicsMapDetailProps['onOpenCode'] }) {
  if (!keys.length) return <span className="text-muted-foreground">源码注释里没有引用</span>
  return (
    <div className="flex flex-col gap-1.5">
      {keys.map((key) => {
        const paper = paperByKey.get(key)
        if (!paper) return null
        return (
          <div key={key} className="rounded-md border border-black/[0.07] bg-black/[0.02] px-2 py-1.5">
            <button type="button" onClick={() => onSelect({ kind: 'paper', id: key })} className="flex w-full cursor-pointer items-center gap-1.5 text-left">
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-rose-700">{paper.label}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{paper.refs.length} 处</span>
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            </button>
            {paper.refs.slice(0, 2).map((ref) => (
              <button
                key={`${ref.file}:${ref.line}`}
                type="button"
                onClick={() => onOpenCode(ref.file, ref.line, ref.line)}
                className="mt-1 block w-full cursor-pointer truncate text-left font-mono text-[9px] text-muted-foreground transition-colors hover:text-foreground"
                title={ref.text}
              >
                {ref.file}:{ref.line}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Title({ kind, id, title, subtitle, onClose }: { kind: string; id: string; title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-black/[0.07] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Badge tone="primary">{kind}</Badge>
          <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
        </div>
        <h3 className="mt-1 truncate text-[13px] font-semibold text-foreground/90" title={title}>
          {title}
        </h3>
        <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="关闭详情" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export function PhysicsMapDetail({ selection, onSelect, onOpenCode, onOpenDoc }: PhysicsMapDetailProps) {
  if (!selection) {
    return (
      <aside className="glass-panel flex w-[340px] shrink-0 flex-col overflow-hidden rounded-lg">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <BookOpen className="h-5 w-5 text-muted-foreground/60" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            点左侧的阶段卡片看它在算什么，或点开「子过程」下钻；
            <br />
            也可以在上方按参数、物理量、过程名、论文检索。
          </p>
        </div>
      </aside>
    )
  }

  const content = (() => {
    if (selection.kind === 'stage') {
      const stage = stageById.get(selection.id)
      if (!stage) return null
      const edges = edgesOfStage(stage.id)
      return (
        <>
          <Title kind="阶段" id={stage.id} title={stage.name} subtitle={`${stage.side || '未标侧'} · ${stage.subprocessIds.length} 个子过程`} onClose={() => onSelect(null)} />
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2.5">
            <Field label="作用与意义">{stage.summary}</Field>

            <Field label="产物与上下游">
              <div className="flex flex-col gap-1">
                {stage.inputs.length ? <span className="text-muted-foreground">输入：{stage.inputs.map((item) => `${item.p} ${item.name}`).join('、')}</span> : null}
                {stage.outputs.length ? <span>输出：{stage.outputs.map((item) => `${item.p} ${item.name}`).join('、')}</span> : null}
                {edges.in.map((edge) => (
                  <button key={`${edge.from}->${edge.to}`} type="button" onClick={() => onSelect({ kind: 'stage', id: edge.from })} className="cursor-pointer text-left text-[10px] text-muted-foreground transition-colors hover:text-foreground">
                    ← 由 {edge.from} {stageById.get(edge.from)?.name} 提供「{edge.via.p} {edge.via.name}」
                  </button>
                ))}
                {edges.out.map((edge) => (
                  <button key={`${edge.from}->${edge.to}`} type="button" onClick={() => onSelect({ kind: 'stage', id: edge.to })} className="cursor-pointer text-left text-[10px] text-muted-foreground transition-colors hover:text-foreground">
                    → 交给 {edge.to} {stageById.get(edge.to)?.name}，带去「{edge.via.p} {edge.via.name}」
                  </button>
                ))}
              </div>
            </Field>

            {stage.entryPoints.length ? <Field label="负责入口">{stage.entryPoints.map((entry) => `${entry.e} ${entry.name}`).join('、')}</Field> : null}

            <Field label={`子过程（${stage.subprocessIds.length}）`}>
              <ul className="flex flex-col gap-1">
                {subprocessesOfStage(stage.id).map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => onSelect({ kind: 'subprocess', id: node.id })}
                      className="w-full cursor-pointer rounded-md px-1.5 py-1 text-left transition-colors hover:bg-black/[0.05]"
                    >
                      <span className="block text-[10px] font-medium text-foreground/85">
                        <span className="mr-1 font-mono text-muted-foreground">{node.id}</span>
                        {node.name}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[10px] leading-relaxed text-muted-foreground">{node.summary}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Field>

            {stage.keyQuantities.length ? (
              <Field label={`关键量（${stage.keyQuantities.length}）`}>
                <div className="flex flex-wrap gap-1">
                  {stage.keyQuantities.map((quantity) => (
                    <Chip key={quantity} tone="cyan">
                      <span className="font-mono">{quantity}</span>
                    </Chip>
                  ))}
                </div>
              </Field>
            ) : null}

            {stage.params.length ? (
              <Field label={`涉及参数（${stage.params.length}）`}>
                <div className="flex flex-wrap gap-1">
                  {stage.params.map((name) => (
                    <Chip key={name} tone="cyan" onClick={() => onSelect({ kind: 'param', id: name })}>
                      <span className="font-mono">{name}</span>
                    </Chip>
                  ))}
                </div>
              </Field>
            ) : null}

            <Field label={`实现落点（${stage.units.length}）`}>
              <Places places={stage.units} onOpenCode={onOpenCode} />
            </Field>

            <Field label={`论文出处（${stage.papers.length}）`}>
              <PaperChips keys={stage.papers} onSelect={onSelect} onOpenCode={onOpenCode} />
            </Field>

            <Separator />
            <Button variant="secondary" size="sm" onClick={() => onOpenDoc('atlas/L1-stages.md', stage.anchor)}>
              <BookOpen className="h-3.5 w-3.5" />
              在 atlas 里读这一阶段
            </Button>
          </div>
        </>
      )
    }

    if (selection.kind === 'subprocess') {
      const node = subprocessById.get(selection.id)
      if (!node) return null
      const stage = stageById.get(node.stageId)
      return (
        <>
          <Title kind="子过程" id={node.id} title={node.name} subtitle={`属于 ${node.stageId} ${stage?.name ?? ''}`} onClose={() => onSelect(null)} />
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2.5">
            <Field label="作用与意义">{node.summary}</Field>

            <Field label="产物">
              <div className="flex flex-col gap-1">
                {node.inputs.length ? <span className="text-muted-foreground">输入：{node.inputs.map((item) => `${item.p} ${item.name}`).join('、')}</span> : null}
                {node.output.text ? <span>产出：{node.output.text}</span> : null}
                {node.output.products.length ? <span className="text-muted-foreground">对应产物：{node.output.products.map((item) => `${item.p} ${item.name}`).join('、')}</span> : null}
              </div>
            </Field>

            {node.keyProcess.length ? (
              <Field label="关键过程">
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {node.keyProcess.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Field>
            ) : null}

            {node.keyQuantities.length ? (
              <Field label={`关键量（${node.keyQuantities.length}）`}>
                <div className="flex flex-wrap gap-1">
                  {node.keyQuantities.map((quantity) => (
                    <Chip key={quantity} tone="cyan">
                      <span className="font-mono">{quantity}</span>
                    </Chip>
                  ))}
                </div>
              </Field>
            ) : null}

            {node.params.length ? (
              <Field label={`涉及参数（${node.params.length}）`}>
                <div className="flex flex-wrap gap-1">
                  {node.params.map((name) => (
                    <Chip key={name} tone="cyan" onClick={() => onSelect({ kind: 'param', id: name })}>
                      <span className="font-mono">{name}</span>
                    </Chip>
                  ))}
                </div>
              </Field>
            ) : null}

            <Field label={`实现落点（${node.units.length}）`}>
              <Places places={node.units} onOpenCode={onOpenCode} />
            </Field>

            <Field label={`论文出处（${node.papers.length}）`}>
              <PaperChips keys={node.papers} onSelect={onSelect} onOpenCode={onOpenCode} />
            </Field>

            {node.questions.length ? (
              <Field label="相关问法">
                <ul className="flex flex-col gap-1">
                  {node.questions.map((question) => (
                    <li key={question.text} className="text-muted-foreground">
                      「{question.text}」
                    </li>
                  ))}
                </ul>
              </Field>
            ) : null}

            <Separator />
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => onSelect({ kind: 'stage', id: node.stageId })}>
                看所属阶段 {node.stageId}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenDoc('atlas/L2-subprocesses.md', node.anchor)}>
                <BookOpen className="h-3.5 w-3.5" />
                atlas 原文
              </Button>
            </div>
          </div>
        </>
      )
    }

    if (selection.kind === 'param') {
      const param = paramByName.get(selection.id)
      if (!param) return null
      return (
        <>
          <Title kind="参数" id={param.group} title={param.name} subtitle={describeParam(param)} onClose={() => onSelect(null)} />
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2.5">
            <Field label="默认值 / 尺度">
              <div className="flex flex-wrap gap-1">
                <Chip tone="cyan">默认 {param.default === null ? '源码未写' : String(param.default)}</Chip>
                <Chip tone="cyan">{param.log10 ? '以 log10 存储' : '线性存储'}</Chip>
                {formatRange(param) ? <Chip tone="cyan">{formatRange(param)}</Chip> : null}
              </div>
            </Field>

            {param.choices?.length ? (
              <Field label={`可选值（${param.choices.length}）`}>
                <div className="flex flex-wrap gap-1">
                  {param.choices.map((choice) => (
                    <Chip key={choice} tone="slate">
                      <span className="font-mono">{choice}</span>
                    </Chip>
                  ))}
                </div>
              </Field>
            ) : null}

            <Field label="源码 docstring">
              {param.docstring ? <span className="text-foreground/80">{param.docstring}</span> : <span className="text-muted-foreground">源码里没写说明</span>}
            </Field>

            <Field label={`出现在这些阶段（${param.stages.length}）`}>
              {param.stages.length ? (
                <div className="flex flex-wrap gap-1">
                  {param.stages.map((stageId) => (
                    <Chip key={stageId} tone="purple" onClick={() => onSelect({ kind: 'stage', id: stageId })}>
                      {stageId} {stageById.get(stageId)?.name ?? ''}
                    </Chip>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">按当前口径没有命中任何阶段</span>
              )}
            </Field>

            {param.subprocesses.length ? (
              <Field label={`具体落在（${param.subprocesses.length} 个子过程）`}>
                <div className="flex flex-wrap gap-1">
                  {param.subprocesses.map((id) => (
                    <Chip key={id} tone="slate" onClick={() => onSelect({ kind: 'subprocess', id })}>
                      {id}
                    </Chip>
                  ))}
                </div>
              </Field>
            ) : null}

            <Field label={`相关论文（${param.papers.length}）`}>
              <PaperChips keys={param.papers} onSelect={onSelect} onOpenCode={onOpenCode} />
            </Field>

            <Separator />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              归属口径与「参数矩阵」同源（都扫 atlas L3 的承担者函数体）；默认值与范围直接取自
              <span className="font-mono"> wrapper/inputs.py</span>，源码没写就留空。
            </p>
          </div>
        </>
      )
    }

    const paper = paperByKey.get(selection.id)
    if (!paper) return null
    return (
      <>
        <Title kind="论文" id={String(paper.year)} title={paper.label} subtitle={`${paper.refs.length} 处引用${paper.venues.length ? ` · ${paper.venues.join(' / ')}` : ''}`} onClose={() => onSelect(null)} />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2.5">
          <Field label="在源码里的引用点">
            <ul className="flex flex-col gap-1.5">
              {paper.refs.map((ref) => (
                <li key={`${ref.file}:${ref.line}`}>
                  <button
                    type="button"
                    onClick={() => onOpenCode(ref.file, ref.line, ref.line)}
                    className="w-full cursor-pointer rounded-md px-1.5 py-1 text-left transition-colors hover:bg-black/[0.05]"
                  >
                    <span className="block font-mono text-[10px] text-foreground/85">
                      {ref.file}:{ref.line}
                      {ref.precision === 'file' ? '（同文件）' : ''}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[10px] leading-relaxed text-muted-foreground">{ref.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Field>

          {paper.stages.length ? (
            <Field label="归属阶段">
              <div className="flex flex-wrap gap-1">
                {paper.stages.map((stageId) => (
                  <Chip key={stageId} tone="purple" onClick={() => onSelect({ kind: 'stage', id: stageId })}>
                    {stageId} {stageById.get(stageId)?.name ?? ''}
                  </Chip>
                ))}
              </div>
            </Field>
          ) : null}

          {paper.params.length ? (
            <Field label="关联参数">
              <div className="flex flex-wrap gap-1">
                {paper.params.map((name) => (
                  <Chip key={name} tone="cyan" onClick={() => onSelect({ kind: 'param', id: name })}>
                    <span className="font-mono">{name}</span>
                  </Chip>
                ))}
              </div>
            </Field>
          ) : null}

          <Separator />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            文献只从源码注释与 docstring 里真实出现的引用抽取（共 {physicsMap.papers.length} 篇）；本页不做补全，也不做推荐。
          </p>
        </div>
      </>
    )
  })()

  if (!content) return null
  return <aside className="glass-panel flex w-[340px] shrink-0 flex-col overflow-hidden rounded-lg">{content}</aside>
}
