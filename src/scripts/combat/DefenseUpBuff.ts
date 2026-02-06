import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 防御力提升buff脚本
 * 提升角色的防御力，减少受到的伤害
 */
export class DefenseUpBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_def_up'

  protected _onApply(context: BuffContext): void {
    this.log(context, '防御力提升了！')
    
    // 提升防御力
    const defenseBonus = this.getConfigValue(context, 'defenseBonus', 15) // 默认提升15点防御力
    this.addModifier(context, 'DEF', defenseBonus, 'ADDITIVE')
    
    // 记录初始防御提升值
    context.setVariable('defenseBonus', defenseBonus)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '防御力恢复正常')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 可以添加随时间变化的逻辑，比如防御力逐渐增强
    const elapsed = context.getElapsedTime()
    const growthRate = this.getConfigValue(context, 'growthRate', 0.008) // 每秒增长0.8%
    
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const currentBonus = context.getVariable<number>('defenseBonus') || 15
      const newBonus = Math.floor(currentBonus * (1 + growthRate))
      
      if (newBonus > currentBonus) {
        // 更新防御提升效果
        context.removeModifiers('DEF')
        this.addModifier(context, 'DEF', newBonus, 'ADDITIVE')
        context.setVariable('defenseBonus', newBonus)
        this.log(context, `防御力逐渐增强，当前提升：${newBonus}点`)
      }
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '防御力进一步提升！')
    
    // 刷新时增加防御提升效果
    const currentBonus = context.getVariable<number>('defenseBonus') || 15
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 8)
    const newBonus = currentBonus + refreshBonus
    
    // 更新效果
    context.removeModifiers('DEF')
    this.addModifier(context, 'DEF', newBonus, 'ADDITIVE')
    context.setVariable('defenseBonus', newBonus)
    
    this.log(context, `防御力提升至 ${newBonus}点`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = DefenseUpBuff.BUFF_ID