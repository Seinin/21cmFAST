# M8 气体热与自旋温度

> **这是骨架，正文待补**（变更 `graphify-chain-leaf-refs` 只交付框架）。
> 小节标题**不要改**：页面上的「看文献」用标题算出的 slug 当锚点，标题一改就点不开
> （`cd Graphify && npm run check:chain` 会当场拦下）。补充内容直接写在各小节下面即可，
> 不需要动一行页面代码——`docId` 就是这个文件的路径。

下面每个成员一节（`##`），成员内部的步骤一小节（`###`）。

## ε_heat(z) · X 射线加热率

### S14.3.1 · UpdateXraySourceBox

### S14.3.2 · one_annular_filter

### S14.3.3 · global_reion_properties

### S14.3.4 · initialise_SFRD_spline

### S14.3.5 · calculate_sfrd_from_grid

## T_K(z) · 气体动力学温度

### S14.7.1 · thermochem.c 率系数

### S14.7.2 · interp_fheat

## J_α(z) · Ly-α 辐射场强度

### S14.2.1 · calculate_spectral_factors

### S14.2.2 · frecycle

### S14.2.3 · spectral_emissivity

## x_α · Ly-α 耦合系数

## x_c · 碰撞耦合系数

## T_S(z) · 自旋温度

### S14.6.1 · get_Ts

### S14.6.2 · get_Ts_fast

### S14.6.3 · xcoll_HI
