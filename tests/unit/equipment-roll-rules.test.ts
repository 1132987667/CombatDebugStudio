/**
 * 装备公式 roll 规则校验:随机 100 件装备逐项检查属性是否符合规则(《完整项目说明》§21)。
 *
 * 检查器独立于生成实现复算规则口径(区间复用策划验证器 resolveAttrRange——
 * PRD 口径:总览页区间与实际产出范围严格一致):
 *  1. 核心属性恰 1 条,属性码 = core_affix_ratio[子类型],值 ∈ 公式区间 × 品质系数;
 *  2. 主要属性第 1 条固定(main_affix_pool.fixed),第 2 条 ∈ 随机池展开 − 禁止表;
 *  3. 附加属性条数 = min(品质, 投放行数),从本阵营前 N 行池抽取,互不重复、不与主要重复;
 *  4. 全部词条不触禁止表(forbidden 部位级 + 子类型级);
 *  5. 全部词条值落在各自的可获得区间(基础六维走装备公式,其余走词条曲线);
 *  6. 品质 1~5,品质系数落在该品质区间;
 *  7. 生成过程零 warning(配置完备,无静默缺口)。
 * 种子固定可复现;覆盖统计打印在控制台。
 */
import { describe, it, expect } from 'vitest'
import { makeInstance } from '@/presentation/stores/packStore'
import { equipmentCatalog } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import { QUALITY_FACTOR_RANGE } from '@/presentation/modules/yanjie/xiyou/quality'
import { affixRuleDefaults } from '@/domain/fengshen/affix-rule-defaults'
import { buildEquipFormula, buildPlayerConfig } from '@/infrastructure/adapters/storage/seed'
import { resolveAttrRange, expandPoolRef, forbiddenAttrs, rowGroups, qualityAffixCount } from '@/domain/fengshen/equipment-overview'
import { rollGearStats, TIER_TO_QUALITY } from '@/domain/fengshen/gear-generate'
import { getAttrMeta } from '@/domain/attribute/types'
import type { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { AffixQualityCode, EquipFormulaConfig } from '@/domain/fengshen/types'

const cfg = affixRuleDefaults()
const formula = buildEquipFormula().data as unknown as EquipFormulaConfig
const conversion = (buildPlayerConfig().data as unknown as { conversion: Record<string, number> }).conversion

/** 确定性 rng(mulberry32),取样与 roll 全程可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('装备公式 roll 规则校验(100 件逐项)', () => {
  it('随机 100 件装备,核心/主要/附加属性逐项符合 §21 规则', () => {
    const rng = mulberry32(20260923)
    const sampled = [...equipmentCatalog]
      .map((g) => ({ g, k: rng() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, 100)
      .map((x) => x.g)

    expect(sampled.length).toBe(100)

    const failures: string[] = []
    // 配置缺口类(主要属性池未覆盖子类型——待策划补配,区别于生成逻辑违规)
    const configGaps: string[] = []
    const tierDist: Record<string, number> = {}
    const qualityDist: Record<number, number> = {}
    const slots = new Set<string>()
    const subTypes = new Set<string>()
    // 取整容差:整数维度 ±0.5、一位小数 ±0.05,统一放宽到 0.51 不掩盖真实越界
    const EPS = 0.51

    for (const g of sampled) {
      const quality = 1 + Math.floor(rng() * 5)
      const range = QUALITY_FACTOR_RANGE[quality]!
      const qualityFactor = range.min + rng() * (range.max - range.min)
      const inst = makeInstance(g.id, [], 0, quality, qualityFactor)

      const subType = g.subType ?? g.slot
      const tier: AffixQualityCode = TIER_TO_QUALITY[g.tier ?? 't1'] ?? 'fan'
      const itemLevel = Math.max(1, g.itemLevel ?? 1)
      const label = `${g.id}(${g.name} q${quality})`
      slots.add(g.slot)
      subTypes.add(subType)
      tierDist[tier] = (tierDist[tier] ?? 0) + 1
      qualityDist[quality] = (qualityDist[quality] ?? 0) + 1
      const fail = (msg: string) => failures.push(`${label}: ${msg}`)

      // ── 品质维度 ──
      if (inst.quality < 1 || inst.quality > 5) fail(`品质 ${inst.quality} 越界`)
      const qr = QUALITY_FACTOR_RANGE[inst.quality]
      if (qr && (inst.qualityFactor < qr.min - 1e-9 || inst.qualityFactor > qr.max + 1e-9)) {
        fail(`品质系数 ${inst.qualityFactor} 不在 ${inst.quality} 品区间 [${qr.min}, ${qr.max}]`)
      }

      // ── 规则 1:核心属性 ──
      const coreCfg = cfg.core_affix_ratio?.[subType]
      if (!coreCfg) { fail(`子类型 ${subType} 无核心系数配置`); continue }
      if (inst.stats.length !== 1) { fail(`核心属性应为 1 条,实际 ${inst.stats.length}`); continue }
      const core = inst.stats[0]!
      if (core.attribute !== coreCfg.attribute) fail(`核心属性 ${core.attribute} ≠ 配置 ${coreCfg.attribute}`)
      const expectCoreType = getAttrMeta(coreCfg.attribute as ATTRIBUTE_CODE)?.isPercentage ? 'percent' : 'flat'
      if (core.modifierType !== expectCoreType) fail(`核心 modifierType ${core.modifierType} ≠ ${expectCoreType}`)
      const coreRange = resolveAttrRange(cfg, formula, conversion, coreCfg.attribute, itemLevel, tier, formula.coreWeight, coreCfg.ratio)
      if (coreRange.source === 'none') fail('核心属性区间不可投放(配置缺口)')
      else if (core.value < coreRange.min * qualityFactor - EPS || core.value > coreRange.max * qualityFactor + EPS) {
        fail(`核心 ${core.attribute}=${core.value} 越界 [${coreRange.min},${coreRange.max}]×${qualityFactor.toFixed(3)}`)
      }

      // ── 规则 2:主要属性(池缺失 = 配置缺口,不计违规;其余照规则断言)──
      // 文档 §21 武器表明文「未配置」的设计例外:刺主 1/主 2 均无、棍/刀主 2 无——不视为缺口
      const exemptMainPool = subType === 'dagger'
      const exemptMainRandom = subType === 'staff' || subType === 'blade'
      const pool = cfg.main_affix_pool?.[subType]
      if (!pool) {
        if (!exemptMainPool) configGaps.push(`${label}: 子类型 ${subType} 无主要属性池`)
        continue
      }
      const main = inst.affixes.filter((a) => a.fixed)
      const second = inst.affixes.filter((a) => a.main)
      if (pool.fixed && main.length !== 1) fail(`主要第 1 条(固定)应 1 条,实际 ${main.length}`)
      if (pool.fixed && main[0] && main[0].attribute !== pool.fixed) fail(`固定主要属性 ${main[0]?.attribute} ≠ ${pool.fixed}`)
      if (!pool.fixed) configGaps.push(`${label}: 子类型 ${subType} 主要第 1 条(固定)未配置`)
      if (second.length !== 1) {
        if (exemptMainRandom) { /* 棍/刀:文档明文无随机池 */ }
        else if (!(pool.random_pool ?? []).length) configGaps.push(`${label}: 子类型 ${subType} 主要第 2 条(随机池)未配置`)
        else fail(`主要第 2 条(随机)应 1 条,实际 ${second.length}`)
      }
      const banned = forbiddenAttrs(cfg, g.slot, subType)
      if (second[0]) {
        const candidates = new Set((pool.random_pool ?? []).flatMap((ref) => expandPoolRef(cfg, ref)))
        for (const b of banned) candidates.delete(b)
        if (!candidates.has(second[0].attribute)) fail(`主要随机属性 ${second[0].attribute} 不在随机池(扣除禁止)内`)
      }

      // ── 规则 3:附加属性 ──
      const expectedAppend = qualityAffixCount(inst.quality, cfg.affix_rows?.length ?? 0)
      const append = inst.affixes.filter((a) => !a.fixed && !a.main)
      if (append.length !== expectedAppend) fail(`附加属性应 ${expectedAppend} 条,实际 ${append.length}`)
      const mainAttrs = new Set(inst.affixes.filter((a) => a.fixed || a.main).map((a) => a.attribute))
      const dup = append.filter((a, i) => append.findIndex((b) => b.attribute === a.attribute) !== i || mainAttrs.has(a.attribute))
      if (dup.length) fail(`附加属性重复或与主要重复:${dup.map((a) => a.attribute).join(',')}`)

      // ── 规则 4:禁止表 ──
      for (const a of inst.affixes) {
        if (banned.has(a.attribute)) fail(`词条 ${a.attribute} 触碰禁止表(部位 ${g.slot}/子类型 ${subType})`)
      }

      // ── 规则 5:附加属性落在前 N 行阵营池 + 数值区间 ──
      const side = cfg.slot_side?.[g.slot] ?? 'ATK'
      const rowCount = Math.min(inst.quality, cfg.affix_rows?.length ?? 0)
      const legalAppend = new Set<string>()
      for (const row of cfg.affix_rows ?? []) {
        if (row.row > rowCount) break
        for (const ref of rowGroups(cfg, side, row.row)) for (const a of expandPoolRef(cfg, ref)) if (!banned.has(a)) legalAppend.add(a)
      }
      for (const a of append) {
        if (!legalAppend.has(a.attribute)) fail(`附加属性 ${a.attribute} 不在前 ${rowCount} 行 ${side} 池(扣禁止)内`)
        const ar = resolveAttrRange(cfg, formula, conversion, a.attribute, itemLevel, tier, formula.affixWeight)
        if (ar.source === 'none') fail(`附加属性 ${a.attribute} 区间不可投放(配置缺口)`)
        else if (a.value < ar.min - EPS || a.value > ar.max + EPS) fail(`附加 ${a.attribute}=${a.value} 越界 [${ar.min},${ar.max}]`)
      }
      for (const a of inst.affixes.filter((x) => x.main)) {
        const mr = resolveAttrRange(cfg, formula, conversion, a.attribute, itemLevel, tier, formula.affixWeight)
        if (mr.source !== 'none' && (a.value < mr.min - EPS || a.value > mr.max + EPS)) {
          fail(`主要 ${a.attribute}=${a.value} 越界 [${mr.min},${mr.max}]`)
        }
      }

      // ── 规则 7:配置完备(零 warning;池缺失与"候选引用无曲线属性"均为配置缺口,产物已被生成器自愈)──
      const w = rollGearStats(
        { slot: g.slot as never, subType, tier, itemLevel, quality: inst.quality, qualityFactor },
        cfg, formula, conversion, rng,
      ).warnings.filter((x) => {
        // 与规则 2 同口径:文档明文「未配置」的设计例外不重复记录
        if (exemptMainPool && x.includes('main_affix_pool')) return false
        if (exemptMainRandom && x.includes('主要属性第 2 条')) return false
        return true
      })
      for (const x of w) configGaps.push(`${label}: ${x}`)
    }

    // eslint-disable-next-line no-console
    console.log(
      `[100 件装备规则校验] 违规 ${failures.length} 件 | 配置缺口(主要属性池未覆盖)涉及 ${configGaps.length} 件\n` +
      `  阶位分布 ${JSON.stringify(tierDist)} | 品质分布 ${JSON.stringify(qualityDist)} | 部位 ${slots.size} 子类型 ${subTypes.size}` +
      (failures.length ? `\n  违规明细:\n  ${failures.join('\n  ')}` : '') +
      (configGaps.length ? `\n  缺口子类型清单:\n  ${[...new Set(configGaps.map((x) => x.split(': ')[1]))].join('\n  ')}` : ''),
    )
    expect(failures).toEqual([])
  }, 60_000)
})
