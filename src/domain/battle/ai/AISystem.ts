/**
 * 文件: AISystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: AI系统
 * 描述: 负责创建AI实例、做出战斗决策、选择目标和使用技能，实现了IAISystem接口，处理AI的智能行为逻辑
 * 版本: 1.0.0
 */

import type {
  BattleEntity,
  BattleState,
  BattleAction,
  BattleData,
} from '@/domain/battle/type/types'
import { BattleStatus } from '@/domain/battle/type/types'
import type { SkillManager } from '@/domain/skill/SkillManager'
import type { BuffConfigLookup } from '@/domain/skill/types'
import type { TraceScope } from '@/shared/types/trace-event'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'
import { BattleAIFactory, BattleAI } from '@/domain/battle/ai/BattleAI'
import type { SeededRandom } from '@/shared/utils/SeededRandom'

/**
 * AI系统类
 * 负责创建AI实例、做出战斗决策、选择目标和使用技能
 * 实现了IAISystem接口，处理AI的智能行为逻辑
 * 推荐通过容器注入使用
 */
export class AISystem {
  /** AI实例存储映射，以参与者ID为键，用于缓存和复用 */
  private aiInstances = new Map<string, BattleAI>()
  /** 调试追踪端口（由 BattleSystem 注入，转发给每个 AI 实例——含 getOrCreateAI 惰性创建的） */
  private tracePort?: IDebugTracePort
  /** 确定性随机源（由 BattleSystem.initialize 注入，转发给每个 AI 实例） */
  private rng?: SeededRandom

  /** 设置确定性随机源（BattleSystem.initialize 时注入，含惰性创建的实例） */
  setRng(rng: SeededRandom): void {
    this.rng = rng
    this.aiInstances.forEach((ai) => ai.setRng(rng))
  }

  /** 设置调试追踪端口（BattleSystem 初始化时注入） */
  setTracePort(port: IDebugTracePort | null): void {
    this.tracePort = port ?? undefined
    // 已创建的实例立即生效
    this.aiInstances.forEach((ai) => ai.setTracePort(this.tracePort ?? null))
  }
  /** 技能管理器实例（通过构造函数注入） */
  private skillManager: SkillManager
  /** Buff 极性查询（由 BuffScriptRegistry 已解析配置提供，AI 技能标记不依赖 ID 前缀） */
  private buffLookup: BuffConfigLookup

  /**
   * 私有构造函数
   * @param skillManager 技能管理器实例（通过构造函数注入）
   * @param buffLookup Buff 极性查询（缺省返回 undefined，不判定减益）
   */
  constructor(
    skillManager: SkillManager,
    buffLookup: BuffConfigLookup = () => undefined,
  ) {
    this.skillManager = skillManager
    this.buffLookup = buffLookup
  }

  /**
   * 创建AI实例集合
   * 为每个参与者创建对应类型的AI实例，并缓存到管理器中
   * @param participants - 参与者映射表，包含所有需要AI控制的参与者
   * @returns Map<string, BattleAI> - 以参与者ID为键的AI实例映射表
   */
  public createAIInstances(
    participants: Map<string, BattleEntity>,
  ): Map<string, BattleAI> {
    const aiInstances = new Map<string, BattleAI>()
    participants.forEach((participant) => {
      const ai = BattleAIFactory.createAIWithSkills(
        participant.team,
        participant.getSkillList(),
        this.buffLookup,
      )
      ai.setTracePort(this.tracePort ?? null)
      if (this.rng) ai.setRng(this.rng)
      aiInstances.set(participant.id, ai)
      this.aiInstances.set(participant.id, ai)
    })

    return aiInstances
  }

  /**
   * 获取或创建AI实例
   * 如果参与者已有AI实例则返回，否则创建新的AI实例
   * @param participant - 需要AI实例的参与者
   * @returns BattleAI | null - AI实例，如果无法创建返回null
   */
  private getOrCreateAI(participant: BattleEntity): BattleAI | null {
    let ai = this.aiInstances.get(participant.id)

    if (!ai) {
      ai = BattleAIFactory.createAIWithSkills(
        participant.team,
        participant.getSkillList(),
        this.buffLookup,
      )
      // 惰性创建的实例同样注入追踪端口（AI_DECISION 事件不丢失）
      ai.setTracePort(this.tracePort ?? null)
      if (this.rng) ai.setRng(this.rng)
      this.aiInstances.set(participant.id, ai)
    }

    return ai
  }

  /**
   * 做出战斗决策
   * 根据当前战斗状态和参与者信息，生成最优的战斗动作
   * @param battleState - 当前战斗状态，包含所有参与者信息和回合状态
   * @param participant - 当前需要决策的参与者
   * @returns BattleAction - 生成的战斗动作，包含攻击目标、技能选择等
   */
  public makeDecision(
    battleState: BattleState,
    participant: BattleEntity,
    trace?: TraceScope,
  ): BattleAction {
    const ai = this.getOrCreateAI(participant)
    if (!ai) {
      throw new Error(`Failed to create AI for participant: ${participant.id}`)
    }

    return ai.makeDecision(battleState, participant, trace)
  }

  /**
   * 移除单个AI实例
   * 当参与者被移除或死亡时，清理其对应的AI实例缓存
   * @param participantId - 要移除AI实例的参与者ID
   */
  public removeAI(participantId: string): void {
    this.aiInstances.delete(participantId)
  }

  /**
   * 清空所有AI实例
   * 在系统重置或大规模清理时调用
   */
  public clearAllAI(): void {
    this.aiInstances.clear()
  }

}
