#!/usr/bin/env node
/**
 * 生成「物理视角图谱」——矩阵页的数据源。
 *
 * 为什么另起一份而不是改现有图谱：现有 `data/graph.json` 是工程口径的调度图（节点名带函数名、
 * 参数归属按节点的 refs ±窗口扫出，详见 scripts/scan-param-tags.mjs）。本图谱是**物理口径**的：
 *   · 过程 = atlas 分层文档的物理阶段（L1，本层明确"不出现函数名/文件路径/变量名"）
 *   · 参数 = `wrapper/inputs.py` 的 AstroParams / AstroOptions 里项目一直跟踪的那 15 个
 *   · 归属 = 扫 L3 计算单元「承担者」给出的函数体（C 按花括号、Python 按缩进），不靠旧图谱的 refs
 * 现有图谱**只读**，本脚本一行都不写它。
 *
 * 产物：`src/generated/physics-graph.json`（入库跟踪；不能放 `data/` —— 被 .gitignore 吃掉，
 * 构建期 import 会缺文件），形状沿用 Graphify schema，可直接过 `parseGraph` 校验。
 *
 * 用法：
 *   node scripts/build-physics-graph.mjs             # 写产物
 *   node scripts/build-physics-graph.mjs --dry-run   # 只打印统计与差异，不写
 *   node scripts/build-physics-graph.mjs --stdout    # 把 JSON 打到 stdout（不写文件）
 *   node scripts/build-physics-graph.mjs --layer=subprocesses   # 列换成 71 个子过程
 *   node scripts/build-physics-graph.mjs --stages=S07,S12,S13   # 自定列（含 S16 也支持）
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  codeSpans,
  docTargetOf,
  isStageCode,
  isSubprocessCode,
  isUnitCode,
  loadAtlas,
  sourcePathOf,
} from './lib/atlasDocs.mjs'
import { classifyKind, findSymbolBodies, readSource, scanParams } from './lib/paramScan.mjs'
import { parseGraph } from '../server/lib/schema.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT_FILE = path.join(HERE, '..', 'src', 'generated', 'physics-graph.json')
const INPUTS_FILE = path.join(HERE, '..', '..', 'src', 'py21cmfast', 'wrapper', 'inputs.py')

/**
 * 矩阵的行 = 项目一直当作"天体物理参数"跟踪的 15 个。
 * 两个结构各有 42 / 18 个字段，其余字段尚未进入任何文档与图谱，因此不在本图谱范围内
 * （要扩到全量需先补文档归属，属于另一件事）。
 */
const TRACKED_PARAMS = [
  'F_STAR10',
  'F_ESC10',
  'HII_EFF_FACTOR',
  'POP2_ION',
  'M_TURN',
  'R_MAX_TS',
  'N_STEP_TS',
  'PHOTONCONS_CALIBRATION_END',
  'PHOTON_CONS_TYPE',
  'USE_TS_FLUCT',
  'USE_MINI_HALOS',
  'USE_UPPER_STELLAR_TURNOVER',
  'USE_EXP_FILTER',
  'INTEGRATION_METHOD_ATOMIC',
  'INTEGRATION_METHOD_MINI',
]

/** 默认列：L1 里**后端物理阶段**（S01–S05 在 Python 侧、S06 是配置，S07 起才是物理）。S16 是基建+校准，默认不含 */
const DEFAULT_STAGES = ['S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15']

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => args.find((item) => item.startsWith(`--${name}=`))?.split('=')[1] ?? null
const DRY_RUN = flag('dry-run') || flag('stdout')
/** `--stdout` 时把"给人看的"统计行送到 stderr，保证 stdout 只有纯 JSON */
const say = flag('stdout') ? (...parts) => console.error(...parts) : (...parts) => console.log(...parts)
const LAYER = value('layer') === 'subprocesses' ? 'subprocesses' : 'stages'
const STAGE_SCOPE = (value('stages') ? value('stages').split(',') : DEFAULT_STAGES).map((item) => item.trim()).filter(Boolean)

/** 解析 `class X(InputStruct)` 的字段名与 docstring 说明（`NAME : type, optional` + 缩进描述） */
function parseInputStructs(text) {
  const classes = new Map()
  let current = null
  let inDoc = false
  let docName = null
  let docLines = []
  const flush = () => {
    if (current && docName && docLines.length) {
      current.docs.set(docName, docLines.join(' ').replace(/\s+/g, ' ').trim())
    }
    docName = null
    docLines = []
  }

  for (const line of text.split('\n')) {
    const classMatch = /^class\s+(\w+)\(InputStruct\)/.exec(line)
    if (classMatch) {
      flush()
      current = { name: classMatch[1], fields: new Set(), docs: new Map() }
      classes.set(current.name, current)
      inDoc = false
      continue
    }
    if (!current) continue
    // 只认"恰好 4 空格缩进"的三引号：类 docstring 在 4 空格，方法自己的 docstring 在 8 空格，
    // 混在一起会让开关错相（踩过：AstroOptions 的字段一个都没收集到）。
    if (/^ {4}r?"""\s*$/.test(line)) {
      inDoc = !inDoc
      flush()
      continue
    }
    if (inDoc) {
      const fieldDoc = /^\s{4}([A-Z][A-Z0-9_]*)\s*:\s*\S+/.exec(line)
      if (fieldDoc) {
        flush()
        docName = fieldDoc[1]
        continue
      }
      if (docName && /^\s{8,}\S/.test(line)) {
        docLines.push(line.trim())
        continue
      }
      continue
    }
    // 字段定义一律是"4 空格缩进 + 全大写属性名 + 冒号"；取值可能是 field(...) 也可能是
    // choice_field(...) 或跨行写的 Literal[...]（这里都不关心取值，只收字段名）
    const fieldDef = /^ {4}([A-Z][A-Z0-9_]*)\s*:/.exec(line)
    if (fieldDef) current.fields.add(fieldDef[1])
  }
  flush()
  return classes
}

/** 行头用一句话：取 docstring 的第一句（schema 的 description 上限 400，故再兜一刀） */
function firstSentence(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return ''
  const cut = trimmed.indexOf('. ')
  const sentence = cut > 24 ? trimmed.slice(0, cut + 1) : trimmed
  return sentence.length > 380 ? `${sentence.slice(0, 377)}…` : sentence
}

/** 阶段 → 该阶段的产物（用于连边：产出 P 的阶段 → 消费 P 的阶段） */
function buildEdges(stages) {
  const producers = new Map()
  for (const stage of stages) {
    for (const link of stage.fields['输出产物']?.links ?? []) {
      const anchor = link.url.split('#')[1] ?? ''
      if (!/^p\d/.test(anchor)) continue
      producers.set(anchor, [...(producers.get(anchor) ?? []), stage.code])
    }
  }

  const edges = []
  const seen = new Set()
  for (const stage of stages) {
    for (const link of stage.fields['输入产物']?.links ?? []) {
      const anchor = link.url.split('#')[1] ?? ''
      if (!/^p\d/.test(anchor)) continue
      for (const producer of producers.get(anchor) ?? []) {
        if (producer === stage.code) continue
        const id = `${producer}->${stage.code}`
        if (seen.has(id)) continue
        seen.add(id)
        edges.push({
          id,
          source: `phys:${producer.toLowerCase()}`,
          target: `phys:${stage.code.toLowerCase()}`,
          label: link.text,
          type: 'derives_from',
          directed: true,
          note: '',
          sourcePort: null,
          targetPort: null,
          conditional: false,
          createdAt: '',
          updatedAt: '',
        })
      }
    }
  }
  return edges
}

async function main() {
  const { stages, subprocesses, units } = await loadAtlas()
  const inputsText = await fs.readFile(INPUTS_FILE, 'utf8')
  const structs = parseInputStructs(inputsText)

  // 参数登记：组名 = 它所在的结构（AstroParams / AstroOptions），说明取 inputs.py 的 docstring 原文
  const paramInfo = new Map()
  for (const name of TRACKED_PARAMS) {
    const owner = [...structs.values()].find((item) => item.fields.has(name))
    if (!owner) throw new Error(`inputs.py 里找不到参数 ${name}`)
    paramInfo.set(name, { group: owner.name, description: owner.docs.get(name) ?? '' })
  }

  // 扫 L3 计算单元的「承担者」函数体
  const unitList = units.filter((unit) => isUnitCode(unit.code))
  const subprocessByAnchor = new Map(subprocesses.filter((item) => isSubprocessCode(item.code)).map((item) => [item.anchor, item]))
  const sourceCache = new Map()
  /** stageCode → { params: Map<param, hits[]>, subprocesses: Set<code> } */
  const byStage = new Map()
  const stats = { units: unitList.length, located: 0, missed: [], byFile: [], hits: 0 }

  for (const unit of unitList) {
    const subprocess = subprocessByAnchor.get(docTargetOf(unit.fields['所属子过程'])?.anchor ?? '')
    if (!subprocess) continue
    const stageCode = subprocess.code.split('.')[0]
    if (LAYER === 'stages' && !STAGE_SCOPE.includes(stageCode)) continue

    const file = sourcePathOf(unit.fields['承担者'])
    if (!file) continue
    const absolute = path.join(HERE, '..', '..', file)
    const language = file.endsWith('.py') ? 'python' : 'c'
    if (!sourceCache.has(absolute)) sourceCache.set(absolute, readSource(absolute, language).catch(() => null))
    const source = await sourceCache.get(absolute)
    if (!source) {
      stats.missed.push(`${unit.code} ${unit.name}（源文件读不到：${file}）`)
      continue
    }

    const carrier = unit.fields['承担者']?.raw ?? ''
    const symbols = codeSpans(carrier).filter((item) => !/\.(c|h|py)$/.test(item))
    const maskedText = source.maskedLines.join('\n')
    const bodies = symbols.flatMap((symbol) => findSymbolBodies(maskedText, symbol, language))
    /**
     * 两种"整文件归属"：
     *   ① 承担者只给文件名与"各函数"（不给符号名，或符号一个都没定位到）；
     *   ② 承担者明说"…与…各函数"——那是对**整个文件**的归属，只扫具名函数会漏
     *      （踩过：`USE_UPPER_STELLAR_TURNOVER` 只在 scaling_relations.c 的另一个函数里出现，因此落空）。
     * 其余情况只扫具名函数体，避免把大文件里别的阶段的内容吸进来。
     */
    const fileWide = bodies.length === 0 || /各函数|等函数|函数组/.test(carrier)
    const ranges = fileWide
      ? [{ startLine: 1, endLine: source.lines.length, masked: source.maskedLines }]
      : bodies.map((body) => ({ ...body, masked: source.maskedLines }))
    if (fileWide) stats.byFile.push(`${unit.code} ${unit.name} → ${file}`)
    else stats.located += 1

    const hits = scanParams(source.lines, ranges, TRACKED_PARAMS)
    const bucket = byStage.get(stageCode) ?? { params: new Map(), subprocesses: new Set() }
    byStage.set(stageCode, bucket)

    for (const [name, found] of hits) {
      if (!found.length) continue
      stats.hits += found.length
      bucket.params.set(name, [...(bucket.params.get(name) ?? []), ...found.map((hit) => ({ ...hit, unit, subprocess, file, language }))])
      bucket.subprocesses.add(subprocess.code)
    }
  }

  // 组装新图谱
  const inScope = (code) => (LAYER === 'subprocesses'
    ? [...(new Set([...byStage.keys()].flatMap((stage) => [...(byStage.get(stage)?.subprocesses ?? [])])))]
    : STAGE_SCOPE)
  const columnCodes = LAYER === 'subprocesses'
    ? subprocesses.filter((item) => isSubprocessCode(item.code) && inScope().includes(item.code))
    : stages.filter((item) => isStageCode(item.code) && STAGE_SCOPE.includes(item.code))

  const nodes = columnCodes.map((column, index) => {
    const stageCode = LAYER === 'subprocesses' ? column.code.split('.').slice(0, 2).join('') : column.code
    const bucket = byStage.get(stageCode.startsWith('S') ? stageCode.slice(0, 3) : stageCode)
    const hitsForColumn = LAYER === 'subprocesses'
      ? new Map([...((bucket?.params ?? new Map()))].map(([name, hits]) => [name, hits.filter((hit) => hit.subprocess.code === column.code)]))
      : (bucket?.params ?? new Map())

    const tags = []
    const tagDetails = {}
    for (const [name, hits] of hitsForColumn) {
      if (!hits.length) continue
      tags.push(`tag:${name}`)
      const subNames = [...new Set(hits.map((hit) => `${hit.subprocess.code} ${hit.subprocess.name}`))].slice(0, 3)
      const kinds = hits.map((hit) => classifyKind(hit.text))
      const kind = kinds.includes('入公式') ? '入公式' : kinds.includes('赋值') ? '赋值' : '开关'
      const first = hits[0]
      tagDetails[`tag:${name}`] = [
        {
          label: name,
          kind,
          note: `落在 ${subNames.join(' / ')}`,
          ref: { docId: '', anchor: '', label: '', file: first.file, line: first.line, endLine: null },
        },
      ]
    }

    const subprocessAnchor = column.fields['下一层'] ? docTargetOf(column.fields['下一层']) : null
    return {
      id: `phys:${column.code.toLowerCase().replace(/\./g, '-')}`,
      label: `${column.code} ${column.name}`,
      type: 'method',
      summary: column.fields['作用与意义']?.text ?? '',
      tags,
      tagDetails,
      refs: [
        {
          docId: LAYER === 'subprocesses' ? 'atlas/L2-subprocesses.md' : 'atlas/L1-stages.md',
          anchor: column.anchor,
          label: column.heading,
          file: '',
          line: null,
          endLine: null,
        },
      ],
      topics: [column.code.startsWith('S07') || column.code.startsWith('S08') ? 'phys-base' : 'phys-product'],
      parent: null,
      conditional: false,
      position: { x: index * 260, y: 0 },
      createdAt: '',
      updatedAt: '',
    }
  })

  const graph = {
    meta: {
      version: 1,
      name: '物理视角图谱 · 天体物理参数 × 物理过程',
      description:
        '从 docs/notes/atlas 分层文档与 src/py21cmfast 源码生成：行是天体物理参数（AstroParams / AstroOptions），列是物理过程（L1 阶段），格子是该参数在此过程中的角色。现有工程视角图谱（data/graph.json）不受影响。',
      topics: [
        { id: 'phys-base', name: '基础查表（不直接产出产物）', description: '宇宙学背景与质量函数：为后续阶段提供查表，本身不产出 L0 产物' },
        { id: 'phys-product', name: '产物阶段', description: '直接产出 L0 产物的物理阶段（初始条件 → 亮温输出）' },
      ],
      tags: TRACKED_PARAMS.map((name) => ({
        id: `tag:${name}`,
        name,
        description: firstSentence(paramInfo.get(name).description),
        group: paramInfo.get(name).group,
        docId: 'atlas/L1-stages.md',
      })),
      updatedAt: new Date().toISOString(),
    },
    nodes,
    edges: buildEdges(columnCodes),
  }

  // 统计与自检
  const filled = nodes.reduce((sum, node) => sum + Object.keys(node.tagDetails).length, 0)
  const emptyParams = TRACKED_PARAMS.filter((name) => !nodes.some((node) => node.tags.includes(`tag:${name}`)))
  say(`物理视角图谱 · 生成（层=${LAYER}）`)
  say(`  参数 ${TRACKED_PARAMS.length} 个 · 过程 ${nodes.length} 列 · 有色格 ${filled} 个 · 边 ${graph.edges.length} 条`)
  say(`  扫过 L3 单元 ${stats.located} 个（按函数体）+ ${stats.byFile.length} 个（按整文件），命中参数行 ${stats.hits} 处`)
  if (stats.byFile.length) say(`  按整文件归属的单元：\n    - ${stats.byFile.slice(0, 6).join('\n    - ')}`)
  if (stats.missed.length) say(`  未定位的单元 ${stats.missed.length} 个（不影响其它列）：\n    - ${stats.missed.slice(0, 8).join('\n    - ')}`)
  if (emptyParams.length) say(`  空行（该参数在任何列都没有角色）：${emptyParams.join(', ')}`)

  /**
   * 戳记用**内容哈希**：schema 要求 `createdAt`/`updatedAt` 非空，但写当前时间会让产物每次都不一样
   * （幂等就废了）。取内容哈希 ⇒ 文档与源码不变时产物逐字不变，变了就跟着变。
   */
  const stamp = `generated-${createHash('sha1')
    .update(
      JSON.stringify({
        meta: { ...graph.meta, updatedAt: '' },
        nodes: graph.nodes.map((node) => ({ ...node, createdAt: '', updatedAt: '' })),
        edges: graph.edges.map((edge) => ({ ...edge, createdAt: '', updatedAt: '' })),
      }),
    )
    .digest('hex')
    .slice(0, 12)}`
  graph.meta.updatedAt = stamp
  for (const node of graph.nodes) {
    node.createdAt = stamp
    node.updatedAt = stamp
  }
  for (const edge of graph.edges) {
    edge.createdAt = stamp
    edge.updatedAt = stamp
  }

  const parsed = parseGraph(graph) // 严格校验：不过就不写文件
  if (flag('stdout')) {
    process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`)
    return
  }
  if (DRY_RUN) {
    say('  （dry-run：没有写文件）')
    return
  }
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
  const before = await fs.readFile(OUT_FILE, 'utf8').catch(() => null)
  const payload = `${JSON.stringify(parsed, null, 2)}\n`
  if (before === payload) {
    console.log('  产物无变化（幂等）')
    return
  }
  if (before) await fs.writeFile(`${OUT_FILE}.bak`, before, 'utf8')
  await fs.writeFile(`${OUT_FILE}.tmp`, payload, 'utf8')
  await fs.rename(`${OUT_FILE}.tmp`, OUT_FILE)
  console.log(`  已写入 ${path.relative(path.join(HERE, '..'), OUT_FILE)}${before ? '（旧版留在 .bak）' : ''}`)
}

await main()
