import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import type { BuffContext } from '@/domain/buff/BuffContext'

/**
 * 速度降低debuff脚本
 * 降低目标的速度，影响其行动顺序和移动能力
 */
export class SpeedReductionDebuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_speed_reduction'

  protected _onApply(context: BuffContext): void {
    const speedReduction = this.getConfigValue(context, 'speedReduction', 0.25)
    this.log(context, '速度被降低了！')
    this.addModifier(context, ATTRIBUTE_CODE.speed, -speedReduction, ModifierType.MULTIPLICATIVE)
    
    // 记录初始速度降低值
    context.setVariable('speedReduction', speedReduction)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '速度恢复正常')
  }

  protected _onUpdate(context: BuffContext): void {
    // 每回合逐渐恢复速度
    const recoveryRate = this.getConfigValue(context, 'recoveryRate', 0.03) // 每回合恢复3%

    const currentReduction = context.getVariable<number>('speedReduction') || 0.25
    const newReduction = Math.max(currentReduction - recoveryRate, 0)

    if (newReduction < currentReduction) {
      // 更新速度降低效果
      context.removeModifiers(ATTRIBUTE_CODE.speed)
      this.addModifier(context, ATTRIBUTE_CODE.speed, -newReduction, ModifierType.MULTIPLICATIVE)
      context.setVariable('speedReduction', newReduction)
      this.log(context, `速度逐渐恢复，当前降低：${(newReduction * 100).toFixed(1)}%`)
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '速度降低效果增强！')
    
    // 刷新时增加速度降低效果
    const currentReduction = context.getVariable<number>('speedReduction') || 0.25
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.1)
    const newReduction = Math.min(currentReduction + refreshBonus, 0.6) // 最大降低60%
    
    // 更新效果
    context.removeModifiers(ATTRIBUTE_CODE.speed)
    this.addModifier(context, ATTRIBUTE_CODE.speed, -newReduction, ModifierType.MULTIPLICATIVE)
    context.setVariable('speedReduction', newReduction)
    
    this.log(context, `速度降低提升至 ${(newReduction * 100).toFixed(1)}%`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = SpeedReductionDebuff.BUFF_ID
