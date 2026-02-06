import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 攻击力提升buff脚本
 * 提升角色的攻击力，增强其伤害输出能力
 */
export class AttackUpBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_atk_up'

  protected _onApply(context: BuffContext): void {
    this.log(context, '攻击力提升了！')
    
    // 提升攻击力
    const attackBonus = this.getConfigValue(context, 'attackBonus', 20) // 默认提升20点攻击力
    this.addModifier(context, 'ATK', attackBonus, 'ADDITIVE')
    
    // 记录初始攻击提升值
    context.setVariable('attackBonus', attackBonus)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '攻击力恢复正常')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 可以添加随时间变化的逻辑，比如攻击力逐渐增强
    const elapsed = context.getElapsedTime()
    const growthRate = this.getConfigValue(context, 'growthRate', 0.01) // 每秒增长1%
    
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentBonus = context.getVariable<number>('attackBonus') || 20
      const newBonus = Math.floor(currentBonus * (1 + growthRate))
      
      if (newBonus > currentBonus) {
        // 更新攻击提升效果
        context.removeModifiers('ATK')
        this.addModifier(context, 'ATK', newBonus, 'ADDITIVE')
        context.setVariable('attackBonus', newBonus)
        this.log(context, `攻击力逐渐增强，当前提升：${newBonus}点`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '攻击力进一步提升！')
    
    // 刷新时增加攻击提升效果
    const currentBonus = context.getVariable<number>('attackBonus') || 20
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 10)
    const newBonus = currentBonus + refreshBonus
    
    // 更新效果
    context.removeModifiers('ATK')
    this.addModifier(context, 'ATK', newBonus, 'ADDITIVE')
    context.setVariable('attackBonus', newBonus)
    
    this.log(context, `攻击力提升至 ${newBonus}点`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = AttackUpBuff.BUFF_ID