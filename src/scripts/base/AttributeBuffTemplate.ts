import { BaseBuffScript } from '@/scripts/base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 属性提升Buff模板
 * 用于处理通用的属性提升逻辑，支持随时间增长和刷新效果
 */
export abstract class AttributeBuffTemplate extends BaseBuffScript {
  /**
   * 获取属性名称
   * @returns 属性名称（如 'ATK', 'DEF', 'SPD' 等）
   */
  protected abstract getAttributeName(): string

  /**
   * 获取修饰符类型
   * @returns 修饰符类型（'ADDITIVE', 'MULTIPLICATIVE', 'PERCENTAGE'）
   */
  protected abstract getModifierType(): 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE'

  /**
   * 获取基础提升值
   * @param context Buff上下文
   * @returns 基础提升值
   */
  protected getBaseBonus(context: BuffContext): number {
    return this.getConfigValue(context, 'baseBonus', 0)
  }

  /**
   * 获取增长速率
   * @param context Buff上下文
   * @returns 增长速率
   */
  protected getGrowthRate(context: BuffContext): number {
    return this.getConfigValue(context, 'growthRate', 0)
  }

  /**
   * 获取刷新 bonus
   * @param context Buff上下文
   * @returns 刷新 bonus
   */
  protected getRefreshBonus(context: BuffContext): number {
    return this.getConfigValue(context, 'refreshBonus', 0)
  }

  /**
   * 获取变量名前缀
   * @returns 变量名前缀
   */
  protected getVariablePrefix(): string {
    return this.getAttributeName().toLowerCase()
  }

  /**
   * 获取当前 bonus 值
   * @param context Buff上下文
   * @returns 当前 bonus 值
   */
  protected getCurrentBonus(context: BuffContext): number {
    const variableName = `${this.getVariablePrefix()}Bonus`
    return context.getVariable<number>(variableName) || this.getBaseBonus(context)
  }

  /**
   * 设置当前 bonus 值
   * @param context Buff上下文
   * @param bonus bonus 值
   */
  protected setCurrentBonus(context: BuffContext, bonus: number): void {
    const variableName = `${this.getVariablePrefix()}Bonus`
    context.setVariable(variableName, bonus)
  }

  /**
   * 应用修饰符
   * @param context Buff上下文
   * @param bonus bonus 值
   */
  protected applyModifier(context: BuffContext, bonus: number): void {
    context.removeModifiers(this.getAttributeName())
    this.addModifier(context, this.getAttributeName(), bonus, this.getModifierType())
  }

  protected _onApply(context: BuffContext): void {
    const baseBonus = this.getBaseBonus(context)
    this.applyModifier(context, baseBonus)
    this.setCurrentBonus(context, baseBonus)
    this.log(context, `${this.getAttributeName()}提升`)  
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, `${this.getAttributeName()}提升效果结束`)
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    const growthRate = this.getGrowthRate(context)
    if (growthRate <= 0) return

    const elapsed = context.getElapsedTime()
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentBonus = this.getCurrentBonus(context)
      const newBonus = this.calculateNewBonus(currentBonus, growthRate)
      
      if (newBonus > currentBonus) {
        this.applyModifier(context, newBonus)
        this.setCurrentBonus(context, newBonus)
        this.log(context, `${this.getAttributeName()}逐渐增强，当前提升：${newBonus}`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    const refreshBonus = this.getRefreshBonus(context)
    if (refreshBonus <= 0) {
      this.log(context, `${this.getAttributeName()}提升效果刷新`)
      return
    }

    const currentBonus = this.getCurrentBonus(context)
    const newBonus = currentBonus + refreshBonus
    
    this.applyModifier(context, newBonus)
    this.setCurrentBonus(context, newBonus)
    this.log(context, `${this.getAttributeName()}进一步提升至 ${newBonus}`)
  }

  /**
   * 计算新的 bonus 值
   * @param currentBonus 当前 bonus 值
   * @param growthRate 增长速率
   * @returns 新的 bonus 值
   */
  protected calculateNewBonus(currentBonus: number, growthRate: number): number {
    return Math.floor(currentBonus * (1 + growthRate))
  }
}
