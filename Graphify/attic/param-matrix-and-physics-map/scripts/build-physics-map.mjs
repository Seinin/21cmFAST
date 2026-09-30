#!/usr/bin/env node
/**
 * 生成「物理图谱」——应用第三页的数据源。
 *
 * 与另外两份数据的边界（别混淆）：
 *   · `data/graph.json`                  工程视角图谱（画布页），本脚本**只读不动**；
 *   · `src/generated/physics-graph.json` 参数矩阵页的数据（`build-physics-graph.mjs`），同样不动；
 *   · `src/generated/physics-map.json`   **本脚本的产物**（物理图谱页）。
 *
 * 范式（见 openspec 变更 `graphify-physics-map`）：
 *   · 真源 = `docs/notes/atlas/` 分层文档 + 源码；单向生成；
 *   · 骨干 = 16 个阶段，下钻 = 71 个子过程，208 个计算单元只作「实现落点」；
 *   · 边 = 产物枢纽（产出者 → 消费者，标签是产物名）；
 *   · 字段只取原文，**没有就留空**；文献只抽注释里真实出现的引用。
 *
 * 用法：
 *   node scripts/build-physics-map.mjs             # 写产物
 *   node scripts/build-physics-map.mjs --dry-run   # 只打印统计，不写
 *   node scripts/build-physics-map.mjs --stdout    # 把 JSON 打到 stdout（自检用）
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { REPO_ROOT, isUnitCode } from './lib/atlasDocs.mjs'
import { TRACKED_PARAMS, buildPhysicsMap } from './lib/physicsMapData.mjs'
import { parseInputStructs } from './lib/pyInputs.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT_FILE = path.join(HERE, '..', 'src', 'generated', 'physics-map.json')
const INPUTS_FILE = path.join(REPO_ROOT, 'src', 'py21cmfast', 'wrapper', 'inputs.py')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const DRY_RUN = flag('dry-run') || flag('stdout')
/** `--stdout` 时统计行走 stderr，保证 stdout 只有纯 JSON（自检要逐字比对） */
const say = flag('stdout') ? (...parts) => console.error(...parts) : (...parts) => console.log(...parts)

/**
 * 写前校验：只查**结构性**不变量（内容口径由 `check-physics-map.mjs` 深查）。
 * 这里守的是"产物形状坏了就绝不落盘"这条底线。
 */
function assertShape(map) {
  const problems = []
  if (!Array.isArray(map.stages) || !map.stages.length) problems.push('stages 为空')
  if (!Array.isArray(map.subprocesses) || !map.subprocesses.length) problems.push('subprocesses 为空')

  const stageIds = new Set(map.stages.map((stage) => stage.id))
  const subprocessIds = new Set(map.subprocesses.map((node) => node.id))

  for (const node of map.subprocesses) {
    if (!stageIds.has(node.stageId)) problems.push(`子过程 ${node.id} 的所属阶段 ${node.stageId} 不在骨干里`)
    if (isUnitCode(node.id)) problems.push(`计算单元 ${node.id} 不该作为节点出现（只作落点）`)
  }
  for (const stage of map.stages) {
    for (const id of stage.subprocessIds) if (!subprocessIds.has(id)) problems.push(`阶段 ${stage.id} 引用了不存在的子过程 ${id}`)
    if (stage.subprocessIds.length === 0) problems.push(`阶段 ${stage.id} 没有下钻内容`)
    for (const name of stage.params) if (!TRACKED_PARAMS.includes(name)) problems.push(`阶段 ${stage.id} 出现未跟踪参数 ${name}`)
  }
  for (const edge of map.edges) {
    if (!stageIds.has(edge.from) || !stageIds.has(edge.to)) problems.push(`边 ${edge.from}->${edge.to} 指向不存在的阶段`)
    if (!edge.via?.name) problems.push(`边 ${edge.from}->${edge.to} 没有产物名（标签口径要求写产物）`)
  }
  for (const node of [...map.stages, ...map.subprocesses]) {
    for (const place of node.units ?? []) {
      if (!place.file || !place.line) problems.push(`${node.id} 的落点缺 file/line`)
      if (place.endLine && place.endLine < place.line) problems.push(`${node.id} 的落点行区间倒置：${place.file}:${place.line}-${place.endLine}`)
    }
  }
  for (const paper of map.papers) {
    if (!paper.refs.length) problems.push(`文献 ${paper.key} 没有引用点`)
    for (const ref of paper.refs) if (!ref.file || !ref.line) problems.push(`文献 ${paper.key} 的引用点缺 file/line`)
  }
  return problems
}

async function main() {
  const inputsText = await fs.readFile(INPUTS_FILE, 'utf8')
  const params = parseInputStructs(inputsText)
  const missing = TRACKED_PARAMS.filter((name) => !params.has(name))
  if (missing.length) throw new Error(`inputs.py 里解析不到参数：${missing.join(', ')}`)

  const map = await buildPhysicsMap({ inputsText, params })
  const problems = assertShape(map)
  if (problems.length) {
    say('✗ 写前校验未通过：')
    for (const problem of problems.slice(0, 20)) say(`   · ${problem}`)
    process.exitCode = 1
    return
  }

  /** 戳记 = 内容哈希：文档与源码不变时产物逐字不变（幂等），变了就跟着变 */
  const stamp = `generated-${createHash('sha1').update(JSON.stringify({ ...map, stamp: '' })).digest('hex').slice(0, 12)}`
  map.stamp = stamp

  const parsed = {
    version: map.version,
    stamp: map.stamp,
    source: map.source,
    stats: map.stats,
    stages: map.stages,
    subprocesses: map.subprocesses,
    edges: map.edges,
    params: map.params,
    papers: map.papers,
    questions: map.questions,
  }

  say('物理图谱 · 生成')
  say(`  骨干 ${map.stats.stages} 个阶段 · 下钻 ${map.stats.subprocesses} 个子过程 · 落点 ${map.stats.units} 个`)
  say(`  参数 ${map.stats.params} 个（有默认值 ${map.params.filter((param) => param.default !== null).length} 个、有范围 ${map.params.filter((param) => param.range).length} 个）`)
  say(`  文献 ${map.stats.papers} 篇 · 引用点 ${map.stats.citationRefs} 处 · 产物边 ${map.edges.length} 条`)
  say(`  按函数体定位的单元 ${map.stats.located} 个，退化为整文件 ${map.stats.fileWide} 个，未定位 ${map.stats.missed} 个`)
  say(`  戳记 ${stamp}`)

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
