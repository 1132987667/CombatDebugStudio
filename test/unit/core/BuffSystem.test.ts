import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BuffSystem } from '@/core/BuffSystem'
import { BuffScriptRegistry } from '@/core/BuffScriptRegistry'
import { MountainGodBuff } from '@/scripts/combat/MountainGodBuff'

describe('BuffSystem', () => {
  let buffSystem: BuffSystem
  let registry: BuffScriptRegistry

  beforeEach(() => {
    // 重置单例
    (BuffSystem as any).instance = undefined
    (BuffScriptRegistry as any).instance = undefined
    
    buffSystem = BuffSystem.getInstance()
    registry = BuffScriptRegistry.getInstance()
    
    // 注册测试脚本
    registry.registerScript(
      MountainGodBuff.BUFF_ID,
      new MountainGodBuff()
    )
  })

  it('should add a buff to a character', () => {
    const characterId = 'test_character'
    const buffId = MountainGodBuff.BUFF_ID
    const config = {
      id: buffId,
      name: 'Test Buff',
      description: 'Test description',
      duration: 10000,
      maxStacks: 1,
      cooldown: 5000,
      parameters: {}
    }

    const instanceId = buffSystem.addBuff(characterId, buffId, config)
    
    expect(instanceId).toBeDefined()
    expect(instanceId.includes(characterId)).toBe(true)
    expect(instanceId.includes(buffId)).toBe(true)
  })

  it('should remove a buff from a character', () => {
    const characterId = 'test_character'
    const buffId = MountainGodBuff.BUFF_ID
    const config = {
      id: buffId,
      name: 'Test Buff',
      description: 'Test description',
      duration: 10000,
      maxStacks: 1,
      cooldown: 5000,
      parameters: {}
    }

    const instanceId = buffSystem.addBuff(characterId, buffId, config)
    const removed = buffSystem.removeBuff(instanceId)
    
    expect(removed).toBe(true)
  })

  it('should refresh a buff', () => {
    const characterId = 'test_character'
    const buffId = MountainGodBuff.BUFF_ID
    const config = {
      id: buffId,
      name: 'Test Buff',
      description: 'Test description',
      duration: 10000,
      maxStacks: 1,
      cooldown: 5000,
      parameters: {}
    }

    const instanceId = buffSystem.addBuff(characterId, buffId, config)
    const refreshed = buffSystem.refreshBuff(instanceId)
    
    expect(refreshed).toBe(true)
  })

  it('should get buff instances for a character', () => {
    const characterId = 'test_character'
    const buffId = MountainGodBuff.BUFF_ID
    const config = {
      id: buffId,
      name: 'Test Buff',
      description: 'Test description',
      duration: 10000,
      maxStacks: 1,
      cooldown: 5000,
      parameters: {}
    }

    buffSystem.addBuff(characterId, buffId, config)
    const instances = buffSystem.getBuffInstances(characterId)
    
    expect(instances.length).toBe(1)
    expect(instances[0].characterId).toBe(characterId)
  })

  it('should clear all buffs for a character', () => {
    const characterId = 'test_character'
    const buffId = MountainGodBuff.BUFF_ID
    const config = {
      id: buffId,
      name: 'Test Buff',
      description: 'Test description',
      duration: 10000,
      maxStacks: 1,
      cooldown: 5000,
      parameters: {}
    }

    buffSystem.addBuff(characterId, buffId, config)
    buffSystem.clearAllBuffs(characterId)
    
    const instances = buffSystem.getBuffInstances(characterId)
    expect(instances.length).toBe(0)
  })

  it('should update buffs and remove expired ones', () => {
    const characterId = 'test_character'
    const buffId = MountainGodBuff.BUFF_ID
    const config = {
      id: buffId,
      name: 'Test Buff',
      description: 'Test description',
      duration: 100, // 100ms duration
      maxStacks: 1,
      cooldown: 5000,
      parameters: {}
    }

    const instanceId = buffSystem.addBuff(characterId, buffId, config)
    
    // Advance time by 200ms
    vi.setSystemTime(Date.now() + 200)
    
    buffSystem.update(100)
    
    const instances = buffSystem.getBuffInstances(characterId)
    expect(instances.length).toBe(0)
  })
})
