import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

/**
 * 暴击伤害降低debuff脚本
 * 降低目标的暴击伤害，使其暴击时造成的伤害减少
 */
export class CritDamageReductionDebuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_crit_damage_reduction'

  protected _onApply(context: BuffContext): void {
    this.log(context, '暴击伤害被降低了！')
    
    // 降低暴击伤害
    const critDamageReduction = this.getConfigValue(context, 'critDamageReduction', 0.2) // 默认降低20%暴击伤害
    this.addModifier(context, ATTRIBUTE_CODE.critDamage, -critDamageReduction, ModifierType.MULTIPLICATIVE)
    
    // 记录初始暴击伤害降低值
    context.setVariable('critDamageReduction', critDamageReduction)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '暴击伤害恢复正常')
  }

  protected _onUpdate(context: BuffContext): void {
    // 每回合逐渐恢复暴击伤害
    const recoveryRate = this.getConfigValue(context, 'recoveryRate', 0.02) // 每回合恢复2%

    const currentReduction = context.getVariable<number>('critDamageReduction') || 0.2
    const newReduction = Math.max(currentReduction - recoveryRate, 0)

    if (newReduction < currentReduction) {
      // 更新暴击伤害降低效果
      context.removeModifiers(ATTRIBUTE_CODE.critDamage)
      this.addModifier(context, ATTRIBUTE_CODE.critDamage, -newReduction, ModifierType.MULTIPLICATIVE)
      context.setVariable('critDamageReduction', newReduction)
      this.log(context, `暴击伤害逐渐恢复，当前降低：${(newReduction * 100).toFixed(1)}%`)
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '暴击伤害降低效果增强！')
    
    // 刷新时增加暴击伤害降低效果
    const currentReduction = context.getVariable<number>('critDamageReduction') || 0.2
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.05)
    const newReduction = Math.min(currentReduction + refreshBonus, 0.5) // 最大降低50%
    
    // 更新效果
    context.removeModifiers(ATTRIBUTE_CODE.critDamage)
    this.addModifier(context, ATTRIBUTE_CODE.critDamage, -newReduction, ModifierType.MULTIPLICATIVE)
    context.setVariable('critDamageReduction', newReduction)
    
    this.log(context, `暴击伤害降低提升至 ${(newReduction * 100).toFixed(1)}%`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = CritDamageReductionDebuff.BUFF_ID
