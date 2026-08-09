import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { ControlType } from '@/domain/buff/types'
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
    stackRule: 'LIMITED' as any,
    controlType: ControlType.NONE,
    ...overrides,
  }
}

describe('BuffSystem 路径判定', () => {
  let registry: BuffScriptRegistry
  let buffSystem: BuffSystem

  beforeEach(() => {
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
  })

  it('Path A: 有脚本的 Buff 走脚本 onApply', () => {
    const applied: string[] = []
    registry.registerScript('buff_a', {
      onApply: (ctx) => { applied.push(ctx.characterId) },
      onRemove: () => {},
      onUpdate: () => {},
      onRefresh: () => {},
    })
    const id = buffSystem.addBuff('char_1', 'buff_a', createBuffConfig({ id: 'buff_a' }), 1)
    expect(id).toBeTruthy()
    expect(applied).toContain('char_1')
  })

  it('Path B: JSON 配置 Buff（无脚本，由 attributes 派生效果）', () => {
    const realConfig = getBuffConfig('buff_atk_up')
    expect(realConfig).toBeDefined()
    registry.loadBuffConfigsFromArray([realConfig!])
    const id = buffSystem.addBuff('char_1', 'buff_atk_up', createBuffConfig({ id: 'buff_atk_up' }), 1)
    expect(id).toBeTruthy()
    const stack = buffSystem.getModifierStack('char_1')
    expect(stack.getModifierCount()).toBeGreaterThan(0)
  })

  it('Path C: 纯配置 Buff（通过调用方 config 传递效果覆盖 JSON）', () => {
    // 加载真实配置，再通过调用方 config.attributes 覆盖
    const realConfig = getBuffConfig('buff_atk_up')
    expect(realConfig).toBeDefined()
    registry.loadBuffConfigsFromArray([realConfig!])
    const id = buffSystem.addBuff('char_1', 'buff_atk_up', {
      ...createBuffConfig({ id: 'buff_atk_up' }),
      attributes: { ATK: '+50' },
    } as any, 1)
    expect(id).toBeTruthy()
    const instances = buffSystem.getBuffInstances('char_1')
    expect(instances.length).toBe(1)
  })

  it('Path D: 显式声明 executionMode=marker 的 Buff 无效果仅注册', () => {
    const id = buffSystem.addBuff('char_1', 'track_marker_buff', createBuffConfig({
      id: 'track_marker_buff',
      executionMode: 'marker',
    }), 1)
    expect(id).toBeTruthy()
  })

  it('Path ERROR: 配置错误的 Buff 返回空字符串', () => {
    const id = buffSystem.addBuff('char_1', 'nonexistent_garbage', createBuffConfig({ id: 'nonexistent_garbage' }), 1)
    expect(id).toBe('')
  })

  it('生命周期间路径一致性：addBuff 与 removeBuff 使用相同路径', () => {
    const calls: string[] = []
    registry.registerScript('buff_consistent', {
      onApply: () => { calls.push('apply') },
      onRemove: () => { calls.push('remove') },
      onUpdate: () => {},
      onRefresh: () => {},
    })
    const id = buffSystem.addBuff('char_1', 'buff_consistent', createBuffConfig({ id: 'buff_consistent' }), 1)
    expect(id).toBeTruthy()
    expect(calls).toEqual(['apply'])
    buffSystem.removeBuff(id)
    expect(calls).toEqual(['apply', 'remove'])
  })
})
