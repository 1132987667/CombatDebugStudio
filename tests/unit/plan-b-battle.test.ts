/**
 * 方案 B 战斗验证：光环分发
 *
 * 使用真实 JSON 配置创建参与者和 Buff，验证战斗初始化的光环分发逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide, BattleTriggerPhase } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { EMPTY_SKILL_SET, makeDefaultAttributes, createParticipantFromEnemy } from '@tests/fixtures/participants'
import { getSkillConfig, getBuffConfig } from '@tests/fixtures/loadTestData'
import type { SkillConfig } from '@/domain/skill/types'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))
vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    setTimeout = (fn: (...args: unknown[]) => void) => { fn(); return Symbol('mock') }
    setInterval = () => Symbol('mock')
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

// ───── 从真实配置加载测试数据 ─────

/** guardian 金护法被动 — skill_passive_guardian.json 中的首领光环 */
const auraPassive = getSkillConfig('skill_enemy_079_passive')

describe('方案 B 战斗验证：光环分发', () => {
  let registry: BuffScriptRegistry
  let buffSystem: BuffSystem
  let skillManager: SkillManager
  let passiveSkillManager: PassiveSkillManager

  const mockEventBus = { emit: () => {}, on: () => {}, off: () => {}, offByListenerId: () => {} } as any
  const mockLogger = { addDebugLog: () => {}, addSystemLog: () => {}, addBattleLog: () => {}, addActionLog: () => {}, clearLogs: () => {}, syncBattleLogs: () => {} } as any

  beforeEach(() => {
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
    skillManager = new SkillManager(buffSystem)
    passiveSkillManager = PassiveSkillManager.create(skillManager, buffSystem)

    // 加载 buff_leader_aura 配置到 registry，使 SkillExecutor 能解析
    const auraBuffConfig = getBuffConfig('buff_leader_aura')
    if (auraBuffConfig) {
      registry.loadBuffConfigsFromArray([auraBuffConfig])
    }

    // 注册 buff_leader_aura 脚本，使 BuffSystem.addBuff 可用
    registry.registerScript('buff_leader_aura', {
      onApply: () => {},
      onRemove: () => {},
      onUpdate: () => {},
      onRefresh: () => {},
      getEffectLines: () => [],
    }, { id: 'buff_leader_aura', name: '首领光环', duration: -1 })

    // 注册真实被动技能到 SkillManager
    if (auraPassive) {
      skillManager.setSkillConfig('skill_enemy_079_passive', auraPassive)
    }
  })

  it('金护法在战斗开始后应有首领光环 buff', () => {
    if (!auraPassive) return // skip if config not found

    const gold = createParticipantFromEnemy('guardian_gold', ParticipantSide.ENEMY)
    if (!gold) return // skip if enemy not found

    gold.setModifierProvider(buffSystem)
    gold.setBuffQuery(buffSystem)

    // 注册被动
    GameDataProcessor.registerParticipantPassives(gold, passiveSkillManager)

    // 触发 BATTLE_START
    passiveSkillManager.triggerPassives(gold, {
      phase: BattleTriggerPhase.BATTLE_START,
      currentTurn: 0,
    })

    const instances = buffSystem.getBuffInstances(gold.id)
    const hasAura = instances.some((b) => b.buffId === 'buff_leader_aura')
    expect(hasAura).toBe(true)
  })

  it('多个参与者都能获得光环', () => {
    if (!auraPassive) return

    // guardian_gold 和 enemy_079 都有 skill_enemy_079_passive
    const gold = createParticipantFromEnemy('guardian_gold', ParticipantSide.ENEMY)
    const enemy079 = createParticipantFromEnemy('enemy_079', ParticipantSide.ENEMY)
    if (!gold || !enemy079) return

    for (const p of [gold, enemy079]) {
      p.setModifierProvider(buffSystem)
      p.setBuffQuery(buffSystem)
      GameDataProcessor.registerParticipantPassives(p, passiveSkillManager)
    }

    for (const p of [gold, enemy079]) {
      passiveSkillManager.triggerPassives(p, {
        phase: BattleTriggerPhase.BATTLE_START,
        currentTurn: 0,
      })
    }

    for (const p of [gold, enemy079]) {
      const instances = buffSystem.getBuffInstances(p.id)
      expect(instances.some((b) => b.buffId === 'buff_leader_aura')).toBe(true)
    }
  })
})
