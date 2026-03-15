import type { IBattleSystem } from '@/core/battle/interfaces'
import type { BattleState, BattleParticipant } from '@/types/battle'
import { BATTLE_STATUS } from '@/types/battle'
import type { UIBattleCharacter, AttributeValue } from '@/types'
import { GameDataProcessor } from '@/utils/GameDataProcessor'
import { eventBus } from '@/main'

/**
 * 更新 AttributeValue 类型属性的内部字段
 * 保持响应式引用不变，仅更新内部值
 * @param target 目标属性对象
 * @param source 源属性对象
 */
function updateAttributeValue(target: AttributeValue, source: AttributeValue) {
  target.value = source.value
  target.valueType = source.valueType
  target.options = source.options
}

/**
 * 战斗状态管理器
 * 负责UI层与核心战斗系统之间的状态同步与转换
 * 核心功能：
 * - 从BattleSystem获取战斗状态（回合数、当前行动者、参与者状态等）
 * - 将战斗参与者状态转换为UI角色状态
 * - 通过映射表关联参与者和UI角色，不直接存储队伍数据
 * - 提供手动更新接口，同步UI更改到核心战斗系统
 */
export class BattleStateManager {
  private currentTurn = 1
  private currentActorId: string | null = null
  private battleId: string | null = null
  private isBattleActive = false
  private selectedCharacterId: string | null = null
  // 参与者ID到UI角色的映射表
  private participantToUICharacterMap = new Map<string, UIBattleCharacter>()
  // UI角色ID到参与者ID的映射表
  private uiCharacterToParticipantMap = new Map<string, string>()
  // 保存事件回调引用，用于清理
  private teamDataChangedHandler: (() => void) | null = null

  /**
   * 构造函数
   * @param battleSystem 战斗系统实例
   */
  constructor(private battleSystem: IBattleSystem) {
    this.teamDataChangedHandler = () => {
      // 重新初始化队伍映射关系
      this.refreshMappings()
    }

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
   * 初始化队伍数据
   * @param allyTeam 我方队伍
   * @param enemyTeam 敌方队伍
   */
  initializeTeams(
    allyTeam: UIBattleCharacter[],
    enemyTeam: UIBattleCharacter[],
  ) {
    // 清空映射表
    this.participantToUICharacterMap.clear()
    this.uiCharacterToParticipantMap.clear()

    // 建立我方队伍的映射关系
    allyTeam.forEach((char, index) => {
      const participantId = char.originalId || `character_${index}`
      this.participantToUICharacterMap.set(participantId, char)
      this.uiCharacterToParticipantMap.set(char.id, participantId)
    })

    // 建立敌方队伍的映射关系
    enemyTeam.forEach((char, index) => {
      const participantId = char.originalId || `enemy_${index}`
      this.participantToUICharacterMap.set(participantId, char)
      this.uiCharacterToParticipantMap.set(char.id, participantId)
    })
  }

  /**
   * 更新单个参与者映射
   * 当参与者与UI角色的映射关系发生变化时调用
   * @param participantId 参与者ID
   * @param character UI角色
   */
  updateParticipantMapping(
    participantId: string,
    character: UIBattleCharacter,
  ): void {
    this.participantToUICharacterMap.set(participantId, character)
    this.uiCharacterToParticipantMap.set(character.id, participantId)
  }

  /**
   * 移除参与者映射
   * @param participantId 参与者ID
   */
  removeParticipantMapping(participantId: string): void {
    const character = this.participantToUICharacterMap.get(participantId)
    if (character) {
      this.uiCharacterToParticipantMap.delete(character.id)
    }
    this.participantToUICharacterMap.delete(participantId)
  }

  /**
   * 刷新映射表
   * 重新从战斗状态加载最新的映射关系
   */
  refreshMappings(): void {
    const battleState = this.battleSystem.getBattleState()
    if (!battleState) return

    // 清空映射表
    this.participantToUICharacterMap.clear()
    this.uiCharacterToParticipantMap.clear()

    // 从战斗状态重建映射关系
    battleState.participants.forEach((participant: BattleParticipant) => {
      const character =
        GameDataProcessor.participantToUIBattleCharacter(participant)
      this.participantToUICharacterMap.set(participant.id, character)
      this.uiCharacterToParticipantMap.set(character.id, participant.id)
    })
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
    if (!this.battleId) {
      return
    }

    try {
      const battleState = this.battleSystem.getBattleState()
      if (!battleState) {
        // 战斗不存在时，重置状态
        this.resetState()
        return
      }

      // 同步战斗活跃状态
      this.isBattleActive = battleState.battleState === BATTLE_STATUS.ACTIVE

      // 同步回合数
      if (battleState.currentTurn !== undefined) {
        this.currentTurn = battleState.currentTurn + 1 // 转换为从1开始的回合数
      }

      // 同步当前行动者
      if (battleState.currentTurn < battleState.turnOrder.length) {
        const currentParticipantId =
          battleState.turnOrder[battleState.currentTurn]
        this.currentActorId = currentParticipantId
      }

      // 同步参与者状态
      this.syncParticipantsState(battleState)

      // 检查战斗是否结束
      if (battleState.battleState === BATTLE_STATUS.ENDED) {
        this.handleBattleEnd()
      }
    } catch (error) {
      console.error('同步战斗状态时出错:', error)
      // 出错后重置状态
      this.resetState()
    }
  }

  /**
   * 同步参与者状态
   * @param battleState 战斗状态
   */
  private syncParticipantsState(battleState: BattleState) {
    // 遍历所有参与者
    battleState.participants.forEach((participant: BattleParticipant) => {
      // 查找对应的UI角色
      const character = this.findUICharacter(participant.id)
      if (character) {
        // 更新角色状态
        this.updateCharacterState(character, participant)
      }
    })
  }

  /**
   * 查找UI角色
   * @param participantId 参与者ID
   * @returns UI角色或undefined
   */
  private findUICharacter(
    participantId: string,
  ): UIBattleCharacter | undefined {
    // 通过映射表查找
    return this.participantToUICharacterMap.get(participantId)
  }

  /**
   * 更新角色状态
   * 逐个更新属性，保持响应式引用不变
   * @param character UI角色
   * @param participant 战斗参与者
   */
  private updateCharacterState(
    character: UIBattleCharacter,
    participant: BattleParticipant,
  ) {
    // 使用新的转换方法创建更新后的UI角色
    const updated =
      GameDataProcessor.participantToUIBattleCharacter(participant)

    // 基础属性（非 AttributeValue 类型）
    character.level = updated.level
    character.name = updated.name
    character.team = updated.team

    // 保留原有的UI特定属性
    character.enabled = character.enabled
    character.isFirst = character.isFirst
    character.originalId = character.originalId
    character.id = character.id

    // AttributeValue 属性逐个更新，保持响应式引用
    updateAttributeValue(character.currentHp, updated.currentHp)
    updateAttributeValue(character.maxHp, updated.maxHp)
    updateAttributeValue(character.currentEnergy, updated.currentEnergy)
    updateAttributeValue(character.maxEnergy, updated.maxEnergy)
    updateAttributeValue(character.minAttack, updated.minAttack)
    updateAttributeValue(character.maxAttack, updated.maxAttack)
    updateAttributeValue(character.attack, updated.attack)
    updateAttributeValue(character.defense, updated.defense)
    updateAttributeValue(character.speed, updated.speed)
    updateAttributeValue(character.critRate, updated.critRate)
    updateAttributeValue(character.critDamage, updated.critDamage)
    updateAttributeValue(character.damageReduction, updated.damageReduction)
    updateAttributeValue(character.healthBonus, updated.healthBonus)
    updateAttributeValue(character.attackBonus, updated.attackBonus)
    updateAttributeValue(character.defenseBonus, updated.defenseBonus)
    updateAttributeValue(character.speedBonus, updated.speedBonus)

    // 数组类型可以直接赋值，reactive 会处理数组引用变化
    character.buffs = updated.buffs
    character.skills = updated.skills
  }

  /**
   * 处理战斗结束
   */
  private handleBattleEnd() {
    this.isBattleActive = false
    // 可以添加战斗结束的额外逻辑
  }

  /**
   * 重置状态
   */
  resetState() {
    this.currentActorId = null
    this.currentTurn = 1
    this.isBattleActive = false
    this.selectedCharacterId = null
    this.participantToUICharacterMap.clear()
    this.uiCharacterToParticipantMap.clear()
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
   * @param characterId 角色ID
   * @param updates 更新内容
   */
  updateCharacterManually(
    characterId: string,
    updates: Partial<UIBattleCharacter>,
  ) {
    const character = this.findUICharacter(characterId)
    if (character) {
      // 更新角色属性
      Object.assign(character, updates)

      // 同步到核心战斗系统
      if (this.battleId) {
        try {
          const participantId = this.getParticipantId(characterId)
          if (participantId) {
            this.battleSystem.updateParticipant(
              this.battleId,
              participantId,
              updates,
            )
          }
        } catch (error) {
          console.error('同步手动更新到战斗系统时出错:', error)
        }
      }
    }
  }

  /**
   * 获取参与者ID
   * @param characterId 角色ID
   * @returns 参与者ID
   */
  private getParticipantId(characterId: string): string | null {
    // 通过映射表查找
    return this.uiCharacterToParticipantMap.get(characterId) || null
  }
}
