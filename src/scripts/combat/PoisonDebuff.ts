import { BaseBuffScript } from '@/scripts/base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

export class PoisonDebuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'poison'

  protected _onApply(context: BuffContext): void {
    this.log(context, '中毒了！毒素开始侵蚀身体')
    
    // 降低移动速度
    this.addModifier(context, 'SPD', -0.2, 'MULTIPLICATIVE')
    
    // 记录初始伤害值
    const baseDamage = this.getConfigValue(context, 'baseDamage', 10)
    context.setVariable('baseDamage', baseDamage)
    context.setVariable('lastDamageTime', 0)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '毒素效果消失')
  }

  protected _onUpdate(context: BuffContext, _deltaTime: number): void {
    const elapsed = context.getElapsedTime()
    const lastDamageTime = context.getVariable<number>('lastDamageTime') || 0
    const damageInterval = this.getConfigValue(context, 'damageInterval', 2000)
    
    // 每隔一段时间造成伤害
    if (elapsed - lastDamageTime >= damageInterval) {
      const baseDamage = context.getVariable<number>('baseDamage') || 10
      const damageMultiplier = this.getConfigValue(context, 'damageMultiplier', 1.2)
      
      // 计算当前伤害（随时间递增）
      const stacks = Math.floor(elapsed / damageInterval)
      const currentDamage = Math.floor(baseDamage * Math.pow(damageMultiplier, stacks))
      
      this.log(context, `毒素伤害：${currentDamage}`)
      // 这里应该调用角色的伤害方法
      
      context.setVariable('lastDamageTime', elapsed)
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '毒素效果增强！')
    
    // 刷新时增加伤害
    const baseDamage = context.getVariable<number>('baseDamage') || 10
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 5)
    
    context.setVariable('baseDamage', baseDamage + refreshBonus)
    
    this.log(context, `毒素伤害提升至 ${baseDamage + refreshBonus}`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = PoisonDebuff.BUFF_ID
