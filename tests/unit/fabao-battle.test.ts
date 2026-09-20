/**
 * fabao-battle.test.ts — 法宝充能→释放战斗链路集成测试（PRD §22，真实配置驱动）
 *
 * 覆盖：
 * - 充能节奏：turn_start 充能 +1（上限 3 层，marker limited）
 * - 满层强制释放：斩仙剑满 3 层触发 turn_start 释放 → 目标承伤 + 充能清空
 * - 边界：1 层时 turn_start 充能到 2 → 未满层不释放
 * - 击杀充能：追魂锥先清层后打击（时序修正），击杀残血目标后灵能保留 1 层
 *
 * 运行: npx vitest run tests/unit/fabao-battle.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import {
  BattleTriggerPhase,
  createPassiveContext,
} from '@/domain/battle/type/types'
import type { BattleData, BattleEntity, SkillConfig } from '@/domain/battle/type/types'
import type { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { createBattleParticipantsFromConfig } from '@tests/factories/ParticipantFactory'

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

function makeBattle(participants: BattleEntity[]): BattleData {
  const map = new Map<string, BattleEntity>()
  for (const p of participants) map.set(p.id, p)
  return {
    currentTurn: 1,
    battleId: 'fabao-test',
    participants: map,
  } as unknown as BattleData
}

/** 注册真实配置的被动到实体（充能 + 释放）并接好 buff 查询 */
function registerPassives(entity: BattleEntity, skillIds: string[]): void {
  const skills = skillIds
    .map((id) => GameDataProcessor.findSkillById(id))
    .filter((s): s is SkillConfig => !!s)
  expect(skills).toHaveLength(skillIds.length)
  ;(entity as { skills: { passive: SkillConfig[] } }).skills = {
    small: [],
    ultimate: [],
    passive: skills,
  }
  const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
  GameDataProcessor.registerParticipantPassives(entity, manager)
  ;(entity as { setBuffQuery(q: unknown): void }).setBuffQuery(
    container.resolve<BuffSystem>('BuffSystem'),
  )
}

function stacksOf(buffSystem: BuffSystem, entityId: string, buffId: string): number {
  return buffSystem.getBuffStackCount(entityId, buffId)
}

describe('法宝充能→释放链路（真实配置）', () => {
  let attacker: BattleParticipantImpl
  let target: BattleParticipantImpl
  let battle: BattleData
  let buffSystem: BuffSystem
  let passiveManager: PassiveSkillManager

  beforeEach(() => {
    container.clear()
    initializeContainer()
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
    buffSystem = container.resolve<BuffSystem>('BuffSystem')
    passiveManager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    const { allies, enemies } = createBattleParticipantsFromConfig(
      ['test_warrior'],
      ['test_tank'],
    )
    attacker = allies[0]!
    target = enemies[0]!
    battle = makeBattle([attacker, target])
    registerPassives(attacker, ['skill_fb_charge_gen', 'skill_fb_release_zhaoxian'])
  })

  function fireTurnStart(): void {
    // 每次调用推进一回合（PRD：充能每回合总获取上限 +2，同回合重复触发会被 maxTriggersPerRound 截断）
    battle.currentTurn = (battle.currentTurn ?? 1) + 1
    passiveManager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.TURN_START, battle, {
        sourceId: attacker.id,
        currentTurn: battle.currentTurn,
        participants: battle.participants,
      }),
    )
  }

  it('充能到 3 层的当回合自动释放（1→2→满→清空）', () => {
    fireTurnStart()
    expect(stacksOf(buffSystem, attacker.id, 'buff_fb_charge')).toBe(1)
    fireTurnStart()
    expect(stacksOf(buffSystem, attacker.id, 'buff_fb_charge')).toBe(2)
    const hpBefore = target.currentHealth
    fireTurnStart()
    // 第 3 回合：充能到 3 → 释放条件满足 → 同 tick 清空并命中
    expect(target.currentHealth).toBeLessThan(hpBefore)
    expect(stacksOf(buffSystem, attacker.id, 'buff_fb_charge')).toBe(0)
  })

  it('满层强制释放：目标承伤且充能清空（不占行动回合）', () => {
    for (let i = 0; i < 3; i++) buffSystem.addBuff(attacker.id, 'buff_fb_charge', {}, 1)
    expect(stacksOf(buffSystem, attacker.id, 'buff_fb_charge')).toBe(3)

    const hpBefore = target.currentHealth
    fireTurnStart()

    // 同一 turn_start：充能被 capped（仍 3）→ 释放条件满足 → 斩仙剑打出 180%+ 攻击伤害
    expect(target.currentHealth).toBeLessThan(hpBefore)
    expect(stacksOf(buffSystem, attacker.id, 'buff_fb_charge')).toBe(0)
  })

  it('未满层不释放：1 层充能到 2，目标无伤', () => {
    buffSystem.addBuff(attacker.id, 'buff_fb_charge', {}, 1)
    const hpBefore = target.currentHealth
    fireTurnStart()
    // 充能被动先执行（+1 → 2），释放条件（min 3）不满足
    expect(stacksOf(buffSystem, attacker.id, 'buff_fb_charge')).toBe(2)
    expect(target.currentHealth).toBe(hpBefore)
  })

  it('追魂锥击杀充能：先清层后打击，击杀后灵能保留 1 层', () => {
    registerPassives(attacker, ['skill_fb_charge_gen', 'skill_fb_release_zhuihunzhui'])
    for (let i = 0; i < 3; i++) buffSystem.addBuff(attacker.id, 'buff_fb_charge', {}, 1)
    // 目标打到残血，保证 150% 攻击必杀
    target.currentHealth = 1
    fireTurnStart()
    expect(target.isAlive()).toBe(false)
    expect(stacksOf(buffSystem, attacker.id, 'buff_fb_charge')).toBe(1)
  })
})
