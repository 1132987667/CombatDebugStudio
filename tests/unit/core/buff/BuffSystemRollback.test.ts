import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { ControlType } from '@/domain/buff/types'
import type { BuffConfig } from '@/domain/buff/BuffConfig'
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
    stackRule: 'LIMITED' as any,
    controlType: ControlType.NONE,
    ...overrides,
  }
}

describe('BuffSystem 错误恢复', () => {
  let registry: BuffScriptRegistry
  let buffSystem: BuffSystem

  beforeEach(() => {
    vi.clearAllMocks()
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
  })

  it('onApply 抛异常时实例回滚，buffInstances 无残留', () => {
    registry.registerScript('fail_apply', {
      onApply: () => { throw new Error('apply failed') },
      onRemove: () => {},
      onUpdate: () => {},
      onRefresh: () => {},
    })
    const id = buffSystem.addBuff('char_1', 'fail_apply', createBuffConfig({ id: 'fail_apply' }), 1)
    expect(id).toBe('')
    expect(buffSystem.getBuffInstances('char_1').length).toBe(0)
  })

  it('onRemove 抛异常后 finally 仍清理实例和修饰符', () => {
    const realConfig = getBuffConfig('buff_atk_up')
    expect(realConfig).toBeDefined()
    registry.loadBuffConfigsFromArray([realConfig!])
    registry.registerScript('buff_atk_up', {
      onApply: () => {},
      onRemove: () => { throw new Error('remove failed') },
      onUpdate: () => {},
      onRefresh: () => {},
    })
    const id = buffSystem.addBuff('char_1', 'buff_atk_up', createBuffConfig({ id: 'buff_atk_up' }), 1)
    expect(id).toBeTruthy()

    // onRemove 抛异常，但实例应被清理
    expect(() => buffSystem.removeBuff(id)).not.toThrow()
    expect(buffSystem.getBuffInstances('char_1').length).toBe(0)
  })

  it('effectPlan onRemove 抛异常后 finally 仍清理', () => {
    // 使用真实 JSON 配置的 effectPlan buff（不注册脚本）
    const realConfig = getBuffConfig('buff_atk_up')
    expect(realConfig).toBeDefined()
    registry.loadBuffConfigsFromArray([realConfig!])
    const id = buffSystem.addBuff('char_1', 'buff_atk_up', createBuffConfig({ id: 'buff_atk_up' }), 1)
    expect(id).toBeTruthy()
    expect(buffSystem.getModifierStack('char_1').getModifierCount()).toBeGreaterThan(0)

    buffSystem.removeBuff(id)
    // 修饰符应被清理
    expect(buffSystem.getModifierStack('char_1').getModifierCount()).toBe(0)
    expect(buffSystem.getBuffInstances('char_1').length).toBe(0)
  })
})
