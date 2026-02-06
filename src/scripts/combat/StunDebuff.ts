import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 眩晕debuff脚本
 * 使目标无法行动，跳过其回合
 */
export class StunDebuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_stun'

  protected _onApply(context: BuffContext): void {
    this.log(context, '被眩晕了！无法行动')
    
    // 设置眩晕状态
    context.setVariable('isStunned', true)
    
    // 降低防御力（眩晕时更容易被攻击）
    const defenseReduction = this.getConfigValue(context, 'defenseReduction', 0.2)
    this.addModifier(context, 'DEF', -defenseReduction, 'MULTIPLICATIVE')
    
    context.setVariable('defenseReduction', defenseReduction)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '眩晕效果消失')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 眩晕期间持续降低防御力
    const elapsed = context.getElapsedTime()
    const recoveryRate = this.getConfigValue(context, 'recoveryRate', 0.05) // 每秒恢复5%
    
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentReduction = context.getVariable<number>('defenseReduction') || 0.2
      const newReduction = Math.max(currentReduction - recoveryRate, 0)
      
      if (newReduction < currentReduction) {
        context.removeModifiers('DEF')
        this.addModifier(context, 'DEF', -newReduction, 'MULTIPLICATIVE')
        context.setVariable('defenseReduction', newReduction)
        this.log(context, `防御力逐渐恢复，当前降低：${(newReduction * 100).toFixed(1)}%`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '眩晕效果延长！')
    
    // 刷新时重置防御力降低效果
    const currentReduction = context.getVariable<number>('defenseReduction') || 0.2
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.1)
    const newReduction = Math.min(currentReduction + refreshBonus, 0.4)
    
    context.removeModifiers('DEF')
    this.addModifier(context, 'DEF', -newReduction, 'MULTIPLICATIVE')
    context.setVariable('defenseReduction', newReduction)
    
    this.log(context, `防御力降低提升至 ${(newReduction * 100).toFixed(1)}%`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = StunDebuff.BUFF_ID