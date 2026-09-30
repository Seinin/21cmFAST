import { cn } from '../lib/utils'
import { Tooltip } from './ui/tooltip'
import type { MatrixCell as CellModel, RoleKind } from '../lib/physicsMatrix'

/**
 * 矩阵里的一格：**有色格 = 该参数在此过程中起作用**（沿用仓库既有矩阵读法）。
 *
 * 角色三色：入公式（紫，参数进了公式）> 赋值（青，参数被存进派生量）> 开关（灰，参数只决定走不走）。
 * 格子里的文字就是角色词本身——"此参数在此过程中的作用"不手写，物理描述在过程详情里给原文。
 */
const KIND_STYLE: Record<RoleKind, string> = {
  入公式: 'bg-[#7E22CE] text-white shadow-[0_1px_2px_rgba(126,34,206,0.35)] hover:bg-[#6B21A8]',
  赋值: 'bg-[#0E7490] text-white shadow-[0_1px_2px_rgba(14,116,144,0.3)] hover:bg-[#155E75]',
  开关: 'bg-slate-400/85 text-white hover:bg-slate-500',
}

export function MatrixCell({
  cell,
  active,
  onOpen,
}: {
  cell: CellModel
  /** 当前高亮的行是否包含这一格（点行头聚焦时用） */
  active: boolean
  onOpen: (cell: CellModel) => void
}) {
  const where = cell.ref.file ? `${cell.ref.file}:${cell.ref.line ?? ''}` : ''
  const detail = [cell.paramName, cell.kind, cell.note, where].filter(Boolean).join(' · ')

  return (
    <Tooltip content={detail}>
      <button
        type="button"
        aria-label={`${cell.paramName} 在 ${cell.processLabel} 中的角色：${cell.kind}`}
        onClick={() => onOpen(cell)}
        className={cn(
          'flex h-[22px] w-full items-center justify-center rounded text-[10px] font-semibold leading-none tracking-tight transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E22CE]/50',
          KIND_STYLE[cell.kind],
          active ? 'ring-2 ring-[#7E22CE]/35 ring-offset-1' : '',
        )}
      >
        {cell.kind}
      </button>
    </Tooltip>
  )
}

/** 空格：没有角色就是没有——保留极浅底纹维持栅格可读，不画任何标记 */
export function EmptyCell() {
  return <div className="h-[22px] w-full rounded bg-slate-500/[0.045]" aria-hidden />
}
