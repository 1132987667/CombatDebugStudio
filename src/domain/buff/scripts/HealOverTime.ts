import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import type { BuffEffectLine } from '@/domain/buff/types'

export class HealOverTime extends BaseBuffScript {
  public static readonly BUFF_ID = 'heal_over_time'

  protected _onApply(context: BuffContext): void {
    this.log(context, '获得持续治疗效果')

    // 记录治疗相关参数
    const baseHealing = this.getConfigValue(context, 'baseHealing', 20)

    context.setVariable('baseHealing', baseHealing)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '持续治疗效果结束')
  }

  protected _onUpdate(context: BuffContext): void {
    const baseHealing = context.getVariable<number>('baseHealing') || 20
    const healingBonus = this.getConfigValue(context, 'healingBonus', 0)

    // 每回合恢复一次气血值
    const currentHealing = baseHealing + healingBonus

    this.log(context, `持续治疗：恢复 ${currentHealing} 气血值`)
    context.getBuffSystem()?.requestHeal(context.characterId, currentHealing)
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '持续治疗效果增强！')

    // 刷新时增加治疗量
    const baseHealing = context.getVariable<number>('baseHealing') || 20
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 5)

    context.setVariable('baseHealing', baseHealing + refreshBonus)

    this.log(context, `治疗量提升至 ${baseHealing + refreshBonus}`)
  }

  public getEffectLines(context: BuffContext): BuffEffectLine[] {
    const baseHealing = this.getConfigValue(context, 'baseHealing', 20)
    return [{ text: `每回合回复 ${baseHealing} 气血值`, kind: 'heal' }]
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = HealOverTime.BUFF_ID
