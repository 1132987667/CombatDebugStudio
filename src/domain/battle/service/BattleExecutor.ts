/**
 * 文件: BattleExecutor.ts
 * 功能: 战斗执行引擎 — 负责参与者行动、技能执行、攻击处理等运行时逻辑
 */
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import {
  entitySegment,
  projectAttackLog,
  projectSkillLog,
  valueSegment,
} from '@/domain/battle/logs/BattleLogProjector'
import { convertToBattleState } from '@/domain/battle/aggregate/BattleState'
import type { SkillManager } from '@/domain/skill/SkillManager'
import type { DamageCalculator } from '@/domain/skill/DamageCalculator'
import type { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import {
  BattleTriggerPhase,
  createPassiveContext,
  createStepContext,
} from '@/domain/battle/type/types'
import type { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import type { BattleAnimationManager } from '@/domain/battle/BattleAnimationManager'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import {
  BATTLE_LOG_CATEGORIES,
  LogLevel,
  type LogSegment,
} from '@/shared/types/battle-log'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import { TraceDamageLogger } from '@/domain/battle/logs/TraceDamageLogger'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'
import { createTraceEvent, TraceLevel, TracePhase, type TraceScope } from '@/shared/types/trace-event'
import { DeferredDamageToken } from '@/domain/skill/DeferredDamageToken'
import type { ThreatManager } from '@/domain/battle/service/ThreatManager'
import type { ReviveTracker } from '@/domain/battle/service/ReviveTracker'
import type { ReviveStepParams } from '@/domain/skill/types'
import {
  BalancedAIPriorityStrategy,
  type AIPriorityStrategy,
} from '@/domain/battle/ai/AIPriorityStrategy'

import {
  BattleActionHelper,
  ParticipantSide,
  ActionTypes,
} from '@/domain/battle/type/types'
import {
  type SkillConfig,
  type ExtendedSkillStep,
  SkillType,
  AttackType,
  DamageCategory,
  EffectType,
  StepEffectType,
  convertSkillConfigToSkill,
  type BuffConfigLookup,
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
  PassiveTriggerContext,
  TriggerEventContext,
} from '@/domain/battle/type/types'
import {
  ATTRIBUTE_CODE,
  getAttrDv,
} from '@/domain/attribute/types'
import {
  createEmptyRecord,
  type CombatRecord,
} from '@/domain/battle/combat-record'

/**
 * 目标结算结果 —— 仅用于日志渲染的局部视图模型（ViewModel）。
 * 严禁在此结构中塞入任何非日志渲染所需的业务字段（如 buffId, skillStepType）。
 * 业务持久化请使用 CombatRecord，本结构随方法作用域结束自动销毁。
 */
interface TargetResult {
  target: BattleEntity
  hpBefore: number
  hpAfter: number
  /** token 记录值（settleDamage 返回值只用于 overkill 记录，不覆盖此值） */
  damage: number
  heal: number
  /** 减免前原始伤害（action 日志"造成 X 点伤害"的口径） */
  rawDamage: number
}

/**
 * 行动表现清单 —— 用于解耦"伤害结算"与"日志拼装"的局部数据契约。
 * 仅在 selectAndExecuteSkill / selectAndExecuteAttack 内部流转，不跨越方法边界。
 */
interface ActionManifest {
  type: 'skill' | 'attack'
  source: BattleEntity
  targets: BattleEntity[]
  skillName: string
  skillId?: string
  isMiss: boolean
  isCrit: boolean
  /** action 级伤害/治疗总量（header 文本与 category 用；纯治疗路径 results 为空但 totalHeal > 0） */
  totalDamage: number
  totalHeal: number
  results: TargetResult[]
}

/**
 * 战斗执行器
 * 封装参与者的行动决策、技能/攻击执行、伤害/治疗应用、日志记录等运行时逻辑。
 */
export class BattleExecutor {
  private readonly defaultStrategy: AIPriorityStrategy =
    new BalancedAIPriorityStrategy()

  /** 树状调试日志收集器（可选） */
  private tracePort?: IDebugTracePort
  /** P1: 因果链序号（corr_${turn}_${seq} 命名空间，文档 §4.5.3） */
  private scopeSeq = 0
  private traceCounter = 0

  /** 当前行动顺序号（用于记录 / UI 展示） */
  private currentActionOrder = 0

  /** 设置当前行动顺序号 */
  setActionOrder(order: number): void {
    this.currentActionOrder = order
  }

  /** 获取当前行动顺序号 */
  getActionOrder(): number {
    return this.currentActionOrder
  }
  setTracePort(port: IDebugTracePort | null): void {
    this.tracePort = port ?? undefined
  }

  /** 待处理的死亡事件（延迟结算，复活机制用） */
  private pendingDeaths: Array<{
    deadId: string
    killerId: string
    battle: BattleData
  }> = []

  /** 提取并清空待处理的死亡事件 */
  drainPendingDeaths(): Array<{
    deadId: string
    killerId: string
    battle: BattleData
  }> {
    const deaths = [...this.pendingDeaths]
    this.pendingDeaths = []
    return deaths
  }

  /** 重置跨回合/跨战斗的可变状态。由 BattleSystem.resetBattle() 调用。 */
  reset(): void {
    this.pendingDeaths = []
    this.currentActionOrder = 0
  }

  constructor(
    private readonly skillManager: SkillManager,
    private readonly damageCalculator: DamageCalculator,
    private readonly passiveSkillManager: PassiveSkillManager,
    private readonly battleRecorder: BattleRecorder,
    private readonly animationManager: BattleAnimationManager,
    private readonly buffSystem: BuffSystem,
    private readonly reviveTracker?: ReviveTracker,
    private readonly threatManager?: ThreatManager,
    private readonly formationRowLookup?: (side: ParticipantSide, seatIndex: number) => 'front' | 'back' | null,
    private readonly frontProtectionLookup?: (side: ParticipantSide) => boolean,
  ) {}

  /**
   * 检查参与者是否有控制类Buff
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
    // P1: 根 scope — 一次行动一个因果链（文档 §4.5）。
    //     AI_DECISION 挂根（base），ACTION_EXECUTION 与子事件挂 actionScope（parentId=ACTION_EXECUTION 事件 id）
    let baseScope: TraceScope | undefined
    let actionScope: TraceScope | undefined
    if (this.tracePort) {
      const base = this.tracePort.beginScope(
        `corr_${battle.currentTurn ?? 1}_${++this.scopeSeq}`,
        TracePhase.ACTION_EXECUTION,
        { battleId: battle.battleId, turn: battle.currentTurn ?? 1 },
      )
      baseScope = base
      const execId = this.tracePort.isEnabled(TracePhase.ACTION_EXECUTION)
        ? this.tracePort.emit(
            createTraceEvent({
              correlationId: base.correlationId,
              parentId: base.parentId,
              phase: TracePhase.ACTION_EXECUTION,
              battleId: battle.battleId,
              turn: battle.currentTurn ?? 1,
              sourceId: participant.id,
              level: TraceLevel.DEBUG,
              summary: `${participant.name} 执行行动`,
              payload: { controlMode: participant.controlMode },
            }),
          )
        : undefined
      actionScope = base.child(TracePhase.ACTION_EXECUTION, execId)
    }

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
      const controlledSegs = [
        this.buildEntitySegment(participant),
        { text: ' 被控制，无法行动' },
      ]
      LoggerProvider.logger.addBattleLog({
        turn: battle.currentTurn || 1,
        message: controlledSegs.map((s) => s.text).join(''),
        segments: controlledSegs,
        category: BATTLE_LOG_CATEGORIES.STATUS,
      })
      return
    }

    switch (participant.controlMode) {
      case 'AI': {
        const aiInstance = battle.aiInstances?.get(participant.id)
        if (aiInstance) {
          const decision = aiInstance.makeDecision(
            convertToBattleState(battle),
            participant,
            baseScope,
          )
          //  木人/训练靶子：noAttack 跳过行动（AI 返回 skip 决策）
          if (decision.type === ActionTypes.SKIP) {
            const idleSegs = [
              this.buildEntitySegment(participant),
              { text: ' 未行动' },
            ]
            LoggerProvider.logger.addBattleLog({
              turn: battle.currentTurn || 1,
              message: idleSegs.map((s) => s.text).join(''),
              segments: idleSegs,
              category: BATTLE_LOG_CATEGORIES.STATUS,
            })
            return
          }
          const suggestedTargetId = decision.targetId
          if (decision.type === 'skill' && decision.skillId) {
            const skill = this.skillManager.getSkillConfig(decision.skillId)
            if (skill) {
              //  拦截普通攻击，强制走普攻路径，避免日志格式不一致
              if (this.isNormalAttackSkill(skill)) {
                await this.selectAndExecuteAttack(
                  battle,
                  participant,
                  suggestedTargetId,
                  actionScope,
                )
              } else {
                await this.selectAndExecuteSkill(
                  battle,
                  participant,
                  skill,
                  suggestedTargetId,
                  actionScope,
                )
              }
            } else {
              await this.selectAndExecuteAttack(
                battle,
                participant,
                suggestedTargetId,
                actionScope,
              )
            }
          } else {
            await this.selectAndExecuteAttack(
              battle,
              participant,
              suggestedTargetId,
              actionScope,
            )
          }
        } else {
          // ponytail: 有 AI 标志但无实例，降级为 AUTO
        await this.autoDecision(battle, participant, actionScope)
        }
        break
      }
      case 'AUTO':
        await this.autoDecision(battle, participant, actionScope)
        break
      case 'MANUAL':
        // ponytail: 玩家手操，由 Store/UI 直接驱动
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
    scope?: TraceScope,
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
      // Buff 极性由已解析配置显式查询（AI 技能标记不依赖 ID 前缀）
      const buffLookup: BuffConfigLookup = (buffId) =>
        this.buffSystem.getScriptRegistry().getResolvedBuffConfig(buffId)?.polarity
      const skills = availableSkills
        .map((id) => this.skillManager.getSkillConfig(id))
        .filter(Boolean)
        .map((c) => convertSkillConfigToSkill(c!, undefined, buffLookup))
      const bestSkillId = this.defaultStrategy.selectBestSkill(
        skills,
        participant,
        convertToBattleState(battle),
      )
      if (bestSkillId) {
        const skill = this.skillManager.getSkillConfig(bestSkillId)
        if (skill) {
          //  拦截普通攻击，强制走普攻路径
          if (this.isNormalAttackSkill(skill)) {
            await this.selectAndExecuteAttack(battle, participant, undefined, scope)
            return
          }
          await this.selectAndExecuteSkill(
            battle,
            participant,
            skill,
            undefined,
            scope,
          )
          return
        }
      }
      // fallback: 取第一个可用技能
      const skillId = availableSkills[0]
      const skill = this.skillManager.getSkillConfig(skillId)
      if (skill) {
        //  拦截普通攻击，强制走普攻路径
        if (this.isNormalAttackSkill(skill)) {
          await this.selectAndExecuteAttack(battle, participant, undefined, scope)
          return
        }
        await this.selectAndExecuteSkill(
          battle,
          participant,
          skill,
          undefined,
          scope,
        )
        return
      }
    }

    await this.selectAndExecuteAttack(battle, participant, undefined, scope)
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
    scope?: TraceScope,
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
        { level: LogLevel.WARN },
      )
      return this.selectAndExecuteAttack(battleData, source)
    }

    action.targetId = targets[0].id

    // 用于收集每次技能执行的详细记录
    const records: CombatRecord[] = []
    const overkillMap = new Map<string, number>()

    try {
      //  开始缓冲 BEFORE_ATTACK 的 sub 日志
      LoggerProvider.logger.beginBufferSubLogs()

      this.passiveSkillManager.triggerPassives(
        source,
        createPassiveContext(BattleTriggerPhase.BEFORE_ATTACK, battleData, {
          target: targets[0],
          targetId: targets[0]?.id,
          trace: scope,
          parentTraceId: scope?.parentId,
        }),
      )
      // 收集 BEFORE_ATTACK 被动触发记录（将在技能执行时写入每个 CombatRecord）
      const prePassiveRecords = this.passiveSkillManager.drainLastTriggeredPassives()
      // ponytail: 启用延迟伤害令牌 — 技能执行只记录数值不实际扣血
      const damageToken = new DeferredDamageToken()

      let totalDamage = 0
      let totalHeal = 0
      const allEffects: BattleEffect[] = []
      const manifest: ActionManifest = {
        type: 'skill',
        source,
        targets,
        skillName: skill.name || skill.id,
        skillId: skill.id,
        isMiss: false,
        isCrit: false,
        totalDamage: 0,
        totalHeal: 0,
        results: [],
      }

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
        // 填充 BEFORE_ATTACK 被动触发上下文
        if (prePassiveRecords.length > 0) {
          record.actionContext = { prePassives: prePassiveRecords }
        }

        const skillAction = this.skillManager.executeSkill(
          skill.id,
          source,
          target,
          battleData.currentTurn || 1,
          record,
          (stepTargetType, mainTarget) =>
            this.resolveStepTargets(battleData, mainTarget, stepTargetType),
          damageToken,
          scope,
        )
        if (!skillAction.success) {
          LoggerProvider.logger.addDebugLog(
            `技能执行失败: ${skill.id}，跳过目标 ${target.id} — ${skillAction.effects[0]?.description || '未知原因'}`,
            { level: LogLevel.WARN },
          )
          continue
        }

        // 回填记录
        record.damage = skillAction.damage ?? 0
        record.message = `${source.name} 对 ${target.name} 使用 ${skill.name || skill.id}，造成 ${skillAction.damage ?? 0} 伤害`
        records.push(record)

        totalDamage += skillAction.damage ?? 0
        totalHeal += skillAction.heal ?? 0
        allEffects.push(...skillAction.effects)
      }

      // 将所有详细记录存入 BattleRecorder
      for (const record of records) {
        record.damageSource = 'skill'
        record.actionOrder = this.getActionOrder()
        const recordOverkill = overkillMap.get(record.targetId)
        if (recordOverkill && recordOverkill > 0) record.overkill = recordOverkill
        this.battleRecorder.recordCombatRecord(battleData.battleId, record)
        // ponytail: 技术调试日志 — 技能伤害计算链路追踪
        try {
          TraceDamageLogger.log(record, this.tracePort, scope?.correlationId, scope?.parentId)
        } catch {
          // 调试日志失败绝不中断战斗
        }
      }

      action.damage = totalDamage
      action.heal = totalHeal
      action.effects = allEffects
      manifest.totalDamage = totalDamage
      manifest.totalHeal = totalHeal

      // NOTE: 固定预算模型 — 伤害/治疗走飞行→命中，治疗单独走直接命中
      if (targets.length > 0 && (totalDamage > 0 || totalHeal > 0)) {
        const primaryTarget = targets[0]
        const isCrit = allEffects.some(
          (e: BattleEffect) => e.type === EffectType.DAMAGE && e.isCritical,
        )
        manifest.isCrit = isCrit

        if (totalDamage > 0) {
          // 攻击/伤害技能 → 飞行（0→50%T）+ 命中（50%→100%T）
          await this.animationManager.triggerFlightPhaseAndWait({
            sourceId: source.id,
            targetId: primaryTarget.id,
            skillName: skill.name || skill.id,
            effectType: action.type,
            damageCategory: DamageCategory.PHYSICAL,
          })

          // 命中瞬间（50%T）：统一应用所有延迟伤害，统一走 settleDamage
          // NOTE: 先按 target.id 聚合 entries，确保多步骤技能对同一目标只触发一次 ON_HIT/DAMAGE_TAKEN
          const resultMap = new Map<string, TargetResult>()
          for (const entry of damageToken.getEntries()) {
            if (!entry.target.isAlive()) continue
            const existing = resultMap.get(entry.target.id)
            if (existing) {
              existing.damage += entry.damage
              existing.rawDamage += entry.rawDamage
              existing.heal += entry.heal
              existing.hpAfter = entry.target.currentHealth
            } else {
              resultMap.set(entry.target.id, {
                target: entry.target,
                damage: entry.damage,
                rawDamage: entry.rawDamage,
                heal: entry.heal,
                hpBefore: entry.target.currentHealth,
                hpAfter: entry.target.currentHealth,
              })
            }
          }
          // 按目标聚合后，每个目标调用一次 settleDamage
          manifest.results.length = 0
          for (const r of resultMap.values()) {
            if (r.damage > 0) {
              const actualDamage = this.settleDamage(source, r.target, r.damage, r.rawDamage, isCrit, battleData)
              overkillMap.set(r.target.id, Math.max(0, actualDamage - r.hpBefore))
            }
            if (r.heal > 0) {
              r.target.heal(r.heal)
            }
            r.hpAfter = r.target.currentHealth
            manifest.results.push(r)
          }
          damageToken.clear()

          await this.animationManager.triggerImpactPhaseAndWait({
            targetId: primaryTarget.id,
            damage: totalDamage,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: isCrit,
            isHeal: false,
          })
        } else if (totalHeal > 0) {
          // 治疗技能 → 直接命中（无飞行，完整 T）
          damageToken.applyAll()

          await this.animationManager.triggerDirectImpactAndWait({
            targetId: primaryTarget.id,
            damage: totalHeal,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: false,
            isHeal: true,
          })
        }

        // NOTE: 扣血后捕获 气血，构建叙事日志（emitSkillLog 按 action → 缓冲 sub → result 顺序发射）
        this.emitSkillLog(battleData, manifest)

        // settleDamage 内部已处理：ON_HIT/DAMAGE_TAKEN 被动 + pendingDeaths（B1 修复：ON_DEATH/ON_KILL 改由 runEndConditionCheck 延迟触发）
      } else if (totalDamage === 0 && totalHeal === 0) {
        // 无伤害/治疗时仍输出行动日志
        this.emitSkillLog(battleData, manifest)
      }
    } catch (error) {
      //  catch 路径也需刷出缓冲的 sub 日志，防止内存泄漏
      LoggerProvider.logger.flushBufferedSubLogs()
      //  异常兜底：输出用户可见的降级警告，防止日志静默丢失（风险点 3 修复）
      const warnSegs: LogSegment[] = [
        this.buildEntitySegment(source),
        { text: ' 尝试使用 ' },
        { text: `【${skill.name || skill.id}】`, classStr: 'log-skill' },
        { text: ' 时发生异常，降级为普通攻击', classStr: 'log-info' },
      ]
      LoggerProvider.logger.addBattleLog({
        turn: battleData.currentTurn,
        message: warnSegs.map((s) => s.text).join(''),
        segments: warnSegs,
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'action', skillName: skill.name || skill.id },
      })
      LoggerProvider.logger.addDebugLog(`技能执行失败: ${skill.id}`, {
        level: LogLevel.ERROR,
        error: error as Error,
      })
      action.type = ActionTypes.ATTACK
      action.damage = battleData.rng.nextInt(10, 29)
      action.effects = [
        {
          type: EffectType.DAMAGE,
          value: action.damage,
          description: `${source.name} 普通攻击 (技能执行失败)`,
        },
      ]
    }

    //  复活结算：SkillExecutor.executeRevive 已通过 action.extra 标记，由这里统一调用（修复 R2）
    if (action.extra?.revivedEntityId && this.reviveTracker) {
      const revivedId = action.extra.revivedEntityId as string
      const reviveParams = action.extra.reviveParams as ReviveStepParams
      const revived = battleData.participants.get(revivedId)
      if (revived?.isAlive()) {
        this.reviveTracker.recordRevive(revivedId, reviveParams.cooldown ?? 0)
        // 复活 trace：lethalMark 会把目标 alive 标死，无复活事件则战报始终显示阵亡，
        // 胜负边际（存活数/剩余血量%）失真（见 unified-summary.ts 存活约定）
        if (this.tracePort?.isEnabled(TracePhase.BATTLE_LIFECYCLE)) {
          this.tracePort.emit(
            createTraceEvent({
              correlationId: scope?.correlationId ?? `revive_${battleData.currentTurn ?? 1}_${revivedId}`,
              phase: TracePhase.BATTLE_LIFECYCLE,
              parentId: scope?.parentId,
              battleId: battleData.battleId,
              turn: battleData.currentTurn ?? 1,
              targetId: revivedId,
              level: TraceLevel.INFO,
              summary: `${revived.name} 被复活，恢复 ${revived.currentHealth} 气血`,
              payload: { action: 'revive', hp: revived.currentHealth },
            }),
          )
        }
        this.passiveSkillManager.triggerPassives(
          revived,
          createPassiveContext(BattleTriggerPhase.ON_REVIVE, battleData, {
            sourceId: action.sourceId,
          }),
        )
      }
    }

    this.passiveSkillManager.triggerPassives(
      source,
      createPassiveContext(BattleTriggerPhase.AFTER_ATTACK, battleData, {
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
        { level: LogLevel.WARN },
      )
    }
    return resolveSkillTargets(
      battle.participants,
      source,
      skill.selector,
      skill.steps,
      this.threatManager,
      this.formationRowLookup,
      this.frontProtectionLookup,
      (e) => this.buffSystem.hasBuffWithTag(e.id, 'taunt'),
      battle.rng,
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
    return resolveStepTargets(battle.participants, mainTarget, stepTargetType, battle.rng)
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

  /**  识别「伪装成技能的普通攻击」
   *  数据契约：技能配置显式声明 isNormalAttack，替代名称/结构启发式猜测
   */
  private isNormalAttackSkill(skill: SkillConfig): boolean {
    return skill?.isNormalAttack === true
  }

  // ============ 普通攻击 ============

  /**
   * 构造普通攻击的技能步骤配置
   * NOTE: 此步骤不走 SkillExecutor.executeStep（直接传入 damageCalculator.calculateDamage），
   *       因此 type 字段仅用于识别，不参与 switch 调度。值使用 StepEffectType.DEAL_DAMAGE
   *       而非 EffectType.DAMAGE 以满足 SkillStep.type 的类型约束。
   */
  buildNormalAttackStep(
    source: BattleEntity,
    targetId: string,
  ): ExtendedSkillStep {
    return {
      type: StepEffectType.DEAL_DAMAGE,
      id: 'normal_attack',
      targetId,
      damageCategory: DamageCategory.PHYSICAL,
      attackType: AttackType.NORMAL,
      criticalConfig: {
        rate:
          source.getAttribute(ATTRIBUTE_CODE.critRate) ||
          getAttrDv(ATTRIBUTE_CODE.critRate),
        multiplier:
          source.getAttribute(ATTRIBUTE_CODE.critDamage) ||
          getAttrDv(ATTRIBUTE_CODE.critDamage),
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
   * 构建带阵营前缀和着色的实体片段（委托 BattleLogProjector 单一实现）
   */
  private buildEntitySegment(
    entity: BattleEntity,
    isSelf: boolean = false,
  ): LogSegment {
    return entitySegment(entity, isSelf)
  }

  /**
   * 构建带颜色的数值片段（伤害/治疗）（委托 BattleLogProjector 单一实现）
   */
  private buildValueSegment(
    value: number,
    type: 'damage' | 'heal',
  ): LogSegment {
    return valueSegment(value, type)
  }

  /**
   * 统一发射技能日志 — 顺序：action header → 缓冲的 BEFORE_ATTACK sub 日志 → 各目标 result sub
   * 拼装委托 BattleLogProjector（SSOT：攻击/技能日志从事件投影）
   */
  private emitSkillLog(battle: BattleData, m: ActionManifest): void {
    const projected = projectSkillLog(
      { ...m, skillLookup: this.skillManager },
      battle.currentTurn,
    )

    LoggerProvider.logger.addBattleLog({
      turn: battle.currentTurn,
      ...projected.action,
    })

    //  刷出缓冲的 BEFORE_ATTACK sub 日志
    LoggerProvider.logger.flushBufferedSubLogs()

    //  为每个目标输出 result sub 日志
    for (const sub of projected.subs) {
      LoggerProvider.logger.addBattleLog({
        turn: battle.currentTurn,
        ...sub,
      })
    }
  }

  /**
   * 统一发射普通攻击日志 — miss 或 hit（action + result sub）
   * 拼装委托 BattleLogProjector（SSOT）
   */
  private emitAttackLog(battle: BattleData, m: ActionManifest): void {
    const projected = projectAttackLog(m, battle.currentTurn)

    LoggerProvider.logger.addBattleLog({
      turn: battle.currentTurn,
      ...projected.action,
    })

    // 闪避/受伤结果作为 Sub 节点（缓冲期内入列，flush 后排在主日志之后）
    for (const sub of projected.subs) {
      LoggerProvider.logger.addBattleLog({
        turn: battle.currentTurn,
        ...sub,
      })
    }
  }

  /**
   * 伤害结算 — 所有伤害路径的唯一执行入口
   *
   * 不变量序列（调用方不可重排）：扣血 → TriggerEventBus(DAMAGE_TAKEN) → 仇恨 → 被动(ON_HIT/DAMAGE_TAKEN) → pendingDeaths
   * 调用方负责：动画编排、日志、CombatRecord
   *
   * @returns 实际扣除的 HP（经过护盾/能量吸收后），0 表示完全吸收
   */
  settleDamage(
    source: BattleEntity | null,
    target: BattleEntity,
    finalDamage: number,
    rawDamage: number,
    isCritical: boolean,
    battle: BattleData,
    deferHitPassives = false,
  ): number {
    // 1. 扣血（内部处理护盾吸收、背水护甲能量抵扣）
    const actualDamage = target.takeDamage(finalDamage)
    if (actualDamage <= 0) return 0

    // 2. 向 TriggerEventBus 发射 DAMAGE_TAKEN（驱动反伤/荆棘等 Buff 触发器）
    const eventBus = this.buffSystem.getEventBus()
    eventBus.emit(BattleTriggerPhase.DAMAGE_TAKEN, {
      phase: BattleTriggerPhase.DAMAGE_TAKEN,
      sourceId: source?.id ?? '',
      targetId: target.id,
      value: actualDamage,
      currentTurn: battle.currentTurn,
      extra: { damage: actualDamage, rawDamage, isCritical },
    } as TriggerEventContext)

    // 3. 仇恨记录（无来源时跳过）
    if (this.threatManager && source) {
      const targetHasTaunt = this.buffSystem.hasBuffWithTag(target.id, 'taunt')
      this.threatManager.recordThreat(source.id, target.id, actualDamage, targetHasTaunt)
    }

    // 4. 被动触发（ON_HIT 仅当有来源时触发）
    // NOTE: deferHitPassives 时由调用方在攻击日志（emitAttackLog/emitSkillLog）之后
    //       调用 triggerHitPassives，保证被动效果显示在"受到伤害"结算之后。
    if (!deferHitPassives) {
      this.triggerHitPassives(source, target, actualDamage, battle)
    }

    // 5. 死亡 → pendingDeaths（延迟结算，兼容复活机制）
    // NOTE: 击杀 trace 不在此发出——pendingDeaths 延迟结算，目标可能被复活（ReviveTracker）；
    //       最终确认死亡在 BattleSystem.runEndConditionCheck 统一补发（见 battle 死亡分支）。
    if (!target.isAlive()) {
      this.skillManager.getExecutor().cleanupComboState(target.id)
      this.skillManager.getExecutor().cleanupRotatingState(target.id)
      this.pendingDeaths.push({
        deadId: target.id,
        killerId: source?.id ?? 'system',
        battle,
      })
    }

    return actualDamage
  }

  /**
   * 攻击命中后的被动触发（ON_HIT 来源 + DAMAGE_TAKEN 目标）
   * 从 settleDamage 抽出，供日志发射后再调用以维持"受到伤害 → 被动"的显示顺序。
   */
  private triggerHitPassives(
    source: BattleEntity | null,
    target: BattleEntity,
    actualDamage: number,
    battle: BattleData,
  ): void {
    if (source) {
      this.passiveSkillManager.triggerPassives(
        source,
        createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
          target, sourceId: source.id, damage: actualDamage,
        }),
      )
    }
    this.passiveSkillManager.triggerPassives(
      target,
      createPassiveContext(BattleTriggerPhase.DAMAGE_TAKEN, battle, {
        target: source ?? target,
        sourceId: source?.id ?? '',
        damage: actualDamage,
      }),
    )
  }

  /**
   * 处理攻击被闪避的情况
   */
  async handleMissAttack(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    battle: BattleData,
  ): Promise<void> {
    action.effects.push({
      type: EffectType.MISS,
      value: 0,
      description: `${target.name} 闪避了攻击`,
    })

    // 飞行阶段（0→50%T）：与命中一致的前摇
    await this.animationManager.triggerFlightPhaseAndWait({
      sourceId: source.id,
      targetId: target.id,
      skillName: '普通攻击',
      effectType: 'attack',
      damageCategory: DamageCategory.PHYSICAL,
    })

    // 命中阶段（50%→100%T）：显示"闪避"
    await this.animationManager.triggerMissImpactAndWait({
      targetId: target.id,
    })

    this.emitAttackLog(battle, {
      type: 'attack',
      source,
      targets: [target],
      skillName: '普通攻击',
      isMiss: true,
      isCrit: false,
      totalDamage: 0,
      totalHeal: 0,
      results: [],
    })

    // 闪避事件（供战报判定统计；phase 未开启时零开销）
    if (this.tracePort?.isEnabled(TracePhase.DAMAGE_CALCULATION)) {
      this.tracePort.emit(
        createTraceEvent({
          correlationId: `dodge_${battle.currentTurn ?? 1}_${target.id}`,
          phase: TracePhase.DAMAGE_CALCULATION,
          battleId: battle.battleId,
          turn: battle.currentTurn ?? 1,
          sourceId: source.id,
          targetId: target.id,
          level: TraceLevel.DEBUG,
          summary: `${target.name} 闪避了 ${source.name} 的攻击`,
          payload: { result: 0, dodge: true },
        }),
      )
    }

    // 闪避后触发 DODGE 被动技能（闪避者作为触发者）
    this.passiveSkillManager.triggerPassives(
      target,
      createPassiveContext(BattleTriggerPhase.DODGE, battle, {
        sourceId: target.id,
        targetId: source.id,
        damage: 0,
      }),
    )
  }

  /**
   * 处理攻击命中的情况
   */
  async handleHitAttack(
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    damageResult: { damage: number; isCritical: boolean; rawDamage: number },
    battle: BattleData,
    record?: CombatRecord,
  ): Promise<void> {
    const { damage, isCritical, rawDamage } = damageResult
    action.damage = damage

    action.effects.push({
      type: EffectType.DAMAGE,
      value: damage,
      description: `${source.name} 普通攻击 造成 ${damage} 伤害${isCritical ? ' (暴击)' : ''}`,
    })

    // 飞行阶段（0→50%T）：蓄力 + 技能名/光弹飞行
    await this.animationManager.triggerFlightPhaseAndWait({
      sourceId: source.id,
      targetId: target.id,
      skillName: '普通攻击',
      effectType: 'attack',
      damageCategory: DamageCategory.PHYSICAL,
    })

    // NOTE: 在扣血前捕获 hpBefore，确保 气血 箭头准确
    const hpBefore = target.currentHealth

    // 命中瞬间（50%T）：扣血，气血 条与 UI 特效同帧开始
    // NOTE: deferHitPassives — 被动触发推迟到 emitAttackLog 之后，
    //       保证日志顺序为「攻击 → 受到伤害 → 被动效果」。
    const actualDamage = this.settleDamage(source, target, damage, rawDamage, isCritical, battle, true)
    //  overkill = takeDamage 返回值超出目标扣血前 HP 的部分
    const overkill = Math.max(0, actualDamage - hpBefore)
    if (record && overkill > 0) record.overkill = overkill

    const hpAfter = target.currentHealth

    // 命中阶段（50%→100%T）：伤害数字 + 命中爆发
    await this.animationManager.triggerImpactPhaseAndWait({
      targetId: target.id,
      damage,
      damageCategory: DamageCategory.PHYSICAL,
      isCritical,
      isHeal: false,
    })

    this.emitAttackLog(battle, {
      type: 'attack',
      source,
      targets: [target],
      skillName: '普通攻击',
      isMiss: false,
      isCrit: isCritical,
      totalDamage: damage,
      totalHeal: 0,
      results: [
        {
          target,
          hpBefore,
          hpAfter,
          damage,
          heal: 0,
          rawDamage,
        },
      ],
    })

    // 攻击日志（含"受到伤害"sub）已发射，再触发 ON_HIT/DAMAGE_TAKEN 被动，
    // 使其效果日志排在"受到伤害"之后（pending 缓冲顺序）
    if (actualDamage > 0) {
      this.triggerHitPassives(source, target, actualDamage, battle)
    }

    // settleDamage 内部已处理：DAMAGE_TAKEN 事件、仇恨、pendingDeaths
  }

  /**
   * 选择并执行普通攻击
   */
  async selectAndExecuteAttack(
    battle: BattleData,
    source: BattleEntity,
    suggestedTargetId?: string,
    scope?: TraceScope,
  ): Promise<BattleAction> {
    const targetId = this.selectTarget(battle, source, suggestedTargetId)
    const target = battle.participants.get(targetId)

    if (!target) {
      LoggerProvider.logger.addDebugLog(`攻击失败: 未找到目标 ${targetId}`, {
        level: LogLevel.WARN,
      })
      return this.createBattleAction(
        source.id,
        source.id,
        battle.currentTurn || 1,
      )
    }

    const currentTurn = battle.currentTurn

    //  开始缓冲 BEFORE_ATTACK 的 sub 日志
    LoggerProvider.logger.beginBufferSubLogs()

    this.passiveSkillManager.triggerPassives(
      source,
      createPassiveContext(BattleTriggerPhase.BEFORE_ATTACK, battle, {
        target,
        targetId,
        trace: scope,
        parentTraceId: scope?.parentId,
      }),
    )
    // 收集 BEFORE_ATTACK 被动触发记录
    const prePassiveRecords = this.passiveSkillManager.drainLastTriggeredPassives()

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
    // 填充 BEFORE_ATTACK 被动触发上下文
    if (prePassiveRecords.length > 0) {
      record.actionContext = { prePassives: prePassiveRecords }
    }

    const attackStep = this.buildNormalAttackStep(source, targetId)
    const damageResult = this.damageCalculator.calculateDamage(
      attackStep,
      source,
      target,
      createStepContext(record, undefined, false, undefined, scope),
    )

    const action = this.createBattleAction(source.id, targetId, currentTurn)

    //  消耗必暴标记（无论是自然暴击还是必暴强制暴击，只要暴击了就消耗）
    if (
      damageResult.isCritical &&
      this.buffSystem.hasBuff(source.id, 'buff_guaranteed_crit')
    ) {
      const buffInstances = this.buffSystem.getBuffInstances(source.id)
      const critBuff = buffInstances.find(
        (b) => b.buffId === 'buff_guaranteed_crit',
      )
      if (critBuff) this.buffSystem.removeBuff(critBuff.id)
    }

    if (damageResult.isMiss) {
      await this.handleMissAttack(action, source, target, battle)
    } else {
      await this.handleHitAttack(action, source, target, damageResult, battle, record)
    }

    //  action 日志已发射，刷出缓冲的 BEFORE_ATTACK sub 日志
    LoggerProvider.logger.flushBufferedSubLogs()

    // 回填最终伤害到记录
    record.damage = action.damage ?? 0
    record.damageSource = 'attack'
    record.actionOrder = this.getActionOrder()
    record.message = `${source.name} 对 ${target.name} 普通攻击，造成 ${action.damage ?? 0} 伤害`
    this.battleRecorder.recordCombatRecord(battle.battleId, record)
    // ponytail: 技术调试日志 — 伤害计算链路追踪
    try {
      TraceDamageLogger.log(record, this.tracePort, scope?.correlationId, scope?.parentId)
    } catch {
      // 调试日志失败绝不中断战斗
    }

    this.passiveSkillManager.triggerPassives(
      source,
      createPassiveContext(BattleTriggerPhase.AFTER_ATTACK, battle, {
        target,
        targetId,
        damage: action.damage,
        isCritical: damageResult.isCritical,
        trace: scope,
        parentTraceId: scope?.parentId,
      }),
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
        { level: LogLevel.WARN },
      )
    }
    const enemies = Array.from(battle.participants.values()).filter(
      (p) => p.id !== source.id && p.team !== source.team && p.isAlive(),
    )
    if (enemies.length === 0) return ''

    // 嘲讽优先：通过标签检测（替换硬编码 buff_taunt）
    const taunters = enemies.filter(e => this.buffSystem.hasBuffWithTag(e.id, 'taunt'))
    if (taunters.length > 0) return taunters[0].id

    // 仇恨优先
    if (this.threatManager) {
      const highestId = this.threatManager.getHighestThreatTarget(
        source.id, enemies.map(e => e.id),
      )
      if (highestId) return highestId
    }

    return enemies[battle.rng.nextInt(0, enemies.length - 1)].id
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
      .filter((p) => p.team === ParticipantSide.ENEMY && p.isAlive())
      .map((p) => p.id)
    const characters = Array.from(battle.participants.values())
      .filter((p) => p.team === ParticipantSide.ALLY && p.isAlive())
      .map((p) => p.id)

    let targetId: string
    let damage: number

    if (participant.team === ParticipantSide.ALLY && enemies.length > 0) {
      targetId = enemies[battle.rng.nextInt(0, enemies.length - 1)]
      damage = battle.rng.nextInt(10, 29)
    } else if (
      participant.team === ParticipantSide.ENEMY &&
      characters.length > 0
    ) {
      targetId = characters[battle.rng.nextInt(0, characters.length - 1)]
      damage = battle.rng.nextInt(8, 22)
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
    scope?: TraceScope,
  ): Promise<BattleAction> {
    const source = battle.participants.get(action.sourceId)
    const target = battle.participants.get(action.targetId)

    if (!source || !target) {
      LoggerProvider.logger.addDebugLog(
        `执行动作失败: 无效的源或目标 sourceId=${action.sourceId}, targetId=${action.targetId}`, { level: LogLevel.ERROR },
      )
      return action
    }

    if (action.type === ActionTypes.SKILL && action.skillId) {
      try {
        // NOTE: 令牌模式 — 用局部 token 替代全局 toggle
        const damageToken = new DeferredDamageToken()
        this.buffSystem.setBuffAppliedCallbackEnabled(false)
        const skillAction = this.skillManager.executeSkill(
          action.skillId,
          source,
          target,
          action.turn ?? 0,
          undefined,
          undefined,
          damageToken,
          scope,
        )
        if (!skillAction.success) {
          // ponytail: early-return 路径也需恢复回调，否则后续被动触发丢失 BUFF_EFFECT 事件
          this.buffSystem.setBuffAppliedCallbackEnabled(true)
          LoggerProvider.logger.addDebugLog(
            `技能执行失败: ${action.skillId} — ${skillAction.effects[0]?.description || '未知原因'}`, { level: LogLevel.ERROR },
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
            await this.animationManager.triggerMissImpactAndWait({
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

          // NOTE: 固定预算模型 — executeAction 技能路径：飞行→命中扣血→命中特效
          this.buffSystem.setBuffAppliedCallbackEnabled(true)

          // NOTE: 在扣血前捕获 气血 用于叙事日志
          const hpBefore = target.currentHealth
          let hpAfter = target.currentHealth
          let actionRawDamage = 0
          let actionFinalDamage = 0

          if ((action.damage ?? 0) > 0) {
            // 伤害技能 → 飞行（0→50%T）+ 命中（50%→100%T）
            const actionIsCrit = skillAction.effects.some(
              (e: BattleEffect) => e.type === EffectType.DAMAGE && e.isCritical,
            )

            await this.animationManager.triggerFlightPhaseAndWait({
              sourceId: source.id,
              targetId: target.id,
              skillName: action.skillId,
              effectType: action.type,
              damageCategory: DamageCategory.PHYSICAL,
            })

            // 命中瞬间（50%T）：应用延迟伤害，统一走 settleDamage
            for (const entry of damageToken.getEntries()) {
              if (!entry.target.isAlive()) continue
              if (entry.damage > 0) {
                this.settleDamage(source, entry.target, entry.damage, entry.rawDamage, actionIsCrit, battle)
              }
              if (entry.heal > 0) {
                entry.target.heal(entry.heal)
              }
              actionRawDamage += entry.rawDamage
              actionFinalDamage += entry.damage
            }
            damageToken.clear()
            hpAfter = target.currentHealth

            await this.animationManager.triggerImpactPhaseAndWait({
              targetId: target.id,
              damage: action.damage ?? 0,
              damageCategory: DamageCategory.PHYSICAL,
              isCritical: actionIsCrit,
              isHeal: false,
            })
          } else if ((action.heal ?? 0) > 0) {
            // 治疗技能 → 直接命中（无飞行，完整 T）
            damageToken.applyAll()
            hpAfter = target.currentHealth

            await this.animationManager.triggerDirectImpactAndWait({
              targetId: target.id,
              damage: action.heal ?? 0,
              damageCategory: DamageCategory.PHYSICAL,
              isCritical: false,
              isHeal: true,
            })
          } else {
            // 无伤害/治疗 — 仍用完 T 预算
            damageToken.applyAll()
            hpAfter = target.currentHealth

            await this.animationManager.triggerAnimationAndWait(
              BattleEventCodes.DAMAGE_ANIMATION,
              {
                targetId: target.id,
                damage: 0,
                damageCategory: DamageCategory.PHYSICAL,
                isCritical: false,
                isHeal: false,
              },
              0, // 0 = 使用动画管理器的默认预算
            )
          }
          const skillId = action.skillId
          // NOTE: 统一投影 — 与 selectAndExecuteSkill/emitSkillLog 同口径
          //       （C1：action 显示实际伤害与 sub 一致；技能名【】化；修复
          //        原手写块 message 用裸 skillId / 原始伤害的不一致）
          const projected = projectSkillLog(
            {
              type: 'skill',
              source,
              targets: [target],
              skillName: skillId,
              skillId,
              isMiss: false,
              isCrit: skillAction.isCrit ?? false,
              totalDamage: actionFinalDamage,
              totalHeal: action.heal ?? 0,
              results: [
                {
                  target,
                  hpBefore,
                  hpAfter,
                  damage: actionFinalDamage,
                  heal: action.heal ?? 0,
                  rawDamage: actionRawDamage,
                },
              ],
              skillLookup: this.skillManager,
            },
            action.turn ?? 0,
          )
          LoggerProvider.logger.addBattleLog({
            turn: action.turn ?? 0,
            ...projected.action,
          })
          //  action 日志已发射，刷出缓冲的 BEFORE_ATTACK sub 日志
          LoggerProvider.logger.flushBufferedSubLogs()

          //  输出 result sub 日志
          for (const sub of projected.subs) {
            LoggerProvider.logger.addBattleLog({
              turn: action.turn ?? 0,
              ...sub,
            })
          }

          // settleDamage 内部已处理：DAMAGE_TAKEN 事件、仇恨、ON_HIT/DAMAGE_TAKEN 被动、pendingDeaths
        }
      } catch (error) {
        // ponytail: catch 路径也需恢复回调，否则后续被动触发丢失 BUFF_EFFECT 事件
        this.buffSystem.setBuffAppliedCallbackEnabled(true)
        //  出错时也刷出缓冲的 sub 日志，防止内存泄漏
        LoggerProvider.logger.flushBufferedSubLogs()
        LoggerProvider.logger.addDebugLog(`技能执行失败: ${action.skillId}`, {
          level: LogLevel.ERROR,
          error: error as Error,
        })
        action.type = ActionTypes.ATTACK
        action.damage = battle.rng.nextInt(10, 29)
        action.effects = [
          {
            type: EffectType.DAMAGE,
            value: action.damage,
            description: `${source.name} 普通攻击 (技能执行失败)`,
          },
        ]
      }
    }

    // NOTE: skill actions already apply damage+heal inside SkillExecutor,
    // so only apply raw damage/heal for non-skill actions (e.g. fallback attack).
    if (action.type !== ActionTypes.SKILL) {
      if (action.damage && action.damage > 0) {
        // NOTE: 固定预算模型 — 飞行→命中扣血→命中特效
        await this.animationManager.triggerFlightPhaseAndWait({
          sourceId: source.id,
          targetId: target.id,
          skillName: '普通攻击',
          effectType: 'attack',
          damageCategory: DamageCategory.PHYSICAL,
        })

        // 命中瞬间（50%T）：扣血（settleDamage 统一处理事件/仇恨/被动/死亡）
        const actualDamage = this.settleDamage(source, target, action.damage, action.damage, false, battle)
        action.damage = actualDamage

        await this.animationManager.triggerImpactPhaseAndWait({
          targetId: target.id,
          damage: action.damage,
          damageCategory: DamageCategory.PHYSICAL,
          isCritical: false,
          isHeal: false,
        })

        // settleDamage 内部已处理：DAMAGE_TAKEN 事件、仇恨、ON_HIT/DAMAGE_TAKEN 被动、pendingDeaths

        if (action.heal && action.heal > 0) {
          // 治疗 → 直接命中（无飞行）
          const actualHeal = target.heal(action.heal)
          action.heal = actualHeal

          await this.animationManager.triggerDirectImpactAndWait({
            targetId: target.id,
            damage: action.heal,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: false,
            isHeal: true,
          })
        }
      }
    }
    this.recordBattleAction(battle, action)
    source.afterAction()
    return action
  }
}
