import {
  ATTRIBUTE_CODE,
  getAttrDv,
} from '@/domain/attribute/types'
import type {
  DamageBreakdown,
} from '@/domain/battle/combat-record'
import type { BattleEntity, StepExecutionContext } from '@/domain/battle/type/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import type { ExtendedSkillStep } from '@/domain/skill/types'
import { AttackType, DamageCategory, ElementType } from '@/domain/skill/types'
import { processExtraValues, processTargetModifiers, resolveAttributeValue } from '@/domain/skill/calculation-utils'
import { LogLevel } from '@/shared/types/battle-log'
import { EffectType } from '@/domain/skill/types'
import { floor } from '@/shared/utils/math'

export interface DamageCalculationConfig {
  enableCrit: boolean
  /** 是否启用闪避机制（默认关闭，对齐 BattleRuleManager） */
  enableDodge: boolean
  critRate: number
  critDamage: number
  minDamageThreshold?: number
  /** 最大伤害阈值，默认 9999 */
  maxDamageThreshold?: number
  /** 场地元素修正回调 */
  fieldElementalModifier?: (elementType: string) => number
}

export interface DamageResult {
  damage: number
  /** 减免前伤害（Pre-mitigation Damage）。
   *  定义：经过来源方加成、暴击倍率计算后，但尚未扣除目标防御、抗性、免伤率的伤害值。
   *  用途：供"荆棘/反伤"等基于攻击方原始威力的触发器使用（模型二）。 */
  rawDamage: number
  isCritical: boolean
  isMiss: boolean
}


function getAttrVal(
  participant: BattleEntity,
  attr: ATTRIBUTE_CODE,
): number {
  return participant.getAttribute(attr)
}

interface CalculationStepLog {
  step: string
  value: number
  description: string
}

export class DamageCalculator {
  calculationLogs: CalculationStepLog[] = []
  config: DamageCalculationConfig = {
    enableCrit: false,
    enableDodge: false,
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
    context?: StepExecutionContext,
  ): DamageResult {
    this.calculationLogs = []
    let isMiss = false

    const damageResult: DamageResult = {
      damage: 0,
      isCritical: false,
      isMiss: false,
      rawDamage: 0,
    }

    // ★ 检测必暴标记：必暴意味着必中+必暴
    const hasGuaranteedCrit = typeof source.hasBuff === 'function' && source.hasBuff('buff_guaranteed_crit')

    // 命中/闪避判定 — 默认命中率100%，减去目标闪避率
    // 闪避门控：仅当 enableDodge 为 true 时执行闪避判定
    if (!hasGuaranteedCrit && this.config.enableDodge) {
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
    }

    // 暴击判定
    let cr = source.getAttribute(ATTRIBUTE_CODE.critRate)
    if (Number.isNaN(cr)) {
      cr = getAttrDv(ATTRIBUTE_CODE.critRate)
    }
    if (hasGuaranteedCrit || (this.config.enableCrit && Math.random() * 100 < cr)) {
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
      damageTakenIncrease: 0,
      targetModifierEffects: [],
      minDamageThreshold: this.config.minDamageThreshold ?? 1,
      maxDamageThreshold: this.config.maxDamageThreshold ?? 9999,
      finalDamage: 0,
      rawDamage: 0,
      steps: [],
    }

    // 基础伤害计算
    let damage = this.calculateBaseDamage(skillStep, source, target, context)
    breakdown.baseDamage = damage
    breakdown.steps.push({
      stepName: 'base',
      value: damage,
      before: 0,
      after: damage,
      sourceType: 'base',
      description: `基础威力: ${damage}`,
    })

    // extraValues 处理 — 从 skillStep.calculation.extraValues 中读取
    if (skillStep.calculation?.extraValues) {
      const { total, contributions } = processExtraValues(
        skillStep.calculation.extraValues,
        (attr) => resolveAttributeValue(attr, source, target, {
          [ATTRIBUTE_CODE.attack]: () => source.getRandomAttackDamage(),
        }),
      )
      damage += total
      breakdown.extraContributions.push(...contributions)
      for (const c of contributions) {
        breakdown.steps.push({
          stepName: 'extra',
          value: damage,
          before: damage - c.value,
          after: damage,
          sourceType: 'skill',
          description: `${c.attribute} 额外加成: +${c.value} → ${damage}`,
        })
        this.logCalculation(
          'extra_value',
          c.value,
          `${c.attribute} 额外加成: +${c.value}`,
        )
      }
    }
    breakdown.preCritDamage = damage
    if (breakdown.extraContributions.length > 0) {
      breakdown.steps.push({
        stepName: 'preCrit',
        value: damage,
        before: breakdown.baseDamage,
        after: damage,
        sourceType: 'skill',
        description: `加成后伤害: ${damage}`,
      })
    }

    // 暴击倍率
    if (damageResult.isCritical) {
      const cd = this.getAttributeOrConfig(source, ATTRIBUTE_CODE.critDamage)
      const critMultiplier = (cd ?? this.config.critDamage) / 100
      breakdown.critDamage = cd
      breakdown.critMultiplier = critMultiplier
      damage = floor(damage * critMultiplier)
      breakdown.postCritDamage = damage
      breakdown.steps.push({
        stepName: 'crit',
        value: damage,
        before: breakdown.preCritDamage,
        after: damage,
        sourceType: 'system',
        description: `暴击! x${critMultiplier.toFixed(2)} → ${damage}`,
      })
      LoggerProvider.logger.addDebugLog(`暴击！伤害 x${critMultiplier}`, {
        level: LogLevel.INFO,
      })
    } else {
      breakdown.postCritDamage = damage
    }

    // 提前获取伤害大类，供来源方加成/减免步骤判断
    const damageCategory = skillStep.damageCategory || DamageCategory.PHYSICAL
    breakdown.damageCategory = damageCategory

    // ===== 来源方加成（原始伤害阶段） =====

    // 来源方伤害提升（damageBoost）
    const dmgBoost = getAttrVal(source, ATTRIBUTE_CODE.damageBoost)
    breakdown.damageBoost = dmgBoost
    if (dmgBoost > 0) {
      const before = damage
      damage = floor(damage * (1 + dmgBoost / 100))
      breakdown.steps.push({
        stepName: 'damageBoost',
        value: damage,
        before,
        after: damage,
        sourceType: 'skill',
        description: `伤害提升(${dmgBoost}%): ${before} → ${damage}`,
      })
    }

    // 火系技能伤害加成（来源方）— 仅火元素技能
    const elementType = skillStep.elementType
    if (elementType === 'HUO') {
      const fireBonus = getAttrVal(source, ATTRIBUTE_CODE.fireSkillDmgBonus)
      breakdown.fireSkillDmgBonus = fireBonus
      if (fireBonus > 0) {
        const before = damage
        damage = floor(damage * (1 + fireBonus / 100))
        breakdown.steps.push({
          stepName: 'fireSkillDmgBonus',
          value: damage,
          before,
          after: damage,
          sourceType: 'skill',
          description: `火系技能加成(${fireBonus}%): ${before} → ${damage}`,
        })
      }
    }

    // 物理技能伤害加成（来源方）— 物理攻击类型或 PHYSICAL 大类
    const skillAtkType = skillStep.attackType || AttackType.SKILL
    if (
      skillAtkType === AttackType.NORMAL ||
      damageCategory === DamageCategory.PHYSICAL
    ) {
      const physBonus = getAttrVal(source, ATTRIBUTE_CODE.physicalSkillDmgBonus)
      breakdown.physicalSkillDmgBonus = physBonus
      if (physBonus > 0) {
        const before = damage
        damage = floor(damage * (1 + physBonus / 100))
        breakdown.steps.push({
          stepName: 'physicalSkillDmgBonus',
          value: damage,
          before,
          after: damage,
          sourceType: 'skill',
          description: `物理技能加成(${physBonus}%): ${before} → ${damage}`,
        })
      }
    }

    // 对低血量目标伤害加成（来源方）— 目标血量 < 30%
    const targetHpPercent =
      target.maxHealth > 0
        ? Math.max(0, (target.currentHealth / target.maxHealth) * 100)
        : 100
    if (targetHpPercent < 30) {
      const lowHpBonus = getAttrVal(source, ATTRIBUTE_CODE.damageToLowHp)
      breakdown.damageToLowHp = lowHpBonus
      if (lowHpBonus > 0) {
        const before = damage
        damage = floor(damage * (1 + lowHpBonus / 100))
        breakdown.steps.push({
          stepName: 'damageToLowHp',
          value: damage,
          before,
          after: damage,
          sourceType: 'skill',
          description: `低血量加成(${lowHpBonus}%): ${before} → ${damage}`,
        })
      }
    }

    // 捕获原始伤害（来源方全部产出，目标方减免前）
    // NOTE: extraValues 累加可能产生小数，与最终伤害保持一致取整，保证日志与反伤基数为整数
    breakdown.rawDamage = floor(damage)
    damage = breakdown.rawDamage
    breakdown.steps.push({
      stepName: 'rawDamage',
      value: damage,
      before: damage,
      after: damage,
      sourceType: 'system',
      description: `原始伤害（来源方产出）: ${damage}`,
    })

    // 暴击承伤减免（目标方）
    if (damageResult.isCritical) {
      const critReduction = getAttrVal(
        target,
        ATTRIBUTE_CODE.critDmgTakenReduction,
      )
      breakdown.critDmgTakenReduction = critReduction
      if (critReduction > 0) {
        const before = damage
        damage = floor(damage * (1 - critReduction / 100))
        breakdown.steps.push({
          stepName: 'critDmgTakenReduction',
          value: damage,
          before,
          after: damage,
          sourceType: 'skill',
          description: `暴击承伤减免(${critReduction}%): ${before} → ${damage}`,
        })
      }
    }

    // 防御计算（减法公式）— 真实伤害跳过
    if (damageCategory !== DamageCategory.TRUE) {
      breakdown.defenseValue = getAttrVal(target, ATTRIBUTE_CODE.defense)
      breakdown.effectiveDefense = breakdown.defenseValue
      breakdown.defenseMultiplier = Math.max(
        0,
        1 - breakdown.defenseValue / Math.max(1, damage),
      )
      const beforeDef = damage
      damage = Math.max(0, damage - breakdown.defenseValue)
      damage = floor(damage)
      breakdown.steps.push({
        stepName: 'defense',
        value: damage,
        before: beforeDef,
        after: damage,
        sourceType: 'system',
        description: `防御减免(-${breakdown.defenseValue}): ${beforeDef} → ${damage}`,
      })
    } else {
      breakdown.steps.push({
        stepName: 'defense',
        value: damage,
        before: damage,
        after: damage,
        sourceType: 'system',
        description: `真实伤害，跳过防御减免`,
      })
    }

    // 攻击类型伤害减免 — 真实伤害跳过
    if (damageCategory !== DamageCategory.TRUE) {
      const atkType = skillAtkType
      if (atkType === AttackType.NORMAL) {
        const reduction = getAttrVal(
          target,
          ATTRIBUTE_CODE.normalAtkDmgReduction,
        )
        breakdown.normalAtkReduction = reduction
        if (reduction > 0) {
          const before = damage
          damage = floor(damage * (1 - reduction / 100))
          breakdown.steps.push({
            stepName: 'normalAtkReduction',
            value: damage,
            before,
            after: damage,
            sourceType: 'system',
            description: `普攻减免(${reduction}%): ${before} → ${damage}`,
          })
        }
      } else {
        const reduction = getAttrVal(
          target,
          ATTRIBUTE_CODE.skillDmgReduction,
        )
        breakdown.skillDmgReduction = reduction
        if (reduction > 0) {
          const before = damage
          damage = floor(damage * (1 - reduction / 100))
          breakdown.steps.push({
            stepName: 'skillDmgReduction',
            value: damage,
            before,
            after: damage,
            sourceType: 'system',
            description: `技能减免(${reduction}%): ${before} → ${damage}`,
          })
        }
      }
    } else {
      breakdown.steps.push({
        stepName: 'atkTypeReduction',
        value: damage,
        before: damage,
        after: damage,
        sourceType: 'system',
        description: `真实伤害，跳过攻击类型减免`,
      })
    }

    // 五行抗性 — 仅 ELEMENTAL 根据元素类型走对应抗性
    if (damageCategory === DamageCategory.ELEMENTAL) {
      const ELEMENT_RESISTANCE_MAP: Partial<
        Record<ElementType, ATTRIBUTE_CODE>
      > = {
        JIN: ATTRIBUTE_CODE.metalRes,
        MU: ATTRIBUTE_CODE.woodRes,
        SHU: ATTRIBUTE_CODE.waterRes,
        HUO: ATTRIBUTE_CODE.fireRes,
        TU: ATTRIBUTE_CODE.earthRes,
      }
      const elementType = skillStep.elementType
      if (!elementType) {
        LoggerProvider.logger.addDebugLog(`ELEMENTAL 类型伤害缺少 elementType，默认使用 HUO(火)`, { level: LogLevel.WARN })
      }
      const resolvedType = elementType || 'HUO'
      const resAttr =
        ELEMENT_RESISTANCE_MAP[resolvedType] || ATTRIBUTE_CODE.fireRes
      const elementalRes = getAttrVal(target, resAttr)
      breakdown.elementalResistance = elementalRes
      if (elementalRes > 0) {
        const before = damage
        damage = floor(damage * (1 - elementalRes / 100))
        breakdown.steps.push({
          stepName: 'elementalResistance',
          value: damage,
          before,
          after: damage,
          sourceType: 'system',
          description: `元素抗性(${elementalRes}%): ${before} → ${damage}`,
        })
      }

      // 场地元素修正 — 紧接在元素抗性之后（修复 F3）
      if (this.config.fieldElementalModifier) {
        const fieldMod = this.config.fieldElementalModifier(resolvedType)
        if (fieldMod !== 0) {
          const before = damage
          damage = floor(damage * (1 + fieldMod / 100))
          breakdown.steps.push({
            stepName: 'fieldElemental',
            value: damage,
            before,
            after: damage,
            sourceType: 'system',
            description: `场地效果(${fieldMod > 0 ? '+' : ''}${fieldMod}%): ${before} → ${damage}`,
          })
        }
      }
    }

    // 伤害减免 — 同时作用于 ELEMENTAL 和 PHYSICAL，TRUE 跳过
    if (damageCategory !== DamageCategory.TRUE) {
      const dmgReduction = getAttrVal(target, ATTRIBUTE_CODE.damageReduction)
      breakdown.damageReduction = dmgReduction
      if (dmgReduction > 0) {
        const before = damage
        damage = floor(damage * (1 - dmgReduction / 100))
        breakdown.steps.push({
          stepName: 'damageReduction',
          value: damage,
          before,
          after: damage,
          sourceType: 'system',
          description: `伤害减免(${dmgReduction}%): ${before} → ${damage}`,
        })
      }
    } else {
      breakdown.steps.push({
        stepName: 'damageReduction',
        value: damage,
        before: damage,
        after: damage,
        sourceType: 'system',
        description: `真实伤害，跳过伤害减免`,
      })
    }

    // 受到伤害增加
    breakdown.damageTakenIncrease = getAttrVal(
      target,
      ATTRIBUTE_CODE.damageTakenIncrease,
    )
    if (breakdown.damageTakenIncrease > 0) {
      const before = damage
      damage = floor(damage * (1 + breakdown.damageTakenIncrease / 100))
      breakdown.steps.push({
        stepName: 'dmgTakenIncrease',
        value: damage,
        before,
        after: damage,
        sourceType: 'system',
        description: `受伤增加(${breakdown.damageTakenIncrease}%): ${before} → ${damage}`,
      })
    }

    // targetModifiers 处理 — 目标属性修正
    if (skillStep.targetModifiers) {
      const { result, effects } = processTargetModifiers(skillStep.targetModifiers, target, damage)
      damage = result
      breakdown.targetModifierEffects.push(...effects)
      for (const e of effects) {
        breakdown.steps.push({
          stepName: 'targetModifier',
          value: damage,
          before: damage / (1 + e.effect),
          after: damage,
          sourceType: 'skill',
          description: `${e.attribute} 目标修正(x${(1 + e.effect).toFixed(4)}): → ${damage}`,
        })
        this.logCalculation(
          'target_modifier',
          e.effect,
          `${e.attribute} 目标修正: x${1 + e.effect}`,
        )
      }
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
        before: beforeClamp,
        after: damage,
        sourceType: 'system',
        description: `阈值限制[${minDmg}, ${maxDmg}]: ${beforeClamp} → ${damage}`,
      })
    }

    // 确保非负整数
    damage = Math.max(0, floor(damage))

    breakdown.finalDamage = damage
    breakdown.steps.push({
      stepName: 'final',
      value: damage,
      before: damage,
      after: damage,
      sourceType: 'system',
      description: `最终伤害: ${damage}`,
    })

    // 写入 CombatRecord
    if (context?.record) {
      context.record.damageBreakdown = breakdown
    }

    // 日志记录
    this.logCalculation('final', damage, `最终伤害: ${damage}`)

    return {
      damage,
      rawDamage: breakdown.rawDamage,
      isCritical: damageResult.isCritical,
      isMiss,
    }
  }

  private calculateBaseDamage(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
    context?: StepExecutionContext,
  ): number {
    let baseDamage = 0
    if (skillStep.calculation) {
      baseDamage = skillStep.calculation.baseValue
      // ponytail: extraValues 在主循环 calculateDamage 中通过 getAttrVal 处理，不在基础伤害阶段重复
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

    if (context?.record) {
      context?.record.effects?.push({
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
      LoggerProvider.logger.addDebugLog('目标已死亡，无法造成伤害', { level: LogLevel.DEBUG })
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
