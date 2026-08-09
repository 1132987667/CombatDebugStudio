import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import {
  EffectRenderer,
  type RenderContext,
} from '@/domain/battle/logs/EffectRenderer'
import { projectPassiveLog, entitySegment } from '@/domain/battle/logs/BattleLogProjector'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'
import {
  PassiveSkipReason,
  PassiveVerdict,
  type PassiveSkipReason as PassiveSkipReasonType,
} from '@/shared/types/trace-event'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import {
  BATTLE_CONSTANTS,
  BattleActionHelper,
  BattleTriggerPhase,
  ParticipantSide,
  createStepContext,
  type BattleEffect,
  type BattleEntity,
  type PassiveTriggerContext,
} from '@/domain/battle/type/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { SkillManager } from '@/domain/skill/SkillManager'
import { resolveSkillTargets } from '@/domain/skill/target-resolver'
import type { SkillConfig } from '@/domain/skill/types'
import type { IUIEventPort } from '@/domain/port/IUIEventPort'
import { BATTLE_LOG_CATEGORIES, LogLevel } from '@/shared/types/battle-log'
import { EffectType } from '@/domain/skill/types'
import { createTraceEvent, TraceLevel, TracePhase } from '@/shared/types/trace-event'
import { DamageCategory } from '@/domain/skill/types'
import type { SeededRandom } from '@/shared/utils/SeededRandom'
import { nextRandom } from '@/shared/utils/SeededRandom'
import { round } from '@/shared/utils/math'

export interface PassiveSkillConfig {
  id: string
  name: string
  description: string
  trigger?: BattleTriggerPhase
  condition?: string
  /** 参数化条件的参数映射（如 source_has_debuff_count 的 count 阈值） */
  conditionParams?: Record<string, number | string | boolean>
  skillId: string
  cooldown: number
  lastTriggeredTurn?: number
  triggerCount?: number
  maxTriggerCount?: number
  // 触发概率
  triggerProbability?: number
  hpThreshold?: number
}

export class PassiveSkillManager {
  // 当前参战角色的被动技能配置
  private passives: Map<string, PassiveSkillConfig[]> = new Map()
  /**
   * 倒排索引：按触发时机索引被动技能
   * 加速 triggerPassiveSkillsForAll 查询，避免遍历所有角色×所有被动
   * ponytail: 必须与 registerPassive/removePassive/clearPassives/clearAll 同步更新。
   *           所有被动注册必须通过 registerPassive()，禁止直接操作 passives Map，
   *           否则索引与实际数据不一致导致被动静默丢失。
   */
  private indexByPhase = new Map<
    BattleTriggerPhase,
    Array<{ characterId: string; config: PassiveSkillConfig }>
  >()
  private skillManager: SkillManager
  private buffSystem: BuffSystem

  /** 确定性随机源 — 由 BattleSystem.initialize 注入 battleData.rng；未注入时回退 Math.random */
  private rng?: SeededRandom

  /** 注入确定性随机源（被动触发概率判定走此实例） */
  setRng(rng: SeededRandom): void {
    this.rng = rng
  }

  /** 可选的 IDebugTracePort */
  private tracePort?: IDebugTracePort
  private traceCounter = 0

  /** EffectRenderer — 结构化效果 → LogSegment 渲染 */
  private effectRenderer = new EffectRenderer()

  /** 最近一次 triggerPassives 调用中触发的被动记录（供 BattleExecutor 提取 ActionContext） */
  private lastTriggeredPassives: Array<{
    passiveId: string
    passiveName: string
    ownerName: string
    effectSummary: string
  }> = []

  /** 最近一次 shouldTriggerPassive 通过时的检查明细（供 TRIGGERED 事件取证，文档 §5 示例 3） */
  private lastPassChecks: Record<string, unknown> | null = null

  /** 回合级触发统计（供 TURN_END 的 passiveTriggers，文档 §5 示例 5） */
  private turnFiredCount = 0
  private turnSkippedCount = 0

  /** 获取并清零回合触发统计（fired=实际执行，skipped=跳过） */
  getAndResetTurnCounters(): { fired: number; skipped: number } {
    const result = { fired: this.turnFiredCount, skipped: this.turnSkippedCount }
    this.turnFiredCount = 0
    this.turnSkippedCount = 0
    return result
  }

  /** 获取并清空最近触发的被动记录 */
  drainLastTriggeredPassives(): Array<{
    passiveId: string
    passiveName: string
    ownerName: string
    effectSummary: string
  }> {
    const records = this.lastTriggeredPassives
    this.lastTriggeredPassives = []
    return records
  }

  /** 动画发射开关（由 BattleSystem 注入动态 getter） */
  private _getAnimationEnabled: () => boolean = () => true

  setTracePort(port: IDebugTracePort | null): void {
    this.tracePort = port ?? undefined
  }

  /**  注入动画发射开关 getter（headless/quickMode 时抑制动画事件） */
  setAnimationEnabledGetter(getter: () => boolean): void {
    this._getAnimationEnabled = getter
  }

  constructor(
    skillManager: SkillManager,
    buffSystem: BuffSystem,
    private readonly uiEventPort: IUIEventPort,
  ) {
    this.skillManager = skillManager
    this.buffSystem = buffSystem
  }

  /** Factory method for compatibility with DI Container */
  static create(
    skillManager: SkillManager,
    buffSystem: BuffSystem,
    uiEventPort: IUIEventPort,
  ): PassiveSkillManager {
    return new PassiveSkillManager(skillManager, buffSystem, uiEventPort)
  }

  registerPassive(characterId: string, config: PassiveSkillConfig): void {
    const list = this.passives.get(characterId) || []
    list.push(config)
    this.passives.set(characterId, list)

    // 同步更新倒排索引
    if (config.trigger) {
      const entries = this.indexByPhase.get(config.trigger) || []
      entries.push({ characterId, config })
      this.indexByPhase.set(config.trigger, entries)
    }
  }

  /**
   * 检查被动技能是否触发
   *
   * @param config — 被动技能配置
   * @param trigger — 触发时机
   * @param entity — 触发目标
   * @param contextTarget — 上下文目标（如事件的另一方）
   * @param context — 战斗上下文
   */
  shouldTriggerPassive(
    config: PassiveSkillConfig,
    entity: BattleEntity,
    contextTarget?: BattleEntity,
    context: PassiveTriggerContext = {
      phase: BattleTriggerPhase.BATTLE_START,
      currentTurn: 0,
    },
  ): boolean {
    if (config.trigger !== context.phase) {
      this.emitPassiveSkipped(config, entity, context, PassiveSkipReason.PHASE_MISMATCH, {
        phaseMatch: false,
        expected: config.trigger,
        actual: context.phase,
      })
      return false
    }
    // 检查冷却时间是否到，config.cooldown = -1 表示无冷却
    if (config.cooldown > 0 && config.lastTriggeredTurn) {
      const currentTurn = context.currentTurn
      if (currentTurn - config.lastTriggeredTurn < config.cooldown) {
        this.emitPassiveSkipped(config, entity, context, PassiveSkipReason.COOLDOWN, {
          cooldown: {
            ready: false,
            remaining: config.cooldown - (currentTurn - config.lastTriggeredTurn),
            lastTriggeredTurn: config.lastTriggeredTurn,
          },
        })
        return false
      }
    }
    // 检查最大触发次数是否超过
    if (
      config.maxTriggerCount &&
      config.triggerCount &&
      config.triggerCount >= config.maxTriggerCount
    ) {
      this.emitPassiveSkipped(config, entity, context, PassiveSkipReason.MAX_TRIGGERS, {
        maxTriggers: { limit: config.maxTriggerCount, used: config.triggerCount },
      })
      return false
    }
    // 检查触发概率是否命中
    if (config.triggerProbability && nextRandom(this.rng) > config.triggerProbability) {
      this.emitPassiveSkipped(config, entity, context, PassiveSkipReason.PROBABILITY, {
        probability: { required: config.triggerProbability, passed: false },
      })
      return false
    }
    if (
      config.trigger === BattleTriggerPhase.HP_LOWER_THAN &&
      config.hpThreshold
    ) {
      const hpPercent =
        entity.getAttribute(ATTRIBUTE_CODE.currentHealth) /
        Math.max(1, entity.getAttribute(ATTRIBUTE_CODE.maxHealth))
      if (hpPercent > config.hpThreshold / 100) {
        this.emitPassiveSkipped(config, entity, context, PassiveSkipReason.CONDITION, {
          condition: {
            expr: `HP_LOWER_THAN ${config.hpThreshold}%`,
            passed: false,
            hpPercent: round(hpPercent, 2),
          },
        })
        return false
      }
    }
    // 被动有触发条件，检查是否满足
    if (
      config.condition &&
      !this.evaluateCondition(config.condition, entity, contextTarget, context, config.conditionParams)
    ) {
      this.emitPassiveSkipped(config, entity, context, PassiveSkipReason.CONDITION, {
        condition: { expr: config.condition, passed: false },
      })
      return false
    }
    // 所有检查通过 —— 记录检查明细供 TRIGGERED 事件取证
    this.lastPassChecks = {
      phaseMatch: true,
      cooldown: { ready: true, remaining: 0 },
      probability: config.triggerProbability
        ? { required: config.triggerProbability, passed: true }
        : undefined,
      maxTriggers: config.maxTriggerCount
        ? { limit: config.maxTriggerCount, used: config.triggerCount ?? 0 }
        : undefined,
      condition: config.condition
        ? { expr: config.condition, passed: true }
        : undefined,
      targetAlive: true,
    }
    return true
  }

  /**
   * 发射 PASSIVE_TRIGGER 跳过事件（trace 级，默认折叠；文档 §5 示例 3）
   * 记录"没发生"与记录"发生"同等重要——当前系统的黑洞所在
   */
  private emitPassiveSkipped(
    config: PassiveSkillConfig,
    entity: BattleEntity,
    context: PassiveTriggerContext,
    skipReason: PassiveSkipReasonType,
    checks: Record<string, unknown>,
  ): void {
    // NOTE: B3 — PHASE_MISMATCH 是"该被动本就不在该时机运行"的设计事实（由 trigger 配置决定），
    //       既无决策信息也不可复现问题，与调试日志同级直接降噪：不写日志、不进 trace、不计跳过数。
    //       仅记录有信息量的跳过（概率/冷却/次数/条件），使"为什么没触发"可复现。
    if (skipReason === PassiveSkipReason.PHASE_MISMATCH) return
    LoggerProvider.logger.addDebugLog(
      `被动未触发 [${entity.name}] ${config.name || config.skillId}：${skipReason}`,
      { level: LogLevel.DEBUG, context: checks },
    )
    if (!this.tracePort || !this.tracePort.isEnabled(TracePhase.PASSIVE_TRIGGER)) return
    this.turnSkippedCount++
    this.tracePort.emit(
      createTraceEvent({
        correlationId: context.trace?.correlationId ?? `pas_skip_${++this.traceCounter}`,
        phase: TracePhase.PASSIVE_TRIGGER,
        parentId: context.trace?.parentId ?? context.parentTraceId,
        battleId: context?.trace?.meta?.battleId,
        turn: context.currentTurn,
        sourceId: entity.id,
        level: TraceLevel.TRACE,
        summary: `被动跳过 [${entity.name}] ${config.name || config.skillId}：${skipReason}`,
        payload: {
          passiveId: config.skillId,
          owner: entity.name,
          trigger: context.phase,
          verdict: PassiveVerdict.SKIPPED,
          skipReason,
          checks,
        },
      }),
    )
  }

  /**
   * 触发被动技能
   *
   * 目标解析规则：
   * - 所有触发类型统一先尝试根据技能 selector 从参与者中解析目标（与主动技能一致）
   * - 当无参与者映射或无 selector 时，回退到 context.target（事件的另一方）或施法者自身
   */
  triggerPassives(entity: BattleEntity, context: PassiveTriggerContext): void {
    const characterPassives = this.passives.get(entity.id)
    if (!characterPassives) return

    // 清空最近触发记录（每次新触发周期重新收集）
    this.lastTriggeredPassives = []

    // 事件型触发所需的上下文目标
    const contextTarget =
      context.target ??
      (context.targetId && context.participants
        ? context.participants.get(context.targetId)
        : undefined)

    for (const config of characterPassives) {
      // 检查触发时机是否匹配
      if (!this.shouldTriggerPassive(config, entity, contextTarget, context))
        continue

      let targets: BattleEntity[]
      const skillConfig = this.skillManager.getSkillConfig(config.skillId)

      if (context.participants) {
        if (skillConfig?.selector) {
          targets = resolveSkillTargets(
            context.participants,
            entity,
            skillConfig.selector,
            skillConfig.steps,
            undefined,
            undefined,
            undefined,
            (e) => this.buffSystem.hasBuffWithTag?.(e.id, 'taunt') ?? false,
            this.rng,
          )
        } else {
          targets = [contextTarget ?? entity]
        }
      } else {
        if (skillConfig?.selector?.faction === 'self') {
          targets = [entity]
        } else {
          targets = [contextTarget ?? entity]
        }
      }

      if (targets.length === 0) continue

      let hasExecuted = false
      if (!skillConfig) {
        LoggerProvider.logger.addDebugLog(
          `[PassiveSkillManager] 被动 ${config.name || config.skillId} 引用的技能 ${config.skillId} 未注册，跳过执行`,
          { level: LogLevel.WARN },
        )
        continue
      }

      const result = this.executePassiveSkill(
        skillConfig,
        entity,
        targets,
        context,
      )
      hasExecuted = result.executed

      // ponytail: 仅在确实执行了有效步骤后才累加冷却和计数
      if (hasExecuted) {
        config.lastTriggeredTurn = context.currentTurn
        config.triggerCount = (config.triggerCount || 0) + 1
      }

      // 记录触发信息（供 ActionContext 使用）
      if (hasExecuted) {
        this.lastTriggeredPassives.push({
          passiveId: config.skillId,
          passiveName: config.name || config.skillId,
          ownerName: entity.name,
          effectSummary: `${entity.name} 触发 【${config.name || config.skillId}】`,
        })
      }

      // IDebugTracePort 输出（结构化 TraceEvent）
      if (this.tracePort && hasExecuted) {
        this.turnFiredCount++
        const configName = config.name || config.skillId
        if (this.tracePort.isEnabled(TracePhase.PASSIVE_TRIGGER)) {
          this.tracePort.emit(
            createTraceEvent({
              correlationId: context?.trace?.correlationId ?? `pas_${++this.traceCounter}`,
              phase: TracePhase.PASSIVE_TRIGGER,
              parentId: context?.trace?.parentId ?? context?.parentTraceId,
              battleId: context?.trace?.meta?.battleId,
              turn: context.currentTurn,
              sourceId: entity.id,
              level: TraceLevel.DEBUG,
              summary: `${entity.name} 触发 【${configName}】`,
              payload: {
                passiveId: config.skillId,
                passiveName: configName,
                owner: entity.name,
                trigger: context?.phase,
                verdict: PassiveVerdict.TRIGGERED,
                checks: this.lastPassChecks ?? undefined,
              },
            }),
          )
        }
      }
    }
  }

  /**
   * 执行被动技能步骤（绕过 SkillManager.executeSkill 的主动技能管道）
   *
   * 与主动技能 executeSkill 的关键区别：
   * - 跳过能量检查/消耗（被动 energyCost ≡ 0）
   * - 跳过目标眩晕检查（被动效果不受眩晕阻挡）
   * - 跳过冷却设置（被动冷却由 PassiveSkillManager 自身管理）
   * - 跳过 SKILL_USE 事件（被动不触发 skill_use 事件）
   * - 每步独立 try-catch，单步失败不影响后续步骤
   *
   * @param config   技能配置（含 steps）
   * @param source   被动所有者（施法者）
   * @param targets  已解析的目标列表（至少一个元素）
   * @param turn     当前回合数
   * @returns 是否有至少一个步骤成功执行
   */
  private executePassiveSkill(
    config: SkillConfig,
    source: BattleEntity,
    targets: BattleEntity[],
    context: PassiveTriggerContext,
  ): { executed: boolean; totalDamage: number } {
    const steps = config.steps
    if (!steps || steps.length === 0) return { executed: true, totalDamage: 0 }
    if (targets.length === 0) return { executed: true, totalDamage: 0 }

    //  1. 捕获执行前的 气血 快照
    const hpSnapshots = new Map<string, { before: number; after: number }>()
    const allEntities = [source, ...targets]
    for (const entity of allEntities) {
      hpSnapshots.set(entity.id, { before: entity.currentHealth, after: 0 })
    }

    const executor = this.skillManager.getExecutor()
    let anyExecuted = false
    let totalDamage = 0
    const allEffects: BattleEffect[] = []

    // ponytail: 被动技能发射 SKILL_USE 事件，使依赖此事件的被动可以连锁
    const targetsIds = targets.map((t) => t.id)
    this.buffSystem.getEventBus().emit(BattleTriggerPhase.SKILL_USE, {
      phase: BattleTriggerPhase.SKILL_USE,
      sourceId: source.id,
      targetId: targetsIds[0],
      currentTurn: context.currentTurn,
      extra: { skillId: config.id },
    })

    //  2. 执行步骤 (SkillExecutor 产出结构化 effects)
    for (const target of targets) {
      // ponytail: 跳过已死亡目标，被动技能不应对死尸生效
      if (!target.isAlive()) continue

      const action = BattleActionHelper.createSkill({
        sourceId: source.id,
        targetId: target.id,
        skillId: config.id,
        skillName: config.name || '',
        turn: context.currentTurn,
        success: true,
      })

      for (const step of steps) {
        try {
          executor.executeStep(
            step,
            action,
            source,
            target,
            createStepContext(undefined, undefined, true, context.damage),
          )
          anyExecuted = true
        } catch (err) {
          LoggerProvider.logger.addDebugLog(
            `被动 ${config.name} 步骤执行异常: ${err instanceof Error ? err.message : String(err)}`,
            { level: LogLevel.ERROR },
          )
          // ponytail: 单步失败不中断后续步骤
        }
      }

      // 收集该目标的所有效果
      allEffects.push(...action.effects)
      totalDamage += action.damage ?? 0
    }

    //  3. 捕获执行后的 气血 快照
    for (const [id] of hpSnapshots) {
      let entity: BattleEntity | undefined
      if (id === source.id) {
        entity = source
      } else {
        entity = targets.find((t) => t.id === id)
      }
      if (entity) {
        hpSnapshots.set(id, {
          before: hpSnapshots.get(id)!.before,
          after: entity.currentHealth,
        })
      }
    }

    //  4. 构建渲染上下文
    const renderCtx: RenderContext = {
      source,
      targets,
      getEntityName: (id: string) => {
        // NOTE: 委托 entitySegment 单一实现（[友方]/[敌方] 前缀 + 名字）
        const resolve = (e: BattleEntity) => entitySegment(e).text
        if (id === source.id) return resolve(source)
        const t = targets.find((e) => e.id === id)
        if (t) return resolve(t)
        if (context.participants) {
          const p = context.participants.get(id)
          if (p) return resolve(p)
        }
        return id
      },
      hpSnapshots,
    }

    //  5. 渲染日志片段
    const segments =
      allEffects.length > 0
        ? this.effectRenderer.render(allEffects, renderCtx)
        : []

    //  6. 输出日志 — 由 BattleLogProjector 投影（统一拼装 + 因果链 meta：triggerPhase/sourceId）
    const projected = projectPassiveLog({
      passiveName: config.name || config.id,
      passiveId: config.id,
      source,
      segments,
      context,
    })
    LoggerProvider.logger.addBattleLog({
      turn: context.currentTurn,
      ...projected,
    })

    //  7. 统一发射动画
    this.emitAnimations(allEffects, hpSnapshots)

    return { executed: anyExecuted, totalDamage }
  }

  /**
   * 统一发射动画 — 匹配规范定义的动画事件
   */
  private emitAnimations(
    effects: BattleEffect[],
    snapshots: Map<string, { before: number; after: number }>,
  ): void {
    if (!this._getAnimationEnabled()) return // 无头/快速模式：抑制
    for (const effect of effects) {
      if (!effect.targetId) continue

      if (
        effect.type === EffectType.DAMAGE ||
        effect.type === EffectType.REFLECT
      ) {
        this.uiEventPort.emit(BattleEventCodes.DAMAGE_ANIMATION, {
          targetId: effect.targetId,
          damage: effect.damage || 0,
          damageCategory: DamageCategory.PHYSICAL,
          isCritical: effect.isCritical || false,
          isHeal: false,
        })
      } else if (
        effect.type === EffectType.HEAL ||
        effect.type === EffectType.DRAIN
      ) {
        // 吸血需要发射两个动画：目标受击，自身回血
        if (effect.type === EffectType.DRAIN) {
          this.uiEventPort.emit(BattleEventCodes.DAMAGE_ANIMATION, {
            targetId: effect.targetId,
            damage: effect.damage || 0,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: false,
            isHeal: false,
          })
        }
        if (effect.heal && effect.heal > 0 && effect.sourceId) {
          this.uiEventPort.emit(BattleEventCodes.DAMAGE_ANIMATION, {
            targetId: effect.sourceId,
            damage: effect.heal,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: false,
            isHeal: true,
          })
        }
      }
    }
  }

  /**
   * 构建被动技能效果摘要文本
   * 从技能配置的 steps 中提取效果描述，用于被动触发日志显示
   */
  private evaluateCondition(
    condition: string,
    source: BattleEntity,
    target?: BattleEntity,
    context?: PassiveTriggerContext,
    params?: Record<string, number | string | boolean>,
  ): boolean {
    try {
      switch (condition) {
        case 'target_has_buff':
          return target ? target.getBuffInstanceIds().length > 0 : false
        case 'source_has_buff':
          return source.getBuffInstanceIds().length > 0
        case 'target_low_hp':
          return target
            ? target.getAttribute('currentHealth') /
                Math.max(1, target.getAttribute('maxHealth')) <
                BATTLE_CONSTANTS.HEAL_THRESHOLD
            : false
        // 守护者被动技能专用条件
        case 'target_has_poison':
          return target
            ? target.hasBuff('buff_poison') ||
                target.hasBuff('buff_strong_poison')
            : false
        case 'target_has_stun':
          return target ? target.hasBuff('buff_stun') : false
        case 'target_has_burn':
          return target ? target.hasBuff('buff_burn') : false
        case 'target_has_sleep':
          // ponytail: 睡眠 buff ID 待确认，当前用 hasBuff 通配检查
          return target
            ? target.getBuffInstanceIds().some((id) => id.includes('sleep'))
            : false

        // 参数化条件：通过 params 传阈值
        case 'source_has_debuff_count': {
          const debuffThreshold = params?.count as number | undefined
          if (debuffThreshold == null) {
            throw new Error(
              `[PassiveSkillManager] 条件 "${condition}" 需要 params.count`
            )
          }
          return source.getBuffInstanceIds().length >= debuffThreshold
        }
        case 'source_energy_high': {
          const energyRatio = (params?.ratio as number) ?? 0.9
          return (
            source.getAttribute('currentEnergy') /
              Math.max(1, source.getAttribute('maxEnergy')) >
            energyRatio
          )
        }
        case 'source_turn_gt': {
          const turnThreshold = params?.turn as number | undefined
          if (turnThreshold == null) {
            throw new Error(
              `[PassiveSkillManager] 条件 "${condition}" 需要 params.turn`
            )
          }
          return (context?.currentTurn ?? 0) > turnThreshold
        }
        case 'source_turn_mod': {
          const modValue = params?.mod as number | undefined
          if (modValue == null) {
            throw new Error(
              `[PassiveSkillManager] 条件 "${condition}" 需要 params.mod`
            )
          }
          return (
            (context?.currentTurn ?? 0) % modValue === 0 &&
            (context?.currentTurn ?? 0) > 0
          )
        }

        // 废弃的旧条件名——直接报错
        case 'source_has_debuff_count_3':
        case 'source_turn_gt_5':
        case 'source_turn_mod_5':
          throw new Error(
            `[PassiveSkillManager] 废弃的条件名 "${condition}"。` +
            `请改用参数化版本并从 conditionParams 传阈值。`
          )

        default:
          throw new Error(
            `[PassiveSkillManager] 未知条件 "${condition}"，请检查配置。`
          )
      }
    } catch (err) {
      LoggerProvider.logger.addDebugLog(
        `[PassiveSkillManager] evaluateCondition 异常: ${err}`,
        { level: LogLevel.ERROR },
      )
      return false
    }
  }

  getPassives(characterId: string): PassiveSkillConfig[] {
    return this.passives.get(characterId) || []
  }

  removePassive(characterId: string, passiveId: string): boolean {
    const list = this.passives.get(characterId)
    if (!list) return false
    const index = list.findIndex((p) => p.id === passiveId)
    if (index === -1) return false
    const removed = list[index]
    list.splice(index, 1)

    // 同步更新倒排索引
    if (removed.trigger) {
      const entries = this.indexByPhase.get(removed.trigger)
      if (entries) {
        const idx = entries.findIndex(
          (e) => e.characterId === characterId && e.config.id === passiveId,
        )
        if (idx !== -1) entries.splice(idx, 1)
        if (entries.length === 0) this.indexByPhase.delete(removed.trigger)
      }
    }
    return true
  }

  clearPassives(characterId: string): void {
    // 从倒排索引中移除该角色的所有条目
    this.indexByPhase.forEach((entries, trigger) => {
      const remaining = entries.filter((e) => e.characterId !== characterId)
      if (remaining.length === 0) {
        this.indexByPhase.delete(trigger)
      } else {
        this.indexByPhase.set(trigger, remaining)
      }
    })
    this.passives.delete(characterId)
  }

  clearAll(): void {
    this.passives.clear()
    this.indexByPhase.clear()
  }

  /** 为所有参与者触发指定时机的被动技能 */
  triggerPassiveSkillsForAll(
    participants: Map<string, BattleEntity>,
    context: PassiveTriggerContext,
  ): void {
    // 优先走倒排索引，只遍历注册了该时机的被动
    const entries = this.indexByPhase.get(context.phase)
    if (entries && entries.length > 0) {
      for (const { characterId } of entries) {
        const entity = participants.get(characterId)
        if (!entity?.isAlive()) continue
        this.triggerPassives(entity, {
          ...context,
          participants: context.participants ?? participants,
        })
      }
    } else {
      for (const participant of participants.values()) {
        this.triggerPassives(participant, {
          ...context,
          participants: context.participants ?? participants,
        })
      }
    }
  }
}
