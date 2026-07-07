import type { ExtendedSkillStep } from '@/domain/skill/types'
import { AttackType } from '@/domain/skill/types'
import type { CalculationLog } from '@/shared/types/battle-log'
import type { BattleEntity } from '@/domain/battle/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { ATTRIBUTE_CODE, getAttributeDefaultValue } from '@/domain/attribute/types'
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

function getAttributeValue(participant: BattleEntity, attr: ATTRIBUTE_CODE): number {
  return participant.getAttribute(attr)
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

  /**
   *  计算伤害 
   * 逻辑为:
   * 1. 命中/闪避判定
   * 2. 暴击判定
   * 3. 基础伤害计算
   * 4. 额外加成处理
   * 5. 暴击倍率
   * 6. 防御计算（递减公式）
   * 7. 最终伤害计算
  */
  calculateDamage(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): DamageResult {
    this.calculationLogs = []
    let isMiss = false

    const damageResult: DamageResult = {
      damage: 0,
      isCritical: false,
      isMiss: false,
      actualDamage: 0,
    }

    // 命中/闪避判定 — 默认命中率100%，减去目标闪避率
    const hitRate = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.hit)
    const dodgeRate = this.getAttributeOrConfig(target, ATTRIBUTE_CODE.dodge)
    let actualHitRate = hitRate - dodgeRate
    if (actualHitRate < 0) {
      actualHitRate = 0
    }
    if (Math.random() * 100 > actualHitRate) {
      isMiss = true
      damageResult.isMiss = true
      return damageResult
    }

    // 暴击判定
    let cr = source.getAttribute(ATTRIBUTE_CODE.critRate)
    if (Number.isNaN(cr)) {
      cr = getAttributeDefaultValue(ATTRIBUTE_CODE.critRate)
    }
    if (Math.random() * 100 < cr) {
      damageResult.isCritical = true
    }

    // 基础伤害计算
    let damage = this.calculateBaseDamage(skillStep, source, target, record)

    // extraValues 处理 — 从 skillStep.calculation.extraValues 中读取
    if (skillStep.calculation?.extraValues) {
    for (const extra of skillStep.calculation.extraValues) {
        const attrValue = getAttributeValue(source, extra.attribute as ATTRIBUTE_CODE)
        const extraValue = attrValue * extra.ratio
        damage += extraValue
        this.logCalculation('extra_value', extraValue, `${extra.attribute} 额外加成: +${extraValue}`)
      }
    }

    // 暴击倍率
    if (damageResult.isCritical) {
      const cd = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.critDamage)
      const critMultiplier = (cd ?? this.config.critDamage) / 100
      damage = Math.floor(damage * critMultiplier)
      battleLogManager.addDebugLog(`暴击！伤害 x${critMultiplier}`, LogLevel.INFO)
    }

    // 防御计算（递减公式�?
    const defValue = getAttributeValue(target, ATTRIBUTE_CODE.defense)
    const effectiveDefense = defValue * 0.5
    const defenseMultiplier = Math.max(0.1, 1 - effectiveDefense / (effectiveDefense + 500))
    damage = Math.floor(damage * defenseMultiplier)

    // 攻击类型伤害减免
    const atkType = skillStep.attackType || AttackType.SKILL_ATTACK
    if (atkType === AttackType.NORMAL_ATTACK) {
      const reduction = getAttributeValue(target, ATTRIBUTE_CODE.normalAtkDmgReduction)
      damage = Math.floor(damage * (1 - reduction / 100))
    } else {
      const reduction = getAttributeValue(target, ATTRIBUTE_CODE.skillDmgReduction)
      damage = Math.floor(damage * (1 - reduction / 100))
    }

    // 通用伤害减免
    const dmgReduction = getAttributeValue(target, ATTRIBUTE_CODE.damageReduction)
    damage = Math.floor(damage * (1 - dmgReduction / 100))

    // 受到伤害增加
    const dmgTakenIncrease = getAttributeValue(target, ATTRIBUTE_CODE.damageTakenIncrease)
    if (dmgTakenIncrease > 0) {
      damage = Math.floor(damage * (1 + dmgTakenIncrease / 100))
    }

    // targetModifiers 处理 �?目标属性修�?   
    if (skillStep.targetModifiers) {
    Object.entries(skillStep.targetModifiers).forEach(([attr, modifier]) => {
        const targetAttrValue = getAttributeValue(target, attr as ATTRIBUTE_CODE)
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

    const actualDamage = damage

    // 日志记录
    this.logCalculation('final', actualDamage, `最终伤�? ${actualDamage}`)

    return { damage: actualDamage, isCritical: damageResult.isCritical, isMiss, actualDamage }
  }

  private calculateBaseDamage(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): number {
    let baseDamage = 0
    if (skillStep.calculation) {
      baseDamage = skillStep.calculation.baseValue
      // ponytail: extraValues 在主循环 calculateDamage 中通过 getAttributeValue 处理，不在基础伤害阶段重复
    } else {
      const minAtk = this.getAttributeSafe(source, ATTRIBUTE_CODE.minAttack)
      const maxAtk = this.getAttributeSafe(source, ATTRIBUTE_CODE.maxAttack)
      const levelBonus = (source.level || 1) * 2
      if (skillStep.attackType === AttackType.NORMAL_ATTACK && minAtk > 0 && maxAtk > 0) {
        baseDamage = Math.floor(Math.random() * (maxAtk - minAtk + 1)) + minAtk
      } else {
        const atk = source.getRandomAttackDemage()
        baseDamage = Math.floor(atk + levelBonus)
      }
    }

    this.logCalculation('base', baseDamage, `基础伤害: ${baseDamage}`)

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

  private getAttributeOrConfig(
    entity: BattleEntity,
    code: ATTRIBUTE_CODE,
  ): number {
    const attrValue = entity.getAttribute(code)
    // ponytail: 0 是有效的百分数值（如 0% 暴击），不能用 falsy 判断
    if (attrValue != null) {
      return attrValue
    }
    return 0
  }

  private getAttributeSafe(entity: BattleEntity, code: ATTRIBUTE_CODE): number {
    try { return entity.getAttribute(code) } catch { return 0 }
  }

  private logCalculation(step: string, value: number, description: string): void {
    this.calculationLogs.push({ step, value, description } as any)
  }
}
