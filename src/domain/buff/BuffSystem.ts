import {
  ModifierSourceType,
  ModifierType,
  type IModifierProvider,
} from '@/domain/attribute/types'
import { BuffTraceLogger } from '@/domain/battle/logs/BuffTraceLogger'
import {
  BattleTriggerPhase,
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
import { AtomicEffectType } from '@/domain/buff/atomic/types'
import type {
  ResolvedBuffConfig,
  ResolvedEffectPlan,
} from '@/domain/buff/atomic/BuffConfigResolver'
import type { IBattleLogManager } from '@/domain/port/IBattleLogManager'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import { EffectType } from '@/domain/skill/types'
import { LogLevel } from '@/shared/types/battle-log'
import { StatusCategory, StatusCode, getControlPriority } from '@/shared/types/status-meta'
import { Counter } from '@/shared/utils/Counter'
import { ConditionState } from '@/shared/types/buff-display'
import type { SeededRandom } from '@/shared/utils/SeededRandom'
import { nextRandom } from '@/shared/utils/SeededRandom'

export interface TriggerExecutionContext extends TriggerEventContext {
  instanceId?: string
  buffSystem?: BuffSystem
  params?: Record<string, number | string>
}

/** 角色解析器：characterId → BattleEntity */
export type CharacterResolver = (characterId: string) => BattleEntity | undefined

/**
 * 伤害/治疗请求来源标记：区分 dot 持续伤害、hot 持续治疗与触发器脚本伤害。
 * 供 BattleSystem 在补发 DAMAGE_CALCULATION / HEAL_CALCULATION 事件时判断语义
 * （dot 带 dot 标记不计命中/技能表；hot 带 hot 标记不计技能表），战报口径见 unified-summary.ts。
 */
export type DamageOrigin = 'dot' | 'hot' | 'trigger'

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
    origin?: DamageOrigin,
  ) => void
  private onHealRequest?: (targetId: string, amount: number, origin?: DamageOrigin) => void
  private onEnergyRequest?: (targetId: string, amount: number) => void
  private onSummonRequest?: (request: SummonRequest) => void
  private onBuffApplied?: (characterId: string, buffId: string) => void
  private readonly eventBus: IDomainEventBus
  private triggerScripts = new Map<
    string,
    (context: TriggerExecutionContext) => void
  >()
  private instanceIdCounter = new Counter(1)

  /** 确定性随机源 — 由 BattleSystem.initialize 注入 battleData.rng；未注入时回退 Math.random */
  private rng?: SeededRandom

  /** 注入确定性随机源（触发器概率判定走此实例） */
  setRng(rng: SeededRandom): void {
    this.rng = rng
  }

  /** 读取确定性随机源（供触发器脚本等共享实例消费；未注入时返回 undefined） */
  getRng(): SeededRandom | undefined {
    return this.rng
  }

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

  /** 清除角色的所有免疫标签（用于战斗初始化时清理上一场残留） */
  clearCharacterImmunities(characterId: string): void {
    this.characterImmunities.delete(characterId)
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
        // 脚本型毒（PoisonDebuff/StrongPoisonDebuff）在 triggerEvent 数据中带 dot:true，
        // 使伤害补发 dot 事件进入战报；BerserkBuff 自残等非 dot 脚本不带此标记
        const origin = ctx.params?.dot ? ('dot' as const) : undefined
        if (damagePercent > 0) {
          this.dealDirectDamage(ctx.targetId ?? '', 0, damagePercent, undefined, origin)
        } else if (damage > 0) {
          this.dealDirectDamage(ctx.targetId ?? '', damage, undefined, undefined, origin)
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
    origin?: DamageOrigin,
  ): void {
    this.dealDirectDamage(targetId, damage, rawDamage, damagePercent, origin)
  }

  /**
   * 请求治疗目标（供触发器脚本调用）
   * 委托给 BattleSystem 注册的 onHealRequest 回调
   */
  public requestHeal(targetId: string, amount: number, origin?: DamageOrigin): void {
    this.healTarget(targetId, amount, origin)
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
    origin?: DamageOrigin,
  ): void {
    if (this.onDamageRequest) {
      this.onDamageRequest(targetId, damage, rawDamage, damagePercent, origin)
    }
  }

  private healTarget(targetId: string, amount: number, origin?: DamageOrigin): void {
    if (this.onHealRequest) {
      this.onHealRequest(targetId, amount, origin)
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
      origin?: DamageOrigin,
    ) => void,
  ): void {
    this.onDamageRequest = callback
  }

  public setHealCallback(
    callback: (targetId: string, amount: number, origin?: DamageOrigin) => void,
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
        buffSystem: this,
        currentTurn: (data?.currentTurn as number) ?? -1,
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
      // phase 已由 BuffConfigResolver 归一化为枚举值，直接注册
      const phase = trigger.phase
      let triggerCount = 0
      let lastTriggerTurn = -999

      const callback = (ctx: TriggerEventContext) => {
        // 概率检查
        if (
          trigger.probability !== undefined &&
          trigger.probability < 1 &&
          nextRandom(this.rng) > trigger.probability
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
        if (lastTriggerTurn >= 0 && trigger.cooldown && turn - lastTriggerTurn < trigger.cooldown)
          return

        const handler = this.triggerScripts.get(trigger.scriptId)
        if (handler) {
          handler({
            ...ctx,
            instanceId,
            targetId: characterId,
            // NOTE: 修复 JSON 触发器脚本 ctx.buffSystem 缺失——emitTriggerEvent 构造的
            //       TriggerEventContext 不含 buffSystem，此前 dealDotDamage/reflectDamage/
            //       shareDamage 等全部通过 `ctx.buffSystem?.requestDamage` 的脚本实际无效
            buffSystem: this,
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
        // 运行时动态创建的 marker buff 由调用方显式声明执行模式
        if (config.executionMode === 'marker') {
          script = null
        } else {
          this.logger.addDebugLog(
            `Buff ${buffId} not found — no script or config registered, skipping`,
            { level: LogLevel.WARN },
          )
          return ''
        }
      } else {
        // 有 JSON 配置但无脚本——由 effectPlan 驱动，标记 script 为 null
        script = null
        this.logger.addDebugLog(`Buff script not found: ${buffId}`, { level: LogLevel.WARN })
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
      isPermanent:
        config.isPermanent ?? scriptDefaultConfig?.isPermanent ?? false,
      iconPath: config.iconPath ?? scriptDefaultConfig?.iconPath ?? undefined,
      dispellable:
        config.dispellable ?? scriptDefaultConfig?.dispellable ?? undefined,
      immunities:
        config.immunities ??
        scriptDefaultConfig?.immunities ??
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
      executionMode: config.executionMode ?? undefined,
      triggers: config.triggers ?? jsonConfig?.triggers as TriggerAction[] | undefined,
      cascadeRemove:
        config.cascadeRemove ?? scriptDefaultConfig?.cascadeRemove ?? undefined,
    }

    // ponytail: 免疫检查 — 若目标对该 buff 的 controlType / buffId / immunities 免疫则跳过施加
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
      // 检查 buff 自身的标签（tags）是否在角色免疫集中
      const buffTags = resolvedConfig.tags ?? []
      const immuneTagMatch = buffTags.some((tag) =>
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
            // 同步 _stacks 变量，供 ModifierEffect.perStack 读取
            target.context.variables.set('_stacks', maxStacks)

            //  修复：通知 effectPlan 原语层数未变但需要校准（如修饰符被外部清除后恢复）
            const buffResolved = this.scriptRegistry.getResolvedBuffConfig(buffId)
            if (buffResolved?.effectPlan) {
              for (const effect of buffResolved.effectPlan) {
                effect.handler.onStackChange?.(target.context, effect.params, maxStacks)
              }
              const effectLines = buffResolved.effectPlan
                .map((e) => e.handler.getEffectLines?.(target.context, e.params) ?? [])
                .flat()
              if (effectLines.length > 0) {
                target.effectLines = [
                  ...(target.script?.getEffectLines?.(target.context) ?? []),
                  ...effectLines,
                ]
              }
            }

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
          // 兼容无脚本 buff（effectPlan 驱动，script 为 null）——叠层只走下方的 effectPlan 分支
          target.script?.onRefresh?.(target.context)
          target.effectLines =
            target.script?.getEffectLines?.(target.context) ?? []
          //  数据驱动：通知 effectPlan 各原语层数变化（如 ModifierEffect 重新计算值）
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
        if (maxIndependent > 0 && existingBuffs.length >= maxIndependent) {
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
      script: script as IBuffScript,
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

    // ─── 路径判定（互斥三路径） ─────────────────────────────
    const buffResolved = this.scriptRegistry.getResolvedBuffConfig(buffId)
    const hasScript = script !== null
    const hasEffectPlan = buffResolved?.effectPlan && buffResolved.effectPlan.length > 0
    // 执行模式由解析器推导（JSON 配置）或调用方显式声明（动态 buff）
    const executionMode = buffResolved?.executionMode ?? resolvedConfig.executionMode
    const hasTriggersOnly = !hasScript && !hasEffectPlan &&
      (resolvedConfig.triggers?.length ?? 0) > 0
    const isMarkerOrTrigger =
      executionMode === 'marker' ||
      executionMode === 'triggerOnly' ||
      (!executionMode && hasTriggersOnly)

    let path: 'A' | 'B' | 'D'
    if (hasScript) path = 'A'
    else if (hasEffectPlan) path = 'B'
    else if (isMarkerOrTrigger) path = 'D'
    else {
      this.logger.addDebugLog(
        `[BuffSystem] 配置错误: ${buffId} 无脚本、无 effectPlan，拒绝施加`,
        { level: LogLevel.ERROR },
      )
      this.buffInstances.delete(instanceId)
      BuffContextPool.return(buffContext)
      return ''
    }

    // 执行路径（互斥）
    if (path === 'A') {
      // ─── PATH A：脚本驱动 ───
      buffContext.variables.set('_stacks', buffInstance.currentStacks)
      const applyResult = BuffErrorBoundary.wrap(() => { script!.onApply(buffContext) })
      if (applyResult === null) {
        this.buffInstances.delete(instanceId)
        BuffContextPool.return(buffContext)
        this.logger.addDebugLog(
          `[BuffSystem] onApply 失败，已回滚: ${buffId} → ${characterId}`,
          { level: LogLevel.WARN },
        )
        return ''
      }
      buffInstance.effectLines = script!.getEffectLines?.(buffContext) ?? []
    } else if (path === 'B') {
      // ─── PATH B：effectPlan 驱动 ───
      for (const effect of buffResolved!.effectPlan) {
        BuffErrorBoundary.wrap(() => {
          effect.handler.onApply(buffContext, effect.params)
        })
      }
      buffInstance.effectLines = buffResolved!.effectPlan
        .map(e => e.handler.getEffectLines?.(buffContext, e.params) ?? [])
        .flat()
    } else {
      // ─── PATH D：纯标记 / trigger-only ───
      buffInstance.effectLines = []
    }

    // NOTE: 触发器注册独立于 effectPlan/脚本路径，两者可以共存。
    // 触发器与效果原语正交——effectPlan 管理每回合效果，triggers 管理事件响应。
    // 注册解析器归一化后的 triggers（phase 已是枚举值）
    const normalizedTriggers = buffResolved?.triggers ?? resolvedConfig.triggers
    if (normalizedTriggers && normalizedTriggers.length > 0) {
      this.registerTriggersForInstance(
        instanceId,
        normalizedTriggers,
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
      undefined,
      context?.trace,
      {
        buffId: resolvedConfig.id,
        path,
        stackRule: resolvedConfig.stackRule,
        maxStacks: resolvedConfig.maxStacks,
        modifiers: resolvedConfig.attributes
          ? Object.entries(resolvedConfig.attributes).map(([attribute, cfg]) => ({
              attribute,
              value: cfg.value,
              type: cfg.type,
            }))
          : undefined,
      },
    )

    // ponytail: 通知外部（如 BattleSystem）buff 已添加，用于触发 UI 动画
    if (this.onBuffApplied) {
      this.onBuffApplied(characterId, buffInstance.buffId)
    }

    if (context?.record) {
      context?.record.effects.push({
        type: buffResolved?.polarity === 'negative' ? EffectType.DEBUFF : EffectType.BUFF,
        targetId: characterId,
        buffId: resolvedConfig.id,
        instanceId,
        description: `${characterId} 获得 ${resolvedConfig.name}`,
      })
    }

    // NOTE: ON_APPLY 事件和 buffAppliedCallback 独立于三择一逻辑。
    // 无论通过哪条路径施加，都需要通知外部系统（战斗日志、UI 等）。
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
      // 从 effectPlan 中的 ImmunityEffect 收集
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
   * 获取 Buff 配置中的 aura 光环信息（供 BattleSystem 初始化时分发 allies/enemies）
   * 优先从 effectPlan（`AtomicEffectType.AURA`）读取——configs 已迁移至 effects[] 格式；
   * 旧字段 `aura` 保留用于兼容尚未迁移的 JSON 配置。
   */
  public getBuffAuraConfig(buffId: string): BuffAuraConfig | undefined {
    // 新格式：effectPlan 中的 AURA 效果（targetSelector + modifiers 由配置显式声明）
    const resolved = this.scriptRegistry.getResolvedBuffConfig(buffId)
    const auraEffect = resolved?.effectPlan?.find(
      (e) => e.type === AtomicEffectType.AURA,
    )
    if (auraEffect) {
      const params = auraEffect.params as {
        targetSelector?: string
        modifiers?: Array<{
          id?: string
          targetAttribute: string
          type: string
          value: number
          condition?: string
        }>
      }
      if (params.targetSelector && params.modifiers?.length) {
        return {
          targetSelector: params.targetSelector as BuffAuraConfig['targetSelector'],
          modifiers: params.modifiers.map((m) => ({
            ...m,
            type: m.type as ModifierType,
          })),
        }
      }
    }

    // 旧格式兼容：raw.aura（尚未迁移的 JSON 配置）
    const raw = this.scriptRegistry.getBuffConfig(buffId)
    if (!raw?.aura) return undefined
    // HACK: BuffJsonAuraModifier.type 是 string，ModifierType 也是 string 字面量，
    // 运行时值一致（如 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE' | 'FINAL'）。
    // 此处从 `as` 断言改为显式映射，隔离边界。
    return {
      targetSelector: raw.aura.targetSelector as BuffAuraConfig['targetSelector'],
      modifiers: raw.aura.modifiers.map((m) => ({
        ...m,
        type: m.type as ModifierType,
      })),
    }
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

  /**
   * 按执行路径分发回调（PATH A: 脚本驱动 / PATH B: effectPlan 驱动 / PATH D: 无回调）
   * 收敛 addBuff/removeBuff/refreshBuff/updatePerTurn 中重复的"路径判定 + A/B 分发"样板。
   */
  private dispatchByExecPath(
    instance: BuffInstance,
    handlers: {
      onScript: (script: IBuffScript) => void
      onEffectPlan: (effectPlan: ResolvedEffectPlan[]) => void
    },
  ): void {
    if (instance.script) {
      handlers.onScript(instance.script)
      return
    }
    const buffResolved = this.scriptRegistry.getResolvedBuffConfig(instance.buffId)
    if (buffResolved?.effectPlan && buffResolved.effectPlan.length > 0) {
      handlers.onEffectPlan(buffResolved.effectPlan)
    }
  }

  public removeBuff(instanceId: string, options?: { silent?: boolean }): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) return false

    //  第一步就标记，防止重入
    instance.isActive = false

    try {
      // 若自己有父，从父的 child 集合中移除自己
      if (instance.parentInstanceId) {
        const siblings = this.parentToChildren.get(instance.parentInstanceId)
        if (siblings) {
          siblings.delete(instanceId)
          if (siblings.size === 0) {
            this.parentToChildren.delete(instance.parentInstanceId)
          }
        }
      }

      // 路径判定（与 addBuff 对称）
      this.dispatchByExecPath(instance, {
        onScript: (script) => {
          // PATH A：脚本 onRemove（有错误边界）
          BuffErrorBoundary.wrap(() => {
            script.onRemove(instance.context)
          })
        },
        onEffectPlan: (effectPlan) => {
          // PATH B：effectPlan onRemove（有错误边界）
          for (const effect of effectPlan) {
            BuffErrorBoundary.wrap(() => {
              effect.handler.onRemove(instance.context, effect.params)
            })
          }
        },
      })
      // PATH D：无回调
    } finally {
      //  无论是否异常，保证清理
      this.unregisterTriggersForInstance(instanceId)
      this.buffInstances.delete(instanceId)

      const modifierStack = this.getModifierStack(instance.characterId)
      modifierStack.removeModifier(instanceId)

      // 跨角色修饰符清理（光环分发场景）
      for (const [charId, stack] of this.modifierStacks) {
        if (charId !== instance.characterId) {
          stack.removeModifier(instanceId)
        }
      }

      BuffTraceLogger.onRemove(instance.characterId, instance.buffId, instanceId)
      BuffContextPool.return(instance.context)
      this.rebuildCharacterImmunities(instance.characterId)
      this.cascadeRemoveChildren(instanceId, instance.characterId)
      if (!options?.silent) {
        this.triggerAttributeChange(instance.characterId)
      }
    }
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
      this.removeBuff(childId, { silent: true })
    }
  }

  public refreshBuff(instanceId: string, currentTurn: number): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) return false

    // 注入回合号
    instance.context.currentTurn = currentTurn

    // 路径判定（与 addBuff 对称）
    this.dispatchByExecPath(instance, {
      onScript: (script) => {
        // PATH A：脚本 onRefresh
        BuffErrorBoundary.wrap(() => {
          script.onRefresh(instance.context)
        })
        instance.effectLines = script.getEffectLines?.(instance.context) ?? []
      },
      onEffectPlan: (effectPlan) => {
        // PATH B：effectPlan onRefresh
        for (const effect of effectPlan) {
          BuffErrorBoundary.wrap(() => {
            effect.handler.onRefresh?.(instance.context, effect.params)
          })
        }
        instance.effectLines = effectPlan
          .map(e => e.handler.getEffectLines?.(instance.context, e.params) ?? [])
          .flat()
      },
    })
    // PATH C/D：无刷新逻辑

    instance.startTurn = currentTurn
    instance.remainingTurns = instance.duration
    return true
  }

  public updatePerTurn(characterId: string, currentTurn: number = 0): void {
    const toRemove: string[] = []
    let hasNonExpiredChange = false
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return

      // 注入回合号到 context（修正 P0-4 的根因）
      instance.context.currentTurn = currentTurn

      //  持续到下一个回合结束：施加当轮的结算既不触发 onTick/onUpdate 也不扣减回合。
      // 例：duration=1 在第 N 轮施加 → 第 N 轮结束仍在 → 第 N+1 轮结束移除。
      // 放在 tick 之前执行，保证 dot 跳伤次数与行动顺序无关（快/慢单位施加均为 N 次）。
      if (instance.startTurn === currentTurn) return

      // 路径判定（与 addBuff 对称）
      this.dispatchByExecPath(instance, {
        onScript: (script) => {
          // PATH A：脚本 onUpdate（每回合一次，脚本从 context.currentTurn 读回合号）
          BuffErrorBoundary.wrap(() => {
            script.onUpdate(instance.context)
          })
        },
        onEffectPlan: (effectPlan) => {
          // PATH B：effectPlan onTick（有错误边界）
          for (const effect of effectPlan) {
            BuffErrorBoundary.wrap(() => {
              effect.handler.onTick?.(instance.context, effect.params, currentTurn)
            })
          }
        },
      })
      // PATH C/D：无更新逻辑

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

  hasBuffWithTag(characterId: string, tag: string): boolean {
    for (const instance of this.buffInstances.values()) {
      if (!instance.isActive || instance.characterId !== characterId) continue
      const config = this.getBuffConfigByInstanceId(instance.id)
      if (config?.tags?.includes(tag)) return true
    }
    return false
  }

  /** 按实例 ID 查询单个 BuffInstance */
  public getBuffInstanceById(instanceId: string): BuffInstance | undefined {
    return this.buffInstances.get(instanceId)
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

  /** 获取已解析的运行时配置（含 effectPlan，供投影层读取修饰符数据） */
  public getResolvedBuffConfig(buffId: string): ResolvedBuffConfig | undefined {
    return this.scriptRegistry.getResolvedBuffConfig(buffId)
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

  /**  彻底清理指定角色的所有 Buff 相关状态（批量生成防内存泄漏） */
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
    state: ConditionState,
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

  /** 获取最高优先级的控制效果 */
  public getHighestPriorityControlEffect(characterId: string): ControlType {
    let highestPriority = -1
    let highestControlType: ControlType = ControlType.NONE
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return
      const config = instance.context.config
      if (config.controlType === ControlType.NONE) return
      const priority = getControlPriority(config.controlType as StatusCode)
      if (priority > highestPriority) {
        highestPriority = priority
        highestControlType = config.controlType
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
    // 任何控制效果都阻止使用技能
    return this.getHighestPriorityControlEffect(characterId) === ControlType.NONE
  }

  // ─── 护盾值管理 ────────────────────────────────────────

  getShieldValue(characterId: string): number {
    return this.shieldValues.get(characterId) ?? 0
  }

  setShieldValue(characterId: string, value: number): void {
    const clamped = Math.max(0, value)
    const prev = this.shieldValues.get(characterId) ?? 0
    this.shieldValues.set(characterId, clamped)
    // 仅在值实际变化时触发属性变更通知（避免 takeDamage 高频调用时的无效刷新）
    if (clamped !== prev && this.onAttributeChange) {
      this.onAttributeChange(characterId)
    }
  }

  public getBuffNameByInstanceId(instanceId: string): string | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) return null
    const config = this.scriptRegistry.getBuffConfig(instance.buffId)
    return config?.name || instance.buffId
  }

  public getBuffConfigByInstanceId(instanceId: string): BuffConfig | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) return null
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
