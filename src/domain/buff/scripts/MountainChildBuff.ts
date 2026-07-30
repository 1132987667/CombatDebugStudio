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

    // 提升气血恢复
    const hpRegen = this.getConfigValue(context, 'hpRegen', 5) // 默认每秒恢复5点气血

    // 记录初始值
    context.setVariable('natureBonus', natureBonus)
    context.setVariable('hpRegen', hpRegen)
    context.setVariable('lastRegenTime', 0)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '山林之力消散')
  }

  protected _onUpdate(context: BuffContext, deltaTime: number): void {
    const elapsed = context.getElapsedTime()
    const lastRegenTime = context.getVariable<number>('lastRegenTime') || 0
    const hpRegen = context.getVariable<number>('hpRegen') || 5

    // 每秒恢复气血值
    if (elapsed - lastRegenTime >= 1000) {
      this.log(context, `山林之力恢复 ${hpRegen} 点气血值`)
      // 这里应该调用角色的治疗方法

      context.setVariable('lastRegenTime', elapsed)
    }

    // 随时间增强自然属性加成
    const enhancementRate = this.getConfigValue(
      context,
      'enhancementRate',
      0.001,
    ) // 每秒增强0.1%
    if (Math.floor(elapsed / 1000) > Math.floor((elapsed - deltaTime) / 1000)) {
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
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '山林之力得到强化！')

    // 刷新时增强效果
    const currentBonus = context.getVariable<number>('natureBonus') || 0.15
    const currentRegen = context.getVariable<number>('hpRegen') || 5
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 0.05)

    const newBonus = Math.min(currentBonus + refreshBonus, 0.4) // 最大40%
    const newRegen = currentRegen + 2 // 增加2点气血恢复

    // 更新效果
    context.removeModifiers(ATTRIBUTE_CODE.attackBonus)
    this.addModifier(
      context,
      ATTRIBUTE_CODE.attackBonus,
      newBonus,
      ModifierType.MULTIPLICATIVE,
    )

    context.setVariable('natureBonus', newBonus)
    context.setVariable('hpRegen', newRegen)

    this.log(
      context,
      `自然属性加成提升至 ${(newBonus * 100).toFixed(1)}%，气血恢复提升至 ${newRegen}点/秒`,
    )
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = MountainChildBuff.BUFF_ID
