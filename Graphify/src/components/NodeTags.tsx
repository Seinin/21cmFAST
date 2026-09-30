import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Plus, Tag, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { cn } from '../lib/utils'
import { tagAccentOf, withAlpha } from '../graph/palette'
import {
  codeRefLocation,
  isCodeRef,
  type GraphNode,
  type GraphRef,
  type TagDefinition,
  type TagDetailItem,
} from '../lib/types'

/**
 * 类别色 → 一组 CSS 自定义属性。
 *
 * 为什么绕这一道：Tailwind 只认**静态**类名，`text-${accent}` 这种拼接在构建时会被丢掉
 * （而且不报错、线上就是没颜色）。所以类名一律写成固定的 `text-[var(--tag-accent)]`，
 * 真正的色值由行内 style 变量带进来——颜色只有 palette / 数据一个真源，悬停态也能跟着变。
 */
function accentVars(accent: string): React.CSSProperties {
  return {
    '--tag-accent': accent,
    '--tag-accent-70': withAlpha(accent, 0.7),
    '--tag-accent-25': withAlpha(accent, 0.25),
    '--tag-accent-20': withAlpha(accent, 0.2),
    '--tag-accent-8': withAlpha(accent, 0.08),
    '--tag-accent-4': withAlpha(accent, 0.04),
  } as React.CSSProperties
}

/**
 * 标签编辑：从**注册表**里多选，也可以当场新建。
 *
 * 自由文本输入已经移除——落盘数据里只允许出现注册表里的 id，
 * 否则「改名不动归属」这条承诺就不成立（名字变了，归属就找不到自己了）。
 */
export function NodeTagEditor({
  node,
  registry,
  onPatchNode,
  onCreateTag,
}: {
  node: GraphNode
  registry: TagDefinition[]
  onPatchNode: (patch: Partial<GraphNode>) => void
  onCreateTag?: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(registry.map((tag) => [tag.id, tag])), [registry])

  const candidates = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return registry
    return registry.filter((tag) => tag.name.toLowerCase().includes(keyword))
  }, [registry, query])

  const exact = query.trim() && registry.some((tag) => tag.name.trim() === query.trim())

  const toggle = (tagId: string) => {
    const next = node.tags.includes(tagId) ? node.tags.filter((id) => id !== tagId) : [...node.tags, tagId]
    // 明细由服务端按新归属裁剪：摘掉标签，它的明细一并消失，不留悬空数据
    onPatchNode({ tags: next })
  }

  const create = () => {
    const name = query.trim()
    if (!name) return
    onCreateTag?.(name)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {node.tags.map((tagId) => {
        const def = byId.get(tagId)
        // 类别色：数据里的 color 优先，缺省按 group 派生（见 palette 的 tagAccentOf）
        const accent = tagAccentOf(def ?? {})
        return (
          <span
            key={tagId}
            className="flex items-center gap-0.5 rounded-full border border-[var(--tag-accent-25)] bg-[var(--tag-accent-8)] py-[1px] pl-2 pr-1 text-micro text-[var(--tag-accent)]"
            style={accentVars(accent)}
          >
            {/* 名字区只显示不可点：删除只认叉号本身，避免误删（外层 Field 也不再包 label，见 ui/input.tsx） */}
            <span className="cursor-default select-none">{def?.name ?? tagId}</span>
            <button
              type="button"
              aria-label={`移除标签 ${def?.name ?? tagId}`}
              title="移除标签"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                toggle(tagId)
              }}
              className="flex h-3 w-3 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--tag-accent-70)] transition-colors hover:bg-[var(--tag-accent-20)] hover:text-[var(--tag-accent)]"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        )
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-black/15 px-2 py-[1px] text-micro text-muted-foreground transition-colors hover:border-black/25 hover:text-foreground"
          >
            <Plus className="h-2.5 w-2.5" />
            标签
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          <div className="border-b border-black/[0.06] p-1.5">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !exact && query.trim()) create()
              }}
              placeholder="搜索或输入新标签"
              className="h-7 text-micro"
              aria-label="搜索或新建标签"
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto p-1">
            {candidates.map((tag) => {
              const checked = node.tags.includes(tag.id)
              const accent = tagAccentOf(tag)
              return (
                <button
                  key={tag.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(tag.id)}
                  title={tag.description || undefined}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-black/[0.05]"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                      checked
                        ? 'border-[var(--tag-accent)] bg-[var(--tag-accent)] text-white'
                        : 'border-black/20 bg-white/70',
                    )}
                    style={accentVars(accent)}
                  >
                    {checked ? '✓' : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-micro text-[var(--tag-accent)]">{tag.name}</span>
                </button>
              )
            })}
            {query.trim() && !exact ? (
              <Button variant="secondary" size="sm" className="mt-1 w-full" onClick={create}>
                <Plus className="h-3 w-3" />
                新建标签「{query.trim()}」
              </Button>
            ) : null}
            {!candidates.length && !query.trim() ? (
              <p className="px-2 py-3 text-micro text-muted-foreground">注册表里还没有标签</p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** 明细按「用法」分组，保持首次出现的顺序（赋值 / 入公式 / 开关 之类） */
function groupByKind(items: TagDetailItem[]): Array<[string, TagDetailItem[]]> {
  const groups = new Map<string, TagDetailItem[]>()
  items.forEach((item) => {
    const kind = item.kind?.trim() || '其它'
    const bucket = groups.get(kind)
    if (bucket) bucket.push(item)
    else groups.set(kind, [item])
  })
  return [...groups.entries()]
}

function DetailRow({ item, onOpenRef }: { item: TagDetailItem; onOpenRef: (ref: GraphRef) => void }) {
  const ref = item.ref ?? null
  const location = ref ? (isCodeRef(ref) ? codeRefLocation(ref) : `${ref.docId}${ref.anchor ? `#${ref.anchor}` : ''}`) : ''
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded-md px-1.5 py-1 transition-colors hover:bg-black/[0.03]">
      <span className="font-mono text-micro text-foreground/90">{item.label}</span>
      {item.note ? <span className="text-micro text-muted-foreground/80">{item.note}</span> : null}
      {ref && location ? (
        <button
          type="button"
          onClick={() => onOpenRef(ref)}
          className="flex cursor-pointer items-center gap-0.5 font-mono text-[10px] text-cyan-700 transition-colors hover:text-cyan-800"
          title="打开出处"
        >
          {location}
          <ExternalLink className="h-2.5 w-2.5" />
        </button>
      ) : null}
    </li>
  )
}

/**
 * 属性面板的标签区块：列出本节点的标签（名称 + 说明），按标签展开明细。
 *
 * 明细条目就是「这个标签在这一处具体是什么」——参数参与标签里是
 * 「参数名 · 用法（赋值/入公式/开关）· 出处行号」，出处可点开对照源码。
 */
export function NodeTagSection({
  node,
  registry,
  activeTagId,
  onOpenRef,
}: {
  node: GraphNode
  registry: TagDefinition[]
  activeTagId?: string | null
  onOpenRef: (ref: GraphRef) => void
}) {
  const [expanded, setExpanded] = useState<string[]>(() => (activeTagId ? [activeTagId] : []))
  const byId = useMemo(() => new Map(registry.map((tag) => [tag.id, tag])), [registry])

  // 点画布红点带过来的标签：自动展开（不收起用户已经展开的其它标签）
  useEffect(() => {
    if (!activeTagId) return
    setExpanded((prev) => (prev.includes(activeTagId) ? prev : [...prev, activeTagId]))
  }, [activeTagId])

  if (!node.tags.length) {
    return (
      <p className="rounded-md border border-dashed border-black/10 px-2.5 py-3 text-micro leading-relaxed text-muted-foreground">
        这个节点还没有全局标签。点上方「标签」从注册表里选，或新建一个。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {node.tags.map((tagId) => {
        const def = byId.get(tagId)
        const items = node.tagDetails?.[tagId] ?? []
        const isOpen = expanded.includes(tagId)
        // 整行按类别上色（边框 / 淡底 / 图标 / 名字）；计数、展开箭头与行分隔线保持中性
        const accent = tagAccentOf(def ?? {})
        return (
          <div
            key={tagId}
            className="overflow-hidden rounded-md border border-[var(--tag-accent-20)] bg-[var(--tag-accent-4)]"
            style={accentVars(accent)}
          >
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]))
              }
              className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--tag-accent-8)]"
              aria-expanded={isOpen}
            >
              <Tag className="h-3 w-3 shrink-0 text-[var(--tag-accent)]" />
              <span className="min-w-0 flex-1 truncate text-micro font-medium text-[var(--tag-accent)]">
                {def?.name ?? tagId}
              </span>
              <span className="shrink-0 tabular-nums text-micro text-muted-foreground/70">{items.length} 条</span>
              {isOpen ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              )}
            </button>
            {isOpen ? (
              <div className="flex flex-col gap-2 border-t border-black/[0.06] px-2.5 py-2">
                {def?.description ? (
                  <p className="text-micro leading-relaxed text-muted-foreground">{def.description}</p>
                ) : null}
                {!items.length ? (
                  <p className="text-micro text-muted-foreground/70">暂无明细（只标了归属）</p>
                ) : (
                  groupByKind(items).map(([kind, list]) => (
                    <div key={kind} className="flex flex-col gap-0.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        {kind}（{list.length}）
                      </div>
                      <ul className="flex flex-col">
                        {list.map((item, index) => (
                          <DetailRow key={`${item.label}-${index}`} item={item} onOpenRef={onOpenRef} />
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
