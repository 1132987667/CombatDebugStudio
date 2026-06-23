import type { ExtendedSkillStep } from '@/types/skill'
import type { BattleEntity } from '@/types/battle'
import type { CombatRecord } from '@/types/combat-record'
import { ATTRIBUTE_CODE } from '@/types/attribute'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'

export interface DamageCalculationConfig {
  enableCrit: boolean
  critRate: number
  critDamage: number
  baseRate?: number
  growthRate?: number
  level?: number
  damageReduction?: number
}

export interface DamageHealCalculationConfig {
  baseValue: number
  bonusValue: number
  attackBonus: number
  defenseBonus: number
  levelBonus: number
  attributeCode: ATTRIBUTE_CODE
}

export interface DamageResult {
  damage: number
  isCritical: boolean
  isMiss: boolean
  actualDamage: number
}

export interface CalculationLog {
  step: string
  value: number
  description: string
  detail?: string
  isCritical?: boolean
  baseDamage?: number
  effectiveDefense?: number
  damageReduction?: number
}

const LEGACY_ATTR_MAP: Record<string, ATTRIBUTE_CODE> = {
  ATK: ATTRIBUTE_CODE.attack,
  DEF: ATTRIBUTE_CODE.defense,
  MAX_HP: ATTRIBUTE_CODE.maxHealth,
  CRIT_RATE: ATTRIBUTE_CODE.critRate,
  CRIT_DMG: ATTRIBUTE_CODE.critDamage,
  DMG_REDUCTION: ATTRIBUTE_CODE.damageReduction,
  DMG_TAKEN_INCREASE: ATTRIBUTE_CODE.damageTakenIncrease,
  NORMAL_ATK_DMG_REDUCTION: ATTRIBUTE_CODE.normalAtkDmgReduction,
  SKILL_DMG_REDUCTION: ATTRIBUTE_CODE.skillDmgReduction,
  CRIT_DMG_TAKEN_REDUCTION: ATTRIBUTE_CODE.critDmgTakenReduction,
  HP: ATTRIBUTE_CODE.maxHealth,
  SPD: ATTRIBUTE_CODE.speed,
  DODGE: ATTRIBUTE_CODE.dodge,
  HIT: ATTRIBUTE_CODE.hit,
}

function getAttributeValue(participant: BattleEntity, attr: string): number {
  const code = LEGACY_ATTR_MAP[attr] || (attr as ATTRIBUTE_CODE)
  return participant.getAttribute(code)
}

export class DamageCalculator {
  calculationLogs: CalculationLog[] = []
  modifiers: any[] = []
  config: DamageCalculationConfig = { enableCrit: false, critRate: 0, critDamage: 0 }

  constructor(config?: Partial<DamageCalculationConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  setConfig(config: Partial<DamageCalculationConfig>): void {
    this.config = { ...this.config, ...config }
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

    const cr = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.critRate, 'critRate')
    const hitRate = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.hit, 'hit')
    const dodgeRate = this.getAttributeOrConfig(target, ATTRIBUTE_CODE.dodge, 'dodge')
    const actualHitRate = Math.min(1, (hitRate ?? 1) - (dodgeRate ?? 0))
    if (Math.random() > actualHitRate) {
      isMiss = true
      battleLogManager.addDebugLog('Attack missed!', LogLevel.INFO)
    }
    const critRate = cr ?? this.config.critRate
    if (!isMiss && Math.random() < critRate / 100) {
      isCritical = true
    }

    const baseDamage = this.calculateBaseDamage(skillStep, source, target, record)
    let damage = baseDamage
    if (isCritical) {
      const cd = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.critDamage, 'critDamage')
      const critMultiplier = (cd ?? this.config.critDamage) / 100
      damage = Math.floor(baseDamage * critMultiplier)
      battleLogManager.addDebugLog(`Critical hit! Damage x${critMultiplier}`, LogLevel.INFO)
    }

    const defValue = getAttributeValue(target, 'DEF')
    const effectiveDefense = defValue * 0.5
    const defenseMultiplier = Math.max(0.1, 1 - effectiveDefense / (effectiveDefense + 500))
    damage = Math.floor(damage * defenseMultiplier)

    const attackType = (skillStep as any).attackType || 'skill'
    if (attackType === 'normal') {
      const reduction = getAttributeValue(target, 'NORMAL_ATK_DMG_REDUCTION')
      damage = Math.floor(damage * (1 - reduction / 100))
    } else {
      const reduction = getAttributeValue(target, 'SKILL_DMG_REDUCTION')
      damage = Math.floor(damage * (1 - reduction / 100))
    }

    const dmgReduction = getAttributeValue(target, 'DMG_REDUCTION')
    damage = Math.floor(damage * (1 - dmgReduction / 100))

    const dmgTakenIncrease = getAttributeValue(target, 'DMG_TAKEN_INCREASE')
    if (dmgTakenIncrease > 0) {
      damage = Math.floor(damage * (1 + dmgTakenIncrease / 100))
    }

    damage = Math.max(0, damage)

    const actualDamage = this.applyDamage(target, damage)

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
    const currentHp = getAttributeValue(target, 'HP')
    const health = target.getAttribute(ATTRIBUTE_CODE.currentHealth)
    const newHealth = Math.max(0, health - damage)
    target.setAttribute(ATTRIBUTE_CODE.currentHealth, newHealth)
    return damage
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
      let result = 0
      const processedFormula = formula
        .replace(/ATK/gi, String(atk))
        .replace(/DEF/gi, String(def))
        .replace(/SOURCE_LEVEL/gi, String(sourceLevel))
        .replace(/TARGET_LEVEL/gi, String(targetLevel))
        .replace(/BASE_VALUE/gi, String(baseValue))
        .replace(/BONUS_VALUE/gi, String(bonusValue))
        .replace(/ATTACK_BONUS/gi, String(attackBonus))
        .replace(/DEFENSE_BONUS/gi, String(defenseBonus))
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
    if (attrValue && attrValue > 0) return attrValue
    return (this.config as any)[configKey] || 0
  }

  private getAttributeSafe(entity: BattleEntity, code: ATTRIBUTE_CODE): number {
    try { return entity.getAttribute(code) } catch { return 0 }
  }

  private logCalculation(step: string, value: number, description: string): void {
    this.calculationLogs.push({ step, value, description } as any)
  }
}
