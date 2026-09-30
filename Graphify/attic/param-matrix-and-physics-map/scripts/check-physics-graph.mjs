/**
 * 物理视角图谱自检（`npm run check:physics`）。检查的事：
 *
 *   1. 产物存在、能过 `parseGraph` 严格校验，且**不在 `data/` 下**（那里被 gitignore，构建期会缺文件）；
 *   2. 15 个天体参数全部在册，组名只可能是 AstroParams / AstroOptions，且都有 docId；
 *   3. 每个参数至少命中一个过程——空行是有信息量的（"这个参数与这些过程无关"），
 *      但**增删必须显式**：这里对着白名单核对，白名单之外的空行会让自检失败；
 *   4. 每个过程都有物理描述（来自 L1 的"作用与意义"）、至少一个文档锚点、且锚点在文档里真实存在；
 *   5. 格子的角色只在允许集（入公式 / 赋值 / 开关），出处行号指向真实文件且在文件行数内；
 *   6. 生成脚本幂等：重跑 `--stdout` 的结果与磁盘上的产物逐字一致；
 *   7. 四个曾"归属偏斜"的参数（F_STAR10 / F_ESC10 / HII_EFF_FACTOR / POP2_ION）各自命中 ≥2 个过程
 *      —— 这是本图谱存在的理由，退化成 1 个就意味着扫描范围又退回了旧口径。
 *
 * 用法：`npm run check:physics`（失败时退出码 1）
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseGraph } from '../server/lib/schema.mjs'
import { parseEntries } from './lib/atlasDocs.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(HERE, '..', 'src', 'generated', 'physics-graph.json')
const DATA_GRAPH = path.join(HERE, '..', 'data', 'graph.json')
const ATLAS_DIR = path.join(HERE, '..', '..', 'docs', 'notes', 'atlas')

const EXPECTED_PARAMS = [
  'F_STAR10', 'F_ESC10', 'HII_EFF_FACTOR', 'POP2_ION', 'M_TURN', 'R_MAX_TS', 'N_STEP_TS',
  'PHOTONCONS_CALIBRATION_END', 'PHOTON_CONS_TYPE', 'USE_TS_FLUCT', 'USE_MINI_HALOS',
  'USE_UPPER_STELLAR_TURNOVER', 'USE_EXP_FILTER', 'INTEGRATION_METHOD_ATOMIC', 'INTEGRATION_METHOD_MINI',
]
/** 允许"任何过程都不沾"的参数（目前没有：15 个全都有角色）。要放开某个，在这里显式加一行并写理由 */
const ALLOWED_EMPTY_ROWS = []
const ALLOWED_KINDS = new Set(['入公式', '赋值', '开关'])
const SKEWED = ['F_STAR10', 'F_ESC10', 'HII_EFF_FACTOR', 'POP2_ION']

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
  console.log('物理视角图谱 · 自检')

  console.log('\n[产物与校验]')
  const raw = await fs.readFile(OUT_FILE, 'utf8').catch(() => null)
  ok(Boolean(raw), `产物存在（${path.relative(path.join(HERE, '..'), OUT_FILE)}）`)
  if (!raw) return
  ok(!OUT_FILE.includes(`${path.sep}data${path.sep}`), '产物不在 data/ 下（那里被 gitignore，构建期 import 会缺文件）')

  let graph = null
  try {
    graph = parseGraph(JSON.parse(raw))
    ok(true, '过 parseGraph 严格校验')
  } catch (error) {
    ok(false, '过 parseGraph 严格校验', error.message)
    return
  }

  console.log('\n[参数维度]')
  const tagIds = graph.meta.tags.map((tag) => tag.id)
  ok(tagIds.length === EXPECTED_PARAMS.length, `参数条数 = ${EXPECTED_PARAMS.length}`, String(tagIds.length))
  const missing = EXPECTED_PARAMS.filter((name) => !tagIds.includes(`tag:${name}`))
  ok(missing.length === 0, '15 个天体参数一个不少', missing.join(','))
  const groups = new Set(graph.meta.tags.map((tag) => tag.group))
  ok(
    [...groups].every((group) => group === 'AstroParams' || group === 'AstroOptions'),
    '组名只有 AstroParams / AstroOptions 两类',
    [...groups].join(','),
  )
  ok(graph.meta.tags.every((tag) => String(tag.docId || '').trim()), '每个参数都有 docId')
  const noDescription = graph.meta.tags.filter((tag) => !String(tag.description || '').trim()).map((tag) => tag.name)
  console.log(
    `  · 行头说明：${graph.meta.tags.length - noDescription.length}/${graph.meta.tags.length} 条来自 inputs.py 的 docstring` +
      (noDescription.length ? `；源码未写说明的有 ${noDescription.join('、')}` : ''),
  )

  console.log('\n[过程维度]')
  const columns = graph.nodes
  ok(columns.length >= 6, '过程列数合理（≥6）', String(columns.length))
  const noSummary = columns.filter((node) => !String(node.summary || '').trim()).map((node) => node.label)
  ok(noSummary.length === 0, '每个过程都有物理描述（来自 L1 的"作用与意义"）', noSummary.join(','))
  const noAnchor = columns.filter((node) => !node.refs.some((ref) => ref.docId && ref.anchor)).map((node) => node.label)
  ok(noAnchor.length === 0, '每个过程都有（文档 + 锚点）引用', noAnchor.join(','))

  // 锚点必须真实存在：拿文档重解析一遍，逐个比对 slug
  const docAnchors = new Map()
  for (const file of ['L1-stages.md', 'L2-subprocesses.md']) {
    const entries = parseEntries(await fs.readFile(path.join(ATLAS_DIR, file), 'utf8'))
    docAnchors.set(`atlas/${file}`, new Set(entries.map((entry) => entry.anchor)))
  }
  const badAnchors = []
  for (const node of columns) {
    for (const ref of node.refs) {
      if (!ref.docId) continue
      const known = docAnchors.get(ref.docId)
      if (!known || !known.has(ref.anchor)) badAnchors.push(`${node.label} → ${ref.docId}#${ref.anchor}`)
    }
  }
  ok(badAnchors.length === 0, '每个锚点都能在对应文档里找到', badAnchors.slice(0, 3).join(' | '))

  console.log('\n[格子：角色与出处]')
  let cells = 0
  const badKinds = []
  const badRefs = []
  const rowHits = new Map(EXPECTED_PARAMS.map((name) => [name, 0]))
  for (const node of columns) {
    for (const [tagId, items] of Object.entries(node.tagDetails || {})) {
      for (const item of items) {
        cells += 1
        if (!ALLOWED_KINDS.has(item.kind)) badKinds.push(`${node.label}×${tagId}：${item.kind}`)
        const name = tagId.replace('tag:', '')
        rowHits.set(name, (rowHits.get(name) ?? 0) + 1)
        const ref = item.ref
        if (!ref?.file || !ref.line) {
          badRefs.push(`${node.label}×${tagId}：缺出处`)
          continue
        }
        const target = path.join(HERE, '..', '..', ref.file)
        const text = await fs.readFile(target, 'utf8').catch(() => null)
        if (!text) badRefs.push(`${node.label}×${tagId}：文件不存在 ${ref.file}`)
        else if (text.split('\n').length < ref.line) badRefs.push(`${node.label}×${tagId}：行号越界 ${ref.file}:${ref.line}`)
      }
    }
  }
  ok(cells > 20, '有色格数量合理（>20）', String(cells))
  ok(badKinds.length === 0, `角色取值都在允许集（${[...ALLOWED_KINDS].join(' / ')}）`, badKinds.slice(0, 3).join(' | '))
  ok(badRefs.length === 0, '每格出处都指向真实文件与合法行号', badRefs.slice(0, 3).join(' | '))

  console.log('\n[空行是有信息量的：必须显式]')
  const empty = EXPECTED_PARAMS.filter((name) => (rowHits.get(name) ?? 0) === 0)
  const unexpected = empty.filter((name) => !ALLOWED_EMPTY_ROWS.includes(name))
  ok(unexpected.length === 0, '没有"意外空行"（白名单之外的空行会让自检失败）', unexpected.join(','))
  console.log(`  · 每个参数命中的过程数：${EXPECTED_PARAMS.map((name) => `${name}:${rowHits.get(name) ?? 0}`).join(' ')}`)

  console.log('\n[中文物理名（显示层命名，每条都要有依据）]')
  {
    // 表在 `src/lib/paramAliases.json`：前端展示用它，这里断言它齐全、对得上、且有据可查
    const aliases = JSON.parse(await fs.readFile(path.join(HERE, '..', 'src', 'lib', 'paramAliases.json'), 'utf8'))
    ok(Array.isArray(aliases) && aliases.length === EXPECTED_PARAMS.length, `中文名条数 = ${EXPECTED_PARAMS.length}`, String(aliases?.length))
    ok(new Set(aliases.map((item) => item.tagId)).size === aliases.length, 'tagId 不重复')
    const missingAlias = EXPECTED_PARAMS.filter((name) => !aliases.some((item) => item.tagId === `tag:${name}`))
    ok(missingAlias.length === 0, '图谱里的每个参数都有中文名', missingAlias.join(','))
    ok(aliases.every((item) => String(item.short || '').trim()), '每条都有短名')
    ok(aliases.every((item) => String(item.source || '').trim()), '每条都有依据（source）')
    const tooLong = aliases
      .filter((item) => [...String(item.short)].length > 8)
      .map((item) => `${item.short}(${[...item.short].length})`)
    ok(tooLong.length === 0, '短名 ≤ 8 字符（保证参数列单行不挤压）', tooLong.join(','))
  }

  console.log('\n[归属偏斜必须已被修正]')
  for (const name of SKEWED) {
    ok((rowHits.get(name) ?? 0) >= 2, `${name} 至少命中 2 个过程`, String(rowHits.get(name) ?? 0))
  }

  console.log('\n[幂等：重跑生成脚本逐字一致]')
  const rerun = spawnSync(process.execPath, [path.join(HERE, 'build-physics-graph.mjs'), '--stdout'], {
    cwd: path.join(HERE, '..'),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  ok(rerun.status === 0, '重跑生成脚本成功', rerun.stderr?.split('\n').slice(-2).join(' '))
  const expected = JSON.parse(rerun.stdout || '{}')
  ok(
    JSON.stringify(expected) === JSON.stringify(JSON.parse(raw)),
    '重跑结果与磁盘产物一致（幂等）',
    `${(rerun.stdout || '').length} vs ${raw.length} 字节`,
  )

  console.log('\n[边界：现有图谱只读]')
  const legacy = await fs.readFile(DATA_GRAPH, 'utf8').catch(() => null)
  ok(Boolean(legacy), '现有图谱 data/graph.json 仍在（本图谱不改它）')
  if (legacy) {
    const parsedLegacy = JSON.parse(legacy)
    console.log(`  · 现有图谱：${parsedLegacy.nodes.length} 节点 / ${parsedLegacy.edges.length} 关系（只读核对，未改动）`)
  }
}

await main()

console.log('')
if (failures.length) {
  console.error(`✗ 物理视角图谱自检失败：${failures.length} / ${checks} 项`)
  for (const line of failures) console.error(`  · ${line}`)
  process.exit(1)
}
console.log(`✓ 物理视角图谱自检通过（${checks} 项断言）`)
