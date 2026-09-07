/**
 * 封神榜 · 数据洞察聚合纯函数测试（data-insight.ts）
 *
 * 覆盖：
 * - enemyMeanStatsByLevel：同等级均值 / 属性键并集 / 等级升序 / 边界
 * - equipmentAffixFrequency：计数与 flat/percent 拆分 / 降序稳定性
 * - dropOwnership：独家投放排序 / 同怪重复去重 / 非法条目跳过
 * - zeroDropItemIds：全集求差
 *
 * 运行: npx vitest run tests/unit/fengshen-data-insight.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  enemyMeanStatsByLevel,
  equipmentAffixFrequency,
  dropOwnership,
  zeroDropItemIds,
  ENEMY_STAT_KEY_BY_PLAYER_ATTR,
} from '@/domain/fengshen/data-insight'
import { PLAYER_BASE_ATTRS } from '@/domain/fengshen/player-config'
import type { Enemy } from '@/shared/types/enemy'

function makeEnemy(overrides: Partial<Enemy> & { id: string; level: number }): Enemy {
  return {
    name: overrides.id,
    stats: {},
    drops: [],
    skills: {},
    ...overrides,
  } as Enemy
}

describe('enemyMeanStatsByLevel', () => {
  it('同等级多只怪取算术均值并四舍五入', () => {
    const rows = enemyMeanStatsByLevel([
      makeEnemy({ id: 'a', level: 3, stats: { maxHealth: 100, attack: 10 } }),
      makeEnemy({ id: 'b', level: 3, stats: { maxHealth: 201, attack: 11 } }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].level).toBe(3)
    expect(rows[0].stats.maxHealth).toBe(Math.round((100 + 201) / 2))
    expect(rows[0].stats.attack).toBe(11)
  })

  it('属性键取并集：单只怪缺的键由有值的怪求均值，不补 0', () => {
    const rows = enemyMeanStatsByLevel([
      makeEnemy({ id: 'a', level: 1, stats: { attack: 10 } }),
      makeEnemy({ id: 'b', level: 1, stats: { maxHealth: 80 } }),
    ])
    expect(rows[0].stats.attack).toBe(10)
    expect(rows[0].stats.maxHealth).toBe(80)
  })

  it('结果按等级升序排列', () => {
    const rows = enemyMeanStatsByLevel([
      makeEnemy({ id: 'late', level: 20, stats: { attack: 1 } }),
      makeEnemy({ id: 'early', level: 2, stats: { attack: 1 } }),
    ])
    expect(rows.map((r) => r.level)).toEqual([2, 20])
  })

  it('空输入返回空数组；stats 缺失不崩溃', () => {
    expect(enemyMeanStatsByLevel([])).toEqual([])
    expect(enemyMeanStatsByLevel([makeEnemy({ id: 'x', level: 1 })])[0].stats).toEqual({})
  })
})

describe('equipmentAffixFrequency', () => {
  it('按属性计数并拆分 flat/percent', () => {
    const rows = equipmentAffixFrequency([
      { stats: [{ attribute: 'attack', modifierType: 'flat', value: 10 }, { attribute: 'speed', modifierType: 'percent', value: -20 }] },
      { stats: [{ attribute: 'attack', modifierType: 'percent', value: 5 }] },
      { stats: [{ attribute: 'attack', modifierType: 'flat', value: 3 }] },
    ])
    expect(rows).toEqual([
      { attribute: 'attack', count: 3, flat: 2, percent: 1 },
      { attribute: 'speed', count: 1, flat: 0, percent: 1 },
    ])
  })

  it('同频次按属性码字典序稳定排序', () => {
    const rows = equipmentAffixFrequency([
      { stats: [{ attribute: 'speed', modifierType: 'flat', value: 1 }, { attribute: 'attack', modifierType: 'flat', value: 1 }] },
    ])
    expect(rows.map((r) => r.attribute)).toEqual(['attack', 'speed'])
  })

  it('空 stats / 空装备列表返回空', () => {
    expect(equipmentAffixFrequency([])).toEqual([])
    expect(equipmentAffixFrequency([{ stats: [] }])).toEqual([])
  })
})

describe('dropOwnership', () => {
  it('敌人数升序：独家投放排最前；同敌人数按 itemId 排序', () => {
    const rows = dropOwnership([
      makeEnemy({ id: 'e1', level: 1, drops: [{ itemId: 'mat_b' }, { itemId: 'mat_shared' }] }),
      makeEnemy({ id: 'e2', level: 2, drops: [{ itemId: 'mat_a' }, { itemId: 'mat_shared' }] }),
      makeEnemy({ id: 'e3', level: 3, drops: [{ itemId: 'mat_shared' }] }),
    ])
    expect(rows[0]).toEqual({ itemId: 'mat_a', enemies: [{ id: 'e2', name: 'e2' }] })
    expect(rows[1].itemId).toBe('mat_b')
    expect(rows.find((r) => r.itemId === 'mat_shared')?.enemies).toHaveLength(3)
  })

  it('同一敌人重复掉同一物品只计一次', () => {
    const rows = dropOwnership([
      makeEnemy({ id: 'e1', level: 1, drops: [{ itemId: 'mat_x' }, { itemId: 'mat_x' }] }),
    ])
    expect(rows[0].enemies).toHaveLength(1)
  })

  it('缺 itemId 的条目跳过', () => {
    const rows = dropOwnership([
      makeEnemy({ id: 'e1', level: 1, drops: [{ itemId: '' } as never] }),
    ])
    expect(rows).toEqual([])
  })
})

describe('zeroDropItemIds', () => {
  it('返回全集中没有任何敌人掉落的物品', () => {
    const enemies = [
      makeEnemy({ id: 'e1', level: 1, drops: [{ itemId: 'mat_a' }] }),
    ]
    const all = [{ id: 'mat_a' }, { id: 'mat_b' }, { id: 'mat_c' }]
    expect(zeroDropItemIds(all, enemies)).toEqual(['mat_b', 'mat_c'])
  })

  it('敌人无 drops 时全集均为零投放', () => {
    expect(zeroDropItemIds([{ id: 'a' }], [makeEnemy({ id: 'e', level: 1 })])).toEqual(['a'])
  })
})

describe('ENEMY_STAT_KEY_BY_PLAYER_ATTR', () => {
  it('玩家六维全部有映射（hitValue/hit、dodgeValue/dodge 键名差异收敛在此）', () => {
    for (const attr of PLAYER_BASE_ATTRS) {
      expect(ENEMY_STAT_KEY_BY_PLAYER_ATTR[attr]).toBeTruthy()
    }
  })
})
