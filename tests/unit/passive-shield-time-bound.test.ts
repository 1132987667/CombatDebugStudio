/**
 * passive-shield-time-bound.test.ts — 被动护盾净累积的时间上界回归
 *
 * 背景：enemy-skills.json 修复字段错位（trigger/probability → triggerTimes/triggerProbability）后，
 *       引用 buff_shield_basic 的 8 条被动从"开场触发 1 次"变为"每次受击按概率触发（0.15~0.2）"，
 *       触发频次确定性上移。buff_shield_basic 为 maxStacks:0 + stackRule:independent（规格 §16：
 *       护盾可叠加、无上限，叠加/显式回收语义已由 buff-shield-aura-apply.test.ts 锁定），
 *       故本文件只锁定"时间维度"结论：duration:2 使护盾值随时间进入稳态上界，而非无界增长。
 *
 * 覆盖：
 * - duration:2 的实例经 updatePerTurn 到期自动移除并精确回收（既有测试只测 removeBuff 显式移除）
 * - 每回合恒定上盾的最坏情形：稳态峰值不超过 3 份护盾
 * - 真实被动链路 worst case（触发概率强制 1，每次受击必上盾）20 回合不无界
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { SkillManager } from '@/domain/skill/SkillManager'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide, BattleTriggerPhase } from '@/domain/battle/type/types'
import { SeededRandom } from '@/shared/utils/SeededRandom'
import { makeDefaultAttributes } from '@tests/fixtures/participants'
import { getSkillConfig } from '@tests/fixtures/loadTestData'
import type { SkillConfig } from '@/domain/skill/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'

const SHIELD_BUFF_ID = 'buff_shield_basic'
/** 测试参与者最大气血 1000 × 15% = 150 */
const SHIELD_PER_STACK = 150

/** enemy-buffs.json 不在 registry 默认预载源（仅 buffs.json），需从 GameDataProcessor 取 */
function findShieldBuffConfig(): BuffJsonEntry | undefined {
  return GameDataProcessor.getBuffsData().find((b) => b.id === SHIELD_BUFF_ID)
}

const mockEventBus = {
  emit: () => {},
  on: () => {},
  off: () => {},
  offByListenerId: () => {},
} as any
const mockLogger = {
  addDebugLog: () => {},
  addSystemLog: () => {},
  addBattleLog: () => {},
  addActionLog: () => {},
  clearLogs: () => {},
  syncBattleLogs: () => {},
} as any

/** 创建一个携带指定被动的测试参与者，并接好 BuffSystem 的各种引用 */
function createParticipant(
  buffSystem: BuffSystem,
  passiveSkills: SkillConfig[],
): BattleParticipantImpl {
  const participant = new BattleParticipantImpl({
    id: 'shield_test_char',
    name: '护盾测试角色',
    level: 50,
    team: ParticipantSide.ALLY,
    enabled: true,
    skills: { small: [], passive: passiveSkills, ultimate: [] },
    attributeValues: makeDefaultAttributes(),
  })
  participant.setModifierProvider(buffSystem)
  participant.setBuffQuery(buffSystem)
  // percent_max_hp 护盾需要解析角色读取最大气血（引擎在 BattleSystem.initialize 注入 resolver）
  buffSystem.setCharacterResolver((id) => (id === participant.id ? participant : undefined))
  return participant
}

describe('被动护盾净累积时间上界', () => {
  let registry: BuffScriptRegistry
  let buffSystem: BuffSystem
  let skillManager: SkillManager
  let passiveSkillManager: PassiveSkillManager

  beforeEach(() => {
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
    buffSystem.setRng(new SeededRandom('shield-time-bound'))
    skillManager = new SkillManager(buffSystem)
    passiveSkillManager = PassiveSkillManager.create(skillManager, buffSystem)

    const shieldCfg = findShieldBuffConfig()
    expect(shieldCfg, 'buff_shield_basic 配置应存在').toBeTruthy()
    registry.loadBuffConfigsFromArray([shieldCfg!])
  })

  it('前置：护盾配置与最大气血基线正确', () => {
    const participant = createParticipant(buffSystem, [])
    expect(participant.getAttribute(ATTRIBUTE_CODE.maxHealth)).toBe(1000)

    const cfg = findShieldBuffConfig()!
    expect(cfg.maxStacks).toBe(0)
    expect(cfg.stackRule).toBe('independent')
    expect(cfg.duration).toBe(2)
  })

  it('duration:2 到期自动回收：推进 2 回合后实例清零、护盾归零', () => {
    const p = createParticipant(buffSystem, [])
    for (let i = 0; i < 5; i++) buffSystem.addBuff(p.id, SHIELD_BUFF_ID, {}, 0)

    buffSystem.updatePerTurn(p.id, 1)
    // 第 1 回合：5 个实例仍在（每个剩余 1 回合）
    expect(buffSystem.getShieldValue(p.id)).toBe(5 * SHIELD_PER_STACK)

    buffSystem.updatePerTurn(p.id, 2)
    const instances = buffSystem
      .getBuffInstances(p.id)
      .filter((b) => b.buffId === SHIELD_BUFF_ID)
    expect(instances).toHaveLength(0)
    // onRemove 逐实例精确回收（存的是施加时的 _shieldAmount），净累积归零
    expect(buffSystem.getShieldValue(p.id)).toBe(0)
  })

  it('连续 10 回合每回合上盾：护盾进入稳态上界，不无界增长', () => {
    const p = createParticipant(buffSystem, [])
    const peak: number[] = []

    for (let turn = 0; turn < 10; turn++) {
      buffSystem.addBuff(p.id, SHIELD_BUFF_ID, {}, turn)
      peak.push(buffSystem.getShieldValue(p.id))
      buffSystem.updatePerTurn(p.id, turn)
    }

    // 稳态：任一时刻存活实例不超过 3 个（当轮施加 + 前 2 回合内的存活实例）
    expect(Math.max(...peak)).toBeLessThanOrEqual(3 * SHIELD_PER_STACK)
  })

  it('真实被动链路（触发概率强制 1 的 worst case）：20 回合不无界', () => {
    const realSkill = getSkillConfig('passive_enemy_s2_2_g_p1')
    expect(realSkill, '被动 passive_enemy_s2_2_g_p1 应存在').toBeTruthy()
    expect(realSkill!.triggerTimes).toEqual(['damage_taken'])

    // 把触发概率强制为 1，取"每次受击必上盾"的上界
    const forced: SkillConfig = { ...realSkill!, triggerProbability: 1 }
    skillManager.setSkillConfig('passive_enemy_s2_2_g_p1', forced)

    const p = createParticipant(buffSystem, [forced])
    GameDataProcessor.registerParticipantPassives(p, passiveSkillManager)
    expect(passiveSkillManager.getPassives(p.id)).toHaveLength(1)

    const curve: number[] = []
    for (let turn = 0; turn < 20; turn++) {
      passiveSkillManager.triggerPassives(p, {
        phase: BattleTriggerPhase.DAMAGE_TAKEN,
        currentTurn: turn,
      })
      buffSystem.updatePerTurn(p.id, turn)
      curve.push(buffSystem.getShieldValue(p.id))
    }

    expect(Math.max(...curve)).toBeLessThanOrEqual(3 * SHIELD_PER_STACK)
    expect(curve[curve.length - 1]).toBeLessThanOrEqual(3 * SHIELD_PER_STACK)
  })
})