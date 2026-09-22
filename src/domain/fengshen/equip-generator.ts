/**
 * equip-generator.ts — 装备批量生成器（数值体系扩展 3.2）
 *
 * 批量调 rollGearStats（单件 roll 纯函数，消费 affix_rule / equip_formula / player_config
 * 约束三件套——本生成器是约束的消费端，不做第二套数值规则），聚合数值分布统计。
 * 随机走 seeded-rng（§5.6 配置生成侧）：固定种子逐字节复现，种子缺省时间戳并回填报告。
 *
 * 产物形态对齐 EquipmentData（静态定义，不带 stats——PRD §21 实例属性运行时 roll）；
 * roll 出的实例值只进统计与视图预览。id 为 gen_ 前缀临时 id，导入时由视图经
 * nextEntityId 重排（见 EquipGeneratorView）。
 */

import type { AffixRuleConfig, EquipmentData, EquipmentStatEntry, EquipFormulaConfig, GearTier } from '@/domain/fengshen/types'
import type { EquipmentSlot } from '@/shared/types/Item'
import { rollGearStats, TIER_TO_QUALITY } from '@/domain/fengshen/gear-generate'
import { BASE_ATTR_CODES } from '@/domain/fengshen/equipment-overview'
import { equipBaseUnit } from '@/domain/fengshen/player-config'
import { createRng, rngFn } from '@/shared/utils/seeded-rng'

/** 生成请求（视图输入；quality/qualityFactor 拆开——品质定词条数，系数定核心属性倍率） */
export interface EquipGenerateRequest {
  slot: EquipmentSlot
  /** 子类型 id（affix-rule sub_type_groups；护符/护手等无子类型部位传 slot 同名 id） */
  subType: string
  tier: GearTier
  /** 装备等级（喂给 EquipFormulaConfig 公式） */
  level: number
  /** 品质 1~5（凡/精/超/绝/神，定附加词条数） */
  quality: number
  /** 品质系数（仅核心属性乘；视图层经 quality.qualityFactorOf 提供，domain 不反向依赖 presentation） */
  qualityFactor: number
  /** 生成数量 1~500 */
  count: number
  /** 可复现随机种子（不填 = 时间戳，实际值回填报告） */
  seed?: number
}

/** 单件生成结果（EquipmentData 形态 + gen_ 前缀临时 id，导入时重排） */
export type GeneratedEquipment = EquipmentData

/** 批量统计（数值分布，供策划判断浮动区间是否合理） */
export interface EquipGenerateReport {
  items: GeneratedEquipment[]
  /** 实际使用的种子（回填 UI，可复现） */
  seed: number
  /** 属性代码 → roll 值分布（core + 全部词条混合；同一属性可来自核心与词条，权重不同） */
  stats: Record<string, { min: number; max: number; mean: number; p50: number; p95: number }>
  /** 核心属性单独分布（验收口径：核心属性在 calcEquipBaseValue 公式区间内，不吃 affixWeight 词条干扰） */
  coreStats: EquipGenerateReportStats
  /** 每件装备的 SAP 总量（六维 flat 值 ÷ conversion，对比 EquipTierWeight 区间） */
  sapPerItem: number[]
  /** 每件 roll 明细（与 items 同序）：核心属性 + 词条数——静态定义不带 stats（PRD §21），预览用 */
  itemRolls: Array<{ core: { attribute: string; value: number } | null; affixCount: number }>
  /** rollGearStats 汇总的配置缺口（去重） */
  warnings: string[]
}

export type EquipGenerateReportStats = Record<string, { min: number; max: number; mean: number; p50: number; p95: number }>

export const EQUIP_GEN_COUNT_MIN = 1
export const EQUIP_GEN_COUNT_MAX = 500

export interface EquipGeneratorDeps {
  affixRule: AffixRuleConfig
  formula: EquipFormulaConfig
  /** 玩家六维转化系数（player_config.conversion：12/2/2/2/2/2），SAP 换算口径 */
  conversion: Record<string, number>
}

/** 就近取分位数（p50/p95；升序数组，ceil 索引——小样本取偏保守的高位值） */
function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1))
  return sortedAsc[idx]
}

const TIER_RARITY: Record<GearTier, number> = { t1: 1, t2: 2, t3: 3, t4: 4, t5: 5 }

/** 批量生成：循环单件 roll → 聚合统计。纯同步，500 件 < 100ms（§5.7 性能预算） */
export function generateEquipments(req: EquipGenerateRequest, deps: EquipGeneratorDeps): EquipGenerateReport {
  const count = Math.min(EQUIP_GEN_COUNT_MAX, Math.max(EQUIP_GEN_COUNT_MIN, Math.floor(req.count) || EQUIP_GEN_COUNT_MIN))
  const seed = req.seed ?? Date.now()
  const rng = rngFn(createRng(seed))
  const tierKey = TIER_TO_QUALITY[req.tier] ?? 'fan'
  const level = Math.max(1, Math.floor(req.level) || 1)

  const items: GeneratedEquipment[] = []
  const sapPerItem: number[] = []
  const itemRolls: EquipGenerateReport['itemRolls'] = []
  const byAttr = new Map<string, number[]>()
  const coreByAttr = new Map<string, number[]>()
  const warnings: string[] = []

  for (let i = 0; i < count; i++) {
    const rolled = rollGearStats(
      { slot: req.slot, subType: req.subType, tier: tierKey, itemLevel: level, quality: req.quality, qualityFactor: req.qualityFactor },
      deps.affixRule,
      deps.formula,
      deps.conversion,
      rng,
    )
    warnings.push(...rolled.warnings)

    if (rolled.core) {
      const list = coreByAttr.get(rolled.core.attribute) ?? []
      list.push(rolled.core.value)
      coreByAttr.set(rolled.core.attribute, list)
    }

    const entries = rolled.core ? [rolled.core, ...rolled.affixes] : rolled.affixes
    let sap = 0
    for (const e of entries) {
      const list = byAttr.get(e.attribute) ?? []
      list.push(e.value)
      byAttr.set(e.attribute, list)
      // SAP 口径：六维 flat 值 ÷ 转化系数（percent/机制属性无静态 SAP，不计）
      if (e.modifierType === 'flat' && deps.conversion[e.attribute]) {
        sap += e.value / deps.conversion[e.attribute]
      }
    }
    sapPerItem.push(Math.round(sap * 10) / 10)
    itemRolls.push({
      core: rolled.core ? { attribute: rolled.core.attribute, value: rolled.core.value } : null,
      affixCount: rolled.affixes.length,
    })

    items.push({
      id: `gen_${i + 1}`,
      name: `生成·${req.subType || req.slot}·L${level}·${String(i + 1).padStart(3, '0')}`,
      slot: req.slot,
      subType: req.subType || undefined,
      tier: req.tier,
      rarity: TIER_RARITY[req.tier] ?? 1,
      itemLevel: level,
      requiredLevel: Math.max(1, level - 5),
      // roll 出的核心值固化为该件的固定属性（§21 coreStat）——导入/导出后与全量重生成件同一规范，
      // 实例化直取不再公式 roll；core 为 null（配置缺口）时不写，保持显式缺口语义
      ...(rolled.core ? { coreStat: rolled.core } : {}),
      craftable: false,
      source: `批量生成（种子 ${seed}）`,
    })
  }

  const aggregate = (source: Map<string, number[]>): EquipGenerateReportStats => {
    const out: EquipGenerateReportStats = {}
    for (const [attr, vals] of source) {
      const sorted = [...vals].sort((a, b) => a - b)
      const sum = vals.reduce((s, v) => s + v, 0)
      out[attr] = {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: Math.round((sum / vals.length) * 100) / 100,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
      }
    }
    return out
  }

  return { items, seed, stats: aggregate(byAttr), coreStats: aggregate(coreByAttr), sapPerItem, itemRolls, warnings: [...new Set(warnings)] }
}

/** 全量重生成逐条明细：重算结果 + 消费的阶位键（缺口时 core 为 null，原 coreStat 保留不动） */
export interface EquipmentRegenEntry {
  item: EquipmentData
  core: EquipmentStatEntry | null
  tier: string
}

/** 全量重生成报告：带 coreStat 的完整装备数组（可直接导出/写表）+ 逐条明细 + 配置缺口 */
export interface EquipmentRegenReport {
  items: EquipmentData[]
  entries: EquipmentRegenEntry[]
  warnings: string[]
  /** 标称核心属性 SAP 总量（六维 flat ÷ 转化系数），供重生成前后对比 */
  sapTotal: number
}

/**
 * 全量重生成部位固定属性（§21 核心属性）：对每件静态定义按装备公式单值口径预算 coreStat。
 * 单值口径沿用验证器既定裁定「阶位权重取区间上限」（每件随机取一次的确定性替身）；
 * 浮动（50%~110%）与品质系数属实例维度，不进静态定义，实例化时按品质系数缩放。
 * 基础六维之外的曲线属性核心无静态公式通路，记缺口跳过（当前配置不会出现）。
 * 不 mutate 入参；返回 items 保持入参顺序与字段，仅追加/覆盖 coreStat。
 */
export function regenEquipmentCoreStats(items: EquipmentData[], deps: EquipGeneratorDeps): EquipmentRegenReport {
  const out: EquipmentData[] = []
  const entries: EquipmentRegenEntry[] = []
  const warnings: string[] = []
  const unit = equipBaseUnit(deps.formula)
  let sapTotal = 0

  for (const e of items) {
    const tier = e.tier ?? 't1'
    if (!e.tier) warnings.push(`${e.id}（${e.name}）缺 tier，按 t1 凡品兜底`)
    const tierKey = TIER_TO_QUALITY[tier] ?? 'fan'
    const tw = deps.affixRule.tier_weight?.[tierKey]
    const level = Math.max(1, Math.floor(e.itemLevel ?? 1))
    if (e.itemLevel === undefined) warnings.push(`${e.id}（${e.name}）缺 itemLevel，按 1 兜底`)

    const subType = e.subType ?? e.slot
    const ratioCfg = deps.affixRule.core_affix_ratio?.[subType]
    let core: EquipmentStatEntry | null = null
    if (!ratioCfg) {
      warnings.push(`${e.id}（${e.name}）子类型 ${subType} 未配置核心属性系数（core_affix_ratio），跳过`)
    } else if (!tw) {
      warnings.push(`${e.id}（${e.name}）阶位 ${tierKey} 不在 tier_weight，跳过`)
    } else {
      const attr = ratioCfg.attribute
      const conv = deps.conversion[attr]
      if (!BASE_ATTR_CODES.has(attr) || !conv || conv <= 0) {
        warnings.push(`${e.id}（${e.name}）核心属性 ${attr} 非基础六维或缺转化系数，无静态公式通路，跳过`)
      } else {
        const value = Math.round(unit * level * deps.formula.coreWeight * ratioCfg.ratio * conv * tw.max)
        core = { attribute: attr, modifierType: 'flat', value }
        sapTotal += value / conv
      }
    }
    entries.push({ item: e, core, tier: tierKey })
    out.push(core ? { ...e, coreStat: core } : { ...e })
  }

  return { items: out, entries, warnings, sapTotal: Math.round(sapTotal * 10) / 10 }
}

/**
 * 导出规范化：剥离存储层注入的元数据（FengshenDataService.save 追加的 updatedAt）并按 id 稳定排序，
 * 产物可直接替换 configs/equipment/equipment.json（configs 是纯静态定义，不带运行时字段）。
 */
export function toExportableEquipment(items: EquipmentData[]): EquipmentData[] {
  const strip = (it: EquipmentData): EquipmentData => {
    const clone = { ...it } as Record<string, unknown>
    delete clone.updatedAt
    return clone as unknown as EquipmentData
  }
  return [...items].sort((a, b) => a.id.localeCompare(b.id)).map(strip)
}
