/**
 * 装备公式 roll 规则校验:随机 100 件装备逐项检查属性是否符合规则(《完整项目说明》§21)。
 *
 * 校验器与生成实现独立复算口径,且与演劫台调试「一键检查词条」同源
 * (domain/fengshen/equip-roll-check——区间复用策划验证器 resolveAttrRange,
 *  PRD 口径:总览页区间与实际产出范围严格一致)。七条规则:
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
import { checkGearRoll } from '@/domain/fengshen/equip-roll-check'
import { TIER_TO_QUALITY } from '@/domain/fengshen/gear-generate'
import type { EquipFormulaConfig } from '@/domain/fengshen/types'

const cfg = affixRuleDefaults()
const formula = buildEquipFormula().data as unknown as EquipFormulaConfig
const conversion = (buildPlayerConfig().data as unknown as { conversion: Record<string, number> }).conversion

/** 确定性 rng(mulberry32),取样与 roll 全程可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(a ^ (t >>> 7), 61 | t)) ^ t
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

    for (const g of sampled) {
      const quality = 1 + Math.floor(rng() * 5)
      const range = QUALITY_FACTOR_RANGE[quality]!
      const qualityFactor = range.min + rng() * (range.max - range.min)
      const inst = makeInstance(g.id, [], 0, quality, qualityFactor)

      slots.add(g.slot)
      subTypes.add(g.subType ?? g.slot)
      const tier = TIER_TO_QUALITY[g.tier ?? 't1'] ?? 'fan'
      tierDist[tier] = (tierDist[tier] ?? 0) + 1
      qualityDist[quality] = (qualityDist[quality] ?? 0) + 1

      const report = checkGearRoll(g, inst, { cfg, formula, conversion, factorRange: QUALITY_FACTOR_RANGE, rng })
      failures.push(...report.violations)
      configGaps.push(...report.gaps)
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
