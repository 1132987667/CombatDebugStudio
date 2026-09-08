/**
 * gear-generate.ts — 装备实例属性生成纯函数（PRD《完整项目说明》§21 装备系统）
 *
 * 三种属性的固定/随机边界（§21 开篇四条）：
 * - 核心属性（固定）：种类按子类型 core_affix_ratio，值走装备公式（核心权重 2）；
 * - 主要属性（第 1 条固定 + 第 2 条随机）：main_affix_pool 按子类型配置；百分比/机制属性，
 *   不含基础六维，走 affix_value_curve 后再乘品阶权重与浮动（不吃属性权重与转化系数）；
 * - 附加属性（随机）：数量按品质（凡1/精2/超3/绝4/神5），前 N 行 affix_rows 按本装备 side 池各抽 1 条。
 *
 * 数值口径：策划验证器（equipment-overview.resolveAttrRange）给出某属性在该
 * 等级/品阶下的「可获得区间」（品阶权重 × 浮动的外包络），实例 roll 即在该区间内
 * 均匀取一点——总览页看到的区间与实际产出范围严格一致。核心属性额外乘品质系数
 * qualityFactor（§21 品级四维体系：品质决定基础属性系数与词条数量）。
 *
 * 全部随机发生在「制造 / 掉落 / 洗练」时刻并锁存进 GearInstance（stats + affixes），
 * 强化 ×(1+4%×L) 与升星 ×(5%/10%/10%) 由 packStore.instanceStats 叠加，不重 roll。
 * rng 全程显式传参，测试可注入确定性序列。
 */

import type { AffixRuleConfig, EquipmentStatEntry, EquipFormulaConfig, GearAffix } from '@/domain/fengshen/types'
import { expandPoolRef, forbiddenAttrs, resolveAttrRange, rowGroups, qualityAffixCount } from '@/domain/fengshen/equipment-overview'
import { getAttrMeta } from '@/domain/attribute/types'
import type { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/** 生成入参：装备静态定义中参与公式的字段 + 实例品质 */
export interface GearRollInput {
  slot: string
  /** 子类型 id（affix-rule sub_type_groups 体系） */
  subType: string
  /** 阶位（fan/xuan/di/tian/xian —— equipment.json 存 t1~t5，由 packStore 转换） */
  tier: string
  itemLevel: number
  /** 品质 1~5：决定附加属性投放行数（洗练场景可直接传目标条数，clamp 后数值等价） */
  quality: number
  /** 品质系数（制造时 roll 并锁存；仅核心属性乘） */
  qualityFactor: number
}

export interface GearRollResult {
  /** 核心属性 1 条；子类型缺 core_affix_ratio / 转化系数缺失时为 null（显式缺口） */
  core: EquipmentStatEntry | null
  /** 主要（fixed 标记第 1 条）+ 附加词条 */
  affixes: GearAffix[]
  warnings: string[]
}

/** roll 上下文：配置三件套 + 随机源，函数间透传避免长参数表 */
interface RollCtx {
  cfg: AffixRuleConfig
  formula: EquipFormulaConfig
  conversion: Record<string, number>
  rng: () => number
}

/** 属性修正类型：以 attributes.json 注册表的 isPercentage 为权威（曲线/机制属性大多为 percent） */
function modifierTypeOf(attribute: string): 'flat' | 'percent' {
  return getAttrMeta(attribute as ATTRIBUTE_CODE)?.isPercentage ? 'percent' : 'flat'
}

/** 六维（走装备公式）取整；百分比/机制属性保留 1 位小数（曲线最小步长 0.02，取整会抹平低等级值） */
function roundByModifier(attribute: string, v: number): number {
  const r = modifierTypeOf(attribute) === 'percent' ? 10 : 1
  return Math.round(v * r) / r
}

/** 单属性实例值：在验证器区间内均匀取一点；区间无效（source none）返回 null 并记 warning */
function rollAttrValue(
  ctx: RollCtx,
  input: Pick<GearRollInput, 'slot' | 'subType' | 'tier' | 'itemLevel'>,
  attribute: string,
  weight: number,
  ratio = 1,
  warnings?: string[],
): number | null {
  const range = resolveAttrRange(ctx.cfg, ctx.formula, ctx.conversion, attribute, input.itemLevel, input.tier, weight, ratio)
  if (range.source === 'none') {
    warnings?.push(`属性 ${attribute} 无法投放（品阶权重或曲线/转化系数缺失）`)
    return null
  }
  return roundByModifier(attribute, range.min + ctx.rng() * (range.max - range.min))
}

/**
 * 生成一件装备的完整实例属性（制造 / 掉落时调用一次并锁存）。
 * cfg/formula/conversion 来自封神榜 params 域（affix_rule / equip_formula / player_config）。
 * 注意：未配置的子类型（当前 10 类）产生 warnings 显式缺口，不补默认值（PRD §21）。
 */
export function rollGearStats(
  input: GearRollInput,
  cfg: AffixRuleConfig,
  formula: EquipFormulaConfig,
  conversion: Record<string, number>,
  rng: () => number = Math.random,
): GearRollResult {
  const ctx: RollCtx = { cfg, formula, conversion, rng }
  const warnings: string[] = []
  const core = rollCoreStat(input, ctx, warnings)
  const main = rollMainAffixes(input, ctx, warnings)
  const exclude = new Set(main.affixes.map((a) => a.attribute))
  const append = rollAppendAffixes(input, ctx, exclude, warnings)
  return { core: core.stat, affixes: [...main.affixes, ...append.affixes], warnings: [...warnings, ...append.warnings] }
}

/** 核心属性 1 条（固定）：core_affix_ratio[子类型]，装备公式权重 2 × 子类型系数 × 品质系数 */
export function rollCoreStat(
  input: GearRollInput,
  ctx: RollCtx,
  warnings: string[] = [],
): { stat: EquipmentStatEntry | null } {
  const core = ctx.cfg.core_affix_ratio?.[input.subType]
  if (!core) {
    warnings.push(`子类型 ${input.subType} 未配置核心属性系数（core_affix_ratio），无核心属性`)
    return { stat: null }
  }
  const v = rollAttrValue(ctx, input, core.attribute, ctx.formula.coreWeight, core.ratio, warnings)
  if (v === null) return { stat: null }
  // 品质系数只作用于基础属性（§21 品级四维体系）；区间 roll 后乘，精度随取整收口
  const factor = Math.max(0, input.qualityFactor || 1)
  return { stat: { attribute: core.attribute, modifierType: modifierTypeOf(core.attribute), value: roundByModifier(core.attribute, v * factor) } }
}

/**
 * 主要属性 2 条（第 1 条子类型固定 + 第 2 条随机池取 1，允许与第 1 条重复——PRD §21 明文）。
 * 未配置 main_affix_pool 的子类型返回空 + warning（显式缺口，不补默认值）。
 */
export function rollMainAffixes(
  input: GearRollInput,
  ctx: RollCtx,
  warnings: string[] = [],
): { affixes: GearAffix[]; warnings: string[] } {
  const { cfg } = ctx
  const pool = cfg.main_affix_pool?.[input.subType]
  if (!pool) {
    warnings.push(`子类型 ${input.subType} 未配置主要属性池（main_affix_pool）`)
    return { affixes: [], warnings }
  }
  const out: GearAffix[] = []
  if (pool.fixed) {
    const v = rollAttrValue(ctx, input, pool.fixed, ctx.formula.affixWeight, 1, warnings)
    if (v !== null) out.push({ id: pool.fixed, attribute: pool.fixed, modifierType: modifierTypeOf(pool.fixed), value: v, fixed: true })
  } else {
    warnings.push(`子类型 ${input.subType} 主要属性第 1 条（固定）未配置`)
  }
  const refs = pool.random_pool ?? []
  if (refs.length) {
    // 组码整卷展开后等概率取一属性（ALL-MEC 这类组先摊平成属性码池）
    const attrs = refs.flatMap((ref) => expandPoolRef(cfg, ref))
    const banned = forbiddenAttrs(cfg, input.slot, input.subType)
    const candidates = attrs.filter((a) => !banned.has(a))
    const pick = candidates[Math.min(candidates.length - 1, Math.floor(ctx.rng() * candidates.length))]
    if (pick) {
      const v = rollAttrValue(ctx, input, pick, ctx.formula.affixWeight, 1, warnings)
      if (v !== null) out.push({ id: pick, attribute: pick, modifierType: modifierTypeOf(pick), value: v, main: true })
    }
  } else {
    warnings.push(`子类型 ${input.subType} 主要属性第 2 条（随机池）未配置`)
  }
  return { affixes: out, warnings }
}

/**
 * 附加属性：前 N 行投放矩阵（N = 品质，夹到行数），每行从本装备 side 池抽 1 条。
 * 候选 = 行内组码展开并集 − forbidden（部位级 + 子类型级）− exclude（主要/已抽附加去重）；
 * 某行候选为空记 warning 跳过（不中断其他行），行序即品质投放序。
 */
export function rollAppendAffixes(
  input: GearRollInput,
  ctx: RollCtx,
  exclude: ReadonlySet<string> = new Set(),
  warnings: string[] = [],
): { affixes: GearAffix[]; warnings: string[] } {
  const { cfg } = ctx
  const out: GearAffix[] = []
  const side = cfg.slot_side?.[input.slot] ?? 'ATK'
  const banned = forbiddenAttrs(cfg, input.slot, input.subType)
  const used = new Set(exclude)
  const count = qualityAffixCount(input.quality, cfg.affix_rows?.length ?? 0)
  for (const row of cfg.affix_rows ?? []) {
    if (row.row > count || out.length >= count) break
    const attrs = rowGroups(cfg, side, row.row).flatMap((ref) => expandPoolRef(cfg, ref))
    const candidates = attrs.filter((a) => !banned.has(a) && !used.has(a))
    if (!candidates.length) {
      warnings.push(`第 ${row.row} 行「${row.name}」在本阵营下无可投放属性（候选耗尽或全被禁止）`)
      continue
    }
    const pick = candidates[Math.min(candidates.length - 1, Math.floor(ctx.rng() * candidates.length))]
    const v = rollAttrValue(ctx, input, pick, ctx.formula.affixWeight, 1, warnings)
    if (v === null) continue
    used.add(pick)
    out.push({ id: pick, attribute: pick, modifierType: modifierTypeOf(pick), value: v })
  }
  return { affixes: out, warnings }
}
