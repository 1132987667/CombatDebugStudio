import {
  ATTRIBUTE_CODE,
  getAttrName,
  ModifierSourceType,
  ModifierType,
  type Modifier,
} from '@/domain/attribute/types'
import type {
  BattleAction,
  BattleEntity,
  StepExecutionContext,
} from '@/domain/battle/type/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { ControlType, StackRule, type BuffConfig } from '@/domain/buff/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { DeferredDamageToken } from '@/domain/skill/DeferredDamageToken'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import type { ExtendedSkillStep, ReviveStepParams } from '@/domain/skill/types'
import { EffectType } from '@/domain/skill/types'
import { BATTLE_LOG_CATEGORIES, LogLevel } from '@/shared/types/battle-log'
import { EffectTag } from '@/shared/types/effect'
import {
  REVERSE_BONUS_ATTR_MAP,
  syncAttackRange,
  syncBonusAttribute,
  syncReverseBonusAttribute,
} from '@/shared/utils/attributeSync'

/** 追踪同一攻击者的连续命中目标和计数 */
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

  /** 连击追踪状态（key = 攻击者 entity ID） */
  private comboStates = new Map<string, ComboState>()

  /** 待处理的额外行动请求（上限 10，防无限增长） */
  private pendingExtraActions: string[] = []
  private static readonly MAX_PENDING_ACTIONS = 10

  /** 请求额外行动（由 extra_action 步骤调用） */
  requestExtraAction(entityId: string): void {
    if (this.pendingExtraActions.length >= SkillExecutor.MAX_PENDING_ACTIONS) {
      return
    }
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
    context?: StepExecutionContext,
  ): void {
    switch (skillStep.type) {
      case EffectType.DEAL_DAMAGE:
        this.executeDamage(skillStep, action, source, target, context)
        break
      case EffectType.HEAL:
        this.executeHeal(skillStep, action, source, target, context)
        break
      case EffectType.APPLY_BUFF:
        this.executeBuff(skillStep, action, source, target, context)
        break
      case EffectType.SHIELD:
        this.executeShield(skillStep, action, source, target)
        break
      case EffectType.GAIN_ENERGY:
        this.executeGainEnergy(skillStep, action, source, target)
        break
      case EffectType.STUN:
      case EffectType.SILENCE:
        this.executeControl(skillStep, action, source, target, skillStep.type)
        break
      case EffectType.MODIFY_ATTRIBUTE:
        this.executeModifyAttribute(skillStep, action, source, target)
        break
      case EffectType.REMOVE_DEBUFF:
      case EffectType.CLEANSE:
        this.executeCleanse(skillStep, action, source, target)
        break
      case EffectType.REFLECT:
        this.executeReflect(skillStep, action, source, target, context)
        break
      case EffectType.DRAIN:
        this.executeDrain(skillStep, action, source, target, context)
        break
      case EffectType.CUSTOM:
        this.executeCustom(skillStep, action, source, target, context)
        break
      case EffectType.REVIVE:
        this.executeRevive(skillStep, action, source, target, context)
        break
      default: {
        // 未实现的步骤类型 — 当前无任何技能配置使用这些类型
        // 升级路径：当有技能配置使用它们时，在 switch 中添加对应 case
        LoggerProvider.logger.addDebugLog(
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
    context?: StepExecutionContext,
  ): void {
    const result = this.damageCalculator.calculateDamage(
      skillStep,
      source,
      target,
      context,
    )
    if (result.isMiss) {
      action.effects.push({
        type: EffectType.MISS,
        sourceId: source.id,
        targetId: target.id,
        value: 0,
        damage: 0,
        description: `${target.name} dodged attack`,
      })
    } else {
      if (context?.token) {
        // 延迟模式 — 只记录伤害数值
        context.token.record(target, result.damage, 0, result.rawDamage)
        action.damage = (action.damage ?? 0) + result.damage
        action.effects.push({
          type: EffectType.DAMAGE,
          sourceId: source.id,
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
          sourceId: source.id,
          targetId: target.id,
          value: actualDamage,
          description: `${source.name} deals ${actualDamage} damage`,
          isCritical: result.isCritical,
        })
      }
    }
    // 消耗必暴标记（buff_guaranteed_crit）
    if (result.isCritical && source.hasBuff?.('buff_guaranteed_crit')) {
      const instances = this.buffSystem.getBuffInstances(source.id)
      const critBuffInstances = instances.filter(
        (i) => i.buffId === 'buff_guaranteed_crit',
      )
      for (const instance of critBuffInstances) {
        this.buffSystem.removeBuff(instance.id)
      }
    }
  }

  private executeHeal(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    context?: StepExecutionContext,
  ): void {
    const healTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    const { heal, overflow } = this.healCalculator.calculateHeal(
      skillStep,
      source,
      healTarget,
      context,
      this.buffSystem,
    )
    // 记录治疗溢出量（按目标ID），供后续 overflow_shield 步骤使用
    if (overflow > 0) {
      action.extra = action.extra || {}
      const overflowMap =
        (action.extra.healOverflow as Record<string, number> | undefined) || {}
      overflowMap[healTarget.id] = (overflowMap[healTarget.id] || 0) + overflow
      action.extra.healOverflow = overflowMap
    }
    if (context?.token) {
      // 延迟模式 — 只记录治疗数值
      context.token.record(healTarget, 0, heal)
      action.heal = (action.heal ?? 0) + heal
      action.effects.push({
        type: EffectType.HEAL,
        sourceId: source.id,
        targetId: healTarget.id,
        value: heal,
        heal,
        overflow,
        description: `${healTarget.name} 恢复 ${heal} 气血`,
      })
    } else {
      const actualHeal = this.healCalculator.applyHeal(healTarget, heal)
      action.heal = (action.heal ?? 0) + actualHeal
      action.effects.push({
        type: EffectType.HEAL,
        sourceId: source.id,
        targetId: healTarget.id,
        value: actualHeal,
        heal: actualHeal,
        overflow,
        description: `${healTarget.name} 恢复 ${actualHeal} 气血`,
      })
    }
    if (this.healCalculator.isSingleTurnEffect(skillStep)) {
      action.effects.push({
        type: EffectType.STATUS,
        description: '立即生效的单回合治疗效果',
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
    context?: StepExecutionContext,
  ): void {
    const buffId = skillStep.buffId ?? skillStep.effectId
    if (!buffId) return

    const buffTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    const buffConfig: Partial<BuffConfig> = {
      id: buffId,
      // 不传 name/description，让 addBuff() 从 JSON 配置中解析展示名称
      description: '',
      duration: skillStep.duration ?? -1,
      maxStacks: skillStep.stacks, // undefined 时让 addBuff 合并链回退到 JSON 配置
      cooldown: 0,
      stackRule: StackRule.LIMITED,
      controlType: ControlType.NONE,
      controlPriority: 0,
      // 不设 isDebuff，让 addBuff 的合并链从脚本 CONFIG / JSON 配置推断
      parameters: skillStep.parameters || skillStep.effectParams || {},
    }

    const instanceId = this.buffSystem.addBuff(
      buffTarget.id,
      buffId,
      buffConfig,
      0,
      context,
    )
    // 解析 Buff 展示名称
    const buffCfgForName = this.buffSystem
      .getScriptRegistry()
      .getBuffConfig(buffId)
    const buffName =
      buffCfgForName?.name ?? buffId.replace(/^(guardian_|buff_|debuff_)/, '')
    action.effects.push({
      type: EffectType.BUFF,
      sourceId: source.id,
      targetId: buffTarget.id,
      buffId,
      buffName,
      instanceId,
      stacks: skillStep.stacks ?? 1,
      description: `${buffTarget.name} 获得 【${buffName}】`,
    })

    // 仅在非被动上下文中打日志（被动由 triggerPassives 统一输出，避免重复）
    if (instanceId && !context?.fromPassive) {
      const buffCfg = this.buffSystem.getScriptRegistry().getBuffConfig(buffId)
      const displayName =
        buffCfg?.name ?? buffId.replace(/^(guardian_|buff_|debuff_)/, '')

      // 构建 Buff 效果摘要
      const effectSummary = this.buildBuffEffectSummary(buffId, instanceId)

      LoggerProvider.logger.addBattleLog({
        turn: (action?.turn as number) || 1,
        message: `${displayName}  ${effectSummary}`,
        segments: [
          {
            text: displayName,
            classStr: 'log-buff',
            kind: 'buff',
            hover: { kind: 'buff', id: buffId },
          },
          { text: `  ${effectSummary}` },
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'sub' },
      })
    }
  }

  /**
   * 构建 Buff 效果摘要文本
   * 从 Buff 配置中提取属性修正、层数、持续时间等效果描述
   */
  private buildBuffEffectSummary(buffId: string, instanceId: string): string {
    const parts: string[] = []
    const config = this.buffSystem.getScriptRegistry().getBuffConfig(buffId)
    if (!config) return ''

    // 属性修正
    if (config.attributes) {
      for (const [attr, valStr] of Object.entries(config.attributes)) {
        const cn = getAttrName(attr as ATTRIBUTE_CODE)
        const num = parseFloat(valStr)
        if (isNaN(num)) continue
        const pct = Math.abs(
          valStr.includes('%') ? num : Math.abs(num) < 1 ? num * 100 : num,
        )
        const arrow = num >= 0 ? '↑' : '↓'
        parts.push(`${cn}${arrow}${Math.round(pct)}%`)
      }
    }

    // 层数
    const instance = this.buffSystem.getBuffInstanceById(instanceId)
    if (instance && instance.currentStacks > 1) {
      // 显示当前层数/最大层数
      const maxStacks = config.maxStacks ?? instance.currentStacks
      parts.push(`（${instance.currentStacks}/${maxStacks}层）`)
    }

    // 持续时间
    const duration = config.duration ?? 0
    if (duration > 0) {
      parts.push(`（${duration}回合）`)
    } else if (duration === -1) {
      parts.push(`（永久）`)
    }

    return parts.join(' ') || config.name || ''
  }

  /** 运行时修改目标属性（modify_attribute 步骤） */
  private executeModifyAttribute(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    const modTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    const modifiers = skillStep.modifiers
    if (!modifiers || modifiers.length === 0) return

    for (const mod of modifiers) {
      const attrCode = mod.targetAttribute as ATTRIBUTE_CODE
      const attrData = modTarget.getAttrValue(attrCode)
      if (!attrData) continue

      let value = typeof mod.value === 'number' ? mod.value : 0
      // PERCENTAGE 值在配置中是百分比值（如 5 表示 5%），直接使用
      if (mod.type === ModifierType.PERCENTAGE && Math.abs(value) < 1) {
        value = Math.round(value * 10000) / 100
      }

      const sourceKey = `passive:runtime:${mod.id || skillStep.buffId || 'mod'}`

      // 去重 — 移除同 sourceKey 的旧修饰符再添加新值
      attrData.modifiers = attrData.modifiers.filter(
        (m) => m.sourceKey !== sourceKey,
      )

      const newMod: Modifier = {
        sourceKey,
        sourceType: ModifierSourceType.SKILL,
        attribute: attrCode,
        value,
        type: mod.type,
        description: mod.sourceName || '被动技能',
      }
      attrData.modifiers.push(newMod)
      attrData.cachedVersion = -1

      // 统一使用 shared/attributeSync 中的加成属性同步
      if (mod.type === ModifierType.PERCENTAGE) {
        // 前向：主属性 → 加成属性
        syncBonusAttribute(modTarget, attrCode, newMod, sourceKey)
        // 反向：加成属性 → 主属性（仅 SkillExecutor 有此逻辑）
        syncReverseBonusAttribute(modTarget, attrCode, newMod, sourceKey)
        // attackBonus → attack → 再拆分到 minAttack/maxAttack
        const mainAttr = REVERSE_BONUS_ATTR_MAP[attrCode]
        if (mainAttr === ATTRIBUTE_CODE.attack) {
          syncAttackRange(
            modTarget,
            { ...newMod, attribute: ATTRIBUTE_CODE.attack },
            sourceKey,
          )
        }
        // PERCENTAGE 作用于 attack 时同步到 minAttack/maxAttack
        syncAttackRange(modTarget, newMod, sourceKey)
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
    const modTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    const instances = this.buffSystem.getBuffInstances(modTarget.id)
    const isRemoveDebuff = skillStep.type === EffectType.REMOVE_DEBUFF
    const count = skillStep.count || (isRemoveDebuff ? 1 : 999)

    let removed = 0
    for (const instance of instances) {
      if (removed >= count) break
      // REMOVE_DEBUFF 只移除 isDebuff 的 buff；CLEANSE 移除所有
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
    context?: StepExecutionContext,
  ): void {
    // reflect 的目标是攻击者（即 executeStep 的 target 是攻击者）
    // source 是受击者（拥有反射技能的角色）
    const dmg = this.damageCalculator.calculateDamage(skillStep, source, target)
    if (!dmg.isMiss && dmg.damage > 0) {
      if (context?.token) {
        context?.token.record(target, dmg.damage, 0, dmg.rawDamage)
        action.damage = (action.damage ?? 0) + dmg.damage
      } else {
        this.damageCalculator.applyDamage(target, dmg.damage)
      }
      action.effects.push({
        type: EffectType.REFLECT,
        sourceId: source.id,
        targetId: target.id,
        value: dmg.damage,
        damage: dmg.damage,
        description: `${source.name} 反弹 ${dmg.damage} 伤害给 ${target.name}`,
      })
    }
  }

  /** 吸取气血（drain 步骤） */
  private executeDrain(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    context?: StepExecutionContext,
  ): void {
    const dmg = this.damageCalculator.calculateDamage(
      skillStep,
      source,
      target,
      context,
    )
    if (!dmg.isMiss && dmg.damage > 0) {
      let actualHeal = 0
      if (context?.token) {
        context?.token.record(target, dmg.damage, 0, dmg.rawDamage)
        action.damage = (action.damage ?? 0) + dmg.damage
        action.heal = (action.heal ?? 0) + dmg.damage
        actualHeal = dmg.damage
      } else {
        this.damageCalculator.applyDamage(target, dmg.damage)
        actualHeal = source.heal(dmg.damage)
        if (actualHeal > 0) {
          action.heal = (action.heal ?? 0) + actualHeal
        }
      }
      action.effects.push({
        type: EffectType.DRAIN,
        sourceId: source.id,
        targetId: target.id,
        value: dmg.damage,
        damage: dmg.damage,
        heal: actualHeal,
        overflow: Math.max(0, dmg.damage - actualHeal),
        description: `${source.name} 吸取 ${dmg.damage} 气血`,
      })
    }
  }

  /** 自定义步骤分发 */
  private executeCustom(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    context?: StepExecutionContext,
  ): void {
    const customType = skillStep.parameters?.customType as string | undefined
    const desc = (skillStep.parameters?.description as string) || ''

    // 根据 customType 分发
    if (customType === 'third_strike') {
      this.handleThirdStrike(action, source)
    } else if (customType === 'combo_master') {
      this.handleComboMaster(action, source, target)
    } else if (
      customType === 'burn_detonate' ||
      customType === 'burn_detonate_full'
    ) {
      const burnPct =
        (skillStep.parameters?.burnDamagePercent as number) ?? 0.05
      this.handleBurnDetonate(
        action,
        source,
        target,
        customType === 'burn_detonate_full',
        context?.token,
        burnPct,
      )
    } else if (customType === 'extra_action') {
      // 时之沙 — 请求额外行动，由 BattleSystem 在 TURN_END 后消费
      if (source.isAlive()) {
        this.requestExtraAction(source.id)
        LoggerProvider.logger.addDebugLog(
          `时之沙: ${source.name} 获得额外行动`,
          { level: LogLevel.INFO },
        )
        action.effects.push({
          type: EffectType.STATUS,
          targetId: source.id,
          description: `时之沙触发！${source.name} 获得额外行动`,
        })
      }
    } else if (customType === 'steal_item') {
      // 盗窃本能 — PvE 掉落系统，非战斗逻辑
      LoggerProvider.logger.addDebugLog('盗窃本能: PvE 掉落系统专用', {
        level: LogLevel.INFO,
      })
    } else if (customType === 'overflow_shield') {
      // 回春护盾溢出转盾 — 从 action.extra.healOverflow 按目标ID查找溢出量
      const overflowMap =
        (action.extra?.healOverflow as Record<string, number> | undefined) || {}
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
          parameters: { shieldValue: overflow },
        }
        this.buffSystem.addBuff(target.id, 'buff_shield', config, 0)
        LoggerProvider.logger.addDebugLog(
          `回春护盾: 溢出 ${overflow} 点治疗转化为护盾`,
          { level: LogLevel.INFO },
        )
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
      LoggerProvider.logger.addDebugLog(`自定义步骤未实现: ${desc}`, {
        level: LogLevel.WARN,
      })
      action.effects.push({
        type: EffectType.STATUS,
        targetId: target.id,
        description: `自定义效果待实现: ${desc}`,
      })
    }
  }

  /** 第三连击：每第3次普攻伤害+50% */
  private handleThirdStrike(action: BattleAction, source: BattleEntity): void {
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
        attrData.modifiers = attrData.modifiers.filter(
          (m) => m.sourceKey !== sourceKey,
        )
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
        // 简化实现 — 加一个临时 buff 替代
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
        attrData.modifiers = attrData.modifiers.filter(
          (m) => m.sourceKey !== sourceKey,
        )
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
    burnDamagePercent: number = 0.05,
  ): void {
    // 获取目标的 buff 实例，按 EffectTag.BURN 标签查找灼烧类 buff
    const burnInstances = this.buffSystem.getBuffInstancesWithTag(
      target.id,
      EffectTag.BURN,
    )
    if (burnInstances.length === 0) return

    let totalBurnDmg = 0
    for (const inst of burnInstances) {
      // 假设每层灼烧每回合造成 5% 最大气血值伤害
      const remainingDuration = inst.remainingTurns ?? inst.duration ?? 1
      const dmgPerTick =
        target.getAttribute(ATTRIBUTE_CODE.maxHealth) * burnDamagePercent
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
      damage: finalDmg,
      description: `${isFullDetonate ? '引爆' : '灼烧爆破'}! ${finalDmg} 点火焰伤害`,
    })
  }

  /** 获取能量（gain_energy 步骤 — R6: 资源变动 ≠ 属性修正）
   *  复用 BattleEntity.gainEnergy()，自带上限封顶 + ENERGY_GAINED 事件触发
   */
  private executeGainEnergy(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    const modTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    const value = skillStep.parameters?.value ?? 0
    if (value <= 0) return
    modTarget.gainEnergy(value)
    action.effects.push({
      type: EffectType.STATUS,
      targetId: modTarget.id,
      description: `${modTarget.name} 获得 ${value} 能量`,
    })
  }

  /** 护盾（shield 步骤）— 委托给 buff_shield */
  private executeShield(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    const buffTarget =
      skillStep.targetConfig?.faction === 'self' ? source : target
    // 从 calculation 计算护盾值
    const { heal: shieldValue } = this.healCalculator.calculateHeal(
      skillStep,
      source,
      buffTarget,
    )

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
      parameters: { shieldValue },
    }
    const instanceId = this.buffSystem.addBuff(
      buffTarget.id,
      'buff_shield',
      config,
      0,
    )
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
      normalizedType === EffectType.STUN
        ? ControlType.STUN
        : normalizedType === EffectType.SILENCE
          ? ControlType.SILENCE
          : ControlType.STUN
    const buffId = skillStep.buffId || `control_${controlType}`
    const config: Partial<BuffConfig> = {
      id: buffId,
      // 不传 name/description，让 addBuff() 从 JSON 配置中解析展示名称
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

  /**
   * 执行复活步骤
   * 不持有 ReviveTracker（修复 R2），通过 action.extra 标记，由 BattleExecutor 统一结算
   */
  private executeRevive(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    context?: StepExecutionContext,
  ): void {
    const params = (skillStep.parameters ?? {}) as ReviveStepParams
    const hpPercent = params.hpPercent ?? 30

    // 前置校验：目标必须已死亡
    if (target.isAlive()) {
      action.effects.push({
        type: EffectType.STATUS,
        targetId: target.id,
        description: `${target.name} 仍然存活，无需复活`,
      })
      return
    }

    // 执行复活 — 通过 currentHealth setter 写入（修复 F2，触发 notifyDirty）
    const maxHp = target.getAttribute(ATTRIBUTE_CODE.maxHealth)
    const reviveHp = Math.max(1, Math.floor(maxHp * hpPercent / 100))
    target.currentHealth = reviveHp

    // 可选：清除 debuff
    if (params.cleanseDebuffs) {
      this.buffSystem.removeDispellableBuffs(target.id)
    }

    // 标记复活请求，由 BattleExecutor 统一结算（修复 R2）
    action.extra = action.extra || {}
    action.extra.revivedEntityId = target.id
    action.extra.reviveParams = params

    action.effects.push({
      type: EffectType.HEAL,
      sourceId: source.id,
      targetId: target.id,
      value: reviveHp,
      heal: reviveHp,
      description: `${source.name} 复活了 ${target.name}，恢复 ${reviveHp} 气血`,
    })
  }
}
