import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 速度降低debuff脚本
 * 降低目标的速度，影响其行动顺序和移动能力
 */
export class SpeedReductionDebuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_speed_reduction'

  protected _onApply(context: BuffContext): void {
    this.log(context, '速度被降低了！')
    
    // 降低速度
    const speedReduction = this.getConfigValue(context, 'speedReduction', 0.25) // 默认降低25%速度
    this.addModifier(context, 'SPD', -speedReduction, 'MULTIPLICATIVE')
    
    // 记录初始速度降低值
    context.setVariable('speedReduction', speedReduction)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '速度恢复正常')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 可以添加随时间变化的逻辑，比如速度逐渐恢复
    const elapsed = context.getElapsedTime()
    const recoveryRate = this.getConfigValue(context, 'recoveryRate', 0.03) // 每秒恢复3%
    
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentReduction = context.getVariable<number>('speedReduction') || 0.25
      const newReduction = Math.max(currentReduction - recoveryRate, 0)
      
      if (newReduction < currentReduction) {
        // 更新速度降低效果
        context.removeModifiers('SPD')
        this.addModifier(context, 'SPD', -newReduction, 'MULTIPLICATIVE')
        context.setVariable('speedReduction', newReduction)
        this.log(context, `速度逐渐恢复，当前降低：${(newReduction * 100).toFixed(1)}%`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '速度降低效果增强！')
    
    // 刷新时增加速度降低效果
    const currentReduction = context.getVariable<number>('speedReduction') || 0.25
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.1)
    const newReduction = Math.min(currentReduction + refreshBonus, 0.6) // 最大降低60%
    
    // 更新效果
    context.removeModifiers('SPD')
    this.addModifier(context, 'SPD', -newReduction, 'MULTIPLICATIVE')
    context.setVariable('speedReduction', newReduction)
    
    this.log(context, `速度降低提升至 ${(newReduction * 100).toFixed(1)}%`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = SpeedReductionDebuff.BUFF_ID