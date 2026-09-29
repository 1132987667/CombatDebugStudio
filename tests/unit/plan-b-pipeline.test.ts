/**
 * 方案 B 统一管道测试（被动技能注册 + 触发）
 *
 * 使用真实 JSON 配置数据（skill_passive.json / buffs.json）替代内联 Mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'
import { PassiveSkillManager, type PassiveSkillConfig } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide, BattleTriggerPhase } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { EMPTY_SKILL_SET, makeDefaultAttributes } from '@tests/fixtures/participants'
import { getSkillConfig, getBuffConfig } from '@tests/fixtures/loadTestData'
import type { SkillConfig } from '@/domain/skill/types'

// ───── 从真实配置加载测试数据 ─────

/** skill_enemy_004_passive：常驻被动，battle_start 触发，modify_attribute 步骤 */
const realStaticPassive = getSkillConfig('skill_enemy_004_passive')!

/** skill_enemy_006_passive：山林之子，battle_start 触发，apply_buff buff_mountain_child */
const realApplyBuffPassive = getSkillConfig('skill_enemy_006_passive')!

// ───── 辅助函数 ─────

/** 创建一个测试参与者，携带指定的被动技能 */
function createTestParticipantWithPassives(passiveSkills: SkillConfig[]): BattleParticipantImpl {
  const participant = new BattleParticipantImpl({
    id: 'test_passive_char',
    name: '被动测试角色',
    level: 50,
    team: ParticipantSide.ALLY,
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

  const mockEventBus = { emit: () => {}, on: () => {}, off: () => {}, offByListenerId: () => {} } as any
  const mockLogger = { addDebugLog: () => {}, addSystemLog: () => {}, addBattleLog: () => {}, addActionLog: () => {}, clearLogs: () => {}, syncBattleLogs: () => {} } as any

  beforeEach(() => {
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
    skillManager = new SkillManager(buffSystem)
    passiveSkillManager = PassiveSkillManager.create(skillManager, buffSystem)
  })

  describe('GameDataProcessor.registerParticipantPassives', () => {
    it('显式配置 triggerTimes 的被动按其触发时机注册', () => {
      // realStaticPassive 显式声明了 triggerTimes: ['battle_start']
      expect(realStaticPassive.triggerTimes).toEqual(['battle_start'])
      const participant = createTestParticipantWithPassives([realStaticPassive])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      const passives = passiveSkillManager.getPassives(participant.id)
      expect(passives).toHaveLength(1)
      expect(passives[0].trigger).toBe(BattleTriggerPhase.BATTLE_START)
      expect(passives[0].skillId).toBe('skill_enemy_004_passive')
    })

    it('battle_start 被动默认 maxTriggerCount = 1', () => {
      const participant = createTestParticipantWithPassives([realStaticPassive])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      const passives = passiveSkillManager.getPassives(participant.id)
      expect(passives[0].maxTriggerCount).toBe(1)
    })

    it('缺少 triggerTimes 的被动不注册（不再兜底 BATTLE_START）', () => {
      const broken = {
        id: 'skill_test_no_trigger',
        name: '缺触发时机',
        description: '',
        steps: [],
      } as unknown as SkillConfig
      const participant = createTestParticipantWithPassives([broken])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      const logSpy = vi
        .spyOn(LoggerProvider.logger, 'addDebugLog')
        .mockImplementation(() => {})
      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('缺少 triggerTimes'),
        expect.objectContaining({
          level: LogLevel.ERROR,
          context: expect.objectContaining({ skillId: 'skill_test_no_trigger' }),
        }),
      )
      expect(passiveSkillManager.getPassives(participant.id)).toHaveLength(0)
      logSpy.mockRestore()
    })

    it('无法识别的 triggerTimes 值不注册并报错', () => {
      const broken = {
        id: 'skill_test_bad_trigger',
        name: '错值触发时机',
        description: '',
        triggerTimes: ['NOT_A_REAL_PHASE'],
        steps: [],
      } as unknown as SkillConfig
      const participant = createTestParticipantWithPassives([broken])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      const logSpy = vi
        .spyOn(LoggerProvider.logger, 'addDebugLog')
        .mockImplementation(() => {})
      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('无法识别的被动触发时机: NOT_A_REAL_PHASE'),
        expect.objectContaining({
          level: LogLevel.ERROR,
          context: expect.objectContaining({ rawTrigger: 'NOT_A_REAL_PHASE' }),
        }),
      )
      expect(passiveSkillManager.getPassives(participant.id)).toHaveLength(0)
      logSpy.mockRestore()
    })
  })

  describe('PassiveSkillManager.triggerPassives BATTLE_START', () => {
    beforeEach(() => {
      // 注册真实被动技能到 SkillManager
      skillManager.setSkillConfig('skill_enemy_004_passive', realStaticPassive)
    })

    it('BATTLE_START 触发被动 modify_attribute 注册', () => {
      const participant = createTestParticipantWithPassives([realStaticPassive])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)
      participant.recalcAll()

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)
      passiveSkillManager.triggerPassives(participant, {
        phase: BattleTriggerPhase.BATTLE_START,
        currentTurn: 0,
      })

      // 验证被动已注册且触发无异常
      const passives = passiveSkillManager.getPassives(participant.id)
      expect(passives.length).toBeGreaterThanOrEqual(1)
    })

    it('多个被动一起触发', () => {
      const pSkill2 = getSkillConfig('skill_enemy_005_passive')!
      skillManager.setSkillConfig('skill_enemy_005_passive', pSkill2)

      const participant = createTestParticipantWithPassives([realStaticPassive, pSkill2])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)
      passiveSkillManager.triggerPassives(participant, {
        phase: BattleTriggerPhase.BATTLE_START,
        currentTurn: 0,
      })

      const passives = passiveSkillManager.getPassives(participant.id)
      expect(passives.length).toBeGreaterThanOrEqual(2)
    })

    it('triggerProbability = 0 判定为不触发（0 是合法边界值，而非"未配置"）', () => {
      const participant = createTestParticipantWithPassives([])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      const zeroChance: PassiveSkillConfig = {
        id: 'test:zero_chance:battle_start',
        name: '零概率被动',
        description: '',
        trigger: BattleTriggerPhase.BATTLE_START,
        skillId: 'skill_test_zero_chance',
        cooldown: 0,
        triggerProbability: 0,
      }

      expect(
        passiveSkillManager.shouldTriggerPassive(zeroChance, participant, undefined, {
          phase: BattleTriggerPhase.BATTLE_START,
          currentTurn: 0,
        }),
      ).toBe(false)
    })
  })

  describe('apply_buff 步骤的被动', () => {
    it('battle_start 触发的 apply_buff 被动注册正确', () => {
      skillManager.setSkillConfig('skill_enemy_006_passive', realApplyBuffPassive)

      const participant = createTestParticipantWithPassives([realApplyBuffPassive])
      participant.setModifierProvider(buffSystem)
      participant.setBuffQuery(buffSystem)

      GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)

      const passives = passiveSkillManager.getPassives(participant.id)
      expect(passives).toHaveLength(1)
      expect(passives[0].trigger).toBe(BattleTriggerPhase.BATTLE_START)
      expect(passives[0].skillId).toBe('skill_enemy_006_passive')
    })
  })
})
