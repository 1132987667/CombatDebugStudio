import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { ControlType } from '@/domain/buff/types'
import type { BuffConfig } from '@/domain/buff/types'
import type { BattleTriggerPhase } from '@/domain/battle/type/types'
import { getBuffConfig } from '@tests/fixtures/loadTestData'
import { createMockLogManager } from '@tests/mocks/MockLogger'

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  offByListenerId: vi.fn(),
}

const mockLogger = createMockLogManager()

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

describe('BuffSystem 触发器 phase 归一化（#6）', () => {
  let registry: BuffScriptRegistry
  let buffSystem: BuffSystem

  beforeEach(() => {
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
  })

  it('动态 Buff 携带旧命名 triggers phase 时在注册入口归一化', () => {
    mockEventBus.on.mockClear()
    const id = buffSystem.addBuff('char_1', 'dynamic_trigger_buff', createBuffConfig({
      id: 'dynamic_trigger_buff',
      executionMode: 'marker',
      triggers: [{
        phase: 'ON_TURN_START' as unknown as BattleTriggerPhase,
        scriptId: 'heal_percent_max_hp',
      }],
    }), 1)
    expect(id).toBeTruthy()
    const call = mockEventBus.on.mock.calls.find((c) => c[0] === 'turn_start')
    expect(call).toBeDefined()
    // 不应使用旧命名注册
    expect(mockEventBus.on.mock.calls.find((c) => c[0] === 'ON_TURN_START')).toBeUndefined()
  })

  it('动态 Buff 携带已归一化枚举 phase 时幂等通过', () => {
    mockEventBus.on.mockClear()
    const id = buffSystem.addBuff('char_1', 'enum_trigger_buff', createBuffConfig({
      id: 'enum_trigger_buff',
      executionMode: 'marker',
      triggers: [{
        phase: 'turn_start',
        scriptId: 'heal_percent_max_hp',
      }],
    }), 1)
    expect(id).toBeTruthy()
    expect(mockEventBus.on.mock.calls.find((c) => c[0] === 'turn_start')).toBeDefined()
  })

  it('无法识别的触发器阶段使 addBuff 回滚，不残留半初始化实例', () => {
    const id = buffSystem.addBuff('char_1', 'bad_trigger_buff', createBuffConfig({
      id: 'bad_trigger_buff',
      executionMode: 'marker',
      triggers: [{
        phase: 'NOT_A_PHASE' as unknown as BattleTriggerPhase,
        scriptId: 'heal_percent_max_hp',
      }],
    }), 1)
    expect(id).toBe('')
    expect(buffSystem.getBuffInstances('char_1')).toHaveLength(0)
  })
})
