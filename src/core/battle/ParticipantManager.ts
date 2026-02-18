/**
 * 文件: ParticipantManager.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 参与者管理器
 * 描述: 负责创建、查询、更新和清理战斗参与者，处理参与者的全生命周期管理
 * 版本: 1.0.0
 */

import type {
  BattleParticipant,
  ParticipantSide,
} from '@/types/battle'
import { PARTICIPANT_SIDE } from '@/types/battle'
import {
  BattleParticipantImpl,
  type ParticipantInitData,
} from '@/core/battle/BattleParticipantImpl'
import { GameDataProcessor } from '@/utils/GameDataProcessor'
import { battleLogManager } from '@/utils/logging'

/**
 * 参与者状态变化事件接口
 */
export interface ParticipantStateChangeEvent {
  participantId: string
  battleId: string
  field: string
  oldValue: any
  newValue: any
  timestamp: number
}

/**
 * 参与者状态快照接口
 */
export interface ParticipantStateSnapshot {
  participantId: string
  battleId: string
  state: Partial<BattleParticipant>
  timestamp: number
}

/**
 * 参与者管理器类
 * 负责创建、查询、更新和清理战斗参与者
 * 处理参与者的全生命周期管理
 */
export class ParticipantManager {
  /** 参与者存储映射，以参与者ID为键 */
  private participants = new Map<string, BattleParticipant>()
  /** 战斗参与者关联映射，以battleId为键，值为该战斗的参与者ID集合 */
  private battleParticipants = new Map<string, Set<string>>()
  /** 状态变化事件监听器 */
  private stateChangeListeners: ((
    event: ParticipantStateChangeEvent,
  ) => void)[] = []
  /** 状态快照历史记录 */
  private stateSnapshots = new Map<string, ParticipantStateSnapshot[]>()
  /** 日志记录器 */
  private logger = battleLogManager

  /**
   * 创建单个参与者
   * 使用 BattleParticipantImpl 类创建参与者实例
   * @param info - 参与者初始化数据或 BattleParticipantImpl 实例
   * @returns BattleParticipant - 创建的参与者实例
   */
  public createParticipant(
    info: ParticipantInitData | BattleParticipantImpl,
  ): BattleParticipant {
    const prefix = info.type === PARTICIPANT_SIDE.ALLY ? 'character_' : 'enemy_'
    const newId = `${prefix}${info.id}`

    let participant: BattleParticipantImpl
    if (info instanceof BattleParticipantImpl) {
      participant = info
      participant.id = newId
    } else {
      participant = new BattleParticipantImpl({
        ...info,
        id: newId,
      })
    }

    this.participants.set(participant.id, participant)
    return participant
  }

  /**
   * 批量创建参与者
   * 根据参与者初始化数据数组创建多个参与者对象
   * @param participantsInfo - 参与者初始化数据数组
   * @returns Map<string, BattleParticipant> - 以参与者ID为键的映射表
   */
  public createParticipants(
    participantsInfo: (ParticipantInitData | BattleParticipantImpl)[],
  ): Map<string, BattleParticipant> {
    const participants = new Map<string, BattleParticipant>()

    participantsInfo.forEach((info) => {
      const participant = this.createParticipant(info)
      participants.set(participant.id, participant)
    })

    return participants
  }

  /**
   * 根据角色ID数组创建参与者
   * 从游戏数据中查找对应的敌人数据，转换为参与者实例数组
   * @param ids - 角色ID字符串数组
   * @param type - 参与者类型，默认为ENEMY
   * @returns BattleParticipantImpl[] - 参与者实例数组
   */
  public createParticipantByIds(
    ids: string[],
    type: ParticipantSide = PARTICIPANT_SIDE.ENEMY,
  ): BattleParticipantImpl[] {
    const participants: BattleParticipantImpl[] = []

    ids.forEach((id) => {
      const enemy = GameDataProcessor.findEnemyById(id)
      if (enemy) {
        const participant = GameDataProcessor.enemyToParticipantInfo(enemy, type)
        participants.push(participant)
      } else {
        this.logger.warn(`未找到ID为 ${id} 的角色数据`)
      }
    })

    this.logger.info(`根据ID创建参与者完成: ${ids.join(', ')}`, {
      count: participants.length,
      type,
    })

    return participants
  }

  /**
   * 创建角色类型参与者
   * 包装createParticipant方法，明确表示创建角色
   * @param info - 角色参与者初始化数据
   * @returns BattleParticipant - 创建的角色参与者对象
   */
  public createCharacter(
    info: ParticipantInitData | BattleParticipantImpl,
  ): BattleParticipant {
    return this.createParticipant(info)
  }

  /**
   * 创建敌人类型参与者
   * 包装createParticipant方法，明确表示创建敌人
   * @param info - 敌人参与者初始化数据
   * @returns BattleParticipant - 创建的敌人参与者对象
   */
  public createEnemy(
    info: ParticipantInitData | BattleParticipantImpl,
  ): BattleParticipant {
    return this.createParticipant(info)
  }

  /**
   * 获取参与者
   * 根据参与者ID查找并返回参与者对象
   * @param battleId - 战斗ID（当前未使用，预留参数）
   * @param participantId - 参与者的唯一标识符
   * @returns BattleParticipant | undefined - 找到返回参与者对象，未找到返回undefined
   */
  public getParticipant(participantId: string): BattleParticipant | undefined {
    return this.participants.get(participantId)
  }

  /**
   * 更新参与者
   * 根据参与者ID和更新数据修改参与者属性
   * @param battleId - 战斗ID
   * @param participantId - 要更新的参与者ID
   * @param updates - 部分更新数据，包含需要修改的属性
   */
  public updateParticipant(
    battleId: string,
    participantId: string,
    updates: Partial<BattleParticipant>,
  ): void {
    const participant = this.participants.get(participantId)
    if (participant) {
      // 记录状态变化
      this.recordStateChanges(battleId, participantId, participant, updates)

      // 应用更新
      Object.assign(participant, updates)

      this.logger.debug(`参与者状态更新: ${participantId}`, {
        battleId,
        updates,
      })
    }
  }

  /**
   * 批量更新参与者状态
   * @param battleId - 战斗ID
   * @param updates - 参与者ID到更新数据的映射
   */
  public batchUpdateParticipants(
    battleId: string,
    updates: Map<string, Partial<BattleParticipant>>,
  ): void {
    updates.forEach((participantUpdates, participantId) => {
      this.updateParticipant(battleId, participantId, participantUpdates)
    })
    this.logger.info(`批量更新参与者状态完成: ${battleId}`, {
      updatedCount: updates.size,
    })
  }

  /**
   * 记录状态变化事件
   */
  private recordStateChanges(
    battleId: string,
    participantId: string,
    participant: BattleParticipant,
    updates: Partial<BattleParticipant>,
  ): void {
    Object.entries(updates).forEach(([field, newValue]) => {
      const oldValue = (participant as any)[field]
      if (oldValue !== newValue) {
        const event: ParticipantStateChangeEvent = {
          participantId,
          battleId,
          field,
          oldValue,
          newValue,
          timestamp: Date.now(),
        }

        // 触发状态变化事件
        this.triggerStateChange(event)
      }
    })
  }

  /**
   * 触发状态变化事件
   */
  private triggerStateChange(event: ParticipantStateChangeEvent): void {
    this.stateChangeListeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        this.logger.error('状态变化事件监听器执行出错:', error)
      }
    })
  }

  /**
   * 添加状态变化监听器
   */
  public onStateChange(
    listener: (event: ParticipantStateChangeEvent) => void,
  ): void {
    this.stateChangeListeners.push(listener)
    this.logger.debug('添加状态变化监听器')
  }

  /**
   * 移除状态变化监听器
   */
  public offStateChange(
    listener: (event: ParticipantStateChangeEvent) => void,
  ): void {
    const index = this.stateChangeListeners.indexOf(listener)
    if (index !== -1) {
      this.stateChangeListeners.splice(index, 1)
      this.logger.debug('移除状态变化监听器')
    }
  }

  /**
   * 创建参与者状态快照
   */
  public createStateSnapshot(
    battleId: string,
    participantId: string,
  ): ParticipantStateSnapshot {
    const participant = this.participants.get(participantId)
    if (!participant) {
      throw new Error(`参与者不存在: ${participantId}`)
    }

    const snapshot: ParticipantStateSnapshot = {
      participantId,
      battleId,
      state: {
        currentHealth: participant.currentHealth,
        maxHealth: participant.maxHealth,
        currentEnergy: participant.currentEnergy,
        maxEnergy: participant.maxEnergy,
        buffs: [...participant.buffs],
        level: participant.level,
      },
      timestamp: Date.now(),
    }

    // 保存快照
    if (!this.stateSnapshots.has(participantId)) {
      this.stateSnapshots.set(participantId, [])
    }
    this.stateSnapshots.get(participantId)!.push(snapshot)

    // 限制快照数量（最多保留10个）
    const snapshots = this.stateSnapshots.get(participantId)!
    if (snapshots.length > 10) {
      this.stateSnapshots.set(participantId, snapshots.slice(-10))
    }

    this.logger.debug(`创建参与者状态快照: ${participantId}`, { battleId })
    return snapshot
  }

  /**
   * 恢复参与者状态到指定快照
   */
  public restoreStateFromSnapshot(snapshot: ParticipantStateSnapshot): void {
    const participant = this.participants.get(snapshot.participantId)
    if (!participant) {
      throw new Error(`参与者不存在: ${snapshot.participantId}`)
    }

    // 记录恢复前的状态
    const oldState = {
      currentHealth: participant.currentHealth,
      currentEnergy: participant.currentEnergy,
      buffs: [...participant.buffs],
    }

    // 应用快照状态
    Object.assign(participant, snapshot.state)

    // 触发状态变化事件
    Object.entries(snapshot.state).forEach(([field, newValue]) => {
      const oldValue = (oldState as any)[field]
      if (oldValue !== newValue) {
        const event: ParticipantStateChangeEvent = {
          participantId: snapshot.participantId,
          battleId: snapshot.battleId,
          field,
          oldValue,
          newValue,
          timestamp: Date.now(),
        }
        this.triggerStateChange(event)
      }
    })

    this.logger.info(`恢复参与者状态: ${snapshot.participantId}`, {
      battleId: snapshot.battleId,
      snapshotTime: new Date(snapshot.timestamp).toISOString(),
    })
  }

  /**
   * 获取参与者状态快照历史
   */
  public getStateSnapshots(participantId: string): ParticipantStateSnapshot[] {
    return this.stateSnapshots.get(participantId) || []
  }

  /**
   * 清空参与者状态快照历史
   */
  public clearStateSnapshots(participantId: string): void {
    this.stateSnapshots.delete(participantId)
    this.logger.debug(`清空参与者状态快照: ${participantId}`)
  }

  /**
   * 将参与者添加到战斗
   * 建立参与者与战斗的关联关系
   * @param battleId - 战斗ID
   * @param participantId - 参与者ID
   */
  public addParticipantToBattle(battleId: string, participantId: string): void {
    if (!this.battleParticipants.has(battleId)) {
      this.battleParticipants.set(battleId, new Set())
    }
    this.battleParticipants.get(battleId)?.add(participantId)
  }

  /**
   * 为所有存活参与者恢复能量
   * 遍历参与者集合，为每个存活的参与者增加能量值
   * @param participants - 参与者映射表
   * @param amount - 要恢复的能量值
   */
  public gainEnergyToAllAlive(
    participants: Map<string, BattleParticipant>,
    amount: number,
  ): void {
    participants.forEach((participant) => {
      if (participant.isAlive()) {
        participant.gainEnergy(amount)
      }
    })
  }

  /**
   * 获取所有存活参与者
   * 从参与者集合中筛选出生命值大于0的参与者
   * @param participants - 参与者映射表
   * @returns BattleParticipant[] - 存活参与者数组
   */
  public getAliveParticipants(
    participants: Map<string, BattleParticipant>,
  ): BattleParticipant[] {
    return Array.from(participants.values()).filter((p) => p.isAlive())
  }

  /**
   * 按类型获取存活参与者
   * 从参与者集合中筛选出指定类型的存活参与者
   * @param participants - 参与者映射表
   * @param type - 参与者类型，ALLY或ENEMY
   * @returns BattleParticipant[] - 符合条件的参与者数组
   */
  public getAliveParticipantsByType(
    participants: Map<string, BattleParticipant>,
    type: ParticipantSide,
  ): BattleParticipant[] {
    return this.getAliveParticipants(participants).filter(
      (p) => p.type === type,
    )
  }

  /**
   * 根据ID获取参与者
   * 从参与者映射表中查找指定ID的参与者
   * @param participants - 参与者映射表
   * @param id - 要查找的参与者ID
   * @returns BattleParticipant | undefined - 找到返回参与者对象，未找到返回undefined
   */
  public getParticipantById(
    participants: Map<string, BattleParticipant>,
    id: string,
  ): BattleParticipant | undefined {
    return participants.get(id)
  }

  /**
   * 检查是否有存活参与者
   * 判断参与者集合中是否存在生命值大于0的参与者
   * @param participants - 参与者映射表
   * @returns boolean - 有存活参与者返回true，否则返回false
   */
  public hasAliveParticipants(
    participants: Map<string, BattleParticipant>,
  ): boolean {
    return this.getAliveParticipants(participants).length > 0
  }

  /**
   * 按类型检查是否有存活参与者
   * 判断参与者集合中是否存在指定类型的存活参与者
   * @param participants - 参与者映射表
   * @param type - 参与者类型
   * @returns boolean - 有符合条件的存活参与者返回true，否则返回false
   */
  public hasAliveParticipantsByType(
    participants: Map<string, BattleParticipant>,
    type: ParticipantSide,
  ): boolean {
    return this.getAliveParticipantsByType(participants, type).length > 0
  }

  /**
   * 移除参与者
   * 从参与者存储和所有战斗关联中删除指定参与者
   * @param participantId - 要移除的参与者ID
   */
  public removeParticipant(participantId: string): void {
    this.participants.delete(participantId)
    this.battleParticipants.forEach((participants) => {
      participants.delete(participantId)
    })
  }

  /**
   * 清理战斗的所有参与者
   * 移除指定战斗关联的所有参与者数据
   * @param battleId - 要清理的战斗ID
   */
  public clearBattle(battleId: string): void {
    const participantIds = this.battleParticipants.get(battleId)
    if (participantIds) {
      participantIds.forEach((participantId) => {
        this.participants.delete(participantId)
      })
    }
    this.battleParticipants.delete(battleId)
  }
}
