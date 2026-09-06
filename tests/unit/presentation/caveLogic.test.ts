/**
 * caveLogic.test.ts — 洞府纯逻辑层测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 材料解析、品质映射、强化数值/成功率/消耗、升星消耗、碎片合成规则零断裂引用
 */
import { describe, expect, it } from 'vitest'
import {
  catalogById,
  enhanceCost,
  enhanceMaterialOf,
  enhanceMaxByRarity,
  enhanceSuccessRate,
  formatEffect,
  fragmentRuleViews,
  itemIdByName,
  qualityOf,
  starCost,
  starFactor,
  WASH_COST_GOLD,
  WASH_MATERIALS,
  washAllowed,
} from '@/presentation/modules/yanjie/xiyou/caveLogic'

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
  it('成功率分档制（P0 裁定）：+1~+5:80 / +6~+10:70 / +11~+15:60；上限 +15，超限非法输入 clamp 最高档', () => {
    expect(enhanceSuccessRate(0)).toBe(80)
    expect(enhanceSuccessRate(1)).toBe(80)
    expect(enhanceSuccessRate(5)).toBe(80)
    expect(enhanceSuccessRate(6)).toBe(70)
    expect(enhanceSuccessRate(10)).toBe(70)
    expect(enhanceSuccessRate(11)).toBe(60)
    expect(enhanceSuccessRate(15)).toBe(60)
    expect(enhanceSuccessRate(16)).toBe(60)
    expect(enhanceSuccessRate(99)).toBe(60)
  })

  it('金钱消耗按阶位单价 × (强化前等级+1)', () => {
    expect(enhanceCost(0, 1)).toBe(20) // 凡品 0→1 花 20
    expect(enhanceCost(6, 1)).toBe(140) // 凡品 6→7 花 20×7
    expect(enhanceCost(0, 2)).toBe(50) // 玄品 0→1 花 50
    expect(enhanceCost(0, 3)).toBe(100) // 地品
    expect(enhanceCost(0, 4)).toBe(150) // 天品
    expect(enhanceCost(0, 5)).toBe(200) // 仙品
    expect(enhanceCost(14, 5)).toBe(3000) // 仙品 14→15（上限）花 200×15
  })

  it('槽位 → 强化材料映射（六槽：武器异矿 / 衣甲灵气 / 头靴符手灵水，对齐 §4.1.2）', () => {
    expect(enhanceMaterialOf('weapon')).toMatchObject({ itemId: 'mat_yikuang', count: 1 })
    expect(enhanceMaterialOf('armor')).toMatchObject({ itemId: 'mat_lingqi' })
    expect(enhanceMaterialOf('helmet')).toMatchObject({ itemId: 'mat_lingshui' })
    expect(enhanceMaterialOf('boots')).toMatchObject({ itemId: 'mat_lingshui' })
    expect(enhanceMaterialOf('charm')).toMatchObject({ itemId: 'mat_lingshui' })
    expect(enhanceMaterialOf('glove')).toMatchObject({ itemId: 'mat_lingshui' })
    expect(enhanceMaterialOf('未知槽')).toBeNull()
  })

  it('强化上限按阶位（equipment-system.json enhance_max_by_tier：凡+3/玄+6/地+9/天+12/仙+15，对齐 §21 品阶表）', () => {
    expect(enhanceMaxByRarity(1)).toBe(3) // 凡品
    expect(enhanceMaxByRarity(2)).toBe(6) // 玄品
    expect(enhanceMaxByRarity(3)).toBe(9) // 地品
    expect(enhanceMaxByRarity(4)).toBe(12) // 天品
    expect(enhanceMaxByRarity(5)).toBe(15) // 仙品
    expect(enhanceMaxByRarity(0)).toBe(3) // 越界兜底凡品
    expect(enhanceMaxByRarity(9)).toBe(3)
  })

  it('effect 文案按等级重算（数值 +4%/级，百分比保留 %）', () => {
    expect(formatEffect('攻击 +24', 6)).toBe('攻击 +30') // 24×1.24=29.76→30
    expect(formatEffect('攻击 +24', 7)).toBe('攻击 +31') // 24×1.28=30.72→31
    expect(formatEffect('气血 +3%', 5)).toBe('气血 +4%') // 3×1.2=3.6→4
    expect(formatEffect('速度 +5', 0)).toBe('速度 +5')
  })

  it('无数字的 effect 原样返回', () => {
    expect(formatEffect('未装备', 3)).toBe('未装备')
  })
})

describe('升星消耗与加成', () => {
  it('残魂点需求：每星 3 点（配置累计 3/6/9 差值），目标 0 星为 0', () => {
    expect(starCost(1)).toBe(3)
    expect(starCost(2)).toBe(3)
    expect(starCost(3)).toBe(3)
    expect(starCost(0)).toBe(0)
  })

  it('升星属性倍率：+5%/+10%/+10%（累计 5/15/25%），越界 clamp', () => {
    expect(starFactor(0)).toBe(1)
    expect(starFactor(1)).toBe(1.05)
    expect(starFactor(2)).toBe(1.15)
    expect(starFactor(3)).toBe(1.25)
    expect(starFactor(-1)).toBe(1)
    expect(starFactor(9)).toBe(1.25)
  })
})

describe('洗练权限与消耗', () => {
  it('washAllowed：凡 普通起 / 精 定向起 / 超 锁词条起（§8.4.4 洗练权限）', () => {
    expect(washAllowed('normal', 1)).toBe(true)
    expect(washAllowed('directed', 1)).toBe(false)
    expect(washAllowed('directed', 2)).toBe(true)
    expect(washAllowed('locked', 2)).toBe(false)
    expect(washAllowed('locked', 3)).toBe(true)
    expect(washAllowed('locked', 5)).toBe(true)
  })

  it('洗练材料映射（items.json 注册 ID）与统一金钱 200', () => {
    expect(WASH_MATERIALS.normal).toBe('wash_stone')
    expect(WASH_MATERIALS.directed).toBe('wash_directed')
    expect(WASH_MATERIALS.locked).toBe('wash_lock')
    expect(WASH_COST_GOLD).toBe(200)
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

  it('天罡灵气碎片 3:1 合成天罡灵气，九转金丹 5:1', () => {
    const views = fragmentRuleViews()
    const tian = views.find((v) => v.outId === 'mat_tiangang')
    expect(tian).toMatchObject({ fragId: 'mat_tiangang_suipian', need: 3, outName: '天罡灵气' })
    const jin = views.find((v) => v.outId === 'mat_jiuzhuan_jindan')
    expect(jin).toMatchObject({ fragId: 'frag_003', need: 5, outName: '九转金丹' })
  })
})
