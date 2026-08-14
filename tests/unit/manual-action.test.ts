/**
 * BattleSystem.executeManualAction 手动干预验证
 *
 * 背景：调试沙盒此前无法手动干预战斗（技能/目标全由 AI 决策）。
 *       新增 executeManualAction：指定参战者 → 指定行动（技能/普攻）→ 指定目标，
 *       走完整执行管线但不经过 AI 决策。
 *
 * 运行: npx vitest run tests/unit/manual-action.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus } from '@/domain/battle/type/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'

describe('BattleSystem.executeManualAction 手动干预', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
  })

  function startBattle() {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire'],
      ['guardian_gold'],
    )
    battleSystem.loadSkillConfigs(GameDataProcessor.getSkillsData())
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    return { allies, enemies }
  }

  it('手动普攻：指定施法者攻击指定目标，目标血量下降', async () => {
    const { allies, enemies } = startBattle()
    const source = allies[0]
    const target = enemies[0]
    const hpBefore = target.currentHealth

    const error = await battleSystem.executeManualAction(source.id, null, target.id)

    expect(error).toBeNull()
    expect(target.currentHealth).toBeLessThan(hpBefore)
  })

  it('不存在的参与者返回失败原因', async () => {
    const { enemies } = startBattle()
    const target = enemies[0]
    const error = await battleSystem.executeManualAction('not_exist', null, target.id)
    expect(error).toBe('施法者不存在')
  })

  it('无效目标返回失败原因', async () => {
    const { allies } = startBattle()
    const error = await battleSystem.executeManualAction(allies[0].id, null, 'not_exist')
    expect(error).toBe('目标不存在')
  })

  it('不存在的技能返回失败原因', async () => {
    const { allies, enemies } = startBattle()
    const error = await battleSystem.executeManualAction(allies[0].id, 'skill_not_exist', enemies[0].id)
    expect(error).toBe('技能不存在')
  })
})
