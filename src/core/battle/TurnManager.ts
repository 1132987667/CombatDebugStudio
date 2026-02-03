import type { BattleParticipant } from '@/types/battle';

interface Battle {
  currentTurn: number;
  turnOrder: string[];
  isActive: boolean;
}

export class TurnManager {
  public createTurnOrder(participants: BattleParticipant[]): string[] {
    return participants
      .sort((a, b) => this.compareSpeed(a, b))
      .map(p => p.id);
  }

  public updateTurnIndex(battle: Battle): void {
    if (battle.currentTurn >= battle.turnOrder.length) {
      battle.currentTurn = 0;
    }
  }

  public getNextParticipantId(battle: Battle): string | null {
    if (!battle.isActive) return null;
    
    const currentIndex = battle.currentTurn;
    if (currentIndex < battle.turnOrder.length) {
      return battle.turnOrder[currentIndex];
    }
    return null;
  }

  private compareSpeed(a: BattleParticipant, b: BattleParticipant): number {
    const speedA = a.getAttribute('SPD') || 0;
    const speedB = b.getAttribute('SPD') || 0;
    
    if (speedA !== speedB) {
      return speedB - speedA;
    }
    
    return Math.random() - 0.5;
  }
}