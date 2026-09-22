/**
 * 全量敌人冒烟 E2E（补测方案 T5）
 *
 * 对 configs/enemies 中每个敌人配置跑一场 1v1 真实战斗（固定种子、headless、2 回合），
 * 断言行动执行阶段无 ERROR 级日志。
 *
 * 为什么断言日志而不是"不抛异常"：processTurn 会捕获角色行动异常并降级为
 * executeDefaultAction（BattleSystem.ts:1101-1108），异常被吞后战斗照常推进，
 * "无异常抛出"是假断言；日志通道才是错误真实去向。
 *
 * 与 T1（静态引用校验）互补：T1 管配置间引用存在性，本文件覆盖每个敌人
 * 技能步骤与被动在运行时的执行路径。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus } from '@/domain/battle/type/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { getAllEnemyConfigs } from '@tests/fixtures/loadTestData'

const ROUNDS = 2
const enemyIds = getAllEnemyConfigs().map((e) => e.id)

describe('全量敌人冒烟（T5）', () => {
  let errorLogs: string[]

  beforeEach(() => {
    errorLogs = []
  })

  const installErrorCapture = (): void => {
    LoggerProvider.logger = createMockLogManager({
      addDebugLog: vi.fn((message: string, context?: unknown) => {
        const level = (context as { level?: number } | undefined)?.level
        if (level === LogLevel.ERROR) errorLogs.push(message)
      }),
    })
  }

  it('冒烟名册覆盖 enemies.json 全部条目', () => {
    expect(enemyIds.length).toBeGreaterThanOrEqual(180)
    expect(new Set(enemyIds).size).toBe(enemyIds.length)
  })

  it.each(enemyIds)('%s：1v1 真战斗 2 回合内无行动错误', async (id) => {
    container.clear()
    initializeContainer()
    // NOTE: initializeContainer 会覆写 LoggerProvider.logger（Container.ts:137），
    //       捕获钩子必须在其后安装，否则错误日志走真实 manager、断言恒绿。
    installErrorCapture()
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())

    const { allies, enemies } = createTestParticipantsFromConfig(['test_warrior'], [id])
    expect(enemies).toHaveLength(1)

    battleSystem.initialize(allies, enemies, undefined, `smoke-${id}`)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    battleSystem.setHeadless(true)

    for (let round = 0; round < ROUNDS; round++) {
      if (battleSystem.getBattleStatus() !== BattleStatus.ACTIVE) break
      await battleSystem.processTurn()
    }

    expect(errorLogs).toEqual([])
  })
})
