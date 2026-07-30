/**
 * AttributeBuffTemplate 单元测试
 *
 * 覆盖核心行为：
 * - 正常 apply 修饰符
 * - replace 模式（先移除再添加）
 * - stacks 层数乘算
 * - 动态值函数
 * - 属性合法性校验
 * - 动态计算异常兜底
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AttributeBuffTemplate, type AttributeModifier } from '@/domain/buff/scripts/templates/AttributeBuffTemplate'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'

// ============================================================
// 测试辅助：继承 AttributeBuffTemplate 的具象子类
// ============================================================

class TestBuff extends AttributeBuffTemplate {
  protected _isDebugMode(): boolean {
    return true // 启用调试日志以便验证日志行为
  }
  protected getModifiers(): AttributeModifier[] {
    return this._testModifiers
  }
  // 测试用——允许动态替换修饰符列表
  setTestModifiers(mods: AttributeModifier[]): void {
    this._testModifiers = mods
  }
  private _testModifiers: AttributeModifier[] = []
}

class TestBuffWithStacks extends AttributeBuffTemplate {
  protected getModifiers(): AttributeModifier[] {
    return [{
      attribute: ATTRIBUTE_CODE.attack,
      value: 10,
      type: ModifierType.ADDITIVE,
    }]
  }
  protected getStacks(context: BuffContext): number {
    return 5 // 固定返回 5 层用于测试
  }
}

// ============================================================
// Mock: BuffContext
// ============================================================

function createMockContext(overrides?: Partial<BuffContext>): BuffContext {
  const context = {
    characterId: 'test_char',
    instanceId: 'test_instance',
    config: {
      id: 'test_buff',
      name: 'Test Buff',
      description: '',
      duration: 3,
      maxStacks: 5,
      cooldown: 0,
      stackRule: 'limited' as any,
      controlType: 'none' as any,
      parameters: {},
    },
    addModifier: vi.fn(),
    removeModifiers: vi.fn(),
    getVariable: vi.fn(),
    setVariable: vi.fn(),
    ...overrides,
  } as unknown as BuffContext
  return context
}

describe('AttributeBuffTemplate', () => {
  let buff: TestBuff
  let context: BuffContext

  beforeEach(() => {
    buff = new TestBuff()
    context = createMockContext()
  })

  describe('applyModifiers (default, no replace)', () => {
    it('should add modifiers from getModifiers()', () => {
      buff.setTestModifiers([{
        attribute: ATTRIBUTE_CODE.attack,
        value: 10,
        type: ModifierType.ADDITIVE,
      }])
      context.getVariable = vi.fn().mockReturnValue(1)

      buff['applyModifiers'](context)

      expect(context.addModifier).toHaveBeenCalledWith(
        ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE,
      )
    })

    it('should multiply value by stacks', () => {
      buff.setTestModifiers([{
        attribute: ATTRIBUTE_CODE.defense,
        value: 15,
        type: ModifierType.PERCENTAGE,
      }])
      context.getVariable = vi.fn().mockReturnValue(3)

      buff['applyModifiers'](context)

      expect(context.addModifier).toHaveBeenCalledWith(
        ATTRIBUTE_CODE.defense, 45, ModifierType.PERCENTAGE,
      )
    })

    it('should evaluate dynamic value functions', () => {
      const dynamicFn = vi.fn().mockReturnValue(25)
      buff.setTestModifiers([{
        attribute: ATTRIBUTE_CODE.speed,
        value: dynamicFn,
        type: ModifierType.ADDITIVE,
      }])
      context.getVariable = vi.fn().mockReturnValue(2)

      buff['applyModifiers'](context)

      expect(dynamicFn).toHaveBeenCalledWith(context)
      expect(context.addModifier).toHaveBeenCalledWith(
        ATTRIBUTE_CODE.speed, 50, ModifierType.ADDITIVE,
      )
    })
  })

  describe('applyModifiers (replace=true)', () => {
    it('should remove old modifiers before adding new ones', () => {
      buff.setTestModifiers([
        { attribute: ATTRIBUTE_CODE.attack, value: 10, type: ModifierType.ADDITIVE },
        { attribute: ATTRIBUTE_CODE.defense, value: 5, type: ModifierType.ADDITIVE },
      ])
      context.getVariable = vi.fn().mockReturnValue(1)

      buff['applyModifiers'](context, true)

      expect(context.removeModifiers).toHaveBeenCalledTimes(2)
      expect(context.removeModifiers).toHaveBeenCalledWith(ATTRIBUTE_CODE.attack)
      expect(context.removeModifiers).toHaveBeenCalledWith(ATTRIBUTE_CODE.defense)
      expect(context.addModifier).toHaveBeenCalledTimes(2)
    })
  })

  describe('attribute validation', () => {
    it('should skip invalid attribute codes', () => {
      buff.setTestModifiers([{
        attribute: 'nonexistent_attr',
        value: 10,
        type: ModifierType.ADDITIVE,
      }])
      context.getVariable = vi.fn().mockReturnValue(1)

      buff['applyModifiers'](context)

      expect(context.addModifier).not.toHaveBeenCalled()
    })

    it('should skip invalid while processing valid attributes', () => {
      buff.setTestModifiers([
        { attribute: ATTRIBUTE_CODE.attack, value: 10, type: ModifierType.ADDITIVE },
        { attribute: 'bogus', value: 20, type: ModifierType.ADDITIVE },
        { attribute: ATTRIBUTE_CODE.defense, value: 5, type: ModifierType.ADDITIVE },
      ])
      context.getVariable = vi.fn().mockReturnValue(1)

      buff['applyModifiers'](context)

      expect(context.addModifier).toHaveBeenCalledTimes(2)
      expect(context.addModifier).toHaveBeenCalledWith(ATTRIBUTE_CODE.attack, 10, ModifierType.ADDITIVE)
      expect(context.addModifier).toHaveBeenCalledWith(ATTRIBUTE_CODE.defense, 5, ModifierType.ADDITIVE)
    })
  })

  describe('exception safety', () => {
    it('should fall back to 0 when dynamic value function throws', () => {
      buff.setTestModifiers([{
        attribute: ATTRIBUTE_CODE.attack,
        value: () => { throw new Error('computation failed') },
        type: ModifierType.ADDITIVE,
      }])
      context.getVariable = vi.fn().mockReturnValue(1)

      buff['applyModifiers'](context)

      // 应降级为 0 而非抛出异常
      expect(context.addModifier).toHaveBeenCalledWith(
        ATTRIBUTE_CODE.attack, 0, ModifierType.ADDITIVE,
      )
    })
  })

  describe('getStacks', () => {
    it('should read _stacks from context variables', () => {
      context.getVariable = vi.fn().mockImplementation((key: string) => {
        if (key === '_stacks') return 7
        return undefined
      })

      const result = buff['getStacks'](context)

      expect(result).toBe(7)
      expect(context.getVariable).toHaveBeenCalledWith('_stacks')
    })

    it('should return 1 when _stacks is not set', () => {
      context.getVariable = vi.fn().mockReturnValue(undefined)

      const result = buff['getStacks'](context)

      expect(result).toBe(1)
    })
  })

  describe('overridden getStacks', () => {
    it('should use subclass getStacks instead of context variable', () => {
      const stackBuff = new TestBuffWithStacks()
      context.getVariable = vi.fn().mockReturnValue(2) // 即使 context 返回 2

      stackBuff['applyModifiers'](context)

      // TestBuffWithStacks 的 getStacks 固定返回 5
      expect(context.addModifier).toHaveBeenCalledWith(
        ATTRIBUTE_CODE.attack, 50, ModifierType.ADDITIVE,
      )
    })
  })

  describe('lifecycle integration', () => {
    it('_onApply should call applyModifiers', () => {
      buff.setTestModifiers([{
        attribute: ATTRIBUTE_CODE.attack,
        value: 10,
        type: ModifierType.ADDITIVE,
      }])
      context.getVariable = vi.fn().mockReturnValue(1)

      buff['_onApply'](context)

      expect(context.addModifier).toHaveBeenCalled()
    })

    it('_onRefresh should call applyModifiers with replace=true', () => {
      buff.setTestModifiers([{
        attribute: ATTRIBUTE_CODE.attack,
        value: 10,
        type: ModifierType.ADDITIVE,
      }])
      context.getVariable = vi.fn().mockReturnValue(1)

      buff['_onRefresh'](context)

      expect(context.removeModifiers).toHaveBeenCalled()
      expect(context.addModifier).toHaveBeenCalled()
    })

    it('_onUpdate should not reapply by default', () => {
      buff.setTestModifiers([{
        attribute: ATTRIBUTE_CODE.attack,
        value: 10,
        type: ModifierType.ADDITIVE,
      }])
      context.getVariable = vi.fn().mockReturnValue(1)

      buff['_onUpdate'](context, 0)

      expect(context.addModifier).not.toHaveBeenCalled()
    })
  })
})