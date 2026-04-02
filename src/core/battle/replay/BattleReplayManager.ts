import type { BattleState, BattleReplay } from '@/types/battle'
import { battleLogManager } from '@/utils/logging'
import {
  ReplayEngine,
  type ReplayState,
  type ReplayEvent,
} from './ReplayEngine'

/**
 * 战斗回放管理器
 * 负责战斗回放的控制、管理和事件处理
 *
 * 职责说明：
 * - 控制回放的播放、暂停、停止
 * - 管理回放速度
 * - 提供回放状态的查询
 *
 * 与 BattleRecorder 的关系：
 * - BattleRecorder: 负责记录战斗过程，生成回放数据
 * - BattleReplayManager: 负责回放的控制和管理
 *
 * 版本: 2.0.0 - 使用 ReplayEngine 实现确定性回放和状态跳转
 */
export class BattleReplayManager {
  private battleLogManager = battleLogManager
  private isReplaying = false
  private isPaused = false
  private currentReplayIndex = 0
  private replaySpeed = 1
  private replayEvents: any[] = []
  private replayTimer: symbol | null = null
  private replayEngine: ReplayEngine | null = null
  private loadedReplayData: BattleReplay | null = null
  private stateUnsubscribe: (() => void) | null = null
  private eventUnsubscribe: (() => void) | null = null

  /**
   * 获取是否正在回放
   */
  getIsReplaying() {
    return this.replayEngine?.isPlayingState() || false
  }

  /**
   * 获取是否暂停
   */
  getIsPaused() {
    return this.replayEngine?.isPausedState() || false
  }

  /**
   * 获取当前回放索引
   */
  getCurrentReplayIndex() {
    return this.replayEngine?.getCurrentIndex() || 0
  }

  /**
   * 获取回放速度
   */
  getReplaySpeed() {
    return this.replayEngine?.getSpeed() || 1
  }

  /**
   * 获取回放事件
   */
  getReplayEvents() {
    return this.replayEngine?.getEvents() || []
  }

  /**
   * 获取当前状态快照
   */
  getCurrentSnapshot() {
    return this.replayEngine?.getCurrentSnapshot() || null
  }

  /**
   * 开始回放
   * @param recording 回放记录
   */
  startReplay(recording: BattleReplay) {
    this.resetReplayState()

    this.replayEngine = new ReplayEngine()
    this.loadedReplayData = recording

    const success = this.replayEngine.loadReplay(recording)
    if (!success) {
      this.battleLogManager.addSystemLog('加载回放数据失败')
      return
    }

    this.stateUnsubscribe = this.replayEngine.onStateChange(
      (state: ReplayState) => {
        this.isReplaying = state.isPlaying
        this.isPaused = state.isPaused
        this.currentReplayIndex = state.currentIndex
      },
    )

    this.eventUnsubscribe = this.replayEngine.onEvent((event: ReplayEvent) => {
      this.handleReplayEvent(event)
    })

    this.replayEngine.play()

    this.battleLogManager.addSystemLog('开始回放')
  }

  /**
   * 暂停回放
   */
  pauseReplay() {
    if (this.replayEngine) {
      this.replayEngine.pause()
      this.battleLogManager.addSystemLog('回放已暂停')
    }
  }

  /**
   * 继续回放
   */
  resumeReplay() {
    if (this.replayEngine) {
      this.replayEngine.resume()
      this.battleLogManager.addSystemLog('回放已继续')
    }
  }

  /**
   * 停止回放
   */
  stopReplay() {
    this.resetReplayState()
    this.battleLogManager.addSystemLog('回放已停止')
  }

  /**
   * 设置回放速度
   * @param speed 速度倍率
   */
  setReplaySpeed(speed: number) {
    this.replaySpeed = speed
    if (this.replayEngine) {
      this.replayEngine.setSpeed(speed)
    }
    this.battleLogManager.addSystemLog(`回放速度已调整为: ${speed}倍`)
  }

  /**
   * 跳转到指定事件索引
   * @param index 事件索引
   */
  seekToEvent(index: number): boolean {
    if (!this.replayEngine) {
      return false
    }
    return this.replayEngine.seekToEvent(index)
  }

  /**
   * 跳转到指定回合
   * @param turn 回合数
   */
  seekToTurn(turn: number): boolean {
    if (!this.replayEngine) {
      return false
    }
    return this.replayEngine.seekToTurn(turn)
  }

  /**
   * 跳转到指定回合数
   * @param roundNumber 回合数
   */
  seekToRound(roundNumber: number): boolean {
    if (!this.replayEngine) {
      return false
    }
    return this.replayEngine.seekToRound(roundNumber)
  }

  /**
   * 跳转到指定时间戳
   * @param timestamp 时间戳
   */
  seekToTime(timestamp: number): boolean {
    if (!this.replayEngine) {
      return false
    }
    return this.replayEngine.seekToTime(timestamp)
  }

  /**
   * 步进到下一个事件
   */
  stepForward(): boolean {
    if (!this.replayEngine) {
      return false
    }
    return this.replayEngine.stepForward()
  }

  /**
   * 步进到上一个事件
   */
  stepBackward(): boolean {
    if (!this.replayEngine) {
      return false
    }
    return this.replayEngine.stepBackward()
  }

  /**
   * 获取总事件数
   */
  getTotalEvents(): number {
    return this.replayEngine?.getTotalEvents() || 0
  }

  /**
   * 处理回放事件
   * @param event 事件对象
   */
  private handleReplayEvent(event: ReplayEvent) {
    console.log('回放事件:', event)

    switch (event.type) {
      case 'action':
        this.handleActionReplay(event.data?.action)
        break
      case 'turn_start':
        this.handleTurnStartReplay(event.data?.turn, event.data?.participantId)
        break
      case 'turn_end':
        this.handleTurnEndReplay(event.data?.turn)
        break
      case 'battle_start':
        this.handleBattleStartReplay()
        break
      case 'battle_end':
        this.handleBattleEndReplay(event.data?.winner)
        break
      case 'buff_add':
        this.handleBuffAddReplay(event.data)
        break
      case 'buff_remove':
        this.handleBuffRemoveReplay(event.data)
        break
      case 'buff_update':
        this.handleBuffUpdateReplay(event.data)
        break
    }
  }

  /**
   * 处理动作回放
   * @param action 动作对象
   */
  private handleActionReplay(action: any) {
    console.log('回放动作:', action)
  }

  /**
   * 处理回合开始回放
   * @param turn 回合数
   * @param participantId 参与者ID
   */
  private handleTurnStartReplay(turn: number, participantId: string) {
    console.log('回放回合开始:', turn, '行动者:', participantId)
  }

  /**
   * 处理回合结束回放
   * @param turn 回合数
   */
  private handleTurnEndReplay(turn: number) {
    console.log('回放回合结束:', turn)
  }

  /**
   * 处理战斗开始回放
   */
  private handleBattleStartReplay() {
    console.log('回放战斗开始')
  }

  /**
   * 处理战斗结束回放
   * @param winner 胜利者
   */
  private handleBattleEndReplay(winner: string) {
    console.log('回放战斗结束:', winner)
  }

  /**
   * 处理Buff添加回放
   * @param data Buff数据
   */
  private handleBuffAddReplay(data: any) {
    console.log('回放Buff添加:', data)
  }

  /**
   * 处理Buff移除回放
   * @param data Buff数据
   */
  private handleBuffRemoveReplay(data: any) {
    console.log('回放Buff移除:', data)
  }

  /**
   * 处理Buff更新回放
   * @param data Buff数据
   */
  private handleBuffUpdateReplay(data: any) {
    console.log('回放Buff更新:', data)
  }

  /**
   * 重置回放状态
   */
  private resetReplayState() {
    if (this.stateUnsubscribe) {
      this.stateUnsubscribe()
      this.stateUnsubscribe = null
    }

    if (this.eventUnsubscribe) {
      this.eventUnsubscribe()
      this.eventUnsubscribe = null
    }

    if (this.replayEngine) {
      this.replayEngine.stop()
      this.replayEngine = null
    }

    this.loadedReplayData = null
    this.isReplaying = false
    this.isPaused = false
    this.currentReplayIndex = 0
    this.replayEvents = []

    if (this.replayTimer) {
      import('@/utils/RAF').then(({ raf }) => {
        raf.clear(this.replayTimer!)
      })
      this.replayTimer = null
    }
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.resetReplayState()
  }
}
