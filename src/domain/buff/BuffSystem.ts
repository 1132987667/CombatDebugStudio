import type { BuffConfig, BuffInstance, BuffQuery, IBuffScript } from '@/domain/buff/types'
import { BUFF_ID_PREFIX } from '@/domain/buff/types'
import type {
  TriggerEventContext,
} from '@/domain/buff/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import {
  ATTRIBUTE_CODE,
  type IModifierProvider,
  ModifierSourceType,
  ModifierType,
} from '@/domain/attribute/types'
import { StackRule, ControlType } from '@/domain/buff/types'
import { SkillStepType } from '@/domain/skill/types'
import { BuffScriptRegistry, BuffAuraConfig } from '@/domain/buff/BuffScriptRegistry'
import { BuffContextPool } from '@/domain/buff/BuffContextPool'
import { ModifierStack } from '@/domain/buff/ModifierStack'
import { BuffErrorBoundary } from '@/domain/buff/BuffErrorBoundary'
import { TriggerEventBus, triggerEventBus } from '@/infrastructure/adapters/event/TriggerEventBus'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'
import { Counter } from '@/shared/utils/Counter'
import { BuffTraceLogger } from '@/domain/battle/logs/BuffTraceLogger'
import { BattleContext, BattleTriggerPhase } from '@/domain/battle/type/types'
import { TRIGGER_SCRIPTS } from '@/domain/buff/triggers/index'


/** 无操作脚本占位：用于有配置无脚本的 buff */
const NOOP_BUFF_SCRIPT: IBuffScript = {
  onApply: () => { },
  onRemove: () => { },
  onUpdate: () => { },
  onRefresh: () => { },
  getEffectLines: () => [],
}

export interface TriggerExecutionContext extends TriggerEventContext {
  instanceId?: string
  buffSystem?: BuffSystem
  params?: Record<string, number | string>
  currentTurn?: number
}

/**
 * Buff系统类
 * 负责管理Buff实例的生命周期、状态更新和修饰符堆栈
 * 实现 IModifierProvider 接口，支持依赖解耦
 * 集成触发器事件系统，支持阶段触发行为
 */
export class BuffSystem implements IModifierProvider, BuffQuery {
  private buffInstances = new Map<string, BuffInstance>()
  private modifierStacks = new Map<string, ModifierStack>()
  private shieldValues = new Map<string, number>()
  private readonly scriptRegistry: BuffScriptRegistry
  private readonly logger = battleLogManager
  private _debugMode: boolean = true
  private onAttributeChange?: (characterId: string) => void
  private onDamageRequest?: (targetId: string, damage: number, damagePercent?: number) => void
  private onHealRequest?: (targetId: string, amount: number) => void
  private onBuffApplied?: (characterId: string, buffId: string) => void
  private buffAppliedCallbackEnabled: boolean = true
  private readonly eventBus: TriggerEventBus
  private triggerScripts = new Map<string, (context: TriggerExecutionContext) => void>()
  private instanceIdCounter = new Counter(1)

  /** 角色免疫标签注册表（初始化时由被动技能填充，运行时可查询） */
  private characterImmunities = new Map<string, Set<string>>()

  /** 注册角色的免疫标签 */
  registerCharacterImmunities(characterId: string, tags: string[]): void {
    if (!this.characterImmunities.has(characterId)) {
      this.characterImmunities.set(characterId, new Set())
    }
    const set = this.characterImmunities.get(characterId)!
    for (const tag of tags) {
      set.add(tag.toLowerCase())
    }
  }

  /** 获取角色的免疫标签 */
  getCharacterImmunities(characterId: string): string[] {
    return [...(this.characterImmunities.get(characterId) ?? [])]
  }

  public constructor(
    scriptRegistry: BuffScriptRegistry,
    eventBus?: TriggerEventBus,
  ) {
    this.scriptRegistry = scriptRegistry
    this.eventBus = eventBus ?? triggerEventBus
    this.registerDefaultTriggerScripts()
  }

  private registerDefaultTriggerScripts(): void {
    this.registerTriggerScript(SkillStepType.DEAL_DAMAGE, (ctx: TriggerExecutionContext) => {
      const damage = ctx.params?.damage as number ?? 0
      const damagePercent = ctx.params?.damagePercent as number ?? 0
      if (damagePercent > 0) {
        this.dealDirectDamage(ctx.targetId ?? '', 0, damagePercent)
      } else if (damage > 0) {
        this.dealDirectDamage(ctx.targetId ?? '', damage)
      }
    })
    this.registerTriggerScript(SkillStepType.APPLY_BUFF, (ctx: TriggerExecutionContext) => {
      if (ctx.params?.buffId) {
        const buffId = ctx.params.buffId as string
        const data = this.scriptRegistry.getBuffConfig(buffId)
        if (data) {
          this.addBuff(
            ctx.targetId ?? '',
            buffId,
            {
              id: data.id,
              name: data.name ?? data.id,
              description: '',
              duration: data.duration ?? 1,
              maxStacks: data.maxStacks ?? 1,
              cooldown: 0,
              stackRule: StackRule.LIMITED,
              controlType: ControlType.NONE,
              controlPriority: 0,
            },
            ctx.currentTurn ?? 0,
          )
        }
      }
    })
    this.registerTriggerScript(SkillStepType.HEAL, (ctx: TriggerExecutionContext) => {
      this.healTarget(ctx.targetId ?? '', ctx.params?.amount as number ?? 0)
    })
    // ponytail: 注册 15 个 JSON 配置触发器脚本。TRIGGER_SCRIPTS 通过 import type 避免循环依赖。
    Object.entries(TRIGGER_SCRIPTS).forEach(([id, handler]) => {
      this.registerTriggerScript(id, handler)
    })
  }

  /**
   * 请求对目标造成伤害（供触发器脚本调用）
   * 委托给 BattleSystem 注册的 onDamageRequest 回调
   */
  public requestDamage(targetId: string, damage: number, damagePercent?: number): void {
    this.dealDirectDamage(targetId, damage, damagePercent)
  }

  /**
   * 请求治疗目标（供触发器脚本调用）
   * 委托给 BattleSystem 注册的 onHealRequest 回调
   */
  public requestHeal(targetId: string, amount: number): void {
    this.healTarget(targetId, amount)
  }

  private dealDirectDamage(targetId: string, damage: number, damagePercent?: number): void {
    if (this.onDamageRequest) {
      this.onDamageRequest(targetId, damage, damagePercent)
    }
  }

  private healTarget(targetId: string, amount: number): void {
    if (this.onHealRequest) {
      this.onHealRequest(targetId, amount)
    }
  }

  public registerTriggerScript(
    scriptId: string,
    handler: (context: TriggerExecutionContext) => void,
  ): void {
    this.triggerScripts.set(scriptId, handler)
  }

  public setAttributeChangeCallback(callback: (characterId: string) => void): void {
    this.onAttributeChange = callback
  }

  public setDamageCallback(callback: (targetId: string, damage: number, damagePercent?: number) => void): void {
    this.onDamageRequest = callback
  }

  public setHealCallback(callback: (targetId: string, amount: number) => void): void {
    this.onHealRequest = callback
  }

  public setBuffAppliedCallback(callback: (characterId: string, buffId: string) => void): void {
    this.onBuffApplied = callback
  }

  public setBuffAppliedCallbackEnabled(enabled: boolean): void {
    this.buffAppliedCallbackEnabled = enabled
  }

  private triggerAttributeChange(characterId: string): void {
    if (this.onAttributeChange) this.onAttributeChange(characterId)
  }

  public getEventBus(): TriggerEventBus {
    return this.eventBus
  }

  /**
   * 执行注册的触发器脚本
   * BuffContext.triggerEvent 委托到此方法
   */
  public executeTriggerScript(
    instanceId: string,
    targetId: string,
    eventName: string,
    data?: BattleContext,
  ): void {
    const handler = this.triggerScripts.get(eventName)
    if (handler) {
      handler({
        phase: eventName,
        sourceId: '',
        targetId,
        instanceId,
        params: data ?? {},
        currentTurn: 0,
      } as TriggerExecutionContext)
    }
  }

  // ============ 触发器系统（JSON 配置 triggers → TriggerEventBus 接线） ============

  /**
   * 阶段名规范化映射
   * ponytail: buffs.json 历史遗留使用 ON_TURN_START 风格，与 BattleTriggerPhase 枚举值（turn_start）不匹配。
   *           在注册触发器时做一次映射，避免修改 20+ 处 JSON 配置。
   *           覆盖所有 BattleTriggerPhase 值，新配置可直接使用大小写混合的 ON_ 风格。
   */
  private static readonly PHASE_NAME_MAP: Record<string, BattleTriggerPhase> = {
    ON_TURN_START: BattleTriggerPhase.TURN_START,
    ON_TURN_END: BattleTriggerPhase.TURN_END,
    ON_BATTLE_START: BattleTriggerPhase.BATTLE_START,
    ON_BATTLE_END: BattleTriggerPhase.BATTLE_END,
    ON_DAMAGE_TAKEN: BattleTriggerPhase.DAMAGE_TAKEN,
    ON_ATTACK_HIT: BattleTriggerPhase.ON_HIT,
    BEFORE_ATTACK: BattleTriggerPhase.BEFORE_ATTACK,
    AFTER_ATTACK: BattleTriggerPhase.AFTER_ATTACK,
    ON_KILL: BattleTriggerPhase.ON_KILL,
    ON_DEATH: BattleTriggerPhase.ON_DEATH,
    ON_HEAL_RECEIVED: BattleTriggerPhase.HEAL_RECEIVED,
    ON_ENERGY_GAINED: BattleTriggerPhase.ENERGY_GAINED,
    ON_SKILL_USE: BattleTriggerPhase.SKILL_USE,
    ON_HP_LOWER_THAN: BattleTriggerPhase.HP_LOWER_THAN,
    ON_ALLY_FATAL_DAMAGE: BattleTriggerPhase.ALLY_FATAL_DAMAGE,
    ON_ALLY_DAMAGE_TAKEN: BattleTriggerPhase.ALLY_DAMAGE_TAKEN,
    ON_APPLY: BattleTriggerPhase.ON_APPLY,
  }

  /**
   * 为 Buff 实例注册触发器监听器
   * 在 addBuff 中被调用，读取 resolvedConfig.triggers，向 TriggerEventBus 注册监听器。
   */
  private registerTriggersForInstance(
    instanceId: string,
    triggers: import('@/domain/buff/types').TriggerAction[],
    characterId: string,
  ): void {
    const buffInstance = this.buffInstances.get(instanceId)
    if (!buffInstance) return

    const listenerIds: string[] = []
    for (const trigger of triggers) {
      const phase = BuffSystem.PHASE_NAME_MAP[trigger.phase]
      if (!phase) {
        battleLogManager.addDebugLog(`触发器阶段 ${trigger.phase} 未识别，跳过注册`, { level: LogLevel.WARN })
        continue
      }
      let triggerCount = 0
      let lastTriggerTurn = -999

      const callback = (ctx: TriggerEventContext) => {
        // 概率检查
        if (trigger.probability !== undefined && trigger.probability < 1 && Math.random() > trigger.probability) return
        // 触发次数检查
        if (trigger.maxTriggers !== undefined && trigger.maxTriggers >= 0 && triggerCount >= trigger.maxTriggers) return
        // 冷却检查
        const turn = ctx.currentTurn ?? 0
        if (trigger.cooldown && (turn - lastTriggerTurn) < trigger.cooldown) return

        const handler = this.triggerScripts.get(trigger.scriptId)
        if (handler) {
          handler({
            ...ctx,
            instanceId,
            targetId: characterId,
            params: trigger.params as Record<string, number | string> | undefined,
          })
          triggerCount++
          lastTriggerTurn = turn
        }
      }

      const listenerId = this.eventBus.on(phase, callback, instanceId)
      listenerIds.push(listenerId)
    }

    if (listenerIds.length > 0) {
      buffInstance.triggerListenerIds = listenerIds
    }
  }

  /**
   * 清理 Buff 实例的所有触发器监听器
   * 在 removeBuff 中被调用，通过 TriggerEventBus.offByBuffInstance 批量移除。
   */
  private unregisterTriggersForInstance(instanceId: string): void {
    this.eventBus.offByBuffInstance(instanceId)
  }

  public addBuff(
    characterId: string,
    buffId: string,
    config: Partial<BuffConfig> = {},
    currentTurn: number = 0,
    record?: CombatRecord,
  ): string {
    let script = this.scriptRegistry.get(buffId)
    if (!script) {
      const def = this.scriptRegistry.resolve(buffId)
      if (!def?.config) {
        // ponytail: 追踪 buff（_track_passive_ 前缀）是运行时动态创建的，
        // 不需要在 buffs.json 或脚本注册表中预先注册。
        // 其他无注册的 buff 仍然拒绝。
        if (buffId.startsWith('_track_passive_')) {
          script = NOOP_BUFF_SCRIPT
        } else {
          console.warn(`Buff ${buffId} not found — no script or config registered, skipping`)
          return ''
        }
      } else {
        // ponytail: 有 buffs.json 配置但无脚本，用 no-op 占位。
        // applyAttributeModifiers 仍然会从配置读取属性修饰符并生效。
        script = NOOP_BUFF_SCRIPT
        battleLogManager.addDebugLog(`Buff script not found: ${buffId}`)
      }
    }

    // ponytail: 自包含脚本的配置合并策略：
    // 调用方传的配置（除 name/description）> 脚本静态 CONFIG > JSON 配置 > 硬编码默认值
    // name/description 是纯展示字段，由系统从脚本 CONFIG 或 JSON 配置解析，避免调用方误传 buffId
    const scriptDefaultConfig = this.scriptRegistry.getDefaultConfig(buffId)
    const jsonConfig = this.scriptRegistry.getBuffConfig(buffId)
    const resolvedConfig: BuffConfig = {
      id: config.id ?? scriptDefaultConfig?.id ?? jsonConfig?.id ?? buffId,
      name: scriptDefaultConfig?.name ?? jsonConfig?.name ?? buffId,
      description: scriptDefaultConfig?.description ?? '',
      duration: config.duration ?? scriptDefaultConfig?.duration ?? jsonConfig?.duration ?? 1,
      maxStacks: config.maxStacks ?? scriptDefaultConfig?.maxStacks ?? jsonConfig?.maxStacks ?? 1,
      cooldown: config.cooldown ?? scriptDefaultConfig?.cooldown ?? 0,
      stackRule: config.stackRule ?? scriptDefaultConfig?.stackRule ?? StackRule.LIMITED,
      controlType: config.controlType ?? scriptDefaultConfig?.controlType ?? ControlType.NONE,
      controlPriority: config.controlPriority ?? scriptDefaultConfig?.controlPriority ?? 0,
      isPermanent: config.isPermanent ?? scriptDefaultConfig?.isPermanent ?? false,
      isDebuff: config.isDebuff ?? scriptDefaultConfig?.isDebuff ?? false,
      isPositive: config.isPositive ?? scriptDefaultConfig?.isPositive ?? undefined,
      iconPath: config.iconPath ?? scriptDefaultConfig?.iconPath ?? undefined,
      dispellable: config.dispellable ?? scriptDefaultConfig?.dispellable ?? undefined,
      immuneTags: config.immuneTags ?? scriptDefaultConfig?.immuneTags ?? jsonConfig?.immunities ?? undefined,
      tags: config.tags ?? scriptDefaultConfig?.tags ?? jsonConfig?.tags ?? undefined,
      parameters: config.parameters ?? scriptDefaultConfig?.parameters ?? undefined,
      attributes: config.attributes ?? jsonConfig?.attributes ?? undefined,
      triggers: config.triggers ?? jsonConfig?.triggers ?? undefined,
    }

    // ponytail: 免疫检查 — 若目标对该控制类型或 buffId 免疫则跳过施加
    const targetImmunities = this.characterImmunities.get(characterId)
    if (targetImmunities && targetImmunities.size > 0) {
      const controlTag = resolvedConfig.controlType && resolvedConfig.controlType !== ControlType.NONE
        ? resolvedConfig.controlType.toLowerCase()
        : null
      const buffTag = buffId.startsWith(BUFF_ID_PREFIX) ? buffId.slice(BUFF_ID_PREFIX.length) : buffId
      if ((controlTag && targetImmunities.has(controlTag)) || targetImmunities.has(buffTag)) {
        return ''
      }
    }

    const existingBuffs = this.getBuffInstances(characterId).filter(
      (instance) => instance.buffId === buffId,
    )

    switch (resolvedConfig.stackRule) {
      case StackRule.REFRESH:
        existingBuffs.forEach((instance) => this.removeBuff(instance.id))
        break
      case StackRule.LIMITED: {
        const maxStacks = resolvedConfig.maxStacks ?? 1
        if (existingBuffs.length > 0) {
          const target = existingBuffs[0]
          // 清除旧修饰符（兼容旧版多实例场景，正常应只有1个）
          for (let i = 1; i < existingBuffs.length; i++) {
            this.removeBuff(existingBuffs[i].id)
          }
          const newStacks = target.currentStacks + 1
          if (newStacks > maxStacks) {
            // 满层：刷新持续时间，不增加层数
            this.refreshBuff(target.id, currentTurn)
            this.triggerAttributeChange(characterId)
            return target.id
          }
          // 递增层数并重新应用修饰符
          target.currentStacks = newStacks
          // ponytail: 同步更新 _stacks——applyModifiers 从此变量读取层数缩放修饰符值
          // 任何直接修改 currentStacks 的代码必须同步更新 context.variables['_stacks']
          target.context.variables.set('_stacks', newStacks)
          // ponytail: 手动触发 onRefresh 以重新计算修饰符（applyModifiers 读取 _stacks），
          // 不使用 refreshBuff 因为它会重置 remainingTurns 且依赖 _onRefresh 分支
          target.script.onRefresh(target.context)
          target.effectLines = target.script.getEffectLines?.(target.context) ?? []
          this.triggerAttributeChange(characterId)
          return target.id
        }
        break
      }
      case StackRule.INDEPENDENT: {
        // ponytail: 独立模式也设上限，防止同一 Buff 无限叠加导致修饰符膨胀
        // 用 ?? 而非 || 避免 maxStacks:0 被误当作 falsy 回退
        const maxIndependent = resolvedConfig.maxStacks ?? 10
        if (existingBuffs.length >= maxIndependent) {
          return ''
        }
        break
      }
    }

    const instanceId = `${characterId}_${buffId}_${currentTurn}_${this.instanceIdCounter.next()}`
    const context = BuffContextPool.borrow(characterId, instanceId, resolvedConfig, this)

    const buffInstance: BuffInstance = {
      id: instanceId,
      characterId,
      buffId,
      script,
      context,
      startTurn: currentTurn,
      duration: resolvedConfig.duration || -1,
      remainingTurns: resolvedConfig.duration,
      currentStacks: 1,
      isActive: true,
    }

    this.buffInstances.set(instanceId, buffInstance)

    if (!this.modifierStacks.has(characterId)) {
      this.modifierStacks.set(characterId, new ModifierStack())
    }

    BuffErrorBoundary.wrap(() => {
      // ponytail: 设置初始层数，供 applyModifiers 读取以缩放修饰符值
      context.variables.set('_stacks', buffInstance.currentStacks)
      script.onApply(context)
    })

    // 填充特殊效果文本行（供纯文本 UI 展示）
    buffInstance.effectLines = script.getEffectLines?.(context) ?? []

    // ponytail: 自包含脚本自己通过 _onApply 管理修饰符，不重复从 JSON 读取
    if (!this.scriptRegistry.isSelfContained(buffId)) {
      this.applyAttributeModifiers(characterId, instanceId, buffId)
      this.applyBuffImmunities(characterId, buffId)
    }
    // ponytail: self 目标光环的修饰符始终应用到目标角色（自包含脚本也在 ModifierStack 中管理）
    this.applyBuffAuraModifiers(characterId, instanceId, buffId)

    // ponytail: 注册触发器监听器 — 从配置的 triggers 数组向 TriggerEventBus 注册
    if (resolvedConfig.triggers && resolvedConfig.triggers.length > 0) {
      this.registerTriggersForInstance(instanceId, resolvedConfig.triggers, characterId)
    }

    this.triggerAttributeChange(characterId)

    // ponytail: 技术调试日志 — Buff 变更追踪
    BuffTraceLogger.onApply(
      characterId,
      resolvedConfig.name,
      instanceId,
      buffInstance.currentStacks,
      buffInstance.duration,
    )

    // ponytail: 通知外部（如 BattleSystem）buff 已添加，用于触发 UI 动画
    if (this.buffAppliedCallbackEnabled && this.onBuffApplied) {
      this.onBuffApplied(characterId, buffInstance.buffId)
    }

    if (record) {
      record.effects.push({
        type: resolvedConfig.isDebuff ? 'debuff' : 'buff',
        targetId: characterId,
        buffId: resolvedConfig.id,
        instanceId,
        description: `${characterId} 获得 ${resolvedConfig.name}`,
      })
    }

    // ponytail: 触发 ON_APPLY 阶段 — 供其他 Buff 的触发器监听（如 "xxx 被施加时"）
    this.eventBus.emit(BattleTriggerPhase.ON_APPLY, {
      phase: BattleTriggerPhase.ON_APPLY,
      targetId: characterId,
      sourceId: characterId,
      currentTurn,
      extra: { buffId, instanceId },
    })

    return instanceId
  }

  private applyAttributeModifiers(
    characterId: string,
    instanceId: string,
    buffId: string,
  ): void {
    const attributes = this.scriptRegistry.getBuffAttributes(buffId)
    if (!attributes || Object.keys(attributes).length === 0) return

    const modifierStack = this.getModifierStack(characterId)
    for (const [attr, valueStr] of Object.entries(attributes)) {
      const parsed = this.scriptRegistry.parseAttributeValue(valueStr)
      // ponytail: normalize the attribute key so JSON keys like 'ATK' → 'attack',
      // matching the keys used by BattleParticipantImpl.syncModifiersFromProvider
      const normalizedAttr = attr as ATTRIBUTE_CODE
      // ponytail: 计算当前累计值供调试日志
      const existingMods = modifierStack.getModifiers(normalizedAttr)
      const currentTotal = existingMods.reduce((sum, m) => sum + m.value, 0)
      modifierStack.addModifier(instanceId, normalizedAttr, parsed.value, parsed.type)
      this.logger.addDebugLog(`应用属性修饰符: ${attr} → ${normalizedAttr} = ${valueStr} (${parsed.type}) 到角色 ${characterId}`)
      // ponytail: 技术调试日志 — Buff 修饰符变更
      BuffTraceLogger.onModifier(
        characterId,
        buffId,
        normalizedAttr,
        valueStr,
        currentTotal + parsed.value,
      )
    }
  }

  /**
   * 应用 Buff 配置中的 immunities（免疫标签）到目标角色
   * 在 addBuff 中与 applyAttributeModifiers 并列调用，确保无脚本的纯 JSON buff 也能获得免疫效果
   */
  private applyBuffImmunities(characterId: string, buffId: string): void {
    const buffConfig = this.scriptRegistry.getBuffConfig(buffId)
    if (!buffConfig || !buffConfig.immunities || buffConfig.immunities.length === 0) return

    let immunities = this.characterImmunities.get(characterId)
    if (!immunities) {
      immunities = new Set()
      this.characterImmunities.set(characterId, immunities)
    }
    for (const tag of buffConfig.immunities) {
      immunities.add(tag.toLowerCase())
    }
  }

  /**
   * 重建角色的免疫标签集合
   * 扫描该角色所有活跃 Buff 的 immunities 配置，重新构建 characterImmunities。
   * 在 removeBuff 后调用，确保已移除 Buff 的免疫标签被一并清理。
   * ponytail: O(n*m) — n=角色Buff数, m=每个Buff的免疫标签数，战斗场景中两个值都很小，不计性能。
   */
  private rebuildCharacterImmunities(characterId: string): void {
    const immunities = new Set<string>()
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return
      const buffConfig = this.scriptRegistry.getBuffConfig(instance.buffId)
      if (buffConfig?.immunities) {
        for (const tag of buffConfig.immunities) {
          immunities.add(tag.toLowerCase())
        }
      }
    })
    if (immunities.size > 0) {
      this.characterImmunities.set(characterId, immunities)
    } else {
      this.characterImmunities.delete(characterId)
    }
  }

  /**
   * 应用 Buff 配置中的 aura（光环修饰符）到目标角色
   * 仅处理 targetSelector === 'self' 的光环。allies/enemies 由 BattleSystem 在初始化时分发
   */
  private applyBuffAuraModifiers(characterId: string, instanceId: string, buffId: string): void {
    const buffConfig = this.scriptRegistry.getBuffConfig(buffId)
    if (!buffConfig?.aura || buffConfig.aura.targetSelector !== 'self') return

    const modifierStack = this.getModifierStack(characterId)
    for (const mod of buffConfig.aura.modifiers) {
      const attrCode = mod.targetAttribute as ATTRIBUTE_CODE
      // aura 中的 PERCENTAGE value 为 0.15（表示 15%），需 ×100 对齐 ModifierType 单位
      let value = typeof mod.value === 'number' ? mod.value : 0
      if (mod.type === 'PERCENTAGE' && Math.abs(value) < 1) {
        value = Math.round(value * 10000) / 100
      }
      const modType = mod.type === 'PERCENTAGE' ? ModifierType.PERCENTAGE
        : mod.type === 'ADDITIVE' ? ModifierType.ADDITIVE
          : mod.type === 'MULTIPLICATIVE' ? ModifierType.MULTIPLICATIVE
            : mod.type === 'FINAL' ? ModifierType.FINAL
              : ModifierType.ADDITIVE
      modifierStack.addModifier(instanceId, attrCode, value, modType)
    }
  }

  /**
   * 获取 Buff 配置中的 aura 光环信息（供 BattleSystem 初始化时分发 allies/enemies）
   */
  public getBuffAuraConfig(buffId: string): BuffAuraConfig | undefined {
    return this.scriptRegistry.getBuffConfig(buffId)?.aura
  }

  /**
   * 移除目标角色所有可驱散的 Buff
   * 仅移除 dispellable === true 的实例，不可驱散的 Buff（dispella ble !== true）保留。
   */
  public removeDispellableBuffs(characterId: string): number {
    let count = 0
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return
      const config = instance.context.config
      if (config.dispellable === true) {
        this.removeBuff(instance.id)
        count++
      }
    })
    return count
  }

  public removeBuff(instanceId: string): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) return false

    BuffErrorBoundary.wrap(() => {
      instance.script.onRemove(instance.context)
    })

    instance.isActive = false
    // ponytail: 反注册触发器监听器 — 必须在 delete 前执行，确保 callback 中仍能读到 instance
    this.unregisterTriggersForInstance(instanceId)
    this.buffInstances.delete(instanceId)

    const modifierStack = this.getModifierStack(instance.characterId)
    modifierStack.removeModifier(instanceId)

    // ponytail: 技术调试日志 — Buff 移除追踪
    BuffTraceLogger.onRemove(
      instance.characterId,
      instance.buffId,
      instanceId,
    )

    BuffContextPool.return(instance.context)
    // ponytail: 免疫标签回收 — 从剩余 Buff 重建免疫集合，防止已移除 Buff 的免疫标签残留
    this.rebuildCharacterImmunities(instance.characterId)
    this.triggerAttributeChange(instance.characterId)
    return true
  }

  public refreshBuff(instanceId: string, currentTurn: number): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) return false

    BuffErrorBoundary.wrap(() => {
      instance.script.onRefresh(instance.context)
    })

    // 刷新后重新计算 effectLines（参数可能已变化）
    instance.effectLines = instance.script.getEffectLines?.(instance.context) ?? []

    instance.startTurn = currentTurn
    instance.remainingTurns = instance.duration
    return true
  }

  public updatePerTurn(characterId: string): void {
    const toRemove: string[] = []
    let hasNonExpiredChange = false
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return

      BuffErrorBoundary.wrap(() => {
        instance.script.onUpdate(instance.context, 0)
      })

      // ponytail: 永久 buff（duration === -1）跳过剩余回合递减
      if (instance.duration === -1) return

      instance.remainingTurns--
      if (instance.duration > 0 && instance.remainingTurns <= 0) {
        toRemove.push(instance.id)
      } else {
        // ponytail: 非过期递减需要通知 UI（removeBuff 已处理过期的通知）
        hasNonExpiredChange = true
      }
    })
    toRemove.forEach((instanceId) => {
      this.removeBuff(instanceId)
    })
    if (hasNonExpiredChange) {
      this.triggerAttributeChange(characterId)
    }
  }

  public getBuffInstances(characterId: string): BuffInstance[] {
    const instances: BuffInstance[] = []
    this.buffInstances.forEach((instance) => {
      if (instance.characterId === characterId && instance.isActive) {
        instances.push(instance)
      }
    })
    return instances
  }

  public getBuffInstanceIds(characterId: string): string[] {
    return this.getBuffInstances(characterId).map((i) => i.id)
  }

  public hasBuff(characterId: string, buffId: string): boolean {
    for (const instance of this.buffInstances.values()) {
      if (instance.characterId === characterId && instance.isActive && instance.buffId === buffId) return true
    }
    return false
  }

  /** 按实例 ID 查询单个 BuffInstance */
  public getBuffInstanceById(instanceId: string): BuffInstance | undefined {
    return this.buffInstances.get(instanceId)
  }

  /**
   * 检查目标角色是否有包含指定标签的 Buff
   * @param characterId 角色 ID
   * @param tag 效果标签（如 'heal_reduction', 'burn'）
   */
  public hasBuffWithTag(characterId: string, tag: string): boolean {
    for (const instance of this.buffInstances.values()) {
      if (instance.characterId === characterId && instance.isActive) {
        const config = this.getBuffConfigByInstanceId(instance.id)
        if (config?.tags?.includes(tag)) return true
      }
    }
    return false
  }

  /**
   * 获取目标角色所有包含指定标签的 Buff 实例
   * @param characterId 角色 ID
   * @param tag 效果标签（如 'burn', 'heal_reduction'）
   */
  public getBuffInstancesWithTag(characterId: string, tag: string): BuffInstance[] {
    const result: BuffInstance[] = []
    for (const instance of this.buffInstances.values()) {
      if (instance.characterId === characterId && instance.isActive) {
        const config = this.getBuffConfigByInstanceId(instance.id)
        if (config?.tags?.includes(tag)) {
          result.push(instance)
        }
      }
    }
    return result
  }

  public getScriptRegistry(): BuffScriptRegistry {
    return this.scriptRegistry
  }

  public getModifierStack(characterId: string): ModifierStack {
    if (!this.modifierStacks.has(characterId)) {
      this.modifierStacks.set(characterId, new ModifierStack())
    }
    return this.modifierStacks.get(characterId) as ModifierStack
  }

  public clearAllBuffs(characterId: string): void {
    const toRemove: string[] = []
    this.buffInstances.forEach((instance) => {
      if (instance.characterId === characterId) toRemove.push(instance.id)
    })
    toRemove.forEach((instanceId) => this.removeBuff(instanceId))
    this.modifierStacks.delete(characterId)
  }

  /**
   * 设置 Buff 条件评估状态（已激活/未激活）
   * ponytail: Phase 2 — 等待战斗系统在 HP/条件变化时调用此方法。
   * 触发 condition-changed 事件供 UI 层监听（事件通道已预留，监听器待接入）。
   * 当前 UI 已能通过 statsVersion 变化（recalculateAll 触发）重读 conditionState，
   * 因此此方法在 Phase 1 中暂无调用者。
   */
  public setBuffConditionState(instanceId: string, state: 'active' | 'inactive'): void {
    const instance = this.buffInstances.get(instanceId)
    if (instance) {
      instance.conditionState = state
      this.eventBus.emit(BattleTriggerPhase.CONDITION_CHANGED, {
        phase: BattleTriggerPhase.CONDITION_CHANGED,
        targetId: instance.characterId,
        extra: { instanceId, state, characterId: instance.characterId },
      })
    }
  }

  /** 控制效果同优先级时的排序权重（数值越大越优先） */
  private static readonly CONTROL_TYPE_ORDER: Record<ControlType, number> = {
    [ControlType.NONE]: 0,
    [ControlType.SLEEP]: 1,
    [ControlType.SILENCE]: 2,
    [ControlType.FREEZE]: 3,
    [ControlType.STUN]: 4,
    [ControlType.BIND]: 5,
  }

  /** 获取最高优先级的控制效果 */
  public getHighestPriorityControlEffect(characterId: string): ControlType {
    let highestPriority = -1
    let highestControlType = ControlType.NONE
    let highestOrder = -1
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return
      const config = instance.context.config
      if (config.controlType === ControlType.NONE) return
      if (config.controlPriority > highestPriority
        || (config.controlPriority === highestPriority
          && (BuffSystem.CONTROL_TYPE_ORDER[config.controlType] ?? 0) > highestOrder)) {
        highestPriority = config.controlPriority
        highestControlType = config.controlType
        highestOrder = BuffSystem.CONTROL_TYPE_ORDER[config.controlType] ?? 0
      }
    })
    return highestControlType
  }

  public isCharacterControlled(characterId: string): boolean {
    return this.getHighestPriorityControlEffect(characterId) !== ControlType.NONE
  }

  public canUseSkill(characterId: string): boolean {
    const controlType = this.getHighestPriorityControlEffect(characterId)
    return controlType !== ControlType.STUN
      && controlType !== ControlType.SILENCE
      && controlType !== ControlType.FREEZE
      && controlType !== ControlType.SLEEP
      && controlType !== ControlType.BIND
  }

  public canAct(characterId: string): boolean {
    return this.getHighestPriorityControlEffect(characterId) === ControlType.NONE
  }

  // ─── 护盾值管理 ────────────────────────────────────────

  getShieldValue(characterId: string): number {
    return this.shieldValues.get(characterId) ?? 0
  }

  setShieldValue(characterId: string, value: number): void {
    this.shieldValues.set(characterId, value)
  }

  public update(deltaTime: number): void { }

  public getBuffNameByInstanceId(instanceId: string): string | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) return null
    const config = this.scriptRegistry.getBuffConfig(instance.buffId)
    return config?.name || instance.buffId
  }

  public getBuffConfigByInstanceId(instanceId: string): BuffConfig | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) return null
    // ponytail: 直接使用 addBuff 时已合并好的运行时配置，比重新从 JSON 查更准确
    // 旧实现仅查 buffConfigs（JSON），遗漏了仅有脚本 static CONFIG 的 buff
    return instance.context.config || null
  }

  public getSourceName(sourceId: string): string | null {
    return this.getBuffNameByInstanceId(sourceId)
  }

  public getSourceType(sourceId: string): ModifierSourceType {
    return 'buff'
  }

  public isDebugMode(): boolean {
    return this._debugMode
  }

  public setDebugMode(enabled: boolean): void {
    this._debugMode = enabled
  }
}
