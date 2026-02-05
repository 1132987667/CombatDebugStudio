// 战斗系统核心接口定义

// 类型导入
import type {
  BattleState,
  BattleAction,
  BattleParticipant,
  BattleEntityType,
  ParticipantInfo
} from '@/types/battle';

import type { BattleAI } from '@/core/BattleAI';

/**
 * 战斗系统接口
 * 定义了战斗系统的核心功能，包括战斗创建、执行、查询和管理
 */
export interface IBattleSystem {
  createBattle(participantsInfo: ParticipantInfo[]): BattleState;
  processTurn(battleId: string): Promise<void>;
  executeAction(action: BattleAction): Promise<BattleAction>;
  getBattleState(battleId: string): BattleState | undefined;
  endBattle(battleId: string, winner: BattleEntityType): void;
  getAllBattles(): BattleState[];
  getActiveBattles(): BattleState[];
  clearCompletedBattles(): void;
  
  /**
   * 自动战斗相关方法
   */
  startAutoBattle(battleId: string, speed: number): void;
  stopAutoBattle(battleId: string): void;
  isAutoBattleActive(battleId: string): boolean;
  setAutoBattleSpeed(battleId: string, speed: number): void;
}

/**
 * 回合管理器接口
 * 负责管理战斗回合的推进和计算
 */
export interface ITurnManager {
  calculateNextTurn(battleId: string): string | null;
  getCurrentTurn(battleId: string): number;
  advanceTurn(battleId: string): void;
}

/**
 * 动作执行器接口
 * 负责执行和验证战斗动作
 */
export interface IActionExecutor {
  executeAction(action: BattleAction): Promise<void>;
  validateAction(action: BattleAction): boolean;
}

/**
 * 参与者管理器接口
 * 负责管理战斗参与者的创建、查询和更新
 */
export interface IParticipantManager {
  createParticipant(info: ParticipantInfo): BattleParticipant;
  getParticipant(battleId: string, participantId: string): BattleParticipant | undefined;
  updateParticipant(battleId: string, participantId: string, updates: Partial<BattleParticipant>): void;
}

/**
 * AI系统接口
 * 负责创建AI实例并做出战斗决策
 */
export interface IAISystem {
  createAIInstances(participants: Map<string, BattleParticipant>): Map<string, BattleAI>;
  makeDecision(battleState: BattleState, participant: BattleParticipant): BattleAction;
  selectTarget(battleState: BattleState, participant: BattleParticipant): string;
  shouldUseSkill(participant: BattleParticipant): boolean;
}

// 依赖注入令牌
// 用于依赖注入系统，确保模块间的松耦合
export const BATTLE_SYSTEM_TOKEN = Symbol('BattleSystem');
export const TURN_MANAGER_TOKEN = Symbol('TurnManager');
export const ACTION_EXECUTOR_TOKEN = Symbol('ActionExecutor');
export const PARTICIPANT_MANAGER_TOKEN = Symbol('ParticipantManager');
export const AI_SYSTEM_TOKEN = Symbol('AISystem');