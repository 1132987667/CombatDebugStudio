/**
 * BattleLogManager.setMuted 静默机制测试
 *
 * 背景：批量数据生成（BattleDataGenerator）向共享日志管理器写入数十场战斗的日志，
 *       每次写入都会触发 UI 监听器（BattleLog）全量重渲染，数千次写入导致界面白屏。
 *       setMuted(true) 期间抑制日志更新通知，setMuted(false) 时补发一次。
 *
 * 运行: npx vitest run tests/unit/battle-log-manager-muted.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BattleLogManager, battleLogManager } from '@/infrastructure/adapters/logging/BattleLogManager'
import { LogType } from '@/shared/types/battle-log'

describe('BattleLogManager.setMuted', () => {
  const manager = battleLogManager

  beforeEach(() => {
    manager.clearLogs()
    manager.setMuted(false)
  })

  afterEach(() => {
    manager.clearLogs()
    manager.setMuted(false)
  })

  it('muted=true 时写入日志不通知监听器', () => {
    const listener = vi.fn()
    manager.addListener(listener)
    listener.mockClear() // addListener 注册时立即回调一次，不计入断言
    manager.setMuted(true)

    manager.addBattleLog({
      turn: 1,
      message: '测试战斗日志',
      segments: [{ text: '测试战斗日志' }],
    })

    expect(listener).not.toHaveBeenCalled()
    // 日志本身仍正常入列（供生成器 collectNarrativeBlocks 读取）
    expect(manager.getAllLogs().length).toBe(1)
    manager.removeListener(listener)
  })

  it('muted=false 时恢复通知', () => {
    const listener = vi.fn()
    manager.addListener(listener)
    listener.mockClear()

    manager.setMuted(true)
    manager.addBattleLog({
      turn: 1,
      message: '静默期间',
      segments: [{ text: '静默期间' }],
    })
    expect(listener).not.toHaveBeenCalled()

    // 解除静默时补发一次通知，监听器拿到当前全量日志
    manager.setMuted(false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: LogType.BATTLE })]),
    )

    // 解除后正常写入恢复逐条通知
    manager.addSystemLog({ message: '恢复后' })
    expect(listener).toHaveBeenCalledTimes(2)
    manager.removeListener(listener)
  })

  it('muted 状态独立于 autoCleanup', () => {
    const listener = vi.fn()
    manager.addListener(listener)
    listener.mockClear()

    manager.setAutoCleanup(false)
    manager.setMuted(true)
    manager.addBattleLog({
      turn: 1,
      message: 'x',
      segments: [{ text: 'x' }],
    })
    expect(listener).not.toHaveBeenCalled()

    manager.setMuted(false)
    manager.setAutoCleanup(true)
    expect(listener).toHaveBeenCalledTimes(1)
    manager.removeListener(listener)
  })
})

describe('BattleLogManager 单例隔离（不使用共享实例，防止跨用例污染）', () => {
  it('独立实例同样受 muted 控制', () => {
    const fresh = new BattleLogManager()
    const listener = vi.fn()
    fresh.addListener(listener)
    listener.mockClear()
    fresh.setMuted(true)
    fresh.addSystemLog({ message: 'x' })
    expect(listener).not.toHaveBeenCalled()
    fresh.setMuted(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
