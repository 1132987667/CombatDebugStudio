import type { ExtendedSkillStep } from '@/domain/skill/types'
import { SkillStepType } from '@/domain/skill/types'
import type { BattleAction, BattleEntity } from '@/domain/battle/type/types'
import { PARTICIPANT_SIDE } from '@/domain/battle/type/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { StackRule, ControlType, type BuffConfig } from '@/domain/buff/types'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { DeferredDamageToken } from '@/domain/skill/DeferredDamageToken'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'
import { BATTLE_LOG_CATEGORIES, buildNameSegments } from '@/shared/types/battle-log'
import { EffectType, EffectTag } from '@/shared/types/effect'
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

  /** ponytail: 待处理的额外行动请求 */
  private pendingExtraActions: string[] = []

  /** 请求额外行动（由 extra_action 步骤调用） */
  requestExtraAction(entityId: string): void {
    this.pendingExtraActions.push(entityId)
  }

  /** 消费并清空所有待处理额外行动 */
  drainExtraActions(): string[] {
    const actions = [...this.pendingExtraActions]
    this.pendingExtraActions = []
    return actions
  }

  /** 清理指定角色的连击追踪状态 */
  public cleanupComboState(entityId: string): void {
    this.comboStates.delete(entityId)
  }

  /** 清空所有连击追踪状态（战斗初始化时调用） */
  public clearAllComboStates(): void {
    this.comboStates.clear()
  }

  executeStep(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
    token?: DeferredDamageToken,
  ): void {
    switch (skillStep.type) {
      case SkillStepType.DEAL_DAMAGE:
        this.executeDamage(skillStep, action, source, target, record, token)
        break
      case SkillStepType.HEAL:
        this.executeHeal(skillStep, action, source, target, record, token)
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
        this.executeReflect(skillStep, action, source, target, token)
        break
      case SkillStepType.DRAIN:
        this.executeDrain(skillStep, action, source, target, record, token)
        break
      case SkillStepType.CUSTOM:
        this.executeCustom(skillStep, action, source, target, token)
        break
      default: {
        // ponytail: 未实现的步骤类型 — 当前无任何技能配置使用这些类型
        // 升级路径：当有技能配置使用它们时，在 switch 中添加对应 case
        battleLogManager.addDebugLog(
          `未实现的技能步骤类型: ${skillStep.type}`,
          { level: LogLevel.WARN },
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
    token?: DeferredDamageToken,
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
      if (token) {
        // 延迟模式 — 只记录伤害数值
        token.record(target, result.damage)
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
    token?: DeferredDamageToken,
  ): void {
    const healTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    const { heal, overflow } = this.healCalculator.calculateHeal(
      skillStep,
      source,
      healTarget,
      record,
      this.buffSystem,
    )
    // ponytail: 记录治疗溢出量（按目标ID），供后续 overflow_shield 步骤使用
    if (overflow > 0) {
      action.extra = action.extra || {}
      const overflowMap = (action.extra.healOverflow as Record<string, number> | undefined) || {}
      overflowMap[healTarget.id] = (overflowMap[healTarget.id] || 0) + overflow
      action.extra.healOverflow = overflowMap
    }
    if (token) {
      // 延迟模式 — 只记录治疗数值
      token.record(healTarget, 0, heal)
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

  /**
   * 执行 Buff 效果
   */
  private executeBuff(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const buffId = skillStep.buffId ?? skillStep.effectId
    if (!buffId) return // ponytail: 无 buffId=无效果，静默返回

    const buffTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    const buffConfig: Partial<BuffConfig> = {
      id: buffId,
      // ponytail: 不传 name/description，让 addBuff() 从 JSON 配置中解析展示名称
      description: '',
      duration: skillStep.duration ?? -1,
      maxStacks: skillStep.stacks, // ponytail: undefined 时让 addBuff 合并链回退到 JSON 配置
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

    // ponytail: Buff 效果日志 — 带角色名着色
    if (instanceId) {
      const buffConfig = this.buffSystem.getScriptRegistry().getBuffConfig(buffId)
      const displayName = buffConfig?.name ?? buffId.replace(/^(guardian_|buff_|debuff_)/, '')
      const segs = buildNameSegments(
        source.name,
        source.type === PARTICIPANT_SIDE.ALLY,
        buffTarget.name,
        buffTarget.type === PARTICIPANT_SIDE.ALLY,
      )
      segs.push({ text: ` 施加 ${displayName}` })
      const sourcePrefix = source.type === PARTICIPANT_SIDE.ALLY ? '[友方]' : '[敌方]'
      const targetPrefix = buffTarget.type === PARTICIPANT_SIDE.ALLY ? '[友方]' : '[敌方]'
      battleLogManager.addBattleLog({
        turn: (action?.turn as number) || 1,
        message: `${sourcePrefix}${source.name} 对 ${targetPrefix}${buffTarget.name} 施加 ${displayName}`,
        segments: segs,
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

      // ponytail: 与 GameDataProcessor.pushModifier 保持一致的加成属性同步
      if (modType === ModifierType.PERCENTAGE) {
        const BONUS_MAP: Partial<Record<string, string>> = {
          [ATTRIBUTE_CODE.maxHealth]: ATTRIBUTE_CODE.healthBonus,
          [ATTRIBUTE_CODE.minAttack]: ATTRIBUTE_CODE.attackBonus,
          [ATTRIBUTE_CODE.maxAttack]: ATTRIBUTE_CODE.attackBonus,
          [ATTRIBUTE_CODE.defense]: ATTRIBUTE_CODE.defenseBonus,
          [ATTRIBUTE_CODE.speed]: ATTRIBUTE_CODE.speedBonus,
        }
        const bonusAttr = BONUS_MAP[attrCode]
        if (bonusAttr) {
          const bonusData = modTarget.getAttrValue(bonusAttr as ATTRIBUTE_CODE)
          if (bonusData) {
            bonusData.modifiers = bonusData.modifiers.filter(m => m.sourceKey !== sourceKey)
            bonusData.modifiers.push({ ...newMod, attribute: bonusAttr as ATTRIBUTE_CODE })
            bonusData.cachedVersion = -1
          }
        }

        // ponytail: 反向传播 — 加成属性（attackBonus/defenseBonus 等）的 PERCENTAGE
        // 修饰符同步回主属性，与 GameDataProcessor.enemyToParticipant 初始化逻辑一致
        const REVERSE_BONUS_MAP: Partial<Record<string, string>> = {
          [ATTRIBUTE_CODE.healthBonus]: ATTRIBUTE_CODE.maxHealth,
          [ATTRIBUTE_CODE.attackBonus]: ATTRIBUTE_CODE.attack,
          [ATTRIBUTE_CODE.defenseBonus]: ATTRIBUTE_CODE.defense,
          [ATTRIBUTE_CODE.speedBonus]: ATTRIBUTE_CODE.speed,
        }
        const mainAttr = REVERSE_BONUS_MAP[attrCode]
        if (mainAttr) {
          const mainData = modTarget.getAttrValue(mainAttr as ATTRIBUTE_CODE)
          if (mainData) {
            mainData.modifiers = mainData.modifiers.filter(m => m.sourceKey !== sourceKey)
            mainData.modifiers.push({ ...newMod, attribute: mainAttr as ATTRIBUTE_CODE })
            mainData.cachedVersion = -1
          }
          // attackBonus → attack → 再拆分到 minAttack/maxAttack
          if (mainAttr === ATTRIBUTE_CODE.attack) {
            for (const splitAttr of [ATTRIBUTE_CODE.minAttack, ATTRIBUTE_CODE.maxAttack]) {
              const splitData = modTarget.getAttrValue(splitAttr)
              if (splitData) {
                splitData.modifiers = splitData.modifiers.filter(m => m.sourceKey !== sourceKey)
                splitData.modifiers.push({ ...newMod, attribute: splitAttr })
                splitData.cachedVersion = -1
              }
            }
          }
        }

        if (attrCode === ATTRIBUTE_CODE.attack) {
          for (const splitAttr of [ATTRIBUTE_CODE.minAttack, ATTRIBUTE_CODE.maxAttack]) {
            const splitData = modTarget.getAttrValue(splitAttr)
            if (splitData) {
              splitData.modifiers = splitData.modifiers.filter(m => m.sourceKey !== sourceKey)
              splitData.modifiers.push({ ...newMod, attribute: splitAttr })
              splitData.cachedVersion = -1
            }
          }
        }
      }
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
      if (isRemoveDebuff && !instance.context.config?.isDebuff) continue
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
    token?: DeferredDamageToken,
  ): void {
    // ponytail: reflect 的目标是攻击者（即 executeStep 的 target 是攻击者）
    // source 是受击者（拥有反射技能的角色）
    const dmg = this.damageCalculator.calculateDamage(skillStep, source, target)
    if (!dmg.isMiss && dmg.damage > 0) {
      if (token) {
        token.record(target, dmg.damage)
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
    token?: DeferredDamageToken,
  ): void {
    const dmg = this.damageCalculator.calculateDamage(skillStep, source, target, record)
    if (!dmg.isMiss && dmg.damage > 0) {
      if (token) {
        token.record(target, dmg.damage)
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
    token?: DeferredDamageToken,
  ): void {
    const customType = skillStep.parameters?.customType as string | undefined
    const desc = (skillStep.parameters?.description as string) || ''

    // ponytail: 根据 customType 或 description 关键词分发
    if (customType === 'third_strike' || desc.includes('第三')) {
      this.handleThirdStrike(action, source)
    } else if (customType === 'combo_master' || desc.includes('连续攻击')) {
      this.handleComboMaster(action, source, target)
    } else if (customType === 'burn_detonate' || customType === 'burn_detonate_full') {
      this.handleBurnDetonate(action, source, target, customType === 'burn_detonate_full', token)
    } else if (customType === 'extra_action') {
      // ponytail: 时之沙 — 请求额外行动，由 BattleSystem 在 TURN_END 后消费
      if (source.isAlive()) {
        this.requestExtraAction(source.id)
        battleLogManager.addDebugLog(`时之沙: ${source.name} 获得额外行动`, { level: LogLevel.INFO })
        action.effects.push({
          type: EffectType.STATUS,
          targetId: source.id,
          description: `时之沙触发！${source.name} 获得额外行动`,
        })
      }
    } else if (customType === 'steal_item') {
      // ponytail: 盗窃本能 — PvE 掉落系统，非战斗逻辑
      battleLogManager.addDebugLog('盗窃本能: PvE 掉落系统专用', { level: LogLevel.INFO })
    } else if (customType === 'overflow_shield') {
      // ponytail: 回春护盾溢出转盾 — 从 action.extra.healOverflow 按目标ID查找溢出量
      const overflowMap = (action.extra?.healOverflow as Record<string, number> | undefined) || {}
      const overflow = overflowMap[target.id] || 0
      if (overflow > 0) {
        const config: BuffConfig = {
          id: 'buff_shield',
          name: '护盾',
          description: '治疗溢出转化的护盾',
          duration: skillStep.duration ?? 2,
          maxStacks: 1,
          cooldown: 0,
          stackRule: StackRule.REFRESH,
          controlType: ControlType.NONE,
          controlPriority: 0,
          isDebuff: false,
          parameters: { shieldValue: overflow },
        }
        this.buffSystem.addBuff(target.id, 'buff_shield', config, 0)
        battleLogManager.addDebugLog(`回春护盾: 溢出 ${overflow} 点治疗转化为护盾`, { level: LogLevel.INFO })
        action.effects.push({
          type: EffectType.STATUS,
          targetId: target.id,
          buffId: 'buff_shield',
          description: `溢出治疗转护盾: ${overflow}`,
        })
      } else {
        action.effects.push({
          type: EffectType.STATUS,
          targetId: target.id,
          description: '无治疗溢出，未生成护盾',
        })
      }
    } else {
      battleLogManager.addDebugLog(`自定义步骤未实现: ${desc}`, { level: LogLevel.WARN })
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
    token?: DeferredDamageToken,
  ): void {
    // 获取目标的 buff 实例，按 EffectTag.BURN 标签查找灼烧类 buff
    const burnInstances = this.buffSystem.getBuffInstancesWithTag(target.id, EffectTag.BURN)

    if (burnInstances.length === 0) return

    let totalBurnDmg = 0
    for (const inst of burnInstances) {
      // ponytail: 假设每层灼烧每回合造成 5% 最大生命值伤害
      const remainingDuration = inst.remainingTurns ?? inst.duration ?? 1
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
    if (token) {
      token.record(target, finalDmg)
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
    const { heal: shieldValue } = this.healCalculator.calculateHeal(skillStep, source, buffTarget)

    const config: BuffConfig = {
      id: 'buff_shield',
      name: '护盾',
      description: '',
      duration: skillStep.duration ?? -1,
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
    const config: Partial<BuffConfig> = {
      id: buffId,
      // ponytail: 不传 name/description，让 addBuff() 从 JSON 配置中解析展示名称
      description: '',
      duration: skillStep.duration ?? -1,
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
