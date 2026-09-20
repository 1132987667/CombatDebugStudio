/**
 * tower.test.ts — 无尽塔（挑战层，PRD §31 Beta）单元自检
 *
 * 覆盖：
 * - 层编成确定性（同层同编成）、层≈等级带直映、BOSS 层 role 模式
 * - 隐藏层 51（51~60 级妖尊镇守，通关 50 层解锁）
 * - 奖励节点表（§22 灵尘/器灵、§18 突破丹叁的 PRD 来源；首通额外）
 * - 解锁顺序推进 + recordTowerClear 首通判定
 *
 * 运行: npx vitest run tests/unit/tower.test.ts
 */
import { describe, expect, it } from 'vitest'
import {
  TOWER_HIDDEN_FLOOR,
  TOWER_MAX_FLOOR,
  isTowerFloorUnlocked,
  recordTowerClear,
  towerClearRewards,
  towerEnemiesForFloor,
  towerFloorPlan,
  towerState,
} from '@/presentation/modules/yanjie/xiyou/tower'

describe('塔层编成（确定性生成）', () => {
  it('同层编成固定（seeded rng），不同层可不同', () => {
    const a = towerEnemiesForFloor(7)
    const b = towerEnemiesForFloor(7)
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id))
    expect(a.length).toBeGreaterThan(0)
  })

  it('层≈等级直映：第 7 层敌人等级落在 4~10（目标 ±3）', () => {
    for (const e of towerEnemiesForFloor(7)) {
      expect(Math.abs(e.level - 7)).toBeLessThanOrEqual(3)
    }
  })

  it('等级封顶 50：第 50 层敌人不超过 50 级', () => {
    for (const e of towerEnemiesForFloor(50)) {
      expect(e.level).toBeLessThanOrEqual(50)
    }
  })

  it('BOSS 层 role 模式：10 层妖王、50 层含妖尊、51 隐藏层双妖尊', () => {
    expect(towerFloorPlan(10).roles[0]).toBe('yaowang')
    expect(towerFloorPlan(50).roles).toContain('yaozun')
    expect(towerFloorPlan(51).roles.filter((r) => r === 'yaozun')).toHaveLength(2)
    // 隐藏层敌人来自 51~60 级妖尊带（enemies.json role=yaozun 唯一高等级带）
    for (const e of towerEnemiesForFloor(51)) {
      expect(e.level).toBeGreaterThan(50)
    }
  })

  it('层数常量：50 层封顶 + 隐藏层 51', () => {
    expect(TOWER_MAX_FLOOR).toBe(50)
    expect(TOWER_HIDDEN_FLOOR).toBe(51)
  })
})

describe('奖励节点表（§22/§18 材料来源）', () => {
  it('15 层起每 5 层灵尘×2', () => {
    expect(towerClearRewards(15, false)).toContainEqual({ itemId: 'spirit_dust', count: 2 })
    expect(towerClearRewards(20, false)).toContainEqual({ itemId: 'spirit_dust', count: 2 })
    expect(towerClearRewards(14, false)).not.toContainEqual({ itemId: 'spirit_dust', count: 2 })
  })

  it('器灵节点 20/35 层；突破丹叁节点 30/50 层；隐藏层器灵×3', () => {
    expect(towerClearRewards(20, false)).toContainEqual({ itemId: 'spirit_core', count: 1 })
    expect(towerClearRewards(35, false)).toContainEqual({ itemId: 'spirit_core', count: 1 })
    expect(towerClearRewards(25, false)).not.toContainEqual({ itemId: 'spirit_core', count: 1 })
    expect(towerClearRewards(30, false)).toContainEqual({ itemId: 'pet_break_pill_3', count: 1 })
    expect(towerClearRewards(50, false)).toContainEqual({ itemId: 'pet_break_pill_3', count: 1 })
    expect(towerClearRewards(51, false)).toContainEqual({ itemId: 'spirit_core', count: 3 })
  })

  it('首通额外灵尘×2', () => {
    expect(towerClearRewards(3, true)).toContainEqual({ itemId: 'spirit_dust', count: 2 })
    expect(towerClearRewards(3, false)).toHaveLength(0)
  })
})

describe('进度与解锁', () => {
  it('顺序推进：最高层 +1 可挑战；隐藏层需通关 50 层', () => {
    towerState.bestFloor = 5
    expect(isTowerFloorUnlocked(6)).toBe(true)
    expect(isTowerFloorUnlocked(7)).toBe(false)
    expect(isTowerFloorUnlocked(51)).toBe(false)
    towerState.bestFloor = 50
    expect(isTowerFloorUnlocked(51)).toBe(true)
    towerState.bestFloor = 0
  })

  it('recordTowerClear：首通推进并返回 true，重复通关返回 false', async () => {
    towerState.bestFloor = 0
    expect(await recordTowerClear(3)).toBe(true)
    expect(towerState.bestFloor).toBe(3)
    expect(await recordTowerClear(3)).toBe(false)
    expect(towerState.bestFloor).toBe(3)
    // 回退挑战不降低进度
    expect(await recordTowerClear(1)).toBe(false)
    expect(towerState.bestFloor).toBe(3)
    towerState.bestFloor = 0
  })
})
