/**
 * equipment-overview.ts — 装备总览数值推算纯函数（封神榜「词条投放规则 → 装备总览」）
 *
 * 定位：策划验证器。输入「等级 / 部位 / 子类型 / 品阶 / 品质」五个参数，
 * 按 affix_rule + equip_formula 反推一件装备**可能产出的全部属性及数值区间**，
 * 不读取 equipment.json 的任何已配置装备。
 *
 * 三条数值通路（PRD §21）：
 * - 基础六维（攻击/防御/气血/命中/闪避/速度）→ 装备公式 `单位基数 × 等级 × 权重 × 品阶权重 × 转化系数`
 * - 百分比 / 机制属性 → `affix_value_curve`（base + perLevel × (L-1)），同样 × 品阶权重
 * - 两者再各自 × 浮动 50%~110%
 *
 * 区间口径：品阶权重在 [tier.min, tier.max] 内每件装备随机取一次，故最终区间
 * 取「最小品阶权重 × 最小浮动」到「最大品阶权重 × 最大浮动」的外包络。
 */

import type { AffixRuleConfig, EquipFormulaConfig } from '@/domain/fengshen/types'
import { equipBaseUnit } from '@/domain/fengshen/player-config'

/** 基础六维：有属性点转化系数、走装备公式；其余属性一律走词条曲线 */
export const BASE_ATTR_CODES: ReadonlySet<string> = new Set([
  'maxHealth', 'attack', 'defense', 'hitValue', 'dodgeValue', 'speed',
])

/** 品质（凡/精/超/绝/神 = 1..5）→ 附加属性条数（PRD §21 装备品质表） */
export const QUALITY_LABELS = ['凡', '精', '超', '绝', '神'] as const

/** 词条投放矩阵共 5 行，品质上限即行数；超出按 5 收口 */
export function qualityAffixCount(quality: number, rowCount: number): number {
  return Math.max(0, Math.min(Math.trunc(quality) || 0, rowCount))
}

/**
 * 推导气泡的一行。策划要能一眼看出「这一步在算什么、为什么这么算」，
 * 故每步拆成 label（步骤名）+ expr（算式）+ note（口径说明），不写成一句话串。
 */
export interface CalcStep {
  label: string
  expr: string
  note?: string
  /** 结论行；UI 依此追加属性单位 */
  result?: boolean
}

export interface OverviewAttrRange {
  attribute: string
  /** formula = 装备公式（基础六维）；curve = 词条曲线；none = 该属性无曲线数据，不可投放 */
  source: 'formula' | 'curve' | 'none'
  min: number
  max: number
  /** 分步推导过程；source 为 none 时为缺口说明 */
  calc: CalcStep[]
}

export interface OverviewAffixRow {
  row: number
  name: string
  /** 本装备阵营下该行可抽的属性组码 */
  groups: string[]
  /** 组内全部候选属性及各自可获得区间（点击词条栏时展开用） */
  candidates: OverviewAttrRange[]
  /** 品质只投放前 N 行，标记本行本次是否生效 */
  included: boolean
}

export interface EquipmentOverview {
  core: OverviewAttrRange | null
  mainFixed: OverviewAttrRange | null
  mainRandom: OverviewAttrRange[]
  affixRows: OverviewAffixRow[]
  /** 配置缺口提示（缺曲线 / 缺主要属性池 / 未知品阶），供 UI 显式标红而非静默为 0 */
  warnings: string[]
}

function roundInt(v: number): number {
  return Math.round(v)
}

/** 百分比类保留 1 位小数（曲线 base/perLevel 最小步长 0.02，取整会把低等级值抹平） */
function round1(v: number): number {
  return Math.round(v * 10) / 10
}

function tierRange(cfg: AffixRuleConfig, tier: string): { min: number; max: number } | null {
  const w = cfg.tier_weight?.[tier]
  if (!w || !Number.isFinite(w.min) || !Number.isFinite(w.max)) return null
  return { min: Math.min(w.min, w.max), max: Math.max(w.min, w.max) }
}

/** 曲线行查找：一条 row 覆盖一组同档属性，按 attributes 命中；带行号供推导标明来源 */
function findCurveRow(cfg: AffixRuleConfig, attribute: string) {
  const rows = cfg.affix_value_curve?.equipment ?? []
  const index = rows.findIndex((r) => r.attributes.includes(attribute))
  return index < 0 ? null : { row: rows[index], index }
}

/** 品阶与浮动两行通用于两条通路：各自独立取值，最终取外包络 */
function envelopeSteps(tw: { min: number; max: number }, float: { min: number; max: number }): CalcStep[] {
  return [
    { label: '品阶', expr: `× ${tw.min} ~ ${tw.max}`, note: '每件装备随机取一次，不是每条词条各取' },
    {
      label: '浮动',
      expr: `× ${float.min} ~ ${float.max}`,
      note: '词条随机 roll，与品阶独立；区间取外包络，同一件未必同时命中',
    },
  ]
}

/**
 * 单属性区间。基础六维走装备公式（需 conversion），其余走曲线。
 * weight 只对方程式生效（核心 2 / 附加 1）；曲线自带 base+perLevel 量纲，不再乘权重。
 * ratio / ratioNote 由调用方提供子类型核心系数及其中文名，仅核心条使用。
 */
export function resolveAttrRange(
  cfg: AffixRuleConfig,
  formula: EquipFormulaConfig,
  conversion: Record<string, number>,
  attribute: string,
  level: number,
  tier: string,
  weight: number,
  ratio = 1,
  ratioNote = '',
): OverviewAttrRange {
  const tw = tierRange(cfg, tier)
  if (!tw) {
    return {
      attribute, source: 'none', min: 0, max: 0,
      calc: [{ label: '缺口', expr: `品阶 ${tier} 不在 tier_weight 中`, note: '先在「词条投放规则 → 装备设计」补该品阶权重' }],
    }
  }
  const float = formula.floatRange
  const envelope = envelopeSteps(tw, float)

  if (BASE_ATTR_CODES.has(attribute)) {
    const conv = conversion[attribute]
    if (!conv || conv <= 0) {
      return {
        attribute, source: 'none', min: 0, max: 0,
        calc: [
          { label: '通路', expr: '装备公式（基础六维）' },
          { label: '缺口', expr: `缺 ${attribute} 的属性点转化系数`, note: '先在「玩家配置 → 属性转化」补 1 属性点 = N 点该属性' },
        ],
      }
    }
    const unit = equipBaseUnit(formula)
    const scale = unit * Math.max(1, level) * weight * ratio
    const base = roundInt(scale * conv)
    const min = roundInt(scale * tw.min * float.min * conv)
    const max = roundInt(scale * tw.max * float.max * conv)
    // 因子逐行解释：标签即算式里的那个数，读的人能对号入座，不必自己拆
    const steps: CalcStep[] = [
      { label: '通路', expr: '装备公式（基础六维）' },
      {
        label: '基准',
        expr: `${unit} × ${level} × ${weight}${ratio !== 1 ? ` × ${ratio}` : ''} × ${conv} = ${base}`,
        note: '裸值，未乘品阶与浮动',
      },
      { label: '单位基数', expr: `${unit} = ${formula.baseSap} ÷ ${formula.slotCount} 部位 ÷ ${formula.weightPerSlot} 权重 ÷ ${formula.maxLevel} 级` },
      { label: '等级', expr: `${level} = Lv.${level}（上限 ${formula.maxLevel}）` },
      { label: '属性权重', expr: `${weight} = 核心 ${formula.coreWeight} / 附加 ${formula.affixWeight}` },
    ]
    if (ratio !== 1) steps.push({ label: '词条系数', expr: `${ratio} = ${ratioNote || '子类型核心属性词条系数'}` })
    steps.push(
      { label: '属性转化', expr: `${conv} = 1 属性点折算成该属性 ${conv} 点` },
      ...envelope,
      {
        label: '区间',
        expr: `${min} ~ ${max}`,
        note: `${base} × ${tw.min} × ${float.min} ~ ${base} × ${tw.max} × ${float.max}`,
        result: true,
      },
    )
    return { attribute, source: 'formula', min, max, calc: steps }
  }

  const hit = findCurveRow(cfg, attribute)
  if (!hit) {
    return {
      attribute, source: 'none', min: 0, max: 0,
      calc: [
        { label: '通路', expr: '词条曲线（百分比 / 机制属性）' },
        { label: '缺口', expr: '曲线表无覆盖该属性的行', note: '先在「词条投放规则 → 装备设计」的曲线表补一行，否则该属性不可投放' },
      ],
    }
  }
  const { row, index } = hit
  const g = Math.max(0, level - 1)
  const lo = row.min.base + row.min.perLevel * g
  const hi = row.max.base + row.max.perLevel * g
  const min = round1(lo * tw.min * float.min)
  const max = round1(hi * tw.max * float.max)
  const shown = row.attributes.slice(0, 3).join('、') + (row.attributes.length > 3 ? ` 等 ${row.attributes.length} 项` : '')
  return {
    attribute,
    source: 'curve',
    min,
    max,
    calc: [
      { label: '通路', expr: '词条曲线（不吃属性权重与转化系数）' },
      { label: '曲线行', expr: `第 ${index + 1} 行 · ${shown}`, note: '同行属性共用一档' },
      {
        label: '最差',
        expr: `${row.min.base} + ${row.min.perLevel} × ${g} = ${round1(lo)}`,
        note: `base = Lv.1 起点，perLevel = 每级成长，故 ${level} 级 × ${g}`,
      },
      { label: '最好', expr: `${row.max.base} + ${row.max.perLevel} × ${g} = ${round1(hi)}` },
      ...envelope,
      {
        label: '区间',
        expr: `${min} ~ ${max}`,
        note: `${round1(lo)} × ${tw.min} × ${float.min} ~ ${round1(hi)} × ${tw.max} × ${float.max}`,
        result: true,
      },
    ],
  }
}

/**
 * 词条池引用解析：先按属性组码展开，未命中则视为单个属性码。
 * 使 main_affix_pool.random_pool 可同时写 `ALL-MEC`（组）与 `comboRate`（单属性）。
 */
export function expandPoolRef(cfg: AffixRuleConfig, ref: string): string[] {
  return cfg.attribute_groups?.[ref]?.attributes ?? [ref]
}

/** 本阵营在第 row 行可抽的属性组码 */
export function rowGroups(cfg: AffixRuleConfig, side: 'ATK' | 'DEF', row: number): string[] {
  return cfg.affix_rows.find((r) => r.row === row)?.pool[side] ?? []
}

/** 子类型中文名（配置里 sub_types[].name）；查不到回落 id */
function subTypeName(cfg: AffixRuleConfig, slot: string, subType: string): string {
  return cfg.sub_type_groups?.[slot]?.sub_types.find((s) => s.id === subType)?.name ?? subType
}

/**
 * 本装备适用的禁止词条。forbidden 支持两种粒度：
 * 部位级（仅 slot）与子类型级（slot + subType，配置里存的是中文名）。
 * 只按 slot 匹配会把子类型级规则误加到同部位其他子类型上。
 */
function forbiddenAttrs(cfg: AffixRuleConfig, slot: string, subType: string): Set<string> {
  const name = subTypeName(cfg, slot, subType)
  const set = new Set<string>()
  for (const rule of cfg.forbidden ?? []) {
    if (rule.slot !== slot) continue
    if (rule.subType && rule.subType !== subType && rule.subType !== name) continue
    for (const a of rule.attributes ?? []) set.add(a)
  }
  return set
}

/** 一行附加属性池的候选属性：组内属性并集，去重 + 剔除禁止项 */
function rowCandidates(
  cfg: AffixRuleConfig,
  formula: EquipFormulaConfig,
  conversion: Record<string, number>,
  groups: string[],
  level: number,
  tier: string,
  banned: Set<string>,
): OverviewAttrRange[] {
  const seen = new Set<string>()
  const out: OverviewAttrRange[] = []
  for (const g of groups) {
    for (const attr of expandPoolRef(cfg, g)) {
      if (seen.has(attr) || banned.has(attr)) continue
      seen.add(attr)
      out.push(resolveAttrRange(cfg, formula, conversion, attr, level, tier, formula.affixWeight))
    }
  }
  return out
}

/**
 * 组装一件装备的完整属性预览。
 * 核心 = 子类型 core_affix_ratio（attribute + ratio，装备公式权重 2）
 * 主要 = 第 1 条子类型固定 + 第 2 条随机池候选（曲线，不含基础六维）
 * 附加 = 前 N 行投放矩阵（N 由品质决定）
 */
export function buildEquipmentOverview(
  cfg: AffixRuleConfig,
  formula: EquipFormulaConfig,
  conversion: Record<string, number>,
  input: { level: number; slot: string; subType: string; tier: string; quality: number },
): EquipmentOverview {
  const warnings: string[] = []
  const { level, slot, subType, tier } = input
  const banned = forbiddenAttrs(cfg, slot, subType)

  if (!tierRange(cfg, tier)) warnings.push(`未知品阶 ${tier}，无 tier_weight 配置`)
  const side = cfg.slot_side[slot] ?? 'ATK'

  // ── 核心属性 ──
  const core = cfg.core_affix_ratio[subType]
  let coreRange: OverviewAttrRange | null = null
  if (!core) {
    warnings.push(`子类型 ${subType} 未配置核心属性系数`)
  } else {
    coreRange = resolveAttrRange(
      cfg, formula, conversion, core.attribute, level, tier, formula.coreWeight, core.ratio,
      `${subTypeName(cfg, slot, subType)}的核心属性词条系数`,
    )
    if (coreRange.source === 'none') warnings.push(`核心属性 ${core.attribute} 无法计算（品阶或转化系数缺失）`)
  }

  // ── 主要属性（2 条：固定 + 随机池候选） ──
  const pool = cfg.main_affix_pool?.[subType]
  let mainFixed: OverviewAttrRange | null = null
  const mainRandom: OverviewAttrRange[] = []
  if (!pool) {
    warnings.push(`子类型 ${subType} 未配置主要属性池`)
  } else {
    if (pool.fixed) {
      if (BASE_ATTR_CODES.has(pool.fixed)) {
        warnings.push(`主要固定条 ${pool.fixed} 属基础六维，PRD §21 规定主要属性不含基础属性`)
      }
      mainFixed = resolveAttrRange(cfg, formula, conversion, pool.fixed, level, tier, formula.affixWeight)
      if (mainFixed.source === 'none') warnings.push(`主要固定条 ${pool.fixed} 无词条曲线`)
    } else {
      warnings.push(`子类型 ${subType} 主要属性第 1 条（固定）未配置`)
    }
    const seen = new Set<string>()
    for (const ref of pool.random_pool ?? []) {
      for (const attr of expandPoolRef(cfg, ref)) {
        if (seen.has(attr) || banned.has(attr)) continue
        seen.add(attr)
        const r = resolveAttrRange(cfg, formula, conversion, attr, level, tier, formula.affixWeight)
        if (r.source === 'none') warnings.push(`主要随机条 ${attr} 无词条曲线`)
        mainRandom.push(r)
      }
    }
    if (!mainRandom.length) warnings.push(`子类型 ${subType} 主要属性第 2 条（随机池）未配置`)
  }

  // ── 附加属性：品质决定前 N 行 ──
  const count = qualityAffixCount(input.quality, cfg.affix_rows.length)
  const affixRows: OverviewAffixRow[] = []
  for (const row of cfg.affix_rows) {
    const groups = rowGroups(cfg, side, row.row)
    const candidates = rowCandidates(cfg, formula, conversion, groups, level, tier, banned)
    if (row.row <= count && !candidates.length) warnings.push(`第 ${row.row} 行「${row.name}」在本阵营下无可投放属性`)
    affixRows.push({ row: row.row, name: row.name, groups, candidates, included: row.row <= count })
  }

  return { core: coreRange, mainFixed, mainRandom, affixRows, warnings }
}
