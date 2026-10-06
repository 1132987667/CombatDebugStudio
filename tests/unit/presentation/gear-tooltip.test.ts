/**
 * gear-tooltip.test.ts — 装备悬浮卡组装测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 强化/星级行 0 值隐藏、属性行 roll 范围（与生成口径一致：核心条乘品质系数×养成倍率）
 */
import { describe, expect, it } from 'vitest'
import { gearTooltipData, type GearTooltipSource } from '@/presentation/modules/yanjie/xiyou/gearTooltip'
import type { GearInstance } from '@/presentation/stores/packStore'
import type { EquipmentStatEntry } from '@/domain/fengshen/types'
import { attrShortName } from '@/domain/fengshen/equipment-overview'

const makeInst = (over: Partial<GearInstance> = {}): GearInstance => ({
  instanceId: 'i1',
  itemId: 'wp_t1_light_01',
  enhance: 0,
  quality: 3,
  qualityFactor: 1.1,
  star: 0,
  stats: [{ attribute: 'attack', modifierType: 'flat', value: 69 }],
  affixes: [
    { id: 'comboRate', attribute: 'comboRate', modifierType: 'percent', value: 2.6, fixed: true },
    { id: 'hitBonus', attribute: 'hitBonus', modifierType: 'percent', value: 1.5, main: true },
    { id: 'attack', attribute: 'attack', modifierType: 'flat', value: 20 },
  ],
  ...over,
})

const source: GearTooltipSource = {
  gearById: (id) => ({ slot: 'weapon', subType: 'sword', tier: 't1', itemLevel: 7, description: '削竹为剑' }),
  instanceStatGroups: (g) => ({
    core: g.stats,
    main: g.affixes.filter((a) => a.fixed || a.main).map((a) => ({ attribute: a.attribute, modifierType: a.modifierType, value: a.value })),
    extra: g.affixes.filter((a) => !a.fixed && !a.main).map((a) => ({ attribute: a.attribute, modifierType: a.modifierType, value: a.value })),
  }),
  subTypeLabel: () => '剑',
}

const detailLabels = (data: ReturnType<typeof gearTooltipData>): Set<string> =>
  new Set(data.details.filter((d) => !('section' in d && d.section)).map((d) => d.label))

const detailValue = (data: ReturnType<typeof gearTooltipData>, label: string): string | undefined =>
  data.details.find((d) => d.label === label && !('section' in d && d.section))?.value

describe('gearTooltip 悬浮卡组装', () => {
  it('强化/星级 0 值不显示行（与卡片 0 值不占位口径一致）', () => {
    const labels = detailLabels(gearTooltipData(source, {}, makeInst()))
    expect(labels.has('强化')).toBe(false)
    expect(labels.has('星级')).toBe(false)
    // 品质恒显
    expect(labels.has('品质')).toBe(true)
  })

  it('强化/星级 > 0 显示 +N 行', () => {
    const labels = detailLabels(gearTooltipData(source, {}, makeInst({ enhance: 2, star: 1 })))
    expect(detailValue(gearTooltipData(source, {}, makeInst({ enhance: 2, star: 1 })), '强化')).toBe('+2')
    expect(detailValue(gearTooltipData(source, {}, makeInst({ enhance: 2, star: 1 })), '星级')).toBe('+1（全属性 +5%）')
    expect(labels.has('强化')).toBe(true)
  })

  it('属性行显示当前值 + roll 范围，词条不吃养成倍率（affix scale=1）', () => {
    const data = gearTooltipData(source, {}, makeInst({ enhance: 2, star: 1 }))
    const affix = detailValue(data, attrShortName('comboRate'))
    // 附加/主要词条范围 = 品阶 × 浮动外包络，不随强化/星级放大：固定 +2.6% 当前值 + 非零区间
    expect(affix).toMatch(/^\+2\.6%（\d+(\.\d+)?~\d+(\.\d+)?%）$/)
    const core = detailValue(data, attrShortName('attack'))
    // 核心条范围乘品质系数 × 养成倍率（enhanceFactor(2) × starFactor(1) = 1.08 × 1.05），数值随养成放大
    expect(core).toMatch(/^\+69（\d+~\d+）$/)
  })

  it('主要属性组正常显示（fixed/main 词条归主要组）', () => {
    const data = gearTooltipData(source, {}, makeInst())
    const sections = data.details.filter((d) => 'section' in d && d.section).map((d) => d.label)
    expect(sections).toContain('核心属性')
    expect(sections).toContain('主要属性')
    expect(sections).toContain('附加属性')
  })
})
