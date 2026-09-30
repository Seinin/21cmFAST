# Tasks

## 1. M1 范式声明（先评审，再落地）

- [x] 1.1 写出范式四决定（数据真源 / 层级粒度 / 字段表 / 交付与边界）并 `openspec validate --strict` 通过
- [x] 1.2 边口径定稿：以产物为枢纽（产出者 → 消费者，标签写产物名）
- [x] 1.3 论文口径定稿：只抽源码注释里真实存在的引用 + 全部引用点；抽不到即空
- [x] 1.4 边界写死：不做审读批注 / 评估字段 / 可写标注；不改工程图与标签政策

## 2. M2 生成器与自检

- [x] 2.1 `scripts/lib/sourceCitations.mjs`：注释与 docstring 里的文献抽取（作者-年份-期刊卷页 / arXiv / DOI 形态）
- [x] 2.2 `scripts/lib/pyInputs.mjs`：`inputs.py` 结构体解析（字段名 + `default` + `validator` 范围 + `logtransformer` + docstring 文献）
- [x] 2.3 `scripts/build-physics-map.mjs`：atlas + 源码 → `src/generated/physics-map.json`（16 阶段 / 71 子过程 / 字段 / 产物边 / 参数 / 关键量 / 落点 / 文献；内容哈希戳记；`--dry-run` / `--stdout`；写前校验、原子写、幂等）
- [x] 2.4 `scripts/check-physics-map.mjs` + `npm run check:physics-map`：覆盖 16/71、计算单元不占节点、字段取自原文、边可回溯 L1 产物、参数默认值/范围与源码逐项一致且"裁到矩阵范围后"与矩阵口径一致、文献引用点回读源码行核对、落点行区间合法、幂等 —— **38 项断言全绿**
- [x] 2.5 跑生成器与自检直到全绿；记录统计（16 阶段 / 71 子过程 / 231 落点 / 15 参数含 15 个有默认值 / 28 篇文献 77 处引用 / 26 条产物边 / 83 条 atlas 问句）

## 3. M3 视图与检索

- [x] 3.1 `src/lib/physicsMap.ts`：读生成物 + 纯函数模型（阶段/子过程/边/参数/关键量/文献）+ 四路检索索引（参数、关键量、过程名含问句、论文）
- [x] 3.2 `src/components/PhysicsMapView.tsx`：阶段骨干（产物边标签）+ 子过程下钻 + 检索面板 + 选中态
- [x] 3.3 `src/components/PhysicsMapDetail.tsx`：字段表 + 参数徽标（默认值/log10/范围）+ 关键量 + 上下游 + 落点（点开源码预览）+ 论文出处（点开引用行）
- [x] 3.4 视觉：浅色玻璃拟态；阶段卡片紫系、参数与关键量青系、论文玫瑰系、落点石板灰 + 等宽；选中态与悬停反馈
- [x] 3.5 接线与隔离：`TopBar` 第三项（`?view=physics`）、`App` 的 `view` 三值与隔离 effect 覆盖两页、快捷键只在画布视图注册、`StatusBar` 三口径、`HelpDialog` 读法说明

## 4. M4 文档与验收

- [x] 4.1 `README.md` / `docs/DESIGN.md`：第三页与生成链说明（含"本页只是事实层，不含评估"）
- [x] 4.2 `package.json`：`build:physics-map` 与 `check:physics-map`
- [x] 4.3 全套回归：`tsc -b` ✓、`lint`（仅 2 处既有警告）✓、`build` ✓、`check:code` 48 ✓、`check:canvas` ✓、`check:styles` ✓、`check:graph` 13 ✓、`check:store` 39 ✓、`check:physics` 28 ✓、`check:physics-map` 38 ✓
- [x] 4.4 浏览器探针（无头 Edge + CDP，跑完即删）：三视图切换、状态条口径、顶栏收起、快捷键隔离、下钻子过程、落点跳源码、四路检索（参数含默认值/范围、论文含引用点、atlas 问句）、切回画布无残留、**切视图全程不写盘** —— **33 项全绿**
- [x] 4.5 `openspec validate graphify-physics-map --strict` 通过并归档
