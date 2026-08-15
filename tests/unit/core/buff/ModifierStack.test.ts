/**
 * ModifierStack 单元测试
 *
 * 覆盖版本缓存（延迟计算）与精确移除：
 * - getModifiers 在无变更时返回同一缓存引用（O(1) 热路径）
 * - add/remove/clear 后缓存失效重建
 * - removeModifier(instanceId, attribute, type) 精确移除指定类型
 * - getModifierCount 缓存
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ModifierStack } from '@/domain/buff/ModifierStack'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

describe('ModifierStack 版本缓存（声明式数据块 + 延迟计算）', () => {
  let stack: ModifierStack

  beforeEach(() => {
    stack = new ModifierStack()
  })

  it('getModifiers(attribute) 无变更时返回同一缓存引用', () => {
    stack.addModifier('buff_1', ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE)
    const first = stack.getModifiers(ATTRIBUTE_CODE.attack)
    const second = stack.getModifiers(ATTRIBUTE_CODE.attack)
    expect(first).toBe(second)
    expect(first).toHaveLength(1)
  })

  it('addModifier 后单属性缓存内容反映最新状态', () => {
    stack.addModifier('buff_1', ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE)
    stack.getModifiers(ATTRIBUTE_CODE.attack)
    stack.addModifier('buff_2', ATTRIBUTE_CODE.attack, 5, ModifierType.ADDITIVE)
    const result = stack.getModifiers(ATTRIBUTE_CODE.attack)
    expect(result).toHaveLength(2)
    expect(result.map((m) => m.sourceKey)).toEqual(['buff_1', 'buff_2'])
  })

  it('getModifiers() 无参聚合在变更后重建新数组', () => {
    stack.addModifier('buff_1', ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE)
    const first = stack.getModifiers()
    stack.addModifier('buff_2', ATTRIBUTE_CODE.defense, 5, ModifierType.ADDITIVE)
    const second = stack.getModifiers()
    expect(second).not.toBe(first)
    expect(second).toHaveLength(2)
  })

  it('getModifiers() 无参聚合结果缓存', () => {
    stack.addModifier('buff_1', ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE)
    stack.addModifier('buff_2', ATTRIBUTE_CODE.defense, 5, ModifierType.ADDITIVE)
    const first = stack.getModifiers()
    const second = stack.getModifiers()
    expect(first).toBe(second)
    expect(first).toHaveLength(2)
  })

  it('removeModifier(instanceId) 后缓存失效', () => {
    stack.addModifier('buff_1', ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE)
    const first = stack.getModifiers(ATTRIBUTE_CODE.attack)
    stack.removeModifier('buff_1')
    const second = stack.getModifiers(ATTRIBUTE_CODE.attack)
    expect(second).not.toBe(first)
    expect(second).toHaveLength(0)
  })

  it('removeModifier(instanceId, attribute) 按属性移除', () => {
    stack.addModifier('buff_1', ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE)
    stack.addModifier('buff_1', ATTRIBUTE_CODE.defense, 5, ModifierType.ADDITIVE)
    stack.removeModifier('buff_1', ATTRIBUTE_CODE.attack)
    expect(stack.getModifiers(ATTRIBUTE_CODE.attack)).toHaveLength(0)
    expect(stack.getModifiers(ATTRIBUTE_CODE.defense)).toHaveLength(1)
  })

  it('removeModifier(instanceId, attribute, type) 精确移除，保留同属性其他类型', () => {
    stack.addModifier('buff_1', ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE)
    stack.addModifier('buff_1', ATTRIBUTE_CODE.attack, 0.5, ModifierType.MULTIPLICATIVE)
    stack.removeModifier('buff_1', ATTRIBUTE_CODE.attack, ModifierType.ADDITIVE)
    const remaining = stack.getModifiers(ATTRIBUTE_CODE.attack)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].type).toBe(ModifierType.MULTIPLICATIVE)
    expect(remaining[0].value).toBe(0.5)
  })

  it('getModifierCount 缓存并随变更失效', () => {
    expect(stack.getModifierCount()).toBe(0)
    stack.addModifier('buff_1', ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE)
    expect(stack.getModifierCount()).toBe(1)
    stack.clear()
    expect(stack.getModifierCount()).toBe(0)
  })
})
