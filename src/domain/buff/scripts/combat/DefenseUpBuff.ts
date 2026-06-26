import { AttributeBuffTemplate } from '@/domain/buff/scripts/base/AttributeBuffTemplate'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { ModifierType } from '@/domain/attribute/types'

export class DefenseUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_def_up'

  protected getAttributeCode(): string {
    return ATTRIBUTE_CODE.defense
  }

  protected getModifierType(): ModifierType {
    return ModifierType.ADDITIVE
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


export const BUFF_ID = DefenseUpBuff.BUFF_ID

