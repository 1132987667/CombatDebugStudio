/**
 * equip-roll-check.ts — 装备 roll 产物合规校验（PRD §21 七条规则）
 *
 * 与生成实现（gear-generate）相互独立的第二双眼：按 affix_rule + equip_formula 复算
 * 「本应产出什么」，逐件比对实例的实际属性与词条。消费方为单元测试 equipment-roll-rules
 * 与演劫台调试「一键检查词条」——两处共用本函数，校验口径单源。
 *
 * 输出分两栏，语义不同：
 * - violations：生成逻辑违规（词条越界/条数错/触禁止表），是 bug；
 * - gaps：配置缺口（子类型池未覆盖），是待策划补配的数据问题，产物已被生成器自愈。
 *
 * NOTE: factorRange（品质 → 系数区间）由调用方注入而非在此 import——该表在西游
 *       presentation 层（xiyou/quality.ts），domain 不反向依赖表现层。
 */
import type { AffixRuleConfig, EquipmentData, EquipmentStatEntry, EquipFormulaConfig, GearAffix } from '@/domain/fengshen/types'
import type { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { getAttrMeta } from '@/domain/attribute/types'
import { resolveAttrRange, expandPoolRef, forbiddenAttrs, rowGroups, qualityAffixCount } from '@/domain/fengshen/equipment-overview'
import { rollGearStats, TIER_TO_QUALITY } from '@/domain/fengshen/gear-generate'

/** 被校验的一件装备实例（结构上兼容 packStore 的 GearInstance） */
export interface RollCheckInstance {
  quality: number
  qualityFactor: number
  /** 核心属性（应恰 1 条） */
  stats: EquipmentStatEntry[]
  /** 主要 + 附加词条 */
  affixes: GearAffix[]
}

export interface RollCheckContext {
  cfg: AffixRuleConfig
  formula: EquipFormulaConfig
  conversion: Record<string, number>
  /** 品质 → 品质系数区间（QUALITY_FACTOR_RANGE） */
  factorRange: Record<number, { min: number; max: number }>
  /** 规则 7 复算 roll warnings 用的随机源，缺省 Math.random */
  rng?: () => number
}

export interface RollCheckReport {
  /** 生成逻辑违规明细（已带装备 label 前缀） */
  violations: string[]
  /** 配置缺口明细（已带装备 label 前缀） */
  gaps: string[]
}

/** 取整容差：整数维度 ±0.5、一位小数 ±0.05，统一放宽到 0.51 不掩盖真实越界 */
const EPS = 0.51

/**
 * 文档 §21 武器表明文「未配置」的设计例外：这些子类型缺主要属性池不算缺口。
 * - dagger（刺）：主要第 1 条与第 2 条均无
 * - staff（棍）/ blade（刀）：主要第 2 条随机池无
 */
const EXEMPT_MAIN_POOL = new Set(['dagger'])
const EXEMPT_MAIN_RANDOM = new Set(['staff', 'blade'])

/** 逐件校验一件装备的核心/主要/附加属性与品质维度是否符合 §21 规则 */
export function checkGearRoll(def: EquipmentData, inst: RollCheckInstance, ctx: RollCheckContext): RollCheckReport {
  const violations: string[] = []
  const gaps: string[] = []
  const label = `${def.id}(${def.name} q${inst.quality})`
  const fail = (msg: string) => violations.push(`${label}: ${msg}`)
  const gap = (msg: string) => gaps.push(`${label}: ${msg}`)

  const subType = def.subType ?? def.slot
  const tier = TIER_TO_QUALITY[def.tier ?? 't1'] ?? 'fan'
  const itemLevel = Math.max(1, def.itemLevel ?? 1)

  // ── 品质维度 ──
  if (inst.quality < 1 || inst.quality > 5) fail(`品质 ${inst.quality} 越界`)
  const qr = ctx.factorRange[inst.quality]
  if (qr && (inst.qualityFactor < qr.min - 1e-9 || inst.qualityFactor > qr.max + 1e-9)) {
    fail(`品质系数 ${inst.qualityFactor} 不在 ${inst.quality} 品区间 [${qr.min}, ${qr.max}]`)
  }

  // ── 规则 1：核心属性 ──
  const coreCfg = ctx.cfg.core_affix_ratio?.[subType]
  if (!coreCfg) {
    fail(`子类型 ${subType} 无核心系数配置`)
    return { violations, gaps }
  }
  if (inst.stats.length !== 1) {
    fail(`核心属性应为 1 条，实际 ${inst.stats.length}`)
    return { violations, gaps }
  }
  const core = inst.stats[0]!
  if (core.attribute !== coreCfg.attribute) fail(`核心属性 ${core.attribute} ≠ 配置 ${coreCfg.attribute}`)
  const expectCoreType = getAttrMeta(coreCfg.attribute as ATTRIBUTE_CODE)?.isPercentage ? 'percent' : 'flat'
  if (core.modifierType !== expectCoreType) fail(`核心 modifierType ${core.modifierType} ≠ ${expectCoreType}`)
  const coreRange = resolveAttrRange(ctx.cfg, ctx.formula, ctx.conversion, coreCfg.attribute, itemLevel, tier, ctx.formula.coreWeight, coreCfg.ratio)
  if (coreRange.source === 'none') fail('核心属性区间不可投放（配置缺口）')
  else if (core.value < coreRange.min * inst.qualityFactor - EPS || core.value > coreRange.max * inst.qualityFactor + EPS) {
    fail(`核心 ${core.attribute}=${core.value} 越界 [${coreRange.min},${coreRange.max}]×${inst.qualityFactor.toFixed(3)}`)
  }

  // ── 规则 2：主要属性（池缺失 = 配置缺口，不计违规；其余照规则断言）──
  const pool = ctx.cfg.main_affix_pool?.[subType]
  if (!pool) {
    if (!EXEMPT_MAIN_POOL.has(subType)) gap(`子类型 ${subType} 无主要属性池`)
    return { violations, gaps }
  }
  const banned = forbiddenAttrs(ctx.cfg, def.slot, subType)
  const main = inst.affixes.filter((a) => a.fixed)
  const second = inst.affixes.filter((a) => a.main)
  if (pool.fixed && main.length !== 1) fail(`主要第 1 条（固定）应 1 条，实际 ${main.length}`)
  if (pool.fixed && main[0] && main[0].attribute !== pool.fixed) fail(`固定主要属性 ${main[0]?.attribute} ≠ ${pool.fixed}`)
  if (!pool.fixed) gap(`子类型 ${subType} 主要第 1 条（固定）未配置`)
  if (second.length !== 1) {
    if (EXEMPT_MAIN_RANDOM.has(subType)) {
      /* 棍/刀：文档明文无随机池 */
    } else if (!(pool.random_pool ?? []).length) gap(`子类型 ${subType} 主要第 2 条（随机池）未配置`)
    else fail(`主要第 2 条（随机）应 1 条，实际 ${second.length}`)
  }
  if (second[0]) {
    const candidates = new Set((pool.random_pool ?? []).flatMap((ref) => expandPoolRef(ctx.cfg, ref)))
    for (const b of banned) candidates.delete(b)
    if (!candidates.has(second[0].attribute)) fail(`主要随机属性 ${second[0].attribute} 不在随机池（扣除禁止）内`)
  }

  // ── 规则 3：附加属性条数与去重 ──
  const expectedAppend = qualityAffixCount(inst.quality, ctx.cfg.affix_rows?.length ?? 0)
  const append = inst.affixes.filter((a) => !a.fixed && !a.main)
  if (append.length !== expectedAppend) fail(`附加属性应 ${expectedAppend} 条，实际 ${append.length}`)
  const mainAttrs = new Set(inst.affixes.filter((a) => a.fixed || a.main).map((a) => a.attribute))
  const dup = append.filter((a, i) => append.findIndex((b) => b.attribute === a.attribute) !== i || mainAttrs.has(a.attribute))
  if (dup.length) fail(`附加属性重复或与主要重复：${dup.map((a) => a.attribute).join(',')}`)

  // ── 规则 4：禁止表 ──
  for (const a of inst.affixes) {
    if (banned.has(a.attribute)) fail(`词条 ${a.attribute} 触碰禁止表（部位 ${def.slot}/子类型 ${subType}）`)
  }

  // ── 规则 5：附加属性落在前 N 行阵营池 + 数值区间 ──
  const side = ctx.cfg.slot_side?.[def.slot] ?? 'ATK'
  const rowCount = Math.min(inst.quality, ctx.cfg.affix_rows?.length ?? 0)
  const legalAppend = new Set<string>()
  for (const row of ctx.cfg.affix_rows ?? []) {
    if (row.row > rowCount) break
    for (const ref of rowGroups(ctx.cfg, side, row.row)) for (const a of expandPoolRef(ctx.cfg, ref)) if (!banned.has(a)) legalAppend.add(a)
  }
  for (const a of append) {
    if (!legalAppend.has(a.attribute)) fail(`附加属性 ${a.attribute} 不在前 ${rowCount} 行 ${side} 池（扣禁止）内`)
    const ar = resolveAttrRange(ctx.cfg, ctx.formula, ctx.conversion, a.attribute, itemLevel, tier, ctx.formula.affixWeight)
    if (ar.source === 'none') fail(`附加属性 ${a.attribute} 区间不可投放（配置缺口）`)
    else if (a.value < ar.min - EPS || a.value > ar.max + EPS) fail(`附加 ${a.attribute}=${a.value} 越界 [${ar.min},${ar.max}]`)
  }
  for (const a of inst.affixes.filter((x) => x.main)) {
    const mr = resolveAttrRange(ctx.cfg, ctx.formula, ctx.conversion, a.attribute, itemLevel, tier, ctx.formula.affixWeight)
    if (mr.source !== 'none' && (a.value < mr.min - EPS || a.value > mr.max + EPS)) {
      fail(`主要 ${a.attribute}=${a.value} 越界 [${mr.min},${mr.max}]`)
    }
  }

  // ── 规则 7：配置完备（零 warning；池缺失与设计例外同规则 2 口径剔除）──
  const rolled = rollGearStats(
    { slot: def.slot, subType, tier, itemLevel, quality: inst.quality, qualityFactor: inst.qualityFactor },
    ctx.cfg,
    ctx.formula,
    ctx.conversion,
    ctx.rng ?? Math.random,
  )
  for (const w of rolled.warnings) {
    if (EXEMPT_MAIN_POOL.has(subType) && w.includes('main_affix_pool')) continue
    if (EXEMPT_MAIN_RANDOM.has(subType) && w.includes('主要属性第 2 条')) continue
    gap(w)
  }

  return { violations, gaps }
}
