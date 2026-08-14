/**
 * caveLogic.test.ts — 洞府纯逻辑层测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 材料解析、品质映射、强化数值/成功率/消耗、升星消耗、碎片合成规则零断裂引用
 */
import { describe, expect, it } from 'vitest'
import {
  catalogById,
  enhanceCost,
  enhanceMaterialOf,
  enhanceSuccessRate,
  formatEffect,
  fragmentRuleViews,
  itemIdByName,
  parseMaterials,
  qualityOf,
  starCost,
} from '@/presentation/modules/yanjie/xiyou/data/caveLogic'

describe('材料解析 parseMaterials', () => {
  it('解析 "桃木×3 + 铜精×1" 为结构化列表', () => {
    const list = parseMaterials('桃木×3 + 铜精×1')
    expect(list).toEqual([
      { name: '桃木', itemId: 'mat_001', count: 3 },
      { name: '铜精', itemId: 'mat_003', count: 1 },
    ])
  })

  it('容忍西文乘号与空格差异', () => {
    expect(parseMaterials('淡水玉x2+贝壳×1')).toEqual([
      { name: '淡水玉', itemId: 'mat_004', count: 2 },
      { name: '贝壳', itemId: 'mat_005', count: 1 },
    ])
  })

  it('未收录材料 itemId 为 null（组件按不足处理，不崩溃）', () => {
    const list = parseMaterials('九尾狐尾×1')
    expect(list).toEqual([{ name: '九尾狐尾', itemId: null, count: 1 }])
  })

  it('空串返回空列表', () => {
    expect(parseMaterials('')).toEqual([])
  })
})

describe('物品索引与品质', () => {
  it('name → id 同名取首注册（竹剑 → 制造产出 wp_t1_light_01）', () => {
    expect(itemIdByName('竹剑')).toBe('wp_t1_light_01')
    expect(itemIdByName('鹿皮甲')).toBe('ar_t1_light_01')
  })

  it('rarity 1-5 → 凡/玄/地/天/仙', () => {
    expect(qualityOf('wp_t1_light_01')).toBe('凡品') // 竹剑 rarity 1
    expect(qualityOf('wp_t2_light_01')).toBe('玄品') // 迅风剑 rarity 2
    expect(qualityOf('wp_t3_light_01')).toBe('地品') // 流云剑 rarity 3
    expect(qualityOf('wp_t4_01')).toBe('天品') // 牛魔撼天锤 rarity 4
    expect(qualityOf('wp_t5_01')).toBe('仙品') // 混元无极环 rarity 5
  })

  it('未知 id 兜底凡品不抛错', () => {
    expect(qualityOf('no_such_item')).toBe('凡品')
    expect(catalogById('no_such_item')).toBeUndefined()
  })
})

describe('强化数值', () => {
  it('成功率随等级递减，地板 50%', () => {
    expect(enhanceSuccessRate(0)).toBe(100)
    expect(enhanceSuccessRate(6)).toBe(70)
    expect(enhanceSuccessRate(10)).toBe(50)
    expect(enhanceSuccessRate(99)).toBe(50)
  })

  it('金钱消耗随等级递增', () => {
    expect(enhanceCost(0)).toBe(20)
    expect(enhanceCost(6)).toBe(140)
  })

  it('槽位 → 强化材料映射', () => {
    expect(enhanceMaterialOf('武器')).toMatchObject({ itemId: 'mat_enh_01', count: 1 })
    expect(enhanceMaterialOf('衣服')).toMatchObject({ itemId: 'mat_enh_03' })
    expect(enhanceMaterialOf('护符')).toMatchObject({ itemId: 'mat_enh_02' })
    expect(enhanceMaterialOf('未知槽')).toBeNull()
  })

  it('effect 文案按等级重算（数值 +5%/级，百分比保留 %）', () => {
    expect(formatEffect('攻击 +24', 6)).toBe('攻击 +31') // 24×1.3=31.2→31
    expect(formatEffect('攻击 +24', 7)).toBe('攻击 +32') // 24×1.35=32.4→32
    expect(formatEffect('气血 +3%', 5)).toBe('气血 +4%') // 3×1.25=3.75→4
    expect(formatEffect('速度 +5', 0)).toBe('速度 +5')
  })

  it('无数字的 effect 原样返回', () => {
    expect(formatEffect('未装备', 3)).toBe('未装备')
  })
})

describe('升星消耗', () => {
  it('0 星 1 颗，逐星 +1', () => {
    expect(starCost(0)).toBe(1)
    expect(starCost(1)).toBe(2)
    expect(starCost(4)).toBe(5)
  })
})

describe('碎片合成规则', () => {
  it('全部规则产出物品在 items.json 中存在（零断裂引用）', () => {
    const views = fragmentRuleViews()
    expect(views).toHaveLength(4)
    for (const v of views) {
      expect(catalogById(v.fragId)).toBeDefined()
      expect(catalogById(v.outId)).toBeDefined()
      expect(v.need).toBeGreaterThan(0)
    }
  })

  it('天罡灵气碎片 10:1 合成天罡灵气，九转金丹 5:1', () => {
    const views = fragmentRuleViews()
    const tian = views.find((v) => v.outId === 'ess_002')
    expect(tian).toMatchObject({ fragId: 'frag_001', need: 10, outName: '天罡灵气' })
    const jin = views.find((v) => v.outId === 'elix_007')
    expect(jin).toMatchObject({ fragId: 'frag_003', need: 5, outName: '九转金丹' })
  })
})
