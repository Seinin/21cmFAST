import { BookOpen, GitBranch, Sparkles } from 'lucide-react'
import { Badge, Separator } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { KIND_WEIGHT, type MatrixColumn } from '../lib/physicsMatrix'

/**
 * 过程详情抽屉：点矩阵的格子或列头打开。
 *
 * 内容全部来自图谱数据与文档，**不手写编造**：
 *   · 物理描述 = 该阶段在 atlas L1 里的「作用与意义」原文；
 *   · 参数与角色 = 该过程命中的参数、角色（入公式 / 赋值 / 开关）与源码出处；
 *   · 文档锚点 = 可一键在应用内读原文（复用 md 阅读抽屉）。
 *
 * 「次级算法过程」是用户路线图里的下一层，这里只留位置、不填内容。
 */
export function ProcessDetailSheet({
  column,
  onOpenChange,
  onOpenDoc,
  onFocusRow,
}: {
  column: MatrixColumn | null
  onOpenChange: (open: boolean) => void
  onOpenDoc: (docId: string, anchor: string) => void
  onFocusRow: (tagId: string) => void
}) {
  const subprocesses = [
    ...new Set(
      (column?.cells ?? [])
        .flatMap((cell) => cell.note.replace(/^落在\s*/, '').split(' / '))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
  const sorted = [...(column?.cells ?? [])].sort(
    (left, right) => KIND_WEIGHT[right.kind] - KIND_WEIGHT[left.kind] || left.paramName.localeCompare(right.paramName),
  )

  return (
    <Sheet open={Boolean(column)} onOpenChange={onOpenChange}>
      <SheetContent side="right" width="w-[520px]" className="gap-0 p-0">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-[#7E22CE]" />
            {column?.label ?? ''}
          </SheetTitle>
          <SheetDescription>
            {column ? `${column.cells.length} 个天体物理参数在这里起作用 · 物理描述取自 atlas 文档原文` : ''}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            <section className="flex flex-col gap-1.5">
              <h3 className="text-micro font-semibold uppercase tracking-wide text-muted-foreground/80">物理描述</h3>
              <p className="text-[12px] leading-relaxed text-foreground/90">{column?.summary || '（文档里没有写这一段）'}</p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {(column?.anchors ?? []).map((anchor) => (
                  <Button
                    key={`${anchor.docId}#${anchor.anchor}`}
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenDoc(anchor.docId, anchor.anchor)}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {anchor.label || anchor.docId}
                  </Button>
                ))}
              </div>
            </section>

            <Separator />

            <section className="flex flex-col gap-2">
              <h3 className="text-micro font-semibold uppercase tracking-wide text-muted-foreground/80">
                参数与角色（按支配度排）
              </h3>
              <ul className="flex flex-col gap-1.5">
                {sorted.map((cell) => (
                  <li key={cell.tagId}>
                    <button
                      type="button"
                      onClick={() => onFocusRow(cell.tagId)}
                      className="w-full rounded-md border border-black/[0.07] bg-white/70 px-2.5 py-2 text-left transition-colors hover:border-[#7E22CE]/30 hover:bg-[#7E22CE]/[0.04]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-foreground/90">{cell.paramName}</span>
                        <Badge tone={cell.kind === '入公式' ? 'primary' : 'muted'}>{cell.kind}</Badge>
                        {cell.note ? (
                          <span className="truncate text-[11px] text-muted-foreground">{cell.note}</span>
                        ) : null}
                      </span>
                      {cell.ref.file ? (
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                          {cell.ref.file}
                          {cell.ref.line ? `:${cell.ref.line}` : ''}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {subprocesses.length ? (
              <>
                <Separator />
                <section className="flex flex-col gap-1.5">
                  <h3 className="text-micro font-semibold uppercase tracking-wide text-muted-foreground/80">
                    本阶段涉及的子过程
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {subprocesses.map((item) => (
                      <Badge key={item} tone="muted">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            <Separator />

            <section className="flex flex-col gap-1.5 rounded-md border border-dashed border-black/15 bg-black/[0.02] px-3 py-2.5">
              <h3 className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wide text-muted-foreground/80">
                <Sparkles className="h-3 w-3" />
                次级算法过程（待补）
              </h3>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                这一层是"算法怎么算"的展开（子过程 → 计算单元 → 关键量）。按你的路线图，它在容器与工程做完之后再做；
                这里只留位置，不预先编造内容。
              </p>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
