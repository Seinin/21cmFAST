/**
 * 物理图谱自检（`npm run check:physics-map`）。检查的事：
 *
 *   1. 产物存在、有内容哈希戳记、且不在 `data/` 下（那里被 gitignore，构建期会缺文件）；
 *   2. **覆盖完整**：骨干 = L1 的全部阶段，下钻 = L2 的全部子过程；计算单元只作落点、不占节点；
 *   3. **字段取自原文**：每个阶段/子过程都有「作用与意义」，锚点在文档里真实存在；
 *   4. **边可回溯**：每条边都能在 L1 里找到依据（产出者的「输出产物」与消费者的「输入产物」
 *      指向同一份产物），标签是产物名；
 *   5. **参数与源码一致**：默认值 / 范围 / log10 与 `inputs.py` 逐项相同，且"参数出现在哪些阶段"
 *      与参数矩阵的有色格**完全一致**（同一份口径，不允许两套答案）；
 *   6. **落点可核对**：文件存在、行区间落在文件内、不出现倒置；
 *   7. **文献不漂**：每个引用点回读源码那一行，必须真的含有该文献的年份；
 *   8. **幂等**：重跑 `--stdout` 与磁盘产物逐字一致；
 *   9. **边界**：工程图谱与矩阵数据仍在（本图谱只读它们）。
 *
 * 用法：`npm run check:physics-map`（失败时退出码 1）
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT, isStageCode, isSubprocessCode, isUnitCode, parseEntries } from './lib/atlasDocs.mjs'
import { TRACKED_PARAMS } from './lib/physicsMapData.mjs'
import { parseInputStructs } from './lib/pyInputs.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(HERE, '..', 'src', 'generated', 'physics-map.json')
const MATRIX_FILE = path.join(HERE, '..', 'src', 'generated', 'physics-graph.json')
const DATA_GRAPH = path.join(HERE, '..', 'data', 'graph.json')
const ATLAS = path.join(REPO_ROOT, 'docs', 'notes', 'atlas')
const INPUTS_FILE = path.join(REPO_ROOT, 'src', 'py21cmfast', 'wrapper', 'inputs.py')

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

const productOf = (link) => {
  const match = /^([PE])(\d{1,2})\s+(.+)$/.exec(String(link.text ?? '').trim())
  return match ? { code: `${match[1]}${match[2]}`, name: match[3].trim(), anchor: link.url.split('#')[1] ?? '' } : null
}

async function main() {
  console.log('物理图谱 · 自检')

  console.log('\n[产物]')
  const raw = await fs.readFile(OUT_FILE, 'utf8').catch(() => null)
  ok(Boolean(raw), `产物存在（${path.relative(path.join(HERE, '..'), OUT_FILE)}）`)
  if (!raw) return
  ok(!OUT_FILE.includes(`${path.sep}data${path.sep}`), '产物不在 data/ 下（那里被 gitignore）')
  const map = JSON.parse(raw)
  ok(map.version === 1, 'version = 1', String(map.version))
  ok(/^generated-[0-9a-f]{12}$/.test(map.stamp ?? ''), '有内容哈希戳记（不是时间戳）', map.stamp)
  ok(Array.isArray(map.source?.atlas) && map.source.atlas.length >= 6, '声明了数据来源（atlas 文档清单）')

  console.log('\n[覆盖：16 阶段 + 71 子过程]')
  const l1 = parseEntries(await fs.readFile(path.join(ATLAS, 'L1-stages.md'), 'utf8')).filter((entry) => isStageCode(entry.code))
  const l2 = parseEntries(await fs.readFile(path.join(ATLAS, 'L2-subprocesses.md'), 'utf8')).filter((entry) => isSubprocessCode(entry.code))
  ok(map.stages.length === l1.length, `骨干覆盖 L1 全部阶段（${l1.length} 个）`, String(map.stages.length))
  ok(map.subprocesses.length === l2.length, `下钻覆盖 L2 全部子过程（${l2.length} 个）`, String(map.subprocesses.length))
  const subprocessCodes = new Set(map.subprocesses.map((node) => node.id))
  ok(l2.every((entry) => subprocessCodes.has(entry.code)), 'L2 的每个子过程都在产物里', l2.filter((entry) => !subprocessCodes.has(entry.code)).map((entry) => entry.code).slice(0, 4).join(','))
  ok(![...subprocessCodes].some((id) => isUnitCode(id)), '计算单元没有被当成节点（只作落点）')
  const orphanStage = map.stages.filter((stage) => !stage.subprocessIds.length).map((stage) => stage.id)
  ok(orphanStage.length === 0, '每个阶段都有下钻内容', orphanStage.join(','))
  const badStage = map.subprocesses.filter((node) => !map.stages.some((stage) => stage.id === node.stageId)).map((node) => node.id)
  ok(badStage.length === 0, '每个子过程都归属到骨干里的阶段', badStage.slice(0, 4).join(','))

  console.log('\n[字段取自原文 + 锚点真实存在]')
  const anchorsByDoc = new Map()
  for (const file of ['L1-stages.md', 'L2-subprocesses.md']) {
    anchorsByDoc.set(`atlas/${file}`, new Set(parseEntries(await fs.readFile(path.join(ATLAS, file), 'utf8')).map((entry) => entry.anchor)))
  }
  const noSummary = [...map.stages, ...map.subprocesses].filter((node) => !String(node.summary || '').trim()).map((node) => node.id)
  ok(noSummary.length === 0, '每个阶段/子过程都有「作用与意义」（原文）', noSummary.join(','))
  const l1Anchors = anchorsByDoc.get('atlas/L1-stages.md')
  const l2Anchors = anchorsByDoc.get('atlas/L2-subprocesses.md')
  ok(map.stages.every((stage) => l1Anchors.has(stage.anchor)), '阶段锚点都能在 L1 里找到')
  ok(map.subprocesses.every((node) => l2Anchors.has(node.anchor)), '子过程锚点都能在 L2 里找到')
  const noSide = map.stages.filter((stage) => !String(stage.side || '').trim()).map((stage) => stage.id)
  ok(noSide.length === 0, '每个阶段都标了侧（Python / 后端）', noSide.join(','))

  console.log('\n[边：产物枢纽、可回溯]')
  const stageById = new Map(map.stages.map((stage) => [stage.id, stage]))
  ok(map.edges.length > 5, '边数量合理（>5）', String(map.edges.length))
  const badVia = map.edges.filter((edge) => !/^P\d+$/.test(edge.via?.p ?? '') || !edge.via?.name)
  ok(badVia.length === 0, '每条边都写了产物编号与名称', JSON.stringify(badVia.slice(0, 2)))
  ok(map.edges.every((edge) => stageById.has(edge.from) && stageById.has(edge.to)), '边的两端都是骨干里的阶段')
  ok(map.edges.every((edge) => edge.from !== edge.to), '没有自环')
  const producers = new Map()
  for (const entry of l1) {
    for (const product of (entry.fields['输出产物']?.links ?? []).map(productOf).filter(Boolean)) {
      producers.set(product.anchor, [...(producers.get(product.anchor) ?? []), entry.code])
    }
  }
  const l1ByCode = new Map(l1.map((entry) => [entry.code, entry]))
  const notBacked = []
  for (const edge of map.edges) {
    const from = l1ByCode.get(edge.from)
    const to = l1ByCode.get(edge.to)
    const out = (from?.fields['输出产物']?.links ?? []).map(productOf).filter(Boolean).some((product) => product.anchor === edge.via.anchor || product.code === edge.via.p)
    const into = (to?.fields['输入产物']?.links ?? []).map(productOf).filter(Boolean).some((product) => product.code === edge.via.p)
    if (!out || !into) notBacked.push(`${edge.from}->${edge.to} via ${edge.via.p}`)
  }
  ok(notBacked.length === 0, '每条边都能回查到 L1 的产物字段', notBacked.slice(0, 3).join(' | '))

  console.log('\n[参数：与源码、与矩阵三方一致]')
  const sources = parseInputStructs(await fs.readFile(INPUTS_FILE, 'utf8'))
  const byName = new Map(map.params.map((param) => [param.name, param]))
  ok(map.params.length === TRACKED_PARAMS.length, `参数条数 = ${TRACKED_PARAMS.length}`, String(map.params.length))
  ok(TRACKED_PARAMS.every((name) => byName.has(name)), '15 个天体参数一个不少')
  const mismatched = []
  for (const name of TRACKED_PARAMS) {
    const mined = byName.get(name)
    const source = sources.get(name)
    if (!source) {
      mismatched.push(`${name}：inputs.py 里解析不到`)
      continue
    }
    if (JSON.stringify(mined.default) !== JSON.stringify(source.default)) mismatched.push(`${name}：默认值 ${JSON.stringify(mined.default)} ≠ ${JSON.stringify(source.default)}`)
    if (Boolean(mined.log10) !== Boolean(source.log10)) mismatched.push(`${name}：log10 标记不一致`)
    if (JSON.stringify(mined.range) !== JSON.stringify(source.range)) mismatched.push(`${name}：范围 ${JSON.stringify(mined.range)} ≠ ${JSON.stringify(source.range)}`)
  }
  ok(mismatched.length === 0, '默认值 / 范围 / log10 与源码逐项一致', mismatched.slice(0, 3).join(' | '))
  const withDefault = map.params.filter((param) => param.default !== null).length
  ok(withDefault >= 10, '至少 10 个参数解析出了默认值（防静默全空）', String(withDefault))

  const matrixRaw = await fs.readFile(MATRIX_FILE, 'utf8').catch(() => null)
  ok(Boolean(matrixRaw), '矩阵数据（physics-graph.json）仍在，本图谱只读它')
  if (matrixRaw) {
    /**
     * 矩阵只覆盖 9 个后端物理阶段（S07–S15），物理图谱按范式覆盖全部 16 个阶段
     * （含 Python 侧的装配/编排/配置与基建），所以两者的**阶段范围本就不同**。
     * 要比的是"同一份归属口径"：把图谱的结果**裁到矩阵的范围**上，必须逐参数一致。
     */
    const matrix = JSON.parse(matrixRaw)
    const matrixScope = new Set(matrix.nodes.map((node) => String(node.id).replace('phys:', '').toUpperCase()))
    const matrixStages = new Map(TRACKED_PARAMS.map((name) => [name, new Set()]))
    for (const node of matrix.nodes) {
      const stage = String(node.id).replace('phys:', '').toUpperCase()
      for (const tag of node.tags ?? []) {
        const name = tag.replace('tag:', '')
        if (matrixStages.has(name)) matrixStages.get(name).add(stage)
      }
    }
    const drift = TRACKED_PARAMS.filter((name) => {
      const left = [...(matrixStages.get(name) ?? [])].sort().join(',')
      const right = [...(byName.get(name)?.stages ?? [])].filter((stage) => matrixScope.has(stage)).sort().join(',')
      return left !== right
    }).map((name) => `${name}：矩阵[${[...(matrixStages.get(name) ?? [])].join(',')}] 图谱∩矩阵范围[${[...(byName.get(name)?.stages ?? [])].filter((stage) => matrixScope.has(stage)).join(',')}]`)
    ok(drift.length === 0, `参数命中的阶段集合与矩阵一致（裁到矩阵覆盖的 ${matrixScope.size} 个阶段后）`, drift.slice(0, 3).join(' | '))
    const extra = TRACKED_PARAMS.filter((name) => (byName.get(name)?.stages ?? []).some((stage) => !matrixScope.has(stage))).length
    console.log(`  · 图谱比矩阵多出的阶段命中（Python 侧与基建，属预期）：${extra} 个参数有这种情况`)
  }

  console.log('\n[落点：可一步定位到代码段]')
  const places = [...map.stages, ...map.subprocesses].flatMap((node) => (node.units ?? []).map((place) => ({ ...place, owner: node.id })))
  ok(places.length > 50, '落点数量合理（>50）', String(places.length))
  const fileCache = new Map()
  const badPlaces = []
  for (const place of places) {
    if (!place.file || !place.line) {
      badPlaces.push(`${place.owner}：缺 file/line`)
      continue
    }
    if (place.endLine && place.endLine < place.line) badPlaces.push(`${place.owner}：行区间倒置 ${place.file}`)
    if (!fileCache.has(place.file)) fileCache.set(place.file, await fs.readFile(path.join(REPO_ROOT, place.file), 'utf8').catch(() => null))
    const text = fileCache.get(place.file)
    if (!text) badPlaces.push(`${place.owner}：文件不存在 ${place.file}`)
    else if (text.split('\n').length < (place.endLine || place.line)) badPlaces.push(`${place.owner}：行号越界 ${place.file}:${place.endLine || place.line}`)
  }
  ok(badPlaces.length === 0, '每个落点的文件与行区间都真实合法', badPlaces.slice(0, 3).join(' | '))
  ok(places.filter((place) => !place.fileWide).length >= 100, '按函数体定位的落点 ≥ 100（不是整文件兜底）', String(places.filter((place) => !place.fileWide).length))

  console.log('\n[文献：只抽注释里真实存在的引用]')
  ok(map.papers.length >= 20, `文献篇数合理（≥20）`, String(map.papers.length))
  ok(map.papers.every((paper) => paper.refs.length > 0), '每篇文献都有引用点')
  const badCite = []
  for (const paper of map.papers) {
    for (const ref of paper.refs) {
      if (!fileCache.has(ref.file)) fileCache.set(ref.file, await fs.readFile(path.join(REPO_ROOT, ref.file), 'utf8').catch(() => null))
      const text = fileCache.get(ref.file)
      if (!text) {
        badCite.push(`${paper.key}：文件不存在 ${ref.file}`)
        continue
      }
      const line = text.split('\n')[ref.line - 1] ?? ''
      if (!line.includes(String(paper.year))) badCite.push(`${paper.key}：${ref.file}:${ref.line} 那一行不含年份 ${paper.year}`)
    }
  }
  ok(badCite.length === 0, '每个引用点回读源码行，确实含该文献的年份', badCite.slice(0, 3).join(' | '))
  const withStage = map.papers.filter((paper) => paper.stages.length).length
  console.log(`  · 有归属阶段的文献 ${withStage}/${map.papers.length}；引用点合计 ${map.papers.reduce((sum, paper) => sum + paper.refs.length, 0)} 处`)

  console.log('\n[参数与矩阵口径之外的检索面]')
  ok(map.questions.length >= 50, `atlas 问句已收（≥50 条）`, String(map.questions.length))
  const questionTargets = new Set(map.questions.map((question) => question.target))
  const attached = map.subprocesses.filter((node) => node.questions.length).length + map.stages.filter((stage) => stage.questions.length).length
  ok(attached > 0 && questionTargets.size > 0, '问句挂到了具体节点上', `挂载节点 ${attached} 个`)
  const withKey = map.subprocesses.filter((node) => node.keyQuantities.length).length
  ok(withKey >= 30, '多数子过程带「关键量」（≥30）', String(withKey))

  console.log('\n[幂等：重跑生成脚本逐字一致]')
  const rerun = spawnSync(process.execPath, [path.join(HERE, 'build-physics-map.mjs'), '--stdout'], {
    cwd: path.join(HERE, '..'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  ok(rerun.status === 0, '重跑生成脚本成功', rerun.stderr?.split('\n').slice(-2).join(' '))
  ok(JSON.stringify(JSON.parse(rerun.stdout || '{}')) === JSON.stringify(map), '重跑结果与磁盘产物一致（幂等）', `${(rerun.stdout || '').length} vs ${raw.length} 字节`)

  console.log('\n[边界：现有图谱只读]')
  const legacy = await fs.readFile(DATA_GRAPH, 'utf8').catch(() => null)
  ok(Boolean(legacy), '工程视角图谱 data/graph.json 仍在（本图谱不改它）')
  if (legacy) {
    const parsed = JSON.parse(legacy)
    console.log(`  · 工程图谱：${parsed.nodes.length} 节点 / ${parsed.edges.length} 关系（只读核对，未改动）`)
  }
}

await main()

console.log('')
if (failures.length) {
  console.error(`✗ 物理图谱自检失败：${failures.length} / ${checks} 项`)
  for (const line of failures) console.error(`  · ${line}`)
  process.exit(1)
}
console.log(`✓ 物理图谱自检通过（${checks} 项断言）`)
