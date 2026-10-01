## Why

用户 2026-09-30 看着物理链页的一级画布说：**「初始模块尺寸和距离要成比例，距离过大模块又太小」**。

病根不是"间距调得不好"，而是**同一个东西有两套尺寸**：

- **画布上框多大**：由 `src/graph/labels.ts` 按标签算出来（块实际是 116~240 宽、38~45 高），写进 `data(boxW/boxH)`，样式表拿它当宽高；
- **生成器以为框多大**：`scripts/build-physics-chain.mjs` 里写死 `BOX_W = 820 / BOX_H = 300`，坐标按这个步长铺（行距 320、同排步长 940、成员 300、步骤 220、框外带 280）。

两套数不是一回事，于是**间隙成了框本身的 4~7 倍**（实测版面 940 × 3200）：一排块只占屏高的 1/4，想一次看全必须缩到 0.19 倍，字不到 3px。放大能看到框，就看不全链；看全链，框就小到读不出字——用户那句话说的就是这个死结。

## What Changes

- **间距恒为常数，尺寸问口径**：一级的 12 个块、块内成员、成员内步骤、框外带，全部改成「**按各自的实测宽高依次让开，间距恒为 `GAP = 24`**」。间隙不再是一个和框无关的坐标步长，而是由尺寸口径给出的一个常数——框大则整片跟着大。
- **行距由"这一排最高的框"决定**：原来行距是死数（320），框高变了就白留空；现在每排的高度取该排最高的框，排间空隙恒为 `GAP`。
- **尺寸口径抽成脚本侧唯一副本**：新增 `scripts/lib/boxSize.mjs`（逐字照抄 `labels.ts` 的公式，文件头写明"两份物理副本，改一边要同步另一边"）；`build-physics-chain.mjs` 与 `normalize-layout.mjs` 都 import 它——`normalize-layout.mjs` 里那份私有副本删掉，脚本内部不再各写一遍。
- **自检加两条可证伪的断言**（`check:chain`）：
  1. **距离由尺寸定**：全图只能量到**一个**间距数字（同排的块 / 同块的成员 / 同成员的步骤 / 相邻两排，四处排法各自独立，必须落在同一个数上）；
  2. **距离不过大**：每个空隙不超过相邻两框里较小的那条短边（空的地方不许比实的地方还大）。
- **版面数字进自检输出**：`一级版面 259.0 × 693.0（框 116~184 宽 × 38~45 高，空隙 24.0）：取景倍数 ≈ 画布高 / 693.0，屏幕字号 = 13 × 那个倍数`——不打开浏览器也能读出"字多大"。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

- `graphify-physics-chain`：新增需求「一级摆位的尺寸与距离同源」。

## Impact

- **生成物**：`Graphify/src/generated/physics-chain.json`（只是坐标变了；节点/边/标签一字不动，哈希戳记因此改变）。
- **脚本**：`Graphify/scripts/build-physics-chain.mjs`（四处写死步长退场）、`Graphify/scripts/lib/boxSize.mjs`（新）、`Graphify/scripts/normalize-layout.mjs`（改 import，行为不变）。
- **自检**：`Graphify/scripts/check-physics-chain.mjs`（+2 项断言，181 项）。
- **不改动**：`src/graph/labels.ts`（它是口径真源，一行不动）、`styles.ts`、任何视图组件、`docs/notes/physics-chain/chain.json`（真源）。

## 验收（已跑）

`check:chain` 181 项 ✓（新增两条断言，且**反面演练**过：把写死步长种回去 → `40 处空隙量到 182.5 / 24.0`、`空 182.5（短边才 38）`，退出码 1）· `check:canvas` / `check:styles` / `check:tabs` / `check:graph` / `check:code` / `check:store` 全绿 · `tsc --noEmit` 干净 · `eslint` 0 error · `npm run build` ✓ · 镜像口径与画布口径逐个标签比对（390 个 label、含大框）**0 处不一致**。

浏览器里的观感只有用户能判；数字上：一级版面从 940 × 3200 收到 259 × 693，取景倍数从 0.19（看不全）变为 ≥ 0.85（夹在下限上，整版在屏内、字 11px）。
