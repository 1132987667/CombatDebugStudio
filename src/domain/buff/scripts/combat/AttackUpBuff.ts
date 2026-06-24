import { AttributeBuffTemplate } from '@/domain/buff/scripts/base/AttributeBuffTemplate'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

export class AttackUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_atk_up'

  protected getAttributeCode(): string {
    return ATTRIBUTE_CODE.attack
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

