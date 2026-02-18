import { BaseBuffScript } from '@/scripts/base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 命中率降低debuff脚本
 * 降低目标的命中率，使其攻击更容易被闪避
 */
export class HitReductionDebuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_hit_reduction'

  protected _onApply(context: BuffContext): void {
    this.log(context, '命中率被降低了！')
    
    // 降低命中率
    const hitReduction = this.getConfigValue(context, 'hitReduction', 0.3) // 默认降低30%命中率
    this.addModifier(context, 'HIT_RATE', -hitReduction, 'MULTIPLICATIVE')
    
    // 记录初始命中率降低值
    context.setVariable('hitReduction', hitReduction)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '命中率恢复正常')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 可以添加随时间变化的逻辑，比如命中率逐渐恢复
    const elapsed = context.getElapsedTime()
    const recoveryRate = this.getConfigValue(context, 'recoveryRate', 0.05) // 每秒恢复5%
    
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentReduction = context.getVariable<number>('hitReduction') || 0.3
      const newReduction = Math.max(currentReduction - recoveryRate, 0)
      
      if (newReduction < currentReduction) {
        // 更新命中率降低效果
        context.removeModifiers('HIT_RATE')
        this.addModifier(context, 'HIT_RATE', -newReduction, 'MULTIPLICATIVE')
        context.setVariable('hitReduction', newReduction)
        this.log(context, `命中率逐渐恢复，当前降低：${(newReduction * 100).toFixed(1)}%`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '命中率降低效果增强！')
    
    // 刷新时增加命中率降低效果
    const currentReduction = context.getVariable<number>('hitReduction') || 0.3
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.1)
    const newReduction = Math.min(currentReduction + refreshBonus, 0.8) // 最大降低80%
    
    // 更新效果
    context.removeModifiers('HIT_RATE')
    this.addModifier(context, 'HIT_RATE', -newReduction, 'MULTIPLICATIVE')
    context.setVariable('hitReduction', newReduction)
    
    this.log(context, `命中率降低提升至 ${(newReduction * 100).toFixed(1)}%`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = HitReductionDebuff.BUFF_ID