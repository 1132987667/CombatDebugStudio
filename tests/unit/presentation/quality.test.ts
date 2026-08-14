/**
 * quality.test.ts — 稀有度/品质统一映射表测试（方案 4）
 * 覆盖：品级映射（rarityToQuality）、词缀品质映射（affixQuality）、兜底逻辑、
 *       以及「数据层统一数字 rarity」的配置一致性（pack/mate/equip/cultivate 全数字档）。
 */
import { describe, expect, it } from 'vitest'
import { AFFIX_QUALITY, RARITY_TO_QUALITY, migrateRarityField, qualityClass, qualityOf } from '@/presentation/modules/yanjie/xiyou/data/quality'
import packJson from '@configs/xiyou/pack.json'
import mateJson from '@configs/xiyou/mate.json'
import equipJson from '@configs/xiyou/equip.json'
import cultivateJson from '@configs/xiyou/cultivate.json'

describe('品级映射 RARITY_TO_QUALITY', () => {
  it('rarity 1-5 → 凡品/玄品/地品/天品/仙品', () => {
    expect(RARITY_TO_QUALITY[1]).toBe('凡品')
    expect(RARITY_TO_QUALITY[2]).toBe('玄品')
    expect(RARITY_TO_QUALITY[3]).toBe('地品')
    expect(RARITY_TO_QUALITY[4]).toBe('天品')
    expect(RARITY_TO_QUALITY[5]).toBe('仙品')
  })

  it('qualityOf 边界兜底凡品（未知/越界不抛错）', () => {
    expect(qualityOf(0)).toBe('凡品')
    expect(qualityOf(6)).toBe('凡品')
    expect(qualityOf(Number.NaN)).toBe('凡品')
  })

  it('qualityClass 生成 xy-q-- 品级类', () => {
    expect(qualityClass(1)).toBe('xy-q--凡品')
    expect(qualityClass(5)).toBe('xy-q--仙品')
  })
})

describe('词缀品质映射 AFFIX_QUALITY', () => {
  it('1-5 → 凡/精/超/绝/神', () => {
    expect(AFFIX_QUALITY[1]).toBe('凡')
    expect(AFFIX_QUALITY[2]).toBe('精')
    expect(AFFIX_QUALITY[3]).toBe('超')
    expect(AFFIX_QUALITY[4]).toBe('绝')
    expect(AFFIX_QUALITY[5]).toBe('神')
  })
})

describe('旧版数据迁移 migrateRarityField', () => {
  it('quality 中文品级 → 数字 rarity，删除旧字段', () => {
    const row: Record<string, unknown> = { name: '八戒', quality: '天品' }
    expect(migrateRarityField(row)).toBe(true)
    expect(row).toEqual({ name: '八戒', rarity: 4 })
  })

  it('tier 中文品级（法宝旧字段）→ 数字 rarity', () => {
    const row: Record<string, unknown> = { name: '芭蕉扇', tier: '地品' }
    expect(migrateRarityField(row)).toBe(true)
    expect(row).toEqual({ name: '芭蕉扇', rarity: 3 })
  })

  it('已是数字 rarity 原样返回（不迁移）', () => {
    const row: Record<string, unknown> = { name: '孙小圣', rarity: 5 }
    expect(migrateRarityField(row)).toBe(false)
    expect(row).toEqual({ name: '孙小圣', rarity: 5 })
  })

  it('无品级字段/未知值不迁移', () => {
    expect(migrateRarityField({ name: 'x' })).toBe(false)
    expect(migrateRarityField({ name: 'x', quality: '精' })).toBe(false)
  })
})

describe('数据层统一：configs 全数字 rarity', () => {
  it('pack.json 各组 rarity 均为 1-4 数字（不再有中文 4 档）', () => {
    const groups = [
      packJson.materials,
      packJson.equipment,
      packJson.pills,
      packJson.consumables,
    ]
    const items = groups.flat() as Array<{ rarity: unknown }>
    expect(items.length).toBeGreaterThan(0)
    for (const it of items) {
      expect(typeof it.rarity).toBe('number')
      expect(it.rarity).toBeGreaterThanOrEqual(1)
      expect(it.rarity).toBeLessThanOrEqual(4)
    }
  })

  it('mate/equip/cultivate 品级字段为 rarity 数字 1-5（无中文 quality/tier）', () => {
    const check = (rows: Array<{ rarity: unknown }>, max = 5): void => {
      for (const row of rows) {
        expect(typeof row.rarity).toBe('number')
        expect(row.rarity).toBeGreaterThanOrEqual(1)
        expect(row.rarity).toBeLessThanOrEqual(max)
      }
    }
    check(mateJson.mates as Array<{ rarity: unknown }>)
    check(mateJson.pets as Array<{ rarity: unknown }>)
    check(equipJson.gearSlots as Array<{ rarity: unknown }>)
    check(equipJson.treasures as Array<{ rarity: unknown }>)
    check(equipJson.mounts as Array<{ rarity: unknown }>)
    check(cultivateJson.martialArts as Array<{ rarity: unknown }>)
  })
})
