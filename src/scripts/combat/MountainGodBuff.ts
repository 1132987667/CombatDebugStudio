import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

export class MountainGodBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'mountain_god'

  protected _onApply(context: BuffContext): void {
    this.log(context, '山神降临！获得强大的力量')
    
    // 添加攻击力和防御力提升
    const attackBonus = this.getConfigValue(context, 'attackBonus', 50)
    const defenseBonus = this.getConfigValue(context, 'defenseBonus', 30)
    
    this.addModifier(context, 'ATK', attackBonus, 'ADDITIVE')
    this.addModifier(context, 'DEF', defenseBonus, 'ADDITIVE')
    
    // 添加暴击率提升
    this.addModifier(context, 'CRIT_RATE', 0.1, 'ADDITIVE')
    
    context.setVariable('initialAttackBonus', attackBonus)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '山神之力消散')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 每秒钟恢复少量生命值
    const elapsed = context.getElapsedTime()
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const regeneration = this.getConfigValue(context, 'regeneration', 5)
      this.log(context, `山神的祝福：恢复 ${regeneration} 生命值`)
      // 这里应该调用角色的治疗方法
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '山神之力得到强化！')
    
    // 刷新时增加额外的攻击力
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 10)
    
    this.addModifier(context, 'ATK', refreshBonus, 'ADDITIVE')
    
    this.log(context, `获得额外 ${refreshBonus} 攻击力`)    
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = MountainGodBuff.BUFF_ID
