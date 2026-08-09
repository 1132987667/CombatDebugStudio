import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { StackRule, ControlType } from '@/domain/buff/types'
import type { BuffConfig } from '@/domain/buff/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { getBuffConfig } from '@tests/fixtures/loadTestData'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  offByListenerId: vi.fn(),
}

const mockLogger = {
  addDebugLog: vi.fn(),
  addSystemLog: vi.fn(),
  addBattleLog: vi.fn(),
  addActionLog: vi.fn(),
  clearLogs: vi.fn(),
  syncBattleLogs: vi.fn(),
  getSystemLogs: vi.fn(),
}

LoggerProvider.logger = mockLogger as any

function createBuffConfig(overrides?: Partial<BuffConfig>): BuffConfig {
  return {
    id: 'test_buff',
    name: 'Test Buff',
    description: '',
    duration: 3,
    maxStacks: 1,
    cooldown: 0,
    stackRule: StackRule.INDEPENDENT,
    controlType: ControlType.NONE,
    ...overrides,
  }
}

describe('BuffSystem 生命周期', () => {
  let registry: BuffScriptRegistry
  let buffSystem: BuffSystem

  beforeEach(() => {
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
  })

  describe('Script 路径 (Path A)', () => {
    it('addBuff → updatePerTurn → removeBuff 完整生命周期', () => {
      const log: string[] = []
      registry.registerScript('lifecycle_a', {
        onApply: () => { log.push('apply') },
        onUpdate: (_ctx) => { log.push('update') },
        onRemove: () => { log.push('remove') },
        onRefresh: () => { log.push('refresh') },
      })
      const id = buffSystem.addBuff('char_1', 'lifecycle_a', createBuffConfig({ id: 'lifecycle_a', duration: 5 }), 1)
      expect(id).toBeTruthy()
      expect(log).toEqual(['apply'])

      buffSystem.updatePerTurn('char_1', 2)
      expect(log).toEqual(['apply', 'update'])
      expect(buffSystem.getBuffInstances('char_1').length).toBe(1)

      buffSystem.removeBuff(id)
      expect(log).toEqual(['apply', 'update', 'remove'])
    })

    it('refreshBuff 重置持续时间并调用 onRefresh', () => {
      const log: string[] = []
      registry.registerScript('refresh_a', {
        onApply: () => { log.push('apply') },
        onUpdate: () => {},
        onRemove: () => { log.push('remove') },
        onRefresh: () => { log.push('refresh') },
      })
      const id = buffSystem.addBuff('char_1', 'refresh_a', createBuffConfig({ id: 'refresh_a', duration: 3 }), 1)
      buffSystem.updatePerTurn('char_1', 2)
      buffSystem.updatePerTurn('char_1', 3)
      // 刷新
      const refreshed = buffSystem.refreshBuff(id, 4)
      expect(refreshed).toBe(true)
      expect(log).toEqual(['apply', 'refresh'])

      // 刷新后剩余回合应恢复到 duration
      const instance = buffSystem.getBuffInstanceById(id)
      expect(instance?.remainingTurns).toBe(3)
    })
  })

  describe('effectPlan 路径 (Path B)', () => {
    it('addBuff → updatePerTurn → removeBuff 完整生命周期', () => {
      const realConfig = getBuffConfig('buff_atk_up')
      expect(realConfig).toBeDefined()
      registry.loadBuffConfigsFromArray([realConfig!])
      const id = buffSystem.addBuff('char_1', 'buff_atk_up', createBuffConfig({ id: 'buff_atk_up', duration: 3 }), 1)
      expect(id).toBeTruthy()
      expect(buffSystem.getModifierStack('char_1').getModifierCount()).toBeGreaterThan(0)

      // updatePerTurn
      buffSystem.updatePerTurn('char_1', 2)
      expect(buffSystem.getBuffInstanceById(id)?.remainingTurns).toBe(2)

      // removeBuff 应清除修饰符
      buffSystem.removeBuff(id)
      expect(buffSystem.getModifierStack('char_1').getModifierCount()).toBe(0)
    })
  })

  describe('updatePerTurn 回合递减', () => {
    it('过期 Buff 自动移除', () => {
      registry.registerScript('expire_buff', {
        onApply: () => {},
        onRemove: () => {},
        onUpdate: () => {},
        onRefresh: () => {},
      })
      const id = buffSystem.addBuff('char_1', 'expire_buff', createBuffConfig({ id: 'expire_buff', duration: 2 }), 1)
      expect(buffSystem.getBuffInstances('char_1').length).toBe(1)

      // 第 2 回合 → remainingTurns: 1
      buffSystem.updatePerTurn('char_1', 2)
      expect(buffSystem.getBuffInstanceById(id)?.isActive).toBe(true)

      // 第 3 回合 → remainingTurns: 0 → 过期移除
      buffSystem.updatePerTurn('char_1', 3)
      expect(buffSystem.getBuffInstances('char_1').length).toBe(0)
    })

    it('永久 Buff (duration=-1) 不过期', () => {
      registry.registerScript('perm_buff', {
        onApply: () => {},
        onRemove: () => {},
        onUpdate: () => {},
        onRefresh: () => {},
      })
      buffSystem.addBuff('char_1', 'perm_buff', createBuffConfig({ id: 'perm_buff', duration: -1 }), 1)

      buffSystem.updatePerTurn('char_1', 2)
      buffSystem.updatePerTurn('char_1', 3)
      buffSystem.updatePerTurn('char_1', 100)
      expect(buffSystem.getBuffInstances('char_1').length).toBe(1)
    })
  })

  describe('context.currentTurn 注入', () => {
    it('updatePerTurn 将回合号注入到 context', () => {
      let capturedTurn = -1
      registry.registerScript('turn_buff', {
        onApply: () => {},
        onRemove: () => {},
        onUpdate: (ctx) => { capturedTurn = ctx.currentTurn },
        onRefresh: () => {},
      })
      const id = buffSystem.addBuff('char_1', 'turn_buff', createBuffConfig({ id: 'turn_buff' }), 1)
      buffSystem.updatePerTurn('char_1', 42)
      expect(capturedTurn).toBe(42)
    })

    it('refreshBuff 将回合号注入到 context', () => {
      let capturedTurn = -1
      registry.registerScript('refresh_turn', {
        onApply: () => {},
        onRemove: () => {},
        onUpdate: () => {},
        onRefresh: (ctx) => { capturedTurn = ctx.currentTurn },
      })
      const id = buffSystem.addBuff('char_1', 'refresh_turn', createBuffConfig({ id: 'refresh_turn' }), 1)
      buffSystem.refreshBuff(id, 77)
      expect(capturedTurn).toBe(77)
    })
  })
})
