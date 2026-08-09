/**
 * TurnManager.createTurnOrder 速度开关（speedFirst）验证
 *
 * 背景：战斗规则「速度决定出手顺序」开关此前只存在 Pinia/领域配置，
 *       TurnManager.createTurnOrder 恒按速度排序，开关不生效。
 *       本次接入：speedFirst=false 时按注册顺序固定出手。
 *
 * 运行: npx vitest run tests/unit/turn-order-speed-first.test.ts
 */
import { describe, it, expect } from 'vitest'
import { TurnManager } from '@/domain/battle/service/TurnManager'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'

function makeParticipant(id: string, speed: number): BattleEntity {
  return new BattleParticipantImpl({
    id,
    name: id,
    level: 1,
    team: ParticipantSide.ALLY,
    enabled: true,
    seatIndex: 0,
    skills: { small: [], passive: [], ultimate: [] },
    attributeValues: { currentHealth: 100, maxHealth: 100, attack: 10, defense: 0, speed },
  })
}

describe('TurnManager.createTurnOrder 速度开关', () => {
  const tm = new TurnManager({} as BuffSystem)

  it('speedFirst=true 按速度降序', () => {
    const slow = makeParticipant('slow', 5)
    const fast = makeParticipant('fast', 99)
    expect(tm.createTurnOrder([slow, fast], undefined, true)).toEqual(['fast', 'slow'])
  })

  it('speedFirst=false 保持注册顺序（固定出手）', () => {
    const first = makeParticipant('first', 5)
    const second = makeParticipant('second', 99)
    expect(tm.createTurnOrder([first, second], undefined, false)).toEqual(['first', 'second'])
  })

  it('两种模式都过滤死亡角色', () => {
    const dead = makeParticipant('dead', 1)
    dead.currentHealth = 0
    const alive = makeParticipant('alive', 99)
    expect(tm.createTurnOrder([dead, alive], undefined, false)).toEqual(['alive'])
    expect(tm.createTurnOrder([dead, alive], undefined, true)).toEqual(['alive'])
  })
})
