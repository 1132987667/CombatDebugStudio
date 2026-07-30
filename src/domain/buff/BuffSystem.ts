import {
  ATTRIBUTE_CODE,
  ModifierSourceType,
  ModifierType,
  type IModifierProvider,
} from '@/domain/attribute/types'
import { BuffTraceLogger } from '@/domain/battle/logs/BuffTraceLogger'
import {
  BattleTriggerPhase,
  OLD_PHASE_NAME_MAP,
  StepExecutionContext,
  type BattleEntity,
} from '@/domain/battle/type/types'
import { BuffContextPool } from '@/domain/buff/BuffContextPool'
import { BuffErrorBoundary } from '@/domain/buff/BuffErrorBoundary'
import {
  BuffAuraConfig,
  BuffScriptRegistry,
} from '@/domain/buff/BuffScriptRegistry'
import { ModifierStack } from '@/domain/buff/ModifierStack'
import { TRIGGER_SCRIPTS } from '@/domain/buff/triggers/index'
import type {
  BuffConfig,
  BuffInstance,
  BuffQuery,
  IBuffScript,
  TriggerAction,
  TriggerEventContext,
} from '@/domain/buff/types'
import { BUFF_ID_PREFIX, ControlType, StackRule } from '@/domain/buff/types'
import type { IBattleLogManager } from '@/domain/port/IBattleLogManager'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import { EffectType } from '@/domain/skill/types'
import { LogLevel } from '@/shared/types/battle-log'
import { StatusCategory, StatusCategoryNames } from '@/shared/types/status-meta'
import { Counter } from '@/shared/utils/Counter'

/** 无操作脚本占位：用于有配置无脚本的 buff */
const NOOP_BUFF_SCRIPT: IBuffScript = {
  onApply: () => {},
  onRemove: () => {},
  onUpdate: () => {},
  onRefresh: () => {},
  getEffectLines: () => [],
}

export interface TriggerExecutionContext extends TriggerEventContext {
  instanceId?: string
  buffSystem?: BuffSystem
  params?: Record<string, number | string>
}

/** 角色解析器：characterId → BattleEntity */
export type CharacterResolver = (characterId: string) => BattleEntity | undefined

/** 召唤配置（最小定义，供回调传递） */
export interface SummonRequest {
  /** 召唤物模板 ID（对应 enemies.json 中的 id） */
  summonId: string
  /** 持续回合数（-1 = 永久） */
  duration: number
  /** 召唤者 ID */
  sourceId: string
  /** 召唤者阵营 */
  team: string
}

/**
 * Buff系统类
 * 负责管理Buff实例的气血周期、状态更新和修饰符堆栈
 * 实现 IModifierProvider 接口，支持依赖解耦
 * 集成触发器事件系统，支持阶段触发行为
 */
export class BuffSystem implements IModifierProvider, BuffQuery {
  private buffInstances = new Map<string, BuffInstance>()
  private modifierStacks = new Map<string, ModifierStack>()
  private shieldValues = new Map<string, number>()
  private readonly scriptRegistry: BuffScriptRegistry
  private readonly logger: IBattleLogManager
  private _debugMode: boolean = true
  private onAttributeChange?: (characterId: string) => void
  private onDamageRequest?: (
    targetId: string,
    damage: number,
    rawDamage?: number,
    damagePercent?: number,
  ) => void
  private onHealRequest?: (targetId: string, amount: number) => void
  private onEnergyRequest?: (targetId: string, amount: number) => void
  private onSummonRequest?: (request: SummonRequest) => void
  private onBuffApplied?: (characterId: string, buffId: string) => void
  private buffAppliedCallbackEnabled: boolean = true
  private readonly eventBus: IDomainEventBus
  private triggerScripts = new Map<
    string,
    (context: TriggerExecutionContext) => void
  >()
  private instanceIdCounter = new Counter(1)

  /** 角色免疫标签注册表（初始化时由被动技能填充，运行时可查询） */
  private characterImmunities = new Map<string, Set<string>>()

  /** 角色解析器（由 BattleSystem.initialize 注入） */
  private characterResolver: CharacterResolver | null = null

  /** 父→子 Buff 反向索引（用于级联移除） */
  private parentToChildren = new Map<string, Set<string>>()

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
    eventBus: IDomainEventBus,
    logger: IBattleLogManager,
  ) {
    this.scriptRegistry = scriptRegistry
    this.eventBus = eventBus
    this.logger = logger
    this.registerDefaultTriggerScripts()
  }

  private registerDefaultTriggerScripts(): void {
    this.registerTriggerScript(
      EffectType.DEAL_DAMAGE,
      (ctx: TriggerExecutionContext) => {
        const damage = (ctx.params?.damage as number) ?? 0
        const damagePercent = (ctx.params?.damagePercent as number) ?? 0
        if (damagePercent > 0) {
          this.dealDirectDamage(ctx.targetId ?? '', 0, damagePercent)
        } else if (damage > 0) {
          this.dealDirectDamage(ctx.targetId ?? '', damage)
        }
      },
    )
    this.registerTriggerScript(
      EffectType.APPLY_BUFF,
      (ctx: TriggerExecutionContext) => {
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
      },
    )
    this.registerTriggerScript(
      EffectType.HEAL,
      (ctx: TriggerExecutionContext) => {
        this.healTarget(ctx.targetId ?? '', (ctx.params?.amount as number) ?? 0)
      },
    )
    // ponytail: 注册 15 个 JSON 配置触发器脚本。TRIGGER_SCRIPTS 通过 import type 避免循环依赖。
    Object.entries(TRIGGER_SCRIPTS).forEach(([id, handler]) => {
      this.registerTriggerScript(id, handler)
    })
  }

  /**
   * 请求对目标造成伤害（供触发器脚本调用）
   * 委托给 BattleSystem 注册的 onDamageRequest 回调
   */
  public requestDamage(
    targetId: string,
    damage: number,
    rawDamage?: number,
    damagePercent?: number,
  ): void {
    this.dealDirectDamage(targetId, damage, rawDamage, damagePercent)
  }

  /**
   * 请求治疗目标（供触发器脚本调用）
   * 委托给 BattleSystem 注册的 onHealRequest 回调
   */
  public requestHeal(targetId: string, amount: number): void {
    this.healTarget(targetId, amount)
  }

  /**
   * 请求能量恢复（供 HotEffect / 触发器脚本调用）
   * 委托给 BattleSystem 注册的 onEnergyRequest 回调
   */
  public requestEnergy(targetId: string, amount: number): void {
    this.onEnergyRequest?.(targetId, amount)
  }

  /**
   * 请求召唤单位（供触发器脚本调用）
   * Phase 0：仅通过回调链路传递召唤请求，不创建实体。
   * 委托给 BattleSystem 注册的 onSummonRequest 回调。
   */
  public requestSummon(request: SummonRequest): void {
    this.onSummonRequest?.(request)
  }

  private dealDirectDamage(
    targetId: string,
    damage: number,
    rawDamage?: number,
    damagePercent?: number,
  ): void {
    if (this.onDamageRequest) {
      this.onDamageRequest(targetId, damage, rawDamage, damagePercent)
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

  public setAttributeChangeCallback(
    callback: (characterId: string) => void,
  ): void {
    this.onAttributeChange = callback
  }

  public setDamageCallback(
    callback: (
      targetId: string,
      damage: number,
      rawDamage?: number,
      damagePercent?: number,
    ) => void,
  ): void {
    this.onDamageRequest = callback
  }

  public setHealCallback(
    callback: (targetId: string, amount: number) => void,
  ): void {
    this.onHealRequest = callback
  }

  public setEnergyCallback(
    callback: (targetId: string, amount: number) => void,
  ): void {
    this.onEnergyRequest = callback
  }

  public setSummonCallback(callback: (request: SummonRequest) => void): void {
    this.onSummonRequest = callback
  }

  public setBuffAppliedCallback(
    callback: (characterId: string, buffId: string) => void,
  ): void {
    this.onBuffApplied = callback
  }

  public setBuffAppliedCallbackEnabled(enabled: boolean): void {
    this.buffAppliedCallbackEnabled = enabled
  }

  /** 设置角色解析器 */
  public setCharacterResolver(resolver: CharacterResolver | null): void {
    this.characterResolver = resolver
  }

  /** 解析角色实例（供 BuffContext 调用） */
  public resolveCharacter(characterId: string): BattleEntity | undefined {
    return this.characterResolver?.(characterId)
  }

  private triggerAttributeChange(characterId: string): void {
    if (this.onAttributeChange) this.onAttributeChange(characterId)
  }

  public getEventBus(): IDomainEventBus {
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
    data?: Record<string, unknown>,
  ): void {
    const handler = this.triggerScripts.get(eventName)
    if (handler) {
      handler({
        phase: eventName,
        sourceId: '',
        targetId,
        instanceId,
        params: data ?? {},
        currentTurn: data?.currentTurn ?? 0,
      } as TriggerExecutionContext)
    }
  }

  // ============ 触发器系统（JSON 配置 triggers → TriggerEventBus 接线） ============

  /**

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

    for (const trigger of triggers) {
      const phase = OLD_PHASE_NAME_MAP[trigger.phase]
      if (!phase) {
        this.logger.addDebugLog(
          `触发器阶段 ${trigger.phase} 未识别，跳过注册`,
          { level: LogLevel.WARN },
        )
        continue
      }
      let triggerCount = 0
      let lastTriggerTurn = -999

      const callback = (ctx: TriggerEventContext) => {
        // 概率检查
        if (
          trigger.probability !== undefined &&
          trigger.probability < 1 &&
          Math.random() > trigger.probability
        )
          return
        // 触发次数检查
        if (
          trigger.maxTriggers !== undefined &&
          trigger.maxTriggers >= 0 &&
          triggerCount >= trigger.maxTriggers
        )
          return
        // 冷却检查
        const turn = ctx.currentTurn ?? 0
        if (trigger.cooldown && turn - lastTriggerTurn < trigger.cooldown)
          return

        const handler = this.triggerScripts.get(trigger.scriptId)
        if (handler) {
          handler({
            ...ctx,
            instanceId,
            targetId: characterId,
            params: trigger.params as
              | Record<string, number | string>
              | undefined,
          })
          triggerCount++
          lastTriggerTurn = turn
        }
      }

      this.eventBus.on(phase, callback as (...args: any[]) => void, instanceId)
    }
  }

  /**
   * 清理 Buff 实例的所有触发器监听器
   * 在 removeBuff 中被调用，通过 eventBus.offByListenerId 批量移除。
   */
  private unregisterTriggersForInstance(instanceId: string): void {
    this.eventBus.offByListenerId(instanceId)
  }

  public addBuff(
    characterId: string,
    buffId: string,
    config: Partial<BuffConfig> = {},
    currentTurn: number = 0,
    context?: StepExecutionContext,
    parentInstanceId?: string,
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
          console.warn(
            `Buff ${buffId} not found — no script or config registered, skipping`,
          )
          return ''
        }
      } else {
        // ponytail: 有 buffs.json 配置但无脚本，用 no-op 占位。
        // applyAttributeModifiers 仍然会从配置读取属性修饰符并生效。
        script = NOOP_BUFF_SCRIPT
        this.logger.addDebugLog(`Buff script not found: ${buffId}`)
      }
    }

    // 调用方传的配置（除 name/description）> 脚本静态 CONFIG > JSON 配置 > 硬编码默认值
    // name/description 是纯展示字段，由系统从脚本 CONFIG 或 JSON 配置解析，避免调用方误传 buffId
    const scriptDefaultConfig = this.scriptRegistry.getDefaultConfig(buffId)
    const jsonConfig = this.scriptRegistry.getBuffConfig(buffId)
    const resolvedConfig: BuffConfig = {
      id: config.id ?? scriptDefaultConfig?.id ?? jsonConfig?.id ?? buffId,
      name: scriptDefaultConfig?.name ?? jsonConfig?.name ?? buffId,
      description: scriptDefaultConfig?.description ?? '',
      duration:
        config.duration ??
        scriptDefaultConfig?.duration ??
        jsonConfig?.duration ??
        1,
      maxStacks:
        config.maxStacks ??
        scriptDefaultConfig?.maxStacks ??
        jsonConfig?.maxStacks ??
        1,
      cooldown: config.cooldown ?? scriptDefaultConfig?.cooldown ?? 0,
      stackRule:
        config.stackRule ?? scriptDefaultConfig?.stackRule ?? StackRule.LIMITED,
      controlType:
        config.controlType ??
        scriptDefaultConfig?.controlType ??
        ControlType.NONE,
      controlPriority:
        config.controlPriority ?? scriptDefaultConfig?.controlPriority ?? 0,
      isPermanent:
        config.isPermanent ?? scriptDefaultConfig?.isPermanent ?? false,
      isDebuff: config.isDebuff ?? scriptDefaultConfig?.isDebuff ?? false,
      isPositive:
        config.isPositive ?? scriptDefaultConfig?.isPositive ?? undefined,
      iconPath: config.iconPath ?? scriptDefaultConfig?.iconPath ?? undefined,
      dispellable:
        config.dispellable ?? scriptDefaultConfig?.dispellable ?? undefined,
      immuneTags:
        config.immuneTags ??
        scriptDefaultConfig?.immuneTags ??
        jsonConfig?.immunities ??
        undefined,
      tags:
        config.tags ??
        scriptDefaultConfig?.tags ??
        jsonConfig?.tags ??
        undefined,
      parameters:
        config.parameters ?? scriptDefaultConfig?.parameters ?? undefined,
      attributes: config.attributes ?? jsonConfig?.attributes ?? undefined,
      triggers: config.triggers ?? jsonConfig?.triggers as TriggerAction[] | undefined,
      cascadeRemove:
        config.cascadeRemove ?? scriptDefaultConfig?.cascadeRemove ?? undefined,
    }

    // ponytail: 免疫检查 — 若目标对该 buff 的 controlType / buffId / immuneTags 免疫则跳过施加
    const targetImmunities = this.characterImmunities.get(characterId)
    if (targetImmunities && targetImmunities.size > 0) {
      const controlTag =
        resolvedConfig.controlType &&
        resolvedConfig.controlType !== ControlType.NONE
          ? resolvedConfig.controlType.toLowerCase()
          : null
      const buffTag = buffId.startsWith(BUFF_ID_PREFIX)
        ? buffId.slice(BUFF_ID_PREFIX.length)
        : buffId
      // ponytail: 也检查 immuneTags（如 slow 通过 speed 属性实现而非 controlType）
      const immuneTagMatch = resolvedConfig.immuneTags?.some((tag) =>
        targetImmunities.has(tag.toLowerCase()),
      )
      if (
        (controlTag && targetImmunities.has(controlTag)) ||
        targetImmunities.has(buffTag) ||
        immuneTagMatch
      ) {
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
          target.effectLines =
            target.script.getEffectLines?.(target.context) ?? []
          // ★ 数据驱动：通知 effectPlan 各原语层数变化（如 ModifierEffect 重新计算值）
          const buffResolved = this.scriptRegistry.getResolvedBuffConfig(buffId)
          if (buffResolved?.effectPlan) {
            for (const effect of buffResolved.effectPlan) {
              effect.handler.onStackChange?.(target.context, effect.params, newStacks)
            }
            // 补充原语效果文本
            const effectLines = buffResolved.effectPlan
              .map((e) => e.handler.getEffectLines?.(target.context, e.params) ?? [])
              .flat()
            if (effectLines.length > 0) {
              target.effectLines = [...target.effectLines, ...effectLines]
            }
          }
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
    const buffContext = BuffContextPool.borrow(
      characterId,
      instanceId,
      resolvedConfig,
      this,
    )

    const buffInstance: BuffInstance = {
      id: instanceId,
      characterId,
      buffId,
      script,
      context: buffContext,
      startTurn: currentTurn,
      duration: resolvedConfig.duration || -1,
      remainingTurns: resolvedConfig.duration,
      currentStacks: 1,
      isActive: true,
      parentInstanceId,
    }

    this.buffInstances.set(instanceId, buffInstance)

    // 父→子反向索引：记录到 map 供级联移除使用
    if (parentInstanceId) {
      if (!this.parentToChildren.has(parentInstanceId)) {
        this.parentToChildren.set(parentInstanceId, new Set())
      }
      this.parentToChildren.get(parentInstanceId)!.add(instanceId)
    }

    if (!this.modifierStacks.has(characterId)) {
      this.modifierStacks.set(characterId, new ModifierStack())
    }

    BuffErrorBoundary.wrap(() => {
      // ponytail: 设置初始层数，供 onApply / 原子效果读取以缩放修饰符值
      buffContext.variables.set('_stacks', buffInstance.currentStacks)
      script.onApply(buffContext)
    })

    // 填充特殊效果文本行（供纯文本 UI 展示）
    buffInstance.effectLines = script.getEffectLines?.(buffContext) ?? []

    // ★ 数据驱动：通过 effectPlan 执行原子效果原语
    // 替代旧的 applyAttributeModifiers + applyBuffImmunities + applyBuffAuraModifiers
    const buffResolved = this.scriptRegistry.getResolvedBuffConfig(buffId)
    if (buffResolved?.effectPlan && buffResolved.effectPlan.length > 0) {
      for (const effect of buffResolved.effectPlan) {
        effect.handler.onApply(buffContext, effect.params)
      }
      // 从 effectPlan 方式获取的效果文本补充到 effectLines
      const effectLines = buffResolved.effectPlan
        .map((e) => e.handler.getEffectLines?.(buffContext, e.params) ?? [])
        .flat()
      if (effectLines.length > 0) {
        buffInstance.effectLines = [
          ...buffInstance.effectLines,
          ...effectLines,
        ]
      }
    } else if (!this.scriptRegistry.isSelfContained(buffId)) {
      // 向后兼容：无 effectPlan 时回退旧路径
      this.applyAttributeModifiers(characterId, instanceId, buffId)
      this.applyBuffImmunities(characterId, buffId)
    }
    // ponytail: self 目标光环始终应用（自包含脚本也在 ModifierStack 中管理）
    if (
      !buffResolved?.effectPlan ||
      buffResolved.effectPlan.length === 0
    ) {
      this.applyBuffAuraModifiers(characterId, instanceId, buffId)
    }

    // ponytail: 注册触发器监听器 — 从配置的 triggers 数组向 TriggerEventBus 注册
    if (resolvedConfig.triggers && resolvedConfig.triggers.length > 0) {
      this.registerTriggersForInstance(
        instanceId,
        resolvedConfig.triggers,
        characterId,
      )
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

    if (context?.record) {
      context?.record.effects.push({
        type: resolvedConfig.isDebuff ? EffectType.DEBUFF : EffectType.BUFF,
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

    // ponytail: 处理护盾类 Buff 的参数化护盾值
    const shieldValue = (resolvedConfig.parameters?.shieldValue as number) ?? 0
    if (shieldValue > 0) {
      const current = this.getShieldValue(characterId)
      this.setShieldValue(characterId, current + shieldValue)
    }

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
      modifierStack.addModifier(
        instanceId,
        normalizedAttr,
        parsed.value,
        parsed.type,
      )
      this.logger.addDebugLog(
        `应用属性修饰符: ${attr} → ${normalizedAttr} = ${valueStr} (${parsed.type}) 到角色 ${characterId}`,
      )
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
    if (
      !buffConfig ||
      !buffConfig.immunities ||
      buffConfig.immunities.length === 0
    )
      return

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
  /** @public 供原子效果原语 ImmunityEffect 在移除时重建免疫集合 */
  public rebuildCharacterImmunities(characterId: string): void {
    const immunities = new Set<string>()
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return
      // 从旧格式 immunities 字段收集
      const buffConfig = this.scriptRegistry.getBuffConfig(instance.buffId)
      if (buffConfig?.immunities) {
        for (const tag of buffConfig.immunities) {
          immunities.add(tag.toLowerCase())
        }
      }
      // 从 effectPlan 中的 ImmunityEffect 收集（数据驱动方式）
      const resolved = this.scriptRegistry.getResolvedBuffConfig(instance.buffId)
      if (resolved?.effectPlan) {
        for (const effect of resolved.effectPlan) {
          if (effect.type === StatusCategory.IMMUNITY) {
            const tags = effect.params.tags as string[] | undefined
            if (tags) {
              for (const tag of tags) {
                immunities.add(tag.toLowerCase())
              }
            }
          }
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
   * 注册单个免疫标签（供 ImmunityEffect.onApply 使用）
   */
  public registerSingleImmunity(characterId: string, tag: string): void {
    let immunities = this.characterImmunities.get(characterId)
    if (!immunities) {
      immunities = new Set()
      this.characterImmunities.set(characterId, immunities)
    }
    immunities.add(tag.toLowerCase())
  }

  /**
   * 应用 Buff 配置中的 aura（光环修饰符）到目标角色
   * 仅处理 targetSelector === 'self' 的光环。allies/enemies 由 BattleSystem 在初始化时分发
   */
  private applyBuffAuraModifiers(
    characterId: string,
    instanceId: string,
    buffId: string,
  ): void {
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
      modifierStack.addModifier(instanceId, attrCode, value, mod.type as ModifierType)
    }
  }

  /**
   * 获取 Buff 配置中的 aura 光环信息（供 BattleSystem 初始化时分发 allies/enemies）
   */
  public getBuffAuraConfig(buffId: string): BuffAuraConfig | undefined {
    // HACK: BuffJsonAura 与 BuffAuraConfig 结构相同（仅 type 字段为 string 而非 ModifierType），
    // 运行时值完全一致，故直接断言。
    return this.scriptRegistry.getBuffConfig(buffId)?.aura as BuffAuraConfig | undefined
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

    // 若自己有父，从父的 child 集合中移除自己（避免悬空引用）
    if (instance.parentInstanceId) {
      const siblings = this.parentToChildren.get(instance.parentInstanceId)
      if (siblings) {
        siblings.delete(instanceId)
        if (siblings.size === 0) {
          this.parentToChildren.delete(instance.parentInstanceId)
        }
      }
    }

    BuffErrorBoundary.wrap(() => {
      instance.script.onRemove(instance.context)
    })

    // ★ 数据驱动：执行 effectPlan 中各原语的 onRemove 清理
    const buffResolved = this.scriptRegistry.getResolvedBuffConfig(instance.buffId)
    if (buffResolved?.effectPlan) {
      for (const effect of buffResolved.effectPlan) {
        effect.handler.onRemove(instance.context, effect.params)
      }
    }

    instance.isActive = false
    // ponytail: 反注册触发器监听器 — 必须在 delete 前执行，确保 callback 中仍能读到 instance
    this.unregisterTriggersForInstance(instanceId)
    this.buffInstances.delete(instanceId)

    const modifierStack = this.getModifierStack(instance.characterId)
    modifierStack.removeModifier(instanceId)

    // 回收护盾值：任何带有 parameters.shieldValue 的 Buff 移除时回收
    const shieldParam = instance.context.config.parameters?.shieldValue as
      | number
      | undefined
    if (shieldParam && shieldParam > 0) {
      const current = this.getShieldValue(instance.characterId)
      this.setShieldValue(
        instance.characterId,
        Math.max(0, current - shieldParam),
      )
    }

    // ponytail: 技术调试日志 — Buff 移除追踪
    BuffTraceLogger.onRemove(instance.characterId, instance.buffId, instanceId)

    BuffContextPool.return(instance.context)
    // ponytail: 免疫标签回收 — 从剩余 Buff 重建免疫集合，防止已移除 Buff 的免疫标签残留
    this.rebuildCharacterImmunities(instance.characterId)

    // ponytail: 级联移除子 Buff — 从反向索引查所有 cascadeRemove===true 的子实例
    this.cascadeRemoveChildren(instanceId, instance.characterId)

    this.triggerAttributeChange(instance.characterId)
    return true
  }

  /**
   * 级联移除指定父实例的所有子 Buff
   * 只移除 cascadeRemove===true 的子；cascadeRemove===false/undefined 的保留。
   * 递归处理——子 Buff 也有自己的子 Buff。
   */
  private cascadeRemoveChildren(
    parentId: string,
    parentCharacterId: string,
  ): void {
    const children = this.parentToChildren.get(parentId)
    if (!children || children.size === 0) return

    this.parentToChildren.delete(parentId)
    for (const childId of children) {
      const childInstance = this.buffInstances.get(childId)
      if (!childInstance || !childInstance.isActive) continue
      // 只移除标记 cascadeRemove 的子 Buff；弱依赖保留
      if (childInstance.context.config.cascadeRemove !== true) continue
      this.removeBuff(childId)
    }
  }

  public refreshBuff(instanceId: string, currentTurn: number): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) return false

    BuffErrorBoundary.wrap(() => {
      instance.script.onRefresh(instance.context)
    })

    // 刷新后重新计算 effectLines（参数可能已变化）
    instance.effectLines =
      instance.script.getEffectLines?.(instance.context) ?? []

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

      // ★ 数据驱动：执行 effectPlan 中各原语的 onTick（DOT/HEAL 每回合触发）
      const buffResolved = this.scriptRegistry.getResolvedBuffConfig(instance.buffId)
      if (buffResolved?.effectPlan) {
        for (const effect of buffResolved.effectPlan) {
          effect.handler.onTick?.(instance.context, effect.params, 0)
        }
      }

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
      if (
        instance.characterId === characterId &&
        instance.isActive &&
        instance.buffId === buffId
      )
        return true
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
  public getBuffInstancesWithTag(
    characterId: string,
    tag: string,
  ): BuffInstance[] {
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

  /** ★ 彻底清理指定角色的所有 Buff 相关状态（批量生成防内存泄漏） */
  public clearCharacterState(characterId: string): void {
    this.clearAllBuffs(characterId)
    this.shieldValues.delete(characterId)
    this.characterImmunities.delete(characterId)
  }

  /**
   * 设置 Buff 条件评估状态（已激活/未激活）
   * ponytail: Phase 2 — 等待战斗系统在 气血/条件变化时调用此方法。
   * 触发 condition-changed 事件供 UI 层监听（事件通道已预留，监听器待接入）。
   * 当前 UI 已能通过 statsVersion 变化（recalculateAll 触发）重读 conditionState，
   * 因此此方法在 Phase 1 中暂无调用者。
   */
  public setBuffConditionState(
    instanceId: string,
    state: 'active' | 'inactive',
  ): void {
    const instance = this.buffInstances.get(instanceId)
    if (instance) {
      instance.conditionState = state
      this.eventBus.emit(BattleTriggerPhase.CONDITION_CHANGED, {
        phase: BattleTriggerPhase.CONDITION_CHANGED,
        targetId: instance.characterId,
        extra: { instanceId, state, characterId: instance.characterId },
      })
      // 通知投影层刷新（conditionState 变更需要反映到 UI）
      this.triggerAttributeChange(instance.characterId)
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
      if (
        config.controlPriority > highestPriority ||
        (config.controlPriority === highestPriority &&
          (BuffSystem.CONTROL_TYPE_ORDER[config.controlType] ?? 0) >
            highestOrder)
      ) {
        highestPriority = config.controlPriority
        highestControlType = config.controlType
        highestOrder = BuffSystem.CONTROL_TYPE_ORDER[config.controlType] ?? 0
      }
    })
    return highestControlType
  }

  public isCharacterControlled(characterId: string): boolean {
    return (
      this.getHighestPriorityControlEffect(characterId) !== ControlType.NONE
    )
  }

  public canUseSkill(characterId: string): boolean {
    const controlType = this.getHighestPriorityControlEffect(characterId)
    return (
      controlType !== StatusCategory.STUN &&
      controlType !== StatusCategory.SILENCE &&
      controlType !== StatusCategory.FREEZE &&
      controlType !== StatusCategory.SLEEP &&
      controlType !== StatusCategory.BIND
    )
  }

  public canAct(characterId: string): boolean {
    return (
      this.getHighestPriorityControlEffect(characterId) === ControlType.NONE
    )
  }

  // ─── 护盾值管理 ────────────────────────────────────────

  getShieldValue(characterId: string): number {
    return this.shieldValues.get(characterId) ?? 0
  }

  setShieldValue(characterId: string, value: number): void {
    this.shieldValues.set(characterId, value)
  }

  public update(deltaTime: number): void {}

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

  /**
   * 判断指定 buffId 是否为 debuff
   * 按优先级：脚本静态 CONFIG → JSON 配置 → false
   */
  public isDebuff(buffId: string): boolean {
    const scriptConfig = this.scriptRegistry.getDefaultConfig(buffId)
    if (scriptConfig?.isDebuff !== undefined) return scriptConfig.isDebuff
    const jsonConfig = this.scriptRegistry.getBuffConfig(buffId)
    return jsonConfig?.isDebuff ?? false
  }
}
