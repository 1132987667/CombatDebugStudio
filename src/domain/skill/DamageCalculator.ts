import type { ExtendedSkillStep } from '@/domain/skill/types'
import { AttackType, DamageCategory, ElementType } from '@/domain/skill/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type {
  CombatRecord,
  DamageBreakdown,
} from '@/domain/battle/combat-record'
import {
  ATTRIBUTE_CODE,
  getAttributeDefaultValue,
} from '@/domain/attribute/types'
import { LogLevel } from '@/shared/types/battle-log'
import { EffectType } from '@/shared/types/effect'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

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

/** ponytail: 以下常量已不再使用，保留作为历史参考
 * DEFENSE_EFFECTIVENESS = 0.5
 * DEFENSE_DENOMINATOR   = 500
 * 当前使用减法公式：damage = Math.max(0, damage - defense)
 */

function getAttributeValue(
  participant: BattleEntity,
  attr: ATTRIBUTE_CODE,
): number {
  return participant.getAttribute(attr)
}

/** ponytail: 内部计算步骤日志，不同于外部 CalculationLog 的完整结构 */
interface CalculationStepLog {
  step: string
  value: number
  description: string
}

export class DamageCalculator {
  calculationLogs: CalculationStepLog[] = []
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
  getCalculationLogs(): CalculationStepLog[] {
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
      LoggerProvider.logger.addDebugLog(
        `暴击！伤害 x${critMultiplier}`,
        { level: LogLevel.INFO },
      )
    } else {
      breakdown.postCritDamage = damage
    }

    // 暴击承伤减免（目标方）
    if (damageResult.isCritical) {
      const critReduction = getAttributeValue(target, ATTRIBUTE_CODE.critDmgTakenReduction)
      breakdown.critDmgTakenReduction = critReduction
      if (critReduction > 0) {
        const before = damage
        damage = Math.floor(damage * (1 - critReduction / 100))
        breakdown.steps.push({
          stepName: 'critDmgTakenReduction',
          value: damage,
          description: `暴击承伤减免(${critReduction}%): ${before} → ${damage}`,
        })
      }
    }

    // 防御计算（减法公式：不破防为 0）
    breakdown.defenseValue = getAttributeValue(target, ATTRIBUTE_CODE.defense)
    breakdown.effectiveDefense = breakdown.defenseValue
    breakdown.defenseMultiplier = Math.max(
      0,
      1 - breakdown.defenseValue / Math.max(1, damage),
    )
    const beforeDef = damage
    damage = Math.max(0, damage - breakdown.defenseValue)
    damage = Math.floor(damage)
    breakdown.steps.push({
      stepName: 'defense',
      value: damage,
      description: `防御减免(-${breakdown.defenseValue}): ${beforeDef} → ${damage}`,
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
    breakdown.damageCategory = damageCategory
    if (damageCategory === DamageCategory.TRUE) {
      // 真实伤害：跳过防御计算和攻击类型减免，还原到暴击后伤害
      damage = breakdown.postCritDamage
      breakdown.steps.push({
        stepName: 'trueDamage',
        value: damage,
        description: `真实伤害，跳过防御/抗性减免: → ${damage}`,
      })
    } else if (damageCategory === DamageCategory.ELEMENTAL) {
      // 元素伤害：根据技能的元素类型查找对应抗性，默认 fireRes
      const ELEMENT_RESISTANCE_MAP: Partial<Record<ElementType, ATTRIBUTE_CODE>> = {
        JIN: ATTRIBUTE_CODE.metalRes,
        MU: ATTRIBUTE_CODE.woodRes,
        SHU: ATTRIBUTE_CODE.waterRes,
        HUO: ATTRIBUTE_CODE.fireRes,
        TU: ATTRIBUTE_CODE.earthRes,
      }
      const elementType = skillStep.elementType
      if (!elementType) {
        console.warn(`ELEMENTAL 类型伤害缺少 elementType，默认使用 HUO(火)`)
      }
      const resolvedType = elementType || 'HUO'
      const resAttr = ELEMENT_RESISTANCE_MAP[resolvedType] || ATTRIBUTE_CODE.fireRes
      const elementalRes = getAttributeValue(target, resAttr)
      breakdown.elementalResistance = elementalRes
      if (elementalRes > 0) {
        const before = damage
        damage = Math.floor(damage * (1 - elementalRes / 100))
        breakdown.steps.push({
          stepName: 'elementalResistance',
          value: damage,
          description: `元素抗性(${elementalRes}%): ${before} → ${damage}`,
        })
      }
      // 魔法伤害减免（仅 ELEMENTAL 大类生效）
      breakdown.magicalDmgReduction = getAttributeValue(target, ATTRIBUTE_CODE.magicalDmgReduction)
      breakdown.elementType = resolvedType
      if (breakdown.magicalDmgReduction > 0) {
        const before = damage
        damage = Math.floor(damage * (1 - breakdown.magicalDmgReduction / 100))
        breakdown.steps.push({
          stepName: 'magicalDmgReduction',
          value: damage,
          description: `魔法减免(${breakdown.magicalDmgReduction}%): ${before} → ${damage}`,
        })
      }
    }
    // 'physical' 沿用现有防御逻辑，加物理伤害减免
    if (damageCategory === DamageCategory.PHYSICAL) {
      breakdown.physicalDmgReduction = getAttributeValue(target, ATTRIBUTE_CODE.physicalDmgReduction)
      if (breakdown.physicalDmgReduction > 0) {
        const before = damage
        damage = Math.floor(damage * (1 - breakdown.physicalDmgReduction / 100))
        breakdown.steps.push({
          stepName: 'physicalDmgReduction',
          value: damage,
          description: `物理减免(${breakdown.physicalDmgReduction}%): ${before} → ${damage}`,
        })
      }
    }

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

    // 来源方伤害提升（damageBoost）
    const dmgBoost = getAttributeValue(source, ATTRIBUTE_CODE.damageBoost)
    breakdown.damageBoost = dmgBoost
    if (dmgBoost > 0) {
      const before = damage
      damage = Math.floor(damage * (1 + dmgBoost / 100))
      breakdown.steps.push({
        stepName: 'damageBoost',
        value: damage,
        description: `伤害提升(${dmgBoost}%): ${before} → ${damage}`,
      })
    }

    // 火系技能伤害加成（来源方）— 仅火元素技能
    const elementType = skillStep.elementType
    if (elementType === 'HUO') {
      const fireBonus = getAttributeValue(source, ATTRIBUTE_CODE.fireSkillDmgBonus)
      breakdown.fireSkillDmgBonus = fireBonus
      if (fireBonus > 0) {
        const before = damage
        damage = Math.floor(damage * (1 + fireBonus / 100))
        breakdown.steps.push({
          stepName: 'fireSkillDmgBonus',
          value: damage,
          description: `火系技能加成(${fireBonus}%): ${before} → ${damage}`,
        })
      }
    }

    // 物理技能伤害加成（来源方）— 物理攻击类型或 PHYSICAL 大类
    const skillAtkType = skillStep.attackType || AttackType.SKILL
    if (skillAtkType === AttackType.NORMAL || skillStep.damageCategory === DamageCategory.PHYSICAL) {
      const physBonus = getAttributeValue(source, ATTRIBUTE_CODE.physicalSkillDmgBonus)
      breakdown.physicalSkillDmgBonus = physBonus
      if (physBonus > 0) {
        const before = damage
        damage = Math.floor(damage * (1 + physBonus / 100))
        breakdown.steps.push({
          stepName: 'physicalSkillDmgBonus',
          value: damage,
          description: `物理技能加成(${physBonus}%): ${before} → ${damage}`,
        })
      }
    }

    // 对低血量目标伤害加成（来源方）— 目标血量 < 30%
    const targetHpPercent = target.maxHealth > 0 ? (target.currentHealth / target.maxHealth) * 100 : 100
    if (targetHpPercent < 30) {
      const lowHpBonus = getAttributeValue(source, ATTRIBUTE_CODE.damageToLowHp)
      breakdown.damageToLowHp = lowHpBonus
      if (lowHpBonus > 0) {
        const before = damage
        damage = Math.floor(damage * (1 + lowHpBonus / 100))
        breakdown.steps.push({
          stepName: 'damageToLowHp',
          value: damage,
          description: `低血量加成(${lowHpBonus}%): ${before} → ${damage}`,
        })
      }
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
      LoggerProvider.logger.addDebugLog('目标已死亡，无法造成伤害')
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
    this.calculationLogs.push({ step, value, description })
  }
}
