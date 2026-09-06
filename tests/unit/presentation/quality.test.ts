/**
 * quality.test.ts — 稀有度/品质统一映射表测试（方案 4）
 * 覆盖：品级映射（RARITY_NAMES）、品质映射（QUALITY_NAMES）、兜底逻辑、
 *       以及「数据层统一数字 rarity」的配置一致性（pack/mate/equip/cultivate 全数字档）。
 */
import { describe, expect, it } from 'vitest'
import {
  QUALITY_NAMES,
  QUALITY_FACTOR,
  QUALITY_FACTOR_RANGE,
  RARITY_NAMES,
  affixCountByQuality,
  migrateRarityField,
  qualityClass,
  qualityFactorOf,
  qualityName,
  qualityOf,
  rollQuality,
  rollQualityFactor,
} from '@/presentation/modules/yanjie/xiyou/quality'
import packJson from '@configs/xiyou/pack.json'
import mateJson from '@configs/xiyou/mate.json'
import equipJson from '@configs/xiyou/equip.json'

describe('品级映射 RARITY_NAMES', () => {
  it('rarity 1-5 → 凡品/玄品/地品/天品/仙品', () => {
    expect(RARITY_NAMES[1]).toBe('凡品')
    expect(RARITY_NAMES[2]).toBe('玄品')
    expect(RARITY_NAMES[3]).toBe('地品')
    expect(RARITY_NAMES[4]).toBe('天品')
    expect(RARITY_NAMES[5]).toBe('仙品')
  })

  it('qualityOf 边界兜底凡品（未知/越界不抛错）', () => {
    expect(qualityOf(0)).toBe('凡品')
    expect(qualityOf(6)).toBe('凡品')
    expect(qualityOf(Number.NaN)).toBe('凡品')
  })

  it('qualityClass 生成 xy-q-- 数字品级类（不用中文类名）', () => {
    expect(qualityClass(1)).toBe('xy-q--1')
    expect(qualityClass(5)).toBe('xy-q--5')
  })
})

describe('品质映射 QUALITY_NAMES', () => {
  it('1-5 → 凡/精/超/绝/神', () => {
    expect(QUALITY_NAMES[1]).toBe('凡')
    expect(QUALITY_NAMES[2]).toBe('精')
    expect(QUALITY_NAMES[3]).toBe('超')
    expect(QUALITY_NAMES[4]).toBe('绝')
    expect(QUALITY_NAMES[5]).toBe('神')
  })

  it('qualityName 兜底凡', () => {
    expect(qualityName(0)).toBe('凡')
    expect(qualityName(9)).toBe('凡')
  })
})

describe('品质体系落地（设计稿 §5：品质决定系数 80%-150% 与词条数量 1/2/3/4/5）', () => {
  it('品质系数区间中值：凡 0.85 … 神 1.455（旧档/未锁存实例兜底）', () => {
    expect(QUALITY_FACTOR[1]).toBe(0.85)
    expect(QUALITY_FACTOR[2]).toBe(0.98)
    expect(QUALITY_FACTOR[3]).toBe(1.13)
    expect(QUALITY_FACTOR[4]).toBe(1.305)
    expect(QUALITY_FACTOR[5]).toBe(1.455)
    expect(qualityFactorOf(1)).toBe(0.85)
    expect(qualityFactorOf(9)).toBe(0.85) // 越界兜底凡品
  })

  it('品质系数区间：凡 0.8-0.9 … 神 1.41-1.5，roll 落在区间内且锁存', () => {
    expect(QUALITY_FACTOR_RANGE[1]).toEqual({ min: 0.8, max: 0.9 })
    expect(QUALITY_FACTOR_RANGE[5]).toEqual({ min: 1.41, max: 1.5 })
    // rng 贴 0 → 区间下限；rng 贴 1 → 区间上限
    expect(rollQualityFactor(1, () => 0)).toBe(0.8)
    expect(rollQualityFactor(1, () => 1)).toBe(0.9)
    expect(rollQualityFactor(3, () => 0.5)).toBe(1.13)
    // 未知品质兜底凡品区间
    expect(rollQualityFactor(9, () => 0)).toBe(0.8)
  })

  it('词条数量按品质：凡 1 / 精 2 / 超 3 / 绝 4 / 神 5', () => {
    expect(affixCountByQuality(1)).toBe(1)
    expect(affixCountByQuality(2)).toBe(2)
    expect(affixCountByQuality(3)).toBe(3)
    expect(affixCountByQuality(4)).toBe(4)
    expect(affixCountByQuality(5)).toBe(5)
    expect(affixCountByQuality(0)).toBe(1)
    expect(affixCountByQuality(9)).toBe(5)
  })

  it('rollQuality 按阶位：天品固定绝、仙品固定神', () => {
    expect(rollQuality(4, () => 0)).toBe(4)
    expect(rollQuality(5, () => 0.99)).toBe(5)
  })

  it('rollQuality 凡/玄/地品加权随机在 1-3 内，阶位越高品质越高概率越大', () => {
    // rng 贴 0 → 权重表首位（凡品）
    expect(rollQuality(1, () => 0)).toBe(1)
    expect(rollQuality(3, () => 0.3)).toBe(2) // 地品权重 [10,50,40]，rng=0.3 落在「精」
    expect(rollQuality(3, () => 0.99)).toBe(3) // 地品权重表累进到「超」
    expect(rollQuality(0, () => 0)).toBe(1) // 越界兜底凡品
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

  it('mate/equip 品级字段为 rarity 数字 1-5（无中文 quality/tier）', () => {
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
  })
})
