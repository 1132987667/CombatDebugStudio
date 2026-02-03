import type { BattleParticipant, BattleState, BattleAction } from '@/types/battle';
import { BattleAIFactory, BattleAI } from '../BattleAI';
import { ActionExecutor } from './ActionExecutor';

interface Battle {
  battleId: string;
  participants: Map<string, BattleParticipant>;
  actions: BattleAction[];
  turnOrder: string[];
  currentTurn: number;
  isActive: boolean;
  aiInstances: Map<string, BattleAI>;
}

export class AISystem {
  public createAIInstances(participants: Map<string, BattleParticipant>): Map<string, BattleAI> {
    const aiInstances = new Map<string, BattleAI>();

    participants.forEach((participant) => {
      const ai = BattleAIFactory.createAI(participant.type);
      aiInstances.set(participant.id, ai);
    });

    return aiInstances;
  }

  public async executeAIAction(battle: Battle, participant: BattleParticipant, actionExecutor: ActionExecutor): Promise<void> {
    const ai = battle.aiInstances.get(participant.id);
    if (!ai) {
      const defaultAi = BattleAIFactory.createAI(participant.type);
      battle.aiInstances.set(participant.id, defaultAi);
      await actionExecutor.executeDefaultAction(battle, participant);
      return;
    }

    const battleState = this.convertToBattleState(battle);
    const action = ai.makeDecision(battleState, participant);
    action.turn = battle.currentTurn + 1;

    const target = battle.participants.get(action.targetId);
    if (target && target.isAlive()) {
      await actionExecutor.executeAction(action, battle);
    } else {
      await actionExecutor.executeDefaultAction(battle, participant);
    }
  }

  private convertToBattleState(battle: Battle): BattleState {
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