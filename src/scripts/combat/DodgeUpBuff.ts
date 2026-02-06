import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 闪避提升buff脚本
 * 提升角色的闪避率，使其更容易闪避敌人的攻击
 */
export class DodgeUpBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_dodge_up'

  protected _onApply(context: BuffContext): void {
    this.log(context, '闪避能力提升了！')
    
    // 提升闪避率
    const dodgeBonus = this.getConfigValue(context, 'dodgeBonus', 0.2) // 默认提升20%闪避率
    this.addModifier(context, 'DODGE_RATE', dodgeBonus, 'MULTIPLICATIVE')
    
    // 记录初始闪避提升值
    context.setVariable('dodgeBonus', dodgeBonus)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '闪避能力恢复正常')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 可以添加随时间变化的逻辑，比如闪避率逐渐衰减
    const elapsed = context.getElapsedTime()
    const decayRate = this.getConfigValue(context, 'decayRate', 0.02) // 每秒衰减2%
    
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentBonus = context.getVariable<number>('dodgeBonus') || 0.2
      const newBonus = Math.max(currentBonus - decayRate, 0)
      
      if (newBonus < currentBonus) {
        // 更新闪避提升效果
        context.removeModifiers('DODGE_RATE')
        this.addModifier(context, 'DODGE_RATE', newBonus, 'MULTIPLICATIVE')
        context.setVariable('dodgeBonus', newBonus)
        this.log(context, `闪避率逐渐衰减，当前提升：${(newBonus * 100).toFixed(1)}%`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '闪避能力进一步增强！')
    
    // 刷新时增加闪避提升效果
    const currentBonus = context.getVariable<number>('dodgeBonus') || 0.2
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.1)
    const newBonus = Math.min(currentBonus + refreshBonus, 0.5) // 最大提升50%
    
    // 更新效果
    context.removeModifiers('DODGE_RATE')
    this.addModifier(context, 'DODGE_RATE', newBonus, 'MULTIPLICATIVE')
    context.setVariable('dodgeBonus', newBonus)
    
    this.log(context, `闪避率提升至 ${(newBonus * 100).toFixed(1)}%`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = DodgeUpBuff.BUFF_ID