import { AttributeBuffTemplate } from '@/scripts/base/AttributeBuffTemplate'
import type { BuffContext } from '@/core/BuffContext'

export class SpeedUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_speed_up'

  protected getAttributeName(): string {
    return 'SPD'
  }

  protected getModifierType(): 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE' {
    return 'MULTIPLICATIVE'
  }

  protected getBaseBonus(context: BuffContext): number {
    return this.getConfigValue(context, 'speedBonus', 0.2)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = SpeedUpBuff.BUFF_ID
