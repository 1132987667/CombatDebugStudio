// @vitest-environment happy-dom
/**
 * player-progress.test.ts — 战斗经济闭环（W16）：经验入账与升级、金币入账、掉落数据源
 *                       敌方参战者（R22 敌人数据加载）与难度倍率（R19）、通关解锁链（V08）
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import equipmentAffixesJson from '@configs/equipment/equipment-affixes.json'
import {
  buildEnemyTeam,
  dropsForScene,
  markSceneCleared,
  rewardForScene,
  scenes,
} from '@/presentation/modules/yanjie/xiyou/data/mock'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('经验与升级（gainExp）', () => {
  it('未达阈值不升级，仅累计经验', () => {
    const player = usePlayerStore()
    const expBefore = player.player.exp
    const leveled = player.gainExp(10)
    expect(leveled).toBe(0)
    expect(player.player.level).toBe(5)
    expect(player.player.exp).toBe(expBefore + 10)
  })

  it('越过阈值升级：等级 +1、经验顺延、属性成长、回满血', () => {
    const player = usePlayerStore()
    const need = player.player.expNeed
    const gap = Math.max(1, need - player.player.exp)
    const maxHpBefore = player.player.maxHp
    player.player.hp = 1
    const leveled = player.gainExp(gap + 1)
    expect(leveled).toBeGreaterThanOrEqual(1)
    expect(player.player.level).toBeGreaterThanOrEqual(6)
    expect(player.player.maxHp).toBeGreaterThan(maxHpBefore)
    expect(player.player.hp).toBe(player.player.maxHp) // 升级回满血
    expect(player.player.exp).toBeLessThan(player.player.expNeed)
  })

  it('金币入账（gainCurrency）', () => {
    const player = usePlayerStore()
    player.gainCurrency('copper', 100)
    expect(player.currency.copper).toBe(12880 + 100)
    player.gainCurrency('copper', 0) // 非正值忽略
    expect(player.currency.copper).toBe(12880 + 100)
  })
})

describe('掉落与奖励数据源（configs/enemies/enemies.json）', () => {
  it('scene_1_1 敌人按 id 关联掉落（花妖幼芽 → 桃木），奖励区间为正', () => {
    const s1 = scenes.find((s) => s.id === 'scene_1_1')
    expect(s1).toBeDefined()
    const drops = dropsForScene(s1!)
    expect(drops.length).toBeGreaterThan(0)
    expect(drops.some((d) => d.itemId === 'mat_taomu')).toBe(true)
    const reward = rewardForScene(s1!)
    expect(reward.exp[1]).toBeGreaterThan(0)
    expect(reward.gold[1]).toBeGreaterThan(0)
  })

  it('未知敌人 id 不掉落、无奖励', () => {
    const fake = { id: 'scene_x', regionId: 'r', name: 'x', desc: '', enemies: [{ id: 'ghost_enemy', name: '鬼', level: 1 }], unlocked: true, difficulty: 'easy' as const, stars: 0, maxStars: 3 }
    expect(dropsForScene(fake)).toEqual([])
    expect(rewardForScene(fake)).toEqual({ gold: [0, 0], exp: [0, 0] })
  })

  it('boots 词条唯一组合 ≥5，支撑神品 5 条词缀抽满（P0-3）', () => {
    const combos = new Set<string>()
    for (const a of (equipmentAffixesJson as Array<{ attribute: string; modifierType: string; applicableSlots: string[] }>)) {
      if (a.applicableSlots.some((k) => k === 'boots' || k.startsWith('boots:'))) {
        combos.add(`${a.attribute}:${a.modifierType}`)
      }
    }
    expect(combos.size).toBeGreaterThanOrEqual(5)
  })
})

describe('敌方参战者（R22 敌人数据加载）与难度倍率（R19）', () => {
  it('buildEnemyTeam 从 enemies.json 按 id 读取属性（scene_1_1 花妖幼芽 82 血，easy 倍率 1）', () => {
    const s1 = scenes.find((s) => s.id === 'scene_1_1')
    expect(s1).toBeDefined()
    const enemy = buildEnemyTeam(s1!)
    expect(enemy.length).toBe(3)
    const hua = enemy.find((e) => e.name === '花妖幼芽')
    expect(hua).toBeDefined()
    expect(hua!.getAttribute(ATTRIBUTE_CODE.maxHealth)).toBe(82)
    expect(hua!.getAttribute(ATTRIBUTE_CODE.attack)).toBe(11)
  })

  it('难度倍率：普通 ×1.5 / 困难 ×2（作用于主要数值属性）', () => {
    const s1 = scenes.find((s) => s.id === 'scene_1_1')!
    const normal = buildEnemyTeam({ ...s1, difficulty: 'normal' })
    const hard = buildEnemyTeam({ ...s1, difficulty: 'hard' })
    const n = normal.find((e) => e.name === '花妖幼芽')!
    const h = hard.find((e) => e.name === '花妖幼芽')!
    expect(n.getAttribute(ATTRIBUTE_CODE.maxHealth)).toBe(Math.round(82 * 1.5))
    expect(n.getAttribute(ATTRIBUTE_CODE.attack)).toBe(Math.round(11 * 1.5))
    expect(h.getAttribute(ATTRIBUTE_CODE.maxHealth)).toBe(82 * 2)
  })

  it('critDamage 百分制 → 引擎比例（120 → 1.2）', () => {
    const s1 = scenes.find((s) => s.id === 'scene_1_1')!
    const enemy = buildEnemyTeam(s1)
    const hua = enemy.find((e) => e.name === '花妖幼芽')!
    expect(hua.getAttribute(ATTRIBUTE_CODE.critDamage)).toBe(1.2)
  })

  it('buildEnemyTeam 注入敌人技能（enemy-skills.json 分桶，P0-1）', () => {
    const s1 = scenes.find((s) => s.id === 'scene_1_1')!
    const enemy = buildEnemyTeam(s1)
    const hua = enemy.find((e) => e.name === '花妖幼芽')!
    // 花粉喷射：skillType=small → skills.small
    expect(hua.skills.small.some((s) => s.id === 'skill_enemy_s1_1_a_s1')).toBe(true)
    // BOSS：大招归 ultimate、被动归 passive
    const boss = scenes.find((s) => s.id === 'scene_1_boss')!
    const bossTeam = buildEnemyTeam(boss)
    const b = bossTeam[0]
    expect(b.skills.ultimate.some((s) => s.id === 'skill_boss_major_huayaowang_ult')).toBe(true)
    expect(b.skills.passive.some((s) => s.id === 'passive_boss_major_huayaowang_p1')).toBe(true)
  })
})

describe('通关解锁链（markSceneCleared，V08）', () => {
  it('通关 scene_1_1 解锁 scene_1_2（clear_scene 前置）', () => {
    const s1 = scenes.find((s) => s.id === 'scene_1_1')!
    const s2 = scenes.find((s) => s.id === 'scene_1_2')!
    const before = s2.unlocked
    try {
      markSceneCleared(s1.id)
      expect(s1.unlocked).toBe(true)
      expect(s2.unlocked).toBe(true)
      // 非依赖关卡不受影响
      const s3 = scenes.find((s) => s.id === 'scene_1_3')!
      expect(s3.unlocked).toBe(false)
    } finally {
      s2.unlocked = before
    }
  })

  it('BOSS 关卡解锁链：通关 1_5 → 1_boss → 通关 1_boss → 2_1（P0-2）', () => {
    const s15 = scenes.find((s) => s.id === 'scene_1_5')!
    const s1b = scenes.find((s) => s.id === 'scene_1_boss')!
    const s21 = scenes.find((s) => s.id === 'scene_2_1')!
    const b1 = s1b.unlocked
    const b2 = s21.unlocked
    try {
      expect(s1b).toBeDefined()
      expect(s21.unlockCondition?.sceneId).toBe('scene_1_boss')
      expect(s1b.unlocked).toBe(false)
      expect(s21.unlocked).toBe(false)
      markSceneCleared(s15.id)
      expect(s1b.unlocked).toBe(true)
      markSceneCleared(s1b.id)
      expect(s21.unlocked).toBe(true)
    } finally {
      s1b.unlocked = b1
      s21.unlocked = b2
    }
  })
})
