/**
 * BattleRuleManager 回合上限验证
 *
 * 背景：全局回合上限由 BattleRuleManager 默认配置驱动（maxTurns），
 *       checkBattleEndCondition 在 currentTurn >= maxTurns 时按双方剩余血量比例判胜负。
 *       本次将默认上限从 999 调整为 99，此处验证该调整生效且边界正确。
 *
 * 运行: npx vitest run tests/unit/battle-rule-turn-cap.test.ts
 */
import { describe, it, expect } from 'vitest'
import { BattleRuleManager } from '@/domain/battle/service/BattleRuleManager'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import type { BattleEntity } from '@/domain/battle/type/types'

function makeParticipant(id: string, team: typeof ParticipantSide.ALLY): BattleEntity {
  return new BattleParticipantImpl({
    id,
    name: id,
    level: 1,
    team,
    enabled: true,
    seatIndex: 0,
    skills: { small: [], passive: [], ultimate: [] },
    attributeValues: { currentHealth: 100, maxHealth: 100, attack: 10, defense: 0, speed: 10 },
  })
}

describe('BattleRuleManager 全局回合上限', () => {
  it('默认 maxTurns 为 99', () => {
    const rm = new BattleRuleManager()
    expect(rm.getTurnSystemRules().maxTurns).toBe(99)
  })

  it('currentTurn 达到 99 时按血量比例判胜负，99 之前不结束', () => {
    const ally = makeParticipant('ally_1', ParticipantSide.ALLY)
    const enemy = makeParticipant('enemy_1', ParticipantSide.ENEMY)
    const participants = new Map<string, BattleEntity>([
      [ally.id, ally],
      [enemy.id, enemy],
    ])
    const rm = new BattleRuleManager()

    // 双方满血等比例 → 未到上限前不结束
    expect(rm.checkBattleEndCondition(participants, 98).shouldEnd).toBe(false)
    // 达到上限 → 结束，血量比例平局判我方胜
    const result = rm.checkBattleEndCondition(participants, 99)
    expect(result.shouldEnd).toBe(true)
    expect(result.winner).toBe(ParticipantSide.ALLY)
  })
})
