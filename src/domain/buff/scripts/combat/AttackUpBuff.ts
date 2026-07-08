/**
 * 攻击提升buff
 */
import { AttributeBuffTemplate, type AttributeModifier } from '@/domain/buff/scripts/base/AttributeBuffTemplate'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

export class AttackUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_atk_up'

  protected getModifiers(): AttributeModifier[] {
    return [{
      attribute: ATTRIBUTE_CODE.attack,
      value: (ctx) => this.getConfigValue(ctx, 'stackBonus', 10),
      type: ModifierType.ADDITIVE,
      description: '攻击力提升',
    }]
  }
}

export const BUFF_ID = AttackUpBuff.BUFF_ID
