import { AttributeBuffTemplate } from '@/scripts/base/AttributeBuffTemplate'
import type { BuffContext } from '@/core/BuffContext'
import { ATTRIBUTE_CODE } from '@/types/attribute'

export class SpeedUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_speed_up'

  protected getAttributeCode(): string {
    return ATTRIBUTE_CODE.speed
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
