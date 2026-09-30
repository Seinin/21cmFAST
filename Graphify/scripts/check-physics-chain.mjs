/**
 * 物理链自检（`npm run check:chain`）。检查的事：
 *
 *   1. 真源 `docs/notes/physics-chain/chain.json` 合法：每个节点都有 Eq 编号与数学性质；
 *      每条边两端都存在、且带 Eq 出处（图上用 Eq 当边的标签，缺了就没法看）；
 *      简并条目成对出现；
 *   2. 生成物存在、有内容哈希戳记，且**节点/边与真源逐条对应**（生成器不许自作主张增删）；
 *   3. 真源与源码一致：参数默认值/范围与 `wrapper/inputs.py` 相同（生成器已拦一道，这里再核一遍）；
 *   4. **命名政策**：节点的符号用 P&L 写法（真源说了算）；代码名只能出现在附注字段里；
 *   5. 代码落点可核对：文件存在、行区间合法、区间不倒置；
 *   6. 幂等：重跑生成脚本与磁盘产物逐字一致；
 *   7. 边界：工程图谱 `data/graph.json` 仍在（本链只读它）。
 *
 * 用法：`npm run check:chain`（失败退出码 1）
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT } from './lib/atlasDocs.mjs'
import { parseInputStructs } from './lib/pyInputs.mjs'
// 分层口径（物理主链 / 旁路 / 工程话题）与生成器共用同一份；这里**独立重算**，不信任产物里的标注
import {
  BYPASS_STAGES,
  BYPASS_TOPIC_ID,
  IMPL_TOPIC_ID,
  PHYSICS_CHAIN_STAGES,
  isBypassHint,
  stageLayerOf,
  stageOfHint,
} from './lib/physicsStages.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(HERE, '..', 'src', 'generated', 'physics-chain.json')
const CHAIN_SOURCE = path.join(REPO_ROOT, 'docs', 'notes', 'physics-chain', 'chain.json')
const PAPER_INDEX = path.join(REPO_ROOT, 'docs', 'notes', 'physics-chain', 'papers.md')
const INPUTS_FILE = path.join(REPO_ROOT, 'src', 'py21cmfast', 'wrapper', 'inputs.py')
const DATA_GRAPH = path.join(HERE, '..', 'data', 'graph.json')

const failures = []
let checks = 0

function ok(condition, label, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ✓ ${label}`)
    return true
  }
  const line = `${label}${detail ? ` — ${detail}` : ''}`
  failures.push(line)
  console.log(`  ✗ ${line}`)
  return false
}

async function main() {
  console.log('物理链 · 自检')

  console.log('\n[真源：链条完整]')
  const chainRaw = await fs.readFile(CHAIN_SOURCE, 'utf8').catch(() => null)
  ok(Boolean(chainRaw), '真源存在（docs/notes/physics-chain/chain.json）')
  if (!chainRaw) return
  const chain = JSON.parse(chainRaw)
  const ids = new Set([...chain.drivers.map((item) => item.id), ...chain.nodes.map((item) => item.id)])
  ok(chain.drivers.length >= 4, '驱动量在册（≥4）', String(chain.drivers.length))
  ok(chain.nodes.length >= 10, '物理量在册（≥10）', String(chain.nodes.length))
  const noEq = chain.nodes.filter((node) => !String(node.eq ?? '').trim()).map((node) => node.id)
  ok(noEq.length === 0, '每个物理量都有 Eq 编号（边的标签靠它）', noEq.join(','))
  const noNature = chain.nodes.filter((node) => !String(node.nature?.type ?? '').trim()).map((node) => node.id)
  ok(noNature.length === 0, '每个物理量都有数学性质', noNature.join(','))
  const badEdges = chain.edges.filter((edge) => !ids.has(edge.from) || !ids.has(edge.to) || !String(edge.eq ?? '').trim())
  ok(badEdges.length === 0, '每条边两端存在且带 Eq 出处', badEdges.slice(0, 3).map((edge) => `${edge.from}->${edge.to}`).join(','))
  ok(chain.degeneracies.length >= 1, '至少记录了 1 处参数简并', String(chain.degeneracies.length))
  const danglingDeps = [...new Set(chain.nodes.flatMap((node) => node.dependsOn).filter((dep) => !ids.has(dep)))]
  ok(danglingDeps.length === 0, '依赖里没有未定义的量', danglingDeps.join(','))

  console.log('\n[真源：命名政策（物理量用 P&L 写法）]')
  // 政策：图上的符号取自真源（P&L 口径）；代码名只允许出现在 codeNames / params 的 name 字段
  const symbolLooksLikeCode = chain.nodes
    .filter((node) => /^[A-Z][A-Z0-9_]{3,}$/.test(node.symbol ?? ''))
    .map((node) => `${node.id}=${node.symbol}`)
  ok(symbolLooksLikeCode.length === 0, '节点符号不是代码常量名（大写蛇形）', symbolLooksLikeCode.join(','))
  const paramsSource = chain.params ?? {}
  const declaredGroups = Object.keys(paramsSource).filter((key) => Array.isArray(paramsSource[key]))
  ok(
    declaredGroups.length > 0,
    '参数分组在册（组名由真源声明，生成器与自检都不写死）',
    declaredGroups.map((name) => `${name} ${paramsSource[name].length}`).join(' / '),
  )
  const switchesNoPaper = (paramsSource.effects ?? []).filter((item) => item.switch && !String(item.paper ?? '').trim())
  console.log(`  · 效应开关 ${paramsSource.effects?.length ?? 0} 个；其中 ${switchesNoPaper.length} 个暂时没有来源论文（留空，不编）`)

  // 开关画在箭头上：它门控的每条边都必须真实存在（键 = `from->to`），否则图上那条虚线无处可挂
  const edgeKeys = new Set(chain.edges.map((edge) => `${edge.from}->${edge.to}`))
  const badGates = (paramsSource.effects ?? []).flatMap((item) =>
    (item.gatesEdges ?? []).filter((key) => !edgeKeys.has(key)).map((key) => `${item.name}→${key}`),
  )
  ok(badGates.length === 0, '每个效应开关门控的箭头都真实存在（虚线挂在哪条边上）', badGates.slice(0, 3).join(', '))
  const gated = (paramsSource.effects ?? []).reduce((sum, item) => sum + (item.gatesEdges?.length ?? 0), 0)
  console.log(`  · 门控关系 ${gated} 条；其中标了 basis 的 ${(paramsSource.effects ?? []).filter((item) => String(item.basis ?? '').trim()).length} 个（code = 代码可作证，inference = 我推断待你纠）`)

  console.log('\n[生成物：与真源逐条对应]')
  const raw = await fs.readFile(OUT_FILE, 'utf8').catch(() => null)
  ok(Boolean(raw), `产物存在（${path.relative(path.join(HERE, '..'), OUT_FILE)}）`)
  if (!raw) return
  const artifact = JSON.parse(raw)
  ok(/^generated-[0-9a-f]{12}$/.test(artifact.stamp ?? ''), '有内容哈希戳记', artifact.stamp)
  ok(artifact.nodes.length === chain.nodes.length, '物理量条数 = 真源', `${artifact.nodes.length} vs ${chain.nodes.length}`)
  ok(artifact.edges.length === chain.edges.length, '依赖边条数 = 真源', `${artifact.edges.length} vs ${chain.edges.length}`)
  const formulaMismatch = artifact.nodes
    .filter((node) => node.formula !== chain.nodes.find((item) => item.id === node.id)?.formula)
    .map((node) => node.id)
  ok(formulaMismatch.length === 0, '每条公式逐字等于真源（生成器不许改写）', formulaMismatch.join(','))

  console.log('\n[参数：真源与源码一致]')
  const inputs = parseInputStructs(await fs.readFile(INPUTS_FILE, 'utf8'))
  const mismatched = []
  for (const group of Object.keys(artifact.params ?? {})) {
    for (const param of artifact.params[group] ?? []) {
      const source = inputs.get(param.name)
      if (!source) {
        if (param.inCode !== false) mismatched.push(`${param.name}：源码里没有，但产物标成 inCode`)
        continue
      }
      if (JSON.stringify(param.default) !== JSON.stringify(source.default)) mismatched.push(`${param.name}：默认值 ${JSON.stringify(param.default)} ≠ 源码 ${JSON.stringify(source.default)}`)
      if (JSON.stringify(param.range) !== JSON.stringify(source.range)) mismatched.push(`${param.name}：范围不一致`)
    }
  }
  ok(mismatched.length === 0, '每个参数的默认值与范围都与 inputs.py 相同', mismatched.slice(0, 3).join(' | '))

  console.log('\n[代码落点：可核对]')
  const sites = [...artifact.drivers, ...artifact.nodes].flatMap((item) => item.code.sites.map((site) => ({ ...site, owner: item.id })))
  ok(sites.length > 0, '至少给出 1 处落点', String(sites.length))
  const fileCache = new Map()
  const badSites = []
  for (const site of sites) {
    if (!site.file || !site.line) {
      badSites.push(`${site.owner}：缺 file/line`)
      continue
    }
    if (site.endLine && site.endLine < site.line) badSites.push(`${site.owner}：区间倒置 ${site.file}`)
    if (!fileCache.has(site.file)) fileCache.set(site.file, await fs.readFile(path.join(REPO_ROOT, site.file), 'utf8').catch(() => null))
    const text = fileCache.get(site.file)
    if (!text) badSites.push(`${site.owner}：文件不存在 ${site.file}`)
    else if (text.split('\n').length < (site.endLine || site.line)) badSites.push(`${site.owner}：行号越界 ${site.file}:${site.endLine || site.line}`)
  }
  ok(badSites.length === 0, '每个落点的文件与行区间真实合法', badSites.slice(0, 3).join(' | '))

  console.log('\n[算法锚点：要么写实，要么显式列为待补]')
  const anchors = artifact.algorithms?.byId ?? {}
  const ANCHOR_FIELDS = ['how', 'when', 'discretization', 'where']
  const incomplete = Object.entries(anchors)
    .filter(([, value]) => ANCHOR_FIELDS.some((field) => !String(value?.[field] ?? '').trim()))
    .map(([id]) => id)
  ok(incomplete.length === 0, '已写锚点的条目四项齐全（怎么算 / 多久一次 / 受哪些离散化参数 / 落在哪）', incomplete.join(','))
  const pending = new Set([...(artifact.algorithmPending?.nodes ?? []), ...(artifact.algorithmPending?.drivers ?? [])])
  const allQuantities = [...artifact.drivers, ...artifact.nodes].map((item) => item.id)
  const silent = allQuantities.filter((id) => !anchors[id] && !pending.has(id))
  ok(silent.length === 0, '没有静默留空的量（要么写实，要么显式列进待补）', silent.slice(0, 6).join(','))
  const edgesAllPending = String(artifact.algorithmPending?.edges ?? '') === 'all'
  const anchoredEdges = Object.keys(anchors).filter((id) => !allQuantities.includes(id))
  ok(anchoredEdges.length > 0 || edgesAllPending, '边的锚点：要么写了，要么显式声明全部待补', artifact.algorithmPending?.edges)
  console.log(
    `  · 已写锚点 ${Object.keys(anchors).length} 条（其中边 ${anchoredEdges.length} 条）；显式待补 ${pending.size} 个量` +
      `；边的待补声明 = ${artifact.algorithmPending?.edges ?? '（无）'}（共 ${allQuantities.length} 个量、${artifact.edges.length} 条边）`,
  )

  console.log('\n[参数 × 节点 矩阵：后端查表]')
  const matrix = artifact.paramMatrix ?? {}
  const declaredNames = Object.values(artifact.params ?? {}).flat().map((param) => param.name)
  const noHit = declaredNames.filter((name) => !matrix[name])
  ok(Object.keys(matrix).length > 0, '矩阵非空（视图靠它把参数高亮到模块）', String(Object.keys(matrix).length))
  console.log(`  · 有归属的参数 ${Object.keys(matrix).length} / ${declaredNames.length} 个`)
  if (noHit.length) console.log(`  · 没有归属的（如实列出，不静默）：${noHit.join(' / ')}`)

  console.log('\n[图的形状：与画布一致（否则画布会在 cloneGraph 里崩）]')
  const canvasGraph = artifact.graph
  ok(Boolean(canvasGraph), '存在与画布同形状的图段 graph')
  const metaRequired = ['version', 'name', 'description', 'topics', 'tags']
  const missingMeta = metaRequired.filter((field) => canvasGraph?.meta?.[field] === undefined)
  ok(missingMeta.length === 0, '图元数据字段齐全（version/name/description/topics/tags）', missingMeta.join(','))
  const badTagDetail = (canvasGraph?.nodes ?? []).filter((node) =>
    Object.values(node.tagDetails ?? {}).some((value) => !Array.isArray(value)),
  )
  ok(badTagDetail.length === 0, 'tagDetails 的值是条目数组（TagDetailMap 形状）', badTagDetail.slice(0, 3).map((node) => node.id).join(','))
  const tagIds = new Set((canvasGraph?.meta?.tags ?? []).map((tag) => tag.id))
  const orphanTags = [...new Set((canvasGraph?.nodes ?? []).flatMap((node) => node.tags ?? []))].filter((id) => !tagIds.has(id))
  ok(orphanTags.length === 0, '节点引用的标签都在注册表里', orphanTags.slice(0, 3).join(','))
  const looseArrays = [...(canvasGraph?.nodes ?? []), ...(canvasGraph?.edges ?? [])].filter((item) => !Array.isArray(item.topics ?? []))
  ok(looseArrays.length === 0, '节点与连线的话题字段都是数组', looseArrays.slice(0, 3).map((item) => item.id).join(','))
  const implNodes = (canvasGraph?.nodes ?? []).filter((node) => (node.topics ?? []).includes('topic:impl'))
  ok(implNodes.length > 0, '工程节点挂在「实现细节」话题上（默认收起才有东西可收）', String(implNodes.length))
  ok(
    (canvasGraph?.meta?.topics ?? []).some((topic) => topic.id === 'topic:impl'),
    '「实现细节」话题在注册表里（否则关闭它没有意义）',
  )

  console.log('\n[过程层索引：每个量都能归到某个物理过程]')
  const stageIndex = artifact.stageIndex ?? {}
  const indexed = Object.values(stageIndex).flat()
  const allIds = [...artifact.drivers, ...artifact.nodes].map((item) => item.id)
  const missing = allIds.filter((id) => !indexed.includes(id))
  const duplicated = indexed.filter((id, index) => indexed.indexOf(id) !== index)
  ok(missing.length === 0, '每个量都落在某个过程里（没有漏归的）', missing.slice(0, 5).join(','))
  ok(duplicated.length === 0, '同一个量只归一个过程（没有重复归并）', duplicated.slice(0, 5).join(','))
  const stageKeys = Object.keys(stageIndex).filter((key) => key !== 'unassigned')
  ok(stageKeys.length >= 5, '过程层索引里至少有 5 个过程（S07 起才是物理）', stageKeys.join(','))
  console.log(
    `  · 过程 ${stageKeys.length} 个：${stageKeys.map((key) => `${key}(${stageIndex[key].length})`).join(' ')}` +
      `；不属于任何过程的输入 ${(stageIndex.unassigned ?? []).length} 个`,
  )

  console.log('\n[图的内容：每个量都有出处（代码 + 文献）]')
  const docRefs = (canvasGraph?.nodes ?? []).filter((node) => (node.refs ?? []).some((ref) => ref.docId))
  ok(docRefs.length > 0, '有文档/论文引用的量（检查器的「看引用」能打开文献）', String(docRefs.length))
  const docIds = [...new Set((canvasGraph?.nodes ?? []).flatMap((node) => (node.refs ?? []).map((ref) => ref.docId)).filter(Boolean))]
  const repoRoot = new URL('../../', import.meta.url).pathname
  const missingDocs = []
  for (const docId of docIds) {
    const found = await fs
      .access(`${repoRoot}docs/notes/${docId}`)
      .then(() => true)
      .catch(() => false)
    if (!found) missingDocs.push(docId)
  }
  ok(missingDocs.length === 0, '文档引用指向的文件真实存在', missingDocs.join(','))
  // 这条只**报告**不判定：现在还有量只有"待补"、没有代码落点，如实显示，不假装完整
  const noCodeRef = (canvasGraph?.nodes ?? []).filter((node) => node.type !== 'group' && !(node.refs ?? []).some((ref) => ref.file))
  console.log(`  · 还没有代码落点的量：${noCodeRef.length} 个（${noCodeRef.map((node) => node.id).join(',') || '无'}）`)

  console.log('\n[输入量身份：没有代码落点这件事，图上要读得出来]')
  const INPUT_TAGS = ['tag:输入参数', 'tag:外部量']
  const noCode = (canvasGraph?.nodes ?? []).filter((node) => node.type !== 'group' && !(node.refs ?? []).some((ref) => ref.file))
  const unlabelled = noCode.filter((node) => !(node.tags ?? []).some((tag) => INPUT_TAGS.includes(tag)))
  ok(unlabelled.length === 0, '每个没有代码落点的量都有身份标签（输入量 / 外部量）', unlabelled.map((node) => node.id).join(','))
  const registryIds = new Set((canvasGraph?.meta?.tags ?? []).map((tag) => tag.id))
  const missingTags = INPUT_TAGS.filter((tag) => !registryIds.has(tag))
  ok(missingTags.length === 0, '这两个身份标签在注册表里（否则标签等于悬空）', missingTags.join(','))
  console.log(`  · 没有代码落点的量 ${noCode.length} 个：${noCode.map((node) => node.id).join(',') || '无'}`)

  console.log('\n[宇宙学参数：单独一组，且能落到图上]')
  const cosmoNames = (artifact.params?.cosmo ?? []).map((item) => item.name)
  ok(cosmoNames.length > 0, '宇宙学参数单列一组（与天体物理分开）', String(cosmoNames.length))
  const cosmoMapped = cosmoNames.filter((name) => name in (artifact.paramMatrix ?? {}))
  ok(cosmoMapped.length > 0, '其中至少有一部分能落到图上的量（有映射才点得亮）', `${cosmoMapped.length}/${cosmoNames.length}`)
  const registryForCosmo = new Set((canvasGraph?.meta?.tags ?? []).map((tag) => tag.id))
  const cosmoUnregistered = cosmoMapped.filter((name) => !registryForCosmo.has(`tag:${name}`))
  ok(cosmoUnregistered.length === 0, '有映射的宇宙学参数都在标签注册表里', cosmoUnregistered.join(','))
  console.log(`  · 宇宙学参数 ${cosmoNames.length} 个，其中 ${cosmoMapped.length} 个已落到图上的量；未落图的：${cosmoNames.filter((n) => !(n in (artifact.paramMatrix ?? {}))).join(',') || '无'}`)

  console.log('\n[顶层流程：过程之间要有流向，且不许凭空加]')
  const groupIds = new Set((canvasGraph?.nodes ?? []).filter((node) => node.type === 'group').map((node) => node.id))
  const flowEdges = (canvasGraph?.edges ?? []).filter((edge) => edge.id.startsWith('flow:'))
  ok(flowEdges.length === 0, '容器（过程框）之间不画关系（用户口径：不需要）', `还留着 ${flowEdges.length} 条`)
  const containerEdges = (canvasGraph?.edges ?? []).filter((edge) => groupIds.has(edge.source) || groupIds.has(edge.target))
  ok(containerEdges.length === 0, '没有任何边连到容器上（层级改用"同深度等高 + 层号"表达）', containerEdges.slice(0, 4).map((edge) => edge.id).join(','))
  const bands = new Map()
  for (const node of (canvasGraph?.nodes ?? []).filter((item) => item.type !== 'group' && item.layer !== 'subgraph')) {
    const y = Math.round(node.position?.y ?? 0)
    bands.set(y, [...(bands.get(y) ?? []), node.id])
  }
  // 真正的不变量：**不在任何框里的量（输入/分析）不与框内的量同一条水平带**——
  // 同层可以有多个框（并排），但不能把"没框的"混进框那层
  const mixedBand = [...bands.entries()].filter(([, ids]) => {
    const boxed = ids.filter((id) => (canvasGraph?.nodes ?? []).find((n) => n.id === id)?.parent)
    const loose = ids.length - boxed.length
    return boxed.length > 0 && loose > 0
  })
  ok(mixedBand.length === 0, '外部量（输入/分析）不与框内量同一条水平带', mixedBand.slice(0, 3).map(([y]) => `y=${y}`).join(','))
  console.log(`  · 水平带 ${bands.size} 条：${[...bands.entries()].sort((a, b) => a[0] - b[0]).map(([y, ids]) => `y=${y}(${ids.length}个)`).join(' ')}`)

  console.log('\n[分层：骨干树 + 跨层成因（回答"为什么会出现跨层"）]')
  /**
   * 这一段**独立重算**，不信任生成物里的标注：层号按最长路径重算、成因按可达性重判，
   * 再把生成器的标注与重算结果对照。于是"骨干不跨层""跨层成因不许瞎标"都是可证伪的。
   */
  {
    const graphEdges = canvasGraph?.edges ?? []
    /**
     * 参与分层的节点集 = **所有非容器节点**，与生成器同口径。
     * 不能按 `layer !== 'subgraph'` 收窄：标了 `subgraph` 的**源节点**（如 `source_grid`，账本第一节"待改 ①"
     * 说它该移进子图、尚未动手）现在仍然有边在链上，把它排除会让"骨干边数 = 有下游的量数"假失败。
     * 子图里的 `step:*` 节点与边无关（边只连真源里的量），进来也不改变任何层号。
     */
    const quantityIds = (canvasGraph?.nodes ?? []).filter((node) => node.type !== 'group').map((node) => node.id)
    const level = new Map(quantityIds.map((id) => [id, 0]))
    for (let pass = 0; pass < quantityIds.length; pass += 1) {
      let moved = false
      for (const edge of graphEdges) {
        const next = (level.get(edge.target) ?? 0) + 1
        if (next > (level.get(edge.source) ?? 0)) {
          level.set(edge.source, next)
          moved = true
        }
      }
      if (!moved) break
    }
    const mismatchedSpan = graphEdges.filter(
      (edge) => edge.levelSpan !== (level.get(edge.source) ?? 0) - (level.get(edge.target) ?? 0),
    )
    ok(mismatchedSpan.length === 0, '每条边的层差与重算结果一致', mismatchedSpan.slice(0, 3).map((edge) => edge.id).join(','))
    const descending = graphEdges.filter((edge) => !Number.isInteger(edge.levelSpan) || edge.levelSpan < 1)
    ok(descending.length === 0, '箭头一律自上而下（层差 ≥ 1，没有回指上游的边）', descending.slice(0, 3).map((edge) => edge.id).join(','))

    const crossLevel = canvasGraph?.crossLevel ?? {}
    const backboneEdges = graphEdges.filter((edge) => edge.backbone)
    const outNodes = quantityIds.filter((id) => graphEdges.some((edge) => edge.source === id))
    ok(backboneEdges.length === outNodes.length, '骨干边数 = 有下游的量数（每个量恰好一个主父）', `${backboneEdges.length} vs ${outNodes.length}`)
    const spanningBackbone = backboneEdges.filter((edge) => edge.levelSpan !== 1)
    ok(spanningBackbone.length === 0, '**骨干边层差恒为 1** —— 骨干就是一棵真正的多叉树，结构上不可能跨层', spanningBackbone.slice(0, 3).map((edge) => edge.id).join(','))
    // 主父表必须让每个量恰好上溯一级：`parentOf[s]` 的层号 = s 的层号 − 1，且沿它上溯能走到层 0
    const parentOf = crossLevel.parentOf ?? {}
    const badParent = outNodes.filter((id) => {
      const parent = parentOf[id]
      return !parent || (level.get(parent) ?? -1) !== (level.get(id) ?? 0) - 1
    })
    ok(badParent.length === 0, '主父表 parents 逐级正确（父的层号 = 子的层号 − 1）', badParent.slice(0, 4).join(','))

    const reaches = (from, to) => {
      const seen = new Set([from])
      const queue = [from]
      while (queue.length) {
        const current = queue.shift()
        for (const edge of graphEdges.filter((item) => item.source === current)) {
          if (edge.target === to) return true
          if (seen.has(edge.target)) continue
          seen.add(edge.target)
          queue.push(edge.target)
        }
      }
      return false
    }
    /** 目标是不是旁路/诊断出口（判据与生成器同源：`lib/physicsStages.mjs` 按真源的 codeHints 判） */
    const chainHints = new Map([...chain.drivers, ...chain.nodes].map((item) => [item.id, (item.codeHints ?? []).map(String)]))
    const isBypass = (edge) => isBypassHint(chainHints.get(edge.target))
    const hasIndirect = (edge) =>
      graphEdges.some((other) => other.source === edge.source && other.target !== edge.target && reaches(other.target, edge.target))

    const crossEdges = graphEdges.filter((edge) => !edge.backbone)
    const wrongCoarse = crossEdges.filter((edge) => (edge.spanKind === 'coarse') !== (edge.levelSpan > 1 && hasIndirect(edge)))
    ok(wrongCoarse.length === 0, '「更细链条已蕴含」的标注与可达性重算一致（coarse 必须真有间接路径，反之亦然）', wrongCoarse.slice(0, 3).map((edge) => edge.id).join(','))
    const wrongBypass = crossEdges.filter((edge) => (edge.spanKind === 'bypass') !== (edge.levelSpan > 1 && !hasIndirect(edge) && isBypass(edge)))
    ok(wrongBypass.length === 0, '「旁路/诊断出口」的标注与真源的 S04 归属一致', wrongBypass.slice(0, 3).map((edge) => edge.id).join(','))
    const wrongSibling = crossEdges.filter((edge) => (edge.spanKind === 'sibling') !== (edge.levelSpan === 1))
    ok(wrongSibling.length === 0, '「同层第二个父」只标在层差 1 的边上', wrongSibling.slice(0, 3).map((edge) => edge.id).join(','))
    const silent = crossEdges.filter((edge) => !['sibling', 'coarse', 'bypass', 'gap'].includes(edge.spanKind))
    ok(silent.length === 0, '每条交叉边都有成因（没有静默的跨层箭头）', silent.slice(0, 3).map((edge) => edge.id).join(','))
    const listed = [...(crossLevel.backbone ?? []), ...(crossLevel.sibling ?? []), ...(crossLevel.coarse ?? []), ...(crossLevel.bypass ?? []), ...(crossLevel.gap ?? [])]
    const duplicated = listed.filter((id, index) => listed.indexOf(id) !== index)
    ok(duplicated.length === 0, '每条边只进一个名单（骨干 / 同级多父 / 可传递 / 旁路 / 缺中间量 互不重叠）', [...new Set(duplicated)].slice(0, 3).join(','))
    ok(listed.length === graphEdges.length, '全部边都被分到某一类里', `${listed.length} vs ${graphEdges.length}`)
    const declaredGaps = [...(crossLevel.gap ?? [])].sort()
    const actualGaps = crossEdges.filter((edge) => edge.spanKind === 'gap').map((edge) => edge.id).sort()
    ok(JSON.stringify(declaredGaps) === JSON.stringify(actualGaps), '缺中间量的边与名单一致（待补项不许漏报）', declaredGaps.join(','))
    console.log(
      `  · 骨干 ${backboneEdges.length} 条；交叉边 ${crossEdges.length} 条：同级多父 ${(crossLevel.sibling ?? []).length}` +
        ` / 更细链条已蕴含 ${(crossLevel.coarse ?? []).length} / 旁路诊断 ${(crossLevel.bypass ?? []).length} / 缺中间量 ${actualGaps.length}`,
    )
    if (actualGaps.length) console.log(`  · ⚠ 缺中间量的跨层边（待补，不静默）：${actualGaps.join('、')}`)
    const worstSpan = Math.max(0, ...graphEdges.map((edge) => edge.levelSpan ?? 0))
    console.log(
      `  · 最大层差 ${worstSpan} 层；层差分布 ${JSON.stringify(
        graphEdges.reduce((acc, edge) => ({ ...acc, [edge.levelSpan]: (acc[edge.levelSpan] ?? 0) + 1 }), {}),
      )}`,
    )
  }

  console.log('\n[子图：模块内部的步骤，且图是合法的]')
  const allNodeIds = (canvasGraph?.nodes ?? []).map((node) => node.id)
  const dupIds = allNodeIds.filter((id, index) => allNodeIds.indexOf(id) !== index)
  ok(dupIds.length === 0, '节点 id 全局唯一（同一 id 挂两个父节点是非法图）', [...new Set(dupIds)].slice(0, 4).join(','))
  const subgraphs = canvasGraph?.subgraphs ?? {}
  const subgraphParents = Object.keys(subgraphs)
  ok(subgraphParents.length > 0, '至少有一个模块有子图（双击能进去看步骤）', '一个都没有')
  const orphanSteps = Object.values(subgraphs)
    .flatMap((info) => info.steps)
    .filter((id) => !(canvasGraph?.nodes ?? []).some((node) => node.id === id))
  ok(orphanSteps.length === 0, '子图索引里的步骤都是真实的节点', orphanSteps.slice(0, 4).join(','))
  const badParents = Object.entries(subgraphs)
    .flatMap(([parent, info]) => info.steps.map((stepId) => ({ parent, stepId })))
    .filter(({ parent, stepId }) => {
      const step = (canvasGraph?.nodes ?? []).find((node) => node.id === stepId)
      return step?.parent !== parent
    })
  ok(badParents.length === 0, '每个步骤都挂在自己的模块下（parent 指向模块）', badParents.slice(0, 4).map((item) => item.stepId).join(','))
  console.log(`  · 有子图的模块 ${subgraphParents.length} 个：${subgraphParents.map((id) => `${id}(${subgraphs[id].steps.length}步)`).join(' ')}`)

  console.log('\n[过程框：量都装在框里（结构一致性；一级画哪些框由下一段的分层断言负责）]')
  const groups = (canvasGraph?.nodes ?? []).filter((node) => node.type === 'group')
  ok(
    groups.length === stageKeys.length,
    `过程框数 = 过程数（${groups.length} 个：${groups.map((group) => group.id.replace('stage:', '')).join(' ')}）`,
    `${groups.length} vs ${stageKeys.length}`,
  )
  const unboxed = Object.entries(stageIndex)
    .filter(([stage]) => stage !== 'unassigned')
    .flatMap(([stage, ids]) => ids.map((id) => ({ id, stage })))
    .filter(({ id, stage }) => {
      const node = (canvasGraph?.nodes ?? []).find((item) => item.id === id)
      return node?.parent !== `stage:${stage}`
    })
  ok(unboxed.length === 0, '每个量都挂在自己的过程框上（parent 正确）', unboxed.slice(0, 4).map((item) => item.id).join(','))
  const nameless = groups.filter((group) => {
    const stage = group.id.replace('stage:', '')
    return !group.label.includes(stage)
  })
  ok(nameless.length === 0, '每个框都带阶段号与名字（名字取自 atlas L1）', nameless.map((group) => group.id).join(','))

  console.log('\n[分层：一级只讲物理（旁路与实现细节默认收起）]')
  {
    const allGraphNodes = canvasGraph?.nodes ?? []
    const boxes = allGraphNodes.filter((node) => node.type === 'group')
    /**
     * 独立重算，不信任产物里的标记：
     *   · 口径侧：真源里出现的阶段必须都被登记；每个框的 `chain` 必须等于用共享口径重算出来的层；
     *   · 视图侧：按"注册表里的话题全部关闭"这个默认重算可见集（规则同 `src/lib/topics.ts` 的 tabVisibleIds，
     *     但不 import 视图代码），再看一级到底剩了哪些框 —— 于是"一级混进旁路或工程"是可证伪的。
     */
    const sourceStages = [
      ...new Set(
        [...chain.drivers, ...chain.nodes].flatMap((item) => (item.codeHints ?? []).map((hint) => stageOfHint(hint))).filter(Boolean),
      ),
    ].sort()
    const unclassified = sourceStages.filter((stage) => stageLayerOf(stage) === 'unknown')
    ok(unclassified.length === 0, `真源里出现的 ${sourceStages.length} 个阶段都在分层口径里（新阶段必须显式登记）`, unclassified.join(','))
    const layerOfBox = (box) => stageLayerOf(box.id.replace('stage:', ''))
    const mislabelled = boxes.filter((box) => box.chain !== layerOfBox(box))
    ok(mislabelled.length === 0, '每个过程框的 chain 标记 = 用共享口径重算的层', mislabelled.slice(0, 4).map((box) => `${box.id}=${box.chain}`).join(','))
    const badChain = boxes.filter((box) => !['main', 'bypass'].includes(box.chain))
    ok(badChain.length === 0, '没有未分层的过程框（chain 只能是 main / bypass）', badChain.map((box) => box.id).join(','))
    // —— 视图侧：重算默认可见集（根 + 装饰框的后代递归；模块的子节点在自己的标签页里）——
    const hiddenTopics = (canvasGraph?.meta?.topics ?? []).map((topic) => topic.id)
    const members = allGraphNodes.filter((node) => !(node.topics ?? []).some((id) => hiddenTopics.includes(id)))
    const memberById = new Map(members.map((node) => [node.id, node]))
    const childrenOf = new Map()
    for (const node of members) {
      if (!node.parent) continue
      childrenOf.set(node.parent, [...(childrenOf.get(node.parent) ?? []), node.id])
    }
    const visible = new Set()
    const queue = members.filter((node) => !node.parent).map((node) => node.id)
    while (queue.length) {
      const id = queue.shift()
      if (visible.has(id)) continue
      visible.add(id)
      if (memberById.get(id)?.type !== 'group') continue
      for (const child of childrenOf.get(id) ?? []) if (!visible.has(child)) queue.push(child)
    }
    const expectedMain = [...PHYSICS_CHAIN_STAGES].sort()
    const visibleBoxStages = boxes.filter((box) => visible.has(box.id)).map((box) => box.id.replace('stage:', '')).sort()
    ok(
      JSON.stringify(visibleBoxStages) === JSON.stringify(expectedMain),
      '一级的过程框恰好等于物理主链口径（多一个或漏一个都失败）',
      `${visibleBoxStages.join(',')} vs ${expectedMain.join(',')}`,
    )
    const stageOfNodeId = new Map([...chain.drivers, ...chain.nodes].map((item) => [item.id, stageOfHint(item.codeHints)]))
    const bypassStages = new Set(BYPASS_STAGES)
    const leakedBoxes = [...visible].filter((id) => String(id).startsWith('stage:') && bypassStages.has(String(id).replace('stage:', '')))
    ok(leakedBoxes.length === 0, '旁路阶段的过程框不在默认可见集里', leakedBoxes.join(','))
    const leakedQuantities = [...visible].filter((id) => bypassStages.has(stageOfNodeId.get(id) ?? ''))
    ok(leakedQuantities.length === 0, '旁路阶段的量不在默认可见集里（诊断出口默认收起）', leakedQuantities.join(','))
    const leakedEngineering = [...visible].filter((id) => memberById.get(id)?.type === 'engineering')
    ok(leakedEngineering.length === 0, '工程项不在默认可见集里（实现细节默认收起）', leakedEngineering.join(','))
    // —— 话题归属纪律（旁路与实现细节是两件事，不许混）——
    const engNodes = allGraphNodes.filter((node) => node.type === 'engineering')
    ok(engNodes.length > 0, '工程项在图上存在（收起的是真东西，不是空架子）', String(engNodes.length))
    const engWithoutTopic = engNodes.filter((node) => !(node.topics ?? []).includes(IMPL_TOPIC_ID)).map((node) => node.id)
    ok(engWithoutTopic.length === 0, `每个工程项都挂在「实现细节」（${IMPL_TOPIC_ID}）上`, engWithoutTopic.join(','))
    const nonEngWithTopic = allGraphNodes
      .filter((node) => node.type !== 'engineering' && (node.topics ?? []).includes(IMPL_TOPIC_ID))
      .map((node) => node.id)
    ok(nonEngWithTopic.length === 0, '非工程项不挂「实现细节」话题（话题含义不许被稀释）', nonEngWithTopic.join(','))
    ok(
      (canvasGraph?.meta?.topics ?? []).some((topic) => topic.id === BYPASS_TOPIC_ID),
      `「旁路与后处理接口」（${BYPASS_TOPIC_ID}）在话题注册表里（折叠条才有对象可展开）`,
    )
    const shouldBypass = [
      ...boxes.filter((box) => bypassStages.has(box.id.replace('stage:', ''))).map((box) => box.id),
      ...[...stageOfNodeId].filter(([, stage]) => bypassStages.has(stage)).map(([id]) => id),
      ...allGraphNodes
        .filter((node) => node.id.startsWith('step:') && bypassStages.has(String(node.id).replace('step:', '').split('.')[0]))
        .map((node) => node.id),
    ].sort()
    const bypassTopicNodes = allGraphNodes.filter((node) => (node.topics ?? []).includes(BYPASS_TOPIC_ID)).map((node) => node.id).sort()
    ok(
      JSON.stringify(bypassTopicNodes) === JSON.stringify(shouldBypass),
      '旁路话题恰好覆盖旁路阶段（框 + 量 + 步骤），不多不少',
      `${bypassTopicNodes.length} vs ${shouldBypass.length}`,
    )

    // —— 一级零工程零代码（文本层；名字与摘要里不许露出文件行号 / Python / 后端）——
    const CODEY = /\.(c|h|py):\d|Python|后端/
    const leakyText = [...visible]
      .map((id) => memberById.get(id))
      .filter(Boolean)
      .filter((node) => CODEY.test(`${node.label ?? ''} ${node.summary ?? ''}`))
      .map((node) => node.id)
    ok(leakyText.length === 0, '一级节点的名字与摘要里没有工程/代码痕迹（文件行号、Python、后端）', leakyText.slice(0, 4).join(','))
    console.log(
      `  · 默认收起话题 ${hiddenTopics.length} 个：${hiddenTopics.join(' ')}；一级看得到的量 ${visible.size} 个（过程框 ${visibleBoxStages.length} 个）`,
    )
  }

  console.log('\n[视图纪律：复用模板，不复用数据]')
  const viewFile = 'src/components/PhysicsChainView.tsx'
  const viewSource = await fs.readFile(viewFile, 'utf8').catch(() => '')
  ok(viewSource.length > 0, '物理链页存在（可读到源码）')
  ok(
    !viewSource.includes('useGraphStore'),
    '物理链页不碰画布的共享 store（数据各用各的）',
    '它 import 了 useGraphStore',
  )
  ok(viewSource.includes('GraphSourceProvider'), '物理链页通过「图数据源」提供自己的数据', '')
  ok(
    /onEnterSubgraph=\{(?!readOnlyNotice)/.test(viewSource),
    '双击模块能进子图（onEnterSubgraph 不是只读提示）',
    '被接成了只读提示 ⇒ 一个子图都进不去',
  )
  ok(viewSource.includes('TabBar'), '有子图标签条（进去之后能切回上一层）', '')
  ok(viewSource.includes('<Inspector'), '右侧检查器复用第一页的组件（不是自己另画一个）', '')
  ok(viewSource.includes('CodePreviewDrawer') && viewSource.includes('MdReaderDrawer'), '源码预览与文档阅读复用第一页的抽屉', '')

  console.log('\n[论文索引：与清单对得上]')
  const papers = await fs.readFile(PAPER_INDEX, 'utf8').catch(() => null)
  ok(Boolean(papers), '论文清单存在（docs/notes/physics-chain/papers.md）')
  if (papers) {
    const allParams = Object.values(artifact.params ?? {}).flat()
    const cited = allParams.filter((item) => String(item.paper ?? '').trim())
    /** 一处出处里可能同时写了多篇（如「Greig+2018 / Park+2018」），逐个带年份的标识符都要能在清单里找到 */
    const missingInIndex = []
    for (const param of cited) {
      const tokens = String(param.paper).match(/[\w&+.\-]*(?:19|20)\d{2}[\w.\-]*/g) ?? []
      const absent = tokens.filter((token) => !papers.includes(token))
      if (absent.length) missingInIndex.push(`${param.name}(${absent.join('/')})`)
    }
    ok(missingInIndex.length === 0, '参数上写的每一篇出处都能在论文清单里找到', missingInIndex.slice(0, 3).join(', '))
    console.log(`  · 有来源论文的参数 ${cited.length} 个；清单里本地缺正文的那批见 papers.md 第三节`)
  }

  console.log('\n[幂等：重跑生成脚本逐字一致]')
  const rerun = spawnSync(process.execPath, [path.join(HERE, 'build-physics-chain.mjs'), '--stdout'], {
    cwd: path.join(HERE, '..'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  ok(rerun.status === 0, '重跑生成脚本成功', rerun.stderr?.split('\n').slice(-2).join(' '))
  ok(JSON.stringify(JSON.parse(rerun.stdout || '{}')) === JSON.stringify(artifact), '重跑结果与磁盘产物一致（幂等）')

  console.log('\n[边界：工程图谱只读]')
  const legacy = await fs.readFile(DATA_GRAPH, 'utf8').catch(() => null)
  ok(Boolean(legacy), '工程视角图谱 data/graph.json 仍在（本链不改它）')
}

await main()

console.log('')
if (failures.length) {
  console.error(`✗ 物理链自检失败：${failures.length} / ${checks} 项`)
  for (const line of failures) console.error(`  · ${line}`)
  process.exit(1)
}
console.log(`✓ 物理链自检通过（${checks} 项断言）`)
