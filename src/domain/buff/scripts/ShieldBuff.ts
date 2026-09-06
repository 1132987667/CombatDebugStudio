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
    buffSystem.setShieldValue(context.characterId, actualShield)
  }

  protected _onRemove(context: BuffContext): void {
    const remaining = context.getBuffSystem()?.getShieldValue(context.characterId) ?? 0
    this.log(context, `护盾效果消失，剩余护盾值：${remaining}`)
    // 清除 BuffSystem 中的护盾值
    context.getBuffSystem()?.setShieldValue(context.characterId, 0)
  }

  protected _onUpdate(context: BuffContext): void {
    const shieldRegen = context.getVariable<number>('shieldRegen') || 0
    if (shieldRegen <= 0) return

    // 每回合恢复 shieldRegen 点护盾值
    // _onUpdate 由 updatePerTurn 每回合调用一次，无需时间判定
    const currentGlobal = context.getBuffSystem()?.getShieldValue(context.characterId) ?? 0
    const maxShield = context.getVariable<number>('maxShieldValue') || currentGlobal
    const newShield = Math.min(currentGlobal + shieldRegen, maxShield)

    context.getBuffSystem()?.setShieldValue(context.characterId, newShield)
    this.log(context, `护盾恢复：${currentGlobal} → ${newShield}`)
  }

  protected _onRefresh(context: BuffContext): void {
    this.log(context, '护盾效果增强！')

    // 刷新时增加护盾值
    const currentGlobal = context.getBuffSystem()?.getShieldValue(context.characterId) ?? 0
    const maxShield = context.getVariable<number>('maxShieldValue') || currentGlobal
    const refreshBonus = this.getConfigValue(context, 'refreshBonus', 20)

    const newMaxShield = maxShield + refreshBonus
    const newShield = currentGlobal + refreshBonus

    context.setVariable('maxShieldValue', newMaxShield)
    // 同步更新 BuffSystem 中的护盾值
    context.getBuffSystem()?.setShieldValue(context.characterId, newShield)

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
