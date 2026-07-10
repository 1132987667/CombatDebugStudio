import type { BattleSystem } from '@/domain/battle/BattleSystem'
import type { BattleState, BattleEntity } from '@/domain/battle/type/types'
import { BattleStatus } from '@/domain/battle/type/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { eventBus } from '@/main'

/**
 * 战斗状态管理器
 * 负责 UI 层与核心战斗系统之间的状态同步与转换
 * 核心功能：
 * - 从 BattleSystem 获取战斗状态（回合数、当前行动者、参与者状态等）
 * - 直接使用 BattleEntity，不再维护 UI 角色映射
 * - 提供手动更新接口，同步 UI 更改到核心战斗系统
 */
export class BattleStateManager {
  private currentTurn = 1
  private currentActorId: string | null = null
  private battleId: string | null = null
  private isBattleActive = false
  private selectedCharacterId: string | null = null
  // 保存事件回调引用，用于清理
  private teamDataChangedHandler: (() => void) | null = null

  /**
   * 构造函数
   * @param battleSystem 战斗系统实例
   */
  constructor(private battleSystem: BattleSystem) {
    this.teamDataChangedHandler = () => {}

    // 监听队伍数据变化事件
    eventBus.on('teamDataChanged', this.teamDataChangedHandler)
  }

  /**
   * 清理事件监听器，防止内存泄漏
   * 在不再需要 BattleStateManager 时调用
   */
  public dispose(): void {
    if (this.teamDataChangedHandler) {
      eventBus.off('teamDataChanged', this.teamDataChangedHandler)
      this.teamDataChangedHandler = null
    }
  }

  /**
   * 获取当前回合
   */
  getCurrentTurn() {
    return this.currentTurn
  }

  /**
   * 获取当前行动者ID
   */
  getCurrentActorId() {
    return this.currentActorId
  }

  /**
   * 获取战斗ID
   */
  getBattleId() {
    return this.battleId
  }

  /**
   * 获取战斗是否活跃
   */
  getIsBattleActive() {
    return this.isBattleActive
  }

  /**
   * 选择角色
   */
  selectCharacter(characterId: string) {
    this.selectedCharacterId = characterId
  }

  /**
   * 获取选中的角色ID
   */
  getSelectedCharacterId(): string | null {
    return this.selectedCharacterId
  }

  /**
   * 设置战斗ID
   * @param battleId 战斗ID
   */
  setBattleId(battleId: string) {
    this.battleId = battleId
  }

  /**
   * 同步战斗状态
   */
  syncBattleState() {
    if (!this.battleId) return

    try {
      const battleState = this.battleSystem.getBattleState()
      if (!battleState) {
        // 战斗不存在时，重置状态
        this.resetState()
        return
      }

      // 同步战斗活跃状态（PAUSED/SETTLEMENT 也算活跃，只有结束/创建/准备阶段才算非活跃）
      this.isBattleActive =
        battleState.battleState !== BattleStatus.ENDED &&
        battleState.battleState !== BattleStatus.CREATED &&
        battleState.battleState !== BattleStatus.PREPARING

      // 同步回合数（currentRound 是 1-based 回合号）
      if (battleState.currentRound !== undefined) {
        this.currentTurn = battleState.currentRound
      }

      // 同步当前行动者（currentTurn 是 0-based 回合内行动索引）
      if (battleState.currentTurn < battleState.turnOrder.length) {
        this.currentActorId =
          battleState.turnOrder[battleState.currentTurn]
      } else {
        // 本轮所有行动者已执行完毕，清除当前行动者
        this.currentActorId = null
      }

      // 同步参与者状态
      this.syncParticipantsState(battleState)

      // 检查战斗是否结束
      if (battleState.battleState === BattleStatus.ENDED) {
        this.handleBattleEnd()
      }
    } catch (error) {
      console.error('同步战斗状态时出错:', error)
      // 出错后重置状态
      this.resetState()
    }
  }

  /**
   * 查找参与者
   * @param participantId 参与者 ID
   * @returns BattleEntity 或 undefined
   */
  private findParticipant(participantId: string): BattleEntity | undefined {
    const battleState = this.battleSystem.getBattleState()
    if (!battleState) return undefined
    return battleState.participants.get(participantId)
  }

  /**
   * 同步参与者状态
   * @param battleState 战斗状态
   */
  private syncParticipantsState(battleState: BattleState) {
    // 不再需要同步 UI 角色状态，BattleEntity 直接管理自己的状态
    // 属性计算通过脏标记系统自动更新
  }

  /**
   * 处理战斗结束
   */
  private handleBattleEnd() {
    // isBattleActive 已在上面同步时设为 false，此处为扩展预留
  }

  /**
   * 重置状态
   */
  resetState() {
    this.currentActorId = null
    this.currentTurn = 1
    this.isBattleActive = false
    this.selectedCharacterId = null
  }

  /**
   * 增加回合数
   */
  incrementTurn() {
    this.currentTurn++
  }

  /**
   * 减少回合数
   */
  decrementTurn() {
    if (this.currentTurn > 1) {
      this.currentTurn--
    }
  }

  /**
   * 更新回合数
   */
  updateTurn(turn: number) {
    this.currentTurn = turn
  }

  /**
   * 手动更新角色状态
   * @param characterId 角色 ID
   * @param updates 更新内容
   */
  updateCharacterManually(characterId: string, updates: Partial<BattleEntity>) {
    const participant = this.findParticipant(characterId)
    if (participant) {
      // 更新参与者属性
      Object.assign(participant, updates)
    }
  }

  /**
   * 获取参与者ID
   * @param characterId 角色ID
   * @returns 参与者ID
   */
  private getParticipantId(characterId: string): string | null {
    // 映射表已废弃，直接返回 characterId
    return characterId
  }
}
