import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import type { BuffEffectLine } from '@/domain/buff/types'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { StepEffectType } from '@/domain/skill/types'

export class PoisonDebuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_poison'

  protected _onApply(context: BuffContext): void {
    this.log(context, '中毒了！毒素开始侵蚀身体')

    // 降低移动速度
    this.addModifier(
      context,
      ATTRIBUTE_CODE.speed,
      -0.2,
      ModifierType.MULTIPLICATIVE,
    )

    // 记录初始伤害值
    const baseDamage = this.getConfigValue(context, 'baseDamage', 10)
    context.setVariable('baseDamage', baseDamage)
  }

  protected _onRemove(context: BuffContext): void {
    this.log(context, '毒素效果消失')
  }

  protected _onUpdate(context: BuffContext): void {
    const baseDamage = context.getVariable<number>('baseDamage') || 10
    const damageMultiplier = this.getConfigValue(
      context,
      'damageMultiplier',
      1.2,
    )

    // 每回合造成一次伤害，伤害随回合数递增
    const stacks = (context.getVariable<number>('damageStacks') ?? 0) + 1
    const currentDamage = Math.floor(
      baseDamage * Math.pow(damageMultiplier, stacks),
    )

    this.log(context, `毒素伤害：${currentDamage}`)
    // 通过触发系统造成伤害（dot:true → 战报补发 dot 事件，计入承伤不计命中/技能）
    this.triggerEvent(context, StepEffectType.DEAL_DAMAGE, {
      damage: currentDamage,
      dot: true,
    })

    context.setVariable('damageStacks', stacks)
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '毒素效果增强！')

    // 刷新时增加伤害
    const baseDamage = context.getVariable<number>('baseDamage') || 10
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 5)

    context.setVariable('baseDamage', baseDamage + refreshBonus)

    this.log(context, `毒素伤害提升至 ${baseDamage + refreshBonus}`)
  }

  public getEffectLines(context: BuffContext): BuffEffectLine[] {
    const baseDamage = this.getConfigValue(context, 'baseDamage', 10)
    return [{ text: `每回合损失 ${baseDamage} 气血值`, kind: 'dot' }]
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = PoisonDebuff.BUFF_ID
