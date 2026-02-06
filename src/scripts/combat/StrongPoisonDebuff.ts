import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 强毒debuff脚本
 * 比普通中毒更强的毒素效果，造成更高的持续伤害
 */
export class StrongPoisonDebuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_strong_poison'

  protected _onApply(context: BuffContext): void {
    this.log(context, '强烈的毒素侵蚀身体！')
    
    // 降低移动速度和攻击力
    const speedReduction = this.getConfigValue(context, 'speedReduction', 0.2)
    const attackReduction = this.getConfigValue(context, 'attackReduction', 0.15)
    
    this.addModifier(context, 'SPD', -speedReduction, 'MULTIPLICATIVE')
    this.addModifier(context, 'ATK', -attackReduction, 'MULTIPLICATIVE')
    
    // 记录初始伤害值
    const baseDamage = this.getConfigValue(context, 'baseDamage', 15)
    context.setVariable('baseDamage', baseDamage)
    context.setVariable('lastDamageTime', 0)
    context.setVariable('speedReduction', speedReduction)
    context.setVariable('attackReduction', attackReduction)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '强毒效果消失')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    const elapsed = context.getElapsedTime()
    const lastDamageTime = context.getVariable<number>('lastDamageTime') || 0
    const damageInterval = this.getConfigValue(context, 'damageInterval', 1500) // 比普通毒更快
    
    // 每隔一段时间造成伤害
    if (elapsed - lastDamageTime >= damageInterval) {
      const baseDamage = context.getVariable<number>('baseDamage') || 15
      const damageMultiplier = this.getConfigValue(context, 'damageMultiplier', 1.3) // 比普通毒更强
      
      // 计算当前伤害（随时间递增）
      const stacks = Math.floor(elapsed / damageInterval)
      const currentDamage = Math.floor(baseDamage * Math.pow(damageMultiplier, stacks))
      
      this.log(context, `强毒伤害：${currentDamage}`)
      // 这里应该调用角色的伤害方法
      
      context.setVariable('lastDamageTime', elapsed)
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '强毒效果增强！')
    
    // 刷新时增加伤害和负面效果
    const baseDamage = context.getVariable<number>('baseDamage') || 15
    const speedReduction = context.getVariable<number>('speedReduction') || 0.2
    const attackReduction = context.getVariable<number>('attackReduction') || 0.15
    
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.05)
    
    const newSpeedReduction = Math.min(speedReduction + refreshBonus, 0.4)
    const newAttackReduction = Math.min(attackReduction + refreshBonus, 0.3)
    const newBaseDamage = baseDamage + 3
    
    // 更新效果
    context.removeModifiers('SPD')
    context.removeModifiers('ATK')
    
    this.addModifier(context, 'SPD', -newSpeedReduction, 'MULTIPLICATIVE')
    this.addModifier(context, 'ATK', -newAttackReduction, 'MULTIPLICATIVE')
    
    context.setVariable('baseDamage', newBaseDamage)
    context.setVariable('speedReduction', newSpeedReduction)
    context.setVariable('attackReduction', newAttackReduction)
    
    this.log(context, `速度降低提升至 ${(newSpeedReduction * 100).toFixed(1)}%，攻击降低提升至 ${(newAttackReduction * 100).toFixed(1)}%，基础伤害提升至 ${newBaseDamage}`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = StrongPoisonDebuff.BUFF_ID