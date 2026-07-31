import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

/**
 * 山林之子buff脚本
 * 在山林环境中获得额外加成，包括气血恢复和属性提升
 */
export class MountainChildBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_mountain_child'

  protected _onApply(context: BuffContext): void {
    this.log(context, '山林的力量在体内流淌！')

    // 提升自然属性
    const natureBonus = this.getConfigValue(context, 'natureBonus', 0.15) // 默认15%自然属性加成
    this.addModifier(
      context,
      ATTRIBUTE_CODE.attackBonus,
      natureBonus,
      ModifierType.MULTIPLICATIVE,
    )

    // 记录初始值
    context.setVariable('natureBonus', natureBonus)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '山林之力消散')
  }

  protected _onUpdate(context: BuffContext): void {
    // 每回合增强自然属性加成
    const enhancementRate = this.getConfigValue(
      context,
      'enhancementRate',
      0.001,
    ) // 每回合增强0.1%
    const currentBonus = context.getVariable<number>('natureBonus') || 0.15
    const newBonus = Math.min(currentBonus + enhancementRate, 0.3) // 最大30%

    if (newBonus > currentBonus) {
      context.removeModifiers(ATTRIBUTE_CODE.attackBonus)
      this.addModifier(
        context,
        ATTRIBUTE_CODE.attackBonus,
        newBonus,
        ModifierType.MULTIPLICATIVE,
      )
      context.setVariable('natureBonus', newBonus)
      this.log(context, `自然属性加成增强至 ${(newBonus * 100).toFixed(1)}%`)
    }
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '山林之力得到强化！')

    // 刷新时增强效果
    const currentBonus = context.getVariable<number>('natureBonus') || 0.15
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.05)

    const newBonus = Math.min(currentBonus + refreshBonus, 0.4) // 最大40%

    // 更新效果
    context.removeModifiers(ATTRIBUTE_CODE.attackBonus)
    this.addModifier(
      context,
      ATTRIBUTE_CODE.attackBonus,
      newBonus,
      ModifierType.MULTIPLICATIVE,
    )

    context.setVariable('natureBonus', newBonus)

    this.log(
      context,
      `自然属性加成提升至 ${(newBonus * 100).toFixed(1)}%`,
    )
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = MountainChildBuff.BUFF_ID
