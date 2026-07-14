import { BattleTriggerPhase, PARTICIPANT_SIDE, BATTLE_CONSTANTS, BattleActionHelper, type BattleContext, type BattleEntity } from '@/domain/battle/type/types'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { StackRule, ControlType, type BuffConfig } from '@/domain/buff/types'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'
import { BATTLE_LOG_CATEGORIES, buildNameSegments } from '@/shared/types/battle-log'
import { resolveSkillTargets } from '@/domain/skill/target-resolver'
import type { SkillConfig } from '@/domain/skill/types'

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
  private passives: Map<string, PassiveSkillConfig[]> = new Map()
  private skillManager: SkillManager
  private buffSystem: BuffSystem

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
  }

  /**
   * 触发被动技能
   *
   * 目标解析规则：
   * - 时间型触发（battle_start / turn_start / turn_end）：
   *   根据技能 selector 从参与者中解析目标（与主动技能一致）
   * - 事件型触发（damage_taken / on_hit 等）：
   *   沿用原有的 context.target（事件的另一参与方），不做 selector 解析
   *   ponytail: 后续若被动技能配置了非 self selector，事件型触发也可统一走 selector 路径
   */
  triggerPassives(
    trigger: BattleTriggerPhase,
    entity: BattleEntity,
    context?: BattleContext,
  ): void {
    const characterPassives = this.passives.get(entity.id)
    if (!characterPassives) return

    // 事件型触发所需的上下文目标
    const contextTarget = context?.target ??
      (context?.targetId && context?.participants ? context.participants.get(context.targetId) : undefined)

    const isTimeBased = trigger === BattleTriggerPhase.BATTLE_START
      || trigger === BattleTriggerPhase.TURN_START
      || trigger === BattleTriggerPhase.TURN_END

    for (const config of characterPassives) {
      // 检查触发时机是否匹配
      if (config.trigger !== trigger) continue
      // 检查冷却时间是否到，config.cooldown = -1 表示无冷却
      if (config.cooldown > 0 && config.lastTriggeredTurn) {
        const currentTurn = (context?.currentTurn as number) || 0
        if (currentTurn - config.lastTriggeredTurn < config.cooldown) continue
      }
      // 检查最大触发次数是否超过
      if (
        config.maxTriggerCount &&
        config.triggerCount &&
        config.triggerCount >= config.maxTriggerCount
      )
        continue
      // 检查触发概率是否命中
      if (
        config.triggerProbability &&
        Math.random() > config.triggerProbability
      )
        continue
      if (
        config.trigger === BattleTriggerPhase.HP_LOWER_THAN &&
        config.hpThreshold
      ) {
        const hpPercent =
          entity.getAttribute('currentHealth') /
          Math.max(1, entity.getAttribute('maxHealth'))
        if (hpPercent > config.hpThreshold / 100) continue
      }
      // 被动有触发条件，检查是否满足
      if (
        config.condition &&
        !this.evaluateCondition(config.condition, entity, contextTarget, context)
      )
        continue

      // --- 确定目标 ---
      let targets: BattleEntity[]

      if (isTimeBased && context?.participants) {
        const skillConfig = this.skillManager.getSkillConfig(config.skillId)
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
        targets = [contextTarget ?? entity]
      }

      if (targets.length === 0) continue

      // --- 对每个目标执行（走被动专用管道，绕过 executeSkill 的主动技能逻辑）---
      const skillConfig = this.skillManager.getSkillConfig(config.skillId)
      const turn = (context?.currentTurn as number) || 0
      if (skillConfig) {
        this.executePassiveSkill(skillConfig, entity, targets, turn)
      } else {
        // ponytail: 无配置时回退旧路径防止崩溃
        for (const actualTarget of targets) {
          this.skillManager.executeSkill(config.skillId, entity, actualTarget, turn)
        }
      }

      // ponytail: BATTLE_START 被动中纯 modify_attribute 步骤不创建 buff 实体，
      // 此处自动创建追踪 buff 使其在 buff 列表中可见
      if (trigger === BattleTriggerPhase.BATTLE_START) {
        this.ensureTrackingBuff(entity.id, config.skillId, config.name)
      }
      // ponytail: 被动触发日志 — 带角色名着色
      const targetNames = targets.map((t) => t.name).join('、') || '自身'
      const firstTarget = targets[0]
      const segs = buildNameSegments(
        entity.name,
        entity.type === PARTICIPANT_SIDE.ALLY,
        targetNames,
        firstTarget ? firstTarget.type === PARTICIPANT_SIDE.ALLY : undefined,
      )
      segs.push({ text: ` 触发 ${config.name}，对 ${targetNames} 生效` })
      const entityPrefix = entity.type === PARTICIPANT_SIDE.ALLY ? '[友方]' : '[敌方]'
      const targetPrefix = firstTarget ? (firstTarget.type === PARTICIPANT_SIDE.ALLY ? '[友方]' : '[敌方]') : ''
      battleLogManager.addBattleLog({
        turn: (context?.currentTurn as number) || 1,
        message: `${entityPrefix}${entity.name} 触发 ${config.name}，对 ${targetPrefix}${targetNames} 生效`,
        segments: segs,
        category: BATTLE_LOG_CATEGORIES.STATUS,
      })
      config.lastTriggeredTurn = (context?.currentTurn as number) || 0
      config.triggerCount = (config.triggerCount || 0) + 1
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
    turn: number,
  ): boolean {
    const steps = config.steps
    if (!steps || steps.length === 0) return true // ponytail: 无步骤=无需执行，不算失败
    if (targets.length === 0) return true         // ponytail: 无目标=无需执行，不算失败

    const executor = this.skillManager.getExecutor()
    let anyExecuted = false

    for (const target of targets) {
      // ponytail: 跳过已死亡目标，被动技能不应对死尸生效
      if (!target.isAlive()) continue

      const action = BattleActionHelper.createSkill({
        sourceId: source.id,
        targetId: target.id,
        skillId: config.id,
        skillName: config.name || '',
        turn,
        success: true,
      })

      for (const step of steps) {
        try {
          executor.executeStep(step, action, source, target)
          anyExecuted = true
        } catch (err) {
          battleLogManager.addDebugLog(
            `被动 ${config.name} 步骤执行异常: ${err instanceof Error ? err.message : String(err)}`,
            { level: LogLevel.ERROR },
          )
          // ponytail: 单步失败不中断后续步骤
        }
      }
    }

    return anyExecuted
  }

  private evaluateCondition(
    condition: string,
    source: BattleEntity,
    target?: BattleEntity,
    context?: BattleContext,
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
          return source.getBuffInstanceIds().length >= 0
        case 'source_energy_high':
          return (
            source.getAttribute('currentEnergy') /
              Math.max(1, source.getAttribute('maxEnergy')) >
            0.9
          )
        case 'source_turn_gt_5':
          return (context?.currentTurn as number) > 5
        case 'source_turn_mod_5':
          return (
            (context?.currentTurn as number) % 5 === 0 &&
            (context?.currentTurn as number) > 0
          )
        default:
          return true
      }
    } catch {
      return true
    }
  }

  /**
   * BATTLE_START 被动中，纯 modify_attribute 步骤不会创建 buff 实体。
   * 此方法检查技能步骤，若无 apply_buff 步骤则自动创建追踪 buff，
   * 使该被动在参与者 buff 列表中可见。
   */
  private ensureTrackingBuff(characterId: string, skillId: string, skillName: string): void {
    const skillConfig = this.skillManager.getSkillConfig(skillId)
    if (!skillConfig?.steps) return

    // 如果已有 apply_buff 步骤，其 buff 实体已由 SkillExecutor 创建，无需追踪 buff
    const hasApplyBuff = skillConfig.steps.some(s => s.type === 'apply_buff')
    if (hasApplyBuff) return

    const buffId = `_track_passive_${skillId}`
    if (this.buffSystem.hasBuff(characterId, buffId)) return

    const config: BuffConfig = {
      id: buffId,
      name: skillName,
      description: '',
      duration: -1,
      maxStacks: 1,
      cooldown: 0,
      stackRule: StackRule.REFRESH,
      controlType: ControlType.NONE,
      controlPriority: 0,
      isDebuff: false,
      isPositive: true,
    }
    this.buffSystem.addBuff(characterId, buffId, config, 0)
  }

  getPassives(characterId: string): PassiveSkillConfig[] {
    return this.passives.get(characterId) || []
  }

  removePassive(characterId: string, passiveId: string): boolean {
    const list = this.passives.get(characterId)
    if (!list) return false
    const index = list.findIndex((p) => p.id === passiveId)
    if (index === -1) return false
    list.splice(index, 1)
    return true
  }

  clearPassives(characterId: string): void {
    this.passives.delete(characterId)
  }

  clearAll(): void {
    this.passives.clear()
  }

  /** 为所有参与者触发指定时机的被动技能 */
  triggerPassiveSkillsForAll(
    trigger: BattleTriggerPhase,
    participants: Map<string, BattleEntity>,
    context?: BattleContext,
  ): void {
    for (const participant of participants.values()) {
      this.triggerPassives(trigger, participant, context)
    }
  }
}
