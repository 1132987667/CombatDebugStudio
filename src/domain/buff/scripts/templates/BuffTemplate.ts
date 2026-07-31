import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import { AttributeBuffTemplate } from '@/domain/buff/scripts/templates/AttributeBuffTemplate'
import type { AttributeModifier } from '@/domain/buff/scripts/templates/AttributeBuffTemplate'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

/**
 * 持续伤害debuff模板
 * 用于快速创建持续伤害类debuff
 */
export abstract class DamageOverTimeTemplate extends BaseBuffScript {
  protected abstract getDamageCategory(): string
  protected abstract getBaseDamage(): number
  protected abstract getDebuffName(): string

  protected _onApply(context: BuffContext): void {
    const debuffName = this.getDebuffName()
    this.log(context, `${debuffName}效果生效！`)

    const baseDamage = this.getConfigValue(
      context,
      'baseDamage',
      this.getBaseDamage(),
    )

    context.setVariable('baseDamage', baseDamage)
    context.setVariable('damageCategory', this.getDamageCategory())
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, `${this.getDebuffName()}效果消失`)
  }

  protected _onUpdate(context: BuffContext): void {
    const baseDamage =
      context.getVariable<number>('baseDamage') || this.getBaseDamage()
    const damageMultiplier = this.getConfigValue(
      context,
      'damageMultiplier',
      1.0,
    )

    // 每回合造成一次伤害，伤害随回合数递增
    const stacks = (context.getVariable<number>('damageStacks') ?? 0) + 1
    const currentDamage = Math.floor(
      baseDamage * Math.pow(damageMultiplier, stacks),
    )

    this.log(context, `${this.getDebuffName()}造成 ${currentDamage} 点伤害`)
    // 这里应该调用角色的伤害方法

    context.setVariable('damageStacks', stacks)
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, `${this.getDebuffName()}效果增强！`)

    const baseDamage =
      context.getVariable<number>('baseDamage') || this.getBaseDamage()
    const refreshBonus = this.getConfigValue(
      context,
      'refreshBonus',
      this.getBaseDamage() * 0.2,
    )
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
    name: ATTRIBUTE_CODE
    modifier: number
    type: ModifierType
  }>

  protected _onApply(context: BuffContext): void {
    this.log(context, `${this.getEffectName()}效果生效！`)

    const attributes = this.getAffectedAttributes()
    for (const attr of attributes) {
      const actualModifier = this.getConfigValue(
        context,
        `${attr.name}Modifier`,
        attr.modifier,
      )
      this.addModifier(context, attr.name, actualModifier, attr.type)
      context.setVariable(`${attr.name}Modifier`, actualModifier)
    }

    context.setVariable('effectName', this.getEffectName())
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, `${this.getEffectName()}效果消失`)
  }

  protected _onUpdate(context: BuffContext): void {
    // 状态效果通常不需要随时间变化
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, `${this.getEffectName()}效果强化！`)

    const attributes = this.getAffectedAttributes()
    for (const attr of attributes) {
      const currentModifier =
        context.getVariable<number>(`${attr.name}Modifier`) || attr.modifier
      const refreshBonus = this.getConfigValue(
        context,
        'refreshBonus',
        attr.modifier * 0.1,
      )
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
    bonusType: ModifierType,
    buffName: string,
  ): typeof BaseBuffScript {
    return class extends AttributeBuffTemplate {
      public static readonly BUFF_ID = buffId
      protected getModifiers(): AttributeModifier[] {
        return [{ attribute: attributeName, value: baseBonus, type: bonusType, description: buffName }]
      }
    }
  }

  /**
   * 生成持续伤害debuff
   */
  static createDamageOverTime(
    buffId: string,
    damageCategory: string,
    baseDamage: number,
    debuffName: string,
  ): typeof BaseBuffScript {
    return class extends DamageOverTimeTemplate {
      public static readonly BUFF_ID = buffId
      protected getDamageCategory(): string {
        return damageCategory
      }
      protected getBaseDamage(): number {
        return baseDamage
      }
      protected getDebuffName(): string {
        return debuffName
      }
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
      name: ATTRIBUTE_CODE
      modifier: number
      type: ModifierType
    }>,
  ): typeof BaseBuffScript {
    return class extends StatusEffectTemplate {
      public static readonly BUFF_ID = buffId
      protected getEffectName(): string {
        return effectName
      }
      protected getEffectDescription(): string {
        return effectDescription
      }
      protected getAffectedAttributes() {
        return affectedAttributes
      }
    }
  }
}

