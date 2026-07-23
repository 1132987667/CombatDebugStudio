import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import type { ModifierType as ModifierTypeEnum } from '@/domain/attribute/types'

/**
 * 属性修饰符声明
 * 描述一个属性修改操作——支持固定值和动态计算两种模式
 */
export interface AttributeModifier {
  /** 目标属性代码 */
  attribute: ATTRIBUTE_CODE | string
  /** 修饰值：固定数值或基于上下文动态计算的函数 */
  value: number | ((context: BuffContext) => number)
  /** 修饰类型（ADDITIVE / MULTIPLICATIVE / PERCENTAGE / FINAL） */
  type: ModifierTypeEnum
  /** 可选的描述（用于日志/调试） */
  description?: string
}

/**
 * 属性操作模板
 *
 * 设计理念：
 * - 子类通过声明式 getModifiers() 告诉基类"我要改什么"
 * - 基类负责在正确的时机（施加/刷新/更新）应用这些修饰符
 * - 支持固定值和动态值两种模式
 * - 支持单一属性和批量属性
 * - 不预设成长逻辑——子类在 _onUpdate 中自行实现
 *
 *
 * @example
 * // 简单场景：固定值，单一属性
 * class AttackUpBuff extends AttributeBuffTemplate {
 *   protected getModifiers(): AttributeModifier[] {
 *     return [{ attribute: ATTRIBUTE_CODE.attack, value: 10, type: ModifierType.ADDITIVE }]
 *   }
 * }
 *
 * @example
 * // 动态值，多属性
 * class MountainGodBuff extends AttributeBuffTemplate {
 *   protected getModifiers(): AttributeModifier[] {
 *     return [
 *       { attribute: ATTRIBUTE_CODE.attack, value: (ctx) => this.getConfigValue(ctx, 'attackBonus', 50), type: ModifierType.ADDITIVE },
 *       { attribute: ATTRIBUTE_CODE.defense, value: (ctx) => this.getConfigValue(ctx, 'defenseBonus', 30), type: ModifierType.ADDITIVE },
 *     ]
 *   }
 * }
 */
export abstract class AttributeBuffTemplate extends BaseBuffScript {
  // ==================== 子类必须实现 ====================

  /** 声明该 Buff 需要应用的所有属性修饰符 */
  protected abstract getModifiers(): AttributeModifier[]

  // ==================== 子类可覆盖的配置点 ====================

  /** 刷新时是否重新应用修饰符（默认 true） */
  protected shouldReapplyOnRefresh(): boolean {
    return true
  }

  /** 每回合更新时是否重新应用修饰符（默认 false） */
  protected shouldReapplyOnUpdate(): boolean {
    return false
  }

  // ==================== 生命周期实现 ====================

  protected _onApply(context: BuffContext): void {
    const modifiers = this.getModifiers()
    this.applyModifiers(context, false, modifiers)
    this.log(
      context,
      `√ 效果生效，应用了 ${modifiers.length} 个属性修饰符`,
    )
  }

  protected _onRemove(context: BuffContext): void {
    // NOTE: 修饰符清理由 BuffSystem.removeBuff → modifierStack.removeModifier(instanceId) 统一处理，
    //       不在脚本层调用 context.removeModifiers()。
    //        子类如需清理运行时变量，重写此方法并调用 super._onRemove(context)
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    if (this.shouldReapplyOnUpdate()) {
      this.applyModifiers(context, true)
      if (this._isDebugMode()) {
        this.log(context, `属性已更新，重新应用了修饰符`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    if (this.shouldReapplyOnRefresh()) {
      const modifiers = this.getModifiers()
      this.applyModifiers(context, true, modifiers)
      this.log(
        context,
        `刷新效果，重新应用了 ${modifiers.length} 个修饰符`,
      )
    }
  }

  // ==================== 核心工具方法 ====================

  /**
   * 应用修饰符列表到 BuffContext
   * @param context Buff 上下文
   * @param replace 是否先替换再应用——精确移除每个声明的属性的旧修饰符，再添加新值
   * @param modifiers 可选——传入的修饰符列表，不传时调用 this.getModifiers()
   */
  protected applyModifiers(
    context: BuffContext,
    replace: boolean = false,
    modifiers?: AttributeModifier[],
  ): void {
    modifiers ??= this.getModifiers()
    const stacks = this.getStacks(context)

    if (replace) {
      // ponytail: 精确移除——只移除本 instance 下每个声明属性的旧修饰符，不影响同 instance 的其他属性
      for (const mod of modifiers) {
        context.removeModifiers(mod.attribute as ATTRIBUTE_CODE)
      }
    }

    for (const mod of modifiers) {
      // NOTE: 运行时校验——仅接受已知 ATTRIBUTE_CODE，非法属性跳过并 warn
      if (!Object.values(ATTRIBUTE_CODE).includes(mod.attribute as ATTRIBUTE_CODE)) {
        this.log(context, `修饰符属性 "${mod.attribute}" 不在 ATTRIBUTE_CODE 中，已跳过`)
        continue
      }

      // HACK: 动态 value 函数可能抛出异常——try-catch 兜底确保单个修饰符失败不拖垮整个战斗流程
      let rawValue: number
      if (typeof mod.value === 'function') {
        try {
          rawValue = mod.value(context)
        } catch (error) {
          this.log(context, `修饰符值计算失败 (${mod.attribute}): ${error}`)
          rawValue = 0
        }
      } else {
        rawValue = mod.value
      }
      const value = rawValue * stacks
      context.addModifier(mod.attribute as ATTRIBUTE_CODE, value, mod.type)
    }

    if (this._isDebugMode()) {
      for (const mod of modifiers) {
        const rawVal =
          typeof mod.value === 'function'
            ? (() => { try { return mod.value(context) } catch { return NaN } })()
            : mod.value
        this.log(
          context,
          `  ├─ ${mod.description ?? mod.attribute}: ${mod.attribute} ${mod.type} ${rawVal}（${stacks}层→实际${Number.isNaN(rawVal) ? 'N/A' : rawVal * stacks}）`,
        )
      }
    }
  }

  // ==================== 辅助方法 ====================

  /** 读取 Buff 叠加层数，默认 1 层 */
  protected getStacks(context: BuffContext): number {
    return (context.getVariable<number>('_stacks') as number) ?? 1
  }

  /** 获取参数的便捷方法——优先从 context.config.parameters 读取，否则使用默认值 */
  protected getParam<T>(context: BuffContext, key: string, defaultValue: T): T {
    return this.getConfigValue(context, key, defaultValue)
  }

  /** 批量解析参数：合并默认值和配置值 */
  protected resolveParams<T extends Record<string, any>>(
    context: BuffContext,
    defaults: T,
  ): T {
    const result = { ...defaults }
    const configParams = context.config.parameters || {}
    for (const key of Object.keys(defaults)) {
      if (configParams[key] !== undefined) {
        ;(result as Record<string, unknown>)[key] = configParams[key]
      }
    }
    return result
  }

  // ==================== 调试支持 ====================

  /** 子类可覆盖以开启调试日志 */
  protected _isDebugMode(): boolean {
    return false
  }
}
