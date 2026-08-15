import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
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
 * 性能设计（值快照比对）：
 * - getModifiers() 的声明列表在实例生命周期内缓存，避免每次构造新数组
 * - applyModifiers(replace) 对每个修饰符维护"上次应用的最终值"快照：
 *   值未变 → 跳过；值变化/新增 → 仅重写该属性；声明中被移除 → 精确移除。
 *   不再无条件 remove + re-add，避免 shouldReapplyOnUpdate 类 Buff 每回合无效重算。
 * - 契约：同一属性 + 类型的修饰符在一个声明中至多出现一次
 *   （同属性多类型可共存，如 attack ADDITIVE + attack MULTIPLICATIVE）。
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

  // ==================== 声明缓存与值快照 ====================

  /** 子类 getModifiers() 的结果缓存（一个脚本实例对应一个 Buff 实例，生命周期安全） */
  private modifierDeclarationCache: AttributeModifier[] | null = null

  /**
   * 已应用修饰符的值快照：key=`${attribute}:${type}` → 上次应用的最终值（含层数缩放）。
   * applyModifiers(replace) 据此比对，值未变时跳过重写。
   */
  private appliedValues = new Map<string, number>()

  /**
   * 动态 value 函数结果缓存：key=`${attribute}:${type}` → 求值结果 + 依赖变量快照。
   * 求值时通过 context 的变量读取追踪记录依赖集合（getVariable 读取的 key）；
   * 下次 applyModifiers 若依赖变量未变化则复用结果，跳过 value 函数调用。
   * 契约：value 函数的值输入须经 context.getVariable 读取（config 参数视为常量）。
   */
  private valueCache = new Map<
    string,
    { depKeys: string[]; depValues: Array<string | number | boolean | undefined>; result: number }
  >()

  /** 读取（并缓存）子类声明的修饰符列表 */
  protected getCachedModifiers(): AttributeModifier[] {
    if (!this.modifierDeclarationCache) {
      this.modifierDeclarationCache = this.getModifiers()
    }
    return this.modifierDeclarationCache
  }

  /**
   * 求值单个修饰符的原始值（不含层数缩放）。
   * 动态 value 函数：依赖变量未变化时复用缓存结果，否则重新求值并刷新依赖快照。
   */
  private resolveRawValue(
    mod: AttributeModifier,
    context: BuffContext,
    key: string,
    attribute: string,
  ): number {
    if (typeof mod.value !== 'function') return mod.value

    const cached = this.valueCache.get(key)
    if (
      cached &&
      cached.depKeys.every(
        (k, i) => context.getVariable(k) === cached.depValues[i],
      )
    ) {
      return cached.result
    }

    context.beginVariableTracking()
    let rawValue: number
    try {
      rawValue = mod.value(context)
    } catch (error) {
      this.log(context, `修饰符值计算失败 (${attribute}): ${error}`)
      rawValue = 0
    }
    const tracked = context.endVariableTracking()
    const depKeys = tracked ? Array.from(tracked) : []
    this.valueCache.set(key, {
      depKeys,
      depValues: depKeys.map((k) => context.getVariable(k)),
      result: rawValue,
    })
    return rawValue
  }

  // ==================== 气血周期实现 ====================

  protected _onApply(context: BuffContext): void {
    const modifiers = this.getCachedModifiers()
    this.applyModifiers(context, false, modifiers)
    this.log(context, `√ 效果生效，应用了 ${modifiers.length} 个属性修饰符`)
  }

  protected _onRemove(_context: BuffContext): void {
    // NOTE: 修饰符清理由 BuffSystem.removeBuff → modifierStack.removeModifier(instanceId) 统一处理，
    //       不在脚本层调用 context.removeModifiers()。
    //        子类如需清理运行时变量，重写此方法并调用 super._onRemove(context)
  }

  protected _onUpdate(context: BuffContext): void {
    if (this.shouldReapplyOnUpdate()) {
      this.applyModifiers(context, true)
      if (this._isDebugMode()) {
        this.log(context, `属性已更新，重新应用了修饰符`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    if (this.shouldReapplyOnRefresh()) {
      const modifiers = this.getCachedModifiers()
      this.applyModifiers(context, true, modifiers)
      this.log(context, `刷新效果，重新应用了 ${modifiers.length} 个修饰符`)
    }
  }

  // ==================== 核心工具方法 ====================

  /**
   * 应用修饰符列表到 BuffContext
   * @param context Buff 上下文
   * @param replace 是否先替换再应用——与值快照比对，仅重写值变化/新增的属性，移除声明中已删除的属性
   * @param modifiers 可选——传入的修饰符列表，不传时调用 getCachedModifiers()
   */
  protected applyModifiers(
    context: BuffContext,
    replace: boolean = false,
    modifiers?: AttributeModifier[],
  ): void {
    const declarations = modifiers ?? this.getCachedModifiers()
    const stacks = this.getStacks(context)

    // 求值当前声明：过滤非法属性，解析动态值（含异常兜底），应用层数缩放
    const current: Array<{
      key: string
      attribute: ATTRIBUTE_CODE
      value: number
      type: ModifierTypeEnum
      rawValue: number
      description?: string
    }> = []
    for (const mod of declarations) {
      // NOTE: 运行时校验——仅接受已知 ATTRIBUTE_CODE，非法属性跳过并 warn
      if (
        !Object.values(ATTRIBUTE_CODE).includes(mod.attribute as ATTRIBUTE_CODE)
      ) {
        this.log(
          context,
          `修饰符属性 "${mod.attribute}" 不在 ATTRIBUTE_CODE 中，已跳过`,
        )
        continue
      }

      // HACK: 动态 value 函数可能抛出异常——resolveRawValue 内 try-catch 兜底，
      //       确保单个修饰符失败不拖垮整个战斗流程。
      const key = `${mod.attribute}:${mod.type}`
      const rawValue = this.resolveRawValue(
        mod,
        context,
        key,
        mod.attribute as string,
      )
      const value = rawValue * stacks
      current.push({
        key,
        attribute: mod.attribute as ATTRIBUTE_CODE,
        value,
        type: mod.type,
        rawValue,
        description: mod.description,
      })
    }

    if (replace) {
      // 值变化/新增的属性 → 精确重写（remove 该属性+类型，再 add）
      const toRewrite = new Map<string, (typeof current)[number]>()
      for (const item of current) {
        if (this.appliedValues.get(item.key) !== item.value) {
          toRewrite.set(item.key, item)
        }
      }
      // 声明中已删除的属性 → 精确移除旧修饰符（保留同属性其他类型）
      for (const key of [...this.appliedValues.keys()]) {
        if (!current.some((c) => c.key === key)) {
          const separator = key.lastIndexOf(':')
          const attribute = key.slice(0, separator) as ATTRIBUTE_CODE
          const type = key.slice(separator + 1) as ModifierTypeEnum
          context.removeModifiers(attribute, type)
          this.appliedValues.delete(key)
        }
      }
      for (const [key, item] of toRewrite) {
        context.removeModifiers(item.attribute, item.type)
        context.addModifier(item.attribute, item.value, item.type)
        this.appliedValues.set(key, item.value)
      }
    } else {
      // 非 replace（首次施加）：全量应用并记录快照
      for (const item of current) {
        context.addModifier(item.attribute, item.value, item.type)
        this.appliedValues.set(item.key, item.value)
      }
    }

    if (this._isDebugMode()) {
      for (const item of current) {
        this.log(
          context,
          `  ├─ ${item.description ?? item.attribute}: ${item.attribute} ${item.type} ${item.rawValue}（${stacks}层→实际${item.value}）`,
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
  protected resolveParams<T extends Record<string, unknown>>(
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
