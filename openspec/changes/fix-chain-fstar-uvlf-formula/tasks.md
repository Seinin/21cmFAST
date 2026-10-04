# Tasks

## 1. 真源：f* 的代码口径

- [x] 1.1 `docText.fstar.formula` 换成代码表达式：双幂律因子（含归一化）+ $\exp(-M_{\rm turn}/M+s\sigma_\star-\sigma_\star^2/2)$ + $\le1$
- [x] 1.2 `docText.fstar.physics` 改写：单幂律→双幂律的切换条件、对数正态散射与均值口径、截断到 1（不出现代码标识）
- [x] 1.3 `drivers[fstar]`：补 `theory`（Eq.1 的简式是代码的特例）；`codeNames` 补 `SIGMA_STAR`、`UPPER_STELLAR_TURNOVER_MASS`、`UPPER_STELLAR_TURNOVER_INDEX`、`M_TURN`
- [x] 1.4 `docText.fstar.input/output` 补参数名与产出（工程口径）
- [x] 1.5 `algorithms.byId.fstar` 的 `how` / `where` 写清取值落点与受哪些参数控制

## 2. 真源：φ(M_1500) 的代码口径

- [x] 2.1 `docText.phi_uv.formula` 换成代码表达式：$|{\rm d}M_{1500}/{\rm d}M_h|^{-1}({\rm d}n/{\rm d}M_h)e^{-M_{\rm turn}/M_h}f_{\rm duty}$
- [x] 2.2 `docText.phi_uv.physics` 改写：不拟合 Schechter、按星等轴取质量函数（不出现代码标识）
- [x] 2.3 `nodes[phi_uv]`：`name` 去掉「（Schechter）」；`formula` 与 `nature.type` 改成代码口径；补 `theory`（Eq.12–Eq.14 是论文形式，代码是质量函数换元）
- [x] 2.4 `docText.phi_uv.input/output` 按新口径改写
- [x] 2.5 `algorithms.byId.phi_uv` 的 `how` 写清换元、$F_\star$ 的单幂律与该支参数、样条平滑、$\phi$ 下限

## 3. 账本

- [x] 3.1 `README.md` §一：把 `f*`（同一算法、代码多修正项 → 摘要给代码完整式）与 `φ(M_1500)`（两码事 → 以代码为准、论文式子记在文档）写进那一条的名单与判据
- [x] 3.2 `papers.md`：`UV 光度函数（Schechter 形式）` 那条的标签注明「论文形式 / 代码改用质量函数换元」。**Eq.12–Eq.14 那条不动**——该表的第 3 栏是 `eq` 字段的逐字汇总（表前已声明「由数据唯一决定」），加注会长出数据推不出来的文字。

## 4. 落地与自检

- [x] 4.1 `npm run build:chain` 重新生成产物与 67 篇模块文档
- [x] 4.2 `npm run check:chain` 通过（274 项断言；含摘要公式的严格 KaTeX 渲染）
- [x] 4.3 `npm run check:copy` 通过（账本与文档的措辞）
- [x] 4.4 目视核对：`galaxy/fstar.md`、`galaxy/phi_uv.md` 的物理一节与产物里两个节点的 `formula` / `summary` / `label`

## 备注

- `check:copy` 的「第二人称」判据只放行 `迷你晕` / `你晕`，所以新文案里的分子冷却支一律写「分子冷却支」，不写「迷你支 / 迷你星」。
- `nodes[phi_uv].formula` 逐字进属性页的 KaTeX 面，故保持纯符号（与另外 33 个节点一致）：不放代码参数名、不放中文加粗；「论文是 Schechter 形式」这句写在 `nature.type` 与 `theory`。
