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

import type { AffixRuleConfig, EquipFormulaConfig, PetMountIndividual, PetMountRulesConfig, PetMountTraitEntry } from '@/domain/fengshen/types'
import { equipBaseUnit } from '@/domain/fengshen/player-config'

/** 基础六维：有属性点转化系数、走装备公式；其余属性一律走词条曲线 */
export const BASE_ATTR_CODES: ReadonlySet<string> = new Set([
  'maxHealth', 'attack', 'defense', 'hitValue', 'dodgeValue', 'speed',
])

/** 品质（凡/精/超/绝/神 = 1..5）→ 附加属性条数（PRD §21 装备品质表） */
export const QUALITY_LABELS = ['凡', '精', '超', '绝', '神'] as const

/** 词条曲线来源：装备侧基础六维走装备公式；宠物坐骑侧一律走曲线（曲线无行即缺口） */
export type CurveKey = 'equipment' | 'pet_mount'

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
function findCurveRow(cfg: AffixRuleConfig, curve: CurveKey, attribute: string) {
  const rows = cfg.affix_value_curve?.[curve] ?? []
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
 * 单属性区间（装备侧）。基础六维走装备公式（需 conversion），其余走 equipment 曲线。
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
  return resolveCurveAttrRange(cfg, 'equipment', formula, conversion, attribute, level, tier, weight, ratio, ratioNote)
}

/**
 * 单属性区间（参数化曲线通路）。curve = pet_mount 时：
 * 基础六维不再走装备公式（宠物坐骑没有六维装备公式，发现 C），一律按曲线行求区间；
 * 曲线无该属性行 → source none，推导写明缺口。
 * opts：宠物坐骑侧复用公式通路时的文案覆盖（部位→系统、权重来源、通路名），缺省即装备侧文案。
 */
export function resolveCurveAttrRange(
  cfg: AffixRuleConfig,
  curve: CurveKey,
  formula: EquipFormulaConfig,
  conversion: Record<string, number>,
  attribute: string,
  level: number,
  tier: string,
  weight: number,
  ratio = 1,
  ratioNote = '',
  opts?: { pathLabel?: string; weightLabel?: string; unitNote?: string },
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

  // 装备侧基础六维走装备公式；pet_mount 曲线没有六维行，无此通路（发现 C）
  if (curve === 'equipment' && BASE_ATTR_CODES.has(attribute)) {
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
      { label: '通路', expr: opts?.pathLabel ?? '装备公式（基础六维）' },
      {
        label: '基准',
        expr: `${unit} × ${level} × ${weight}${ratio !== 1 ? ` × ${ratio}` : ''} × ${conv} = ${base}`,
        note: '裸值，未乘品阶与浮动',
      },
      { label: '单位基数', expr: `${unit} = ${formula.baseSap} ÷ ${formula.slotCount}${opts?.unitNote ?? ' 部位'} ÷ ${formula.weightPerSlot} 权重 ÷ ${formula.maxLevel} 级` },
      { label: '等级', expr: `${level} = Lv.${level}（上限 ${formula.maxLevel}）` },
      { label: '属性权重', expr: opts?.weightLabel ?? `${weight} = 核心 ${formula.coreWeight} / 附加 ${formula.affixWeight}` },
    ]
    // 养成倍率（资质×突破）即使为 1.0 也显示：策划需要确认当前口径，静默省略违背显式化原则
    if (ratio !== 1 || ratioNote) steps.push({ label: '词条系数', expr: `${ratio} = ${ratioNote || '子类型核心属性词条系数'}` })
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

  const hit = findCurveRow(cfg, curve, attribute)
  if (!hit) {
    const gap = curve === 'pet_mount'
      ? { label: '缺口', expr: '宠物与坐骑曲线表无覆盖该属性的行', note: '基础六维绝对值宠物坐骑侧无数值通路（发现 C）；百分比属性先在「宠物与坐骑」曲线表补行' }
      : { label: '缺口', expr: '曲线表无覆盖该属性的行', note: '先在「词条投放规则 → 装备设计」的曲线表补一行，否则该属性不可投放' }
    return {
      attribute, source: 'none', min: 0, max: 0,
      calc: [
        { label: '通路', expr: curve === 'pet_mount' ? '宠物与坐骑曲线' : '词条曲线（百分比 / 机制属性）' },
        gap,
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
      { label: '通路', expr: curve === 'pet_mount' ? '宠物与坐骑曲线（不吃属性权重与转化系数）' : '词条曲线（不吃属性权重与转化系数）' },
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

// ─────────────────────────────────────────────────────────────────────────────
// 宠物与坐骑总览（封神榜「词条投放规则 → 宠物与坐骑总览」）
//
// 8.16 口径（PRD《完整项目说明》§宠物与坐骑系统；需求《宠物与坐骑总览需求》重写版 §五）：
// - 个体驱动：主要 3 条权重取 configs/pets|mounts 个体 weights，特性取个体 trait 文本
// - 主要 3 条走六维公式：单位基数 = base_sap ÷ system_count ÷ total_weight ÷ max_level（= 1）
//   值 = 单位基数 × 等级 × 个体权重 × 资质倍率(资质 ÷ aptitude.base) × 突破倍率(1 + Σbonus)
//        × 转化系数 × 品阶权重 × 浮动（品阶与装备共用 tier_weight，PRD 明文）
// - 附加行走 pet_mount 曲线；品质 ≥ 行 minQuality 才投放（品质 1~5，不随曲线增减）
// - 行→属性组池映射：2026-09-06 策划拍板，行名与属性组码逐字同源（原 §八遗留 1 已关闭）
// ─────────────────────────────────────────────────────────────────────────────

/** 个体 weights 键 → 属性 code（configs 用短名 hit / dodge，属性系统用 hitValue / dodgeValue） */
const INDIVIDUAL_WEIGHT_CODES: Record<string, string> = {
  attack: 'attack', hit: 'hitValue', speed: 'speed',
  defense: 'defense', dodge: 'dodgeValue', maxHealth: 'maxHealth',
}

/** 主要 3 条显示名（六维绝对值不在曲线短名表里） */
const MAIN_ATTR_LABELS: Record<string, string> = {
  attack: '攻击', hitValue: '命中', speed: '速度', defense: '防御', dodgeValue: '闪避', maxHealth: '气血',
}

/** 主要 3 条的规范键序（PRD 表列序：宠物 攻/命/速，坐骑 防/闪/血）——个体 JSON 键序不可依赖 */
const MAIN_KEY_ORDER: Record<'pet' | 'mount', string[]> = {
  pet: ['attack', 'hit', 'speed'],
  mount: ['defense', 'dodge', 'maxHealth'],
}

/** 主要属性 1 条（个体权重驱动，公式通路） */
export interface PetMountMainSlot {
  attribute: string
  label: string
  /** 个体权重（3 条合计应为 formula.main_weight_sum = 7） */
  weight: number
  range: OverviewAttrRange
}

/** 词条投放行（品质门槛 + 曲线池；main 行由 mainSlots 渲染，trait 行只给门槛） */
export interface PetMountRuleRowResult {
  id: string
  name: string
  minQuality: number
  /** 品质 ≥ minQuality */
  included: boolean
  /** 池内全部候选属性及区间（曲线通路）；main/trait 行为空 */
  candidates: OverviewAttrRange[]
}

export interface PetMountOverview {
  system: 'pet' | 'mount'
  individual: PetMountIndividual
  level: number
  tier: string
  quality: number
  aptitude: number
  breakthrough: number
  /** 资质倍率 × 突破倍率（悬浮推导单列一行） */
  growthRatio: number
  mainSlots: PetMountMainSlot[]
  rows: PetMountRuleRowResult[]
  warnings: string[]
  /** 当前品质下的词条位（3 主要 + 特性 + ALL + 生效附加行，随品质实算） */
  activeSlotCount: number
}

/** 突破倍率：前 n 次累计（第 1/2/3 次 +10%/+20%/+30% → 1.1 / 1.3 / 1.6 倍） */
function breakthroughRatio(rules: PetMountRulesConfig, times: number): number {
  return 1 + rules.breakthroughs
    .slice(0, Math.max(0, Math.trunc(times)))
    .reduce((sum, b) => sum + b.bonus, 0)
}

/**
 * 特性随机获取（2026-09-06 口径变更）：特性不再由个体固定配置，获得时从所属流派特性池
 * 随机一种——宠物取 attack 组、坐骑取 defense 组（与 ATK/DEF 行侧对称）。
 * 个体 category 无池或池为空时返回 null，调用方回落到个体固定 trait（尚未池化的流派）。
 * rng 参数供测试注入确定性序列；抽到的条目由调用方缓存，保证同一会话展示稳定。
 */
export function pickPetMountTrait(
  rules: PetMountRulesConfig,
  system: 'pet' | 'mount',
  category: string,
  rng: () => number = Math.random,
): PetMountTraitEntry | null {
  const pool = rules.trait_pools?.[category]
  const entries = pool ? (system === 'pet' ? pool.attack : pool.defense) : []
  if (!entries.length) return null
  return entries[Math.min(entries.length - 1, Math.floor(rng() * entries.length))] ?? null
}

/**
 * 宠物与坐骑曲线闭合校验：base + perLevel × (maxLevel − 1) ≈ full。
 * 发现 A：全部 14 行按 50 级闭合（最大偏差 0.3，属四舍五入），反证满级 50——现为 pet_mount_rules.max_level 明文。
 */
export function curveClosureWarnings(
  cfg: AffixRuleConfig,
  curve: CurveKey,
  maxLevel: number,
  tolerance = 0.6,
): string[] {
  const rows = cfg.affix_value_curve?.[curve] ?? []
  const out: string[] = []
  rows.forEach((r, i) => {
    for (const bound of ['min', 'max'] as const) {
      const calc = r[bound].base + r[bound].perLevel * (maxLevel - 1)
      if (Math.abs(calc - r[bound].full) > tolerance) {
        out.push(`曲线第 ${i + 1} 行 ${bound} 不闭合：${r[bound].base} + ${r[bound].perLevel} × ${maxLevel - 1} = ${round1(calc)} ≠ 满级 ${r[bound].full}`)
      }
    }
  })
  return out
}

/**
 * 组装一只宠物 / 一匹坐骑的属性区间总览。
 * 个体由调用方从 petIndividuals()/mountIndividuals() 解析后传入；缺配置一律进 warnings，绝不静默为 0。
 */
export function buildPetMountOverview(
  cfg: AffixRuleConfig,
  conversion: Record<string, number>,
  input: {
    system: 'pet' | 'mount'
    individual: PetMountIndividual
    level: number
    tier: string
    quality: number
    /** 资质值（aptitude.min ~ cap），缺省 base = 1.0 倍 */
    aptitude?: number
    /** 已突破次数（0~3），缺省 0 */
    breakthrough?: number
  },
): PetMountOverview {
  const warnings: string[] = []
  const { system, individual, level, tier, quality } = input
  const side = system === 'pet' ? 'ATK' : 'DEF'
  const rules = cfg.pet_mount_rules

  if (!rules) {
    return {
      system, individual, level, tier, quality,
      aptitude: input.aptitude ?? 0, breakthrough: input.breakthrough ?? 0, growthRatio: 1,
      mainSlots: [], rows: [],
      warnings: ['pet_mount_rules 未配置（affix-rule.json），无法反推'],
      activeSlotCount: 0,
    }
  }

  const aptitude = input.aptitude ?? rules.aptitude.base
  const breakthrough = input.breakthrough ?? 0
  const aptRatio = rules.aptitude.base > 0 ? aptitude / rules.aptitude.base : 1
  const btRatio = breakthroughRatio(rules, breakthrough)
  const growthRatio = aptRatio * btRatio

  if (!tierRange(cfg, tier)) warnings.push(`未知品阶 ${tier}，无 tier_weight 配置`)

  // 宠物公式参数化复用装备公式通路：900 ÷ 2(系统) ÷ 9(总权重) ÷ 50 级 = 单位基数 1
  const formula: EquipFormulaConfig = {
    id: 'equip_formula',
    baseSap: rules.formula.base_sap,
    slotCount: rules.formula.system_count,
    weightPerSlot: rules.formula.total_weight,
    maxLevel: rules.max_level,
    coreWeight: 1,
    affixWeight: 1,
    floatRange: rules.float_range,
    tierWeight: {},
  }

  // ── 主要 3 条：个体权重 + 资质×突破 + 转化系数，公式通路 ──
  const order = MAIN_KEY_ORDER[system]
  const weightEntries: Array<[string, number]> = order
    .filter((k) => individual.weights[k] != null)
    .map((k) => [k, individual.weights[k]!])
  for (const k of Object.keys(individual.weights)) {
    if (!order.includes(k)) {
      warnings.push(`个体 ${individual.name} 权重键 ${k} 不在 ${system} 规范序（${order.join('/')}）中，已追加到末尾`)
      weightEntries.push([k, individual.weights[k]!])
    }
  }
  const weightSum = weightEntries.reduce((s, [, w]) => s + w, 0)
  if (Math.abs(weightSum - rules.formula.main_weight_sum) > 1e-6) {
    warnings.push(`个体 ${individual.name} 权重和 ${round1(weightSum)} ≠ 主要权重和 ${rules.formula.main_weight_sum}（PRD 7）`)
  }
  const ratioNote = `资质 ${aptitude}÷${rules.aptitude.base}=${round1(aptRatio)} × 突破 ${round1(btRatio)}`
  const mainSlots: PetMountMainSlot[] = weightEntries.map(([key, weight]) => {
    const code = INDIVIDUAL_WEIGHT_CODES[key] ?? key
    const range = resolveCurveAttrRange(cfg, 'equipment', formula, conversion, code, level, tier, weight, growthRatio, ratioNote, {
      pathLabel: '宠物坐骑公式（基础六维）',
      unitNote: ' 系统',
      weightLabel: `${weight} = 个体权重`,
    })
    return { attribute: code, label: MAIN_ATTR_LABELS[code] ?? code, weight, range }
  })

  // ── 词条行：品质门槛 + 曲线池（池映射已拍板，见 §八遗留 1 关闭记录） ──
  const rows: PetMountRuleRowResult[] = rules.rows.map((r) => {
    const included = quality >= r.minQuality
    const candidates: OverviewAttrRange[] = []
    if (r.pool && included) {
      const seen = new Set<string>()
      for (const g of r.pool[side] ?? []) {
        for (const attr of expandPoolRef(cfg, g)) {
          if (seen.has(attr)) continue
          seen.add(attr)
          candidates.push(resolveCurveAttrRange(cfg, 'pet_mount', formula, conversion, attr, level, tier, 0))
        }
      }
    }
    return { id: r.id, name: side === 'ATK' ? r.nameAtk : r.nameDef, minQuality: r.minQuality, included, candidates }
  })

  // 2026-09-06 策划拍板：行名与属性组码逐字同源（L1 行池 = ATK-L1/DEF-L1），池映射草案 warning 关闭（需求 §八遗留 1）
  warnings.push(...curveClosureWarnings(cfg, 'pet_mount', rules.max_level))

  const activeSlotCount = 3 + rows.filter((r) => r.included && r.id !== 'main').length
  return { system, individual, level, tier, quality, aptitude, breakthrough, growthRatio, mainSlots, rows, warnings, activeSlotCount }
}

/** 曲线行分组标签用短名（ALL_ATTRS 同款映射的领域侧副本，避免 UI 层成为唯一持有者） */
const SHORT_ATTR_NAMES: Record<string, string> = {
  attackBonus: '攻击加成', hitBonus: '命中加成', speedBonus: '速度加成', healthBonus: '气血加成',
  defenseBonus: '防御加成', dodgeBonus: '闪避加成',
  attackCoefficient: '攻击系数', hitCoefficient: '命中系数', speedCoefficient: '速度系数',
  healthCoefficient: '气血系数', defenseCoefficient: '防御系数', dodgeCoefficient: '闪避系数',
  hit: '命中率', dodge: '闪避率', lifestealRate: '吸血率', effectHit: '效果命中', controlSuccessRate: '控制命中',
  counterRate: '反击率', trueDamageRate: '真伤率', critRate: '暴击率', reflectDamagePercent: '伤害反弹', critResist: '暴击抵抗',
  critDamage: '暴击伤害', critDmgTakenReduction: '暴伤减免', damageCoefficient: '伤害系数',
  comboDamageCoefficient: '连击伤害系数', counterDamageCoefficient: '反击伤害系数', trueDamageCoefficient: '真伤系数',
  finalAttack: '最终攻击', finalDefense: '最终防御', damageReductionCoefficient: '免伤系数',
  comboRate: '连击率', damageBoost: '伤害提升', normalAtkBonus: '普攻加成', skillBonus: '技能加成',
  shieldBonus: '护盾加成', healBonus: '治疗加成', reflectBonus: '反弹加成', finalDamageBoost: '最终伤害提升',
  lifestealBonus: '吸血效果加成',
  trueDamageResist: '真伤抗性', normalAtkDmgReduction: '普攻抵抗', skillDmgReduction: '技能抵抗',
  controlImmunity: '控制豁免', debuffImmunityRate: '效果抵抗', armorBreak: '破甲',
  energyGainEfficiency: '能量获取效率',
  shieldReduction: '护盾削减', healReduction: '治疗削减', lifestealReduction: '吸血削减', reflectReduction: '反弹削减',
  damageReduction: '免伤率', finalDamageReduction: '最终伤害减免', hpRegenPercent: '气血回复',
  energyInit: '初始能量', splash: '溅射',
}

export function attrShortName(code: string): string {
  return SHORT_ATTR_NAMES[code] ?? code
}
