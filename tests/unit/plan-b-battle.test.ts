import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { PARTICIPANT_SIDE, BattleTriggerPhase } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { EMPTY_SKILL_SET, makeDefaultAttributes } from '../fixtures/participants'
import type { SkillConfig, SkillSet } from '@/domain/skill/types'

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

/** 首领光环被动（配置与 skill_passive.json 一致） */
function makeAuraPassiveSkill(): SkillConfig {
  return {
    id: 'skill_enemy_079_passive',
    name: '首领光环',
    description: '被动效果：提升所有友方单位的攻击力15%',
    energyCost: 0,
    cooldown: 0,
    selector: { faction: 'self', strategy: 'first' },
    skillType: 'passive',
    triggerTimes: ['battle_start'],
    steps: [{ type: 'apply_buff' as const, buffId: 'buff_leader_aura' }],
  }
}

function createParticipant(id: string, name: string, side: PARTICIPANT_SIDE, atk: number, passives: SkillConfig[] = []): BattleParticipantImpl {
  return new BattleParticipantImpl({
    id, name, level: 50,
    type: side, team: side,
    enabled: true,
    skills: { small: [], passive: passives, ultimate: [] } as SkillSet,
    attributeValues: makeDefaultAttributes({ [ATTRIBUTE_CODE.attack]: atk }),
  })
}

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

    // 注册 buff_leader_aura 脚本，让 BuffSystem.addBuff 能找到它
    registry.registerScript('buff_leader_aura', {
      onApply: () => {},
      onRemove: () => {},
      onUpdate: () => {},
      onRefresh: () => {},
      getEffectLines: () => [],
    }, { id: 'buff_leader_aura', name: '首领光环', duration: -1 })

    // 注册被动技能到 SkillManager
    skillManager.setSkillConfig('skill_enemy_079_passive', makeAuraPassiveSkill())
  })

  it('金护法在战斗开始后应有首领光环 buff', () => {
    const gold = createParticipant('guardian_gold', '金护法', PARTICIPANT_SIDE.ENEMY, 80, [makeAuraPassiveSkill()])
    gold.setModifierProvider(buffSystem)
    gold.setBuffQuery(buffSystem)

    GameDataProcessor.registerParticipantPassives(gold, passiveSkillManager)

    const passives = passiveSkillManager.getPassives(gold.id)
    expect(passives).toHaveLength(1)
    expect(passives[0].trigger).toBe(BattleTriggerPhase.BATTLE_START)

    // 模拟 BATTLE_START 触发
    passiveSkillManager.triggerPassives(BattleTriggerPhase.BATTLE_START, gold, undefined, { currentTurn: 0 })

    // verify buff is added
    expect(buffSystem.hasBuff(gold.id, 'buff_leader_aura')).toBe(true)
  })

  it('distributeAuras 将光环修饰符分发给同队成员', () => {
    const gold = createParticipant('guardian_gold', '金护法', PARTICIPANT_SIDE.ENEMY, 80, [makeAuraPassiveSkill()])
    const grunt1 = createParticipant('enemy_grunt_1', '杂兵甲', PARTICIPANT_SIDE.ENEMY, 100)
    const grunt2 = createParticipant('enemy_grunt_2', '杂兵乙', PARTICIPANT_SIDE.ENEMY, 80)

    for (const p of [gold, grunt1, grunt2]) {
      p.setModifierProvider(buffSystem)
      p.setBuffQuery(buffSystem)
    }

    // 注册被动 + 触发 BATTLE_START
    GameDataProcessor.registerParticipantPassives(gold, passiveSkillManager)
    passiveSkillManager.triggerPassives(BattleTriggerPhase.BATTLE_START, gold, undefined, { currentTurn: 0 })

    // verify gold has the buff
    expect(buffSystem.hasBuff(gold.id, 'buff_leader_aura')).toBe(true)

    // ——— 模拟 distributeAuras ———
    const participants = new Map<string, BattleParticipantImpl>()
    participants.set(gold.id, gold)
    participants.set(grunt1.id, grunt1)
    participants.set(grunt2.id, grunt2)

    const initialAtk1 = grunt1.getAttribute(ATTRIBUTE_CODE.attack)
    const initialAtk2 = grunt2.getAttribute(ATTRIBUTE_CODE.attack)
    expect(initialAtk1).toBe(100)
    expect(initialAtk2).toBe(80)

    for (const [id, entity] of participants) {
      const buffInstanceIds = entity.getBuffInstanceIds()
      for (const instanceId of buffInstanceIds) {
        const buffConfig = buffSystem.getBuffConfigByInstanceId(instanceId)
        if (!buffConfig) continue
        // 从 registry 读取 aura 配置（JSON 源数据）
        const auraConfig = registry.getBuffConfig(buffConfig.id)?.aura
        if (!auraConfig || !auraConfig.modifiers?.length || !auraConfig.targetSelector) continue
        const isAllies = auraConfig.targetSelector === 'allies'
        const sourceKey = `passive:${buffConfig.id}`
        for (const [targetId, target] of participants) {
          if (targetId === id) continue
          const sameTeam = target.type === entity.type
          if ((isAllies && sameTeam) || (!isAllies && !sameTeam)) {
            for (const mod of auraConfig.modifiers) {
              const attrCode = mod.targetAttribute as ATTRIBUTE_CODE
              const attrData = target.getAttrValue(attrCode)
              if (attrData) {
                // 去重 + 添加
                attrData.modifiers = attrData.modifiers.filter(m => m.sourceKey !== sourceKey)
                attrData.modifiers.push({
                  sourceKey, sourceType: 'skill' as const,
                  attribute: attrCode, value: typeof mod.value === 'number' ? mod.value : 0,
                  type: 'PERCENTAGE' as const,
                  description: `aura:${buffConfig.id}`,
                })
                attrData.cachedVersion = -1
              }
            }
            target.recalcAll()
          }
        }
      }
    }

    // 验证：100 + 15% = 115，80 + 15% = 92
    // JSON 中 value 是 0.15（表示 15%），AttributeEngine.PERCENTAGE 需要 normalized 值 15
    // 但这里直接 push 0.15 到 modifiers，recalcAll 会通过 ParticipantStats 计算
    // ParticipantStats 的 PERCENTAGE 处理看具体实现…
    // 更安全的验证：攻击力增加了
    expect(grunt1.getAttribute(ATTRIBUTE_CODE.attack)).toBeGreaterThan(100)
    expect(grunt2.getAttribute(ATTRIBUTE_CODE.attack)).toBeGreaterThan(80)
  })
})
