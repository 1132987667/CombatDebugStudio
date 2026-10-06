import { BaseBuffScript } from '@/domain/buff/scripts/templates/BaseBuffScript'
import type { BuffContext } from '@/domain/buff/BuffContext'
import type { BuffEffectLine } from '@/domain/buff/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

export class ShieldBuff extends BaseBuffScript {
  public static readonly BUFF_ID = 'buff_shield'

  protected _onApply(context: BuffContext): void {
    this.log(context, '获得护盾保护')

    // 优先使用 executeShield 传入的 shieldValue，其次为 shieldPercent * maxHP，否则按公式计算
    // NOTE: 只存储计算因子到 context，护盾实际值统一由 BuffSystem.shieldValues 管理
    const shieldValue = this.getConfigValue(context, 'shieldValue', -1)
    if (shieldValue >= 0) {
      context.setVariable('maxShieldValue', shieldValue)
    } else {
      const shieldPercent = this.getConfigValue(context, 'shieldPercent', -1)
      if (shieldPercent > 0) {
        const character = context.getCharacter()
        const maxHP = character ? character.getAttribute(ATTRIBUTE_CODE.maxHealth) : 1000
        const computed = Math.floor(maxHP * shieldPercent)
        context.setVariable('maxShieldValue', computed)
      } else {
        const baseShield = this.getConfigValue(context, 'baseShield', 100)
        const shieldScale = this.getConfigValue(context, 'shieldScale', 1)
        const character = context.getCharacter()
        const maxHP = character ? character.getAttribute(ATTRIBUTE_CODE.maxHealth) : 1000
        const calculatedShield = Math.floor(baseShield * shieldScale + maxHP * 0.1)
        context.setVariable('maxShieldValue', calculatedShield)
      }
    }
    context.setVariable('shieldRegen', this.getConfigValue(context, 'shieldRegen', 0))

    // 同步护盾值到 BuffSystem（供 takeDamage 吸收伤害）
    // 「无法获得护盾」禁用检查：碎甲类 debuff 存在时跳过上盾（维持效果但无盾值）
    const buffSystem = context.getBuffSystem()
    if (!buffSystem) return
    if (!buffSystem.canGainShield(context.characterId)) {
      this.log(context, '目标无法获得护盾，护盾效果被禁用')
      context.setVariable('maxShieldValue', 0)
      return
    }
    const actualShield = context.getVariable<number>('maxShieldValue') ?? 0
    // 累加语义（与 ShieldEffect 原语一致）：护盾值是共享池，覆盖会吞掉其他盾源的值，
    // 且本实例到期清零时也会连带清掉别的盾。本实例贡献量记入 _shieldAmount 供 onRemove 精确回收
    const current = buffSystem.getShieldValue(context.characterId)
    buffSystem.setShieldValue(context.characterId, current + actualShield)
    context.setVariable('_shieldAmount', actualShield)
  }

  protected _onRemove(context: BuffContext): void {
    const buffSystem = context.getBuffSystem()
    if (!buffSystem) return
    // 只回收本实例投入的护盾量（apply/refresh/regen 累计），不触碰其他盾源
    const contributed = context.getVariable<number>('_shieldAmount') ?? 0
    const current = buffSystem.getShieldValue(context.characterId)
    const deduction = Math.min(contributed, current)
    if (deduction > 0) {
      buffSystem.setShieldValue(context.characterId, current - deduction)
      this.log(context, `护盾效果消失，回收护盾值：${deduction}`)
    }
  }

  protected _onUpdate(context: BuffContext): void {
    const shieldRegen = context.getVariable<number>('shieldRegen') || 0
    if (shieldRegen <= 0) return

    // 每回合恢复 shieldRegen 点护盾值
    // _onUpdate 由 updatePerTurn 每回合调用一次，无需时间判定
    const buffSystem = context.getBuffSystem()
    if (!buffSystem) return
    const currentGlobal = buffSystem.getShieldValue(context.characterId)
    const maxShield = context.getVariable<number>('maxShieldValue') || currentGlobal
    const newShield = Math.min(currentGlobal + shieldRegen, maxShield)
    const grown = newShield - currentGlobal
    if (grown <= 0) return

    buffSystem.setShieldValue(context.characterId, newShield)
    // 实际恢复量归入本实例贡献，供 onRemove 回收口径一致
    context.setVariable(
      '_shieldAmount',
      (context.getVariable<number>('_shieldAmount') ?? 0) + grown,
    )
    this.log(context, `护盾恢复：${currentGlobal} → ${newShield}`)
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '护盾效果增强！')

    // 刷新时增加护盾值
    const buffSystem = context.getBuffSystem()
    if (!buffSystem) return
    const currentGlobal = buffSystem.getShieldValue(context.characterId)
    const maxShield = context.getVariable<number>('maxShieldValue') || currentGlobal
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 20)

    const newMaxShield = maxShield + refreshBonus
    const newShield = currentGlobal + refreshBonus

    context.setVariable('maxShieldValue', newMaxShield)
    // 累加 refreshBonus（非覆盖），并计入本实例贡献供 onRemove 精确回收
    buffSystem.setShieldValue(context.characterId, newShield)
    context.setVariable(
      '_shieldAmount',
      (context.getVariable<number>('_shieldAmount') ?? 0) + refreshBonus,
    )

    this.log(context, `护盾值提升至 ${newShield}/${newMaxShield}`)
  }

  public getEffectLines(context: BuffContext): BuffEffectLine[] {
    const maxShield = context.getVariable<number>('maxShieldValue') ||
      Math.floor(this.getConfigValue(context, 'baseShield', 100) * this.getConfigValue(context, 'shieldScale', 1) + 1000 * 0.1)
    return [{ text: `吸收 ${maxShield} 点伤害`, kind: ATTRIBUTE_CODE.shield }]
  }
}

// 导出 BUFF_ID 常量
export const BUFF_ID = ShieldBuff.BUFF_ID
