import { BaseBuffScript } from '@/scripts/base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 属性加成buff模板
 * 用于快速创建属性加成类buff
 */
export abstract class AttributeBuffTemplate extends BaseBuffScript {
  protected abstract getAttributeName(): string
  protected abstract getBaseBonus(): number
  protected abstract getBonusType(): 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE'
  protected abstract getBuffName(): string

  protected _onApply(context: BuffContext): void {
    const attributeName = this.getAttributeName()
    const baseBonus = this.getBaseBonus()
    const bonusType = this.getBonusType()
    const buffName = this.getBuffName()

    this.log(context, `${buffName}效果生效！`)
    
    const actualBonus = this.getConfigValue(context, 'bonus', baseBonus)
    this.addModifier(context, attributeName, actualBonus, bonusType)
    
    context.setVariable('baseBonus', actualBonus)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, `${this.getBuffName()}效果消失`)
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 默认实现：随时间增强效果
    const elapsed = context.getElapsedTime()
    const growthRate = this.getConfigValue(context, 'growthRate', 0)
    
    if (growthRate > 0 && Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentBonus = context.getVariable<number>('baseBonus') || this.getBaseBonus()
      const newBonus = Math.floor(currentBonus * (1 + growthRate))
      
      if (newBonus > currentBonus) {
        context.removeModifiers(this.getAttributeName())
        this.addModifier(context, this.getAttributeName(), newBonus, this.getBonusType())
        context.setVariable('baseBonus', newBonus)
        this.log(context, `${this.getBuffName()}效果增强，当前加成：${newBonus}`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, `${this.getBuffName()}效果强化！`)
    
    const currentBonus = context.getVariable<number>('baseBonus') || this.getBaseBonus()
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', this.getBaseBonus() * 0.1)
    const newBonus = currentBonus + refreshBonus
    
    context.removeModifiers(this.getAttributeName())
    this.addModifier(context, this.getAttributeName(), newBonus, this.getBonusType())
    context.setVariable('baseBonus', newBonus)
    
    this.log(context, `${this.getBuffName()}加成提升至 ${newBonus}`)
  }
}

/**
 * 持续伤害debuff模板
 * 用于快速创建持续伤害类debuff
 */
export abstract class DamageOverTimeTemplate extends BaseBuffScript {
  protected abstract getDamageType(): string
  protected abstract getBaseDamage(): number
  protected abstract getDamageInterval(): number
  protected abstract getDebuffName(): string

  protected _onApply(context: BuffContext): void {
    const debuffName = this.getDebuffName()
    this.log(context, `${debuffName}效果生效！`)
    
    const baseDamage = this.getConfigValue(context, 'baseDamage', this.getBaseDamage())
    const damageInterval = this.getConfigValue(context, 'damageInterval', this.getDamageInterval())
    
    context.setVariable('baseDamage', baseDamage)
    context.setVariable('damageInterval', damageInterval)
    context.setVariable('lastDamageTime', 0)
    context.setVariable('damageType', this.getDamageType())
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, `${this.getDebuffName()}效果消失`)
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    const elapsed = context.getElapsedTime()
    const lastDamageTime = context.getVariable<number>('lastDamageTime') || 0
    const damageInterval = context.getVariable<number>('damageInterval') || this.getDamageInterval()
    
    // 每隔一段时间造成伤害
    if (elapsed - lastDamageTime >= damageInterval) {
      const baseDamage = context.getVariable<number>('baseDamage') || this.getBaseDamage()
      const damageMultiplier = this.getConfigValue(context, 'damageMultiplier', 1.0)
      
      // 计算当前伤害（随时间递增）
      const stacks = Math.floor(elapsed / damageInterval)
      const currentDamage = Math.floor(baseDamage * Math.pow(damageMultiplier, stacks))
      
      this.log(context, `${this.getDebuffName()}造成 ${currentDamage} 点伤害`)
      // 这里应该调用角色的伤害方法
      
      context.setVariable('lastDamageTime', elapsed)
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, `${this.getDebuffName()}效果增强！`)
    
    const baseDamage = context.getVariable<number>('baseDamage') || this.getBaseDamage()
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', this.getBaseDamage() * 0.2)
    const newBaseDamage = baseDamage + refreshBonus
    
    context.setVariable('baseDamage', newBaseDamage)
    this.log(context, `${this.getDebuffName()}基础伤害提升至 ${newBaseDamage}`)
  }
}

/**
 * 状态效果buff模板
 * 用于快速创建状态变化类buff
 */
export abstract class StatusEffectTemplate extends BaseBuffScript {
  protected abstract getEffectName(): string
  protected abstract getEffectDescription(): string
  protected abstract getAffectedAttributes(): Array<{
    name: string
    modifier: number
    type: 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE'
  }>

  protected _onApply(context: BuffContext): void {
    this.log(context, `${this.getEffectName()}效果生效！`)
    
    const attributes = this.getAffectedAttributes()
    for (const attr of attributes) {
      const actualModifier = this.getConfigValue(context, `${attr.name}Modifier`, attr.modifier)
      this.addModifier(context, attr.name, actualModifier, attr.type)
      context.setVariable(`${attr.name}Modifier`, actualModifier)
    }
    
    context.setVariable('effectName', this.getEffectName())
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, `${this.getEffectName()}效果消失`)
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 状态效果通常不需要随时间变化
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, `${this.getEffectName()}效果强化！`)
    
    const attributes = this.getAffectedAttributes()
    for (const attr of attributes) {
      const currentModifier = context.getVariable<number>(`${attr.name}Modifier`) || attr.modifier
      const refreshBonus = this.getConfigValue(context, 'refreshBonus', attr.modifier * 0.1)
      const newModifier = currentModifier + refreshBonus
      
      context.removeModifiers(attr.name)
      this.addModifier(context, attr.name, newModifier, attr.type)
      context.setVariable(`${attr.name}Modifier`, newModifier)
    }
    
    this.log(context, `${this.getEffectName()}效果得到强化`)
  }
}

/**
 * 快速生成buff脚本的工具函数
 */
export class BuffTemplateGenerator {
  /**
   * 生成属性加成buff
   */
  static createAttributeBuff(
    buffId: string,
    attributeName: string,
    baseBonus: number,
    bonusType: 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE',
    buffName: string
  ): typeof BaseBuffScript {
    return class extends AttributeBuffTemplate {
      public static readonly BUFF_ID = buffId
      protected getAttributeName(): string { return attributeName }
      protected getBaseBonus(): number { return baseBonus }
      protected getBonusType(): 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE' { return bonusType }
      protected getBuffName(): string { return buffName }
    }
  }

  /**
   * 生成持续伤害debuff
   */
  static createDamageOverTime(
    buffId: string,
    damageType: string,
    baseDamage: number,
    damageInterval: number,
    debuffName: string
  ): typeof BaseBuffScript {
    return class extends DamageOverTimeTemplate {
      public static readonly BUFF_ID = buffId
      protected getDamageType(): string { return damageType }
      protected getBaseDamage(): number { return baseDamage }
      protected getDamageInterval(): number { return damageInterval }
      protected getDebuffName(): string { return debuffName }
    }
  }

  /**
   * 生成状态效果buff
   */
  static createStatusEffect(
    buffId: string,
    effectName: string,
    effectDescription: string,
    affectedAttributes: Array<{
      name: string
      modifier: number
      type: 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE'
    }>
  ): typeof BaseBuffScript {
    return class extends StatusEffectTemplate {
      public static readonly BUFF_ID = buffId
      protected getEffectName(): string { return effectName }
      protected getEffectDescription(): string { return effectDescription }
      protected getAffectedAttributes() { return affectedAttributes }
    }
  }
}