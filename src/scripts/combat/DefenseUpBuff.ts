import { AttributeBuffTemplate } from '@/scripts/base/AttributeBuffTemplate'
import type { BuffContext } from '@/core/BuffContext'

/**
 * 防御力提升buff脚本
 * 提升角色的防御力，减少受到的伤害
 */
export class DefenseUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_def_up'

  protected getAttributeName(): string {
    return 'DEF'
  }

  protected getModifierType(): 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE' {
    return 'ADDITIVE'
  }

  protected getBaseBonus(context: BuffContext): number {
    return this.getConfigValue(context, 'defenseBonus', 15)
  }

  protected getGrowthRate(context: BuffContext): number {
    return this.getConfigValue(context, 'growthRate', 0.008)
  }

  protected getRefreshBonus(context: BuffContext): number {
    return this.getConfigValue(context, 'refreshBonus', 8)
  }
}


// 导出 BUFF_ID 常量
export const BUFF_ID = DefenseUpBuff.BUFF_ID