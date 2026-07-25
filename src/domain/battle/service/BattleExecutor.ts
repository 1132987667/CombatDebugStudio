/**
 * 文件: BattleExecutor.ts
 * 功能: 战斗执行引擎 — 负责参与者行动、技能执行、攻击处理等运行时逻辑
 * 从 BattleSystem.ts 提取，职责单一
 */
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { convertToBattleState } from '@/domain/battle/aggregate/BattleState'
import type { SkillManager } from '@/domain/skill/SkillManager'
import type { DamageCalculator } from '@/domain/skill/DamageCalculator'
import type { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import {
  BattleTriggerPhase,
  ActionResultType,
  createBattleContext,
} from '@/domain/battle/type/types'
import type { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import type { BattleAnimationManager } from '@/domain/battle/BattleAnimationManager'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { EffectType } from '@/shared/types/effect'
import {
  BATTLE_LOG_CATEGORIES,
  buildNameSegments,
} from '@/shared/types/battle-log'
import { skillSegment } from '@/shared/utils/log-segment-factory'
import { TraceDamageLogger } from '@/domain/battle/logs/TraceDamageLogger'
import type { TraceLogCollector } from '@/domain/battle/logs/TraceLogCollector'
import { DeferredDamageToken } from '@/domain/skill/DeferredDamageToken'
import {
  BalancedAIPriorityStrategy,
  type AIPriorityStrategy,
} from '@/domain/battle/ai/AIPriorityStrategy'

import {
  BattleActionHelper,
  BATTLE_CONSTANTS,
  PARTICIPANT_SIDE,
  ActionTypes,
} from '@/domain/battle/type/types'
import {
  type SkillConfig,
  type ExtendedSkillStep,
  SkillType,
  AttackType,
  DamageCategory,
  TargetFaction,
  TargetStrategy,
  SkillStepType,
  convertSkillConfigToSkill,
} from '@/domain/skill/types'
import {
  resolveSkillTargets,
  resolveStepTargets,
  validateTargetAgainstSelector,
} from '@/domain/skill/target-resolver'
import type {
  BattleAction,
  BattleData,
  BattleEntity,
  BattleEffect,
  BattleContext,
} from '@/domain/battle/type/types'
import {
  ATTRIBUTE_CODE,
  getAttributeDefaultValue,
} from '@/domain/attribute/types'
import {
  createEmptyRecord,
  type CombatRecord,
} from '@/domain/battle/combat-record'

/**
 * 战斗执行器
 * 封装参与者的行动决策、技能/攻击执行、伤害/治疗应用、日志记录等运行时逻辑。
 */
export class BattleExecutor {
  /** ponytail: P0/AI-1 — AUTO 模式使用的默认权重策略，无需 AI 实例 */
  private readonly defaultStrategy: AIPriorityStrategy =
    new BalancedAIPriorityStrategy()

  /** 树状调试日志收集器（可选） */
  private traceCollector?: TraceLogCollector
  private traceCounter = 0

  /** 设置 traceCollector（由 BattleSystem 在初始化时注入） */
  setTraceCollector(collector: TraceLogCollector): void {
    this.traceCollector = collector
  }

  constructor(
    private readonly skillManager: SkillManager,
    private readonly damageCalculator: DamageCalculator,
    private readonly passiveSkillManager: PassiveSkillManager,
    private readonly battleRecorder: BattleRecorder,
    private readonly animationManager: BattleAnimationManager,
    private readonly buffSystem: BuffSystem,
  ) {}

  // ============ 参与者行动 ============

  /**
   * 检查参与者是否有控制类Buff
   * ponytail: 委托给 BuffSystem 的优先级系统，而非硬编码 hasBuff 检查。
   *           所有 ControlType（STUN/SILENCE/FREEZE/SLEEP/BIND）都通过同一入口处理。
   */
  isParticipantControlled(participant: BattleEntity): boolean {
    return this.buffSystem.isCharacterControlled(participant.id)
  }

  /**
   * 执行单个参与者的行动
   * ponytail: P0/AI-1 — 三路径决策：AI（含目标建议）| AUTO（策略选技能）| MANUAL（跳过）
   */
  async executeParticipantAction(
    battle: BattleData,
    participant: BattleEntity,
  ): Promise<void> {
    // 检查参与者是否被控制
    if (this.isParticipantControlled(participant)) {
      const action = BattleActionHelper.createStatus({
        sourceId: participant.id,
        targetId: participant.id,
        turn: battle.currentTurn || 1,
        effects: [
          {
            type: 'status',
            description: `${participant.name} 被控制，无法行动`,
            duration: 0,
          },
        ],
      })
      this.recordBattleAction(battle, action)
      LoggerProvider.logger.addBattleLog({
        turn: battle.currentTurn || 1,
        message: `${participant.name} 被控制，无法行动`,
        segments: [
          {
            text: participant.name,
            classStr:
              participant.type === PARTICIPANT_SIDE.ALLY
                ? 'log-friendly'
                : 'log-hostile',
            kind: 'entity',
            faction: participant.type === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy',
          },
          { text: ' 被控制，无法行动' },
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
      })
      LoggerProvider.logger.addDebugLog(
        `角色[${participant.name}]被控制，无法行动`,
      )
      return
    }

    const context: BattleContext = { participants: battle.participants }

    switch (participant.controlMode) {
      case 'AI': {
        const aiInstance = battle.aiInstances?.get(participant.id)
        if (aiInstance) {
          const decision = aiInstance.makeDecision(
            convertToBattleState(battle),
            participant,
          )
          const suggestedTargetId = decision.targetId
          if (decision.type === 'skill' && decision.skillId) {
            const skill = this.skillManager.getSkillConfig(decision.skillId)
            if (skill) {
              await this.selectAndExecuteSkill(
                battle,
                participant,
                skill,
                suggestedTargetId,
                context,
              )
            } else {
              await this.selectAndExecuteAttack(
                battle,
                participant,
                suggestedTargetId,
              )
            }
          } else {
            await this.selectAndExecuteAttack(
              battle,
              participant,
              suggestedTargetId,
            )
          }
        } else {
          // ponytail: 有 AI 标志但无实例，降级为 AUTO
          await this.autoDecision(battle, participant, context)
        }
        break
      }
      case 'AUTO':
        await this.autoDecision(battle, participant, context)
        break
      case 'MANUAL':
        // ponytail: 玩家手操，由 Store/UI 直接驱动
        LoggerProvider.logger.addDebugLog(
          `玩家手操角色[${participant.name}]，跳过自动决策`,
        )
        break
    }

    participant.afterAction()
  }

  /**
   * ponytail: P0/AI-1 — AUTO 模式决策：用权重策略选技能，无策略时走普攻
   */
  private async autoDecision(
    battle: BattleData,
    participant: BattleEntity,
    context: BattleContext,
  ): Promise<void> {
    const currentEnergy = participant.getAttribute(ATTRIBUTE_CODE.currentEnergy)
    const activeSkillIds = participant.getSkillIds(SkillType.ACTIVE)
    const availableSkills = activeSkillIds.filter((skillId) => {
      const energyCost = this.getSkillEnergyCost(skillId)
      if (currentEnergy < energyCost) return false
      if (
        'isSkillAvailable' in participant &&
        typeof participant.isSkillAvailable === 'function'
      ) {
        if (!participant.isSkillAvailable(skillId)) return false
      }
      return true
    })

    if (availableSkills.length > 0) {
      const skills = availableSkills
        .map((id) => this.skillManager.getSkillConfig(id))
        .filter(Boolean)
        .map((c) => convertSkillConfigToSkill(c!))
      const bestSkillId = this.defaultStrategy.selectBestSkill(
        skills,
        participant,
        convertToBattleState(battle),
      )
      if (bestSkillId) {
        const skill = this.skillManager.getSkillConfig(bestSkillId)
        if (skill) {
          await this.selectAndExecuteSkill(
            battle,
            participant,
            skill,
            undefined,
            context,
          )
          return
        }
      }
      // fallback: 取第一个可用技能
      const skillId = availableSkills[0]
      const skill = this.skillManager.getSkillConfig(skillId)
      if (skill) {
        await this.selectAndExecuteSkill(
          battle,
          participant,
          skill,
          undefined,
          context,
        )
        return
      }
    }

    await this.selectAndExecuteAttack(battle, participant)
  }

  // ============ 技能执行 ============

  /**
   * 选择并执行技能
   */
  async selectAndExecuteSkill(
    battleData: BattleData,
    source: BattleEntity,
    skill: SkillConfig,
    suggestedTargetId?: string,
    context?: BattleContext,
  ): Promise<BattleAction> {
    if (
      'isSkillAvailable' in source &&
      typeof source.isSkillAvailable === 'function'
    ) {
      if (!source.isSkillAvailable(skill.id)) {
        return this.selectAndExecuteAttack(
          battleData,
          source,
          suggestedTargetId,
        )
      }
    }

    const action = BattleActionHelper.createSkill({
      sourceId: source.id,
      targetId: '',
      skillId: skill.id,
      skillName: skill.name,
      turn: battleData.currentTurn,
    })

    const targets = this.getSkillTargets(
      battleData,
      source,
      skill,
      suggestedTargetId,
    )
    if (targets.length === 0) {
      LoggerProvider.logger.addDebugLog(
        `技能执行失败: 未找到有效目标 ${skill.id}`,
      )
      console.error(`技能执行失败: 未找到有效目标 ${skill.id}`)
      return this.selectAndExecuteAttack(battleData, source)
    }

    action.targetId = targets[0].id

    // 用于收集每次技能执行的详细记录
    const records: CombatRecord[] = []

    try {
      // ★ 开始缓冲 BEFORE_ATTACK 的 sub 日志
      LoggerProvider.logger.beginBufferSubLogs()

      this.passiveSkillManager.triggerPassives(
        BattleTriggerPhase.BEFORE_ATTACK,
        source,
        createBattleContext(battleData, {
          target: targets[0],
          targetId: targets[0]?.id,
        }),
      )
      // ponytail: 启用延迟伤害令牌 — 技能执行只记录数值不实际扣血
      const damageToken = new DeferredDamageToken()
      const pendingDamages: Array<{
        target: BattleEntity
        damage: number
        heal: number
      }> = []

      let totalDamage = 0
      let totalHeal = 0
      const allEffects: BattleEffect[] = []

      for (const target of targets) {
        if (!target.isAlive()) continue

        const record = createEmptyRecord(
          battleData.battleId,
          source.id,
          source.name,
          'skill',
          target.id,
          target.name,
          battleData.currentTurn ?? 1,
          skill.id,
        )
        record.skillName = skill.name

        const skillAction = this.skillManager.executeSkill(
          skill.id,
          source,
          target,
          battleData.currentTurn || 1,
          record,
          (stepTargetType, mainTarget) =>
            this.resolveStepTargets(battleData, mainTarget, stepTargetType),
          damageToken,
        )
        if (!skillAction.success) {
          LoggerProvider.logger.addDebugLog(
            `技能执行失败: ${skill.id}，跳过目标 ${target.id} — ${skillAction.effects[0]?.description || '未知原因'}`,
          )
          continue
        }

        // 回填记录
        record.damage = skillAction.damage ?? 0
        record.message = `${source.name} 对 ${target.name} 使用 ${skill.name || skill.id}，造成 ${skillAction.damage ?? 0} 伤害`
        records.push(record)

        if ((skillAction.damage ?? 0) > 0 || (skillAction.heal ?? 0) > 0) {
          pendingDamages.push({
            target,
            damage: skillAction.damage ?? 0,
            heal: skillAction.heal ?? 0,
          })
        }
        totalDamage += skillAction.damage ?? 0
        totalHeal += skillAction.heal ?? 0
        allEffects.push(...skillAction.effects)
      }

      // 将所有详细记录存入 BattleRecorder
      for (const record of records) {
        record.damageSource = 'skill'
        this.battleRecorder.recordCombatRecord(battleData.battleId, record)
        // ponytail: 技术调试日志 — 技能伤害计算链路追踪
        try {
          this.traceCounter++
          const skillTraceId = `skill_${this.traceCounter}_${Date.now()}`
          TraceDamageLogger.log(record, this.traceCollector, skillTraceId)
        } catch {
          // 调试日志失败绝不中断战斗
        }
      }

      action.damage = totalDamage
      action.heal = totalHeal
      action.effects = allEffects

      const targetNames = targets.map((t) => t.name).join(', ')
      const damageText = totalDamage > 0 ? `，造成 ${totalDamage} 点伤害` : ''
      const healText = totalHeal > 0 ? `，恢复 ${totalHeal} 点生命` : ''
      // ponytail: 技能执行的伤害/治疗动画 — 与 handleHitAttack / executeAction 保持一致
      if (targets.length > 0 && (totalDamage > 0 || totalHeal > 0)) {
        const primaryTarget = targets[0]
        const isCrit = allEffects.some(
          (e: BattleEffect) => e.type === EffectType.DAMAGE && e.isCritical,
        )

        // ponytail: 技能飞行动画只播放一次（无论伤害/治疗/同时都有）
        await this.animationManager.triggerSkillEffectAnimation({
          sourceId: source.id,
          targetId: primaryTarget.id,
          skillName: skill.name || skill.id,
          effectType: action.type,
          damageCategory: DamageCategory.PHYSICAL,
        })

        if (totalDamage > 0) {
          await this.animationManager.triggerDamageAnimationAndWait({
            targetId: primaryTarget.id,
            damage: totalDamage,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: isCrit,
            isHeal: false,
          })
        }

        if (totalHeal > 0) {
          await this.animationManager.triggerDamageAnimationAndWait({
            targetId: primaryTarget.id,
            damage: totalHeal,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: false,
            isHeal: true,
          })
        }

        // ponytail: 动画完成后统一应用延迟的伤害/治疗
        // NOTE: 在扣血前捕获 HP 用于叙事日志
        const hpBeforeMap = new Map<string, number>()
        for (const pd of pendingDamages) {
          hpBeforeMap.set(pd.target.id, pd.target.currentHealth)
        }
        damageToken.applyAll()

        // NOTE: 扣血后捕获 HP，构建叙事日志
        const primaryHpBefore = pendingDamages.length > 0 ? hpBeforeMap.get(pendingDamages[0].target.id) : undefined
        const primaryHpAfter = pendingDamages.length > 0 ? pendingDamages[0].target.currentHealth : undefined
        const logTarget = pendingDamages.length > 0 ? pendingDamages[0].target : undefined
        const skillId = skill.id || skill.name || ''
        let skillSeg: ReturnType<typeof skillSegment>
        try {
          skillSeg = skillSegment(skillId, this.skillManager)
        } catch {
          skillSeg = { text: `【${skill.name || skillId}】`, classStr: 'log-skill' }
        }
        LoggerProvider.logger.addBattleLog({
          turn: battleData.currentTurn,
          message: `${source.name} 对 ${targetNames} 使用 ${skill.name || skill.id}${damageText}${healText}`,
          segments: [
            {
              text: source.name,
              classStr:
                source.type === PARTICIPANT_SIDE.ALLY
                  ? 'log-friendly'
                  : 'log-hostile',
              kind: 'entity',
              faction: source.type === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy',
            },
            {
              text: ` 对 ${targetNames} `,
              classStr: targets.every((t) => t.type === PARTICIPANT_SIDE.ALLY)
                ? 'log-friendly'
                : 'log-hostile',
            },
            { text: ' 使用 ' },
            skillSeg,
            { text: `${damageText}${healText}` },
          ],
          category: BATTLE_LOG_CATEGORIES.ACTION,
          meta: {
            role: 'action',
            entityId: logTarget?.id,
            hpBefore: primaryHpBefore,
            hpAfter: primaryHpAfter,
            damage: totalDamage,
            crit: isCrit,
            kill: logTarget ? !logTarget.isAlive() : false,
            skillName: skill.name || skill.id,
          },
        })

        // ponytail: 触发被动 — 攻击方 ON_HIT + 受击方 DAMAGE_TAKEN + ON_DEATH
        for (const pd of pendingDamages) {
          if (pd.damage > 0) {
            this.passiveSkillManager.triggerPassives(
              BattleTriggerPhase.ON_HIT,
              source,
              createBattleContext(battleData, {
                target: pd.target,
                sourceId: source.id,
                damage: pd.damage,
              }),
            )
            this.passiveSkillManager.triggerPassives(
              BattleTriggerPhase.DAMAGE_TAKEN,
              pd.target,
              createBattleContext(battleData, {
                target: pd.target,
                sourceId: source.id,
                damage: pd.damage,
              }),
            )
            if (!pd.target.isAlive()) {
              this.passiveSkillManager.triggerPassives(
                BattleTriggerPhase.ON_DEATH,
                pd.target,
                createBattleContext(battleData, {
                  target: source,
                  sourceId: source.id,
                  cause: EffectType.DAMAGE,
                }),
              )
              this.passiveSkillManager.triggerPassives(
                BattleTriggerPhase.ON_KILL,
                source,
                createBattleContext(battleData, {
                  target: pd.target,
                  sourceId: pd.target.id,
                  cause: EffectType.DAMAGE,
                }),
              )
            }
          }
        }
      } else if (totalDamage === 0 && totalHeal === 0) {
        // 无伤害/治疗时仍输出行动日志
        const skillId = skill.id || skill.name || ''
        LoggerProvider.logger.addBattleLog({
          turn: battleData.currentTurn,
          message: `${source.name} 对 ${targetNames} 使用 ${skill.name || skill.id}`,
          segments: [
            { text: source.name, classStr: source.type === PARTICIPANT_SIDE.ALLY ? 'log-friendly' : 'log-hostile', kind: 'entity', faction: source.type === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy' },
            { text: ` 对 ${targetNames} 使用 ` },
            { text: `【${skill.name || skillId}】`, classStr: 'log-skill' },
          ],
          category: BATTLE_LOG_CATEGORIES.ACTION,
          meta: { role: 'action', skillName: skill.name || skill.id },
        })
      }
    } catch (error) {
      LoggerProvider.logger.addDebugLog(`技能执行失败: ${skill.id}`, {
        error: error as Error,
      })
      action.type = ActionTypes.ATTACK
      action.damage = Math.floor(Math.random() * 20) + 10
      action.effects = [
        {
          type: EffectType.DAMAGE,
          value: action.damage,
          description: `${source.name} 普通攻击 (技能执行失败)`,
        },
      ]
    }

    this.passiveSkillManager.triggerPassives(
      BattleTriggerPhase.AFTER_ATTACK,
      source,
      createBattleContext(battleData, {
        target: targets[0],
        targetId: targets[0]?.id,
        damage: action.damage,
        isCritical: action.effects?.some(
          (e: BattleEffect) => e.type === EffectType.DAMAGE && e.isCritical,
        ),
      }),
    )

    this.recordBattleAction(battleData, action)
    return action
  }

  /**
   * 根据 SkillTargetConfig 解析技能的所有目标
   * ponytail: P0/AI-1 — 接受 suggestedTargetId，验证后采纳，无效则回退到 resolveSkillTargets
   */
  getSkillTargets(
    battle: BattleData,
    source: BattleEntity,
    skill: SkillConfig,
    suggestedTargetId?: string,
  ): BattleEntity[] {
    // 如果有建议目标，验证其合法性
    if (suggestedTargetId) {
      const suggested = battle.participants.get(suggestedTargetId)
      if (suggested) {
        if (
          validateTargetAgainstSelector(
            suggested,
            source,
            skill.selector,
            battle.participants,
          )
        ) {
          return [suggested]
        }
      }
      LoggerProvider.logger.addDebugLog(
        `建议目标 ${suggestedTargetId} 不满足 selector 约束，回退到自动解析`,
      )
    }
    return resolveSkillTargets(
      battle.participants,
      source,
      skill.selector,
      skill.steps,
    )
  }

  /**
   * 解析步骤级目标选择
   * 根据 step.targetType 从主目标的相邻位置中选择额外目标
   * @param battle 战斗数据
   * @param mainTarget 主目标（技能级 selector 所选）
   * @param stepTargetType 步骤目标策略（如 random_adjacent）
   * @returns 额外目标数组（为空表示无可用目标）
   */
  resolveStepTargets(
    battle: BattleData,
    mainTarget: BattleEntity,
    stepTargetType: string,
  ): BattleEntity[] {
    return resolveStepTargets(battle.participants, mainTarget, stepTargetType)
  }

  /**
   * 根据技能配置选择单个目标 ID（快捷入口，内部调用 getSkillTargets）
   */
  selectTargetForSkill(
    battle: BattleData,
    source: BattleEntity,
    skill: SkillConfig,
  ): string {
    const targets = this.getSkillTargets(battle, source, skill)
    return targets.length > 0 ? targets[0].id : ''
  }

  // ============ 普通攻击 ============

  /**
   * 构造普通攻击的技能步骤配置
   */
  buildNormalAttackStep(
    source: BattleEntity,
    targetId: string,
  ): ExtendedSkillStep {
    return {
      type: SkillStepType.DEAL_DAMAGE,
      id: 'normal_attack',
      targetId,
      damageCategory: DamageCategory.PHYSICAL,
      attackType: AttackType.NORMAL,
      criticalConfig: {
        rate:
          source.getAttribute(ATTRIBUTE_CODE.critRate) ||
          getAttributeDefaultValue(ATTRIBUTE_CODE.critRate),
        multiplier:
          source.getAttribute(ATTRIBUTE_CODE.critDamage) ||
          getAttributeDefaultValue(ATTRIBUTE_CODE.critDamage),
      },
    }
  }

  /**
   * 创建战斗动作对象
   */
  createBattleAction(
    sourceId: string,
    targetId: string,
    turnNumber: number,
  ): BattleAction {
    return BattleActionHelper.createAttack({
      sourceId,
      targetId,
      turn: turnNumber,
    })
  }

  /**
   * 生成攻击日志参数
   */
  generateAttackLogParams(
    source: BattleEntity,
    target: BattleEntity,
    turnNumber: number,
    options: { isMiss?: boolean; damage?: number; isCritical?: boolean },
  ): {
    turn: number
    message: string
    segments: import('@/shared/types/battle-log').LogSegment[]
    category: import('@/shared/types/battle-log').BattleLogCategory
  } {
    const { isMiss = false, isCritical = false } = options
    const sourcePrefix =
      source.type === PARTICIPANT_SIDE.ALLY ? '[友方]' : '[敌方]'
    const targetPrefix =
      target.type === PARTICIPANT_SIDE.ALLY ? '[友方]' : '[敌方]'

    if (isMiss) {
      return {
        turn: turnNumber,
        message: `${sourcePrefix}${source.name} → ${targetPrefix}${target.name}「普通攻击」`,
        segments: [
          { text: `${sourcePrefix}${source.name}`, classStr: source.type === PARTICIPANT_SIDE.ALLY ? 'log-friendly' : 'log-hostile', kind: 'entity', faction: source.type === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy' },
          { text: ' → ' },
          { text: `${targetPrefix}${target.name}`, classStr: target.type === PARTICIPANT_SIDE.ALLY ? 'log-friendly' : 'log-hostile', kind: 'entity', faction: target.type === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy' },
          { text: '「普通攻击」' },
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
      }
    }

    return {
      turn: turnNumber,
      message: `${sourcePrefix}${source.name} → ${targetPrefix}${target.name}「普通攻击」`,
      segments: [
        {
          text: `${sourcePrefix}${source.name}`,
          classStr:
            source.type === PARTICIPANT_SIDE.ALLY
              ? 'log-friendly'
              : 'log-hostile',
          kind: 'entity',
          faction: source.type === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy',
        },
        { text: ' → ' },
        {
          text: `${targetPrefix}${target.name}`,
          classStr:
            target.type === PARTICIPANT_SIDE.ALLY
              ? 'log-friendly'
              : 'log-hostile',
          kind: 'entity',
          faction: target.type === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy',
        },
        { text: `「普通攻击」` },
      ],
      category: isCritical
        ? BATTLE_LOG_CATEGORIES.CRIT
        : BATTLE_LOG_CATEGORIES.DAMAGE,
    }
  }

  /**
   * 对目标应用伤害并触发相关被动技能
   */
  applyDamageToTarget(
    source: BattleEntity,
    target: BattleEntity,
    damage: number,
    participants?: Map<string, BattleEntity>,
    currentTurn?: number,
  ): void {
    target.takeDamage(damage)
    // ponytail: ON_HIT 触发攻击者（命中方）的被动，DAMAGE_TAKEN 触发受击方（受伤害）的被动
    this.passiveSkillManager.triggerPassives(
      BattleTriggerPhase.ON_HIT,
      source,
      { target, sourceId: source.id, damage, participants, currentTurn },
    )
    this.passiveSkillManager.triggerPassives(
      BattleTriggerPhase.DAMAGE_TAKEN,
      target,
      {
        target: source,
        sourceId: source.id,
        damage,
        participants,
        currentTurn,
      },
    )
    if (!target.isAlive()) {
      this.passiveSkillManager.triggerPassives(
        BattleTriggerPhase.ON_DEATH,
        target,
        {
          target: source,
          sourceId: source.id,
          cause: EffectType.DAMAGE,
          participants,
          currentTurn,
        },
      )
      this.passiveSkillManager.triggerPassives(
        BattleTriggerPhase.ON_KILL,
        source,
        {
          target,
          targetId: target.id,
          cause: EffectType.DAMAGE,
          participants,
          currentTurn,
        },
      )
    }
  }

  /**
   * 处理攻击被闪避的情况
   */
  async handleMissAttack(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    turnNumber: number,
  ): Promise<void> {
    action.effects.push({
      type: EffectType.MISS,
      value: 0,
      description: `${target.name} 闪避了攻击`,
    })
    await this.animationManager.triggerMissAnimationAndWait({
      targetId: target.id,
    })

    const logParams = this.generateAttackLogParams(source, target, turnNumber, {
      isMiss: true,
    })
    LoggerProvider.logger.addBattleLog({
      turn: logParams.turn,
      message: logParams.message,
      segments: logParams.segments,
      category: logParams.category,
      meta: { role: 'action', entityId: target.id, miss: true, skillName: '普通攻击' },
    })
    LoggerProvider.logger.addDebugLog(
      `普通攻击: ${source.name} → ${target.name}，被闪避`,
    )
  }

  /**
   * 处理攻击命中的情况
   */
  async handleHitAttack(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    damageResult: { damage: number; isCritical: boolean },
    turnNumber: number,
    participants?: Map<string, BattleEntity>,
  ): Promise<void> {
    const { damage, isCritical } = damageResult
    action.damage = damage

    action.effects.push({
      type: EffectType.DAMAGE,
      value: damage,
      description: `${source.name} 普通攻击 造成 ${damage} 伤害${isCritical ? ' (暴击)' : ''}`,
    })

    // ponytail: 先播飞行动画，到达目标后再扣 HP，保证视觉同步
    await this.animationManager.triggerSkillEffectAnimation({
      sourceId: source.id,
      targetId: target.id,
      skillName: '普通攻击',
      effectType: 'attack',
      damageCategory: DamageCategory.PHYSICAL,
    })

    // NOTE: 在扣血前捕获 hpBefore，确保 HP 箭头准确
    const hpBefore = target.currentHealth

    // ponytail: 动画命中后再扣血，触发 ON_HIT/ON_DEATH 被动
    this.applyDamageToTarget(source, target, damage, participants, turnNumber)

    const hpAfter = target.currentHealth

    await this.animationManager.triggerDamageAnimationAndWait({
      targetId: target.id,
      damage,
      damageCategory: DamageCategory.PHYSICAL,
      isCritical,
      isHeal: false,
    })

    const logParams = this.generateAttackLogParams(source, target, turnNumber, {
      damage,
      isCritical,
    })
    LoggerProvider.logger.addBattleLog({
      turn: logParams.turn,
      message: logParams.message,
      segments: logParams.segments,
      category: logParams.category,
      meta: {
        role: 'action',
        entityId: target.id,
        hpBefore,
        hpAfter,
        damage,
        crit: isCritical,
        kill: !target.isAlive(),
        skillName: '普通攻击',
      },
    })
    LoggerProvider.logger.addDebugLog(
      `普通攻击: ${source.name} → ${target.name}`,
    )
  }

  /**
   * 选择并执行普通攻击
   */
  async selectAndExecuteAttack(
    battle: BattleData,
    source: BattleEntity,
    suggestedTargetId?: string,
  ): Promise<BattleAction> {
    const targetId = this.selectTarget(battle, source, suggestedTargetId)
    const target = battle.participants.get(targetId)

    if (!target) {
      LoggerProvider.logger.addDebugLog(`攻击失败: 未找到目标 ${targetId}`)
      console.error(`攻击失败: 未找到目标 ${targetId}`)
      return this.createBattleAction(
        source.id,
        source.id,
        battle.currentTurn || 1,
      )
    }

    const currentTurn = battle.currentTurn

    // 生成此攻击的 traceId（因果链根节点）
    this.traceCounter++
    const atkTraceId = `atk_${this.traceCounter}_${Date.now()}`

    // ★ 开始缓冲 BEFORE_ATTACK 的 sub 日志
    LoggerProvider.logger.beginBufferSubLogs()

    this.passiveSkillManager.triggerPassives(
      BattleTriggerPhase.BEFORE_ATTACK,
      source,
      {
        target,
        targetId,
        currentTurn: currentTurn,
        participants: battle.participants,
      },
    )

    // 创建详细记录对象用于捕获伤害拆分
    const record = createEmptyRecord(
      battle.battleId,
      source.id,
      source.name,
      'attack',
      targetId,
      target.name,
      currentTurn ?? 1,
    )

    const attackStep = this.buildNormalAttackStep(source, targetId)
    const damageResult = this.damageCalculator.calculateDamage(
      attackStep,
      source,
      target,
      record,
    )

    const action = this.createBattleAction(source.id, targetId, currentTurn)

    if (damageResult.isMiss) {
      await this.handleMissAttack(action, source, target, currentTurn)
    } else {
      await this.handleHitAttack(
        action,
        source,
        target,
        damageResult,
        currentTurn,
        battle.participants,
      )
    }

    // ★ action 日志已发射，刷出缓冲的 BEFORE_ATTACK sub 日志
    LoggerProvider.logger.flushBufferedSubLogs()

    // 回填最终伤害到记录
    record.damage = action.damage ?? 0
    record.damageSource = 'attack'
    record.message = `${source.name} 对 ${target.name} 普通攻击，造成 ${action.damage ?? 0} 伤害`
    this.battleRecorder.recordCombatRecord(battle.battleId, record)
    // ponytail: 技术调试日志 — 伤害计算链路追踪
    try {
      TraceDamageLogger.log(record, this.traceCollector, atkTraceId)
    } catch {
      // 调试日志失败绝不中断战斗
    }

    this.passiveSkillManager.triggerPassives(
      BattleTriggerPhase.AFTER_ATTACK,
      source,
      {
        target,
        targetId,
        damage: action.damage,
        isCritical: damageResult.isCritical,
        participants: battle.participants,
        currentTurn: battle.currentTurn,
      },
    )

    this.recordBattleAction(battle, action)
    return action
  }

  /**
   * 选择攻击目标
   */
  selectTarget(
    battle: BattleData,
    source: BattleEntity,
    suggestedTargetId?: string,
  ): string {
    // ponytail: P0/AI-1 — 如果建议目标是存活敌方，直接采纳
    if (suggestedTargetId) {
      const suggested = battle.participants.get(suggestedTargetId)
      if (suggested && suggested.team !== source.team && suggested.isAlive()) {
        return suggestedTargetId
      }
      LoggerProvider.logger.addDebugLog(
        `建议目标 ${suggestedTargetId} 无效（已死/非敌方/不存在），回退到随机选择`,
      )
    }
    const enemies = Array.from(battle.participants.values()).filter(
      (p) => p.id !== source.id && p.team !== source.team && p.isAlive(),
    )
    if (enemies.length === 0) return ''
    return enemies[Math.floor(Math.random() * enemies.length)].id
  }

  // ============ 工具方法 ============

  /**
   * 获取技能能量消耗
   */
  getSkillEnergyCost(skillId: string): number {
    return this.skillManager.getSkillConfig(skillId)?.energyCost ?? 0
  }

  /**
   * 添加战斗动作到记录
   */
  addBattleAction(battle: BattleData, action: BattleAction): void {
    if (battle) {
      battle.actions.push(action)
      if (battle.actions.length > 100) {
        battle.actions = battle.actions.slice(-100)
      }
    }
  }

  /**
   * 记录战斗动作
   */
  recordBattleAction(battle: BattleData, action: BattleAction): void {
    this.addBattleAction(battle, action)
    this.battleRecorder.recordAction(
      battle.battleId,
      action,
      battle.currentTurn || 1,
    )
  }

  /**
   * 执行默认行动（当AI决策失败或无效时使用）
   */
  async executeDefaultAction(
    battle: BattleData,
    participant: BattleEntity,
  ): Promise<void> {
    const enemies = Array.from(battle.participants.values())
      .filter((p) => p.team === PARTICIPANT_SIDE.ENEMY && p.isAlive())
      .map((p) => p.id)
    const characters = Array.from(battle.participants.values())
      .filter((p) => p.team === PARTICIPANT_SIDE.ALLY && p.isAlive())
      .map((p) => p.id)

    let targetId: string
    let damage: number

    if (participant.team === PARTICIPANT_SIDE.ALLY && enemies.length > 0) {
      targetId = enemies[Math.floor(Math.random() * enemies.length)]
      damage = Math.floor(Math.random() * 20) + 10
    } else if (
      participant.team === PARTICIPANT_SIDE.ENEMY &&
      characters.length > 0
    ) {
      targetId = characters[Math.floor(Math.random() * characters.length)]
      damage = Math.floor(Math.random() * 15) + 8
    } else {
      return
    }

    await this.executeAction(battle, {
      id: `action_${Date.now()}`,
      type: 'attack',
      sourceId: participant.id,
      targetId,
      damage,
      success: true,
      timestamp: Date.now(),
      turn: battle.currentTurn || 1,
      effects: [
        {
          type: EffectType.DAMAGE,
          value: damage,
          description: `${participant.name} 普通攻击 造成 ${damage} 伤害`,
        },
      ],
    })
  }

  /**
   * 执行战斗动作
   */
  async executeAction(
    battle: BattleData,
    action: BattleAction,
  ): Promise<BattleAction> {
    const source = battle.participants.get(action.sourceId)
    const target = battle.participants.get(action.targetId)

    if (!source || !target) {
      LoggerProvider.logger.addDebugLog(
        `执行动作失败: 无效的源或目标 sourceId=${action.sourceId}, targetId=${action.targetId}`,
      )
      console.error(
        `执行动作失败: 无效的源或目标 sourceId=${action.sourceId}, targetId=${action.targetId}`,
      )
      return action
    }

    if (action.type === ActionTypes.SKILL && action.skillId) {
      try {
        // ponytail: 令牌模式 — 用局部 token 替代全局 toggle
        const damageToken = new DeferredDamageToken()
        // ponytail: 主动技能执行时禁用 buffApplied 回调，避免与下方动画循环重复
        this.buffSystem.setBuffAppliedCallbackEnabled(false)
        const skillAction = this.skillManager.executeSkill(
          action.skillId,
          source,
          target,
          action.turn ?? 0,
          undefined,
          undefined,
          damageToken,
        )
        if (!skillAction.success) {
          // ponytail: early-return 路径也需恢复回调，否则后续被动触发丢失 BUFF_EFFECT 事件
          this.buffSystem.setBuffAppliedCallbackEnabled(true)
          LoggerProvider.logger.addDebugLog(
            `技能执行失败: ${action.skillId} — ${skillAction.effects[0]?.description || '未知原因'}`,
          )
          action.damage = 0
          action.heal = 0
          action.effects = skillAction.effects
          action.success = false
        } else {
          action.damage = skillAction.damage
          action.heal = skillAction.heal
          action.effects = skillAction.effects

          // ponytail: 技能释放日志
          const hasMissEffect = skillAction.effects.some(
            (effect) => effect.type === EffectType.MISS,
          )
          if (hasMissEffect) {
            await this.animationManager.triggerMissAnimationAndWait({
              targetId: target.id,
            })
          }

          for (const effect of skillAction.effects) {
            if (
              effect.type === EffectType.BUFF ||
              effect.type === EffectType.DEBUFF
            ) {
              let buffTarget = target
              if (effect.targetId === source.id) buffTarget = source
              await this.animationManager.triggerBuffEffectAndWait({
                targetId: buffTarget.id,
                buffName: effect.buffId || 'unknown',
                isPositive: effect.type === EffectType.BUFF,
              })
            }
          }

          await this.animationManager.triggerSkillEffectAnimation({
            sourceId: source.id,
            targetId: target.id,
            skillName: action.skillId,
            effectType: action.type,
            damageCategory: DamageCategory.PHYSICAL,
          })

          // ponytail: 主动技能动画循环结束，恢复 buffApplied 回调（被动触发路径需要它）
          this.buffSystem.setBuffAppliedCallbackEnabled(true)

          // NOTE: 在 applyAll 前捕获 HP 用于叙事日志
          const hpBefore = target.currentHealth

          // ponytail: 动画完成后应用延迟的伤害/治疗
          damageToken.applyAll()

          const hpAfter = target.currentHealth
          const skillId = action.skillId
          const dmgPart = (action.damage ?? 0) > 0 ? `，造成 ${action.damage} 点` : ''
          const healPart = (action.heal ?? 0) > 0 ? `，恢复 ${action.heal} 点生命` : ''
          let actionSkillSeg: ReturnType<typeof skillSegment>
          try {
            actionSkillSeg = skillSegment(skillId, this.skillManager)
          } catch {
            actionSkillSeg = { text: `【${skillId}】`, classStr: 'log-skill' }
          }
          LoggerProvider.logger.addBattleLog({
            turn: action.turn ?? 0,
            message: `${source.name} 对 ${target.name} 使用 ${skillId}${dmgPart}${healPart}`,
            segments: [
              {
                text: source.name,
                classStr:
                  source.type === PARTICIPANT_SIDE.ALLY
                    ? 'log-friendly'
                    : 'log-hostile',
                kind: 'entity',
                faction: source.type === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy',
              },
              { text: ' 对 ' },
              {
                text: target.name,
                classStr:
                  target.type === PARTICIPANT_SIDE.ALLY
                    ? 'log-friendly'
                    : 'log-hostile',
                kind: 'entity',
                faction: target.type === PARTICIPANT_SIDE.ALLY ? 'ally' : 'enemy',
              },
              { text: ' 使用 ' },
              actionSkillSeg,
              { text: `${dmgPart}${healPart}` },
            ],
            category: BATTLE_LOG_CATEGORIES.ACTION,
            meta: {
              role: 'action',
              entityId: target.id,
              hpBefore,
              hpAfter,
              damage: action.damage ?? 0,
              crit: skillAction.isCrit ?? false,
              kill: !target.isAlive(),
              skillName: skillId,
            },
          })
          // ★ action 日志已发射，刷出缓冲的 BEFORE_ATTACK sub 日志
          LoggerProvider.logger.flushBufferedSubLogs()
          // ponytail: 使用 token 的实际扣血值而非 action.damage 判断被动触发，减少发散窗口
          const actualDamage = damageToken.getTotalDamage()
          if (actualDamage > 0) {
            this.passiveSkillManager.triggerPassives(
              BattleTriggerPhase.ON_HIT,
              source,
              {
                target,
                sourceId: source.id,
                damage: actualDamage,
                participants: battle.participants,
                currentTurn: battle.currentTurn,
              },
            )
            this.passiveSkillManager.triggerPassives(
              BattleTriggerPhase.DAMAGE_TAKEN,
              target,
              {
                target: source,
                sourceId: source.id,
                damage: actualDamage,
                participants: battle.participants,
                currentTurn: battle.currentTurn,
              },
            )
            if (!target.isAlive()) {
              // ponytail: P1/PERF-1 — 死亡时清理 comboStates
              this.skillManager.getExecutor().cleanupComboState(target.id)
              this.passiveSkillManager.triggerPassives(
                BattleTriggerPhase.ON_DEATH,
                target,
                {
                  target: source,
                  sourceId: source.id,
                  cause: EffectType.DAMAGE,
                  participants: battle.participants,
                  currentTurn: battle.currentTurn,
                },
              )
            }
          }
          // ponytail: token.applyAll() 已经处理了所有伤害和治疗，不需要额外调用 heal

          // ponytail: 技能伤害/治疗数值动画（在 HP 扣减之后播放，与 handleHitAttack 时序一致）
          if ((action.damage ?? 0) > 0) {
            const isCrit = skillAction.effects.some(
              (e: BattleEffect) => e.type === EffectType.DAMAGE && e.isCritical,
            )
            await this.animationManager.triggerDamageAnimationAndWait({
              targetId: target.id,
              damage: action.damage ?? 0,
              damageCategory: DamageCategory.PHYSICAL,
              isCritical: isCrit,
              isHeal: false,
            })
          }
          if ((action.heal ?? 0) > 0) {
            await this.animationManager.triggerDamageAnimationAndWait({
              targetId: target.id,
              damage: action.heal ?? 0,
              damageCategory: DamageCategory.PHYSICAL,
              isCritical: false,
              isHeal: true,
            })
          }
        }
      } catch (error) {
        // ponytail: catch 路径也需恢复回调，否则后续被动触发丢失 BUFF_EFFECT 事件
        this.buffSystem.setBuffAppliedCallbackEnabled(true)
        // ★ 出错时也刷出缓冲的 sub 日志，防止内存泄漏
        LoggerProvider.logger.flushBufferedSubLogs()
        LoggerProvider.logger.addDebugLog(`技能执行失败: ${action.skillId}`, {
          error: error as Error,
        })
        action.type = ActionTypes.ATTACK
        action.damage = Math.floor(Math.random() * 20) + 10
        action.effects = [
          {
            type: EffectType.DAMAGE,
            value: action.damage,
            description: `${source.name} 普通攻击 (技能执行失败)`,
          },
        ]
      }
    }

    // ponytail: skill actions already apply damage+heal inside SkillExecutor,
    // so only apply raw damage/heal for non-skill actions (e.g. fallback attack).
    if (action.type !== ActionTypes.SKILL) {
      if (action.damage && action.damage > 0) {
        // ponytail: 先播伤害数值动画，再扣 HP，保证视觉同步
        await this.animationManager.triggerDamageAnimationAndWait({
          targetId: target.id,
          damage: action.damage,
          damageCategory: DamageCategory.PHYSICAL,
          isCritical: false,
          isHeal: false,
        })

        const actualDamage = target.takeDamage(action.damage)
        action.damage = actualDamage

        // ponytail: ON_HIT 触发攻击方，DAMAGE_TAKEN 触发受击方
        this.passiveSkillManager.triggerPassives(
          BattleTriggerPhase.ON_HIT,
          source,
          {
            target,
            sourceId: source.id,
            damage: actualDamage,
            participants: battle.participants,
            currentTurn: battle.currentTurn,
          },
        )
        this.passiveSkillManager.triggerPassives(
          BattleTriggerPhase.DAMAGE_TAKEN,
          target,
          {
            target: source,
            sourceId: source.id,
            damage: actualDamage,
            participants: battle.participants,
            currentTurn: battle.currentTurn,
          },
        )
        if (!target.isAlive()) {
          // ponytail: P1/PERF-1 — 死亡时清理 comboStates
          this.skillManager.getExecutor().cleanupComboState(target.id)
          this.passiveSkillManager.triggerPassives(
            BattleTriggerPhase.ON_DEATH,
            target,
            {
              target: source,
              sourceId: source.id,
              cause: EffectType.DAMAGE,
              participants: battle.participants,
              currentTurn: battle.currentTurn,
            },
          )
          this.passiveSkillManager.triggerPassives(
            BattleTriggerPhase.ON_KILL,
            source,
            {
              target,
              targetId: target.id,
              cause: EffectType.DAMAGE,
              participants: battle.participants,
              currentTurn: battle.currentTurn,
            },
          )
        }

        if (action.heal && action.heal > 0) {
          await this.animationManager.triggerDamageAnimationAndWait({
            targetId: target.id,
            damage: action.heal,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: false,
            isHeal: true,
          })
          const actualHeal = target.heal(action.heal)
          action.heal = actualHeal
        }
      }
    }
    this.recordBattleAction(battle, action)
    source.afterAction()
    return action
  }
}
