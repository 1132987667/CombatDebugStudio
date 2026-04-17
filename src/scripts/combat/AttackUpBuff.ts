import { AttributeBuffTemplate } from '@/scripts/base/AttributeBuffTemplate'
import type { BuffContext } from '@/core/BuffContext'
import { AttributeCodes } from '@/types/attribute'

export class AttackUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_atk_up'

  protected getAttributeCode(): string {
    return AttributeCodes.attack
  }

  protected getModifierType(): 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE' {
    return 'ADDITIVE'
  }

  protected getBaseBonus(context: BuffContext): number {
    return this.getConfigValue(context, 'stackBonus', 10)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = AttackUpBuff.BUFF_ID
