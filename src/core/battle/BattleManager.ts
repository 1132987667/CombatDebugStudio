import type { BattleState, BattleParticipant, BattleEntityType, BattleAction } from '@/types/battle';
import type { ParticipantInfo } from '@/types/battle';
import { container } from '../di/Container';
import { logger } from '@/utils/logger';
import { TurnManager } from './TurnManager';
import { ActionExecutor } from './ActionExecutor';
import { ParticipantManager } from './ParticipantManager';
import { AISystem } from './AISystem';
import { BattleRecorder } from './BattleRecorder';

interface BattleData {
  battleId: string;
  participants: Map<string, BattleParticipant>;
  actions: BattleAction[];
  turnOrder: string[];
  currentTurn: number;
  isActive: boolean;
  startTime: number;
  endTime?: number;
  winner?: BattleEntityType;
  aiInstances: Map<string, any>;
}

export class BattleManager {
  private battles = new Map<string, BattleData>();
  private battleLogger = logger;
  private turnManager: TurnManager;
  private actionExecutor: ActionExecutor;
  private participantManager: ParticipantManager;
  private aiSystem: AISystem;
  private battleRecorder: BattleRecorder;

  constructor() {
    this.turnManager = container.resolve<TurnManager>('TurnManager');
    this.actionExecutor = container.resolve<ActionExecutor>('ActionExecutor');
    this.participantManager = container.resolve<ParticipantManager>('ParticipantManager');
    this.aiSystem = container.resolve<AISystem>('AISystem');
    this.battleRecorder = new BattleRecorder();
  }

  public createBattle(participantsInfo: ParticipantInfo[]): BattleState {
    const battleId = `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const participants = this.participantManager.createParticipants(participantsInfo);
    const turnOrder = this.turnManager.createTurnOrder(Array.from(participants.values()));
    const aiInstances = this.aiSystem.createAIInstances(participants);

    const battleData: BattleData = {
      battleId,
      participants,
      actions: [],
      turnOrder,
      currentTurn: 0,
      isActive: true,
      startTime: Date.now(),
      winner: undefined,
      aiInstances,
    };

    this.battles.set(battleId, battleData);
    
    // 开始记录战斗
    this.battleRecorder.startRecording(battleId, {
      participants: participantsInfo
    });

    this.battleLogger.info(`Battle created: ${battleId}`, {
      participantCount: participantsInfo.length,
      characterCount: participantsInfo.filter((p) => p.type === 'character').length,
      enemyCount: participantsInfo.filter((p) => p.type === 'enemy').length,
    });

    const initAction = {
      id: `init_${Date.now()}`,
      type: 'attack',
      sourceId: 'system',
      targetId: 'system',
      damage: 0,
      heal: 0,
      success: true,
      timestamp: Date.now(),
      turn: 0,
      effects: [
        {
          type: 'status',
          description: `战斗开始！参战角色: ${participantsInfo.filter((p) => p.type === 'character').length} 人，参战敌人: ${participantsInfo.filter((p) => p.type === 'enemy').length} 人`,
          duration: 0,
        },
      ],
    };

    this.addBattleAction(battleId, initAction);
    
    // 记录初始化动作
    this.battleRecorder.recordAction(battleId, initAction, 0);

    return this.convertToBattleState(battleData);
  }

  public async processTurn(battleId: string): Promise<void> {
    const battle = this.battles.get(battleId);
    if (!battle || !battle.isActive) {
      return;
    }

    this.participantManager.gainEnergyToAllAlive(battle.participants, 25);

    this.turnManager.updateTurnIndex(battle);

    const currentParticipantId = battle.turnOrder[battle.currentTurn];
    const participant = battle.participants.get(currentParticipantId);

    if (!participant || !participant.isAlive()) {
      battle.currentTurn++;
      return;
    }

    // 记录回合开始事件
    const currentTurn = battle.currentTurn + 1;
    this.battleRecorder.recordTurnStart(battleId, currentTurn, currentParticipantId);

    try {
      await this.aiSystem.executeAIAction(battle, participant, this.actionExecutor);
    } catch (error) {
      this.battleLogger.error('AI决策出错:', error);
      await this.actionExecutor.executeDefaultAction(battle, participant);
    }

    // 记录回合结束事件
    this.battleRecorder.recordTurnEnd(battleId, currentTurn);

    battle.currentTurn++;

    this.checkBattleEndCondition(battle);
  }

  public async executeAction(action: BattleAction): Promise<BattleAction> {
    const battle = this.findBattleByParticipant(action.sourceId);
    if (!battle) {
      throw new Error(
        `No active battle found for participant ${action.sourceId}`,
      );
    }

    const executedAction = await this.actionExecutor.executeAction(action, battle);
    this.addBattleAction(battle.battleId, executedAction);

    // 记录动作事件
    const currentTurn = battle.currentTurn + 1;
    this.battleRecorder.recordAction(battle.battleId, executedAction, currentTurn);

    return executedAction;
  }

  public getBattleState(battleId: string): BattleState | undefined {
    const battle = this.battles.get(battleId);
    if (!battle) return undefined;

    return this.convertToBattleState(battle);
  }

  public endBattle(battleId: string, winner: BattleEntityType): void {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    battle.isActive = false;
    battle.winner = winner;
    battle.endTime = Date.now();

    const endAction = {
      id: `end_${Date.now()}`,
      type: 'skill',
      sourceId: 'system',
      targetId: 'system',
      success: true,
      timestamp: Date.now(),
      turn: battle.currentTurn + 1,
      effects: [
        {
          type: 'status',
          description: `战斗结束！胜利者: ${winner === 'character' ? '角色方' : '敌方'}`,
          duration: 0,
        },
      ],
    };

    this.addBattleAction(battleId, endAction);
    
    // 记录结束动作
    this.battleRecorder.recordAction(battleId, endAction, battle.currentTurn + 1);
    
    // 结束记录并保存战斗过程
    this.battleRecorder.endRecording(battleId, winner);
    this.battleRecorder.saveRecording(battleId);

    this.battleLogger.info(`Battle ended: ${battleId}`, { winner });
  }

  private addBattleAction(battleId: string, action: BattleAction): void {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    battle.actions.push(action);

    if (battle.actions.length > 100) {
      battle.actions = battle.actions.slice(-100);
    }
  }

  private findBattleByParticipant(participantId: string): BattleData | undefined {
    for (const battle of this.battles.values()) {
      if (battle.participants.has(participantId) && battle.isActive) {
        return battle;
      }
    }
    return undefined;
  }

  private checkBattleEndCondition(battle: BattleData): void {
    const aliveCharacters = Array.from(battle.participants.values()).filter(
      (p) => p.type === 'character' && p.isAlive(),
    );
    const aliveEnemies = Array.from(battle.participants.values()).filter(
      (p) => p.type === 'enemy' && p.isAlive(),
    );

    if (aliveCharacters.length === 0) {
      this.endBattle(battle.battleId, 'enemy');
    } else if (aliveEnemies.length === 0) {
      this.endBattle(battle.battleId, 'character');
    }
  }

  private convertToBattleState(battleData: BattleData): BattleState {
    return {
      battleId: battleData.battleId,
      participants: new Map(battleData.participants),
      actions: [...battleData.actions],
      turnOrder: [...battleData.turnOrder],
      currentTurn: battleData.currentTurn,
      isActive: battleData.isActive,
      startTime: battleData.startTime,
      endTime: battleData.endTime,
      winner: battleData.winner,
    };
  }

  public getAllBattles(): BattleState[] {
    return Array.from(this.battles.values()).map((b) =>
      this.convertToBattleState(b),
    );
  }

  public getActiveBattles(): BattleState[] {
    return Array.from(this.battles.values())
      .filter((b) => b.isActive)
      .map((b) => this.convertToBattleState(b));
  }

  public clearCompletedBattles(): void {
    for (const [battleId, battle] of this.battles.entries()) {
      if (!battle.isActive) {
        this.battles.delete(battleId);
      }
    }
  }

  // 战斗记录相关方法
  public getBattleRecording(battleId: string) {
    return this.battleRecorder.getRecording(battleId);
  }

  public getAllBattleRecordings() {
    return this.battleRecorder.getAllRecordings();
  }

  public saveBattleRecording(battleId: string, name?: string) {
    return this.battleRecorder.saveRecording(battleId, name);
  }

  public loadBattleRecording(saveKey: string) {
    return this.battleRecorder.loadRecording(saveKey);
  }

  public getSavedBattleRecordingsList() {
    return this.battleRecorder.getSavedRecordingsList();
  }

  public deleteBattleRecording(saveKey: string) {
    return this.battleRecorder.deleteRecording(saveKey);
  }

  public clearAllBattleRecordings() {
    this.battleRecorder.clearRecordings();
  }
}