import { Fragment, useEffect, useMemo, useState } from 'react'
import { Grid3x3, Info } from 'lucide-react'
import { cn } from '../lib/utils'
import { EmptyCell, MatrixCell } from './MatrixCell'
import { ProcessDetailSheet } from './ProcessDetailSheet'
import type { MatrixStatus } from './StatusBar'
import { buildMatrix, KIND_WEIGHT, type MatrixCell as CellModel, type MatrixColumn } from '../lib/physicsMatrix'

/**
 * 参数 × 物理过程矩阵（物理视角图谱的第一个页面）。
 *
 * 读法（沿用仓库既有矩阵约定：`docs/notes/atlas/figures/README.md`）：
 *   有色格 = 该参数在此过程中起作用；空格 = 无关；**矩阵的形状本身就是结论**。
 *
 * 滚动与宽度模型（这两条都是踩出来的，改结构前先读）：
 *
 *   ① **滚动口只有一个，而且在视图根上**（根 `overflow-auto`）。列头 `sticky top-0` 与参数列
 *      `sticky left-0` 因此吸在同一个滚动口上。卡片本身 MUST NOT 带任何 `overflow-*`——一旦带上，
 *      它就成了滚动口（哪怕它并不滚），sticky 会挂到它身上、列头随页面滚走；
 *      而且卡片一旦 `flex-1` 撑满高度，内容不足时下面会留一条空白卡面，所以要 `w-fit min-w-full`
 *      让高度裹住内容、宽度不小于容器。
 *
 *   ② **列宽一钉一放**：`table-layout: fixed` 下，写了宽度的列保持该宽度、**没写宽度的列均分剩余空间**。
 *      所以参数列用 `colgroup` 钉 176px（否则最长参数名把列撑到 240px），9 个进程列**不写宽度**，
 *      随窗口均分（右侧不留白）；表格 `min-w-[680px]` 是"参数列 + 每列保底 56px"的推导值，
 *      窄于它时才横向滚动。改这两个常量时要同步这里。
 *
 * 数据来自 `src/generated/physics-graph.json`（`npm run build:physics` 生成），
 * 与画布那份 `data/graph.json` 互不影响。
 */
const KIND_LEGEND: { kind: CellModel['kind']; className: string; hint: string }[] = [
  { kind: '入公式', className: 'bg-[#7E22CE]', hint: '参数进了物理公式（最支配）' },
  { kind: '赋值', className: 'bg-[#0E7490]', hint: '参数被存进派生量' },
  { kind: '开关', className: 'bg-slate-400/85', hint: '参数只决定走不走' },
]

const ROW_HEIGHT = 22
/** 进程列的保底宽度；实际宽度随窗口均分（见文件头 ②） */
const COLUMN_WIDTH = 56
/** 参数列：钉死宽度，装不下就在行内截断（完整内容在 tooltip 里） */
const PARAM_COLUMN_WIDTH = 176

export function MatrixView({
  onOpenDoc,
  onStatus,
}: {
  onOpenDoc: (docId: string, anchor: string) => void
  /** 把规模与当前动作上报给状态条（矩阵页的状态条换成矩阵口径，见本文件所属变更） */
  onStatus: (status: MatrixStatus) => void
}) {
  const model = useMemo(() => buildMatrix(), [])
  const [focusedTagId, setFocusedTagId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MatrixColumn | null>(null)

  /*
    状态条口径：规模恒定，动作随"聚焦了哪一行 / 打开了哪个过程"变。
    `onStatus` 必须是稳定引用（App 直接传 setState），否则这里会每渲染一次就上报、把 App 转晕。
  */
  useEffect(() => {
    const focused = model.rows.find((row) => row.tagId === focusedTagId)
    onStatus({
      params: model.rows.length,
      processes: model.columns.length,
      filled: model.filled,
      action: detail
        ? `已打开过程详情：${detail.code} ${detail.name}`
        : focused
          ? `已聚焦参数：${focused.name}`
          : null,
    })
  }, [model, focusedTagId, detail, onStatus])

  /*
    Esc 关详情。抽屉用的 `Sheet` 是仓库自造组件、不处理 Escape（全仓 ui/ 下没有 Escape 处理），
    而全局那个 onEscape 在矩阵页被有意关掉了（它做的是"取消连线 / 取消选中"，都是画布语义），
    所以关详情这件事由矩阵视图自己负责。
  */
  useEffect(() => {
    if (!detail) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetail(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detail])

  const focusRow = (tagId: string) => setFocusedTagId((current) => (current === tagId ? null : tagId))
  const openCell = (cell: CellModel) => {
    const column = model.columns.find((item) => item.id === cell.processId) ?? null
    setDetail(column)
    setFocusedTagId(cell.tagId)
  }

  return (
    // 唯一的滚动口（两轴）在视图根上：列头吸顶与参数列吸左因此共用同一个滚动根
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto">
      <div className="glass-panel flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-1.5">
        <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-2 text-[12px] text-muted-foreground">
          <Grid3x3 className="h-3.5 w-3.5 shrink-0 text-[#7E22CE]" />
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground/85">读法</span>
            有色格 = 该参数在此过程中起作用；空格 = 无关；点格子看这个过程的物理描述
            <Info className="h-3 w-3 shrink-0 opacity-60" />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {KIND_LEGEND.map((item) => (
            <span key={item.kind} className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={item.hint}>
              <span className={cn('h-2.5 w-2.5 rounded-sm', item.className)} />
              {item.kind}
            </span>
          ))}
          {/* 窄屏让位：计数在 <768px 隐藏，图例保留 */}
          <span className="hidden tabular-nums text-[11px] text-muted-foreground/80 md:inline">
            {model.rows.length} 参数 · {model.columns.length} 过程 · {model.filled} 有色格
          </span>
        </div>
      </div>

      {/* 卡片：宽度不小于容器、高度裹住表格；不得带 overflow-*（否则抢走滚动口、吸顶失效） */}
      <div className="glass-panel w-fit min-w-full rounded-lg">
        <table
          className="w-full min-w-[680px] border-separate border-spacing-0 text-[12px]"
          style={{ tableLayout: 'fixed' }}
        >
          <colgroup>
            <col style={{ width: PARAM_COLUMN_WIDTH }} />
            {/* 进程列不写宽度：由剩余宽度均分，窗口越宽列越宽 */}
            {model.columns.map((column) => (
              <col key={column.id} />
            ))}
          </colgroup>
          <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-30 border-b border-r border-black/[0.07] bg-[#F8FAFC] px-2 py-1.5 text-left align-bottom text-[11px] font-semibold text-muted-foreground"
                >
                  参数 \ 过程
                </th>
                {model.columnGroups.map((group) => (
                  <th
                    key={group.topicId}
                    colSpan={group.columns.length}
                    className="sticky top-0 z-20 border-b border-l border-black/[0.07] bg-[#F8FAFC] px-2 py-1 text-[11px] font-semibold text-[#0F172A]"
                    title={group.description}
                  >
                    {group.name}
                    <span className="ml-1 font-normal text-muted-foreground">（{group.columns.length}）</span>
                  </th>
                ))}
              </tr>
              <tr>
                {model.columns.map((column) => (
                  <th
                    key={column.id}
                    className="sticky top-[27px] z-20 h-[92px] border-b border-black/[0.07] bg-[#F8FAFC] px-0.5 pb-1.5 pt-0.5 align-bottom"
                    style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH }}
                  >
                    <button
                      type="button"
                      onClick={() => setDetail(column)}
                      title={`${column.label}（点开看物理描述）`}
                      className={cn(
                        'mx-auto flex h-full items-end justify-center transition-colors',
                        detail?.id === column.id ? 'text-[#7E22CE]' : 'text-foreground/80 hover:text-[#7E22CE]',
                      )}
                    >
                      <span className="text-[11px] font-medium leading-tight [writing-mode:vertical-rl]">{column.name}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {model.bands.map((band) => (
                <Fragment key={band.group}>
                  <tr>
                    <th className="sticky left-0 z-10 border-b border-r border-black/[0.07] bg-white px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {band.group}
                      <span className="ml-1 font-normal">（{band.rows.length}）</span>
                    </th>
                    <td colSpan={model.columns.length} className="border-b border-black/[0.07] bg-white" />
                  </tr>
                  {band.rows.map((row) => {
                    const dimmed = focusedTagId !== null && focusedTagId !== row.tagId
                    // 行内只留两个名字；中文名的依据、英文 docstring 与"管了 N 个过程"都进 tooltip
                    const tooltip = [
                      row.alias ? `${row.alias}${row.aliasSource ? `（${row.aliasSource}）` : ''}` : '',
                      row.description,
                      `管了 ${row.processCount} 个过程`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                      <tr
                        key={row.tagId}
                        className={cn('transition-opacity', dimmed ? 'opacity-35' : 'opacity-100')}
                        style={{ height: ROW_HEIGHT }}
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 border-r border-black/[0.07] bg-white px-2 py-0 text-left align-middle"
                          style={{ height: ROW_HEIGHT }}
                        >
                          <button
                            type="button"
                            onClick={() => focusRow(row.tagId)}
                            title={tooltip}
                            className="flex w-full items-center gap-1.5 overflow-hidden text-left leading-none"
                          >
                            <span className="shrink-0 font-mono text-[11px] font-semibold text-foreground/90">{row.name}</span>
                            {row.alias ? (
                              <span className="truncate text-[10px] text-muted-foreground">{row.alias}</span>
                            ) : null}
                          </button>
                        </th>
                        {model.columns.map((column) => {
                          const cell = row.cells.get(column.id)
                          return (
                            <td key={column.id} className="px-0.5 py-0 align-middle" style={{ height: ROW_HEIGHT }}>
                              {cell ? (
                                <MatrixCell cell={cell} active={focusedTagId === row.tagId} onOpen={openCell} />
                              ) : (
                                <EmptyCell />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <th className="sticky left-0 z-10 border-r border-t border-black/[0.07] bg-[#F8FAFC] px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground">
                  支配参数 Top-3（按 入公式 &gt; 赋值 &gt; 开关）
                </th>
                {model.columns.map((column) => (
                  <td key={column.id} className="border-t border-black/[0.07] bg-[#F8FAFC] px-0.5 py-2 align-top">
                    <div className="flex flex-col items-center gap-1">
                      {column.dominant.slice(0, 3).map((row) => {
                        const cell = row.cells.get(column.id)
                        return (
                          <button
                            key={row.tagId}
                            type="button"
                            onClick={() => focusRow(row.tagId)}
                            title={`${row.name}${row.alias ? `（${row.alias}）` : ''} · ${cell?.kind ?? ''}`}
                            className={cn(
                              'max-w-[52px] truncate rounded px-1 py-0.5 text-[9px] font-medium leading-none',
                              cell?.kind === '入公式'
                                ? 'bg-[#7E22CE]/12 text-[#7E22CE]'
                                : cell?.kind === '赋值'
                                  ? 'bg-[#0E7490]/12 text-[#0E7490]'
                                  : 'bg-black/[0.06] text-muted-foreground',
                            )}
                          >
                            {row.name}
                          </button>
                        )
                      })}
                      <span className="tabular-nums text-[9px] text-muted-foreground/70">
                        {column.cells.length} 个
                        {column.cells.length > 3
                          ? ` · 权重 ${column.cells.reduce((sum, cell) => sum + KIND_WEIGHT[cell.kind], 0)}`
                          : ''}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
        </table>
      </div>

      <ProcessDetailSheet
        column={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
        onOpenDoc={onOpenDoc}
        onFocusRow={focusRow}
      />
    </div>
  )
}
