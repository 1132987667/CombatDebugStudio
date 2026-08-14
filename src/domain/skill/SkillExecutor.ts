import {
  ATTRIBUTE_CODE,
  ModifierSourceType,
  ModifierType,
  type AttributeValue,
  type Modifier,
} from '@/domain/attribute/types'
import type {
  BattleAction,
  BattleEntity,
  StepExecutionContext,
} from '@/domain/battle/type/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { ControlType, StackRule, type BuffConfig, KNOWN_BUFF_IDS } from '@/domain/buff/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { DeferredDamageToken } from '@/domain/skill/DeferredDamageToken'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import type {
  CustomStepParams,
  ExtendedSkillStep,
  GainEnergyStepParams,
  ReviveStepParams,
} from '@/domain/skill/types'
import { EffectType } from '@/domain/skill/types'
import { BATTLE_LOG_CATEGORIES, LogLevel } from '@/shared/types/battle-log'
import { STATUS_CODE } from '@/shared/types/status-meta'
import {
  syncBonusAttribute,
  syncReverseBonusAttribute,
} from '@/shared/utils/attributeSync'
import { entitySegment } from '@/domain/battle/logs/BattleLogProjector'

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

  /** 轮转 buff 追踪状态（key = 施法者 entity ID；值 = 下一次轮转到 buffIds 的下标） */
  private rotatingBuffIndex = new Map<string, number>()

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

  /** 清理指定角色的轮转 buff 状态 */
  public cleanupRotatingState(entityId: string): void {
    this.rotatingBuffIndex.delete(entityId)
  }

  /** 清空所有轮转 buff 状态（战斗初始化时调用） */
  public clearAllRotatingStates(): void {
    this.rotatingBuffIndex.clear()
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
        throw new Error(
          `[SkillExecutor] 未实现的技能步骤类型: ${skillStep.type}。` +
          `请实现对应的处理逻辑或从技能配置中移除。`
        )
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
          rawDamage: result.rawDamage,
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
          rawDamage: result.rawDamage,
          description: `${source.name} deals ${actualDamage} damage`,
          isCritical: result.isCritical,
        })
      }
    }
    // 消耗必暴标记（buff_guaranteed_crit）
    if (result.isCritical && source.hasBuff?.(KNOWN_BUFF_IDS.GUARANTEED_CRIT)) {
      const instances = this.buffSystem.getBuffInstances(source.id)
      const critBuffInstances = instances.filter(
        (i) => i.buffId === KNOWN_BUFF_IDS.GUARANTEED_CRIT,
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
      action.extra ??= {}
      action.extra.healOverflow ??= {}
      action.extra.healOverflow[healTarget.id] = (action.extra.healOverflow[healTarget.id] || 0) + overflow
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
    }

    const instanceId = this.buffSystem.addBuff(
      buffTarget.id,
      buffId,
      buffConfig,
      action.turn ?? 0,
      context,
    )
    // 解析 Buff 展示名称
    const buffCfgForName = this.buffSystem
      .getScriptRegistry()
      .getBuffConfig(buffId)
    const buffName = buffCfgForName?.name ?? buffId
    // 读取实际叠加层数（addBuff 内部已按 stackRule 合并，effect.stacks 反映真实层数）
    const buffInstance = instanceId
      ? this.buffSystem.getBuffInstanceById(instanceId)
      : undefined
    const actualStacks = buffInstance?.currentStacks ?? skillStep.stacks ?? 1
    action.effects.push({
      type: EffectType.BUFF,
      sourceId: source.id,
      targetId: buffTarget.id,
      buffId,
      buffName,
      instanceId,
      stacks: actualStacks,
      description: `${buffTarget.name} 获得 【${buffName}】`,
    })

    // 仅在非被动上下文中打日志（被动由 triggerPassives 统一输出，避免重复）
    if (instanceId && !context?.fromPassive) {
      // 效果摘要由 BuffConfigResolver 解析时生成（effectSummary），此处仅补充运行时层数
      const resolved = this.buffSystem
        .getScriptRegistry()
        .getResolvedBuffConfig(buffId)
      let effectSummary = resolved?.effectSummary ?? ''
      if (buffInstance && buffInstance.currentStacks > 1) {
        const maxStacks = resolved?.maxStacks ?? buffInstance.currentStacks
        effectSummary += ` （${buffInstance.currentStacks}/${maxStacks}层）`
      }

      LoggerProvider.logger.addBattleLog({
        turn: action?.turn || 1,
        message: `${entitySegment(buffTarget).text} 获得 【${buffName}】${effectSummary}`,
        segments: [
          entitySegment(buffTarget),
          { text: ' 获得 ', classStr: 'log-info' },
          {
            text: `【${buffName}】`,
            classStr: 'log-buff',
            kind: 'buff',
            hover: { kind: 'buff', id: buffId },
          },
          ...(effectSummary ? [{ text: ` ${effectSummary}` }] : []),
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'sub' },
      })
    }
  }

  /** 运行时属性修饰符 upsert：按 sourceKey 去重替换后推入，标记缓存失效 */
  private upsertModifier(
    attrData: AttributeValue,
    sourceKey: string,
    attribute: ATTRIBUTE_CODE,
    value: number,
    type: ModifierType,
    description?: string,
  ): Modifier {
    // 去重 — 移除同 sourceKey 的旧修饰符再添加新值
    attrData.modifiers = attrData.modifiers.filter(
      (m) => m.sourceKey !== sourceKey,
    )
    const newMod: Modifier = {
      sourceKey,
      sourceType: ModifierSourceType.SKILL,
      attribute,
      value,
      type,
      description,
    }
    attrData.modifiers.push(newMod)
    attrData.cachedVersion = -1
    return newMod
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
      // PERCENTAGE 值由配置显式声明为百分数（如 5 表示 5%），直接使用

      const sourceKey = `passive:runtime:${mod.id || skillStep.buffId || 'mod'}`
      const newMod = this.upsertModifier(
        attrData,
        sourceKey,
        attrCode,
        value,
        mod.type,
        mod.sourceName || '被动技能',
      )

      // 统一使用 shared/attributeSync 中的加成属性同步
      if (mod.type === ModifierType.PERCENTAGE) {
        // 前向：主属性 → 加成属性
        syncBonusAttribute(modTarget, attrCode, newMod, sourceKey)
        // 反向：加成属性 → 主属性（仅 SkillExecutor 有此逻辑）
        syncReverseBonusAttribute(modTarget, attrCode, newMod, sourceKey)
      }
    }

    modTarget.recalcAll()

    // NOTE: 属性微调是静默机制，效果已由被动名（chip）承载，不产 STATUS effect——
    //       否则日志会输出 `modify_attribute: N 个属性已修改` 这类内部调试文本
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
      // 减益判定读取显式声明的 polarity（由 BuffConfigResolver 解析时写入）
      const polarity = this.buffSystem
        .getScriptRegistry()
        .getResolvedBuffConfig(instance.buffId)?.polarity
      if (isRemoveDebuff && polarity !== 'negative') continue
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
    const customParams = skillStep.parameters as CustomStepParams | undefined
    const customType = customParams?.customType
    const desc = customParams?.description || ''

    // 根据 customType 分发
    if (customType === 'third_strike') {
      this.handleThirdStrike(action, source)
    } else if (customType === 'combo_master') {
      this.handleComboMaster(action, source, target)
    } else if (
      customType === 'burn_detonate' ||
      customType === 'burn_detonate_full'
    ) {
      const burnPct = customParams?.burnDamagePercent ?? 0.05
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
    } else if (customType === 'rotating_apply_buff') {
      // 轮转施法 — 按 buffIds 顺序逐个施加，循环往复
      this.handleRotatingApplyBuff(skillStep, action, source, target, context)
    } else if (customType === 'steal_item') {
      // 盗窃本能 — PvE 掉落系统，非战斗逻辑
      LoggerProvider.logger.addDebugLog('盗窃本能: PvE 掉落系统专用', {
        level: LogLevel.INFO,
      })
    } else if (customType === 'overflow_shield') {
      // 回春护盾溢出转盾 — 从 action.extra.healOverflow 按目标ID查找溢出量
      this.handleOverflowShield(skillStep, action, target)
    } else {
      throw new Error(
        `[SkillExecutor] 未实现的自定义步骤类型: ${desc}（${customType}）。` +
        `请实现对应的处理逻辑或从技能配置中移除。`
      )
    }
  }

  /**
   * 轮转施法 — 按 parameters.buffIds 顺序逐个施加，到末尾回到开头
   *
   * 每次调用前进一格（即使目标免疫/已满层也前进，保证轮转节奏稳定），
   * 复用 executeBuff 的完整施加管线（构造 config → addBuff → 效果收集）。
   * 层数 > 1 时：首次走完整管线，剩余层数直接叠层（LIMITED 规则每次 +1 层）。
   */
  private handleRotatingApplyBuff(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    context?: StepExecutionContext,
  ): void {
    const buffIds =
      (skillStep.parameters as CustomStepParams | undefined)?.buffIds ?? []
    if (buffIds.length === 0) return

    const index = this.rotatingBuffIndex.get(source.id) ?? 0
    const buffId = buffIds[index % buffIds.length]
    this.rotatingBuffIndex.set(source.id, index + 1)

    const stacks = Math.max(1, skillStep.stacks ?? 1)

    // 首次施加：复用 executeBuff（把动态选中的 buffId 注入临时步骤）
    this.executeBuff(
      { ...skillStep, buffId },
      action,
      source,
      target,
      context,
    )

    // 额外层数：直接叠层（首次已是 1 层，这里补足到 stacks 层）
    if (stacks > 1) {
      const buffTarget =
        skillStep.targetConfig?.faction === 'self' ? source : target
      const stackConfig: Partial<BuffConfig> = {
        id: buffId,
        description: '',
        duration: skillStep.duration ?? -1,
        maxStacks: stacks,
        cooldown: 0,
        stackRule: StackRule.LIMITED,
        controlType: ControlType.NONE,
      }
      for (let i = 1; i < stacks; i++) {
        this.buffSystem.addBuff(
          buffTarget.id,
          buffId,
          stackConfig,
          action.turn ?? 0,
          context,
        )
      }
    }
  }

  /** 回春护盾 — 治疗溢出转护盾（从 action.extra.healOverflow 按目标ID查找溢出量） */
  private handleOverflowShield(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    target: BattleEntity,
  ): void {
    const overflowMap = action.extra?.healOverflow ?? {}
    const overflow = overflowMap[target.id] ?? 0
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
        parameters: { shieldValue: overflow },
      }
      const shieldInstanceId = this.buffSystem.addBuff(target.id, 'buff_shield', config, action.turn ?? 0)
      if (!shieldInstanceId) {
        LoggerProvider.logger.addDebugLog(
          `回春护盾: 护盾施加被免疫/跳过`,
          { level: LogLevel.WARN },
        )
      } else {
        LoggerProvider.logger.addDebugLog(
          `回春护盾: 溢出 ${overflow} 点治疗转化为护盾`,
          { level: LogLevel.INFO },
        )
        action.effects.push({
          type: EffectType.STATUS,
          targetId: target.id,
          buffId: 'buff_shield',
          instanceId: shieldInstanceId,
          description: `溢出治疗转护盾: ${overflow}`,
        })
      }
    } else {
      action.effects.push({
        type: EffectType.STATUS,
        targetId: target.id,
        description: '无治疗溢出，未生成护盾',
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
        this.upsertModifier(
          attrData,
          'custom:third_strike',
          ATTRIBUTE_CODE.damageBoost,
          50,
          ModifierType.ADDITIVE,
          '第三连击',
        )
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
        this.upsertModifier(
          attrData,
          'custom:combo_master',
          ATTRIBUTE_CODE.damageBoost,
          bonus,
          ModifierType.ADDITIVE,
          `连击大师 x${state.streak}`,
        )
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
    // 获取目标的 buff 实例，按 STATUS_CODE.BURN 标签查找灼烧类 buff
    const burnInstances = this.buffSystem.getBuffInstancesWithTag(
      target.id,
      STATUS_CODE.BURN,
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
    const value =
      (skillStep.parameters as GainEnergyStepParams | undefined)?.value ?? 0
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
      parameters: { shieldValue },
    }
    const instanceId = this.buffSystem.addBuff(
      buffTarget.id,
      'buff_shield',
      config,
      action.turn ?? 0,
    )
    if (!instanceId) {
      LoggerProvider.logger.addDebugLog(
        `executeShield: 护盾施加被免疫/跳过: ${buffTarget.id}`,
        { level: LogLevel.WARN },
      )
      return
    }
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
    }
    const instanceId = this.buffSystem.addBuff(target.id, buffId, config, action.turn ?? 0)
    if (!instanceId) {
      LoggerProvider.logger.addDebugLog(
        `executeControl: 控制效果被免疫/跳过: ${buffId} → ${target.id}`,
        { level: LogLevel.WARN },
      )
      return
    }
    action.effects.push({
      type: EffectType.STATUS,
      targetId: target.id,
      buffId,
      description: `${source.name} applies ${controlType} to ${target.name}`,
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
    const params: ReviveStepParams =
      (skillStep.parameters as ReviveStepParams | undefined) ?? {}
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
    action.extra ??= {}
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
