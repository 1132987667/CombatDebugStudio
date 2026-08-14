/**
 * 临时诊断：斗战西游完整 initBattle 流程（用完即删）
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import type { BattleService } from '@/application/facade/BattleFacade'
import { ParticipantSide } from '@/domain/battle/type/types'
import { buildBattleTeams, scenes } from '@/presentation/modules/yanjie/xiyou/data/mock'
import { useBattleStore } from '@/presentation/stores/battleStore'

describe('xiyou full initBattle', () => {
  let battleService: BattleService

  beforeAll(() => {
    container.clear()
    initializeContainer()
    setActivePinia(createPinia())
    battleService = container.resolve<BattleService>('BattleService')
  })

  it('模拟 BattleZen.initBattle 完整流程，最终 team 规模', async () => {
    const store = useBattleStore()
    store.initializeBattleService(battleService)
    battleService.loadSkillConfigs()

    const scene = scenes.find(s => s.unlocked) ?? scenes[0]
    const { ally, enemy } = buildBattleTeams(scene as never)
    console.log('[init] buildBattleTeams:', ally.length, 'vs', enemy.length)

    if (battleService.getIsBattleActive()) battleService.endBattle(ParticipantSide.ALLY)
    battleService.reset()
    battleService.clearParticipants()
    battleService.initializeTeams(ally, enemy)
    store.syncTeams()
    store.selectCharacter(ally[0]?.id ?? '')
    const battleId = await store.startBattle()
    console.log('[init] after startBattle: allyTeam', store.allyTeam.length, 'enemyTeam', store.enemyTeam.length)
    console.log('[init] service enabled:', battleService.getEnabledAllyTeam().length, 'vs', battleService.getEnabledEnemyTeam().length)
    expect(battleId).toBeTruthy()
    expect(store.allyTeam.length).toBeLessThanOrEqual(4)
    expect(store.enemyTeam.length).toBeLessThanOrEqual(4)
  })
})
