/**
 * 文件: BattleSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗系统核心实现
 * 描述: 实现战斗系统的核心功能，包括战斗创建、参与者管理、回合处理、动作执行等，集成AI系统和技能系统
 * 版本: 2.0.0 - 集成触发器事件系统
 */

import {
  convertToBattleState,
  createDefaultBattleData,
} from '@/domain/battle/aggregate/BattleState'
import { AISystem } from '@/domain/battle/ai/AISystem'
import { BattleAnimationManager } from '@/domain/battle/BattleAnimationManager'
import { createEmptyRecord } from '@/domain/battle/combat-record'
import {
  AI_SYSTEM_TOKEN,
  BATTLE_RECORDER_TOKEN,
  BATTLE_RULE_MANAGER_TOKEN,
  TURN_MANAGER_TOKEN,
} from '@/domain/battle/entity/BattleInterfaces'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { BuffTraceLogger } from '@/domain/battle/logs/BuffTraceLogger'
import {
  entitySegment,
  projectSnapshotLogs,
  projectTurnEndLog,
} from '@/domain/battle/logs/BattleLogProjector'
import { TraceEventCollector } from '@/domain/battle/logs/TraceEventCollector'
import { createTraceEvent, TraceLevel, TracePhase, TurnFlowAction, TraceTriggerSource } from '@/shared/types/trace-event'
import { BattleExecutor } from '@/domain/battle/service/BattleExecutor'
import { BattleLifecycleManager } from '@/domain/battle/service/BattleLifecycleManager'
import { BattleRecorder, type RecordedBattle } from '@/domain/battle/service/BattleRecorder'
import { BattleRuleManager } from '@/domain/battle/service/BattleRuleManager'
import { TurnManager } from '@/domain/battle/service/TurnManager'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import {
  BattleData,
  BattleEntity,
  BattleState,
  BattleStatus,
  BattleTriggerPhase,
  createPassiveContext,
  ParticipantSide,
  ParticipantSideName,
  RoundStatus,
  SkillBlockReason,
} from '@/domain/battle/type/types'
import { BuffSystem, type SummonRequest, type DamageOrigin } from '@/domain/buff/BuffSystem'
import { BUFF_ID as STUN_BUFF_ID } from '@/domain/buff/scripts/StunDebuff'
import type { TriggerEventContext } from '@/domain/buff/types'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import type { Container } from '@/infrastructure/di/Container'
import type { IUIEventPort } from '@/domain/port/IUIEventPort'
import type { BattleCommand } from '@/shared/types/battle-commands'

import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { DebugGate } from '@/domain/battle/debug/DebugGate'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { DamageCategory, type SkillConfig } from '@/domain/skill/types'
import { EffectType } from '@/domain/skill/types'
import { BATTLE_LOG_CATEGORIES, LogLevel } from '@/shared/types/battle-log'
import type { LogSegment } from '@/shared/types/battle-log'
import { Counter } from '@/shared/utils/Counter'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { RAFTimer } from '@/shared/utils/RAF'
import { SeededRandom } from '@/shared/utils/SeededRandom'
import { ReviveTracker } from '@/domain/battle/service/ReviveTracker'
import { ThreatManager } from '@/domain/battle/service/ThreatManager'
import { FieldEffectManager } from '@/domain/battle/service/FieldEffectManager'
import { FormationManager } from '@/domain/battle/service/FormationManager'
import type { FormationConfig } from '@/shared/types/formation'
import { percentage } from '@/shared/utils/math'
/**
 * 战斗系统核心管理类
 *
 * @class GameBattleSystem
 * 战斗系统核心实现
 *
 * @description
 * 负责战斗的完整气血周期管理，包括创建、回合流转、伤害计算及结算。
 *
 * @architecture
 * 1. 【依赖注入】: 通过 DI 容器注入管理器实例，降低耦合。
 * 2. 【事件驱动】: 使用 Eventbus 驱动 UI 动画和状态同步。
 * 3. 【状态隔离】: 每个战斗实例拥有独立的 BattleData 对象，支持并行运行。
 *
 * @features
 * - 支持多场战斗并行运行。
 * - 集成 AI 决策系统。
 * - 支持战斗录像与回放。
 * - 自动战斗与手动战斗模式切换。
 */

/** 动作日志保留上限 */
const MAX_ACTION_HISTORY = 100

/** 手动行动技能不可用原因的中文标签 */
const MANUAL_ACTION_BLOCK_LABELS: Record<string, string> = {
  [SkillBlockReason.ENERGY_SHORT]: '能量不足',
  [SkillBlockReason.COOLDOWN]: '冷却中',
  [SkillBlockReason.CONTROLLED]: '被控制',
  [SkillBlockReason.SILENCED]: '被沉默',
}

export class BattleSystem {
  /**
   * 战斗ID计数器
   */
  private static battleIdCounter = new Counter(1)

  /**
   * 当前战斗数据
   */
  private battleData: BattleData

  /**
   * 当前活跃的战斗 ID（用于防止跨战斗污染）
   * 在 initialize 时设置，在 resetBattle 时清空
   */
  private activeBattleId: string | null = null

  private readonly lifecycleManager: BattleLifecycleManager
  private readonly animationManager: BattleAnimationManager

  /** 战斗执行器 */
  private readonly executor: BattleExecutor

  /** 复活追踪器 */
  private readonly reviveTracker = new ReviveTracker()
  /** 仇恨管理器 */
  private readonly threatManager = new ThreatManager()
  /** 场地效果管理器（约束 C2：不走 DI，直接构造） */
  private readonly fieldEffectManager = new FieldEffectManager()
  /** 阵型管理器（约束 C2：不走 DI，直接构造） */
  private readonly formationManager = new FormationManager()

  /** 当前战斗的阵型配置（由 BattleManager.startBattle 在 initialize 前设置） */
  private currentAllyFormation: FormationConfig | null = null
  private currentEnemyFormation: FormationConfig | null = null

  /** 设置阵型配置（在调用 initialize 之前调用） */
  setFormations(allyFormation?: FormationConfig, enemyFormation?: FormationConfig): void {
    this.currentAllyFormation = allyFormation ?? null
    this.currentEnemyFormation = enemyFormation ?? null
  }

  /** 获取复活追踪器 */
  getReviveTracker(): ReviveTracker {
    return this.reviveTracker
  }

  /** 获取仇恨管理器 */
  getThreatManager(): ThreatManager {
    return this.threatManager
  }

  /** 获取场地效果管理器 */
  getFieldEffectManager(): FieldEffectManager {
    return this.fieldEffectManager
  }

  /** 获取阵型管理器 */
  getFormationManager(): FormationManager {
    return this.formationManager
  }

  /**
   * 私有构造函数，防止外部直接实例化
   * @param turnManager 回合管理器
   * @param aiSystem AI系统
   * @param battleRecorder 战斗录像器
   * @param ruleManager 规则管理器
   * @param damageCalculator 伤害计算器
   * @param rafTimer RAF定时器
   * @param skillManager 技能管理器
   * @param buffSystem Buff系统
   * @param passiveSkillManager 被动技能管理器
   */
  private constructor(
    private readonly turnManager: TurnManager,
    private readonly aiSystem: AISystem,
    private readonly battleRecorder: BattleRecorder,
    private readonly ruleManager: BattleRuleManager,
    private readonly damageCalculator: DamageCalculator,
    private readonly rafTimer: RAFTimer,
    private readonly skillManager: SkillManager,
    private readonly buffSystem: BuffSystem,
    private readonly passiveSkillManager: PassiveSkillManager,
    private readonly uiEventPort: IUIEventPort,
    private readonly debugGate: DebugGate,
  ) {
    this.battleData = createDefaultBattleData(this.generateBattleId(), this.skillManager)
    this.animationManager = new BattleAnimationManager(
      this.rafTimer,
      () => this.battleData?.participants,
      () => this.battleData?.battleSpeed ?? 1,
      () => this.battleData?.quickMode ?? false,
      () => this.battleData?.headless ?? false,
      this.uiEventPort,
    )
    this.lifecycleManager = new BattleLifecycleManager(
      () => this.battleData,
      this.rafTimer,
      this.battleRecorder,
      this.buffSystem,
      () => this.processTurnInternal(),
      this.animationManager,
      this.uiEventPort,
      this.debugGate,
    )
    this.executor = new BattleExecutor(
      this.skillManager,
      this.damageCalculator,
      this.passiveSkillManager,
      this.battleRecorder,
      this.animationManager,
      this.buffSystem,
      this.reviveTracker,
      this.threatManager,
      // 阵型查询回调（闭包捕获 formationManager）
      (side, seatIndex) => this.formationManager.getRow(side, seatIndex),
      (side) => this.formationManager.hasFrontProtection(side),
    )

    this.passiveSkillManager.setAnimationEnabledGetter(
      () => !this.shouldSuppressAnimationEvents(),
    )

    // 结构化调试追踪收集器（IDebugTracePort 实现）
    // NOTE: 传入触发事件总线，emit 时广播 TRACE_EVENT_ADDED，供 UI 实时流订阅（文档 §7 P2）
    this.traceCollector = new TraceEventCollector(this.getTriggerEventBus())
    this.executor.setTracePort(this.traceCollector)
    this.passiveSkillManager.setTracePort(this.traceCollector)
    this.skillManager.setTracePort(this.traceCollector)
    BuffTraceLogger.setTracePort(this.traceCollector)
    BattleParticipantImpl.setTracePort(this.traceCollector)
  }

  readonly traceCollector: TraceEventCollector

  /**
   * 获取触发器事件总线实例
   * @returns 触发器事件总线实例
   */
  private getTriggerEventBus(): IDomainEventBus {
    return this.buffSystem.getEventBus()
  }

  /**
   * 触发战斗事件
   * @param phase 触发阶段
   * @param context 事件上下文
   */
  private emitTriggerEvent(
    phase: BattleTriggerPhase,
    context: Partial<TriggerEventContext>,
  ): void {
    const eventBus = this.getTriggerEventBus()
    const fullContext: TriggerEventContext = {
      sourceId: context.sourceId ?? '',
      targetId: context.targetId,
      value: context.value,
      currentTurn: context.currentTurn ?? this.battleData.currentTurn,
      battleData: this.battleData,
      ...context,
      phase,
    }
    eventBus.emit(phase, fullContext)
  }

  /** 行动后钩子（P2-8）：广播 ACTION_END 触发器事件（主行动与额外行动统一走此回调） */
  private emitActionEnd(participantId: string, turn: number): void {
    this.emitTriggerEvent(BattleTriggerPhase.ACTION_END, {
      sourceId: participantId,
      currentTurn: turn,
    })
  }

  /**
   * 使用容器创建战斗系统实例（推荐方式）
   * 容器会自动解析所有依赖
   */
  public static createInstanceWithContainer(
    container: Container,
    uiEventPort: IUIEventPort,
  ): BattleSystem {
    const turnManager = container.resolve<TurnManager>(
      TURN_MANAGER_TOKEN.toString(),
    )

    const aiSystem = container.resolve<AISystem>(AI_SYSTEM_TOKEN.toString())
    const battleRecorder = container.resolve<BattleRecorder>(
      BATTLE_RECORDER_TOKEN.toString(),
    )
    const ruleManager = container.resolve<BattleRuleManager>(
      BATTLE_RULE_MANAGER_TOKEN.toString(),
    )
    const damageCalculator =
      container.resolve<DamageCalculator>('DamageCalculator')
    const rafTimer = container.resolve<RAFTimer>('RAFTimer')
    const skillManager = container.resolve<SkillManager>('SkillManager')
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const passiveSkillManager = container.resolve<PassiveSkillManager>(
      'PassiveSkillManager',
    )
    const debugGate = container.resolve<DebugGate>('DebugGate')

    return new BattleSystem(
      turnManager,
      aiSystem,
      battleRecorder,
      ruleManager,
      damageCalculator,
      rafTimer,
      skillManager,
      buffSystem,
      passiveSkillManager,
      uiEventPort,
      debugGate,
    )
  }

  /**
   * 生成战斗唯一标识符
   * @returns 战斗ID字符串，格式为 battle_counter.next
   */
  public generateBattleId(): string {
    return `battle_${BattleSystem.battleIdCounter.next()}`
  }

  /**
   * 获取当前回合数
   * @returns 当前回合数（从1开始）
   */
  public getRound(): number {
    return this.battleData.currentTurn
  }

  /**
   * 获取Buff系统实例
   * @returns Buff系统实例
   */
  public getBuffSystem(): BuffSystem {
    return this.buffSystem
  }

  /**
   * 初始化战斗
   * @param {BattleEntity[]} allyParticipants - 我方参与者数组
   * @param {BattleEntity[]} enemyParticipants - 敌方参与者数组
   * @param {string} [sceneId] - 可选场景 ID，用于加载场地效果
   * @param {string} [seed] - 可选确定性随机种子（回放复现用；缺省随机生成并同步给 BattleRecorder）
   * @returns {BattleState} 初始化后的战斗状态
   */
  public initialize(
    allyParticipants: BattleEntity[],
    enemyParticipants: BattleEntity[],
    sceneId?: string,
    seed?: string,
  ): BattleState {
    //  桥接战斗规则 → 伤害计算器（暴击/闪避开关+场地元素修正），每场战斗开始时生效
    // NOTE: §1.1 修复后 this.damageCalculator 与 this.skillManager.getDamageCalculator()
    //       为同一实例，一次 setConfig 即覆盖普攻和技能两条路径
    const combatRules = this.ruleManager.getCombatRules()
    this.damageCalculator.setConfig({
      enableCrit: combatRules.critEnabled,
      enableDodge: combatRules.dodgeEnabled,
      fieldElementalModifier: (elementType: string) =>
        this.fieldEffectManager.getElementalModifier(elementType),
    })
    const turnSystemRules = this.ruleManager.getTurnSystemRules()

    // 仇恨系统配置
    if (combatRules.threat) {
      this.threatManager.configure(combatRules.threat)
    }

    const allParticipants = [...allyParticipants, ...enemyParticipants]
    const participants = new Map<string, BattleEntity>()
    allParticipants.forEach((participant) => {
      participants.set(participant.id, participant)
      // 为 BattleParticipantImpl 实例设置修饰符提供者，打通 ModifierStack → AttributeValue 同步
      if (participant instanceof BattleParticipantImpl) {
        participant.setModifierProvider(this.buffSystem)
        participant.setBuffQuery(this.buffSystem)
      }
    })
    const battleData = this.battleData

    // NOTE: 每场战斗重建确定性随机源 — 战斗内所有随机判定（命中/暴击/目标/AI/触发器）
    //       统一走 battleData.rng，使回放可从 seed 复现；seed 同步给 BattleRecorder 持久化。
    const seedValue = seed ?? SeededRandom.generateSeed()
    battleData.rng = new SeededRandom(seedValue)
    // 注入确定性随机源到各随机消费方（未注入的路径回退 Math.random，仅测试/非战斗场景）
    this.injectRng(battleData.rng)

    // 【防止跨战斗污染】设置当前活跃战斗 ID
    this.activeBattleId = battleData.battleId

    battleData.participants = participants

    battleData.aiInstances = this.aiSystem.createAIInstances(participants)
    // P1: 注入调试追踪端口（AI_DECISION 事件用；AISystem 负责转发到每个 AI 实例，含惰性创建的）
    this.aiSystem.setTracePort(this.traceCollector)
    battleData.skillManager = this.skillManager

    battleData.currentTurn = 0
    battleData.currentTurn = 1
    battleData.battleState = BattleStatus.PREPARING

    const battleId = this.battleData.battleId
    this.battleRecorder.startRecording(battleId, {
      participants: allParticipants,
    }, seedValue)

    LoggerProvider.logger.addBattleLog({
      turn: 0,
      message: `战斗开始  ·  我方 ${allyParticipants.length} vs 敌方 ${enemyParticipants.length}`,
      segments: [
        {
          text: `战斗开始  ·  我方 ${allyParticipants.length} vs 敌方 ${enemyParticipants.length}`,
          classStr: 'log-system',
        },
      ],
      category: BATTLE_LOG_CATEGORIES.SYSTEM,
      meta: { role: 'battle' },
    })
    battleData.roundState = RoundStatus.START

    const autoBattleRules = this.ruleManager.getAutoBattleRules()
    battleData.autoBattle = autoBattleRules.enabled
    battleData.battleSpeed = autoBattleRules.defaultSpeed
    battleData.maxTurns = this.ruleManager.getTurnSystemRules().maxTurns

    // 注册属性变化回调，Buff 修改 ModifierStack 后发射事件通知 UI 层
    this.buffSystem.setAttributeChangeCallback((characterId: string) => {
      this.uiEventPort.emit(BattleEventCodes.PARTICIPANT_ATTRIBUTE_CHANGED, {
        characterId,
      })
    })

    // ponytail: 注册 buff 添加回调，被动触发路径通过 eventBus 告知 UI 播放动画
    this.buffSystem.setBuffAppliedCallback(
      (characterId: string, buffId: string) => {
        if (this.shouldSuppressAnimationEvents()) return  // 无头/快速模式：抑制
        this.uiEventPort.emit(BattleEventCodes.BUFF_EFFECT, {
          targetId: characterId,
          buffName: buffId,
          isPositive: true,
        })
      },
    )

    // ponytail: 防止触发器脚本（如 reflectDamage）循环递归
    // 在 DAMAGE_TAKEN 发射中再次调用 requestDamage → setDamageCallback → ... 无限递归
    // 使用深度计数器替代布尔标志，允许有限嵌套（DOT→反伤→反伤的反伤），防止真正无限递归
    let _damageCallbackDepth = 0
    const MAX_DAMAGE_CALLBACK_DEPTH = 3

    // HOT 持续治疗补发（与 setDamageCallback 负 percent 分支共用）
    const emitHotHealTrace = (targetId: string, amount: number): void => {
      const t = battleData.participants.get(targetId)
      if (this.traceCollector.isEnabled(TracePhase.HEAL_CALCULATION)) {
        this.traceCollector.emit(
          createTraceEvent({
            correlationId: `hot_${battleData.currentTurn ?? 1}_${targetId}`,
            phase: TracePhase.HEAL_CALCULATION,
            battleId: battleData.battleId,
            turn: battleData.currentTurn ?? 1,
            targetId,
            level: TraceLevel.DEBUG,
            summary: `${t?.name ?? targetId} 受到持续治疗 ${amount}`,
            payload: { result: amount, hot: true },
          }),
        )
      }
    }

    // 触发器脚本伤害补发（反伤/平摊/场地等）：无来源、无 dot 标记，仅计承伤/HP
    const emitTriggerTrace = (targetId: string, dmg: number): void => {
      const t = battleData.participants.get(targetId)
      if (this.traceCollector.isEnabled(TracePhase.DAMAGE_CALCULATION)) {
        this.traceCollector.emit(
          createTraceEvent({
            correlationId: `trg_${battleData.currentTurn ?? 1}_${targetId}`,
            phase: TracePhase.DAMAGE_CALCULATION,
            battleId: battleData.battleId,
            turn: battleData.currentTurn ?? 1,
            targetId,
            level: TraceLevel.DEBUG,
            summary: `${t?.name ?? targetId} 受到 ${dmg} 点伤害`,
            payload: { result: dmg },
          }),
        )
      }
    }

    // 注册伤害/治疗回调，Buff 触发器可直接对目标造成伤害或治疗
    this.buffSystem.setDamageCallback(
      (targetId: string, damage: number, rawDamage?: number, damagePercent?: number, origin?: DamageOrigin) => {
        // ponytail: 递归守卫 — 深度计数器替代布尔标志，允许有限嵌套
        if (_damageCallbackDepth >= MAX_DAMAGE_CALLBACK_DEPTH) {
          throw new Error(
            `[BattleSystem] 伤害回调嵌套超过 ${MAX_DAMAGE_CALLBACK_DEPTH} 层，` +
            `存在无限递归。目标: ${targetId}。请检查触发器配置。`
          )
        }
        _damageCallbackDepth++
        try {
          const target = battleData.participants.get(targetId)
          if (!target?.isAlive()) return

          // 补发 dot 伤害 trace 事件：DOT 不走 TraceDamageLogger（无 CombatRecord 链路），
          // 否则真实录制的战报（承伤/HP 模拟）完全缺失持续伤害。
          // 仅标记 origin='dot' 的请求补发，反伤/平摊等触发器脚本不误标（战报口径见 unified-summary.ts）。
          const emitDotTrace = (dmg: number): void => {
            if (this.traceCollector.isEnabled(TracePhase.DAMAGE_CALCULATION)) {
              this.traceCollector.emit(
                createTraceEvent({
                  correlationId: `dot_${battleData.currentTurn ?? 1}_${targetId}`,
                  phase: TracePhase.DAMAGE_CALCULATION,
                  battleId: battleData.battleId,
                  turn: battleData.currentTurn ?? 1,
                  targetId,
                  level: TraceLevel.DEBUG,
                  summary: `${target.name} 受到持续伤害 ${dmg}`,
                  payload: { result: dmg, dot: true },
                }),
              )
            }
          }

          let actualDamage = damage
          let isHeal = false
          // Defect 2 修复：固定伤害走 settleDamage 后不再重复发射事件/被动
          let settledViaExecutor = false

          if (damagePercent && damagePercent > 0) {
            // 正百分比 = 扣当前气血百分比
            actualDamage = Math.max(
              1,
              Math.floor(target.currentHealth * damagePercent),
            )
            target.takeDamage(actualDamage)
            if (origin === 'dot') emitDotTrace(actualDamage)
            else if (origin === 'trigger') emitTriggerTrace(targetId, actualDamage)
          } else if (damagePercent && damagePercent < 0) {
            // 负百分比 = 按最大气血百分比治疗
            actualDamage = Math.floor(
              target.maxHealth * Math.abs(damagePercent),
            )
            target.heal(actualDamage)
            isHeal = true
            if (origin === 'hot') emitHotHealTrace(targetId, actualDamage)
          } else if (damage > 0) {
            // 固定值伤害：走 settleDamage（统一处理 TriggerEventBus/仇恨/被动/pendingDeaths）
            // NOTE: 在扣血前捕获 气血，用于 DOT 叙事日志
            const hpBefore = target.currentHealth
            actualDamage = this.executor.settleDamage(
              null, target, damage, rawDamage ?? damage, false, battleData,
            )
            settledViaExecutor = true
            // DOT 特有逻辑（DOT CombatRecord、叙事日志）
            if (actualDamage > 0) {
              if (origin === 'dot') emitDotTrace(actualDamage)
              else if (origin === 'trigger') emitTriggerTrace(targetId, actualDamage)
              const hpAfter = target.currentHealth
              const dotRecord = createEmptyRecord(
                battleData.battleId,
                'system',
                '系统',
                'attack' as any,
                targetId,
                target.name,
                battleData.currentTurn ?? 1,
              )
              dotRecord.damage = actualDamage
              dotRecord.damageSource = 'dot'
              dotRecord.message = `${target.name} 受到 ${actualDamage} 点持续伤害`
              this.battleRecorder.recordCombatRecord(
                battleData.battleId,
                dotRecord,
              )
              // NOTE: DOT 叙事日志
              const dotSegs: LogSegment[] = [
                entitySegment(target),
                { text: ' 受到 ' },
                {
                  text: `${actualDamage}`,
                  classStr: 'log-damage',
                  kind: 'damage',
                },
                { text: ' 点持续伤害' },
              ]
              LoggerProvider.logger.addBattleLog({
                turn: battleData.currentTurn ?? 1,
                message: dotSegs.map((s) => s.text).join(''),
                segments: dotSegs,
                category: BATTLE_LOG_CATEGORIES.DAMAGE,
                meta: {
                  role: 'settlement',
                  entityId: targetId,
                  hpAfter,
                  damage: actualDamage,
                },
              })
            }
          }
          //  统一管道：触发器伤害/治疗动画（所有分支都需要）
          if (actualDamage > 0 && !this.shouldSuppressAnimationEvents()) {
            this.uiEventPort.emit(BattleEventCodes.DAMAGE_ANIMATION, {
              targetId,
              damage: actualDamage,
              damageCategory: DamageCategory.PHYSICAL,
              isCritical: false,
              isHeal,
            })
          }
          //  TriggerEventBus + 被动触发（仅非 settleDamage 分支需要，Defect 2 修复）
          if (!settledViaExecutor && actualDamage > 0) {
            this.emitTriggerEvent(BattleTriggerPhase.DAMAGE_TAKEN, {
              sourceId: '',
              targetId,
              value: actualDamage,
              extra: { damage: actualDamage, rawDamage: rawDamage ?? actualDamage },
            })
            this.passiveSkillManager.triggerPassives(
              target,
              createPassiveContext(
                BattleTriggerPhase.DAMAGE_TAKEN,
                battleData,
                { damage: actualDamage },
              ),
            )
          }
          //  队友伤害事件（所有分支都需要）
          if (actualDamage > 0) {
            const isDead = !target.isAlive()
            battleData.participants.forEach((p) => {
              if (p.id !== targetId && p.team === target.team && p.isAlive()) {
                this.emitTriggerEvent(
                  isDead
                    ? BattleTriggerPhase.ALLY_FATAL_DAMAGE
                    : BattleTriggerPhase.ALLY_DAMAGE_TAKEN,
                  {
                    sourceId: '',
                    targetId: p.id,
                    value: actualDamage,
                    extra: { allyId: targetId, damage: actualDamage },
                  },
                )
              }
            })
          }
        } finally {
          _damageCallbackDepth--
        }
      },
    )
    this.buffSystem.setHealCallback((targetId: string, amount: number, origin?: DamageOrigin) => {
      const target = battleData.participants.get(targetId)
      if (target?.isAlive()) {
        const actualHeal = target.heal(amount)
        // HOT 持续治疗补发 HEAL_CALCULATION：与 dot 对称，不计技能表（hot 标记），只恢复 HP 模拟
        if (origin === 'hot') emitHotHealTrace(targetId, actualHeal)
        //  统一管道：触发器治疗动画
        if (actualHeal > 0 && !this.shouldSuppressAnimationEvents()) {
          this.uiEventPort.emit(BattleEventCodes.DAMAGE_ANIMATION, {
            targetId,
            damage: actualHeal,
            damageCategory: DamageCategory.PHYSICAL,
            isCritical: false,
            isHeal: true,
          })
        }
        this.emitTriggerEvent(BattleTriggerPhase.HEAL_RECEIVED, {
          sourceId: '',
          targetId,
          value: amount,
        })
        // ponytail: 补充被动触发 — buff 治疗也需要触发 HEAL_RECEIVED 被动
        this.passiveSkillManager.triggerPassives(
          target,
          createPassiveContext(BattleTriggerPhase.HEAL_RECEIVED, battleData, {
            heal: amount,
          }),
        )
      }
    })

    //  能量恢复回调
    this.buffSystem.setEnergyCallback((targetId: string, amount: number) => {
      const target = battleData.participants.get(targetId)
      if (target?.isAlive()) {
        target.gainEnergy(amount)
        // gainEnergy 内部已通过 TriggerEventBus 发射 ENERGY_GAINED 事件

        //  补充：触发 ENERGY_GAINED 被动技能
        this.passiveSkillManager.triggerPassives(
          target,
          createPassiveContext(BattleTriggerPhase.ENERGY_GAINED, battleData, {}),
        )
      }
    })

    //  Phase 0：召唤回调占位 — 仅记录日志，不创建实体
    this.buffSystem.setSummonCallback((request: SummonRequest) => {
      LoggerProvider.logger.addBattleLog({
        turn: this.battleData.currentTurn ?? 1,
        message: `[召唤] ${request.sourceId} 尝试召唤 ${request.summonId}（${request.duration}回合）— 召唤系统尚未实现`,
        segments: [{ text: `[召唤] ${request.summonId} — 尚未实现`, classStr: 'log-system' }],
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'sub' },
      })
      // TODO(P2): 实现完整召唤管道
    })

    //  每次 initialize 确保技能配置已加载（幂等，批量生成器独立运行时兜底）
    if (this.skillManager.getSkillConfigs().size === 0) {
      this.loadSkillConfigs(GameDataProcessor.getSkillsData())
    }

    //  每次 initialize 重新注册被动和免疫，消除对外部调用顺序的依赖
    this.passiveSkillManager.clearAll()
    for (const participant of participants.values()) {
      // 先清理上一场残留的免疫标签（防止多次 initialize 累积）
      this.buffSystem.clearCharacterImmunities(participant.id)
      GameDataProcessor.registerParticipantPassives(participant, this.passiveSkillManager)
      const immunities = participant.getImmunities()
      if (immunities.length > 0) {
        this.buffSystem.registerCharacterImmunities(participant.id, immunities)
      }
    }
    //  注入角色解析器 — 必须在 applyPassiveSkills 之前
    // NOTE: 闭包引用 this.battleData 而非 this.battleData.participants，
    //       因为 initialize() 会执行 battleData.participants = participants 重新赋值，
    //       闭包自动指向新数据，无需在 resetBattle() 中清除。
    this.buffSystem.setCharacterResolver((characterId: string) => {
      return this.battleData.participants.get(characterId)
    })

    // ponytail: 统一管道 — 所有被动通过 PassiveSkillManager 在 BATTLE_START 阶段触发
    this.applyPassiveSkills(participants)

    // ponytail: 被动加成已生效，此时创建回合顺序确保速度加成正确
    battleData.turnOrder = this.turnManager.createTurnOrder(
      Array.from(participants.values()),
      battleData.rng,
      turnSystemRules.speedFirst,
    )

    // ponytail: 光环在 applyPassiveSkills 中已通过 addBuff 添加到源参与者，
    // 此处扫描所有参与者上的光环 buff 并分发修饰符到同队/异队成员
    this.distributeAuras(participants)

    //  场地效果加载（在 distributeAuras 之后）
    if (sceneId) {
      const scene = GameDataProcessor.findSceneById(sceneId)
      if (scene?.fieldEffects?.length) {
        this.fieldEffectManager.loadFromScene(scene.fieldEffects)
        this.fieldEffectManager.applyModifiers(participants, this.buffSystem)
        allParticipants.forEach(p => p.recalcAll(TraceTriggerSource.FIELD_EFFECT))
        battleData.turnOrder = this.turnManager.createTurnOrder(
          Array.from(participants.values()),
          battleData.rng,
          turnSystemRules.speedFirst,
        )
      }
    }

    //  阵型加载
    // NOTE: allyFormation/enemyFormation 由 BattleManager.startBattle 在调用 initialize 前设置
    // 若设置了阵型，applyFormation 会通过 BuffSystem.addBuff 施加阵型 Buff（修复 F1）
    if (this.currentAllyFormation) {
      this.formationManager.applyFormation(
        ParticipantSide.ALLY, this.currentAllyFormation, allyParticipants, this.buffSystem,
      )
    }
    if (this.currentEnemyFormation) {
      this.formationManager.applyFormation(
        ParticipantSide.ENEMY, this.currentEnemyFormation, enemyParticipants, this.buffSystem,
      )
    }
    // 阵型 Buff 施加后重新计算属性
    if (this.currentAllyFormation || this.currentEnemyFormation) {
      allParticipants.forEach(p => p.recalcAll(TraceTriggerSource.FORMATION))
      battleData.turnOrder = this.turnManager.createTurnOrder(
        Array.from(participants.values()),
        battleData.rng,
        turnSystemRules.speedFirst,
      )
    }

    return convertToBattleState(battleData)
  }

  /**
   * 应用所有角色的被动技能效果
   * 被动技能在战斗开始时自动生效
   * @param participants 参与者映射
   */
  private applyPassiveSkills(participants: Map<string, BattleEntity>): void {
    // 触发战斗开始事件
    participants.forEach((participant) => {
      this.emitTriggerEvent(BattleTriggerPhase.BATTLE_START, {
        sourceId: participant.id,
      })
    })

    // 使用PassiveSkillManager触发战斗开始时的被动技能
    this.passiveSkillManager.triggerPassiveSkillsForAll(
      participants,
      createPassiveContext(BattleTriggerPhase.BATTLE_START, this.battleData),
    )
  }

  /**
   * 分发所有参与者身上光环 buff 的 allies/enemies 修饰符
   * 在 applyPassiveSkills 之后调用，确保所有 BATTLE_START 被动已添加 buff
   */
  private distributeAuras(participants: Map<string, BattleEntity>): void {
    for (const [id, entity] of participants) {
      if (!(entity instanceof BattleParticipantImpl)) continue
      const buffInstanceIds = entity.getBuffInstanceIds()
      for (const instanceId of buffInstanceIds) {
        const buffConfig = this.buffSystem.getBuffConfigByInstanceId(instanceId)
        if (!buffConfig) continue
        // ponytail: 查找 BuffJsonEntry 中的 immunities 字段，但此处需要 aura 配置
        // 使用 BuffSystem.getBuffAuraConfig 获取 aura 元数据
        const aura = this.buffSystem.getBuffAuraConfig(buffConfig.id)
        if (!aura || !aura.modifiers?.length || !aura.targetSelector) continue
        const isAllies = aura.targetSelector === 'allies'
        for (const [targetId, target] of participants) {
          if (targetId === id) continue
          if (!(target instanceof BattleParticipantImpl)) continue
          const sameTeam = target.team === entity.team
          if ((isAllies && sameTeam) || (!isAllies && !sameTeam)) {
            // ponytail: 光环修饰符通过目标角色的 ModifierStack 管理，
            // 使用 instanceId 作为 sourceKey，这样 removeBuff 时能通过
            // removeModifier(instanceId) 正确清理跨角色修饰符。
            const targetStack = this.buffSystem.getModifierStack(targetId)
            for (const mod of aura.modifiers) {
              // aura 的 PERCENTAGE value 由配置显式声明（百分数），无需运行时换算
              targetStack.addModifier(
                instanceId,
                mod.targetAttribute as ATTRIBUTE_CODE,
                typeof mod.value === 'number' ? mod.value : 0,
                mod.type,
              )
            }
            target.recalcAll()
          }
        }
      }
    }
  }

  /**
   * 触发单个角色的被动技能
   * 用于在调试面板中动态添加角色时触发被动技能
   * @param participant 参与者
   */
  public triggerPassiveSkillsForCharacter(participant: BattleEntity): void {
    // NOTE: 动态添加的角色未经过 initialize()，被动从未注册到 PassiveSkillManager
    //       （triggerPassives 依赖 passives Map，未注册会静默 return）；
    //       先清空再注册，保证幂等（重复调用不会累积重复被动）
    this.passiveSkillManager.clearPassives(participant.id)
    GameDataProcessor.registerParticipantPassives(participant, this.passiveSkillManager)

    // 触发战斗开始事件
    this.emitTriggerEvent(BattleTriggerPhase.BATTLE_START, {
      sourceId: participant.id,
    })

    const participants = this.battleData?.participants
    if (!participants) return

    // 使用PassiveSkillManager触发战斗开始时的被动技能
    this.passiveSkillManager.triggerPassives(
      participant,
      createPassiveContext(BattleTriggerPhase.BATTLE_START, this.battleData),
    )

    // ponytail: 增量分发光环 — 新角色受已有光环影响 + 新角色的光环施加给已有角色
    this.distributeAuras(participants)
  }

  /**
   * 内部方法：处理战斗回合的核心逻辑
   * 实现每回合重新计算出手顺序，并按顺序执行所有角色行动
   */
  private async processTurnInternal(): Promise<void> {
    const battle = this.battleData
    if (
      battle.battleState === BattleStatus.PAUSED ||
      battle.battleState !== BattleStatus.ACTIVE
    ) {
      return
    }

    // ponytail: 调试模式 — 首回合开始前暂停，让开发者查看初始状态
    if (battle.currentTurn === 1) {
      await this.debugGate.waitIfNeeded('BATTLE_START')
    }

    battle.roundState = RoundStatus.START

    const aliveParticipants = Array.from(battle.participants.values()).filter(
      (p) => p.isAlive(),
    )

    // P1: TURN_FLOW 事件 — 回合开始（文档 §5 示例 5）
    if (this.traceCollector.isEnabled(TracePhase.TURN_FLOW)) {
      const aliveByTeam = { ally: 0, enemy: 0 }
      aliveParticipants.forEach((p) => {
        if (p.team === ParticipantSide.ALLY) aliveByTeam.ally++
        else aliveByTeam.enemy++
      })
      this.traceCollector.emit(
        createTraceEvent({
          correlationId: `turn_${battle.currentTurn ?? 1}`,
          phase: TracePhase.TURN_FLOW,
          battleId: battle.battleId,
          turn: battle.currentTurn,
          level: TraceLevel.INFO,
          summary: `回合 ${battle.currentTurn} 开始`,
          payload: {
            action: TurnFlowAction.TURN_START,
            turnOrder: battle.turnOrder,
            aliveCount: aliveByTeam,
            energyGain: this.ruleManager.getCombatRules().energyGainPerTurn,
          },
        }),
      )
    }

    try {
      // 触发回合开始事件
      aliveParticipants.forEach((participant) => {
        this.emitTriggerEvent(BattleTriggerPhase.TURN_START, {
          sourceId: participant.id,
          currentTurn: battle.currentTurn,
        })
      })

      // 触发回合开始时的被动技能
      this.passiveSkillManager.triggerPassiveSkillsForAll(
        battle.participants,
        createPassiveContext(BattleTriggerPhase.TURN_START, this.battleData),
      )

      // 复活冷却递减 + 场地周期效果（回合开始）
      this.reviveTracker.tickCooldowns()
      this.fieldEffectManager.triggerPeriodic('turn_start', battle.participants, this.buffSystem)

      // 减少所有角色技能冷却
      battle.participants.forEach((participant) => {
        if (
          participant.isAlive() &&
          'reduceSkillCooldowns' in participant &&
          typeof participant.reduceSkillCooldowns === 'function'
        ) {
          participant.reduceSkillCooldowns()
        }
      })

      // 重置所有存活角色的受击能量计数器（每回合开始）
      aliveParticipants.forEach((participant) => {
        participant.resetEnergyHitCount()
      })

      // 为所有存活角色增加回合开始能量（按 阵营:实际到账 分组，同组角色合并为一行，敌我分开）
      const combatRules = this.ruleManager.getCombatRules()
      const energyGains: Array<{
        participant: BattleEntity
        actualGain: number
        energyBefore: number
        energyAfter: number
      }> = []
      aliveParticipants.forEach((participant) => {
        const gain = combatRules.energyGainPerTurn
        // NOTE: 记录实际到账（gainEnergy 有上限封顶），并携带 before/after 快照（B2）
        const energyBefore = participant.currentEnergy
        participant.gainEnergy(gain)
        const energyAfter = participant.currentEnergy
        const actualGain = energyAfter - energyBefore
        if (actualGain > 0) {
          energyGains.push({ participant, actualGain, energyBefore, energyAfter })
        }
      })

      if (energyGains.length > 0) {
        const groups = new Map<string, typeof energyGains>()
        for (const item of energyGains) {
          const key = `${item.participant.team}:${item.actualGain}`
          const group = groups.get(key) ?? []
          group.push(item)
          groups.set(key, group)
        }
        // 我方在前，敌方在后（与态势快照同口径）
        const sortedGroups = [...groups.values()].sort((a, b) => {
          const aSide = a[0].participant.team === ParticipantSide.ALLY ? 0 : 1
          const bSide = b[0].participant.team === ParticipantSide.ALLY ? 0 : 1
          return aSide - bSide
        })
        for (const items of sortedGroups) {
          const segs: LogSegment[] = []
          items.forEach((item, i) => {
            if (i > 0) segs.push({ text: '、' })
            segs.push(entitySegment(item.participant))
          })
          segs.push(
            { text: ` 获得回合开始能量 `, classStr: 'log-info' },
            { text: `+${items[0].actualGain}`, classStr: 'log-heal' },
          )
          LoggerProvider.logger.addBattleLog({
            turn: battle.currentTurn,
            message: segs.map((s) => s.text).join(''),
            segments: segs,
            category: BATTLE_LOG_CATEGORIES.STATUS,
            meta: {
              role: 'sub',
              energyChanges: items.map((g) => ({
                entityId: g.participant.id,
                name: g.participant.name,
                energyBefore: g.energyBefore,
                energyAfter: g.energyAfter,
              })),
            },
          })
        }
      }

      // 【脏标记流控】回合开始前批量预计算所有参与者属性
      aliveParticipants.forEach((participant) => {
        if (
          'recalcAll' in participant &&
          typeof participant.recalcAll === 'function'
        ) {
          participant.recalcAll()
        }
      })

      // 计算出手顺序（必须在属性刷新之后，以使用最新的速度值）
      const currentTurnOrder = this.turnManager.createTurnOrder(
        Array.from(battle.participants.values()),
        battle.rng,
        this.ruleManager.getTurnSystemRules().speedFirst,
      )
      battle.turnOrder = currentTurnOrder

      // 发送回合开始事件到 UI 层（此时拥有正确的出手顺序）
      // NOTE: headless（批量数据生成）下不发射 — 这些是驱动 Vue 重新渲染的 UI 状态事件，
      //       批量生成时发射会让整个战场每回合重渲染数千次，导致界面白屏/冻结
      if (!battle.headless) {
        const firstActorId =
          currentTurnOrder.length > 0 ? currentTurnOrder[0] : null
        this.uiEventPort.emit(BattleEventCodes.TURN_START, {
          actorId: firstActorId,
        })
      }

      // ponytail: 调试模式 — 回合开始事件已派发后暂停
      await this.debugGate.waitIfNeeded('TURN_START')

      const battleId = battle.battleId
      this.battleRecorder.recordTurnStart(battleId, battle.currentTurn, currentTurnOrder[0]!)

      for (let i = 0; i < currentTurnOrder.length; i++) {
        await this.animationManager.waitForAnimation()

        // 【竞态条件防护】检查战斗状态是否仍然有效
        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }

        const participantId = currentTurnOrder[i]
        const participant = battle.participants.get(participantId)
        if (!participant || !participant.isAlive()) {
          continue
        }

        // 设置行动顺序号（1-based）
        this.executor.setActionOrder(i + 1)

        // 在每个角色行动前，发送当前行动者更新事件到 UI 层
        // NOTE: headless 下不发射（同上，避免批量生成驱动 UI 重渲染风暴）
        if (!battle.headless) {
          this.uiEventPort.emit(BattleEventCodes.CURRENT_ACTOR_CHANGED, {
            actorId: participantId,
          })
        }

        try {
          await this.executor.executeParticipantAction(battle, participant)
        } catch (error) {
          LoggerProvider.logger.addDebugLog('角色行动执行出错:', {
            level: LogLevel.ERROR,
            error: error as Error,
          })
          await this.executor.executeDefaultAction(battle, participant)
        }

        // 【竞态条件防护】检查战斗状态是否仍然有效
        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }

        await this.animationManager.waitForAnimation()

        //  补充守卫：如果在等待间隔期间战斗已结束，跳过后续操作
        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }

        // 行动后钩子（P2-8）：ACTION_END 触发器事件 — 供 buff/被动监听"该角色行动完成"，
        this.emitActionEnd(participant.id, battle.currentTurn)

        await this.runEndConditionCheck()

        if (battle.battleState !== BattleStatus.ACTIVE) {
          return
        }

        // TODO(P1): 属性重算事件（ATTRIBUTE_RECALC）落地后，气血变化由事件链可见，此打印删除
      }

      await this.animationManager.waitForAnimation()

      // 【竞态条件防护】检查战斗状态是否仍然有效
      if (battle.battleState !== BattleStatus.ACTIVE) {
        return
      }

      // 发送回合结束事件到 UI 层
      // NOTE: headless 下不发射（同上，避免批量生成驱动 UI 重渲染风暴）
      if (!battle.headless) {
        this.uiEventPort.emit(BattleEventCodes.TURN_END)
      }

      // ponytail: 调试模式 — 回合结束事件已派发后暂停
      await this.debugGate.waitIfNeeded('TURN_END')

      // P2-8：回合末统一 buff 结算（原"行动后逐角色结算" → 回合末全量统一，
      // 名实相符：updatePerTurn = 每回合一次，对所有存活角色）
      const endParticipants = Array.from(battle.participants.values()).filter(
        (p) => p.isAlive(),
      )
      endParticipants.forEach((participant) => {
        this.buffSystem.updatePerTurn(participant.id, battle.currentTurn)
      })
      // dot 致死及时判定胜负（对齐原"行动后结算 → 检查"节奏）
      await this.runEndConditionCheck()
      if (battle.battleState !== BattleStatus.ACTIVE) {
        return
      }

      // 触发回合结束事件
      endParticipants.forEach((participant) => {
        this.emitTriggerEvent(BattleTriggerPhase.TURN_END, {
          sourceId: participant.id,
          currentTurn: battle.currentTurn,
        })
      })

      this.passiveSkillManager.triggerPassiveSkillsForAll(
        battle.participants,
        createPassiveContext(BattleTriggerPhase.TURN_END, this.battleData),
      )

      // 场地周期效果（回合结束）+ 场地效果递减 + 仇恨衰减
      this.fieldEffectManager.triggerPeriodic('turn_end', battle.participants, this.buffSystem)
      this.fieldEffectManager.tick()
      this.threatManager.tickDecay()

      // ponytail: 消费 extra_action（时之沙）— 在 TURN_END 触发后、回合递增前执行额外行动
      const extraEntityIds = this.skillManager.getExecutor().drainExtraActions()
      // ponytail: 限制每回合最多 3 次额外行动，防止被动再触发导致无限循环
      const MAX_EXTRA_ACTIONS = 3
      let extraCount = 0
      while (extraEntityIds.length > 0 && extraCount < MAX_EXTRA_ACTIONS) {
        const entityId = extraEntityIds.shift()!
        const entity = battle.participants.get(entityId)
        if (entity?.isAlive() && this.executor) {
          // 额外行动顺序号：接在主循环之后
          this.executor.setActionOrder(currentTurnOrder.length + extraCount + 1)
          LoggerProvider.logger.addDebugLog(`额外行动: ${entity.name}`, {
            level: LogLevel.INFO,
          })
          await this.executor.executeParticipantAction(battle, entity)
          // 额外行动同样走行动后钩子（ACTION_END）
          this.emitActionEnd(entity.id, battle.currentTurn)
        }
        extraCount++
        // 消费本轮执行中可能新产生的 extra_action 请求
        const newExtras = this.skillManager.getExecutor().drainExtraActions()
        extraEntityIds.push(...newExtras)
      }
      if (extraEntityIds.length > 0) {
        LoggerProvider.logger.addDebugLog(
          `额外行动已达上限(${MAX_EXTRA_ACTIONS})，丢弃 ${extraEntityIds.length} 个请求`,
          { level: LogLevel.WARN },
        )
      }

      //  回合态势快照（投影器统一生成，与终局/补捞快照同口径）
      for (const log of projectSnapshotLogs(battle.participants, battle.currentTurn)) {
        LoggerProvider.logger.addBattleLog({
          turn: battle.currentTurn,
          ...log,
        })
      }

      // NOTE: 回合结束阶段标记（原 handleTurnEndEvent 死代码逻辑落地点 —
      //       TURN_END 事件在 BattleSystem 处统一生成，回合切换的时序可读）
      LoggerProvider.logger.addBattleLog({
        turn: battle.currentTurn,
        ...projectTurnEndLog(battle.currentTurn),
      })

      battle.roundState = RoundStatus.END

      // P1: TURN_FLOW 事件 — 回合结束（文档 §5 示例 5）
      if (this.traceCollector.isEnabled(TracePhase.TURN_FLOW)) {
        this.traceCollector.emit(
          createTraceEvent({
            correlationId: `turn_${battle.currentTurn ?? 1}`,
            phase: TracePhase.TURN_FLOW,
            battleId: battle.battleId,
            turn: battle.currentTurn,
            level: TraceLevel.INFO,
            summary: `回合 ${battle.currentTurn} 结束`,
            payload: {
              action: TurnFlowAction.TURN_END,
              passiveTriggers: this.passiveSkillManager.getAndResetTurnCounters(),
            },
          }),
        )
      }

      this.battleRecorder.recordTurnEnd(battleId, battle.currentTurn || 1)

      battle.currentTurn++
    } catch (error) {
      LoggerProvider.logger.addDebugLog('处理回合时出错:', {
        level: LogLevel.ERROR,
        error: error as Error,
      })
    } finally {
      this.animationManager.cleanupAnimationState()
    }
  }

  /**
   * 检查参与者是否有控制类Buff
   * @param participant 参与者
   * @returns 是否被控制
   */
  /**
   * 处理战斗回合
   */
  /**

  /**
   * 选择并执行技能
   * @param battle 战斗数据
   * @param source 技能使用者
   * @param skill 技能配置对象
   * @returns 战斗动作
   */
  /**
   * 处理战斗回合
   */

  /**
   * 获取技能的所有目标
   * @param battle 战斗数据
   * @param source 技能使用者
   * @param skill 技能配置
   * @returns 目标参与者数组
   */
  /**
   * 处理战斗回合
   */
  public async processTurn(): Promise<void> {
    await this.processTurnInternal()
  }

  /**
   * 检测战斗结束条件并处理
   * 委托给 ruleManager 进行规则判定，只负责后续副作用（结束战斗、日志）
   */
  private async runEndConditionCheck(): Promise<void> {
    const battle = this.battleData
    if (!battle) return

    //  先结算待处理的死亡：对仍然死亡的角色触发 ON_DEATH/ON_KILL
    // 已被复活的角色跳过死亡被动（修复 F1/F3）
    const pendingDeaths = this.executor.drainPendingDeaths()
    for (const { deadId, killerId } of pendingDeaths) {
      const dead = battle.participants.get(deadId)
      const killer = battle.participants.get(killerId)
      if (dead && !dead.isAlive()) {
        // 最终确认死亡 → 补发击杀 trace（供战报击杀/存活统计）
        // NOTE: lethalMark 事件 result=0，仅作死亡标记；伤害已由 TraceDamageLogger 的
        //       damage_calculation 事件统计，避免双算。phase 未开启时零开销。
        if (this.traceCollector.isEnabled(TracePhase.DAMAGE_CALCULATION)) {
          this.traceCollector.emit(
            createTraceEvent({
              correlationId: `kill_${battle.currentTurn ?? 1}_${deadId}`,
              phase: TracePhase.DAMAGE_CALCULATION,
              battleId: battle.battleId,
              turn: battle.currentTurn ?? 1,
              sourceId: killerId,
              targetId: deadId,
              level: TraceLevel.INFO,
              summary: `${killer?.name ?? '未知'} 击败 ${dead.name}`,
              payload: { result: 0, death: true, lethalMark: true },
            }),
          )
        }
        // 仍然死亡 → 触发死亡被动
        this.passiveSkillManager.triggerPassives(
          dead,
          createPassiveContext(BattleTriggerPhase.ON_DEATH, battle, {
            target: killer, sourceId: killerId, cause: EffectType.DAMAGE,
          }),
        )
        if (killer) {
          this.passiveSkillManager.triggerPassives(
            killer,
            createPassiveContext(BattleTriggerPhase.ON_KILL, battle, {
              target: dead, targetId: deadId, cause: EffectType.DAMAGE,
            }),
          )
        }
      }
      // 若 dead.isAlive() === true（已被复活），跳过死亡被动
    }

    const result = this.ruleManager.checkBattleEndCondition(
      battle.participants,
      battle.currentTurn,
    )
    if (result.shouldEnd && result.winner) {
      await this.endBattle(result.winner)
      if (battle.currentTurn >= battle.maxTurns) {
        const winnerLabel = ParticipantSideName[result.winner!]
        LoggerProvider.logger.addBattleLog({
          turn: battle.currentTurn,
          message: `回合数达到上限(${battle.maxTurns})，${winnerLabel}以血量优势获胜`,
          segments: [
            {
              text: `回合数达到上限(${battle.maxTurns})，${winnerLabel}以血量优势获胜`,
            },
          ],
          category: BATTLE_LOG_CATEGORIES.STATUS,
          meta: { role: 'battle' },
        })
      }
    }
  }

  /**
   * 战斗结束前的 trace 收尾：补发 battle_lifecycle action='battle_end' 生命周期事件
   * + 将 traceEvents 落盘到录制。自然结束（runEndConditionCheck→endBattle）与手动结束
   * （BattleManager.endBattle）共用，保证两条路径录制/战报一致：
   * - 此前无任何发射端发 battle_end，LiveBattleStream.isBattleEnd 恒 false，
   *   实时战斗结束后不收尾、摘要无胜方；补发后实时流与回放都有结束标记
   * - 手动结束此前不落盘 traceEvents，实时战报（buildBattleSummary 从录制派生）恒空
   * phase 未开启时零开销（契约 §3.6 补发型事件模式）
   */
  public finalizeBattleTrace(winner: ParticipantSide): void {
    if (!this.battleData) return
    if (this.traceCollector.isEnabled(TracePhase.BATTLE_LIFECYCLE)) {
      this.traceCollector.emit(
        createTraceEvent({
          correlationId: `end_${this.battleData.battleId}`,
          phase: TracePhase.BATTLE_LIFECYCLE,
          battleId: this.battleData.battleId,
          turn: this.battleData.currentTurn ?? 1,
          level: TraceLevel.INFO,
          summary: `战斗结束 · 胜利者：${ParticipantSideName[winner]}`,
          payload: { action: 'battle_end', winner },
        }),
      )
    }
    // 手动结束路径（BattleManager.endBattle）不调 endRecording，录制 winner 恒空 →
    // 战报（archive.winner）无胜方；这里补齐（自然结束路径由后续 endRecording 覆盖，值一致）
    const rec = this.battleRecorder.getRecording(this.battleData.battleId)
    if (rec && !rec.winner) rec.winner = winner
    this.battleRecorder.recordTraceEvents(
      this.battleData.battleId,
      this.traceCollector.exportAll(),
    )
  }

  /**
   * 结束战斗
   * @param winner - 胜利者类型
   */
  public async endBattle(winner: ParticipantSide): Promise<void> {
    // 战斗结束前将结构化调试追踪事件写入 BattleRecorder（含 battle_end 收尾事件）
    this.finalizeBattleTrace(winner)
    //  补偿可能缺失的回合末态势快照（战斗在回合中途结束时）
    this.ensureFinalSnapshot()
    return this.lifecycleManager.endBattle(winner)
  }

  /** 补偿战斗中途结束时缺失的回合末态势快照 */
  private ensureFinalSnapshot(): void {
    const battle = this.battleData
    if (!battle) return
    //  如果 roundState 已经是 END，说明正常流程已产出快照，无需补偿
    if (battle.roundState === RoundStatus.END) return
    //  投影器统一生成（与回合末快照同口径）
    const turn = battle.currentTurn
    for (const log of projectSnapshotLogs(battle.participants, turn)) {
      LoggerProvider.logger.addBattleLog({
        turn,
        ...log,
      })
    }
  }

  /** 将当前战斗的确定性随机源注入各随机消费方（initialize / resetBattle 共用） */
  private injectRng(rng: SeededRandom): void {
    this.damageCalculator.setRng(rng)
    this.buffSystem.setRng(rng)
    this.passiveSkillManager.setRng(rng)
    this.aiSystem.setRng(rng)
  }

  public resetBattle(): void {
    // ponytail: 清除上一场战斗的被动注册、连击状态和待处理额外行动，防止跨战斗污染
    this.executor.reset() // 新增：重置 pendingDeaths / currentActionOrder，防止跨战斗残留
    this.passiveSkillManager.clearAll()
    this.skillManager.getExecutor().clearAllComboStates()
    this.skillManager.getExecutor().clearAllRotatingStates()
    this.skillManager.getExecutor().drainExtraActions()
    this.threatManager.reset()
    // NOTE: 重建确定性随机源并同步重新注入 — 防止 reset 后 battleData.rng 与
    //       各消费方持有的引用漂移（下一场 initialize 仍会重建 + 重新注入）
    if (this.battleData) {
      this.battleData.rng = new SeededRandom(SeededRandom.generateSeed())
      this.injectRng(this.battleData.rng)
    }
    if (this.battleData) {
      this.fieldEffectManager.removeAll(this.battleData.participants, this.buffSystem)
    }
    this.fieldEffectManager.reset()
    this.formationManager.removeAll(this.buffSystem)
    this.formationManager.reset()
    this.reviveTracker.reset()
    this.currentAllyFormation = null
    this.currentEnemyFormation = null
    this.lifecycleManager.resetBattle()
    //  兜底清理触发器事件总线残留监听器（正常路径 removeBuff 已反注册，此处防漏网）
    this.getTriggerEventBus().clear()
    //  清空调试追踪收集器 — 战斗隔离（文档 §3.2）：上一场战斗的 TraceEvent 不混入下一场
    this.traceCollector.clear()
  }

  public getBattleStatus(): string | undefined {
    return this.battleData?.battleState
  }

  public setBattleState(status: BattleStatus): void {
    if (this.battleData) {
      this.battleData.battleState = status
    }
  }



  public getAutoBattle(): boolean {
    return this.battleData?.autoBattle ?? false
  }

  public getIsPaused(): boolean {
    return this.battleData?.battleState === BattleStatus.PAUSED
  }

  public getBattleSpeed(): number {
    return this.battleData?.battleSpeed ?? 1
  }

  public setSpeed(speed: number): void {
    if (this.battleData) this.battleData.battleSpeed = speed
  }

  /**  设置快速战斗模式（跳过动画和等待） */
  public setQuickMode(enabled: boolean): void {
    if (this.battleData) {
      this.battleData.quickMode = enabled
    }
  }

  /**  获取快速战斗模式状态 */
  public getQuickMode(): boolean {
    return this.battleData?.quickMode ?? false
  }

  /**  设置无头模式（批量生成用，抑制所有 UI 动画事件） */
  public setHeadless(enabled: boolean): void {
    if (this.battleData) {
      this.battleData.headless = enabled
    }
  }

  /**  获取无头模式状态 */
  public getHeadless(): boolean {
    return this.battleData?.headless ?? false
  }

  /**  是否抑制 UI 动画事件发射（快速战斗 || 无头模式） */
  private shouldSuppressAnimationEvents(): boolean {
    return !!(this.battleData?.quickMode || this.battleData?.headless)
  }

  /**  重新生成战斗ID（用于批量生成场景中每场战斗拥有独立ID） */
  public regenerateBattleId(): void {
    const id = this.generateBattleId()
    if (this.battleData) {
      this.battleData.battleId = id
    }
  }

  public togglePause(): void {
    this.lifecycleManager.togglePause()
  }

  public isBattleInProgress(): boolean {
    return this.battleData?.battleState === BattleStatus.ACTIVE
  }

  public getBattleState(): BattleState | undefined {
    const battle = this.battleData
    if (!battle) return undefined
    return convertToBattleState(battle)
  }

  public async startAutoBattleLoop(): Promise<void> {
    this.lifecycleManager.startAutoBattleLoop()
  }

  public getEnabledAllyTeam(): BattleEntity[] {
    return Array.from(this.battleData.participants.values()).filter(
      (p) => p.enabled && p.team === ParticipantSide.ALLY,
    )
  }

  public getEnabledEnemyTeam(): BattleEntity[] {
    return Array.from(this.battleData.participants.values()).filter(
      (p) => p.enabled && p.team === ParticipantSide.ENEMY,
    )
  }

  public stopAutoBattle(): void {
    this.lifecycleManager.stopAutoBattle()
  }

  /**
   * 获取技能管理器实例
   */
  public getSkillManager(): SkillManager {
    return this.skillManager
  }

  /**
   * 加载技能配置
   */
  public loadSkillConfigs(skillConfigs: SkillConfig[]): void {
    this.skillManager.loadSkillConfigs(skillConfigs)
  }

  // 战斗记录相关方法（从原始版本继承）

  /**
   * 获取战斗记录
   */
  public getBattleRecording(battleId: string) {
    return this.battleRecorder.getRecording(battleId)
  }

  /**
   * 获取所有战斗记录
   */
  public getAllBattleRecordings() {
    return this.battleRecorder.getAllRecordings()
  }

  /**
   * 保存战斗记录
   */
  public async saveBattleRecording(battleId: string, name?: string): Promise<string | null> {
    return this.battleRecorder.saveRecording(battleId, name)
  }

  /**
   * 加载战斗记录
   */
  public async loadBattleRecording(saveKey: string): Promise<RecordedBattle | null> {
    return this.battleRecorder.loadRecording(saveKey)
  }

  /**
   * 获取保存的战斗记录列表
   */
  public async getSavedBattleRecordingsList(): Promise<string[]> {
    return this.battleRecorder.getSavedRecordingsList()
  }

  /**
   * 删除战斗记录
   */
  public async deleteBattleRecording(saveKey: string): Promise<boolean> {
    return this.battleRecorder.deleteRecording(saveKey)
  }

  /**
   * 按 battleId 删除持久化战斗记录
   */
  public async deleteBattleRecordingByBattleId(battleId: string): Promise<boolean> {
    return this.battleRecorder.deleteRecordingByBattleId(battleId)
  }

  /**
   * 清空所有战斗记录
   */
  public clearAllBattleRecordings() {
    this.battleRecorder.clearRecordings()
  }

  /**
   * 获取当前战斗数据
   */
  public getBattleData(): BattleData | undefined {
    return this.battleData
  }

  // ===================== 命令生成器（第三阶段） =====================

  /**
   * 推进到下一回合（递增回合计数器）
   * ponytail: 从 generateCommandsForTurn 中抽取，消除命令生成器的副作用
   */
  public advanceRound(): void {
    if (this.battleData) {
      this.battleData.currentTurn++
    }
  }

  /**
   * 从当前战斗状态生成命令序列
   * 这是第三阶段核心方法：将 BattleSystem 从"状态修改器"转变为"命令生成器"
   * 调用方须在调用前先调用 advanceRound() 推进回合
   * @returns BattleCommand[] 命令序列，由调用方（Store）负责执行
   */
  public generateCommandsForTurn(): BattleCommand[] {
    const battle = this.battleData
    if (
      !battle ||
      battle.battleState === BattleStatus.PAUSED ||
      battle.battleState !== BattleStatus.ACTIVE
    ) {
      return []
    }

    const commands: BattleCommand[] = []
    const aliveParticipants = Array.from(battle.participants.values()).filter(
      (p) => p.isAlive(),
    )

    if (aliveParticipants.length === 0) {
      // 战斗已在 runEndConditionCheck 中结束，此处不再重复触发
      // 仅当 battleState 仍为 ACTIVE 时才生成 SET_WINNER（兜底保护）
      if (battle.battleState === BattleStatus.ACTIVE) {
        const result = this.ruleManager.checkBattleEndCondition(
          battle.participants,
          battle.currentTurn,
        )
        if (result.winner) {
          commands.push({
            type: 'SET_WINNER',
            payload: {
              winner:
                result.winner,
            },
          })
        }
      }
      return commands
    }

    // ponytail: 回合递增已由调用方通过 advanceRound() 提前完成
    const turnOrder = this.turnManager.createTurnOrder(
      Array.from(battle.participants.values()),
      battle.rng,
      this.ruleManager.getTurnSystemRules().speedFirst,
    )

    commands.push({
      type: 'NEXT_TURN',
      payload: {
        actorId: turnOrder[0] || '',
        round: battle.currentTurn,
        turnOrder,
      },
    })

    // 重置所有存活角色的受击能量计数器
    for (const p of aliveParticipants) {
      commands.push({
        type: 'RESET_ENERGY_HIT_COUNT',
        payload: { targetId: p.id },
      })
    }

    // 为存活角色生成能量增加命令
    const combatRules = this.ruleManager.getCombatRules()
    for (const p of aliveParticipants) {
      commands.push({
        type: 'GAIN_ENERGY',
        payload: { targetId: p.id, amount: combatRules.energyGainPerTurn },
      })
    }

    // 为每个参与者生成行动命令
    for (const participantId of turnOrder) {
      const participant = battle.participants.get(participantId)
      if (!participant || !participant.isAlive()) continue

      // 检查是否被控制
      if (participant.hasBuff(STUN_BUFF_ID)) continue

      // 默认攻击（AI 决策后续扩展）
      const targetId = this.selectCommandTarget(battle, participant)
      if (targetId) {
        const damage = participant.getAttribute(ATTRIBUTE_CODE.attack)
        commands.push({
          type: 'APPLY_DAMAGE',
          payload: {
            targetId,
            amount: damage,
            sourceId: participantId,
          },
        })
        // ponytail: 简化版 — 仅生成基础伤害命令，技能/Buff命令后续扩展
      }
    }

    return commands
  }

  /**
   * 手动干预：让指定存活参战者立即对指定目标执行一次指定行动（技能或普攻）。
   * 走完整执行管线（被动/伤害/日志/动画），不经过 AI 决策。
   * 用于调试沙盒手动验证技能连招（配合手动模式在暂停状态下使用）。
   * @param participantId 施法者 id
   * @param skillId 技能 id；null 表示普攻
   * @param targetId 目标 id
   */
  /** 手动行动并发锁（防快速连点） */
  private manualActionLock = false

  /**
   * 手动干预：让指定存活参战者立即对指定目标执行一次指定行动（技能或普攻）。
   * 走完整执行管线（被动/伤害/日志/动画），不经过 AI 决策。
   * 用于调试沙盒手动验证技能连招（配合手动模式在暂停状态下使用）。
   * @param participantId 施法者 id
   * @param skillId 技能 id；null 表示普攻
   * @param targetId 目标 id
   * @returns 失败原因字符串；成功返回 null
   */
  public async executeManualAction(
    participantId: string,
    skillId: string | null,
    targetId: string,
  ): Promise<string | null> {
    if (this.manualActionLock) return '已有手动行动执行中'
    const battle = this.battleData
    const source = battle?.participants.get(participantId)
    if (!battle || !source) return '施法者不存在'
    if (!source.isAlive()) return '施法者已阵亡'
    const target = battle.participants.get(targetId)
    if (!target) return '目标不存在'
    if (!target.isAlive()) return '目标已阵亡'

    this.manualActionLock = true
    try {
      if (skillId) {
        const skill = this.skillManager.getSkillConfig(skillId)
        if (!skill) return '技能不存在'
        const energy = source.getAttribute(ATTRIBUTE_CODE.currentEnergy)
        const availability = source.canExecuteSkill(
          source.id,
          skill.id,
          energy,
          this.buffSystem,
        )
        if (!availability.can) {
          return `技能不可用：${MANUAL_ACTION_BLOCK_LABELS[availability.reason] ?? availability.reason}`
        }
        await this.executor.selectAndExecuteSkill(battle, source, skill, targetId)
      } else {
        await this.executor.selectAndExecuteAttack(battle, source, targetId)
      }
      source.afterAction()
      return null
    } finally {
      this.manualActionLock = false
    }
  }

  /**
   * 选择一个攻击目标
   */
  private selectCommandTarget(
    battle: BattleData,
    source: BattleEntity,
  ): string | null {
    const enemies = Array.from(battle.participants.values()).filter(
      (p) => p.team !== source.team && p.isAlive(),
    )
    if (enemies.length === 0) return null
    return enemies[battle.rng.nextInt(0, enemies.length - 1)].id
  }
}
