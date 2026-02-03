import type { BattleAction, BattleParticipant } from '@/types/battle';
import { logger } from '@/utils/logger';

interface Battle {
  battleId: string;
  participants: Map<string, BattleParticipant>;
  turnOrder: string[];
  currentTurn: number;
  isActive: boolean;
}

export class ActionExecutor {
  private logger = logger;

  public async executeAction(action: BattleAction, battle: Battle): Promise<BattleAction> {
    const source = battle.participants.get(action.sourceId);
    const target = battle.participants.get(action.targetId);

    if (!source || !target) {
      throw new Error(`Invalid source or target in action`);
    }

    this.processActionType(action, source, target);

    source.afterAction();

    return action;
  }

  public async executeDefaultAction(battle: Battle, participant: BattleParticipant): Promise<void> {
    const enemies = this.getAliveParticipantsByType(battle, 'enemy');
    const characters = this.getAliveParticipantsByType(battle, 'character');

    let targetId: string;
    let damage: number;

    if (participant.type === 'character' && enemies.length > 0) {
      targetId = enemies[Math.floor(Math.random() * enemies.length)];
      damage = Math.floor(Math.random() * 20) + 10;
    } else if (participant.type === 'enemy' && characters.length > 0) {
      targetId = characters[Math.floor(Math.random() * characters.length)];
      damage = Math.floor(Math.random() * 15) + 8;
    } else {
      return;
    }

    await this.executeAction({
      id: `action_${Date.now()}`,
      type: 'attack',
      sourceId: participant.id,
      targetId,
      damage,
      success: true,
      timestamp: Date.now(),
      turn: battle.currentTurn + 1,
      effects: [
        {
          type: 'damage',
          value: damage,
          description: `${participant.name} 普通攻击 造成 ${damage} 伤害`,
        },
      ],
    }, battle);
  }

  private processActionType(action: BattleAction, source: BattleParticipant, target: BattleParticipant): void {
    switch (action.type) {
      case 'attack':
        this.processAttack(action, source, target);
        break;
      case 'skill':
        this.processSkill(action, source, target);
        break;
      case 'heal':
        this.processHeal(action, source, target);
        break;
      default:
        this.logger.warn(`Unknown action type: ${action.type}`);
    }
  }

  private processAttack(action: BattleAction, source: BattleParticipant, target: BattleParticipant): void {
    if (action.damage) {
      const actualDamage = target.takeDamage(action.damage);
      action.damage = actualDamage;
      
      action.effects.push({
        type: 'damage',
        value: actualDamage,
        description: `${source.name} 攻击 ${target.name} 造成 ${actualDamage} 伤害`,
      });
    }
  }

  private processSkill(action: BattleAction, source: BattleParticipant, target: BattleParticipant): void {
    if (action.skillId) {
      const energyCost = this.getSkillEnergyCost(action.skillId);
      if (energyCost > 0) {
        const success = source.spendEnergy(energyCost);
        if (!success) {
          action.type = 'attack';
          action.damage = Math.floor(Math.random() * 20) + 10;
          action.effects.push({
            type: 'status',
            description: `能量不足，改为普通攻击`,
          });
          this.processAttack(action, source, target);
          return;
        }
      }
    }

    if (action.damage) {
      const actualDamage = target.takeDamage(action.damage);
      action.damage = actualDamage;
      action.effects.push({
        type: 'damage',
        value: actualDamage,
        description: `${source.name} 使用技能 造成 ${actualDamage} 伤害`,
      });
    }

    if (action.heal) {
      const actualHeal = target.heal(action.heal);
      action.heal = actualHeal;
      action.effects.push({
        type: 'heal',
        value: actualHeal,
        description: `${source.name} 使用技能 恢复 ${actualHeal} 生命值`,
      });
    }

    if (action.buffId) {
      const buffInstanceId = `${target.id}_${action.buffId}_${Date.now()}`;
      target.addBuff(buffInstanceId);
      action.effects.push({
        type: 'buff',
        buffId: action.buffId,
        description: `${action.buffId} 施加给 ${target.name}`,
      });
    }
  }

  private processHeal(action: BattleAction, source: BattleParticipant, target: BattleParticipant): void {
    if (action.heal) {
      const actualHeal = target.heal(action.heal);
      action.heal = actualHeal;
      action.effects.push({
        type: 'heal',
        value: actualHeal,
        description: `${source.name} 治疗 ${target.name} 恢复 ${actualHeal} 生命值`,
      });
    }
  }

  private getSkillEnergyCost(skillId: string): number {
    if (skillId.includes('ultimate') || skillId.includes('大招')) {
      return 100;
    } else if (skillId.includes('skill') || skillId.includes('技能')) {
      return 50;
    }
    return 0;
  }

  private getAliveParticipantsByType(battle: Battle, type: 'character' | 'enemy'): string[] {
    return Array.from(battle.participants.entries())
      .filter(([_, p]) => p.type === type && p.isAlive())
      .map(([id, _]) => id);
  }
}