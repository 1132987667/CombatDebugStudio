/**
 * 文件: unified-summary-dot-realdatapath.test.ts
 * 功能: dot 持续伤害进入真实录制战报的回归测试
 * 描述: 修复前 DOT 伤害在真实录制中完全没有 DAMAGE_CALCULATION 事件
 *       （BattleSystem.setDamageCallback 的固定值分支只走 settleDamage，不补发 trace），
 *       导致战报承伤/HP 模拟完全缺失持续伤害。
 *       修复后 requestDamage(origin='dot') 补发 dot 事件，
 *       经 fromRecordedBattle → summarizeBattle 计入承伤与 HP。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { ParticipantSide, BattleStatus } from '@/domain/battle/type/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { TracePhase } from '@/shared/types/trace-event'
import { fromRecordedBattle } from '@/application/service/UnifiedArchiveService'
import { summarizeBattle } from '@/domain/battle/replay/unified/unified-summary'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))

vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    setTimeout(fn: (...args: unknown[]) => void, _ms?: number): symbol {
      fn()
      return Symbol('mock')
    }
    setInterval = () => Symbol('mock')
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

describe('dot 持续伤害进入真实录制战报（BattleSystem 补发 DAMAGE_CALCULATION）', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(
      BATTLE_SYSTEM_TOKEN.toString(),
    )
  })

  it('requestDamage(origin=dot) 补发 dot 事件，战报承伤/HP 计入持续伤害', async () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire'],
      ['guardian_gold'],
    )
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    const battleData = battleSystem.getBattleData()!
    const enemy = enemies[0]
    const initialHp =
      battleSystem.getBattleRecording(battleData.battleId)!.initialState
        .participants.find((p) => p.id === enemy.id)!.currentHealth

    // 模拟 DotEffect 固定值请求（origin='dot'；与 DotEffect.onTick 同调用形态）
    battleSystem.getBuffSystem().requestDamage(enemy.id, 15, 15, undefined, 'dot')

    // 1. traceCollector 已补发 dot 事件（实时可查，无需等战斗结束）
    const dots = battleSystem.traceCollector
      .query({ phase: TracePhase.DAMAGE_CALCULATION })
      .filter((e) => (e.payload as Record<string, unknown>).dot === true)
    expect(dots).toHaveLength(1)
    expect((dots[0].payload as { result: number }).result).toBe(15)
    expect(dots[0].targetId).toBe(enemy.id)
    expect(dots[0].sourceId).toBeUndefined()

    // 2. 结束战斗，traceEvents 写入录制 → 统一存档 → 战报
    await battleSystem.endBattle(ParticipantSide.ALLY)
    const rec = battleSystem.getBattleRecording(battleData.battleId)!
    const archive = fromRecordedBattle(rec)!
    const sum = summarizeBattle(archive)

    expect(sum.units[enemy.id].taken).toBe(15)
    expect(sum.units[enemy.id].hpEnd).toBe(initialHp - 15)
    // dot 无来源，不计入任何单位输出，也不计入命中/暴击分母
    expect(sum.judgment.hits).toBe(0)
    expect(sum.judgment.crits).toBe(0)
  })

  it('触发器脚本伤害（无 origin）不误标为 dot', async () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire'],
      ['guardian_gold'],
    )
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    const battleData = battleSystem.getBattleData()!
    const enemy = enemies[0]

    // 无 origin 的固定值请求（历史触发器脚本）不应补发 dot 事件
    battleSystem.getBuffSystem().requestDamage(enemy.id, 10, 10, undefined)
    const dots = battleSystem.traceCollector
      .query({ phase: TracePhase.DAMAGE_CALCULATION })
      .filter((e) => (e.payload as Record<string, unknown>).dot === true)
    expect(dots).toHaveLength(0)

    await battleSystem.endBattle(ParticipantSide.ALLY)
    const rec = battleSystem.getBattleRecording(battleData.battleId)!
    const archive = fromRecordedBattle(rec)!
    const sum = summarizeBattle(archive)
    // 无来源的伤害不进入承伤（无事件）——保持修复前行为，仅确保不误标 dot
    expect(sum.units[enemy.id].taken).toBe(0)
  })

  it('origin=trigger 补发普通伤害事件：计承伤、不计命中/技能、不误标 dot', async () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire'],
      ['guardian_gold'],
    )
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    const battleData = battleSystem.getBattleData()!
    const enemy = enemies[0]
    const initialHp =
      battleSystem.getBattleRecording(battleData.battleId)!.initialState
        .participants.find((p) => p.id === enemy.id)!.currentHealth

    // 反伤/平摊等触发器脚本固定值伤害（origin='trigger'）
    battleSystem.getBuffSystem().requestDamage(enemy.id, 12, 12, undefined, 'trigger')

    const dmgEvs = battleSystem.traceCollector
      .query({ phase: TracePhase.DAMAGE_CALCULATION })
      .filter((e) => (e.payload as Record<string, unknown>).result === 12)
    expect(dmgEvs).toHaveLength(1)
    expect((dmgEvs[0].payload as { dot?: boolean }).dot).toBeUndefined()
    expect(dmgEvs[0].sourceId).toBeUndefined()

    await battleSystem.endBattle(ParticipantSide.ALLY)
    const rec = battleSystem.getBattleRecording(battleData.battleId)!
    const archive = fromRecordedBattle(rec)!
    const sum = summarizeBattle(archive)
    // 承伤与 HP 计入触发器伤害；无来源 → 不计命中/技能/输出
    expect(sum.units[enemy.id].taken).toBe(12)
    expect(sum.units[enemy.id].hpEnd).toBe(initialHp - 12)
    expect(sum.judgment.hits).toBe(0)
    expect(sum.skills.some((s) => s.damage > 0)).toBe(false)
  })
})


