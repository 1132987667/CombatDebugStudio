import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { StackRule, ControlType } from '@/domain/buff/types'
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

/** 从真实 JSON 配置加载 buff 的属性数据 */
const realAtkBuff = getBuffConfig('buff_atk_up')
const realAttributes = realAtkBuff?.attributes ?? {}

function createTestBuffConfig(overrides?: Partial<BuffConfig>): BuffConfig {
  return {
    id: 'test_buff',
    name: 'Test Buff',
    description: 'A test buff',
    duration: 3,
    maxStacks: 1,
    cooldown: 0,
    stackRule: StackRule.INDEPENDENT,
    controlType: ControlType.NONE,
    ...overrides,
  }
}

const noopScript = {
  onApply: () => {},
  onRemove: () => {},
  onUpdate: () => {},
  onRefresh: () => {},
}

describe('BuffSystem', () => {
  let registry: BuffScriptRegistry
  let buffSystem: BuffSystem

  beforeEach(() => {
    registry = new BuffScriptRegistry()
    registry.registerScript('test_buff', { ...noopScript })
    // 用真实 JSON 配置替换内联 Mock 数据
    const realConfig = getBuffConfig('buff_atk_up')
    if (realConfig) {
      registry.loadBuffConfigsFromArray([realConfig])
    }
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
  })

  describe('addBuff', () => {
    it('should add a buff and return instance id', () => {
      const config = createTestBuffConfig()
      const instanceId = buffSystem.addBuff('char_1', 'test_buff', config, 1)

      expect(instanceId).toBeTruthy()
      expect(instanceId).toContain('char_1')
    })

    it('should return empty string for unknown buff id', () => {
      const config = createTestBuffConfig()
      const instanceId = buffSystem.addBuff('char_1', 'unknown_buff', config, 1)

      expect(instanceId).toBe('')
    })

    it('should create modifier stack when adding buff with attributes', () => {
      const config = createTestBuffConfig({ id: 'buff_atk_up' })
      const instanceId = buffSystem.addBuff('char_1', 'buff_atk_up', config, 1)

      expect(instanceId).toBeTruthy()
      const stack = buffSystem.getModifierStack('char_1')
      expect(stack).toBeDefined()
    })

    it('should enforce REFRESH stack rule', () => {
      const config = createTestBuffConfig({ stackRule: StackRule.REFRESH })
      const id1 = buffSystem.addBuff('char_1', 'test_buff', config, 1)
      const id2 = buffSystem.addBuff('char_1', 'test_buff', config, 1)

      const instances = buffSystem.getBuffInstances('char_1')
      expect(instances.length).toBe(1)
      expect(instances[0].id).toBe(id2)
    })

    it('should enforce LIMITED stack rule', () => {
      const config = createTestBuffConfig({
        stackRule: StackRule.LIMITED,
        maxStacks: 2,
      })
      buffSystem.addBuff('char_1', 'test_buff', config, 1)
      buffSystem.addBuff('char_1', 'test_buff', config, 1)
      const id3 = buffSystem.addBuff('char_1', 'test_buff', config, 1)

      const instances = buffSystem.getBuffInstances('char_1')
      // ponytail: LIMITED 规则是 1 个实例 + 层数叠加，不是多个实例
      expect(instances.length).toBe(1)
      expect(instances[0].currentStacks).toBe(2)
      expect(id3).toBe(instances[0].id)
    })

    it('should allow INDEPENDENT stacking', () => {
      const config = createTestBuffConfig({
        stackRule: StackRule.INDEPENDENT,
        maxStacks: 10, // ponytail: 覆盖默认的 maxStacks:1
      })
      buffSystem.addBuff('char_1', 'test_buff', config, 1)
      buffSystem.addBuff('char_1', 'test_buff', config, 1)
      buffSystem.addBuff('char_1', 'test_buff', config, 1)

      const instances = buffSystem.getBuffInstances('char_1')
      expect(instances.length).toBe(3)
    })
  })

  describe('removeBuff', () => {
    it('should remove an existing buff', () => {
      const config = createTestBuffConfig()
      const instanceId = buffSystem.addBuff('char_1', 'test_buff', config, 1)

      const removed = buffSystem.removeBuff(instanceId)
      expect(removed).toBe(true)

      const instances = buffSystem.getBuffInstances('char_1')
      expect(instances.length).toBe(0)
    })

    it('should return false for non-existent buff', () => {
      const removed = buffSystem.removeBuff('non_existent')
      expect(removed).toBe(false)
    })

    it('should return false for already removed buff', () => {
      const config = createTestBuffConfig()
      const instanceId = buffSystem.addBuff('char_1', 'test_buff', config, 1)

      buffSystem.removeBuff(instanceId)
      const removedAgain = buffSystem.removeBuff(instanceId)

      expect(removedAgain).toBe(false)
    })

    it('should cascade remove child buffs when parent is removed', () => {
      const parentConfig = createTestBuffConfig({ id: 'parent_buff', cascadeRemove: true })
      const childConfig = createTestBuffConfig({
        id: 'child_buff',
        cascadeRemove: true,
        duration: -1,
        attributes: { attack: '+50' },
      })
      registry.loadBuffConfigsFromArray([
        { id: 'child_buff', name: 'Child Buff', attributes: { attack: '+50' } },
      ])
      registry.registerScript('parent_buff', { ...noopScript })
      registry.registerScript('child_buff', { ...noopScript })

      const parentId = buffSystem.addBuff('char_1', 'parent_buff', parentConfig, 1)
      const childId = buffSystem.addBuff('char_1', 'child_buff', childConfig, 1, undefined, parentId)

      // 验证父子都存在
      expect(buffSystem.getBuffInstances('char_1').length).toBe(2)

      // 移除父 Buff
      buffSystem.removeBuff(parentId)

      // 子 Buff 应被级联移除
      const remaining = buffSystem.getBuffInstances('char_1')
      expect(remaining.length).toBe(0)
      expect(remaining.find((b) => b.id === childId)).toBeUndefined()
    })

    it('should NOT cascade remove child buffs when cascadeRemove is false', () => {
      const parentConfig = createTestBuffConfig({ id: 'parent_buff_2' })
      const childConfig = createTestBuffConfig({
        id: 'child_buff_2',
        cascadeRemove: false, // 弱依赖
        duration: -1,
      })
      registry.registerScript('parent_buff_2', { ...noopScript })
      registry.registerScript('child_buff_2', { ...noopScript })

      const parentId = buffSystem.addBuff('char_1', 'parent_buff_2', parentConfig, 1)
      buffSystem.addBuff('char_1', 'child_buff_2', childConfig, 1, undefined, parentId)

      expect(buffSystem.getBuffInstances('char_1').length).toBe(2)

      buffSystem.removeBuff(parentId)

      // 子 Buff 应保留（弱依赖）
      const remaining = buffSystem.getBuffInstances('char_1')
      expect(remaining.length).toBe(1)
    })
  })

  describe('getModifierStack', () => {
    it('should create stack on first access', () => {
      const stack = buffSystem.getModifierStack('new_char')

      expect(stack).toBeDefined()
    })
  })

  describe('getBuffInstances', () => {
    it('should return buffs for a specific character', () => {
      const config = createTestBuffConfig()
      buffSystem.addBuff('char_1', 'test_buff', config, 1)
      buffSystem.addBuff('char_2', 'test_buff', config, 1)

      const char1Buffs = buffSystem.getBuffInstances('char_1')
      const char2Buffs = buffSystem.getBuffInstances('char_2')

      expect(char1Buffs.length).toBe(1)
      expect(char2Buffs.length).toBe(1)
    })

    it('should return empty array for character with no buffs', () => {
      const instances = buffSystem.getBuffInstances('no_buff_char')
      expect(instances.length).toBe(0)
    })
  })
})
