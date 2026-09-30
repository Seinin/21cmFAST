#!/usr/bin/env node
/**
 * 生成「物理链」——应用「物理视角」页的数据源。
 *
 * 与另两份数据的边界（本脚本只读它们、一行都不写）：
 *   · `data/graph.json`                  工程视角图谱（画布页）；
 *   · `docs/notes/physics-chain/chain.json`  **本脚本的真源**（从两份 PDF 逐字转录的物理链）。
 *
 * 口径（用户 2026-09-29 明确）：
 *   · **物理量按 P&L 2012 的写法显示**，不追代码变量名；代码名只作为附注字段；
 *   · 代码参数里"控制要考虑哪些效应"的开关，**只要挂一条来源论文链接**即可，论文本身以后再说；
 *   · 真源里没有的一律留空，**不编造**（来源论文只在代码注释里真实写着时才填）。
 *
 * 三份输入：真源（物理量/公式/依赖） + `wrapper/inputs.py`（参数默认值与校验） + atlas L3（代码落点）。
 *
 * 用法：
 *   node scripts/build-physics-chain.mjs             # 写产物
 *   node scripts/build-physics-chain.mjs --dry-run   # 只打印统计
 *   node scripts/build-physics-chain.mjs --stdout    # JSON 到 stdout（自检用）
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { REPO_ROOT, codeSpans, docTargetOf, isSubprocessCode, isUnitCode, loadAtlas, sourcePathOf } from './lib/atlasDocs.mjs'
import { findSymbolBodies, readSource } from './lib/paramScan.mjs'
import { parseInputStructs } from './lib/pyInputs.mjs'
// 分层口径（物理主链 / 旁路）只此一份：本脚本与自检共用，视图只读产物里的标记
import {
  BYPASS_STAGES,
  BYPASS_TOPIC_ID,
  IMPL_TOPIC_ID,
  STAGE_LAYERS,
  isBypassHint,
  stageLayerOf,
} from './lib/physicsStages.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT_FILE = path.join(HERE, '..', 'src', 'generated', 'physics-chain.json')
const CHAIN_SOURCE = path.join(REPO_ROOT, 'docs', 'notes', 'physics-chain', 'chain.json')
const INPUTS_FILE = path.join(REPO_ROOT, 'src', 'py21cmfast', 'wrapper', 'inputs.py')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
/** `--stdout` 时统计走 stderr，保证 stdout 只有纯 JSON（自检要逐字比对） */
const say = flag('stdout') ? (...parts) => console.error(...parts) : (...parts) => console.log(...parts)

/** 每个物理量最多列几个代码落点（真源里的 codeHints 是"去哪些阶段找"，不是精确函数） */
const MAX_SITES = 8

/**
 * 代码落点：按 atlas L3 的「承担者」取函数体行区间（与画布口径一致：C 按花括号、Python 按缩进）。
 * 返回 `stageCode → [{unit, symbol, file, line, endLine, fileWide}]`
 */
async function buildCodeSites(paramNames) {
  const { subprocesses, units } = await loadAtlas()
  const subprocessByAnchor = new Map(subprocesses.filter((entry) => isSubprocessCode(entry.code)).map((entry) => [entry.anchor, entry]))
  const sourceCache = new Map()
  const byStage = new Map()
  /** hint（阶段或子过程）→ 在这个单元里被读到的参数名 */
  const paramHints = new Map()
  const stats = { units: 0, located: 0, fileWide: 0, missed: [] }

  for (const unit of units.filter((entry) => isUnitCode(entry.code))) {
    const subprocess = subprocessByAnchor.get(docTargetOf(unit.fields['所属子过程'])?.anchor ?? '')
    if (!subprocess) continue
    const stageCode = subprocess.code.split('.')[0]
    const file = sourcePathOf(unit.fields['承担者'])
    if (!file) continue
    stats.units += 1

    const absolute = path.join(REPO_ROOT, file)
    const language = file.endsWith('.py') ? 'python' : 'c'
    if (!sourceCache.has(absolute)) sourceCache.set(absolute, readSource(absolute, language).catch(() => null))
    const source = await sourceCache.get(absolute)
    if (!source) {
      stats.missed.push(`${unit.code}（读不到 ${file}）`)
      continue
    }

    const carrier = unit.fields['承担者']?.raw ?? ''
    const symbols = codeSpans(carrier).filter((item) => !/\.(c|h|py)$/.test(item))
    const bodies = symbols.flatMap((symbol) => findSymbolBodies(source.maskedLines.join('\n'), symbol, language))
    const fileWide = bodies.length === 0 || /各函数|等函数|函数组/.test(carrier)
    const sites = fileWide
      ? [{ symbol: symbols.join('、'), line: 1, endLine: source.lines.length, fileWide: true }]
      : bodies.map((body) => ({ symbol: symbols.join('、'), line: body.startLine, endLine: body.endLine, fileWide: false }))
    if (fileWide) stats.fileWide += 1
    else stats.located += 1

    const entries = sites.map((site) => ({ ...site, unit: unit.code, unitName: unit.name, file }))
    // 落点同时挂两个键：阶段（`S12`）与子过程（`S12.1`）。真源的 `codeHints` 写哪个粒度都能对上，
    // 子过程级更精确——「看实现」落在对的那几个函数上，而不是该阶段的前 8 个。
    for (const key of new Set([stageCode, subprocess.code])) {
      byStage.set(key, [...(byStage.get(key) ?? []), ...entries])
    }

    /*
      参数归属（后端查表：参数 × 节点）：在这个单元的**函数体**里找参数读取，认 `->NAME` / `.NAME`
      这两种写法——代码里就是 `astro_params_global->F_STAR10`、`self.F_STAR10`。
      整文件落点（fileWide）不参与：范围太宽，会把不相关的参数一起算进来。
      这只是"出现在这个函数体里"，不等于"这个参数改变了这一步"——够用且可核对，不做更玄的推断。
    */
    if (!fileWide && paramNames.length) {
      for (const site of sites) {
        const body = source.lines.slice(site.line - 1, site.endLine ?? site.line).join('\n')
        for (const name of paramNames) {
          if (!body.includes(`->${name}`) && !body.includes(`.${name}`)) continue
          for (const key of new Set([stageCode, subprocess.code])) {
            if (!paramHints.has(key)) paramHints.set(key, new Set())
            paramHints.get(key).add(name)
          }
        }
      }
    }
  }
  return { byStage, paramHints, stats }
}

/** 写前校验：只查结构性不变量（内容口径交给自检脚本深查） */
function assertShape(artifact) {
  const problems = []
  const ids = new Set([...artifact.drivers.map((item) => item.id), ...artifact.nodes.map((item) => item.id)])
  for (const node of artifact.nodes) {
    if (!node.symbol || !node.name) problems.push(`节点 ${node.id} 缺符号或名字`)
    if (!node.eq) problems.push(`节点 ${node.id} 缺方程编号（图上用它当边的标签）`)
    if (!node.nature?.type) problems.push(`节点 ${node.id} 缺数学性质`)
    // 分层纪律（README 第一节）：表面只放物理，工程实现进子图；子图节点必须写明挂在哪条公式/过程下面
    if (node.layer !== undefined && !['surface', 'subgraph'].includes(node.layer)) {
      problems.push(`节点 ${node.id} 的 layer 取值非法：${node.layer}`)
    }
    if (node.layer === 'subgraph' && !node.parent) {
      problems.push(`子图节点 ${node.id} 没写父节点（它挂在哪个物理量/过程的下面）`)
    }
    // 种类（颜色按它分）：物理量 / 谱 / 函数 / 过程 / 工程项。
    // 注意：种类与"层级"（layer：表面/子图）是两件事——子图里可以是更细的物理，也可以是工程项。
    if (!['quantity', 'spectrum', 'function', 'process', 'engineering'].includes(node.kind)) {
      problems.push(`节点 ${node.id} 的 kind 不在册：${node.kind}（应为 quantity / spectrum / function / process / engineering）`)
    }
  }
  for (const edge of artifact.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) problems.push(`边 ${edge.from}->${edge.to} 指向不存在的东西`)
    if (!edge.eq) problems.push(`边 ${edge.from}->${edge.to} 缺 Eq 出处`)
  }
  /**
   * 骨干树 + 跨层分类的结构不变量（深查在 `check-physics-chain.mjs`，这里只拦"漏标/写反"）：
   *   · 每条边都要有层差，且层差 ≥1（箭头永远自上而下，不存在回指）；
   *   · 骨干边的层差必须 = 1 —— 这就是"骨干是一棵真正的多叉树、结构上不跨层"的可证伪断言；
   *   · 非骨干边必须有成因；层差 1 只能标 `sibling`，层差 >1 不能标 `sibling`。
   */
  const SPAN_KINDS = ['sibling', 'coarse', 'bypass', 'gap']
  for (const edge of artifact.graph?.edges ?? []) {
    if (!Number.isInteger(edge.levelSpan) || edge.levelSpan < 1) {
      problems.push(`边 ${edge.id} 的层差异常：${edge.levelSpan}`)
      continue
    }
    if (edge.backbone) {
      if (edge.levelSpan !== 1) problems.push(`骨干边 ${edge.id} 跨了 ${edge.levelSpan} 层（骨干必须层差 1）`)
      continue
    }
    if (!SPAN_KINDS.includes(edge.spanKind)) problems.push(`交叉边 ${edge.id} 缺成因分类：${edge.spanKind}`)
    if (edge.levelSpan === 1 && edge.spanKind !== 'sibling') problems.push(`层差 1 的交叉边 ${edge.id} 应标 sibling，实为 ${edge.spanKind}`)
    if (edge.levelSpan > 1 && edge.spanKind === 'sibling') problems.push(`跨 ${edge.levelSpan} 层的边 ${edge.id} 不能标 sibling`)
  }
  const crossLevel = artifact.graph?.crossLevel
  if (!crossLevel) problems.push('缺 crossLevel 段（骨干树 + 跨层成因的分类）')
  else {
    const listed = [...crossLevel.backbone, ...crossLevel.sibling, ...crossLevel.coarse, ...crossLevel.bypass, ...crossLevel.gap]
    const allEdges = (artifact.graph?.edges ?? []).map((edge) => edge.id)
    const missing = allEdges.filter((id) => !listed.includes(id))
    if (missing.length) problems.push(`这些边没进 crossLevel 任何名单：${missing.slice(0, 5).join(',')}`)
  }
  /**
   * 分层纪律（一级只讲物理）：过程框必须带合法的分层标记，且**旁路框必须挂旁路话题**——
   * 否则视图把话题关掉之后它仍留在一级（"收起"就成了摆设）。判据来自 `lib/physicsStages.mjs`。
   */
  for (const node of artifact.graph?.nodes ?? []) {
    if (node.type === 'group') {
      if (!STAGE_LAYERS.includes(node.chain)) {
        problems.push(`过程框 ${node.id} 的分层标记非法：${node.chain}（应为 main / bypass；新阶段没登记会在这里被拦住）`)
      }
      if (node.chain === 'bypass' && !(node.topics ?? []).includes(BYPASS_TOPIC_ID)) {
        problems.push(`旁路框 ${node.id} 没挂 ${BYPASS_TOPIC_ID} 话题（关掉话题也收不起来）`)
      }
    }
    const isEngineering = node.type === 'engineering'
    if (isEngineering !== (node.topics ?? []).includes(IMPL_TOPIC_ID)) {
      problems.push(
        isEngineering
          ? `工程项 ${node.id} 没挂 ${IMPL_TOPIC_ID} 话题（默认收不起来）`
          : `非工程项 ${node.id} 挂了 ${IMPL_TOPIC_ID} 话题（话题含义被稀释）`,
      )
    }
  }
  for (const group of Object.keys(artifact.params ?? {})) {
    for (const param of artifact.params[group] ?? []) {
      if (!param.name) problems.push(`${group} 里有条目缺 name`)
      if (param.switch !== undefined && typeof param.switch !== 'boolean') problems.push(`${param.name} 的 switch 不是布尔`)
    }
  }
  return problems
}

async function main() {
  const chain = JSON.parse(await fs.readFile(CHAIN_SOURCE, 'utf8'))
  /**
   * 阶段名（物理过程名）：从 atlas L1 的标题里取（`### S12 天体物理源`），**不自己编**。
   * 一级图把每个过程画成一个大框时，框上的名字就是从这里来的。
   */
  const stageNames = new Map(
    [...(await fs.readFile(`${REPO_ROOT}/docs/notes/atlas/L1-stages.md`, 'utf8')).matchAll(/^#{2,3}\s+(S\d+)\s+(.+)$/gm)].map(
      (match) => [match[1], match[2].trim()],
    ),
  )
  const inputsText = await fs.readFile(INPUTS_FILE, 'utf8')
  const inputs = parseInputStructs(inputsText)
  /** 真源里声明的全部参数名（组名由数据声明） */
  const declaredParams = Object.keys(chain.params ?? {})
    .filter((key) => Array.isArray(chain.params[key]))
    .flatMap((key) => chain.params[key].map((param) => param.name))
  const { byStage, paramHints, stats: siteStats } = await buildCodeSites(declaredParams)
  /*
    参数 × 节点 矩阵（**后端查表**，供视图做「选中参数 → 高亮相关模块」）：
    归属 = 这个参数被读到时所在的单元（`paramHints`）+ 开关自己声明的 `gatesEdges`。
    没有归属的参数不进表（自检会把它们列出来，不静默）。
  */
  const paramMatrix = {}
  for (const group of Object.keys(chain.params ?? {})) {
    if (!Array.isArray(chain.params[group])) continue
    for (const param of chain.params[group]) {
      const nodes = [...chain.drivers, ...chain.nodes]
        .filter((item) => (item.codeHints ?? []).some((hint) => paramHints.get(hint)?.has(param.name)))
        .map((item) => item.id)
      const edges = param.gatesEdges ?? []
      if (nodes.length || edges.length) paramMatrix[param.name] = { nodes, edges }
    }
  }

  /** 参数：以真源为准，但**默认值/范围若源码有写就以源码校对**；不一致直接报错（防手工抄错） */
  const problems = []
  const groups = {}
  /*
    参数分组由真源声明（`params.order`），生成器**不写死组名**——
    写死会让新加的组被静默丢掉：既不进产物，也没人报错（天体物理那 58 个、宇宙学常量就是这么被丢的）。
    没声明时退回历史三组，行为与以前完全一致（`check:chain` 的幂等断言守住这一点）。
  */
  for (const group of chain.params?.order ?? ['drivers', 'numeric', 'effects']) {
    groups[group] = (chain.params?.[group] ?? []).map((param) => {
      const mine = inputs.get(param.name)
      if (!mine) return { ...param, inCode: false }
      if (param.default !== null && param.default !== undefined && JSON.stringify(param.default) !== JSON.stringify(mine.default)) {
        problems.push(`${param.name} 的默认值与源码不一致：真源 ${JSON.stringify(param.default)} vs 源码 ${JSON.stringify(mine.default)}`)
      }
      return {
        ...param,
        inCode: true,
        group: mine.group,
        default: mine.default,
        log10: mine.log10,
        range: mine.range,
        choices: mine.choices,
      }
    })
  }
  if (problems.length) {
    say('✗ 真源与源码对不上：')
    for (const problem of problems) say(`   · ${problem}`)
    process.exitCode = 1
    return
  }

  const withSites = (hints = []) => {
    const sites = hints.flatMap((stage) => byStage.get(stage) ?? [])
    return { count: sites.length, sites: sites.slice(0, MAX_SITES) }
  }

  const artifact = {
    version: 1,
    source: {
      derivation: chain.sources?.primary?.file ?? '',
      review: chain.sources?.review?.file ?? '',
      chainSource: path.relative(REPO_ROOT, CHAIN_SOURCE),
      note: chain.note ?? '',
    },
    // 驱动量在真源里是顶层数组、不带 `kind`；产物里补上（视图按种类取色，缺了会炸）
    drivers: chain.drivers.map((driver) => ({ ...driver, kind: driver.kind ?? 'driver', code: withSites([]) })),
    nodes: chain.nodes.map((node) => ({ ...node, code: withSites(node.codeHints) })),
    edges: chain.edges,
    degeneracies: chain.degeneracies,
    /**
     * **过程层索引**：把每个物理量归到它属于的那个**物理过程**（阶段）。
     * 归并规则不新造：直接取节点已有的 `codeHints`，把子过程号去掉——`S12.1` → `S12`。
     * 一级图要画成"9 个物理过程"时用它分组；驱动量没有 codeHints（它们是输入，不属于任何过程），
     * 显式归到 `unassigned`，不假装它们属于某个过程。
     */
    stageIndex: (() => {
      const groups = {}
      for (const node of [...chain.drivers, ...chain.nodes]) {
        const hint = (node.codeHints ?? [])[0]
        const stage = hint ? String(hint).split('.')[0] : 'unassigned'
        groups[stage] = [...(groups[stage] ?? []), node.id]
      }
      return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    })(),
    /**
     * 与画布同形状的图（`{meta, nodes, edges}`）：物理链页直接复用画布那套渲染与交互，
     * 只是节点用物理语言（符号 + 中文名）、连线用公式语言（Eq 号），代码落点放 `refs`（默认收起）。
     * 形状按 `data/graph.json` 对齐：节点的 `type` 决定颜色与中文名，连线的 `conditional` 表示带开关。
     */
    graph: (() => {
      const nodes = [
        ...chain.drivers.map((item) => ({ ...item, kind: item.kind ?? 'driver' })),
        ...chain.nodes,
      ]
      /**
       * 参数词条：把 `paramMatrix`（参数 → 它作用的物理量/边，代码扫出来的）搬到节点的 `tags` 上，
       * 于是"按天体物理参数名检索 / 选中参数高亮相关模块"直接用画布既有的标签机制，不用另造一套。
       * `tagDetails` 的 `kind` 用真源里的角色判：驱动量 / 开关 / 数值 / 参数。
       */
      const allParams = [...chain.params.drivers, ...chain.params.astro, ...chain.params.numeric, ...chain.params.effects]
      const paramMeta = new Map(allParams.map((item) => [item.name, item]))
      const driverNames = new Set(chain.params.drivers.map((item) => item.name))
      const tagsOf = (node) => {
        /**
         * 两类来源：① `paramMatrix`（参数 → 它作用的物理量，代码扫出来的）；
         * ② 节点自带的 `codeNames`（驱动量节点本来就写着它对应哪些代码参数，如 `f* → ALPHA_STAR / F_STAR10`）。
         * 后者很关键：没有它，按 `F_STAR10` 检索能点亮它作用的模块，却找不到"这个量本身"那个节点。
         */
        const fromMatrix = Object.entries(paramMatrix)
          .filter(([, value]) => (value.nodes ?? []).includes(node.id))
          .map(([name]) => name)
        const names = [...new Set([...fromMatrix, ...(node.codeNames ?? [])])].sort()
        return {
          tags: names.map((name) => `tag:${name}`),
          tagDetails: Object.fromEntries(
            names.map((name) => {
              const meta = paramMeta.get(name)
              const kind = meta?.switch ? '开关' : driverNames.has(name) ? '驱动量' : String(meta?.role ?? '').startsWith('数值') ? '数值' : '参数'
              return [
                `tag:${name}`,
                // 形状必须与画布一致：`node.tagDetails[tagId]` 是**条目数组**（TagDetailMap）
                [{ label: name, kind, note: meta?.role ?? '', ref: { docId: '', anchor: '', label: '', file: '', line: null, endLine: null } }],
              ]
            }),
          ),
        }
      }
      const surfaceIds = new Set(nodes.filter((item) => item.layer !== 'subgraph').map((item) => item.id))
      /**
       * 这个量在仓库里到底有没有代码落点？判据是 `codeHints` 能查到带行号的落点，
       * **不是**看它有没有 `refs`（真源里根本没有 refs，那是下面才生成的）。
       */
      const hasCodeSite = (item) =>
        (item.codeHints ?? []).some((hint) => (byStage.get(hint) ?? []).some((site) => Number.isFinite(site.line)))
      const gNodes = nodes.map((item) => ({
        id: item.id,
        label: `${item.symbol} · ${item.name}`,
        type: item.kind,
        summary: item.formula ? String(item.formula) : (item.nature?.type ?? item.name),
        layer: item.layer ?? 'surface',
        parent: item.parent ?? null,
        observable: Boolean(item.observable),
        /**
         * 话题列表恒为数组（画布的形状要求）。两类话题，页面默认**全部关掉**，一级于是只剩物理主链：
         *   · 工程项 → 「实现细节」（`topic:impl`）；
         *   · 旁路阶段的量 → 「旁路与后处理接口」（`topic:bypass`）。
         * 用的是画布既有的过滤机制，不另造一套隐藏逻辑；判据在 `lib/physicsStages.mjs`。
         */
        topics: [
          ...(item.kind === 'engineering' ? [IMPL_TOPIC_ID] : []),
          ...(isBypassHint(item.codeHints) ? [BYPASS_TOPIC_ID] : []),
        ],
        /**
         * 「没有代码落点」不等于「缺落点」：驱动量（用户设定）与外部量（如 CMB 温度常数）
         * **本来就不来自某段代码**。给它们挂身份标签，点击即读到这句话，免得被误当缺口。
         * 判据：该节点确实没有任何代码落点（`refs` 里没有 file）——不是按名字猜。
         */
        tags: [
          ...tagsOf(item).tags,
          // 按**性质**摆：落在旁路阶段（S04 旁路与后处理接口）里的量是诊断出口，不在主链上 —— 挂身份标签说明
          ...(isBypassHint(item.codeHints) ? ['tag:旁路出口'] : []),
          ...(hasCodeSite(item) ? [] : [item.kind === 'driver' ? 'tag:输入参数' : 'tag:外部量']),
        ],
        tagDetails: {
          ...tagsOf(item).tagDetails,
          ...(isBypassHint(item.codeHints)
            ? {
                'tag:旁路出口': [
                  {
                    label: item.symbol,
                    kind: '旁路',
                    note: '**旁路**：算完顺手给出的诊断（光度函数、光深等），**不在主链上**——看不看它，后面的结果都一样。子图里是它那几段工程实现。',
                    ref: null,
                  },
                ],
              }
            : {}),
          ...(hasCodeSite(item)
            ? {}
            : item.kind === 'driver'
              ? {
                  'tag:输入参数': [
                    {
                      label: item.symbol,
                      kind: '输入',
                      note: item.note ?? '由用户设定的输入量：不在某段代码里，因此没有代码落点。',
                      ref: null,
                    },
                  ],
                }
              : {
                  'tag:外部量': [
                    { label: item.symbol, kind: '外部', note: item.note ?? '外部给定的量：不来自本仓库的代码。', ref: null },
                  ],
                }),
        },
        refs: [
          /**
           * 论文侧出口：真源里每个量都带 `reviewSection`（论文节号），此前没进图，
           * 于是检查器的「看引用」永远只能开源码、看不了文献。这里把它作为**文档引用**挂上，
           * 指向本链自己的论文清单（`docs/notes/physics-chain/papers.md`，自检查它存在）。
           */
          ...(item.reviewSection
            ? [
                {
                  docId: 'physics-chain/papers.md',
                  anchor: '',
                  label: `论文出处：${item.reviewSection}`,
                  file: '',
                  line: null,
                  endLine: null,
                },
              ]
            : []),
          ...(item.codeHints ?? []).flatMap((hint) =>
            (byStage.get(hint) ?? [])
              .filter((site) => Number.isFinite(site.line))
              .slice(0, 6)
              .map((site) => ({
                docId: '',
                anchor: '',
                label: item.symbol,
                file: site.file,
                line: site.line,
                endLine: site.endLine ?? null,
              })),
          ),
        ],
      }))
      const gEdges = chain.edges.map((edge) => {
        const key = `${edge.from}->${edge.to}`
        const gates = [...chain.params.effects].filter((param) => (param.gatesEdges ?? []).includes(key))
        return {
          id: key,
          source: edge.from,
          target: edge.to,
          label: edge.eq ?? '',
          type: 'depends_on',
          directed: true,
          conditional: gates.length > 0,
          note: [edge.note ?? '', gates.length ? `开关：${gates.map((p) => p.name).join('、')}` : '']
            .filter(Boolean)
            .join('；'),
          sourcePort: null,
          targetPort: null,
          /** 两端都在表面的才画在表面；连到子图的归子图内部 */
          surface: surfaceIds.has(edge.from) && surfaceIds.has(edge.to),
        }
      })
      /**
       * `meta` 必须写全 `GraphMeta` 的字段（缺了画布会在 `cloneGraph` 里炸）：
       * `version / name / description / topics / tags / updatedAt`。
       * `tags` 是**标签注册表**——节点的 `tags` 引用其中的 id，缺了注册表就等于引用了不存在的东西。
       * `updatedAt` 刻意留空：写时间戳会让每次生成的产物都不同，破坏幂等自检。
       */
      const tagRegistry = [
        // 后两个是「身份标签」：给没有代码落点的量说明它们本来就不来自代码
        ...new Set([...Object.keys(paramMatrix), ...nodes.flatMap((item) => item.codeNames ?? []), '输入参数', '外部量', '旁路出口']),
      ]
        .sort()
        .map((name) => ({ id: `tag:${name}`, name, description: paramMeta.get(name)?.role ?? '' }))
      /**
       * 坐标：按"从驱动量出发要走多少步"分层，**观测量在上、参数在下**（与页面的自顶向下口径一致）。
       * 目的有二：① 一打开就看得见东西（不依赖画布是否自动排布）；② 排布是确定性的，幂等自检不受影响。
       */
      /**
       * 坐标：**自顶向下的多叉树布局**——从"链条终点的产物"（没有下游的节点）开始，
       * 往下逐层展开"它由什么决定"。层号 = 到终点的步数（终点 0，越往下越大）；
       * 同层内按**父节点的位置取重心**排序，免得同一支的几块被拆散。
       * 这是 v1：交叉不做全局最优，但不重叠、方向正确、且完全确定（幂等自检不受影响）。
       */
      const level = new Map(gNodes.map((node) => [node.id, 0]))
      for (let pass = 0; pass < gNodes.length; pass += 1) {
        let moved = false
        for (const edge of gEdges) {
          const next = (level.get(edge.target) ?? 0) + 1
          if (next > (level.get(edge.source) ?? 0)) {
            level.set(edge.source, next)
            moved = true
          }
        }
        if (!moved) break
      }
      /**
       * **骨干树 + 交叉边**（回答"为什么会出现跨层"）。
       *
       * 分层是按**最长路径**算的：`level(s) = 1 + max{level(t) : s→t}`，于是每条边 `s→t` 的层差恒 ≥1，
       * 且**层差 = 1 当且仅当这条边落在某条最长路径上**。所以"跨层箭头"不是数据错：
       * 依赖本身是 **DAG**（一个量常常有好几个上游），把它硬画成树，就只有落在最长路径上的那条能层差 1，
       * 其余的必然跨层。
       *
       * 解法不是删边（每条边都是真实公式依赖，删掉就是篡改物理），而是**把树和交叉边分开画**：
       *   · **骨干边**：每个量挑**一个**主父（出边里 `level(target)` 最大的那条，即最长路径父，层差恒 = 1）
       *     —— 骨干上每个节点恰好一个父，骨干就是一棵**真正的多叉树**，结构上不可能跨层；
       *   · **交叉边**：其余依赖照留，但按**成因**标出来（判据全取自数据，不新造）：
       *       - `sibling`：层差 1 的第二个父（多父的直接后果，画在骨干旁边）；
       *       - `coarse`：层差 >1 且**存在间接路径**——这条直连依赖同时被更细的链条蕴含（粗粒度/"汇总"边）；
       *       - `bypass`：层差 >1、无间接路径，但目标是 **S04 旁路出口**（诊断量，如 τ_e、φ(M_1500)）
       *         —— 诊断量本来就是输出时直接由上游算出来的，**不在主链上**，跨层是它应有的样子；
       *       - `gap`：层差 >1、无间接路径、也不是旁路 ⇒ **链条上确实缺了中间量**，显式登记（不许静默）。
       * 判据"是不是旁路出口"与节点上 `tag:旁路出口` 同源（`codeHints[0]` 以 `S04` 开头）。
       */
      const rawById = new Map(nodes.map((item) => [item.id, item]))
      const outAdj = new Map(gNodes.map((node) => [node.id, []]))
      for (const edge of gEdges) outAdj.get(edge.source)?.push(edge.target)
      /** 从 `from` 出发能不能走到 `to`（深度优先，节点数十来个，不需要更聪明的做法） */
      const reaches = (from, to) => {
        const seen = new Set([from])
        const queue = [from]
        while (queue.length) {
          const current = queue.shift()
          for (const next of outAdj.get(current) ?? []) {
            if (next === to) return true
            if (seen.has(next)) continue
            seen.add(next)
            queue.push(next)
          }
        }
        return false
      }
      /** 有没有"绕一圈也能到"的更细链条：source 还有别的出边，那些出边能走到 target */
      const hasIndirectPath = (edge) =>
        (outAdj.get(edge.source) ?? []).some((other) => other !== edge.target && reaches(other, edge.target))
      /** 目标是不是旁路/诊断出口（S04 旁路与后处理接口）—— 与节点身份标签同源判据 */
      const isBypassTarget = (edge) => isBypassHint(rawById.get(edge.target)?.codeHints)
      /** 主父：出边里 level 最大的那条（层差恒 = 1）；并列时按 target 名字稳定取一个 */
      const backboneOf = new Map()
      for (const node of gNodes) {
        const outs = gEdges.filter((edge) => edge.source === node.id)
        if (!outs.length) continue
        const best = [...outs].sort((a, b) => (level.get(b.target) ?? 0) - (level.get(a.target) ?? 0) || (a.target < b.target ? -1 : 1))[0]
        best.backbone = true
        best.levelSpan = 1
        backboneOf.set(node.id, best.target)
      }
      const crossLevel = { levels: {}, backbone: [], sibling: [], coarse: [], bypass: [], gap: [], stats: {} }
      for (const node of gNodes) crossLevel.levels[node.id] = level.get(node.id) ?? 0
      /** 主父表（量 → 它在骨干树上的父）：自检用它验证"每个量恰好一个父" */
      crossLevel.parentOf = Object.fromEntries([...backboneOf.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
      for (const edge of gEdges) {
        const span = (level.get(edge.source) ?? 0) - (level.get(edge.target) ?? 0)
        edge.levelSpan = edge.levelSpan ?? span
        if (edge.backbone) {
          crossLevel.backbone.push(edge.id)
          continue
        }
        edge.crossLink = true
        if (span === 1) {
          edge.spanKind = 'sibling'
          crossLevel.sibling.push(edge.id)
        } else if (hasIndirectPath(edge)) {
          edge.spanKind = 'coarse'
          crossLevel.coarse.push(edge.id)
        } else if (isBypassTarget(edge)) {
          edge.spanKind = 'bypass'
          crossLevel.bypass.push(edge.id)
        } else {
          edge.spanKind = 'gap'
          crossLevel.gap.push(edge.id)
        }
        /**
         * 跨层这件事要**在图上一眼读得出来**：层差与成因写进边的说明（检查器直接显示这段）。
         * 成因不写成"推测"——`coarse` / `bypass` 都是上面按数据判的。
         */
        const CAUSE = {
          sibling: '同层的第二个上游（多父，不是跨层）',
          coarse: '跨层：这条直连依赖已被更细的链条蕴含（汇总边），不是缺环节',
          bypass: '跨层：目标是旁路/诊断出口（S04），诊断量本来就不在主链上',
          gap: '跨层且无间接路径：链条上缺中间量（待补，见 crossLevel.gap）',
        }
        edge.note = [
          edge.note,
          `第 ${level.get(edge.source) ?? 0} 层 → 第 ${level.get(edge.target) ?? 0} 层（跨 ${span} 层）｜${CAUSE[edge.spanKind]}`,
        ]
          .filter(Boolean)
          .join('；')
      }
      crossLevel.stats = {
        edges: gEdges.length,
        backbone: crossLevel.backbone.length,
        sibling: crossLevel.sibling.length,
        coarse: crossLevel.coarse.length,
        bypass: crossLevel.bypass.length,
        gap: crossLevel.gap.length,
      }
      /** 每条非骨干边都必须有成因（漏标就是静默），写前校验与自检都会再查一遍 */
      for (const edge of gEdges) {
        if (!edge.backbone && !edge.spanKind) throw new Error(`边 ${edge.id} 既不是骨干边，也没有成因分类`)
      }
      /**
       * 自顶向下的多叉树，**在"过程框"这一级排**：
       *   ① 先算框的层号（一个框的消费者在上、它的上游在下）；同层框按 id 稳定排序、横向铺开；
       *   ② 每个框里再摆它自己的量（按全局层号排成几行），于是框是整齐的一格一格，不会互相压。
       * 不在任何框里的量（输入/分析那一批）单独摆到最下面一行——**它们不该占顶层**。
       */
      // 布局要先知道"哪些量属于哪个过程"，而装框那一步在这个块后面——这里自己按同一判据算一份
      const stageMembers = new Map()
      for (const node of nodes) {
        const hint = (node.codeHints ?? [])[0]
        const stage = hint ? String(hint).split('.')[0] : null
        if (!stage) continue
        stageMembers.set(stage, [...(stageMembers.get(stage) ?? []), node.id])
      }
      const boxIds = [...stageMembers.keys()].sort().map((stage) => `stage:${stage}`)
      /**
       * **旁路那一支不进主树**：它不参与主链（链上这些量挂着"旁路出口"标签），
       * 混在树里会拉出"第 1 层 → 第 5 层"这种穿整张图的长箭头。
       * 判据来自 `lib/physicsStages.mjs`（与链上"旁路出口"的标签同源，只此一份）。
       */
      const bypassStageSet = new Set(BYPASS_STAGES)
      const boxOut = new Map(boxIds.map((id) => [id, []]))
      const stageOfNodeLocal = new Map()
      for (const [stage, ids] of stageMembers) for (const id of ids) stageOfNodeLocal.set(id, stage)
      for (const edge of gEdges) {
        const from = stageOfNodeLocal.get(edge.source)
        const to = stageOfNodeLocal.get(edge.target)
        if (!from || !to || from === to) continue
        if (bypassStageSet.has(from) || bypassStageSet.has(to)) continue
        boxOut.get(`stage:${from}`).push(`stage:${to}`)
      }
      const boxLevel = new Map(boxIds.map((id) => [id, 0]))
      for (let pass = 0; pass < boxIds.length; pass += 1) {
        let moved = false
        for (const [from, targets] of boxOut) {
          for (const to of targets) {
            const next = (boxLevel.get(to) ?? 0) + 1
            if (next > (boxLevel.get(from) ?? 0)) {
              boxLevel.set(from, next)
              moved = true
            }
          }
        }
        if (!moved) break
      }
      /**
       * 间距按**图一的比例**校准（量过：图一连线长度中位数 330、整体 3400 宽 × 930 高，又宽又扁）。
       * 这里把层距压小、横向拉开，让形状接近图一，取景后才不会整块缩得很小。
       */
      const BOX_W = 820
      const BOX_H = 300
      const boxRows = new Map()
      for (const id of boxIds) {
        const lvl = boxLevel.get(id) ?? 0
        boxRows.set(lvl, [...(boxRows.get(lvl) ?? []), id])
      }
      const boxCenter = new Map()
      for (const lvl of [...boxRows.keys()].sort((a, b) => a - b)) {
        const ids = boxRows.get(lvl)
        ids.forEach((id, index) => {
          // 层往**右**走、同层往**下**排 —— 形状跟图一一致（又宽又扁），取景后才不会整块缩得很小
          boxCenter.set(id, {
            // **自顶向下**：层往下走（y），同层往右排（x）；步长保持紧凑，不靠转横来省地方
            x: index * (BOX_W + 120) - ((ids.length - 1) * (BOX_W + 120)) / 2,
            y: lvl * (BOX_H + 20),
          })
        })
      }
      /**
       * 旁路：单开一条道放在**右侧**（不占树的层），箭头就近指向它上游那几个框，不再穿整张图。
       *
       * ⚠ 这条道与"框外的输入/分析那行"**必须各占一条水平带**：两者原来都用 `(最大层号+1) * 层距`，
       * 于是叠在同一条带里（实测 y=1600：`phi_uv`、`tau_e` 与 `fstar`、`zeta`、`tvir_min` 混在一起，
       * 自检的"框外量不与框内量同一条水平带"因此失败）。层号往下排：旁路占 `+1`，输入占 `+2`。
       */
      const bandStep = BOX_H + 20
      const bypassIds = boxIds.filter((id) => bypassStageSet.has(id.replace('stage:', '')))
      const laneY = (Math.max(0, ...boxRows.keys()) + 1) * bandStep
      bypassIds.forEach((id) => boxCenter.set(id, { x: 0, y: laneY }))

      const membersOfBox = new Map(boxIds.map((id) => [id, []]))
      for (const [stage, ids] of stageMembers) {
        for (const id of ids) membersOfBox.get(`stage:${stage}`).push(id)
      }
      for (const [boxId, ids] of membersOfBox) {
        const center = boxCenter.get(boxId)
        const ordered = [...ids].sort((a, b) => (level.get(a) ?? 0) - (level.get(b) ?? 0) || (a < b ? -1 : 1))
        ordered.forEach((id, index) => {
          const node = gNodes.find((item) => item.id === id)
          if (node && center) {
            // 框里面：沿竖排三格，放不下就往右接一列
            /**
             * **同一深度等高**：一个框里的量全部排在同一行（y 相同），不再上下错开——
             * 于是每一层就是一条水平带，层与层的关系一眼看得出来。
             */
            node.position = { x: center.x + (index - (ordered.length - 1) / 2) * 300, y: center.y }
          }
        })
      }
      const insideIds = new Set([...membersOfBox.values()].flat())
      const outsideNodes = gNodes.filter((node) => !insideIds.has(node.id))
      // 不在框里的量（输入/分析）：单独一条带放在**旁路道之下**（不占树的层，也不与旁路混带）
      const bottomY = (Math.max(0, ...boxLevel.values()) + 2) * bandStep
      outsideNodes.forEach((node, index) => {
        node.position = { x: index * 280 - ((outsideNodes.length - 1) * 280) / 2, y: bottomY }
      })

      /**
       * **过程层**：把每个物理过程画成一个大框（`type: 'group'` 的 compound 父节点），
       * 量按 `codeHints`（`S12.1` → `S12`）装进各自的框 —— 这就是"一级只有 9 个过程"的实现，
       * 用的全是画布现成能力（大框、父节点、子图），不另造一层。
       * 框的位置取成员包围盒的中心；尺寸交给画布按子节点算（不写死宽高）。
       */
      const memberIdsOfStage = new Map()
      // 注意：`codeHints` 在**归并前**的源节点上，`gNodes` 里没有这个字段（这里踩过一次坑）
      for (const node of nodes) {
        const hint = (node.codeHints ?? [])[0]
        const stage = hint ? String(hint).split('.')[0] : null
        if (!stage) continue
        memberIdsOfStage.set(stage, [...(memberIdsOfStage.get(stage) ?? []), node.id])
      }
      const stageGroupNodes = []
      for (const [stage, ids] of [...memberIdsOfStage.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const members = gNodes.filter((node) => ids.includes(node.id))
        if (!members.length) continue
        const groupId = `stage:${stage}`
        for (const member of members) member.parent = groupId
        const xs = members.map((member) => member.position?.x ?? 0)
        const ys = members.map((member) => member.position?.y ?? 0)
        stageGroupNodes.push({
          id: groupId,
          // 层号写进框名：多叉树的"第几层"直接读得出来（不靠箭头轻重去猜）；旁路那支不在树里，标"旁路"
          label: stageLayerOf(stage) === 'bypass'
            ? `旁路 · ${stage} · ${stageNames.get(stage) ?? stage}`
            : `第 ${(boxLevel.get(`stage:${stage}`) ?? 0) + 1} 层 · ${stage} · ${stageNames.get(stage) ?? stage}`,
          type: 'group',
          summary: `物理过程 ${stage}：${stageNames.get(stage) ?? ''}（下辖 ${members.length} 个量）`,
          layer: 'process',
          /**
           * 分层标记：`main` = 物理主链，`bypass` = 旁路与后处理接口。
           * 视图按它决定一级画哪些框，**不写死阶段号**；判据来自 `lib/physicsStages.mjs`。
           */
          chain: stageLayerOf(stage),
          parent: null,
          observable: false,
          conditional: false,
          // 旁路框挂话题：页面默认把话题全关掉，它于是不进一级，由折叠条一键展开
          topics: stageLayerOf(stage) === 'bypass' ? [BYPASS_TOPIC_ID] : [],
          tags: [],
          tagDetails: {},
          refs: [],
          position: {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2 - 70,
          },
        })
      }

      /**
       * **子图层**：模块内部的**步骤**。来源是 atlas 更深一级的单元——
       * 比如 `scaling_relations` 的 hint 是 `S12.1`，那么 `S12.1.1`、`S12.1.2` 这些单元就是它里面的步骤。
       * 步骤节点挂成模块的**子节点**（`parent`），于是双击模块进去（画布现成的聚焦/子图行为）就能看到它们。
       * 只收比 hint 更深一级的单元；没有更深单元的模块**不进子图**（不凭空造步骤）。
       */
      const subgraphNodes = []
      const subgraphIndex = {}
      /** 步骤节点 id 全局唯一：同一个单元只归一个模块（先到先得），避免"一节点两父" */
      const usedStepIds = new Set()
      for (const node of nodes) {
        const hints = (node.codeHints ?? []).map(String)
        if (!hints.length) continue
        const byUnit = new Map()
        for (const hint of hints) {
          /**
           * **只有更细一级的 hint 才收内部步骤**：`S12.1` → `S12.1.1 / S12.1.2` ✓。
           * 阶段级 hint（`S11` 这种不带点的）**不收**：否则会把整个阶段的所有单元都算成这一个量的内部步骤，
           * 还会在两个量之间重复建同名节点（同一个 id 挂两个父节点 = 非法图）。宁缺勿滥。
           */
          if (!hint.includes('.')) continue
          for (const site of byStage.get(hint) ?? []) {
            const unit = String(site.unit ?? '')
            if (!unit || unit === hint || !unit.startsWith(`${hint}.`)) continue
            if (usedStepIds.has(`step:${unit}`)) continue
            byUnit.set(unit, [...(byUnit.get(unit) ?? []), site])
          }
        }
        if (!byUnit.size) continue
        const stepIds = []
        const anchor = gNodes.find((item) => item.id === node.id)?.position ?? { x: 0, y: 0 }
        ;[...byUnit.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).forEach(([unit, sites], index) => {
          const stepId = `step:${unit}`
          usedStepIds.add(stepId)
          stepIds.push(stepId)
          subgraphNodes.push({
            id: stepId,
            label: `${unit} · ${sites[0].unitName ?? ''}`,
            type: 'method',
            summary: sites[0].unitName ?? '',
            layer: 'subgraph',
            parent: node.id,
            observable: false,
            conditional: false,
            // 旁路阶段内部的步骤同样挂旁路话题（进子图看它时与一级口径一致）
            topics: isBypassHint(node.codeHints) ? [BYPASS_TOPIC_ID] : [],
            tags: [],
            tagDetails: {},
            refs: sites
              .filter((site) => Number.isFinite(site.line))
              .slice(0, 4)
              .map((site) => ({
                docId: '',
                anchor: '',
                label: unit,
                file: site.file,
                line: site.line,
                endLine: site.endLine ?? null,
              })),
            position: { x: anchor.x + index * 220 - ((byUnit.size - 1) * 220) / 2, y: anchor.y },
          })
        })
        subgraphIndex[node.id] = { steps: stepIds }
      }

      /**
       * **顶层流程**：把"量 → 量"的依赖汇总成"过程 → 过程"的流程，于是顶层读到的是一条链：
       * 天体物理源 → 电离与复合 → 热与自旋温度 → 亮温输出。
       * 规则不新造：**只由已有的依赖推**（两端分属不同过程才产生一条），并记下它由哪几条依赖汇总而来；
       * 同一对过程只画一条，标签写"几条"——不把同一件事画成多条线。
       */
      const stageOfNode = new Map()
      for (const [stage, ids] of memberIdsOfStage) for (const id of ids) stageOfNode.set(id, stage)
      const stageEdgeMap = new Map()
      for (const edge of gEdges) {
        const from = stageOfNode.get(edge.source)
        const to = stageOfNode.get(edge.target)
        if (!from || !to || from === to) continue
        const key = `${from}->${to}`
        const item = stageEdgeMap.get(key) ?? { from, to, relations: [] }
        item.relations.push(`${edge.source}→${edge.target}`)
        stageEdgeMap.set(key, item)
      }
      const stageEdges = [...stageEdgeMap.entries()].map(([key, item]) => ({
        id: `flow:${key}`,
        /**
         * 方向**翻过来**：从上面那层指向下面那层（"谁由谁决定"）。
         * 顶层是从终点往下拆的树，箭头顺着拆的方向朝下，层状结构才读得出来；
         * 原来沿用量→量的方向（下游指向上游），箭头全朝上，看着就不像树。
         */
        source: `stage:${item.to}`,
        target: `stage:${item.from}`,
        label: `${item.relations.length} 条`,
        type: 'depends_on',
        directed: true,
        conditional: false,
        note: `顶层流程：由这些依赖汇总而来 —— ${item.relations.join('、')}`,
        sourcePort: null,
        targetPort: null,
        surface: true,
      }))

      return {
        meta: {
          id: 'physics-chain',
          version: 1,
          name: '物理链',
          description: '物理视角：观测量往下追到参数；节点是物理量（标签＝符号 · 中文名，描述＝公式），连线的标签是 Eq 号。只读生成物。',
          topics: [
            {
              id: IMPL_TOPIC_ID,
              name: '实现细节',
              description:
                '把某个物理量「算出来」的那段实现（如质量函数的算法、源项的积分）。默认收起：表面只放物理环节，需要时一键展开。',
            },
            {
              id: BYPASS_TOPIC_ID,
              name: '旁路与后处理接口',
              description:
                'S04：算完顺手给出的诊断出口（光度函数 φ(M)、光深 τ_e 等）。默认收起：它们不在物理主链上，看不看都不改变后面的结果。',
            },
          ],
          tags: tagRegistry,
          updatedAt: '',
        },
        nodes: [...gNodes, ...stageGroupNodes, ...subgraphNodes],
        /**
         * 只放"量 → 量"的边；**容器（过程框）之间不画关系**（用户口径 2026-09-30）。
         * 层级由"同一深度等高 + 层号"表达，不靠容器之间的箭头。
         */
        edges: gEdges,
        /** 子图索引：模块 id → 它内部的步骤（子节点 id 列表）。视图与自检都读它，不另算 */
        subgraphs: subgraphIndex,
        /**
         * 骨干树 + 交叉边的分类（视图与自检都读它）：`levels` 是层号，`parentOf` 是主父表，
         * 后面五个名单把每条非骨干边按成因归位 —— 「为什么会出现跨层」在数据里就有答案。
         */
        crossLevel,
      }
    })(),
    /** 参数 × 节点／边 的查表（后端算好，视图直接读） */
    paramMatrix,
    /** 算法锚点与「待补」名单：原样透传（自检会查有没有静默留空） */
    algorithms: chain.algorithms ?? {},
    algorithmPending: chain.algorithmPending ?? {},
    params: groups,
    stats: {
      drivers: chain.drivers.length,
      nodes: chain.nodes.length,
      edges: chain.edges.length,
      degeneracies: chain.degeneracies.length,
      params: Object.values(groups).reduce((sum, list) => sum + list.length, 0),
      codeSites: 0,
    },
  }

  /** 落点去重后计数（在 artifact 建好之后再算，避免读取尚未初始化的变量） */
  artifact.stats.codeSites = [
    ...new Set([...artifact.drivers, ...artifact.nodes].flatMap((item) => item.code.sites.map((site) => `${site.file}:${site.line}`))),
  ].length

  const shapeProblems = assertShape(artifact)
  if (shapeProblems.length) {
    say('✗ 写前校验未通过：')
    for (const problem of shapeProblems.slice(0, 20)) say(`   · ${problem}`)
    process.exitCode = 1
    return
  }

  /** 戳记 = 内容哈希（文档与源码不变时产物逐字不变） */
  artifact.stamp = `generated-${createHash('sha1')
    .update(JSON.stringify({ ...artifact, stamp: '' }))
    .digest('hex')
    .slice(0, 12)}`

  say('物理链 · 生成')
  say(`  驱动量 ${artifact.stats.drivers} · 物理量 ${artifact.stats.nodes} · 依赖边 ${artifact.stats.edges} · 简并 ${artifact.stats.degeneracies}`)
  say(`  参数 ${artifact.stats.params}（${Object.entries(groups).map(([name, list]) => `${name} ${list.length}`).join(' / ')}）`)
  say(`  代码落点 ${artifact.stats.codeSites} 处（按函数体定位的单元 ${siteStats.located}，整文件 ${siteStats.fileWide}，未定位 ${siteStats.missed.length}）`)
  const cross = artifact.graph.crossLevel
  say(
    `  骨干树 ${cross.stats.backbone} 条（层差恒 1，每个量恰一个父）· 交叉边 ${cross.stats.sibling + cross.stats.coarse + cross.stats.bypass + cross.stats.gap} 条` +
      `（同级多父 ${cross.stats.sibling} / 更细链条已蕴含 ${cross.stats.coarse} / 旁路诊断 ${cross.stats.bypass} / 缺中间量 ${cross.stats.gap}）`,
  )
  if (cross.stats.gap) say(`  ⚠ 缺中间量的跨层边（待补，不许静默）：${cross.gap.join('、')}`)
  say(`  戳记 ${artifact.stamp}`)

  if (flag('stdout')) {
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`)
    return
  }
  if (flag('dry-run')) {
    say('  （dry-run：没有写文件）')
    return
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
  const before = await fs.readFile(OUT_FILE, 'utf8').catch(() => null)
  const payload = `${JSON.stringify(artifact, null, 2)}\n`
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
