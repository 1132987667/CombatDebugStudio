/**
 * 临时诊断：斗战西游阵容规模验证（用完即删）
 */
import { describe, expect, it } from 'vitest'
import { buildBattleTeams, scenes } from '@/presentation/modules/yanjie/xiyou/data/mock'

describe('xiyou teams scale', () => {
  it('buildBattleTeams 输出各场景规模', () => {
    for (const s of scenes) {
      const { ally, enemy } = buildBattleTeams(s as never)
      console.log(`[teams] ${s.id} ${s.name} => ally ${ally.length} enemy ${enemy.length}`)
    }
  })

  it('首个解锁场景规模', () => {
    const first = scenes.find(s => s.unlocked) ?? scenes[0]
    const { ally, enemy } = buildBattleTeams(first as never)
    expect(ally.length).toBeLessThanOrEqual(4)
    expect(enemy.length).toBeLessThanOrEqual(4)
    console.log(`[first] ${first.id} => ally ${ally.length} enemy ${enemy.length}`)
  })
})
