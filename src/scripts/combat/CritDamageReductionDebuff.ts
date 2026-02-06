import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

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
    this.addModifier(context, 'CRIT_DAMAGE', -critDamageReduction, 'MULTIPLICATIVE')
    
    // 记录初始暴击伤害降低值
    context.setVariable('critDamageReduction', critDamageReduction)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '暴击伤害恢复正常')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 可以添加随时间变化的逻辑
    const elapsed = context.getElapsedTime()
    const recoveryRate = this.getConfigValue(context, 'recoveryRate', 0.02) // 每秒恢复2%
    
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentReduction = context.getVariable<number>('critDamageReduction') || 0.2
      const newReduction = Math.max(currentReduction - recoveryRate, 0)
      
      if (newReduction < currentReduction) {
        // 更新暴击伤害降低效果
        context.removeModifiers('CRIT_DAMAGE')
        this.addModifier(context, 'CRIT_DAMAGE', -newReduction, 'MULTIPLICATIVE')
        context.setVariable('critDamageReduction', newReduction)
        this.log(context, `暴击伤害逐渐恢复，当前降低：${(newReduction * 100).toFixed(1)}%`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '暴击伤害降低效果增强！')
    
    // 刷新时增加暴击伤害降低效果
    const currentReduction = context.getVariable<number>('critDamageReduction') || 0.2
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.05)
    const newReduction = Math.min(currentReduction + refreshBonus, 0.5) // 最大降低50%
    
    // 更新效果
    context.removeModifiers('CRIT_DAMAGE')
    this.addModifier(context, 'CRIT_DAMAGE', -newReduction, 'MULTIPLICATIVE')
    context.setVariable('critDamageReduction', newReduction)
    
    this.log(context, `暴击伤害降低提升至 ${(newReduction * 100).toFixed(1)}%`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = CritDamageReductionDebuff.BUFF_ID