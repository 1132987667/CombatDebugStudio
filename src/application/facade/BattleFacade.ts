import { BattleManager } from '@/domain/battle/BattleManager'
import type {
  BattleEntity,
  BattleState,
  BattleReplay,
} from '@/domain/battle/type/types'
import { type ParticipantSide } from '@/domain/battle/type/types'
import type {
  BattleEventName,
  BattleEventCallback,
} from '@/domain/battle/type/BattleEventType'

/**
 * 战斗应用服务（门面）
 *
 * 职责：封装完整的业务用例（Use Cases），聚合 BattleManager + 状态同步，
 * 为 UI 层提供语义化的战斗流程控制方法，消除 Store 和组件中的业务编排逻辑。
 *
 * 使用方式：通过 DI 容器以 'BattleService' 令牌注入。
 *
 * ponytail: 各方法直接委托 BattleManager，processSingleTurn 等聚合方法
 * 自动附加状态同步。随着需求演进，此处应逐步吸纳跨子系统的编排逻辑，
 * 使 Store 只需调用一个方法即可完成完整用例。
 */
export class BattleService {
  private battleManager: BattleManager

  constructor(battleManager: BattleManager) {
    this.battleManager = battleManager
  }

  // ==================== 战斗流程控制（Use Cases） ====================

  /** 开始战斗 */
  async startBattle(): Promise<string | null> {
    return this.battleManager.startBattle()
  }

  /** 结束战斗 */
  endBattle(winner: ParticipantSide): void {
    this.battleManager.endBattle(winner)
  }

  /** 重置战斗 */
  reset(): void {
    this.battleManager.resetBattle()
  }

  /** 执行单步回合 + 自动同步状态 */
  async processSingleTurn(): Promise<void> {
    await this.battleManager.processSingleTurn()
    this.battleManager.syncBattleState()
  }

  /** 启动自动战斗 */
  async startAutoBattle(): Promise<boolean> {
    return this.battleManager.startAutoBattle()
  }

  /** 停止自动战斗 */
  stopAutoBattle(): boolean {
    return this.battleManager.stopAutoBattle()
  }

  /** 执行单步自动回合 */
  async executeSingleTurn(): Promise<void> {
    await this.battleManager.executeSingleTurn()
  }

  // ==================== 事件管理 ====================

  on<T extends BattleEventName>(event: T, callback: BattleEventCallback<T>) {
    this.battleManager.on(event, callback)
  }

  off<T extends BattleEventName>(event: T) {
    this.battleManager.off(event)
  }

  clearAllListeners(): void {
    this.battleManager.clearAllListeners()
  }

  // ==================== 状态同步 ====================

  syncBattleState(): void {
    this.battleManager.syncBattleState()
  }

  async syncBattleLogs(battleState: BattleState): Promise<void> {
    await this.battleManager.syncBattleLogs(battleState)
  }

  // ==================== 队伍/角色管理 ====================

  initializeTeams(
    allyTeam: BattleEntity[],
    enemyTeam: BattleEntity[],
  ): { battleId: string } {
    return this.battleManager.initializeTeams(allyTeam, enemyTeam)
  }

  loadSkillConfigs(): void {
    this.battleManager.loadSkillConfigs()
  }

  resetCharacterStates(): void {
    this.battleManager.resetCharacterStates()
  }

  addCharacterToTeam(character: BattleEntity, side: ParticipantSide): void {
    this.battleManager.addCharacterToTeam(character, side)
  }

  moveCharacter(characterId: string, direction: number): void {
    this.battleManager.moveCharacter(characterId, direction)
  }

  removeCharacter(characterId: string): void {
    this.battleManager.removeCharacter(characterId)
  }

  clearParticipants(): void {
    this.battleManager.clearParticipants()
  }

  selectCharacter(characterId: string): void {
    this.battleManager.selectCharacter(characterId)
  }

  setCharacterEnabled(characterId: string, enabled: boolean): void {
    this.battleManager.setCharacterEnabled(characterId, enabled)
  }

  // ==================== 状态/数据访问 ====================

  getAllyTeam(): BattleEntity[] {
    return this.battleManager.getAllyTeam()
  }

  getEnemyTeam(): BattleEntity[] {
    return this.battleManager.getEnemyTeam()
  }

  getEnabledAllyTeam(): BattleEntity[] {
    return this.battleManager.getEnabledAllyTeam()
  }

  getEnabledEnemyTeam(): BattleEntity[] {
    return this.battleManager.getEnabledEnemyTeam()
  }

  getSelectedCharacter(): BattleEntity | null {
    return this.battleManager.getSelectedCharacter()
  }

  getSelectedCharacterId(): string | null {
    return this.battleManager.getSelectedCharacterId()
  }

  /** 获取当前战斗回合数（从 BattleStateManager 读取） */
  // ponytail: 与 getTurn() 语义重叠，getTurn 取自 battleSystem.getRound()
  // 两者在 syncBattleState() 后应一致；优先使用此方法获取 UI 层可见的回合数
  getCurrentTurn(): number {
    return this.battleManager.getCurrentTurn()
  }

  getMaxTurns(): number {
    return this.battleManager.getMaxTurns()
  }

  getBattleState(): BattleState | undefined {
    return this.battleManager.getBattleState()
  }

  getAutoBattle(): boolean {
    return this.battleManager.getAutoBattle()
  }

  getIsPaused(): boolean {
    return this.battleManager.isPaused()
  }

  togglePause(): void {
    this.battleManager.togglePause()
  }

  getTurn(): number {
    return this.battleManager.getTurn()
  }

  getTeamCounts(): { ally: number; enemy: number } {
    return this.battleManager.getTeamCounts()
  }

  // ==================== 回放 ====================

  startReplay(recording: BattleReplay): void {
    this.battleManager.getBattleReplayManager().startReplay(recording)
  }

  stopReplay(): void {
    this.battleManager.getBattleReplayManager().stopReplay()
  }

  pauseReplay(): void {
    this.battleManager.getBattleReplayManager().pauseReplay()
  }

  // ==================== 配置 ====================

  setBattleSpeed(speed: number): void {
    this.battleManager.setBattleSpeed(speed)
  }

  /** ★ 切换快速战斗模式 */
  setQuickMode(enabled: boolean): void {
    this.battleManager.setQuickMode(enabled)
  }

  /** ★ 获取快速战斗模式 */
  getQuickMode(): boolean {
    return this.battleManager.getQuickMode()
  }

  // ==================== 降级通道 ====================

  /** 获取原始 BattleManager（降级通道，用于尚未封装的边缘能力） */
  // ponytail: 随着此类方法丰富，此方法应逐步淘汰
  getBattleManager(): BattleManager {
    return this.battleManager
  }
}

// 兼容性别名 — BattleFacade 即 BattleService
export { BattleService as BattleFacade }
