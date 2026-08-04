import { describe, it, expect, vi } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import type { BattleManager } from '@/domain/battle/BattleManager'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { createBattleParticipantsFromConfig } from '@tests/factories/ParticipantFactory'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))

vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    setTimeout(fn: (...args: unknown[]) => void, ms?: number): symbol {
      setTimeout(() => fn(), Math.max(0, ms ?? 0))
      return Symbol('mock')
    }
    setInterval = () => Symbol('mock')
    clear = () => {}
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

function createBard() {
  const enemyData = GameDataProcessor.findEnemyById('test_bard')
  if (!enemyData) throw new Error('缺少测试敌人配置: test_bard')
  return GameDataProcessor.enemyToParticipant(enemyData, ParticipantSide.ENEMY)
}

describe('DEBUG-bard', () => {
  it('print attack modifiers after startBattle', async () => {
    container.clear()
    initializeContainer()
    const battleManager = container.resolve<BattleManager>('BattleManager')
    const { allies, enemies } = createBattleParticipantsFromConfig()
    battleManager.initializeTeams(allies, enemies)

    const bard = createBard()
    const baseAttack = bard.getAttribute(ATTRIBUTE_CODE.attack)
    battleManager.addCharacterToTeam(bard, ParticipantSide.ENEMY)
    await battleManager.startBattle()

    const av = bard.getAttrVal(ATTRIBUTE_CODE.attack)
    const atkBonus = bard.getAttrVal(ATTRIBUTE_CODE.attackBonus)
    console.log('BASE_ATTACK=', baseAttack)
    console.log('ATTACK_FINAL=', bard.getAttribute(ATTRIBUTE_CODE.attack))
    console.log('ATTACK_MODIFIERS=', JSON.stringify(av?.modifiers.map(m => ({ k: m.sourceKey, t: m.type, v: m.value }))))
    console.log('ATTACKBONUS_MODIFIERS=', JSON.stringify(atkBonus?.modifiers.map(m => ({ k: m.sourceKey, t: m.type, v: m.value }))))
    expect(true).toBe(true)
  })
})
