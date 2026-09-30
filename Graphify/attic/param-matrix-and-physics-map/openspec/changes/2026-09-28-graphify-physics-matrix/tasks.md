## 1. 素材盘点（只读）

- [x] 1.1 盘清 atlas 四层文档结构（条数 / 字段 / 锚点格式 / 纯度约定）与可作矩阵列的层级 — 验证：L1 16 阶段、L2 71 子过程、L3 137 单元（标题带函数名，只作归属锚点）；L3 的「承担者」字段给出函数与源码链接
- [x] 1.2 查清四个天体参数（F_STAR10 / F_ESC10 / HII_EFF_FACTOR / POP2_ION）只挂在"输出层"的成因 — 验证：旧扫描窗口 `min(引用行-2, 体起) … max(引用行+30, 体末)` 把 `global_evolution.py:110` 一带盖到 27–140 行；且主链 C 实现从未被任何节点引用
- [x] 1.3 核实前端落点（URL 同步写法、TopBar 控件顺序、可复用组件、文档阅读抽屉的调用链） — 验证：`?g=` 在 `App.tsx` 现有 effect；TopBar 无分段控件需新建；`MdReaderDrawer` 由 `{docId, anchor}` 驱动

## 2. 生成器

- [x] 2.1 `scripts/lib/atlasDocs.mjs`：解析 `### 编号 名称` + `- **字段**：值`、生成 GitHub slug 锚点、区分阶段/子过程/单元三种编号 — 验证：L1 16 / L2 71 / L3 137（按编号形态过滤）解析正确，锚点与文档内链接一致
- [x] 2.2 `scripts/lib/paramScan.mjs`：屏蔽注释与字符串、定位 C 函数体（花括号配对）与 Python 函数体（含多行签名）、角色判定（入公式 / 赋值 / 开关） — 验证：`set_scaling_constants`、`global_reion_properties`、`compute_global_reionization_at_z`（多行签名 27–108）等样本命中与调查表一致
- [x] 2.3 `scripts/build-physics-graph.mjs`：解析 `inputs.py` 两个结构的字段与 docstring；按 L3 承担者扫参数归属（含"整文件"退化）；组装 schema 形状；`--dry-run/--stdout/--layer/--stages` — 验证：15 参数 × 9 列、33 有色格、18 条边；过 `parseGraph`
- [x] 2.4 戳记用内容哈希 — 验证：连跑两次第二次输出"产物无变化（幂等）"
- [x] 2.5 产出 `src/generated/physics-graph.json`（不在 `data/` 下） — 验证：文件 35 KB、入库跟踪、`tsc` 能编译（`resolveJsonModule` 已开）

## 3. 自检

- [x] 3.1 `scripts/check-physics-graph.mjs` + `npm run check:physics`：schema、参数在册与分组、过程描述与锚点存在（锚点回文档核对）、角色取值、出处文件与行号合法、空行白名单、幂等（重跑逐字比较）、四类偏斜参数各命中 ≥2 过程 — 验证：22 项断言全绿
- [x] 3.2 确认工程视角图谱未被改动 — 验证：自检里只读核对 65 节点 / 59 关系，且全流程未写 `data/graph.json`

## 4. 矩阵视图

- [x] 4.1 `src/lib/physicsMatrix.ts`：图谱 → 矩阵模型（行按结构分带、列按主题分块、支配度权重 入公式>赋值>开关、行尾/列尾汇总） — 验证：`tsc` 通过；浏览器里 15 行 × 9 列 × 33 格与数据一致
- [x] 4.2 `MatrixCell`（角色三色 + 出处 tooltip + 点击）与 `EmptyCell`（空格保留极浅底纹） — 验证：探针断言"格子里出现了多种角色"
- [x] 4.3 `ProcessDetailSheet`：物理描述（文档原文）+ 参数与角色清单 + 文档锚点（可读原文）+「次级算法过程（待补）」分区 — 验证：探针断言四个分区都在、角色条目带"落在哪个子过程"
- [x] 4.4 `MatrixView`：读法说明条 + 冻结参数列 + 分带表头 + 横向滚动 + 行尾"管了 N 个过程" + 列尾"支配参数 Top-3" + 行聚焦 — 验证：探针断言形状、汇总、聚焦淡出
- [x] 4.5 `TopBar` 加「画布 | 参数矩阵」分段切换；`App.tsx` 接 `?view=matrix`（与 `?g=` 并存） — 验证：探针断言 URL 带/清 view、画布让位与回归

## 5. 文档与归档

- [x] 5.1 `README.md` 补三行（视图切换 / 参数矩阵 / 物理视角图谱生成与自检） — 验证：README 里能查到 `build:physics`、`check:physics` 与矩阵读法
- [x] 5.2 `docs/DESIGN.md` 补一节「物理视角图谱与参数矩阵」（生成规则、归属口径、为什么点开看文档而不是源码） — 验证：DESIGN 与实现一致
- [x] 5.3 立项并归档 OpenSpec 变更 `graphify-physics-matrix`（新能力） — 验证：`openspec validate --strict` 通过，归档后主 specs 出现该能力且工程视角图谱相关要求一字未动
- [x] 5.4 全套回归 + 浏览器实测（Windows 侧无头 Edge + CDP，探针用完即删） — 验证：`tsc` / `lint`（仅 2 处既有警告）/ `build` / `check:code` 48 / `check:canvas` / `check:styles` / `check:graph` 13 / `check:store` 39 / `check:physics` 22 全绿；矩阵探针 26 项全绿
