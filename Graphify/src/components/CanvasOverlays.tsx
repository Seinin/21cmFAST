import { Maximize2, Minus, Plus, Sparkles, Tag, Upload, ZoomIn } from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import {
  NODE_TYPE_COLORS,
  NODE_TYPE_LABELS,
  NODE_TYPE_ORDER,
  EDGE_TYPE_LABELS,
  EDGE_TYPE_ORDER,
  type NodeType,
} from '../lib/types'
import { cn } from '../lib/utils'
import { EDGE_COLOR } from '../graph/palette'

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onRelayout,
  showEdgeLabels = false,
  onToggleEdgeLabels,
}: {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onRelayout: () => void
  /** 是否常显边标签（产物名写在边标签上，默认只在悬停/选中时显示） */
  showEdgeLabels?: boolean
  onToggleEdgeLabels?: () => void
}) {
  return (
    <div className="glass-panel pointer-events-auto flex items-center gap-0.5 rounded-lg p-1">
      <Tooltip content="缩小">
        <Button variant="ghost" size="icon-sm" onClick={onZoomOut} aria-label="缩小">
          <Minus className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <span className="w-11 text-center text-micro tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <Tooltip content="放大">
        <Button variant="ghost" size="icon-sm" onClick={onZoomIn} aria-label="放大">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <span className="mx-0.5 h-4 w-px bg-black/10" />
      <Tooltip content="适应屏幕（F）">
        <Button variant="ghost" size="icon-sm" onClick={onFit} aria-label="适应屏幕">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content="整理布局（L）">
        <Button variant="ghost" size="icon-sm" onClick={onRelayout} aria-label="整理布局">
          <Sparkles className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      {onToggleEdgeLabels ? (
        <>
          <span className="mx-0.5 h-4 w-px bg-black/10" />
          <Tooltip content={showEdgeLabels ? '隐藏边标签（产物名）' : '常显边标签（产物名）'}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleEdgeLabels}
              aria-label="切换边标签"
              aria-pressed={showEdgeLabels}
              className={cn(showEdgeLabels && 'bg-primary/10 text-primary')}
            >
              <Tag className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </>
      ) : null}
    </div>
  )
}

/**
 * 图例只列**当前图谱实际出现**的类型：类型是「要素种类」，一张图通常只用其中几类，
 * 把未使用的类型（工具、问题…）堆进图例只会占地方、还会让人去找根本不存在的颜色。
 */
export function GraphLegend({ compact = false, types }: { compact?: boolean; types?: NodeType[] }) {
  const shown = types?.length ? types : NODE_TYPE_ORDER
  return (
    <div
      className={cn(
        'glass-panel pointer-events-auto rounded-lg px-2.5 py-2 text-micro',
        compact ? 'flex items-center gap-3' : 'flex flex-col gap-1.5',
      )}
    >
      <div className={cn('flex flex-wrap gap-x-3 gap-y-1', compact ? 'items-center' : '')}>
        {shown.map((type) => (
          <span key={type} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="h-2 w-2 rounded-[3px]"
              style={{ backgroundColor: NODE_TYPE_COLORS[type], boxShadow: `0 0 8px ${NODE_TYPE_COLORS[type]}80` }}
            />
            {NODE_TYPE_LABELS[type]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-black/[0.06] pt-1.5">
        {/* 箭头标记：语义关系带箭头，层级连线不带，图例里按同一规则对照 */}
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <marker
              id="legend-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill={EDGE_COLOR} />
            </marker>
          </defs>
        </svg>
        {EDGE_TYPE_ORDER.slice(0, 4).map((type) => (
          <span key={type} className="flex items-center gap-1.5 text-muted-foreground/80">
            <svg width="16" height="6" viewBox="0 0 16 6" className="shrink-0">
              <line
                x1="0"
                y1="3"
                x2="16"
                y2="3"
                stroke={EDGE_COLOR}
                strokeWidth="1.4"
                strokeDasharray={type === 'relates_to' ? '4 3' : undefined}
                markerEnd="url(#legend-arrow)"
              />
            </svg>
            {EDGE_TYPE_LABELS[type]}
          </span>
        ))}
      </div>
    </div>
  )
}

export function EmptyState({
  onNewNode,
  onOpenImport,
  onFocusLibrary,
}: {
  onNewNode: () => void
  onOpenImport: () => void
  onFocusLibrary: () => void
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
      <div className="glass-panel pointer-events-auto flex w-full max-w-[460px] animate-slide-up flex-col gap-4 rounded-xl p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-sheen shadow-glow">
          <ZoomIn className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-subhead font-semibold">开始构建你的知识图谱</h2>
          <p className="text-balance text-micro leading-relaxed text-muted-foreground">
            节点可以锚定到 notes 数据库中的具体章节；关系可以随时建立、修改与取消。所有操作都能撤销，
            误删也能找回。
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={onNewNode}>
            <Plus className="h-3.5 w-3.5" />
            新建第一个节点
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onFocusLibrary}>
              浏览 notes 数据库
            </Button>
            <Button variant="secondary" className="flex-1" onClick={onOpenImport}>
              <Upload className="h-3.5 w-3.5" />
              LLM 导入草案
            </Button>
          </div>
        </div>
        <p className="text-micro text-muted-foreground/60">
          提示：按 <kbd className="rounded bg-black/[0.06] px-1">N</kbd> 新建节点、
          <kbd className="ml-1 rounded bg-black/[0.06] px-1">L</kbd> 重新布局、
          <kbd className="ml-1 rounded bg-black/[0.06] px-1">/</kbd> 搜索
        </p>
      </div>
    </div>
  )
}
