import type { ExtendedSkillStep, SkillStep } from '@/domain/skill/types'
import { SkillStepType } from '@/domain/skill/types'
import type { BattleAction, BattleEntity } from '@/domain/battle/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { StackRule, ControlType, type BuffConfig } from '@/domain/buff/types'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'
import { BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'
import { EffectType } from '@/shared/types/effect'
import { ATTRIBUTE_CODE, ModifierType, ModifierSourceType, type Modifier } from '@/domain/attribute/types'

/** ponytail: 追踪同一攻击者的连续命中目标和计数 */
interface ComboState {
  /** 最后攻击的目标 ID */
  lastTargetId: string
  /** 连续命中次数 */
  streak: number
  /** 普攻总次数（用于第三连击） */
  totalAttacks: number
}

export class SkillExecutor {
  constructor(
    private readonly damageCalculator: DamageCalculator,
    private readonly healCalculator: HealCalculator,
    private readonly buffSystem: BuffSystem,
  ) {}

  /** ponytail: 连击追踪状态（key = 攻击者 entity ID） */
  private comboStates = new Map<string, ComboState>()

  /* ponytail: 延迟伤害模式 — 为 true 时 executeDamage/executeHeal 只记录数值到 action，不调用 target.takeDamage()/heal()，
   由调用方在动画完成后统一应用 */
  public deferDamage = false

  executeStep(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    switch (skillStep.type) {
      case SkillStepType.DEAL_DAMAGE:
        this.executeDamage(skillStep, action, source, target, record)
        break
      case SkillStepType.HEAL:
        this.executeHeal(skillStep, action, source, target, record)
        break
      case SkillStepType.APPLY_BUFF:
        this.executeBuff(skillStep, action, source, target, record)
        break
      case SkillStepType.SHIELD:
        this.executeShield(skillStep, action, source, target)
        break
      case SkillStepType.STUN:
      case SkillStepType.SILENCE:
        this.executeControl(skillStep, action, source, target, skillStep.type)
        break
      case SkillStepType.MODIFY_ATTRIBUTE:
        this.executeModifyAttribute(skillStep, action, source, target)
        break
      case SkillStepType.REMOVE_DEBUFF:
      case SkillStepType.CLEANSE:
        this.executeCleanse(skillStep, action, source, target)
        break
      case SkillStepType.REFLECT:
        this.executeReflect(skillStep, action, source, target)
        break
      case SkillStepType.DRAIN:
        this.executeDrain(skillStep, action, source, target, record)
        break
      case SkillStepType.CUSTOM:
        this.executeCustom(skillStep, action, source, target)
        break
      default: {
        // ponytail: 未实现的步骤类型 — 当前无任何技能配置使用这些类型
        // 升级路径：当有技能配置使用它们时，在 switch 中添加对应 case
        battleLogManager.addDebugLog(
          `未实现的技能步骤类型: ${skillStep.type}`,
          LogLevel.WARN,
        )
        action.effects.push({
          type: EffectType.STATUS,
          targetId: target.id,
          description: `步骤类型 ${skillStep.type} 未实现`,
        })
        break
      }
    }
  }

  private executeDamage(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const result = this.damageCalculator.calculateDamage(
      skillStep,
      source,
      target,
      record,
    )
    if (result.isMiss) {
      action.effects.push({
        type: EffectType.MISS,
        targetId: target.id,
        value: 0,
        description: `${target.name} dodged attack`,
      })
    } else {
      if (this.deferDamage) {
        // ponytail: 延迟模式 — 只记录伤害数值，不调用 takeDamage，由调用方在动画后统一应用
        action.damage = (action.damage ?? 0) + result.damage
        action.effects.push({
          type: EffectType.DAMAGE,
          targetId: target.id,
          value: result.damage,
          description: `${source.name} deals ${result.damage} damage`,
          isCritical: result.isCritical,
        })
      } else {
        const actualDamage = this.damageCalculator.applyDamage(
          target,
          result.damage,
        )
        action.damage = (action.damage ?? 0) + actualDamage
        action.effects.push({
          type: EffectType.DAMAGE,
          targetId: target.id,
          value: actualDamage,
          description: `${source.name} deals ${actualDamage} damage`,
          isCritical: result.isCritical,
        })
      }
    }
  }

  private executeHeal(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const healTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    const heal = this.healCalculator.calculateHeal(
      skillStep,
      source,
      healTarget,
      record,
    )
    if (this.deferDamage) {
      // ponytail: 延迟模式 — 只记录治疗数值，由调用方在动画后统一应用
      action.heal = (action.heal ?? 0) + heal
      action.effects.push({
        type: EffectType.HEAL,
        targetId: healTarget.id,
        value: heal,
        description: `${healTarget.name} healed for ${heal}`,
      })
    } else {
      const actualHeal = this.healCalculator.applyHeal(healTarget, heal)
      action.heal = (action.heal ?? 0) + actualHeal
      action.effects.push({
        type: EffectType.HEAL,
        targetId: healTarget.id,
        value: actualHeal,
        description: `${healTarget.name} healed for ${actualHeal}`,
      })
    }
    if (this.healCalculator.isSingleTurnEffect(skillStep)) {
      action.effects.push({
        type: EffectType.STATUS,
        description: 'Single-turn heal effect applied immediately',
      })
    }
  }

  private executeBuff(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const buffId = skillStep.buffId ?? skillStep.effectId
    if (!buffId) return

    const buffTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    const buffConfig: BuffConfig = {
      id: buffId,
      name: buffId,
      description: '',
      duration: skillStep.duration ?? undefined,
      maxStacks: skillStep.stacks ?? undefined,
      cooldown: 0,
      stackRule: StackRule.LIMITED,
      controlType: ControlType.NONE,
      controlPriority: 0,
      isDebuff: false,
      parameters: skillStep.parameters || skillStep.effectParams || {},
    }

    const instanceId = this.buffSystem.addBuff(
      buffTarget.id,
      buffId,
      buffConfig,
      0,
      record,
    )
    action.effects.push({
      type: EffectType.BUFF,
      targetId: buffTarget.id,
      buffId,
      instanceId,
      description: `${source.name} applies ${buffId} to ${buffTarget.name}`,
    })

    // ponytail: Buff 效果日志
    if (instanceId) {
      const displayName = buffId.replace(/^(guardian_|buff_|debuff_)/, '')
      battleLogManager.addSystemLog({
        message: `${source.name} 对 ${buffTarget.name} 施加 ${displayName}`,
        category: BATTLE_LOG_CATEGORIES.STATUS,
      })
    }
  }

  /** 运行时修改目标属性（modify_attribute 步骤） */
  private executeModifyAttribute(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    const modTarget = skillStep.targetConfig?.faction === 'self' ? source : target
    const modifiers = skillStep.modifiers
    if (!modifiers || modifiers.length === 0) return

    for (const mod of modifiers) {
      const attrCode = mod.targetAttribute as ATTRIBUTE_CODE
      const attrData = modTarget.getAttrValue(attrCode)
      if (!attrData) continue

      const modType = mod.type === 'PERCENTAGE' ? ModifierType.PERCENTAGE
        : mod.type === 'ADDITIVE' ? ModifierType.ADDITIVE
        : mod.type === 'MULTIPLICATIVE' ? ModifierType.MULTIPLICATIVE
        : mod.type === 'FINAL' ? ModifierType.FINAL
        : ModifierType.ADDITIVE

      let value = typeof mod.value === 'number' ? mod.value : 0
      // ponytail: PERCENTAGE 值在配置中是百分比值（如 5 表示 5%），直接使用
      if (modType === ModifierType.PERCENTAGE && Math.abs(value) < 1) {
        value = Math.round(value * 10000) / 100
      }

      const sourceKey = `passive:runtime:${mod.id || skillStep.buffId || 'mod'}`

      // ponytail: 去重 — 移除同 sourceKey 的旧修饰符再添加新值
      attrData.modifiers = attrData.modifiers.filter(m => m.sourceKey !== sourceKey)

      const newMod: Modifier = {
        sourceKey,
        sourceType: ModifierSourceType.SKILL,
        attribute: attrCode,
        value,
        type: modType,
        description: mod.sourceName || '被动技能',
      }
      attrData.modifiers.push(newMod)
      attrData.cachedVersion = -1
    }

    modTarget.recalcAll()

    action.effects.push({
      type: EffectType.STATUS,
      targetId: modTarget.id,
      description: `modify_attribute: ${modifiers.length} 个属性已修改`,
    })
  }

  /** 净化/移除减益（cleanse / remove_debuff 步骤） */
  private executeCleanse(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    const modTarget = skillStep.targetConfig?.faction === 'self' ? source : target
    const instances = this.buffSystem.getBuffInstances(modTarget.id)
    const isRemoveDebuff = skillStep.type === SkillStepType.REMOVE_DEBUFF
    const count = skillStep.count || (isRemoveDebuff ? 1 : 999)

    let removed = 0
    for (const instance of instances) {
      if (removed >= count) break
      // ponytail: REMOVE_DEBUFF 只移除 isDebuff 的 buff；CLEANSE 移除所有
      if (isRemoveDebuff && !instance.config?.isDebuff) continue
      this.buffSystem.removeBuff(instance.id)
      removed++
    }

    action.effects.push({
      type: EffectType.STATUS,
      targetId: modTarget.id,
      description: `${isRemoveDebuff ? '移除减益' : '净化'}: ${removed} 个效果`,
    })
  }

  /** 反射伤害（reflect 步骤） */
  private executeReflect(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    // ponytail: reflect 的目标是攻击者（即 executeStep 的 target 是攻击者）
    // source 是受击者（拥有反射技能的角色）
    const dmg = this.damageCalculator.calculateDamage(skillStep, source, target)
    if (!dmg.isMiss && dmg.damage > 0) {
      if (this.deferDamage) {
        // ponytail: 延迟模式 — 只记录，由调用方动画后统一应用
        action.damage = (action.damage ?? 0) + dmg.damage
      } else {
        this.damageCalculator.applyDamage(target, dmg.damage)
      }
      action.effects.push({
        type: EffectType.DAMAGE,
        targetId: target.id,
        value: dmg.damage,
        description: `${source.name} 反弹 ${dmg.damage} 伤害给 ${target.name}`,
      })
    }
  }

  /** 吸取生命（drain 步骤） */
  private executeDrain(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const dmg = this.damageCalculator.calculateDamage(skillStep, source, target, record)
    if (!dmg.isMiss && dmg.damage > 0) {
      if (this.deferDamage) {
        // ponytail: 延迟模式 — 只记录，由调用方动画后统一应用
        action.damage = (action.damage ?? 0) + dmg.damage
        action.heal = (action.heal ?? 0) + dmg.damage
      } else {
        this.damageCalculator.applyDamage(target, dmg.damage)
        const actualHeal = source.heal(dmg.damage)
        if (actualHeal > 0) {
          action.heal = (action.heal ?? 0) + actualHeal
        }
      }
      action.effects.push({
        type: EffectType.DAMAGE,
        targetId: target.id,
        value: dmg.damage,
        description: `${source.name} 吸取 ${dmg.damage} 生命`,
      })
    }
  }

  /** ponytail: 自定义步骤分发 */
  private executeCustom(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    const customType = skillStep.parameters?.customType as string | undefined
    const desc = (skillStep.parameters?.description as string) || ''

    // ponytail: 根据 customType 或 description 关键词分发
    if (customType === 'third_strike' || desc.includes('第三')) {
      this.handleThirdStrike(action, source)
    } else if (customType === 'combo_master' || desc.includes('连续攻击')) {
      this.handleComboMaster(action, source, target)
    } else if (customType === 'burn_detonate' || customType === 'burn_detonate_full') {
      this.handleBurnDetonate(action, source, target, customType === 'burn_detonate_full')
    } else if (customType === 'extra_action') {
      // ponytail: 时之沙 — 15% 概率额外行动，需要 BattleSystem 插入回合队列支持
      battleLogManager.addDebugLog('时之沙: 15%额外行动 — 需要 BattleSystem 回合队列插入', LogLevel.INFO)
      action.effects.push({
        type: EffectType.STATUS,
        targetId: source.id,
        description: '时之沙触发！(额外行动待实现)',
      })
    } else if (customType === 'steal_item') {
      // ponytail: 盗窃本能 — PvE 掉落系统，非战斗逻辑
      battleLogManager.addDebugLog('盗窃本能: PvE 掉落系统专用', LogLevel.INFO)
    } else if (customType === 'overflow_shield') {
      // ponytail: 回春护盾溢出 — 需要治疗完成后检查溢出量并生成护盾
      battleLogManager.addDebugLog('回春护盾溢出转盾: 需要治疗回调机制', LogLevel.INFO)
    } else {
      battleLogManager.addDebugLog(`自定义步骤未实现: ${desc}`, LogLevel.WARN)
      action.effects.push({
        type: EffectType.STATUS,
        targetId: target.id,
        description: `自定义效果待实现: ${desc}`,
      })
    }
  }

  /** 第三连击：每第3次普攻伤害+50% */
  private handleThirdStrike(
    action: BattleAction,
    source: BattleEntity,
  ): void {
    let state = this.comboStates.get(source.id)
    if (!state) {
      state = { lastTargetId: '', streak: 0, totalAttacks: 0 }
      this.comboStates.set(source.id, state)
    }
    state.totalAttacks++

    if (state.totalAttacks % 3 === 0) {
      // 应用伤害加成
      const attrData = source.getAttrValue(ATTRIBUTE_CODE.damageBoost)
      if (attrData) {
        const sourceKey = 'custom:third_strike'
        attrData.modifiers = attrData.modifiers.filter(m => m.sourceKey !== sourceKey)
        attrData.modifiers.push({
          sourceKey,
          sourceType: ModifierSourceType.SKILL,
          attribute: ATTRIBUTE_CODE.damageBoost,
          value: 50,
          type: ModifierType.ADDITIVE,
          description: '第三连击',
        })
        attrData.cachedVersion = -1
        // 通过 recalcAll 使生效，但在被动触发时 source.recalcAll 可能导致问题
        // ponytail: 简化实现 — 加一个临时 buff 替代
        source.recalcAll()
      }
      action.effects.push({
        type: EffectType.STATUS,
        targetId: source.id,
        description: '第三连击！伤害+50%',
      })
    }
  }

  /** 连击大师：连续攻击同一目标伤害递增10%，切换后重置 */
  private handleComboMaster(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    let state = this.comboStates.get(source.id)
    if (!state) {
      state = { lastTargetId: '', streak: 0, totalAttacks: 0 }
      this.comboStates.set(source.id, state)
    }

    if (state.lastTargetId === target.id) {
      state.streak++
    } else {
      state.streak = 1
      state.lastTargetId = target.id
    }

    if (state.streak > 1) {
      const bonus = (state.streak - 1) * 10
      const attrData = source.getAttrValue(ATTRIBUTE_CODE.damageBoost)
      if (attrData) {
        const sourceKey = 'custom:combo_master'
        attrData.modifiers = attrData.modifiers.filter(m => m.sourceKey !== sourceKey)
        attrData.modifiers.push({
          sourceKey,
          sourceType: ModifierSourceType.SKILL,
          attribute: ATTRIBUTE_CODE.damageBoost,
          value: bonus,
          type: ModifierType.ADDITIVE,
          description: `连击大师 x${state.streak}`,
        })
        attrData.cachedVersion = -1
        source.recalcAll()
      }
      action.effects.push({
        type: EffectType.STATUS,
        targetId: source.id,
        description: `连击 x${state.streak}，伤害+${bonus}%`,
      })
    }
  }

  /** 灼烧引爆：攻击燃烧目标时引爆灼烧层数 */
  private handleBurnDetonate(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    isFullDetonate: boolean,
  ): void {
    // 获取目标的 buff 实例，查找灼烧类 buff
    const instances = this.buffSystem.getBuffInstances(target.id)
    const burnInstances = instances.filter(i => i.buffId === 'buff_burn' || i.buffId?.includes('burn'))

    if (burnInstances.length === 0) return

    let totalBurnDmg = 0
    for (const inst of burnInstances) {
      // ponytail: 假设每层灼烧每回合造成 5% 最大生命值伤害
      const remainingDuration = inst.remainingDuration ?? inst.config?.duration ?? 1
      const dmgPerTick = target.getAttribute('maxHealth') * 0.05
      totalBurnDmg += dmgPerTick * remainingDuration

      // 完全引爆时移除该灼烧 buff
      if (isFullDetonate) {
        this.buffSystem.removeBuff(inst.id)
      }
    }

    if (totalBurnDmg <= 0) return

    const multiplier = isFullDetonate ? 2.0 : 1.0
    const finalDmg = Math.round(totalBurnDmg * multiplier)
    if (this.deferDamage) {
      // ponytail: 延迟模式 — 只记录，由调用方动画后统一应用
      action.damage = (action.damage ?? 0) + finalDmg
    } else {
      this.damageCalculator.applyDamage(target, finalDmg)
    }

    action.effects.push({
      type: EffectType.DAMAGE,
      targetId: target.id,
      value: finalDmg,
      description: `${isFullDetonate ? '引爆' : '灼烧爆破'}! ${finalDmg} 点火焰伤害`,
    })
  }

  /** 护盾（shield 步骤）— 委托给 buff_shield */
  private executeShield(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    const buffTarget = skillStep.targetConfig?.faction === 'self' ? source : target
    // 从 calculation 计算护盾值
    const shieldValue = this.healCalculator.calculateHeal(skillStep, source, buffTarget)

    const config: BuffConfig = {
      id: 'buff_shield',
      name: '护盾',
      description: '',
      duration: skillStep.duration ?? undefined,
      maxStacks: 1,
      cooldown: 0,
      stackRule: StackRule.REFRESH,
      controlType: ControlType.NONE,
      controlPriority: 0,
      isDebuff: false,
      parameters: { shieldValue },
    }
    const instanceId = this.buffSystem.addBuff(buffTarget.id, 'buff_shield', config, 0)
    action.effects.push({
      type: EffectType.STATUS,
      targetId: buffTarget.id,
      buffId: 'buff_shield',
      instanceId,
      description: `${buffTarget.name} 获得 ${shieldValue} 护盾`,
    })
  }

  private executeControl(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    normalizedType: string,
  ): void {
    const controlType =
      normalizedType === SkillStepType.STUN
        ? ControlType.STUN
        : normalizedType === SkillStepType.SILENCE
          ? ControlType.SILENCE
          : ControlType.STUN
    const buffId = skillStep.buffId || `control_${controlType}`
    const config: BuffConfig = {
      id: buffId,
      name: buffId,
      description: '',
      duration: skillStep.duration ?? undefined,
      maxStacks: 1,
      cooldown: 0,
      stackRule: StackRule.REFRESH,
      controlType,
      controlPriority: 100,
      isDebuff: true,
      parameters: skillStep.parameters || {},
    }
    const instanceId = this.buffSystem.addBuff(target.id, buffId, config)
    action.effects.push({
      type: EffectType.STATUS,
      targetId: target.id,
      buffId,
      description: `${source.name} applies ${controlType === ControlType.STUN ? 'stun' : 'silence'} to ${target.name}`,
    })
  }
}
