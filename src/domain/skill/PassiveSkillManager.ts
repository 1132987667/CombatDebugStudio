import { ATTRIBUTE_CODE, AttributeCodeNames } from '@/domain/attribute/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import type { TraceLogCollector } from '@/domain/battle/logs/TraceLogCollector'
import {
  BATTLE_CONSTANTS,
  BattleActionHelper,
  BattleTriggerPhase,
  PARTICIPANT_SIDE,
  type PassiveTriggerContext,
  type BattleEntity,
} from '@/domain/battle/type/types'
import { createStepContext } from '@/domain/battle/type/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { SkillManager } from '@/domain/skill/SkillManager'
import { resolveSkillTargets } from '@/domain/skill/target-resolver'
import type { SkillConfig } from '@/domain/skill/types'
import { SkillStepType } from '@/domain/skill/types'
import {
  BATTLE_LOG_CATEGORIES,
  LogLevel,
} from '@/shared/types/battle-log'
import { createTraceLogEntry } from '@/shared/types/trace-log'

export interface PassiveSkillConfig {
  id: string
  name: string
  description: string
  trigger?: BattleTriggerPhase
  condition?: string
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
  /**
   * 当前参战角色的被动技能配置
   */
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

  /** 可选的 TraceLogCollector */
  private traceCollector?: TraceLogCollector
  private traceCounter = 0

  setTraceCollector(c: TraceLogCollector): void {
    this.traceCollector = c
  }

  constructor(skillManager: SkillManager, buffSystem: BuffSystem) {
    this.skillManager = skillManager
    this.buffSystem = buffSystem
  }

  /** Factory method for compatibility with DI Container */
  static create(
    skillManager: SkillManager,
    buffSystem: BuffSystem,
  ): PassiveSkillManager {
    return new PassiveSkillManager(skillManager, buffSystem)
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
    context: PassiveTriggerContext = { phase: BattleTriggerPhase.BATTLE_START, currentTurn: 0 },
  ): boolean {
    if (config.trigger !== context.phase) return false
    // 检查冷却时间是否到，config.cooldown = -1 表示无冷却
    if (config.cooldown > 0 && config.lastTriggeredTurn) {
      const currentTurn = context.currentTurn
      if (currentTurn - config.lastTriggeredTurn < config.cooldown) return false
    }
    // 检查最大触发次数是否超过
    if (
      config.maxTriggerCount &&
      config.triggerCount &&
      config.triggerCount >= config.maxTriggerCount
    )
      return false
    // 检查触发概率是否命中
    if (config.triggerProbability && Math.random() > config.triggerProbability)
      return false
    if (
      config.trigger === BattleTriggerPhase.HP_LOWER_THAN &&
      config.hpThreshold
    ) {
      const hpPercent =
        entity.getAttribute(ATTRIBUTE_CODE.currentHealth) /
        Math.max(1, entity.getAttribute(ATTRIBUTE_CODE.maxHealth))
      if (hpPercent > config.hpThreshold / 100) return false
    }
    // 被动有触发条件，检查是否满足
    if (
      config.condition &&
      !this.evaluateCondition(config.condition, entity, contextTarget, context)
    )
      return false
    return true
  }

  /**
   * 触发被动技能
   *
   * 目标解析规则：
   * - 所有触发类型统一先尝试根据技能 selector 从参与者中解析目标（与主动技能一致）
   * - 当无参与者映射或无 selector 时，回退到 context.target（事件的另一方）或施法者自身
   */
  triggerPassives(
    entity: BattleEntity,
    context: PassiveTriggerContext,
  ): void {
    const characterPassives = this.passives.get(entity.id)
    if (!characterPassives) return

    // 事件型触发所需的上下文目标
    const contextTarget =
      context.target ??
      (context.targetId && context.participants
        ? context.participants.get(context.targetId)
        : undefined)

    for (const config of characterPassives) {
      // 检查触发时机是否匹配
      if (
        !this.shouldTriggerPassive(
          config,
          entity,
          contextTarget,
          context,
        )
      )
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
      hasExecuted = this.executePassiveSkill(
        skillConfig,
        entity,
        targets,
        context,
      )

      // ponytail: 仅在确实执行了有效步骤后才累加冷却和计数
      if (hasExecuted) {
        config.lastTriggeredTurn = context.currentTurn
        config.triggerCount = (config.triggerCount || 0) + 1
      }

      // ponytail: 被动触发日志 — 简洁格式：被动名 + 效果摘要
      const configName = config.name || config.skillId
      const effectSummary = this.buildPassiveEffectSummary(skillConfig, targets, context)

      LoggerProvider.logger.addBattleLog({
        turn: context.currentTurn,
        message: `${configName}  ${effectSummary}`,
        segments: [
          { text: configName, classStr: 'log-passive', kind: 'passive', hover: { kind: 'passive', id: config.skillId } },
          { text: `  ${effectSummary}` },
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'sub' },
      })

      // TraceLogCollector 输出
      if (this.traceCollector && hasExecuted) {
        this.traceCounter++
        const traceId = `pas_${this.traceCounter}_${Date.now()}`
        this.traceCollector.add({
          ...createTraceLogEntry(
            traceId,
            context?.parentTraceId,
            configName,
            0,
            `${entity.name} 触发 【${configName}】`,
            1,
          ),
          turn: context.currentTurn,
          source: entity.id,
        })
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
  ): boolean {
    const steps = config.steps
    if (!steps || steps.length === 0) return true // ponytail: 无步骤=无需执行，不算失败
    if (targets.length === 0) return true // ponytail: 无目标=无需执行，不算失败

    const executor = this.skillManager.getExecutor()
    let anyExecuted = false

    // ponytail: 被动技能发射 SKILL_USE 事件，使依赖此事件的被动可以连锁
    const targetsIds = targets.map(t => t.id)
    this.buffSystem.getEventBus().emit(BattleTriggerPhase.SKILL_USE, {
      phase: BattleTriggerPhase.SKILL_USE,
      sourceId: source.id,
      targetId: targetsIds[0],
      currentTurn: context.currentTurn,
      extra: { skillId: config.id },
    })

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
          executor.executeStep(step, action, source, target, createStepContext(undefined, undefined, true))
          anyExecuted = true
        } catch (err) {
          LoggerProvider.logger.addDebugLog(
            `被动 ${config.name} 步骤执行异常: ${err instanceof Error ? err.message : String(err)}`,
            { level: LogLevel.ERROR },
          )
          // ponytail: 单步失败不中断后续步骤
        }
      }
    }

    return anyExecuted
  }

  /**
   * 构建被动技能效果摘要文本
   * 从技能配置的 steps 中提取效果描述，用于被动触发日志显示
   */
  private buildPassiveEffectSummary(
    config?: SkillConfig,
    targets?: BattleEntity[],
    context?: PassiveTriggerContext,
  ): string {
    if (!config) return ''
    const parts: string[] = []
    const steps = config.steps || []

    for (const step of steps) {
      switch (step.type) {
        case SkillStepType.GAIN_ENERGY: {
          const val = step.parameters?.value ?? 0
          if (val > 0) parts.push(`能量 +${val}`)
          break
        }
        case SkillStepType.APPLY_BUFF: {
          const buffId = step.buffId ?? step.effectId
          if (buffId) {
            const buffConfig = this.buffSystem.getScriptRegistry().getBuffConfig(buffId)
            if (buffConfig?.attributes) {
              for (const [attr, valStr] of Object.entries(buffConfig.attributes)) {
                const cn = (AttributeCodeNames as Record<string, string>)[attr] ?? attr
                const num = parseFloat(valStr)
                if (isNaN(num)) continue
                const pct = Math.abs(valStr.includes('%') ? num : (Math.abs(num) < 1 ? num * 100 : num))
                const arrow = num >= 0 ? '↑' : '↓'
                const maxStacks = step.stacks ?? buffConfig.maxStacks ?? 1
                // 查目标实体上该 buff 的当前实际层数
                let currentStacks = 0
                if (targets && targets.length > 0) {
                  for (const t of targets) {
                    if (typeof t.getBuffInstanceIds === 'function') {
                      const ids = t.getBuffInstanceIds()
                      for (const instanceId of ids) {
                        const instance = this.buffSystem.getBuffInstanceById(instanceId)
                        if (instance?.buffId === buffId && instance.currentStacks > currentStacks) {
                          currentStacks = instance.currentStacks
                        }
                      }
                    }
                  }
                }
                const stackDisplay = currentStacks > 0
                  ? `（${currentStacks}/${maxStacks}层）`
                  : `（${maxStacks}层）`
                parts.push(`${cn}${arrow}${Math.round(pct)}%${stackDisplay}`)
              }
            } else {
              parts.push(buffConfig?.name ?? buffId)
            }
          }
          break
        }
        case SkillStepType.DEAL_DAMAGE: {
          const dmg = context?.damage ?? 0
          if (dmg > 0) parts.push(`追加 ${dmg} 点伤害`)
          break
        }
        case SkillStepType.MODIFY_ATTRIBUTE: {
          for (const mod of step.modifiers || []) {
            const cn = (AttributeCodeNames as Record<string, string>)[mod.targetAttribute] ?? mod.targetAttribute
            const arrow = mod.value >= 0 ? '↑' : '↓'
            parts.push(`${cn}${arrow}${Math.abs(mod.value)}%`)
          }
          break
        }
        case SkillStepType.HEAL: {
          const heal = context?.heal ?? 0
          if (heal > 0) parts.push(`恢复 ${heal} HP`)
          break
        }
        default:
          break
      }
    }

    return parts.join(' · ') || '生效'
  }

  private evaluateCondition(
    condition: string,
    source: BattleEntity,
    target?: BattleEntity,
    context?: PassiveTriggerContext,
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
        case 'source_has_debuff_count_3':
          // ponytail: 身上 ≥ 3 个减益时触发（守护者被动「不屈意志」专用）
          return source.getBuffInstanceIds().length >= 3
        case 'source_energy_high':
          return (
            source.getAttribute('currentEnergy') /
              Math.max(1, source.getAttribute('maxEnergy')) >
            0.9
          )
        case 'source_turn_gt_5':
          return (context?.currentTurn ?? 0) > 5
        case 'source_turn_mod_5':
          return (
            (context?.currentTurn ?? 0) % 5 === 0 &&
            (context?.currentTurn ?? 0) > 0
          )
        default:
          LoggerProvider.logger.addDebugLog(
            `[PassiveSkillManager] 未知条件 "${condition}"，默认不触发`,
            { level: LogLevel.WARN },
          )
          return false
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
      // ponytail: 索引为空时回退全量扫描（兼容未通过 registerPassive 注册的被动）
      for (const participant of participants.values()) {
        this.triggerPassives(participant, {
          ...context,
          participants: context.participants ?? participants,
        })
      }
    }
  }
}
