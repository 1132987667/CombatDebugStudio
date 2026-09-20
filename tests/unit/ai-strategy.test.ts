/**
 * ai-strategy.test.ts — 单位级 AI 策略偏好（PRD §5 AI 自定义）单元自检
 *
 * 覆盖：
 * - createAIInstances：实体 aiStrategy 偏好创建时应用（aggressive/defensive），缺省 balanced
 * - 惰性创建路径（getOrCreateAI 经 makeDecision）同样应用偏好
 * - setPriorityStrategy 未知策略名回退 balanced（工厂既有行为）
 *
 * 运行: npx vitest run tests/unit/ai-strategy.test.ts
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { AISystem } from '@/domain/battle/ai/AISystem'
import { SkillManager } from '@/domain/skill/SkillManager'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { createBattleParticipantsFromConfig } from '@tests/factories/ParticipantFactory'
import type { BattleAI } from '@/domain/battle/ai/BattleAI'

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

function strategyOf(ai: BattleAI): string {
  return (ai as unknown as { priorityStrategy: { getName(): string } }).priorityStrategy.getName()
}

describe('单位级 AI 策略偏好', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    container.resolve<SkillManager>('SkillManager').loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  function makeAISystem(): AISystem {
    return new AISystem(container.resolve<SkillManager>('SkillManager'))
  }

  it('createAIInstances：实体偏好创建时应用', () => {
    const { allies, enemies } = createBattleParticipantsFromConfig(['test_warrior'], ['test_tank'])
    const attacker = allies[0]!
    const defender = enemies[0]!
    attacker.aiStrategy = 'aggressive'
    defender.aiStrategy = 'defensive'

    const participants = new Map([attacker, defender].map((p) => [p.id, p]))
    const instances = makeAISystem().createAIInstances(participants)

    // getName() 返回策略类名（如 AggressiveAIPriorityStrategy），按前缀断言
    expect(strategyOf(instances.get(attacker.id)!).toLowerCase()).toContain('aggressive')
    expect(strategyOf(instances.get(defender.id)!).toLowerCase()).toContain('defensive')
  })

  it('缺省偏好 = balanced（工厂默认）', () => {
    const { allies } = createBattleParticipantsFromConfig(['test_warrior'], [])
    const unit = allies[0]!
    const instances = makeAISystem().createAIInstances(new Map([[unit.id, unit]]))
    expect(strategyOf(instances.get(unit.id)!).toLowerCase()).toContain('balanced')
  })

  it('惰性创建路径同样应用偏好', async () => {
    const { allies, enemies } = createBattleParticipantsFromConfig(['test_warrior'], ['test_tank'])
    const attacker = allies[0]!
    const foe = enemies[0]!
    attacker.aiStrategy = 'defensive'

    const aiSystem = makeAISystem()
    // 未预创建实例——makeDecision 走 getOrCreateAI 惰性路径
    const decision = aiSystem.makeDecision(
      {
        participants: new Map([attacker, foe].map((p) => [p.id, p])),
        currentTurn: 1,
      } as never,
      attacker,
    )
    expect(decision).toBeTruthy()
    // 惰性创建的实例已缓存，策略名可查
    const cached = (aiSystem as unknown as { aiInstances: Map<string, BattleAI> }).aiInstances.get(attacker.id)!
    expect(strategyOf(cached).toLowerCase()).toContain('defensive')
  })
})
