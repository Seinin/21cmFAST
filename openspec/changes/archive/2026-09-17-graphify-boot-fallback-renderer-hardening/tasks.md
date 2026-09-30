## 1. 恢复可用

- [x] 1.1 结束 5178 上的陈旧开发服务、清理 `Graphify/node_modules/.vite` 预打包缓存后重启（验证：端口重新监听，且开发服务返回的 `src/graph/cytoscapeSetup.ts` 带 `GraphRenderer` 导出，不再出现缺导出报错）

## 2. 启动与运行期失败可见化

- [x] 2.1 在 `index.html` 加静态启动占位与非 module 看门狗（超时 10 s；脚本 `error` 提前 800 ms、运行期 `error` 提前 1500 ms；面板含失败地址、恢复步骤、重新加载、复制诊断）（验证：微型 DOM 替身执行该内联脚本，挂载后不误报、未挂载出面板、脚本加载失败报出地址）
- [x] 2.2 新增 `src/components/AppErrorBoundary.tsx` 包住 `App`（错误摘要 + 可展开堆栈 + 复制 + 重新加载；挂载与捕获时打 `data-app-mounted` 并清除占位）（验证：`npx tsc -b` 通过，代码路径覆盖挂载成功与捕获两分支）
- [x] 2.3 `src/main.tsx` 注册全局 `error`（含捕获阶段资源错误）与 `unhandledrejection`，收敛为提示并做去重限流（8 s 冷却、固定 toast id、上限 12 条 key）（验证：`npx eslint src scripts` 通过，限流分支在源码中可核对）

## 3. 渲染器加固

- [x] 3.1 `applyCollapseState` 的还原分支对关系同样 `removeStyle('display')`，修复话题往返后连线不恢复（验证：真实模块复算「过滤 → 还原」后关系可见性恢复）
- [x] 3.2 `runLayout` 只把可见节点及其连接关系交给布局，并在 `runLayout` / `runLocalLayout` 捕获失败后经 `onLayoutError` 上报（验证：real cytoscape 下含隐藏复合容器时重排完成且不抛错）
- [x] 3.3 `GraphCanvas` 接收 `onLayoutError`：提示「布局未能完成，已保留现有节点位置」并兜底 `renderer.fit()`（验证：`npx tsc -b` 通过，回调接线在源码中可核对）
- [x] 3.4 `fit()` / `renderedPosition` / `nodeAt` 改用 `element.visible()`（含祖先隐藏语义）（验证：headless cytoscape 下祖先隐藏的节点不再被命中、不参与取景包围盒）

## 4. 验证

- [x] 4.1 跑 `npx tsc -b`、`npx eslint src scripts`、`npx vite build` 全绿（验证：三条命令退出码为 0）
- [x] 4.2 用真实模块 + 真实 cytoscape + 微型 DOM 替身复算本次三处加固与看门狗行为（验证：脚本断言全部 PASS，且临时脚本已删除）
- [ ] 4.3 浏览器侧人工回归：话题 ↔ 全部往返、全部收起 / 全部展开 / 切换布局算法、硬刷新（验证：画面正常、控制台无缺导出报错、无静默失败）

## 5. 归档

- [ ] 5.1 更新 `docs/DIRECTORY.md` §7 变更记录（补记本次白屏事故的定位与三层兜底，并关闭该表中「已知未改」的 fcose 隐藏容器问题）（验证：§7 新增一行，措辞与诊断面板文案一致）
- [ ] 5.2 `openspec validate` 通过并归档该 change（验证：`openspec archive graphify-boot-fallback-renderer-hardening` 执行成功）
