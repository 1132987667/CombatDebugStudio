import { AttributeBuffTemplate, type AttributeModifier } from '@/domain/buff/scripts/templates/AttributeBuffTemplate'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

export class SpeedUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_speed_up'

  protected getModifiers(): AttributeModifier[] {
    return [{
      attribute: ATTRIBUTE_CODE.speed,
      value: (ctx) => this.getConfigValue(ctx, 'speedBonus', 0.2),
      type: ModifierType.MULTIPLICATIVE,
      description: '速度提升',
    }]
  }
}

export const BUFF_ID = SpeedUpBuff.BUFF_ID