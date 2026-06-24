import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { StackRule, ControlType } from '@/domain/buff/types'
import type { BuffConfig } from '@/domain/buff/types'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))

vi.mock('@/infrastructure/adapters/logging', () => ({
  battleLogManager: { addDebugLog: () => {}, addSystemLog: () => {} },
  LogLevel: { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
}))

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
    controlPriority: 0,
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
    registry.registerScript('atk_buff', {
      ...noopScript,
    })
    registry.loadBuffConfigsFromArray([
      { id: 'atk_buff', name: 'ATK Up', attributes: { ATK: '+50' } },
    ])
    buffSystem = new BuffSystem(registry)
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
      const config = createTestBuffConfig({ id: 'atk_buff' })
      const instanceId = buffSystem.addBuff('char_1', 'atk_buff', config, 1)

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
      expect(instances.length).toBe(2)
      expect(id3).toBe(instances[0].id)
    })

    it('should allow INDEPENDENT stacking', () => {
      const config = createTestBuffConfig({ stackRule: StackRule.INDEPENDENT })
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
