## Context

见 proposal.md 的 Why。现状（`MatrixView.tsx`）：表格 `style={{ tableLayout: 'fixed', width: 176 + 9×56 }}` + `colgroup` 里每列都写了宽度 ⇒ 宽屏下右边大片空白；卡片 `glass-panel min-h-0 flex-1 overflow-auto` 既是滚动口又撑满高度 ⇒ 内容不足时下面留空白卡面。上一轮已经确认：**sticky 只对最近的滚动口生效**，且一个轴不是 `visible` 时另一个轴会被算成 `auto`。

## Goals / Non-Goals

**Goals:** 宽屏撑满且列宽舒展；窄屏保底列宽 + 横向滚动；卡片贴合内容；吸顶/吸左不变；窄屏说明条可用。

**Non-Goals:** 不改数据/生成物/自检断言；不加列宽上限（用户选了"均分撑满"）；不做折叠；不新增依赖。

## Decisions

**D1：列宽"一钉一放"。** `table-layout: fixed` 下写了宽度的列保持、没写宽度的列均分剩余空间。所以只给参数列写 176px、9 个进程列不写宽度；表格 `w-full min-w-[680px]`（680 = 176 + 9×56 是保底推导值）。
替代方案：给进程列设上限（用户没选）——那样宽屏又会留白。

**D2：滚动口上移到视图根，卡片不参与滚动。**
若把卡片改成 `h-fit` 但保留 `overflow-auto`，卡片成为滚动口却永不滚动 ⇒ 列头吸顶失效。
所以：根加 `overflow-auto`（两轴），卡片 `w-fit min-w-full`（宽度 ≥ 容器、高度裹住表格）。
`w-fit` 保证表格比容器宽时卡片跟着变宽、横向滚动落在根上而不是卡片自己滚；`min-w-full` 保证表格比容器窄时卡片仍满宽。

**D3：说明条随内容滚走、不做 sticky。** 否则会与表头抢 `top-0`，破坏第二行表头 `top-[27px]` 的偏移关系。

**D4：窄屏用 Tailwind 既有 `md:`（768px）而不是自造断点。** 计数 `hidden md:inline`，说明条 `flex-wrap`，图例 `flex-wrap`，读法段 `basis-[220px]`。

## Risks / Trade-offs

- [宽屏下过程列会变得很宽] → 用户明确选"均分撑满"；格子里只有角色词与色块，变宽不触发换行。
- [卡片 `w-fit min-w-full` 在极窄容器下的行为] → 已用 640px 视口实测：卡片随表格最小宽（680）变宽、根横向滚动、参数列吸左正常。
- [min-w 的 680 与两个常量耦合] → 已在代码注释里写明推导，改常量时同步。

## Migration Plan

纯布局改动，无数据迁移；回滚即还原 `MatrixView.tsx` 的类名与表格宽度。
