import type { BattleParticipant } from '@/types/battle';
import type { ParticipantInfo } from '@/types/battle';
import { SimpleBattleCharacter, SimpleBattleEnemy } from '../BattleSystem';

/**
 * 参与者管理器类
 * 负责创建、查询、更新和清理战斗参与者
 * 实现了IParticipantManager接口，处理参与者的全生命周期管理
 */
export class ParticipantManager {
  /** 参与者存储映射，以参与者ID为键 */
  private participants = new Map<string, BattleParticipant>();
  /** 战斗参与者关联映射，以battleId为键，值为该战斗的参与者ID集合 */
  private battleParticipants = new Map<string, Set<string>>();

  /**
   * 创建单个参与者
   * 根据参与者信息创建对应的角色或敌人对象
   * @param info - 参与者信息对象，包含ID、名称、类型、生命值等
   * @returns BattleParticipant - 创建的参与者对象
   * @throws Error - 当参与者类型未知时抛出
   */
  public createParticipant(info: ParticipantInfo): BattleParticipant {
    let participant: BattleParticipant;

    if (info.type === 'character') {
      participant = new SimpleBattleCharacter({
        id: `character_${info.id}`,
        name: info.name,
        level: 5,
        currentHealth: info.currentHealth,
        maxHealth: info.maxHealth,
        buffs: [],
      });
    } else if (info.type === 'enemy') {
      participant = new SimpleBattleEnemy({
        id: `enemy_${info.id}`,
        name: info.name,
        level: 5,
        currentHealth: info.currentHealth,
        maxHealth: info.maxHealth,
        buffs: [],
      });
    } else {
      throw new Error(`Unknown participant type: ${info.type}`);
    }

    participant.currentEnergy = info.currentEnergy;
    participant.maxEnergy = info.maxEnergy;

    this.participants.set(participant.id, participant);

    return participant;
  }

  /**
   * 批量创建参与者
   * 根据参与者信息数组创建多个参与者对象
   * @param participantsInfo - 参与者信息数组
   * @returns Map<string, BattleParticipant> - 以参与者ID为键的映射表
   */
  public createParticipants(participantsInfo: ParticipantInfo[]): Map<string, BattleParticipant> {
    const participants = new Map<string, BattleParticipant>();

    participantsInfo.forEach((info) => {
      const participant = this.createParticipant(info);
      participants.set(participant.id, participant);
    });

    return participants;
  }

  /**
   * 创建角色类型参与者
   * 包装createParticipant方法，明确表示创建角色
   * @param info - 角色参与者信息
   * @returns BattleParticipant - 创建的角色参与者对象
   */
  public createCharacter(info: ParticipantInfo): BattleParticipant {
    return this.createParticipant(info);
  }

  /**
   * 创建敌人类型参与者
   * 包装createParticipant方法，明确表示创建敌人
   * @param info - 敌人参与者信息
   * @returns BattleParticipant - 创建的敌人参与者对象
   */
  public createEnemy(info: ParticipantInfo): BattleParticipant {
    return this.createParticipant(info);
  }

  /**
   * 获取参与者
   * 根据参与者ID查找并返回参与者对象
   * @param battleId - 战斗ID（当前未使用，预留参数）
   * @param participantId - 参与者的唯一标识符
   * @returns BattleParticipant | undefined - 找到返回参与者对象，未找到返回undefined
   */
  public getParticipant(battleId: string, participantId: string): BattleParticipant | undefined {
    return this.participants.get(participantId);
  }

  /**
   * 更新参与者
   * 根据参与者ID和更新数据修改参与者属性
   * @param battleId - 战斗ID（当前未使用，预留参数）
   * @param participantId - 要更新的参与者ID
   * @param updates - 部分更新数据，包含需要修改的属性
   */
  public updateParticipant(battleId: string, participantId: string, updates: Partial<BattleParticipant>): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      Object.assign(participant, updates);
    }
  }

  /**
   * 将参与者添加到战斗
   * 建立参与者与战斗的关联关系
   * @param battleId - 战斗ID
   * @param participantId - 参与者ID
   */
  public addParticipantToBattle(battleId: string, participantId: string): void {
    if (!this.battleParticipants.has(battleId)) {
      this.battleParticipants.set(battleId, new Set());
    }
    this.battleParticipants.get(battleId)?.add(participantId);
  }

  /**
   * 为所有存活参与者恢复能量
   * 遍历参与者集合，为每个存活的参与者增加能量值
   * @param participants - 参与者映射表
   * @param amount - 要恢复的能量值
   */
  public gainEnergyToAllAlive(participants: Map<string, BattleParticipant>, amount: number): void {
    participants.forEach((participant) => {
      if (participant.isAlive()) {
        participant.gainEnergy(amount);
      }
    });
  }

  /**
   * 获取所有存活参与者
   * 从参与者集合中筛选出生命值大于0的参与者
   * @param participants - 参与者映射表
   * @returns BattleParticipant[] - 存活参与者数组
   */
  public getAliveParticipants(participants: Map<string, BattleParticipant>): BattleParticipant[] {
    return Array.from(participants.values()).filter(p => p.isAlive());
  }

  /**
   * 按类型获取存活参与者
   * 从参与者集合中筛选出指定类型的存活参与者
   * @param participants - 参与者映射表
   * @param type - 参与者类型，'character'或'enemy'
   * @returns BattleParticipant[] - 符合条件的参与者数组
   */
  public getAliveParticipantsByType(participants: Map<string, BattleParticipant>, type: 'character' | 'enemy'): BattleParticipant[] {
    return this.getAliveParticipants(participants).filter(p => p.type === type);
  }

  /**
   * 根据ID获取参与者
   * 从参与者映射表中查找指定ID的参与者
   * @param participants - 参与者映射表
   * @param id - 要查找的参与者ID
   * @returns BattleParticipant | undefined - 找到返回参与者对象，未找到返回undefined
   */
  public getParticipantById(participants: Map<string, BattleParticipant>, id: string): BattleParticipant | undefined {
    return participants.get(id);
  }

  /**
   * 检查是否有存活参与者
   * 判断参与者集合中是否存在生命值大于0的参与者
   * @param participants - 参与者映射表
   * @returns boolean - 有存活参与者返回true，否则返回false
   */
  public hasAliveParticipants(participants: Map<string, BattleParticipant>): boolean {
    return this.getAliveParticipants(participants).length > 0;
  }

  /**
   * 按类型检查是否有存活参与者
   * 判断参与者集合中是否存在指定类型的存活参与者
   * @param participants - 参与者映射表
   * @param type - 参与者类型
   * @returns boolean - 有符合条件的存活参与者返回true，否则返回false
   */
  public hasAliveParticipantsByType(participants: Map<string, BattleParticipant>, type: 'character' | 'enemy'): boolean {
    return this.getAliveParticipantsByType(participants, type).length > 0;
  }

  /**
   * 移除参与者
   * 从参与者存储和所有战斗关联中删除指定参与者
   * @param participantId - 要移除的参与者ID
   */
  public removeParticipant(participantId: string): void {
    this.participants.delete(participantId);
    this.battleParticipants.forEach((participants) => {
      participants.delete(participantId);
    });
  }

  /**
   * 清理战斗的所有参与者
   * 移除指定战斗关联的所有参与者数据
   * @param battleId - 要清理的战斗ID
   */
  public clearBattle(battleId: string): void {
    const participantIds = this.battleParticipants.get(battleId);
    if (participantIds) {
      participantIds.forEach((participantId) => {
        this.participants.delete(participantId);
      });
    }
    this.battleParticipants.delete(battleId);
  }
}
