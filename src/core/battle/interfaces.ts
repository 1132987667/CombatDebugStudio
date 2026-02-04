// 战斗系统核心接口定义
export interface IBattleSystem {
  createBattle(participantsInfo: ParticipantInfo[]): BattleState;
  getBattleState(battleId: string): BattleState | undefined;
  endBattle(battleId: string, winner: BattleEntityType): void;
  getAllBattles(): BattleState[];
  getActiveBattles(): BattleState[];
  clearCompletedBattles(): void;
}

export interface ITurnManager {
  calculateNextTurn(battleId: string): string | null;
  getCurrentTurn(battleId: string): number;
  advanceTurn(battleId: string): void;
}

export interface IActionExecutor {
  executeAction(action: BattleAction): Promise<void>;
  validateAction(action: BattleAction): boolean;
}

export interface IParticipantManager {
  createParticipant(info: ParticipantInfo): BattleParticipant;
  getParticipant(battleId: string, participantId: string): BattleParticipant | undefined;
  updateParticipant(battleId: string, participantId: string, updates: Partial<BattleParticipant>): void;
}

export interface IAISystem {
  createAIInstances(participants: Map<string, BattleParticipant>): Map<string, BattleAI>;
  makeDecision(battleState: BattleState, participant: BattleParticipant): BattleAction;
}

// 依赖注入令牌
export const BATTLE_SYSTEM_TOKEN = Symbol('BattleSystem');
export const TURN_MANAGER_TOKEN = Symbol('TurnManager');
export const ACTION_EXECUTOR_TOKEN = Symbol('ActionExecutor');
export const PARTICIPANT_MANAGER_TOKEN = Symbol('ParticipantManager');
export const AI_SYSTEM_TOKEN = Symbol('AISystem');

// 类型导入
export type {
  BattleState,
  BattleAction,
  BattleParticipant,
  BattleEntityType,
  ParticipantInfo,
  BattleAI
} from '@/types/battle';