import type { BattleParticipant } from '@/types/battle';
import type { ParticipantInfo } from '../BattleSystem';
import { SimpleBattleCharacter, SimpleBattleEnemy } from '../BattleSystem';

interface CreateParticipantData {
  id: string;
  name: string;
  level: number;
  currentHealth: number;
  maxHealth: number;
  currentEnergy: number;
  maxEnergy: number;
  buffs?: string[];
}

export class ParticipantManager {
  public createParticipants(participantsInfo: ParticipantInfo[]): Map<string, BattleParticipant> {
    const participants = new Map<string, BattleParticipant>();

    participantsInfo.forEach((info) => {
      if (info.type === 'character') {
        const participant = this.createCharacter(info);
        participant.currentEnergy = info.currentEnergy;
        participant.maxEnergy = info.maxEnergy;
        participants.set(participant.id, participant);
      } else if (info.type === 'enemy') {
        const participant = this.createEnemy(info);
        participant.currentEnergy = info.currentEnergy;
        participant.maxEnergy = info.maxEnergy;
        participants.set(participant.id, participant);
      }
    });

    return participants;
  }

  public createCharacter(info: ParticipantInfo): BattleParticipant {
    return new SimpleBattleCharacter({
      id: `character_${info.id}`,
      name: info.name,
      level: 5,
      currentHealth: info.currentHealth,
      maxHealth: info.maxHealth,
      buffs: [],
    });
  }

  public createEnemy(info: ParticipantInfo): BattleParticipant {
    return new SimpleBattleEnemy({
      id: `enemy_${info.id}`,
      name: info.name,
      level: 5,
      currentHealth: info.currentHealth,
      maxHealth: info.maxHealth,
      buffs: [],
    });
  }

  public gainEnergyToAllAlive(participants: Map<string, BattleParticipant>, amount: number): void {
    participants.forEach((participant) => {
      if (participant.isAlive()) {
        participant.gainEnergy(amount);
      }
    });
  }

  public getAliveParticipants(participants: Map<string, BattleParticipant>): BattleParticipant[] {
    return Array.from(participants.values()).filter(p => p.isAlive());
  }

  public getAliveParticipantsByType(participants: Map<string, BattleParticipant>, type: 'character' | 'enemy'): BattleParticipant[] {
    return this.getAliveParticipants(participants).filter(p => p.type === type);
  }

  public getParticipantById(participants: Map<string, BattleParticipant>, id: string): BattleParticipant | undefined {
    return participants.get(id);
  }

  public hasAliveParticipants(participants: Map<string, BattleParticipant>): boolean {
    return this.getAliveParticipants(participants).length > 0;
  }

  public hasAliveParticipantsByType(participants: Map<string, BattleParticipant>, type: 'character' | 'enemy'): boolean {
    return this.getAliveParticipantsByType(participants, type).length > 0;
  }
}