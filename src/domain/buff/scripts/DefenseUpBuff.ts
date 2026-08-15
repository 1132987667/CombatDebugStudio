import { AttributeBuffTemplate, type AttributeModifier } from '@/domain/buff/scripts/templates/AttributeBuffTemplate'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

export class DefenseUpBuff extends AttributeBuffTemplate {
  public static readonly BUFF_ID = 'buff_def_up'

  protected getModifiers(): AttributeModifier[] {
    return [{
      attribute: ATTRIBUTE_CODE.defense,
      // 从运行时变量读取当前值，未设置时使用配置默认值
      value: (ctx) => ctx.getVariable<number>('_defenseBonus') ?? this.getConfigValue(ctx, 'defenseBonus', 15),
      type: ModifierType.ADDITIVE,
      description: '防御力提升',
    }]
  }

  // ponytail: 成长机制由子类自行实现——模板不预设成长逻辑
  protected _onApply(context: BuffContext): void {
    context.setVariable('_defenseBonus', this.getConfigValue(context, 'defenseBonus', 15))
    super._onApply(context)
  }

  protected _onUpdate(context: BuffContext): void {
    const growthRate = this.getConfigValue(context, 'growthRate', 0.008)
    if (growthRate <= 0) return

    // 每回合成长一次
    const current = context.getVariable<number>('_defenseBonus') ?? this.getConfigValue(context, 'defenseBonus', 15)
    const newVal = Math.floor(current * (1 + growthRate))
    if (newVal > current) {
      context.setVariable('_defenseBonus', newVal)
      this.applyModifiers(context, true)
      this.log(context, `防御力逐渐增强，当前提升：${newVal}`)
    }
  }

  protected _onRefresh(context: BuffContext): void {
    const current = context.getVariable<number>('_defenseBonus') ?? this.getConfigValue(context, 'defenseBonus', 15)
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 8)
    context.setVariable('_defenseBonus', current + refreshBonus)
    // super._onRefresh 应 shouldReapplyOnRefresh() → applyModifiers(context, true)，读取更新后的 _defenseBonus
    super._onRefresh(context)
    this.log(context, `防御力刷新提升至 ${current + refreshBonus}`)
  }

  protected shouldReapplyOnRefresh(): boolean {
    return true
  }
}

export const BUFF_ID = DefenseUpBuff.BUFF_ID