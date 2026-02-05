import type { BattleParticipant, BattleState, BattleAction } from '@/types/battle';
import { BattleAIFactory, BattleAI } from '../BattleAI';
import { ActionExecutor } from './ActionExecutor';

/**
 * 战斗数据接口
 * 存储战斗的完整信息，用于AI决策时的上下文获取
 */
interface BattleData {
  /** 战斗的唯一标识符 */
  battleId: string;
  /** 参与者映射表，以参与者ID为键 */
  participants: Map<string, BattleParticipant>;
  /** 战斗动作历史记录 */
  actions: BattleAction[];
  /** 回合顺序数组，存储参与者ID */
  turnOrder: string[];
  /** 当前回合号 */
  currentTurn: number;
  /** 战斗是否处于活跃状态 */
  isActive: boolean;
  /** 每个参与者的AI实例映射表 */
  aiInstances: Map<string, BattleAI>;
}

/**
 * AI系统类
 * 负责创建AI实例、做出战斗决策、选择目标和使用技能
 * 实现了IAISystem接口，处理AI的智能行为逻辑
 */
export class AISystem {
  /** AI实例存储映射，以参与者ID为键，用于缓存和复用 */
  private aiInstances = new Map<string, BattleAI>();

  /**
   * 创建AI实例集合
   * 为每个参与者创建对应类型的AI实例，并缓存到管理器中
   * @param participants - 参与者映射表，包含所有需要AI控制的参与者
   * @returns Map<string, BattleAI> - 以参与者ID为键的AI实例映射表
   */
  public createAIInstances(participants: Map<string, BattleParticipant>): Map<string, BattleAI> {
    const aiInstances = new Map<string, BattleAI>();

    participants.forEach((participant) => {
      const ai = BattleAIFactory.createAI(participant.type);
      aiInstances.set(participant.id, ai);
      this.aiInstances.set(participant.id, ai);
    });

    return aiInstances;
  }

  /**
   * 做出战斗决策
   * 根据当前战斗状态和参与者信息，生成最优的战斗动作
   * @param battleState - 当前战斗状态，包含所有参与者信息和回合状态
   * @param participant - 当前需要决策的参与者
   * @returns BattleAction - 生成的战斗动作，包含攻击目标、技能选择等
   */
  public makeDecision(battleState: BattleState, participant: BattleParticipant): BattleAction {
    let ai = this.aiInstances.get(participant.id);

    if (!ai) {
      ai = BattleAIFactory.createAI(participant.type);
      this.aiInstances.set(participant.id, ai);
    }

    return ai.makeDecision(battleState, participant);
  }

  /**
   * 选择攻击目标
   * 从敌对方中随机选择一个存活的目标作为攻击对象
   * @param battleState - 当前战斗状态
   * @param participant - 选择目标的主体参与者
   * @returns string - 选中目标的参与者ID，如果没有有效目标返回空字符串
   */
  public selectTarget(battleState: BattleState, participant: BattleParticipant): string {
    const enemies = Array.from(battleState.participants.values()).filter(
      (p) => p.type !== participant.type && p.isAlive()
    );

    if (enemies.length === 0) {
      return '';
    }

    const randomIndex = Math.floor(Math.random() * enemies.length);
    return enemies[randomIndex].id;
  }

  /**
   * 判断是否应该使用技能
   * 根据参与者的当前能量值和随机因素决定是否释放技能
   * 能量越高使用概率越大，满能量时30%概率使用大招
   * @param participant - 要判断的参与者
   * @returns boolean - 应该使用技能返回true，否则返回false
   */
  public shouldUseSkill(participant: BattleParticipant): boolean {
    if (participant.currentEnergy < 50) {
      return false;
    }

    if (participant.currentEnergy >= 100) {
      return Math.random() > 0.3;
    }

    return Math.random() > 0.7;
  }

  /**
   * 执行AI动作
   * 综合决策、目标选择和动作执行，生成并执行完整的AI回合动作
   * @param battle - 当前战斗数据对象
   * @param participant - 当前执行动作的参与者
   * @param actionExecutor - 动作执行器实例，用于执行生成的战斗动作
   * @returns Promise<void> - 异步执行，完成后无返回值
   */
  public async executeAIAction(battle: BattleData, participant: BattleParticipant, actionExecutor: ActionExecutor): Promise<void> {
    let ai = this.aiInstances.get(participant.id);

    if (!ai) {
      const defaultAi = BattleAIFactory.createAI(participant.type);
      this.aiInstances.set(participant.id, defaultAi);
      await actionExecutor.executeDefaultAction(battle, participant);
      return;
    }

    const battleState = this.convertToBattleState(battle);
    const action = ai.makeDecision(battleState, participant);
    action.turn = battle.currentTurn + 1;

    const target = battle.participants.get(action.targetId);
    if (target && target.isAlive()) {
      await actionExecutor.executeAction(action);
    } else {
      await actionExecutor.executeDefaultAction(battle, participant);
    }
  }

  /**
   * 移除单个AI实例
   * 当参与者被移除或死亡时，清理其对应的AI实例缓存
   * @param participantId - 要移除AI实例的参与者ID
   */
  public removeAI(participantId: string): void {
    this.aiInstances.delete(participantId);
  }

  /**
   * 清空所有AI实例
   * 在系统重置或大规模清理时调用
   */
  public clearAllAI(): void {
    this.aiInstances.clear();
  }

  /**
   * 转换为战斗状态
   * 将内部BattleData转换为BattleState，用于AI决策
   * 私有方法，仅在AI决策过程中调用
   * @param battle - 战斗数据对象
   * @returns BattleState - 转换后的战斗状态对象
   */
  private convertToBattleState(battle: BattleData): BattleState {
    return {
      battleId: battle.battleId,
      participants: new Map(battle.participants),
      actions: [...battle.actions],
      turnOrder: [...battle.turnOrder],
      currentTurn: battle.currentTurn,
      isActive: battle.isActive,
      startTime: 0,
      endTime: undefined,
      winner: undefined,
    };
  }
}
