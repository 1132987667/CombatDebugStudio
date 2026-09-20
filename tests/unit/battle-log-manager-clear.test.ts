/**
 * BattleLogManager.clearLogsByTypes 按类型清除测试
 *
 * 背景：日志面板页签化后，每个页签需要独立的清除能力：
 *       系统页签清 SYSTEM/ACTION/ITEM 三类，调试页签清 DEBUG，
 *       战斗页签继续用原有 clearLogs。
 *
 * 运行: npx vitest run tests/unit/battle-log-manager-clear.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { BattleLogManager } from '@/infrastructure/adapters/logging/BattleLogManager'
import { LogType } from '@/shared/types/battle-log'

/** 向独立实例写入五类日志各一条 */
function seedAllTypes(manager: BattleLogManager): void {
  manager.addBattleLog({ turn: 1, message: '战斗', segments: [{ text: '战斗' }] })
  manager.addSystemLog({ message: '系统' })
  manager.addActionLog({ message: '动作' })
  manager.addItemLog({ message: '物品' })
  manager.addDebugLog('调试')
}

function countByType(logs: ReturnType<BattleLogManager['getAllLogs']>, type: LogType): number {
  return logs.filter((l) => l.type === type).length
}

describe('BattleLogManager.clearLogsByTypes', () => {
  it('只清除指定类型，其余类型保留', () => {
    const manager = new BattleLogManager()
    seedAllTypes(manager)

    manager.clearLogsByTypes([LogType.SYSTEM, LogType.ACTION, LogType.ITEM])

    const logs = manager.getAllLogs()
    expect(countByType(logs, LogType.SYSTEM)).toBe(0)
    expect(countByType(logs, LogType.ACTION)).toBe(0)
    expect(countByType(logs, LogType.ITEM)).toBe(0)
    expect(countByType(logs, LogType.BATTLE)).toBe(1)
    expect(countByType(logs, LogType.DEBUG)).toBe(1)
  })

  it('清除 DEBUG 类型', () => {
    const manager = new BattleLogManager()
    seedAllTypes(manager)

    manager.clearLogsByTypes([LogType.DEBUG])

    const logs = manager.getAllLogs()
    expect(countByType(logs, LogType.DEBUG)).toBe(0)
    expect(logs.length).toBe(4)
  })

  it('清除后通知监听器一次，且全量序号计数器不回退（key 不冲突）', () => {
    const manager = new BattleLogManager()
    const listener = vi.fn()
    manager.addListener(listener)
    listener.mockClear()

    seedAllTypes(manager)
    listener.mockClear()

    manager.clearLogsByTypes([LogType.BATTLE])
    expect(listener).toHaveBeenCalledTimes(1)

    manager.addBattleLog({ turn: 1, message: '再战', segments: [{ text: '再战' }] })
    const indexes = manager.getAllLogs().filter((l) => l.type === LogType.BATTLE).map((l) => l.index)
    expect(new Set(indexes).size).toBe(indexes.length)
  })
})
