/**
 * buff-duration-zero.test.ts — duration 边界语义（0 回合 ≠ 永久）
 *
 * 回归锁定（2026-09-22 修复）：addBuff 曾用 `duration || -1`，调试面板注入的
 * 0 回合被吞成 -1 永久；updatePerTurn 的移除条件 `duration > 0` 也排除了 0。
 * 现约定：-1 永久（跳过递减）、正数 N 回合、0 = 仅施加当轮存在（下一轮 updatePerTurn 移除）。
 *
 * 运行: npx vitest run tests/unit/buff-duration-zero.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import { createParticipantFromEnemy } from '@tests/fixtures/participants'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'

const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn(), offByListenerId: vi.fn() }

function makeBuffCfg(id: string, duration: number): BuffJsonEntry {
  return {
    id,
    name: id,
    description: '',
    duration,
    maxStacks: 1,
    stackRule: 'limited',
    polarity: 'positive',
    effects: [
      { type: 'modifier', params: { attributes: { attack: { value: 5, type: 'ADDITIVE' } } } },
    ],
  } as unknown as BuffJsonEntry
}

describe('duration 边界语义', () => {
  let buffSystem: BuffSystem
  let entity: BattleEntity
  let entityId: string

  beforeEach(() => {
    const mockLogger = createMockLogManager()
    LoggerProvider.logger = mockLogger
    const registry = new BuffScriptRegistry()
    registry.loadBuffConfigsFromArray([
      makeBuffCfg('test_d0', 0),
      makeBuffCfg('test_d2', 2),
      makeBuffCfg('test_dm1', -1),
    ])
    buffSystem = new BuffSystem(registry, mockEventBus as never, mockLogger)

    BattleParticipantImpl.eventBus = mockEventBus as never
    const p = createParticipantFromEnemy('yaotu_gold', ParticipantSide.ENEMY)
    if (!p) throw new Error('配置缺失')
    p.setBuffQuery(buffSystem as never)
    entity = p as unknown as BattleEntity
    entityId = p.id
  })

  it('配置 duration:0 透传到实例，不再被吞成 -1 永久', () => {
    buffSystem.addBuff(entityId, 'test_d0', {}, 1)
    const inst = buffSystem.getBuffInstances(entityId).find((i) => i.buffId === 'test_d0')
    expect(inst?.duration).toBe(0)
    expect(inst?.remainingTurns).toBe(0)
  })

  it('duration:0 施加当轮仍在（startTurn 守卫），下一轮 updatePerTurn 移除', () => {
    buffSystem.addBuff(entityId, 'test_d0', {}, 1)

    buffSystem.updatePerTurn(entityId, 1) // 施加当轮结算：不扣不减
    expect(buffSystem.getBuffInstances(entityId).some((i) => i.buffId === 'test_d0')).toBe(true)

    buffSystem.updatePerTurn(entityId, 2) // 下一轮：递减到 -1 → 移除
    expect(buffSystem.getBuffInstances(entityId).some((i) => i.buffId === 'test_d0')).toBe(false)
  })

  it('duration:-1 永久：跨多轮不递减不移除', () => {
    buffSystem.addBuff(entityId, 'test_dm1', {}, 1)
    buffSystem.updatePerTurn(entityId, 2)
    buffSystem.updatePerTurn(entityId, 3)
    const inst = buffSystem.getBuffInstances(entityId).find((i) => i.buffId === 'test_dm1')
    expect(inst).toBeDefined()
    expect(inst?.remainingTurns).toBe(-1)
  })

  it('duration:2 正数语义不回归：第 3 轮结束移除', () => {
    buffSystem.addBuff(entityId, 'test_d2', {}, 1)
    buffSystem.updatePerTurn(entityId, 2)
    expect(
      buffSystem.getBuffInstances(entityId).find((i) => i.buffId === 'test_d2')?.remainingTurns,
    ).toBe(1)
    buffSystem.updatePerTurn(entityId, 3)
    expect(buffSystem.getBuffInstances(entityId).some((i) => i.buffId === 'test_d2')).toBe(false)
  })
})
