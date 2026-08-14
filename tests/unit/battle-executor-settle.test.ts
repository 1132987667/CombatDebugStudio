/**
 * BattleExecutor.settleDamage 结算核心序列测试
 *
 * settleDamage 是所有伤害路径的唯一结算入口，其不变量序列：
 *   扣血 → TriggerEventBus(DAMAGE_TAKEN) → 仇恨 → 被动(ON_HIT/DAMAGE_TAKEN) → pendingDeaths
 * 本测试直接调用该方法，锁定该序列的每一环，防止结算回归。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BattleExecutor } from '@/domain/battle/service/BattleExecutor'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleTriggerPhase, ParticipantSide } from '@/domain/battle/type/types'
import type { BattleData, BattleEntity } from '@/domain/battle/type/types'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  offByListenerId: vi.fn(),
} as any

function makeEntity(
  id: string,
  name: string,
  team: 'ally' | 'enemy',
  hp: number,
  overrides: Record<string, unknown> = {},
): BattleEntity {
  return {
    id,
    name,
    team,
    currentHealth: hp,
    takeDamage: (n: number) => n,
    heal: () => 0,
    isAlive: () => overrides.alive ?? hp > 0,
    afterAction: () => {},
    getAttribute: () => 0,
    getSkillIds: () => [],
    hasBuff: () => false,
    ...overrides,
  } as unknown as BattleEntity
}

function makeBattle(): BattleData {
  return {
    currentTurn: 1,
    battleId: 'b1',
    participants: new Map(),
  } as unknown as BattleData
}

describe('BattleExecutor.settleDamage 结算序列', () => {
  let executor: BattleExecutor
  let buffSystem: BuffSystem
  let triggerPassives: ReturnType<typeof vi.fn>
  let cleanupComboState: ReturnType<typeof vi.fn>
  let cleanupRotatingState: ReturnType<typeof vi.fn>
  let recordThreat: ReturnType<typeof vi.fn>
  let hasBuffWithTag: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, createMockLogManager())
    buffSystem.getEventBus = vi.fn(() => mockEventBus)
    triggerPassives = vi.fn()
    cleanupComboState = vi.fn()
    cleanupRotatingState = vi.fn()
    recordThreat = vi.fn()
    hasBuffWithTag = vi.fn(() => false)

    const skillManager = {
      getExecutor: () => ({ cleanupComboState, cleanupRotatingState }),
    } as unknown as SkillManager

    executor = new BattleExecutor(
      skillManager,
      {} as any,
      { triggerPassives, drainLastTriggeredPassives: () => [] } as any,
      {} as any,
      {} as any,
      buffSystem,
      undefined,
      { recordThreat } as any,
    )
    buffSystem.hasBuffWithTag = hasBuffWithTag

    LoggerProvider.logger = createMockLogManager()
  })

  it('命中结算：扣血 → DAMAGE_TAKEN 事件 → ON_HIT/DAMAGE_TAKEN 被动，返回实际伤害', () => {
    mockEventBus.emit.mockClear()
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const takeDamage = vi.fn((n: number) => n)
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50, { takeDamage })
    const battle = makeBattle()

    const actual = executor.settleDamage(source, target, 30, 35, false, battle)

    expect(actual).toBe(30)
    // 扣血：takeDamage 收到最终伤害 30（护盾/能量吸收已由 takeDamage 内部处理）
    expect(takeDamage).toHaveBeenCalledWith(30)
    // DAMAGE_TAKEN 事件（驱动反伤/荆棘）
    const emitCall = mockEventBus.emit.mock.calls.find(
      (c: unknown[]) => c[0] === BattleTriggerPhase.DAMAGE_TAKEN,
    )
    expect(emitCall).toBeTruthy()
    expect(emitCall[1]).toMatchObject({
      phase: BattleTriggerPhase.DAMAGE_TAKEN,
      sourceId: 's1',
      targetId: 't1',
      value: 30,
      extra: { damage: 30, rawDamage: 35, isCritical: false },
    })
    // 仇恨记录（有来源时）
    expect(recordThreat).toHaveBeenCalledWith('s1', 't1', 30, false)
    // 被动触发：ON_HIT + DAMAGE_TAKEN
    expect(triggerPassives).toHaveBeenCalledTimes(2)
  })

  it('伤害被完全吸收（takeDamage 返回 0）：提前返回 0，不发事件/被动/仇恨', () => {
    mockEventBus.emit.mockClear()
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50, {
      takeDamage: () => 0,
    })
    const battle = makeBattle()

    const actual = executor.settleDamage(source, target, 30, 30, false, battle)

    expect(actual).toBe(0)
    expect(mockEventBus.emit).not.toHaveBeenCalled()
    expect(recordThreat).not.toHaveBeenCalled()
    expect(triggerPassives).not.toHaveBeenCalled()
  })

  it('击杀：死亡目标进入 pendingDeaths，且清理 combo/rotating 状态', () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50, {
      isAlive: () => false,
    })
    const battle = makeBattle()

    executor.settleDamage(source, target, 50, 55, false, battle)

    expect(cleanupComboState).toHaveBeenCalledWith('t1')
    expect(cleanupRotatingState).toHaveBeenCalledWith('t1')
    const deaths = executor.drainPendingDeaths()
    expect(deaths).toHaveLength(1)
    expect(deaths[0]).toMatchObject({ deadId: 't1', killerId: 's1' })
    expect(deaths[0].battle).toBe(battle)
  })

  it('无来源（系统伤害）：DAMAGE_TAKEN 的 sourceId 为空串，不记录仇恨，仍触发 DAMAGE_TAKEN 被动', () => {
    mockEventBus.emit.mockClear()
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50)
    const battle = makeBattle()

    executor.settleDamage(null, target, 10, 10, false, battle)

    const emitCall = mockEventBus.emit.mock.calls.find(
      (c: unknown[]) => c[0] === BattleTriggerPhase.DAMAGE_TAKEN,
    )
    expect(emitCall[1].sourceId).toBe('')
    expect(recordThreat).not.toHaveBeenCalled()
    // DAMAGE_TAKEN 被动（目标侧）仍触发
    expect(triggerPassives).toHaveBeenCalledTimes(1)
  })

  it('deferHitPassives=true：跳过 ON_HIT/DAMAGE_TAKEN 被动（由调用方日志后触发）', () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50)
    const battle = makeBattle()

    executor.settleDamage(source, target, 30, 35, false, battle, true)

    expect(triggerPassives).not.toHaveBeenCalled()
    // 但 DAMAGE_TAKEN 事件与仇恨仍在
    expect(mockEventBus.emit).toHaveBeenCalled()
    expect(recordThreat).toHaveBeenCalled()
  })
})
