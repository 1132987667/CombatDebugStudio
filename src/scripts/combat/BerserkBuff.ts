import { BaseBuffScript } from '../base/BaseBuffScript'
import type { BuffContext } from '@/core/BuffContext'

export class BerserkBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'berserk'

  protected _onApply(context: BuffContext): void {
    this.log(context, '陷入狂暴状态！攻击力大幅提升，但防御力降低')
    
    // 大幅提升攻击力
    const attackBonus = this.getConfigValue(context, 'attackBonus', 100)
    this.addModifier(context, 'ATK', attackBonus, 'ADDITIVE')
    
    // 大幅提升暴击率和暴击伤害
    this.addModifier(context, 'CRIT_RATE', 0.2, 'ADDITIVE')
    this.addModifier(context, 'CRIT_DMG', 0.5, 'ADDITIVE')
    
    // 降低防御力
    this.addModifier(context, 'DEF', -0.3, 'MULTIPLICATIVE')
    
    context.setVariable('attackBonus', attackBonus)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '狂暴状态结束，恢复平静')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    // 每秒钟损失少量生命值（狂暴的代价）
    const elapsed = context.getElapsedTime()
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
      const selfDamage = this.getConfigValue(context, 'selfDamage', 5)
      this.log(context, `狂暴的代价：损失 ${selfDamage} 生命值`)
      // 这里应该调用角色的伤害方法
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '狂暴之力进一步增强！')
    
    // 刷新时增加额外的攻击力和暴击率
    const attackBonus = this.getConfigValue(context, 'refreshAttackBonus', 20)
    const critRateBonus = this.getConfigValue(context, 'refreshCritRateBonus', 0.05)
    
    this.addModifier(context, 'ATK', attackBonus, 'ADDITIVE')
    this.addModifier(context, 'CRIT_RATE', critRateBonus, 'ADDITIVE')
    
    this.log(context, `获得额外 ${attackBonus} 攻击力和 ${(critRateBonus * 100).toFixed(0)}% 暴击率`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = BerserkBuff.BUFF_ID
