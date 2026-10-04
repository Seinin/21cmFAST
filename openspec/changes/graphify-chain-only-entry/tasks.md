## 1. 关掉画布入口

- [x] 1.1 `Graphify/src/components/TopBar.tsx` 的 `VIEWS` 只留「物理链」一项，并把上方注释改成"画布视图已不对外开放（见 change graphify-chain-only-entry）"；验证：`cd Graphify && npm run build` 通过，且顶栏不渲染分段控件
- [x] 1.2 `Graphify/src/App.tsx` 的 `view` 初值由 `'canvas'` 改为 `'chain'`，并同步那行注释（不再写"目前只有画布一页"）；验证：`npm run build` 通过，打开站点首屏即物理链页
- [x] 1.3 确认 URL 没有后门：读 `App.tsx:256-263` 的同步分支，确认 `view === 'chain'` 时只写 `view=chain`、启动不读 `?view=`；验证：`npm run dev` 下用 `/?view=canvas` 打开仍落物理链页，地址栏被同步为 `view=chain`

## 2. 文档与门禁

- [x] 2.1 `Graphify/README.md` 的「视图切换」一行改写为"只有物理链页；画布视图不对外（`?view=canvas` 无效）"，并删掉以"两页切换 / 可分享 `?view=chain`"为前提的说法；验证：README 里搜不到"视图切换"「两页互不影响」这类旧口径（`grep -n "视图切换\|两页" Graphify/README.md` 无命中）
- [x] 2.2 跑 `cd Graphify && npm run build && npm run check:styles && npm run check:canvas && npm run check:tabs && npm run check:store && npm run check:graph && npm run check:tags && npm run check:chain && npm run check:copy`，并把条数写进本变更 `design.md`；验证：全部通过、无新增失败项
- [ ] 2.3 起站点手点一遍：首屏是物理链页、顶栏无页面切换与画布专属控件、`?view=canvas` 无效、物理链页的展开/选中/检索/证据标签页/跨红移回流开关照旧；验证：浏览器里逐条走通（含带参与刷新）
- [ ] 2.4 归档时把 `openspec/specs/graphify-physics-chain/spec.md` 的 Purpose「顶栏第二页」措辞、以及三处以画布页为前提的场景（`spec.md` 的「画布页不受影响」「切回画布页」）措辞同步为"画布页不对外可达"；验证：归档后主 spec 里搜不到"顶栏第二页"的旧说法
