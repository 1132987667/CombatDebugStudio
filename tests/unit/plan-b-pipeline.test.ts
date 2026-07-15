import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { PARTICIPANT_SIDE } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { BattleTriggerPhase } from '@/domain/battle/type/types'
import { EMPTY_SKILL_SET, makeDefaultAttributes } from '../fixtures/participants'
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

/** 创建一个测试被动技能（无 triggerTimes） */
function makeStaticPassiveSkill(): SkillConfig {
  return {
    id: 'test_static_passive',
    name: '测试常驻被动',
    description: '测试用，防御+10%',
    energyCost: 0,
    cooldown: 0,
    selector: { faction: 'self', strategy: 'first' },
    skillType: 'passive',
    steps: [
      {
        type: 'modify_attribute',
        modifiers: [
          { id: 'test_def_bonus', targetAttribute: 'defense', type: 'PERCENTAGE', value: 10, sourceName: '测试常驻被动' },
        ],
      },
    ],
  }
}

/** 创建一个有 apply_buff 步骤的被动 */
function makeApplyBuffPassiveSkill(buffId: string): SkillConfig {
  return {
    id: `test_apply_${buffId}`,
    name: '测试施加Buff被动',
    description: '测试用',
    energyCost: 0,
    cooldown: 0,
    selector: { faction: 'self', strategy: 'first' },
    skillType: 'passive',
    steps: [
      { type: 'apply_buff' as any, buffId },
    ],
  }
}

/** 创建一个测试参与者，携带指定的被动技能 */
function createTestParticipantWithPassives(passiveSkills: SkillConfig[]): BattleParticipantImpl {
  const participant = new BattleParticipantImpl({
    id: 'test_passive_char',
    name: '被动测试角色',
    level: 50,
    type: PARTICIPANT_SIDE.ALLY,
    team: PARTICIPANT_SIDE.ALLY,
    enabled: true,
    skills: { small: [], passive: passiveSkills, ultimate: [] },
    attributeValues: makeDefaultAttributes(),
  })
  return participant
}

describe('方案 B 统一管道', () => {
  let buffSystem: BuffSystem
  let skillManager: SkillManager
  let passiveSkillManager: PassiveSkillManager
  let registry: BuffScriptRegistry

  beforeEach(() => {
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry)
    skillManager = new SkillManager(buffSystem)
    passiveSkillManager = PassiveSkillManager.create(skillManager, buffSystem)
  })

  describe('GameDataProcessor.registerParticipantPassives', () => {
    it('无 triggerTimes 的被动应注册为 BATTLE_START', () => {
      const participant = createTestParticipantWithPassives([makeStaticPassiveSkill()])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      const passives = passiveSkillManager.getPassives(participant.id)
      expect(passives).toHaveLength(1)
      expect(passives[0].trigger).toBe(BattleTriggerPhase.BATTLE_START)
      expect(passives[0].skillId).toBe('test_static_passive')
    })

    it('有 triggerTimes 的被动保持原样，不加 battle_start', () => {
      const passiveWithTrigger: SkillConfig = {
        ...makeStaticPassiveSkill(),
        triggerTimes: ['turn_start'],
        id: 'test_trigger_passive',
        name: '测试触发被动',
      }
      const participant = createTestParticipantWithPassives([passiveWithTrigger])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      const passives = passiveSkillManager.getPassives(participant.id)
      expect(passives).toHaveLength(1)
      expect(passives[0].trigger).toBe(BattleTriggerPhase.TURN_START)
    })

    it('混合型被动（有触发 + 无触发）各自注册正确', () => {
      const participant = createTestParticipantWithPassives([
        makeStaticPassiveSkill(),
        { ...makeStaticPassiveSkill(), id: 'test_trigger_passive', triggerTimes: ['damage_taken'] },
      ])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      const passives = passiveSkillManager.getPassives(participant.id)
      expect(passives).toHaveLength(2)
      const triggers = passives.map(p => p.trigger)
      expect(triggers).toContain(BattleTriggerPhase.BATTLE_START)
      expect(triggers).toContain(BattleTriggerPhase.DAMAGE_TAKEN)
    })

    it('battle_start 被动默认 maxTriggerCount = 1', () => {
      const participant = createTestParticipantWithPassives([makeStaticPassiveSkill()])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      const passives = passiveSkillManager.getPassives(participant.id)
      expect(passives[0].maxTriggerCount).toBe(1)
    })
  })

  describe('PassiveSkillManager.triggerPassives BATTLE_START', () => {
    beforeEach(() => {
      // 将所有用到的被动技能注册到 SkillManager，否则 executeSkill 找不到配置
      const skills = [
        makeStaticPassiveSkill(),
        makeApplyBuffPassiveSkill('test_simple_buff'),
      ]
      for (const s of skills) {
        skillManager.setSkillConfig(s.id, s)
      }
      // 注册一个基础 buff 供 apply_buff 测试使用
      registry.registerScript('test_simple_buff', {
        onApply: () => {},
        onRemove: () => {},
        onUpdate: () => {},
        onRefresh: () => {},
        getEffectLines: () => [],
      }, { id: 'test_simple_buff', name: '测试 Buff', duration: -1, maxStacks: 1 })
    })

    it('actualTarget 修复：target 为 undefined 时默认 entity', () => {
      const participant = createTestParticipantWithPassives([makeStaticPassiveSkill()])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      // 执行 BATTLE_START — 无 target（模拟 battle start 场景）
      passiveSkillManager.triggerPassives(
        BattleTriggerPhase.BATTLE_START,
        participant,
        { currentTurn: 0 },
      )

      // actualTarget = target ?? entity → entity，被动应成功执行
      // 被动的步骤 modify_attribute 防御+10%（基础 50 + 10% = 55）
      const defense = participant.getAttribute(ATTRIBUTE_CODE.defense)
      expect(defense).toBeCloseTo(55, 0)
    })

    it('追踪 buff 不再创建，修饰符可直接通过 ModifierStack 追溯', () => {
      const participant = createTestParticipantWithPassives([makeStaticPassiveSkill()])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      passiveSkillManager.triggerPassives(
        BattleTriggerPhase.BATTLE_START,
        participant,
        { currentTurn: 0 },
      )

      // ponytail: ensureTrackingBuff 已移除，modify_attribute 不再创建隐藏的 BuffInstance。
      // 修饰符直接写入 attrData.modifiers，可通过 sourceKey 追溯。
      const defenseData = participant.getAttrValue(ATTRIBUTE_CODE.defense)
      expect(defenseData?.modifiers.some(m => m.sourceKey.startsWith('passive:'))).toBe(true)
      expect(buffSystem.hasBuff(participant.id, '_track_passive_test_static_passive')).toBe(false)
    })

    it('已有 apply_buff 步骤的被动不创建追踪 buff', () => {
      const buffId = 'test_simple_buff'
      // 用 apply_buff 被动，且把 buff 注册到 ScriptRegistry
      const passive = makeApplyBuffPassiveSkill(buffId)
      // 确保被动技能已在 SkillManager 中注册
      skillManager.setSkillConfig(passive.id, passive)

      const participant = createTestParticipantWithPassives([passive])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      passiveSkillManager.triggerPassives(
        BattleTriggerPhase.BATTLE_START,
        participant,
        undefined,
        { currentTurn: 0 },
      )

      // 应用了 apply_buff 步骤 → buff 实例存在
      expect(buffSystem.hasBuff(participant.id, buffId)).toBe(true)

      // ponytail: ensureTrackingBuff 已移除，不再创建追踪 buff
    })
  })

  describe('PassiveSkillManager.clearAll', () => {
    it('clearAll 后被动注册列表为空', () => {
      const participant = createTestParticipantWithPassives([makeStaticPassiveSkill()])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      expect(passiveSkillManager.getPassives(participant.id).length).toBeGreaterThan(0)

      passiveSkillManager.clearAll()

      expect(passiveSkillManager.getPassives(participant.id)).toHaveLength(0)
    })
  })
})
