import type { ExtendedSkillStep } from '@/domain/skill/types'
import type { BattleEntity } from '@/domain/battle/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { ATTRIBUTE_CODE, LEGACY_ATTR_MAP } from '@/domain/attribute/types'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'

export interface DamageCalculationConfig {
  enableCrit: boolean
  critRate: number
  critDamage: number
  baseRate?: number
  growthRate?: number
  level?: number
  damageReduction?: number
  /** 最小伤害阈值，默认 1 */
  minDamageThreshold?: number
  /** 最大伤害阈值，默认 9999 */
  maxDamageThreshold?: number
}

export interface DamageResult {
  damage: number
  isCritical: boolean
  isMiss: boolean
  actualDamage: number
}

function getAttributeValue(participant: BattleEntity, attr: string): number {
  const code = LEGACY_ATTR_MAP[attr] || (attr as ATTRIBUTE_CODE)
  return participant.getAttribute(code)
}

export class DamageCalculator {
  calculationLogs: CalculationLog[] = []
  config: DamageCalculationConfig = {
    enableCrit: false,
    critRate: 0,
    critDamage: 0,
    minDamageThreshold: 1,
    maxDamageThreshold: 9999,
  }

  constructor(config?: Partial<DamageCalculationConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  setConfig(config: Partial<DamageCalculationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 获取当前配置 */
  getConfig(): DamageCalculationConfig {
    return { ...this.config }
  }

  /** 清空计算日志 */
  clearCalculationLogs(): void {
    this.calculationLogs = []
  }

  /** 获取计算日志 */
  getCalculationLogs(): CalculationLog[] {
    return [...this.calculationLogs]
  }

  calculateDamage(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): DamageResult {
    this.calculationLogs = []
    let isCritical = false
    let isMiss = false

    // 命中/闪避判定 — 默认命中率 1（100%），减去目标闪避率
    const hitRate = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.hit, 'hit') || 1
    const dodgeRate = this.getAttributeOrConfig(target, ATTRIBUTE_CODE.dodge, 'dodge') || 0
    const actualHitRate = Math.min(1, hitRate - dodgeRate)
    if (Math.random() > actualHitRate) {
      isMiss = true
      battleLogManager.addDebugLog('Attack missed!', LogLevel.INFO)
      return { damage: 0, isCritical: false, isMiss: true, actualDamage: 0 }
    }

    // 暴击判定
    const cr = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.critRate, 'critRate')
    const critRate = cr ?? this.config.critRate
    if (Math.random() < critRate / 100) {
      isCritical = true
    }

    // 基础伤害计算
    let damage = this.calculateBaseDamage(skillStep, source, target, record)

    // extraValues 处理 — 从 skillStep.calculation.extraValues 中读取
    if (skillStep.calculation?.extraValues) {
    for (const extra of skillStep.calculation.extraValues) {
        const attrValue = getAttributeValue(source, extra.attribute)
        const extraValue = attrValue * extra.ratio
        damage += extraValue
        this.logCalculation('extra_value', extraValue, `${extra.attribute} 额外加成: +${extraValue}`)
      }
    }

    // 暴击倍率
    if (isCritical) {
      const cd = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.critDamage, 'critDamage')
      const critMultiplier = (cd ?? this.config.critDamage) / 100
      damage = Math.floor(damage * critMultiplier)
      battleLogManager.addDebugLog(`Critical hit! Damage x${critMultiplier}`, LogLevel.INFO)
    }

    // 防御计算（递减公式�?
    const defValue = getAttributeValue(target, 'DEF')
    const effectiveDefense = defValue * 0.5
    const defenseMultiplier = Math.max(0.1, 1 - effectiveDefense / (effectiveDefense + 500))
    damage = Math.floor(damage * defenseMultiplier)

    // 攻击类型伤害减免
    const attackType = (skillStep as any).attackType || 'skill'
    if (attackType === 'normal') {
      const reduction = getAttributeValue(target, 'NORMAL_ATK_DMG_REDUCTION')
      damage = Math.floor(damage * (1 - reduction / 100))
    } else {
      const reduction = getAttributeValue(target, 'SKILL_DMG_REDUCTION')
      damage = Math.floor(damage * (1 - reduction / 100))
    }

    // 通用伤害减免
    const dmgReduction = getAttributeValue(target, 'DMG_REDUCTION')
    damage = Math.floor(damage * (1 - dmgReduction / 100))

    // 受到伤害增加
    const dmgTakenIncrease = getAttributeValue(target, 'DMG_TAKEN_INCREASE')
    if (dmgTakenIncrease > 0) {
      damage = Math.floor(damage * (1 + dmgTakenIncrease / 100))
    }

    // targetModifiers 处理 �?目标属性修�?   
    if (skillStep.targetModifiers) {
    Object.entries(skillStep.targetModifiers).forEach(([attr, modifier]) => {
        const targetAttrValue = getAttributeValue(target, attr)
        const modifierEffect = (modifier * targetAttrValue) / 100
        damage *= 1 + modifierEffect
        damage = Math.floor(damage)
        this.logCalculation('target_modifier', modifierEffect, `${attr} 目标修正: x${1 + modifierEffect}`)
      })
    }

    // 伤害阈值限制（最�?最大伤害）
    const minDmg = this.config.minDamageThreshold ?? 1
    const maxDmg = this.config.maxDamageThreshold ?? 9999
    damage = Math.max(minDmg, Math.min(maxDmg, damage))

    // 确保非负整数
    damage = Math.max(0, Math.floor(damage))

    const actualDamage = this.applyDamage(target, damage)

    // 日志记录
    this.logCalculation('final', actualDamage, `最终伤�? ${actualDamage}`)

    return { damage: actualDamage, isCritical, isMiss, actualDamage }
  }

  private calculateBaseDamage(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): number {
    let baseDamage = 0
    if (skillStep.formula) {
      baseDamage = this.evaluateFormula(skillStep.formula, source, target, skillStep)
    } else if (skillStep.calculation) {
      baseDamage = skillStep.calculation.baseValue
    } else {
      const atk = getAttributeValue(source, 'ATK')
      const minAtk = this.getAttributeSafe(source, ATTRIBUTE_CODE.minAttack)
      const maxAtk = this.getAttributeSafe(source, ATTRIBUTE_CODE.maxAttack)
      const levelBonus = (source.level || 1) * 2
      if ((skillStep as any).attackType === 'normal' && minAtk > 0 && maxAtk > 0) {
        baseDamage = Math.floor(Math.random() * (maxAtk - minAtk + 1)) + minAtk
      } else {
        baseDamage = Math.floor(atk + levelBonus)
      }
    }

    this.logCalculation('base', baseDamage, `基础伤害: ${baseDamage}`)

    // attackBonus 加成
    if ((skillStep as any).attackBonus && (skillStep as any).attackBonus > 0) {
      const atk = getAttributeValue(source, 'ATK')
      const bonus = Math.floor(atk * (skillStep as any).attackBonus / 100)
      baseDamage += bonus
      this.logCalculation('attack_bonus', bonus, `攻击加成: +${bonus}`)
    }

    if (record) {
      record.effects?.push({
        type: 'damage',
        targetId: target.id,
        value: baseDamage,
        description: `基础伤害 ${baseDamage}`,
      })
    }

    return baseDamage
  }

  applyDamage(target: BattleEntity, damage: number): number {
    if (!target.isAlive()) {
      battleLogManager.addDebugLog('目标已死亡，无法造成伤害')
      return 0
    }
    const actualDamage = target.takeDamage(damage)
    return actualDamage
  }

  private evaluateFormula(
    formula: string,
    source: BattleEntity,
    target: BattleEntity,
    step: ExtendedSkillStep,
  ): number {
    try {
      const atk = getAttributeValue(source, 'ATK')
      const def = getAttributeValue(target, 'DEF')
      const sourceLevel = source.level || 1
      const targetLevel = target.level || 1
      const baseValue = (step as any).baseValue || 0
      const bonusValue = (step as any).bonusValue || 0
      const attackBonus = (step as any).attackBonus || 0
      const defenseBonus = (step as any).defenseBonus || 0
      const levelBonus = (step as any).levelBonus || 0
      const processedFormula = formula
        .replace(/ATK/gi, String(atk))
        .replace(/DEF/gi, String(def))
        .replace(/SOURCE_LEVEL/gi, String(sourceLevel))
        .replace(/TARGET_LEVEL/gi, String(targetLevel))
        .replace(/BASE_VALUE/gi, String(baseValue))
        .replace(/BONUS_VALUE/gi, String(bonusValue))
        .replace(/ATTACK_BONUS/gi, String(attackBonus))
        .replace(/DEFENSE_BONUS/gi, String(defenseBonus))
      let result = 0
      try {
        result = Function(`"use strict"; return (${processedFormula})`)()
      } catch {
        result = atk * 2 - def
      }
      return Math.max(1, Math.floor(result))
    } catch {
      return 10
    }
  }

  private getAttributeOrConfig(
    entity: BattleEntity,
    code: ATTRIBUTE_CODE,
    configKey: string,
  ): number {
    const attrValue = entity.getAttribute(code)
    if (attrValue > 0) return attrValue
    // attrValue 为 0 — 回退到配置或合理默认值
    const configValue = (this.config as any)[configKey]
    if (configValue !== undefined) return configValue
    // ponytail: 命中/闪避等战斗关键属性的合理默认值，消除调用侧 || 1 的现场补救
    if (configKey === 'hit') return 1
    if (configKey === 'dodge') return 0
    return 0
  }

  private getAttributeSafe(entity: BattleEntity, code: ATTRIBUTE_CODE): number {
    try { return entity.getAttribute(code) } catch { return 0 }
  }

  private logCalculation(step: string, value: number, description: string): void {
    this.calculationLogs.push({ step, value, description } as any)
  }
}
