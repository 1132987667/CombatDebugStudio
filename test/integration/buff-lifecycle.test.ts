import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BuffSystem } from '@/core/BuffSystem'
import { BuffScriptRegistry } from '@/core/BuffScriptRegistry'
import { MountainGodBuff } from '@/scripts/combat/MountainGodBuff'

describe('Buff Lifecycle', () => {
  let buffSystem: BuffSystem
  let registry: BuffScriptRegistry

  beforeEach(() => {
    // 重置单例 - 使用更安全的方法
    if ((BuffSystem as any).instance) {
      (BuffSystem as any).instance = undefined
    }
    if ((BuffScriptRegistry as any).instance) {
      (BuffScriptRegistry as any).instance = undefined
    }
    
    buffSystem = BuffSystem.getInstance()
    registry = BuffScriptRegistry.getInstance()
    
    // 注册测试脚本
    registry.registerScript(
      MountainGodBuff.BUFF_ID,
      new MountainGodBuff()
    )
  })

  it('should complete full buff lifecycle', () => {
    const characterId = 'test_character'
    const buffId = MountainGodBuff.BUFF_ID
    const config = {
      id: buffId,
      name: '山神降临',
      description: 'Test description',
      duration: 1000, // 1 second duration
      maxStacks: 1,
      cooldown: 5000,
      parameters: {
        attackBonus: 50,
        defenseBonus: 30,
        regeneration: 5,
        refreshBonus: 10
      }
    }

    // 1. Add buff
    const instanceId = buffSystem.addBuff(characterId, buffId, config)
    expect(instanceId).toBeDefined()

    // 2. Check if buff is active
    let instances = buffSystem.getBuffInstances(characterId)
    expect(instances.length).toBe(1)
    expect(instances[0].isActive).toBe(true)

    // 3. Simulate time passing (half duration)
    vi.setSystemTime(Date.now() + 500)
    buffSystem.update(500)

    // Buff should still be active
    instances = buffSystem.getBuffInstances(characterId)
    expect(instances.length).toBe(1)
    expect(instances[0].isActive).toBe(true)

    // 4. Simulate time passing (full duration)
    vi.setSystemTime(Date.now() + 1000)
    buffSystem.update(500)

    // Buff should be removed
    instances = buffSystem.getBuffInstances(characterId)
    expect(instances.length).toBe(0)
  })

  it('should handle buff refresh correctly', () => {
    const characterId = 'test_character'
    const buffId = MountainGodBuff.BUFF_ID
    const config = {
      id: buffId,
      name: '山神降临',
      description: 'Test description',
      duration: 5000,
      maxStacks: 1,
      cooldown: 10000,
      parameters: {
        attackBonus: 50,
        defenseBonus: 30,
        regeneration: 5,
        refreshBonus: 10
      }
    }

    // Add buff
    const instanceId = buffSystem.addBuff(characterId, buffId, config)
    
    // Wait a bit
    vi.setSystemTime(Date.now() + 1000)
    buffSystem.update(1000)

    // Refresh buff
    const refreshed = buffSystem.refreshBuff(instanceId)
    expect(refreshed).toBe(true)

    // Buff should still be active
    const instances = buffSystem.getBuffInstances(characterId)
    expect(instances.length).toBe(1)
    expect(instances[0].isActive).toBe(true)
  })

  it('should handle multiple buffs on same character', () => {
    const characterId = 'test_character'
    const buffId = MountainGodBuff.BUFF_ID
    const config = {
      id: buffId,
      name: '山神降临',
      description: 'Test description',
      duration: 5000,
      maxStacks: 1,
      cooldown: 10000,
      parameters: {
        attackBonus: 50,
        defenseBonus: 30,
        regeneration: 5,
        refreshBonus: 10
      }
    }

    // Add buff twice (should create two instances)
    const instanceId1 = buffSystem.addBuff(characterId, buffId, config)
    const instanceId2 = buffSystem.addBuff(characterId, buffId, config)

    expect(instanceId1).not.toBe(instanceId2)

    const instances = buffSystem.getBuffInstances(characterId)
    expect(instances.length).toBe(2)

    // Remove one buff
    buffSystem.removeBuff(instanceId1)

    const remainingInstances = buffSystem.getBuffInstances(characterId)
    expect(remainingInstances.length).toBe(1)
  })
})
