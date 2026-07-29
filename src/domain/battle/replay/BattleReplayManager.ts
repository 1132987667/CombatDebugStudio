import type { BattleState, BattleReplay } from '@/domain/battle/type/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import { BattleEventType } from '@/domain/battle/type/types'
import { LogLevel, BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'
import {
  ReplayEngine,
  type ReplayState,
  type ReplayEvent,
} from './ReplayEngine'
import { container } from '@/infrastructure/di/Container'
import type { SkillManager } from '@/domain/skill/SkillManager'

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
  private get logger() { return LoggerProvider.logger }
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
   * 领域事件总线（由 DI 容器注入）
   * NOTE: Phase 1 未使用。Phase 2 发射 UI 动画事件时需注入 mitt eventBus，
   *       而非 triggerEventBus（UI 组件监听的是 mitt eventBus）。
   */
  private eventBus: IDomainEventBus | null = null

  constructor(eventBus?: IDomainEventBus) {
    this.eventBus = eventBus ?? null
  }

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

    // ★ 临时关闭日志自动清理，防止长战斗回放日志被截断
    LoggerProvider.logger.setAutoCleanup(false)

    this.replayEngine = new ReplayEngine()
    // ★ 注入技能配置查询，替代硬编码冷却值
    try {
      const skillManager = container.resolve<SkillManager>('SkillManager')
      this.replayEngine.setSkillConfigLookup((id) => skillManager.getSkillConfig(id))
    } catch {
      console.warn('[BattleReplayManager] 无法获取 SkillManager，冷却显示为 0')
    }
    this.loadedReplayData = recording

    const success = this.replayEngine.loadReplay(recording)
    if (!success) {
      this.logger.addSystemLog({
        message: '加载回放数据失败',
        level: LogLevel.ERROR,
      })
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
    this.logger.addSystemLog({
      message: '开始回放',
    })
  }

  /**
   * 暂停回放
   */
  pauseReplay() {
    if (this.replayEngine) {
      this.replayEngine.pause()
      this.logger.addSystemLog({
        message: '回放已暂停',
      })
    }
  }

  /**
   * 继续回放
   */
  resumeReplay() {
    if (this.replayEngine) {
      this.replayEngine.resume()
      this.logger.addSystemLog({
        message: '回放已继续',
      })
    }
  }

  /**
   * 停止回放
   */
  stopReplay() {
    this.resetReplayState()
    // ★ 恢复日志自动清理
    LoggerProvider.logger.setAutoCleanup(true)
    this.logger.addSystemLog({
      message: '回放已停止',
    })
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
    this.logger.addSystemLog({
      message: `回放速度已调整为: ${speed}倍`,
      })
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
    switch (event.type) {
      case BattleEventType.ACTION:
        this.handleActionReplay(event.data?.action)
        break
      case BattleEventType.TURN_START:
        this.handleTurnStartReplay(event.data?.turn, event.data?.participantId)
        break
      case BattleEventType.TURN_END:
        this.handleTurnEndReplay(event.data?.turn)
        break
      case BattleEventType.BATTLE_START:
        this.handleBattleStartReplay()
        break
      case BattleEventType.BATTLE_END:
        this.handleBattleEndReplay(event.data?.winner)
        break
      case BattleEventType.BUFF_ADD:
        this.handleBuffAddReplay(event.data)
        break
      case BattleEventType.BUFF_REMOVE:
        this.handleBuffRemoveReplay(event.data)
        break
      case BattleEventType.BUFF_UPDATE:
        this.handleBuffUpdateReplay(event.data)
        break
    }
  }

  /** 处理动作回放 */
  private handleActionReplay(action: any) {
    if (!action) return
    const sourceName = action.sourceId ?? '未知'
    const targetName = action.targetId ?? '未知'
    const dmgText = (action.damage ?? 0) > 0 ? `，造成 ${action.damage} 点伤害` : ''
    const healText = (action.heal ?? 0) > 0 ? `，恢复 ${action.heal} 点气血` : ''
    LoggerProvider.logger.addBattleLog({
      turn: action.turn ?? 0,
      message: `[回放] ${sourceName} → ${targetName}${dmgText}${healText}`,
      segments: [{ text: `[回放] ${sourceName} → ${targetName}${dmgText}${healText}` }],
      category: (action.damage ?? 0) > 0
        ? BATTLE_LOG_CATEGORIES.DAMAGE
        : (action.heal ?? 0) > 0
          ? BATTLE_LOG_CATEGORIES.HEAL
          : BATTLE_LOG_CATEGORIES.STATUS,
      meta: { role: 'action' },
    })
  }

  /** 处理回合开始回放 */
  private handleTurnStartReplay(turn: number, participantId: string) {
    LoggerProvider.logger.addBattleLog({
      turn,
      message: `[回放] 第 ${turn} 回合开始，行动者：${participantId}`,
      segments: [{ text: `[回放] 第 ${turn} 回合开始`, classStr: 'log-system' }],
      category: BATTLE_LOG_CATEGORIES.SYSTEM,
      meta: { role: 'battle' },
    })
    // NOTE: 不发射 TURN_START 动画事件 — 回放模式下参与者卡片未渲染
  }

  /** 处理回合结束回放 */
  private handleTurnEndReplay(turn: number) {
    LoggerProvider.logger.addBattleLog({
      turn,
      message: `[回放] 第 ${turn} 回合结束`,
      segments: [{ text: `[回放] 第 ${turn} 回合结束`, classStr: 'log-system' }],
      category: BATTLE_LOG_CATEGORIES.SYSTEM,
      meta: { role: 'battle' },
    })
  }

  /** 处理战斗开始回放 */
  private handleBattleStartReplay() {
    LoggerProvider.logger.addBattleLog({
      turn: 0,
      message: '[回放] 战斗开始',
      segments: [{ text: '[回放] 战斗开始', classStr: 'log-system' }],
      category: BATTLE_LOG_CATEGORIES.SYSTEM,
      meta: { role: 'battle' },
    })
  }

  /** 处理战斗结束回放 */
  private handleBattleEndReplay(winner: string) {
    LoggerProvider.logger.addBattleLog({
      turn: 0,
      message: `[回放] 战斗结束，胜利者：${winner}`,
      segments: [{ text: `[回放] 战斗结束，胜利者：${winner}` }],
      category: BATTLE_LOG_CATEGORIES.STATUS,
      meta: { role: 'battle' },
    })
    // NOTE: 不调用 stopReplay() — ReplayEngine.handleReplayEnd() 已处理播放结束
  }

  /** 处理 Buff 添加回放 */
  private handleBuffAddReplay(data: any) {
    if (!data?.targetId) return
    LoggerProvider.logger.addBattleLog({
      turn: data.turn ?? 0,
      message: `[回放] ${data.targetId} 获得 Buff: ${data.buffId ?? '未知'}`,
      segments: [{ text: `[回放] Buff 添加: ${data.buffId ?? '未知'}` }],
      category: BATTLE_LOG_CATEGORIES.STATUS,
      meta: { role: 'sub' },
    })
  }

  /** 处理 Buff 移除回放 */
  private handleBuffRemoveReplay(data: any) {
    if (!data?.targetId) return
    LoggerProvider.logger.addBattleLog({
      turn: data.turn ?? 0,
      message: `[回放] ${data.targetId} 移除 Buff: ${data.instanceId ?? '未知'}`,
      segments: [{ text: `[回放] Buff 移除: ${data.instanceId ?? '未知'}` }],
      category: BATTLE_LOG_CATEGORIES.STATUS,
      meta: { role: 'sub' },
    })
  }

  /** 处理 Buff 更新回放 */
  private handleBuffUpdateReplay(data: any) {
    if (!data?.targetId) return
    const info: string[] = []
    if (data.remainingTurns != null) info.push(`剩余${data.remainingTurns}回合`)
    if (data.stacks != null) info.push(`${data.stacks}层`)
    LoggerProvider.logger.addBattleLog({
      turn: data.turn ?? 0,
      message: `[回放] ${data.targetId} Buff 更新: ${info.join('，') || '状态变化'}`,
      segments: [{ text: `[回放] Buff 更新: ${info.join('，') || '状态变化'}` }],
      category: BATTLE_LOG_CATEGORIES.STATUS,
      meta: { role: 'sub' },
    })
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
      import('@/shared/utils/RAF').then(({ raf }) => {
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
    // ★ 恢复日志自动清理，与 stopReplay() 保持一致
    LoggerProvider.logger.setAutoCleanup(true)
  }
}
