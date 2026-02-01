import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

export class HealOverTime extends BaseBuffScript {
  public static readonly BUFF_ID = 'heal_over_time'

  protected _onApply(context: BuffContext): void {
    this.log(context, '获得持续治疗效果')
    
    // 记录治疗相关参数
    const baseHealing = this.getConfigValue(context, 'baseHealing', 20)
    const healInterval = this.getConfigValue(context, 'healInterval', 1000)
    
    context.setVariable('baseHealing', baseHealing)
    context.setVariable('healInterval', healInterval)
    context.setVariable('lastHealTime', 0)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '持续治疗效果结束')
  }

  protected _onUpdate(context: BuffContext, _deltaTime: number): void {
    const elapsed = context.getElapsedTime()
    const lastHealTime = context.getVariable<number>('lastHealTime') || 0
    const healInterval = context.getVariable<number>('healInterval') || 1000
    
    // 每隔一段时间恢复生命值
    if (elapsed - lastHealTime >= healInterval) {
      const baseHealing = context.getVariable<number>('baseHealing') || 20
      const healingBonus = this.getConfigValue(context, 'healingBonus', 0)
      
      const currentHealing = baseHealing + healingBonus
      
      this.log(context, `持续治疗：恢复 ${currentHealing} 生命值`)
      // 这里应该调用角色的治疗方法
      
      context.setVariable('lastHealTime', elapsed)
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '持续治疗效果增强！')
    
    // 刷新时增加治疗量
    const baseHealing = context.getVariable<number>('baseHealing') || 20
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 5)
    
    context.setVariable('baseHealing', baseHealing + refreshBonus)
    
    this.log(context, `治疗量提升至 ${baseHealing + refreshBonus}`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = HealOverTime.BUFF_ID
