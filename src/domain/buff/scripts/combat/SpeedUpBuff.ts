import { AttributeBuffTemplate } from '@/domain/buff/scripts/base/AttributeBuffTemplate'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { ModifierType } from '@/domain/attribute/types'
export class SpeedUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_speed_up'

  protected getAttributeCode(): string {
    return ATTRIBUTE_CODE.speed
  }

  protected getModifierType(): ModifierType {
    return ModifierType.MULTIPLICATIVE
  }

  protected getBaseBonus(context: BuffContext): number {
    return this.getConfigValue(context, 'speedBonus', 0.2)
  }
}

// ���� BUFF_ID ����
export const BUFF_ID = SpeedUpBuff.BUFF_ID

