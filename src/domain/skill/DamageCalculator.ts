import type { ExtendedSkillStep } from '@/domain/skill/types'
import { AttackType, DamageCategory } from '@/domain/skill/types'
import type { CalculationLog } from '@/shared/types/battle-log'
import type { BattleEntity } from '@/domain/battle/type/types'
import type {
  CombatRecord,
  DamageBreakdown,
} from '@/domain/battle/combat-record'
import {
  ATTRIBUTE_CODE,
  getAttributeDefaultValue,
} from '@/domain/attribute/types'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'
import { EffectType } from '@/shared/types/effect'

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

/** 防御效果系数：每点防御转化为有效防御的比例 */
export const DEFENSE_EFFECTIVENESS = 0.5
/** 防御递减公式分母：控制防御收益递减曲线 */
export const DEFENSE_DENOMINATOR = 500

function getAttributeValue(
  participant: BattleEntity,
  attr: ATTRIBUTE_CODE,
): number {
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

    // ---- 构建伤害拆分对象 ----
    const breakdown: DamageBreakdown = {
      baseDamage: 0,
      extraContributions: [],
      isCritical: damageResult.isCritical,
      critRate: cr,
      critDamage: 0,
      critMultiplier: 1,
      preCritDamage: 0,
      postCritDamage: 0,
      defenseValue: 0,
      effectiveDefense: 0,
      defenseMultiplier: 1,
      generalDamageReduction: 0,
      damageTakenIncrease: 0,
      targetModifierEffects: [],
      minDamageThreshold: this.config.minDamageThreshold ?? 1,
      maxDamageThreshold: this.config.maxDamageThreshold ?? 9999,
      finalDamage: 0,
      steps: [],
    }

    // 基础伤害计算
    let damage = this.calculateBaseDamage(skillStep, source, target, record)
    breakdown.baseDamage = damage
    breakdown.steps.push({
      stepName: 'base',
      value: damage,
      description: `基础威力: ${damage}`,
    })

    // extraValues 处理 — 从 skillStep.calculation.extraValues 中读取
    if (skillStep.calculation?.extraValues) {
      for (const extra of skillStep.calculation.extraValues) {
        // ponytail: maxHealth 和 currentHealth 优先从目标读取（毒素浸染、嗜血赌徒等技能）
        const isTargetAttr = extra.attribute === 'maxHealth' || extra.attribute === 'currentHealth'
        const attrValue =
          extra.attribute === ATTRIBUTE_CODE.attack
            ? source.getRandomAttackDamage()
            : getAttributeValue(isTargetAttr ? target : source, extra.attribute as ATTRIBUTE_CODE)
        const extraValue = attrValue * extra.ratio
        damage += extraValue
        breakdown.extraContributions.push({
          attribute: extra.attribute,
          value: extraValue,
          ratio: extra.ratio,
        })
        breakdown.steps.push({
          stepName: 'extra',
          value: damage,
          description: `${extra.attribute} 额外加成: +${extraValue} → ${damage}`,
        })
        this.logCalculation(
          'extra_value',
          extraValue,
          `${extra.attribute} 额外加成: +${extraValue}`,
        )
      }
    }
    breakdown.preCritDamage = damage
    if (breakdown.extraContributions.length > 0) {
      breakdown.steps.push({
        stepName: 'preCrit',
        value: damage,
        description: `加成后伤害: ${damage}`,
      })
    }

    // 暴击倍率
    if (damageResult.isCritical) {
      const cd = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.critDamage)
      const critMultiplier = (cd ?? this.config.critDamage) / 100
      breakdown.critDamage = cd
      breakdown.critMultiplier = critMultiplier
      damage = Math.floor(damage * critMultiplier)
      breakdown.postCritDamage = damage
      breakdown.steps.push({
        stepName: 'crit',
        value: damage,
        description: `暴击! x${critMultiplier.toFixed(2)} → ${damage}`,
      })
      battleLogManager.addDebugLog(
        `暴击！伤害 x${critMultiplier}`,
        LogLevel.INFO,
      )
    } else {
      breakdown.postCritDamage = damage
    }

    // 防御计算（递减公式）
    breakdown.defenseValue = getAttributeValue(target, ATTRIBUTE_CODE.defense)
    breakdown.effectiveDefense = breakdown.defenseValue * DEFENSE_EFFECTIVENESS
    breakdown.defenseMultiplier = Math.max(
      0.1,
      1 -
        breakdown.effectiveDefense /
          (breakdown.effectiveDefense + DEFENSE_DENOMINATOR),
    )
    const beforeDef = damage
    damage = Math.floor(damage * breakdown.defenseMultiplier)
    breakdown.steps.push({
      stepName: 'defense',
      value: damage,
      description: `防御减免(x${breakdown.defenseMultiplier.toFixed(4)}): ${beforeDef} → ${damage}`,
    })

    // 攻击类型伤害减免
    const atkType = skillStep.attackType || AttackType.SKILL
    if (atkType === AttackType.NORMAL) {
      const reduction = getAttributeValue(
        target,
        ATTRIBUTE_CODE.normalAtkDmgReduction,
      )
      breakdown.normalAtkReduction = reduction
      if (reduction > 0) {
        const before = damage
        damage = Math.floor(damage * (1 - reduction / 100))
        breakdown.steps.push({
          stepName: 'normalAtkReduction',
          value: damage,
          description: `普攻减免(${reduction}%): ${before} → ${damage}`,
        })
      }
    } else {
      const reduction = getAttributeValue(
        target,
        ATTRIBUTE_CODE.skillDmgReduction,
      )
      breakdown.skillDmgReduction = reduction
      if (reduction > 0) {
        const before = damage
        damage = Math.floor(damage * (1 - reduction / 100))
        breakdown.steps.push({
          stepName: 'skillDmgReduction',
          value: damage,
          description: `技能减免(${reduction}%): ${before} → ${damage}`,
        })
      }
    }

    // 伤害大类（DamageCategory）防御/抗性逻辑
    const damageCategory = skillStep.damageCategory || DamageCategory.PHYSICAL
    ;(breakdown as any).damageCategory = damageCategory
    if (damageCategory === DamageCategory.TRUE) {
      // 真实伤害：跳过防御计算和攻击类型减免，还原到暴击后伤害
      damage = breakdown.postCritDamage
      breakdown.steps.push({
        stepName: 'trueDamage',
        value: damage,
        description: `真实伤害，跳过防御/抗性减免: → ${damage}`,
      })
    } else if (damageCategory === DamageCategory.ELEMENTAL) {
      // 元素伤害：查找目标的元素抗性，默认 fireRes
      const elementalRes = getAttributeValue(target, ATTRIBUTE_CODE.fireRes)
      ;(breakdown as any).elementalResistance = elementalRes
      if (elementalRes > 0) {
        const before = damage
        damage = Math.floor(damage * (1 - elementalRes / 100))
        breakdown.steps.push({
          stepName: 'elementalResistance',
          value: damage,
          description: `元素抗性(${elementalRes}%): ${before} → ${damage}`,
        })
      }
    }
    // 'physical' 沿用现有防御逻辑，不做额外变化

    // 通用伤害减免
    breakdown.generalDamageReduction = getAttributeValue(
      target,
      ATTRIBUTE_CODE.damageReduction,
    )
    if (breakdown.generalDamageReduction > 0) {
      const before = damage
      damage = Math.floor(damage * (1 - breakdown.generalDamageReduction / 100))
      breakdown.steps.push({
        stepName: 'generalReduction',
        value: damage,
        description: `通用减免(${breakdown.generalDamageReduction}%): ${before} → ${damage}`,
      })
    }

    // 受到伤害增加
    breakdown.damageTakenIncrease = getAttributeValue(
      target,
      ATTRIBUTE_CODE.damageTakenIncrease,
    )
    if (breakdown.damageTakenIncrease > 0) {
      const before = damage
      damage = Math.floor(damage * (1 + breakdown.damageTakenIncrease / 100))
      breakdown.steps.push({
        stepName: 'dmgTakenIncrease',
        value: damage,
        description: `受伤增加(${breakdown.damageTakenIncrease}%): ${before} → ${damage}`,
      })
    }

    // targetModifiers 处理 — 目标属性修正
    if (skillStep.targetModifiers) {
      Object.entries(skillStep.targetModifiers).forEach(([attr, modifier]) => {
        const targetAttrValue = getAttributeValue(
          target,
          attr as ATTRIBUTE_CODE,
        )
        const modifierEffect = (modifier * targetAttrValue) / 100
        damage *= 1 + modifierEffect
        damage = Math.floor(damage)
        breakdown.targetModifierEffects.push({
          attribute: attr,
          multiplier: modifier,
          effect: modifierEffect,
        })
        breakdown.steps.push({
          stepName: 'targetModifier',
          value: damage,
          description: `${attr} 目标修正(x${(1 + modifierEffect).toFixed(4)}): → ${damage}`,
        })
        this.logCalculation(
          'target_modifier',
          modifierEffect,
          `${attr} 目标修正: x${1 + modifierEffect}`,
        )
      })
    }

    // 伤害阈值限制（最小/最大伤害）
    const minDmg = this.config.minDamageThreshold ?? 1
    const maxDmg = this.config.maxDamageThreshold ?? 9999
    const beforeClamp = damage
    damage = Math.max(minDmg, Math.min(maxDmg, damage))
    if (damage !== beforeClamp) {
      breakdown.steps.push({
        stepName: 'clamp',
        value: damage,
        description: `阈值限制[${minDmg}, ${maxDmg}]: ${beforeClamp} → ${damage}`,
      })
    }

    // 确保非负整数
    damage = Math.max(0, Math.floor(damage))

    breakdown.finalDamage = damage
    breakdown.steps.push({
      stepName: 'final',
      value: damage,
      description: `最终伤害: ${damage}`,
    })

    // 写入 CombatRecord
    if (record) {
      record.damageBreakdown = breakdown
    }

    const actualDamage = damage

    // 日志记录
    this.logCalculation('final', actualDamage, `最终伤害: ${actualDamage}`)

    return {
      damage: actualDamage,
      isCritical: damageResult.isCritical,
      isMiss,
      actualDamage,
    }
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
      if (
        skillStep.attackType === AttackType.NORMAL &&
        minAtk > 0 &&
        maxAtk > 0
      ) {
        baseDamage = Math.floor(Math.random() * (maxAtk - minAtk + 1)) + minAtk
      } else {
        const atk = source.getRandomAttackDamage()
        baseDamage = Math.floor(atk + levelBonus)
      }
    }

    this.logCalculation('base', baseDamage, `基础伤害: ${baseDamage}`)

    if (record) {
      record.effects?.push({
        type: EffectType.DAMAGE,
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
    try {
      return entity.getAttribute(code)
    } catch {
      return 0
    }
  }

  private logCalculation(
    step: string,
    value: number,
    description: string,
  ): void {
    this.calculationLogs.push({ step, value, description } as any)
  }
}
