/**
 * 「物理图谱」的数据装配层（第三页的数据源）。
 *
 * 注意与 `build-physics-graph.mjs` 的区别：那个产出 `src/generated/physics-graph.json`，
 * 是**参数矩阵页**（行=参数、列=过程）的数据；本文件装配的是**物理图谱页**的数据：
 * 16 个阶段骨干 + 71 个子过程下钻 + 实现落点 + 参数默认值 + 文献索引。两者互不影响。
 *
 * 装配口径（范式见 openspec 变更 `graphify-physics-map`）：
 *   · 节点字段只取 atlas 与源码原文，**没有就留空**；
 *   · 边以产物为枢纽（产出者 → 消费者），标签是产物名；
 *   · 落点的行区间由符号的**函数体**定位得出，不用"引用行 ± 窗口"；
 *   · 文献只抽源码注释/docstring 里真实出现的引用。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import {
  ATLAS_DIR,
  codeSpans,
  docTargetOf,
  isStageCode,
  isSubprocessCode,
  isUnitCode,
  parseEntries,
  sourcePathOf,
} from './atlasDocs.mjs'
import { findSymbolBodies, readSource, scanParams } from './paramScan.mjs'
import { extractCitations, mergeCitations } from './sourceCitations.mjs'

/** 项目一直跟踪的天体物理参数（与参数矩阵同一份口径；扩到全量需先补文档归属，属另一件事） */
export const TRACKED_PARAMS = [
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

/** `[P02 初始条件](L0-pipeline.md#p02-初始条件)` → { p: 'P02', name: '初始条件', anchor } */
function productOf(link) {
  const match = /^([PE])(\d{1,2})\s+(.+)$/.exec(String(link.text ?? '').trim())
  if (!match) return null
  return { code: `${match[1]}${match[2]}`, name: match[3].trim(), anchor: link.url.split('#')[1] ?? '' }
}

/** 取字段里的产物链接（L1 的「输入产物」「输出产物」） */
function productsOf(field) {
  return (field?.links ?? []).map(productOf).filter(Boolean)
}

/** 取字段里的入口链接（L1 的「负责入口」，可能写成 E1–E4 的区间，links 会给出两端） */
function entriesOf(field) {
  const seen = new Set()
  const list = []
  for (const link of field?.links ?? []) {
    const item = productOf(link)
    if (!item || item.code.startsWith('P')) continue
    if (seen.has(item.code)) continue
    seen.add(item.code)
    list.push({ e: item.code, name: item.name })
  }
  return list
}

/** 侧（Python / 后端）：从 L1「阶段一览」表里按阶段编号找那一行，取含 Python/后端 的单元格 */
function sidesFromOverview(markdown) {
  const sides = new Map()
  for (const line of String(markdown).split('\n')) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map((cell) => cell.trim())
    // 编号那一格是链接（`[S01](#s01-参数装配与模板)`），所以不能只认行首的 `S01`
    const code = /\bS(\d{2})\b/.exec(cells.join(' '))
    if (!code) continue
    const side = cells.find((cell) => /^(Python|后端|前端)/.test(cell))
    if (side) sides.set(`S${code[1]}`, side)
  }
  return sides
}

/**
 * 解析 `INDEX.md` 里的「我想知道 → 直达」问句表。
 * 每一行 = 一条问句 + 一个文档锚点；问句原文是物理语言的检索入口，别处拿不到。
 */
function questionsFromIndex(markdown) {
  const questions = []
  let heading = ''
  for (const line of String(markdown).split('\n')) {
    const head = /^#{2,4}\s+(.+?)\s*$/.exec(line)
    if (head) {
      heading = head[1]
      continue
    }
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length < 4) continue
    const question = cells[1]
    const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(cells[2] ?? '')
    if (!question || !link || /^:?-+$/.test(question) || question === '我想知道') continue
    const [file, anchor = ''] = link[2].split('#')
    questions.push({ text: question, target: anchor, docId: `atlas/${file}`, section: heading })
  }
  return questions
}

/** L4 的「所属单元」链接 → 单元锚点 */
const unitAnchorOf = (entry) => docTargetOf(entry.fields['所属单元'])?.anchor ?? null

/** 一个过程（或阶段）里出现过的行区间：用于把文献引用点归到它名下 */
function rangesOf(places) {
  return places.map((place) => ({ file: place.file, startLine: place.line, endLine: place.endLine || place.line }))
}

/** 引用点属于哪个阶段/子过程：落在某个落点的行区间内算精确命中，否则算"同文件" */
function attributeCitation(ref, placeIndex) {
  const exact = placeIndex.find(
    (place) => place.file === ref.file && ref.line >= place.line && ref.line <= (place.endLine || place.line),
  )
  if (exact) return { stageId: exact.stageId, subprocessId: exact.subprocessId, precision: 'line' }
  const sameFile = placeIndex.filter((place) => place.file === ref.file)
  if (sameFile.length) return { stageId: sameFile[0].stageId, subprocessId: null, precision: 'file' }
  return null
}

/**
 * 装配整份物理图谱数据。
 * @param {{ inputsText: string, params: Map<string, object> }} options
 */
export async function buildPhysicsMap({ inputsText, params }) {
  const markdown = Object.fromEntries(
    await Promise.all(
      ['L0-pipeline.md', 'L1-stages.md', 'L2-subprocesses.md', 'L3-units.md', 'L4-key-processes.md', 'INDEX.md'].map(async (file) => [
        file,
        await fs.readFile(path.join(ATLAS_DIR, file), 'utf8'),
      ]),
    ),
  )

  const stages = parseEntries(markdown['L1-stages.md']).filter((entry) => isStageCode(entry.code))
  const subprocesses = parseEntries(markdown['L2-subprocesses.md']).filter((entry) => isSubprocessCode(entry.code))
  const units = parseEntries(markdown['L3-units.md']).filter((entry) => isUnitCode(entry.code))
  const keyEntries = parseEntries(markdown['L4-key-processes.md'])
  const sides = sidesFromOverview(markdown['L1-stages.md'])
  const questions = questionsFromIndex(markdown['INDEX.md'])

  const subprocessByAnchor = new Map(subprocesses.map((entry) => [entry.anchor, entry]))
  const keyByUnitAnchor = new Map(keyEntries.filter(unitAnchorOf).map((entry) => [unitAnchorOf(entry), entry]))

  /** 单元 → 落点（符号 + 函数体行区间），同时扫参数与文献 */
  const sourceCache = new Map()
  const fileCitationCache = new Map()
  const placeIndex = []
  const citations = []
  const unitInfo = new Map()
  const stats = { units: units.length, located: 0, fileWide: [], missed: [], paramHits: 0 }

  for (const unit of units) {
    const subprocess = subprocessByAnchor.get(docTargetOf(unit.fields['所属子过程'])?.anchor ?? '')
    if (!subprocess) continue
    const stageId = subprocess.code.split('.')[0]
    const file = sourcePathOf(unit.fields['承担者'])
    if (!file) {
      stats.missed.push(`${unit.code} ${unit.name}（承担者里没有源码链接）`)
      continue
    }
    const absolute = path.join(ATLAS_DIR, '..', '..', '..', file)
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
    // 承担者只给文件名或写明"各函数"时退化为整文件（与矩阵页同一套判断，见 build-physics-graph.mjs）
    const fileWide = bodies.length === 0 || /各函数|等函数|函数组/.test(carrier)
    if (fileWide) stats.fileWide.push(`${unit.code} ${unit.name} → ${file}`)
    else stats.located += 1

    const ranges = fileWide
      ? [{ startLine: 1, endLine: source.lines.length, masked: source.maskedLines }]
      : bodies.map((body) => ({ ...body, masked: source.maskedLines }))

    const places = (fileWide ? [{ startLine: 1, endLine: source.lines.length, symbol: symbols.join('、') }] : bodies.map((body) => ({ ...body, symbol: symbols.join('、') }))).map(
      (body) => ({
        unit: unit.code,
        unitName: unit.name,
        symbol: body.symbol,
        file,
        line: body.startLine,
        endLine: body.endLine,
        fileWide,
        stageId,
        subprocessId: subprocess.code,
      }),
    )
    placeIndex.push(...places)

    const hits = scanParams(source.lines, ranges, TRACKED_PARAMS)
    const paramMap = new Map()
    for (const [name, found] of hits) if (found.length) paramMap.set(name, found)
    stats.paramHits += [...paramMap.values()].reduce((sum, list) => sum + list.length, 0)

    /**
     * 文献：先按这一单元的行区间抽（行号精确），再整文件抽一次（同文件级）。
     *
     * 整文件那部分**按文件缓存**：否则同一个文件里的每个单元都会把整文件的引用再抽一遍，
     * 同一行会被重复计入几十次（踩过：`hmf.c:25` 一篇文献堆出 140 个"引用点"）。
     * 重复的引用点由 `mergeCitations()` 按 (文件, 行) 去重兜底。
     */
    const unitCitations = []
    for (const range of ranges) {
      const slice = source.lines.slice(range.startLine - 1, range.endLine).join('\n')
      unitCitations.push(...extractCitations(slice, file, language).map((item) => ({ ...item, line: item.line + range.startLine - 1 })))
    }
    if (!fileCitationCache.has(file)) fileCitationCache.set(file, extractCitations(source.text, file, language))

    unitInfo.set(unit.code, { unit, subprocess, stageId, places, params: paramMap, keyEntry: keyByUnitAnchor.get(unit.anchor) ?? null })
    citations.push(...unitCitations, ...fileCitationCache.get(file))
  }

  const papers = mergeCitations(citations)
  const papersByKey = new Map(papers.map((paper) => [paper.key, paper]))

  /** 每个单元/子过程/阶段涉及的参数与关键量 */
  const paramsOfSubprocess = new Map()
  const keyOfSubprocess = new Map()
  for (const info of unitInfo.values()) {
    const bucket = paramsOfSubprocess.get(info.subprocess.code) ?? new Set()
    for (const name of info.params.keys()) bucket.add(name)
    paramsOfSubprocess.set(info.subprocess.code, bucket)

    if (!info.keyEntry) continue
    const key = keyOfSubprocess.get(info.subprocess.code) ?? { processes: new Set(), quantities: new Set() }
    if (info.keyEntry.fields['关键过程']?.text) key.processes.add(info.keyEntry.fields['关键过程'].text)
    for (const quantity of codeSpans(info.keyEntry.fields['关键量']?.raw ?? '')) key.quantities.add(quantity)
    keyOfSubprocess.set(info.subprocess.code, key)
  }

  /** 文献归属：按引用点所在的文件与行，落到阶段/子过程上 */
  const papersOfSubprocess = new Map()
  const papersOfStage = new Map()
  const papersOfFile = new Map()
  for (const paper of papers) {
    for (const ref of paper.refs) {
      papersOfFile.set(ref.file, [...(papersOfFile.get(ref.file) ?? []), paper.key])
      const owner = attributeCitation(ref, placeIndex)
      ref.precision = owner?.precision ?? 'file'
      if (!owner) continue
      ref.stageId = owner.stageId
      if (owner.subprocessId) ref.subprocessId = owner.subprocessId
      const bucket = (owner.subprocessId ? papersOfSubprocess : papersOfStage)
      const code = owner.subprocessId ?? owner.stageId
      const set = bucket.get(code) ?? new Set()
      set.add(paper.key)
      bucket.set(code, set)
    }
  }

  const questionByTarget = new Map()
  for (const question of questions) questionByTarget.set(question.target, [...(questionByTarget.get(question.target) ?? []), question])

  const subprocessNodes = subprocesses.map((entry) => {
    const stageId = entry.code.split('.')[0]
    const inputs = productsOf(entry.fields['输入'])
    const outputText = entry.fields['产出']?.text ?? ''
    const outputProducts = productsOf(entry.fields['产出'])
    const unitsOf = [...unitInfo.values()].filter((info) => info.subprocess.code === entry.code)
    const places = unitsOf.flatMap((info) => info.places)
    const key = keyOfSubprocess.get(entry.code)
    return {
      id: entry.code,
      name: entry.name,
      stageId,
      anchor: entry.anchor,
      summary: entry.fields['作用与意义']?.text ?? '',
      inputs: inputs.map(({ code, name, anchor }) => ({ p: code, name, anchor })),
      output: { text: outputText, products: outputProducts.map(({ code, name, anchor }) => ({ p: code, name, anchor })) },
      params: [...(paramsOfSubprocess.get(entry.code) ?? new Set())],
      keyProcess: key ? [...key.processes] : [],
      keyQuantities: key ? [...key.quantities] : [],
      units: places.map((place) => ({ unit: place.unit, unitName: place.unitName, symbol: place.symbol, file: place.file, line: place.line, endLine: place.endLine, fileWide: place.fileWide })),
      papers: [...(papersOfSubprocess.get(entry.code) ?? new Set())],
      questions: questionByTarget.get(entry.anchor) ?? [],
    }
  })

  const subprocessById = new Map(subprocessNodes.map((node) => [node.id, node]))
  const paramsOfStage = new Map()
  for (const node of subprocessNodes) {
    const set = paramsOfStage.get(node.stageId) ?? new Set()
    for (const name of node.params) set.add(name)
    paramsOfStage.set(node.stageId, set)
  }

  const stageNodes = stages.map((entry) => {
    const outputs = productsOf(entry.fields['输出产物'])
    const inputs = productsOf(entry.fields['输入产物'])
    const children = subprocessNodes.filter((node) => node.stageId === entry.code)
    const units = children.flatMap((node) => node.units)
    const key = new Set(children.flatMap((node) => node.keyQuantities))
    return {
      id: entry.code,
      name: entry.name,
      side: sides.get(entry.code) ?? '',
      anchor: entry.anchor,
      summary: entry.fields['作用与意义']?.text ?? '',
      inputs: inputs.map(({ code, name, anchor }) => ({ p: code, name, anchor })),
      outputs: outputs.map(({ code, name, anchor }) => ({ p: code, name, anchor })),
      entryPoints: entriesOf(entry.fields['负责入口']),
      subprocessIds: children.map((node) => node.id),
      params: [...(paramsOfStage.get(entry.code) ?? new Set())],
      keyQuantities: [...key],
      units,
      papers: [...new Set([...(papersOfStage.get(entry.code) ?? new Set()), ...children.flatMap((node) => node.papers)])],
      questions: questionByTarget.get(entry.anchor) ?? [],
    }
  })

  /**
   * 边：产物为枢纽（产出者 → 消费者），标签写产物名。
   *
   * 这里刻意用**原始文档条目**建边，而不是复用节点上那份 `inputs`/`outputs` 投影：
   * 投影是为显示做的（只留编号与名字），一旦哪天再瘦身一次就会把 `anchor` 丢掉——
   * 而 `anchor` 正是"同一份产物"的判据。丢过一回，结果是把所有产出者并到一个键上，
   * 边数从十几条涨到一百多条。用原文建边就不会再有这种耦合。
   */
  const producers = new Map()
  for (const entry of stages) {
    for (const product of productsOf(entry.fields['输出产物'])) {
      producers.set(product.anchor, [...(producers.get(product.anchor) ?? []), entry.code])
    }
  }

  const edges = []
  const seenEdges = new Set()
  for (const entry of stages) {
    for (const product of productsOf(entry.fields['输入产物'])) {
      for (const producerId of producers.get(product.anchor) ?? []) {
        if (producerId === entry.code) continue
        const id = `${producerId}->${entry.code}`
        if (seenEdges.has(id)) continue
        seenEdges.add(id)
        edges.push({ from: producerId, to: entry.code, via: { p: product.code, name: product.name } })
      }
    }
  }

  const paramNodes = TRACKED_PARAMS.map((name) => {
    const info = params.get(name)
    if (!info) throw new Error(`inputs.py 里找不到参数 ${name}`)
    const paramPapers = []
    if (info.docstring) {
      const found = extractCitations(info.docstring, 'src/py21cmfast/wrapper/inputs.py', 'python')
      for (const item of found) paramPapers.push(item.key)
    }
    return {
      name,
      group: info.group,
      docstring: info.docstring,
      default: info.default,
      log10: info.log10,
      range: info.range,
      choices: info.choices,
      validatorText: info.validatorText,
      stages: [...new Set(subprocessNodes.filter((node) => node.params.includes(name)).map((node) => node.stageId))].sort(),
      subprocesses: subprocessNodes.filter((node) => node.params.includes(name)).map((node) => node.id),
      papers: [...new Set(paramPapers)],
    }
  })

  for (const param of paramNodes) {
    for (const key of param.papers) {
      const paper = papersByKey.get(key)
      if (paper) paper.params = [...new Set([...(paper.params ?? []), param.name])]
    }
  }

  const stageIdsByPaper = new Map()
  for (const node of stageNodes) for (const key of node.papers) stageIdsByPaper.set(key, [...new Set([...(stageIdsByPaper.get(key) ?? []), node.id])])
  const paperNodes = papers.map((paper) => ({
    key: paper.key,
    label: paper.label,
    year: paper.year,
    venues: [...new Set(paper.refs.map((ref) => ref.venue).filter(Boolean))],
    refs: paper.refs.map((ref) => ({ file: ref.file, line: ref.line, text: ref.text, precision: ref.precision ?? 'file', stageId: ref.stageId ?? null, subprocessId: ref.subprocessId ?? null })),
    stages: stageIdsByPaper.get(paper.key) ?? [],
    params: paper.params ?? [],
  }))

  // 阶段的上游/下游：由边反推（供详情面板直接读）
  for (const stage of stageNodes) {
    stage.upstream = edges.filter((edge) => edge.to === stage.id).map((edge) => edge.from)
    stage.downstream = edges.filter((edge) => edge.from === stage.id).map((edge) => edge.to)
  }

  return {
    version: 1,
    source: {
      atlas: ['L0-pipeline.md', 'L1-stages.md', 'L2-subprocesses.md', 'L3-units.md', 'L4-key-processes.md', 'INDEX.md'],
      inputsPy: 'src/py21cmfast/wrapper/inputs.py',
      note: '由 scripts/build-physics-map.mjs 从 atlas 文档与源码生成；字段只取原文，缺失留空。只读源，不改任何现有图谱。',
      files: [...new Set(placeIndex.map((place) => place.file))].sort(),
      citationsFrom: [...new Set(papers.flatMap((paper) => paper.refs.map((ref) => ref.file)))].sort(),
    },
    stages: stageNodes,
    subprocesses: subprocessNodes,
    edges,
    params: paramNodes,
    papers: paperNodes,
    questions,
    stats: {
      stages: stageNodes.length,
      subprocesses: subprocessNodes.length,
      units: placeIndex.length,
      params: paramNodes.length,
      papers: paperNodes.length,
      citationRefs: paperNodes.reduce((sum, paper) => sum + paper.refs.length, 0),
      located: stats.located,
      fileWide: stats.fileWide.length,
      missed: stats.missed.length,
      questions: questions.length,
    },
  }
}

/** 供自检复用的口径常量 */
export const SOURCE_ATLAS_FILES = ['L0-pipeline.md', 'L1-stages.md', 'L2-subprocesses.md', 'L3-units.md', 'L4-key-processes.md', 'INDEX.md']
