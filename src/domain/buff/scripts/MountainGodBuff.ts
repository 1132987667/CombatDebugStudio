import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { StepEffectType } from '@/domain/skill/types'
export class MountainGodBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_mountain_god'

  protected _onApply(context: BuffContext): void {
    this.log(context, '山神降临！获得强大的力量')

    // 添加攻击力和防御力提升
    const attackBonus = this.getConfigValue(context, 'attackBonus', 50)
    const defenseBonus = this.getConfigValue(context, 'defenseBonus', 30)

    this.addModifier(
      context,
      ATTRIBUTE_CODE.attack,
      attackBonus,
      ModifierType.ADDITIVE,
    )
    this.addModifier(
      context,
      ATTRIBUTE_CODE.defense,
      defenseBonus,
      ModifierType.ADDITIVE,
    )

    // 添加暴击率提升
    this.addModifier(
      context,
      ATTRIBUTE_CODE.critRate,
      10,
      ModifierType.ADDITIVE,
    )

    context.setVariable('initialAttackBonus', attackBonus)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '山神之力消散')
  }

  protected _onUpdate(context: BuffContext): void {
    // 每回合恢复少量气血值
    const regeneration = this.getConfigValue(context, 'regeneration', 5)
    this.log(context, `山神的祝福：恢复 ${regeneration} 气血值`)
    this.triggerEvent(context, StepEffectType.HEAL, {
      amount: regeneration,
    })
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '山神之力得到强化！')

    // 刷新时增加额外的攻击力
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 10)

    this.addModifier(
      context,
      ATTRIBUTE_CODE.attack,
      refreshBonus,
      ModifierType.ADDITIVE,
    )

    this.log(context, `获得额外 ${refreshBonus} 攻击力`)
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = MountainGodBuff.BUFF_ID
