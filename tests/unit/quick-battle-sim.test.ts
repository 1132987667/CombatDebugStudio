/**
 * QuickBattleSim 快速验证模拟器测试
 *
 * 验证封神榜「快速验证」核心契约：
 * 1. 真实无头对局：结果结构完整（胜负/回合/战报单位覆盖双方）
 * 2. 同种子确定性：同编成同种子两场结果一致（复现语义）
 * 3. 回合上限：未决出场次 winner=null 且无战报，不抛异常
 * 4. 全局状态隔离：headless/日志静默/日志内容跑完复原（不污染 UI 面板）
 *
 * 运行: npx vitest run tests/unit/quick-battle-sim.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BattleStatus, ParticipantSide } from '@/domain/battle/type/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import type { ActorData } from '@/domain/fengshen/types'
import { getEnemyConfig } from '@tests/fixtures/loadTestData'
import { makeDefaultAttributes } from '@tests/fixtures/participants'
import { runQuickBattle } from '@/application/service/QuickBattleSim'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'

/** 我方验证用角色：空技能（引擎普攻兜底），标准属性 */
function makeActor(id: string, name: string): ActorData {
  return {
    id,
    name,
    level: 20,
    stats: { ...makeDefaultAttributes() } as ActorData['stats'],
    skillIds: [],
  }
}

describe('QuickBattleSim 无头快速验证', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
  })

  it('真实对局：结果结构完整，战报覆盖双方且战斗确实发生', async () => {
    const enemy = getEnemyConfig('yaotu_fire')
    expect(enemy).toBeDefined()
    const result = await runQuickBattle({
      allyActors: [makeActor('actor_a', '验证甲士'), makeActor('actor_b', '验证射手')],
      enemyEnemies: [enemy!],
    })

    expect(result.ok).toBe(true)
    expect(result.rounds).toBeGreaterThan(0)
    expect(result.allyNames).toEqual(['验证甲士', '验证射手'])
    // 战报（未超时必有）：单位覆盖双方，且总输出 > 0（战斗确实发生）
    expect(result.summary).toBeDefined()
    const units = Object.values(result.summary!.units)
    expect(units.length).toBe(3)
    expect(units.some((u) => u.side === ParticipantSide.ALLY)).toBe(true)
    expect(units.some((u) => u.side === ParticipantSide.ENEMY)).toBe(true)
    const totalDealt = units.reduce((s, u) => s + u.dealt, 0)
    expect(totalDealt).toBeGreaterThan(0)
    expect([ParticipantSide.ALLY, ParticipantSide.ENEMY, null]).toContain(result.winner)
  })

  it('同种子确定性：同编成同种子两场胜负与回合数一致', async () => {
    const enemy = getEnemyConfig('yaotu_gold')
    expect(enemy).toBeDefined()
    const party = [makeActor('actor_a', '验证甲士')]
    const opts = { allyActors: party, enemyEnemies: [enemy!], seed: 'verify-seed-42' } as const

    const r1 = await runQuickBattle(opts)
    const r2 = await runQuickBattle(opts)

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    expect(r1.winner).toBe(r2.winner)
    expect(r1.rounds).toBe(r2.rounds)
    // 战报数值级一致（同种子全判定序列可复现）
    const dealt1 = Object.values(r1.summary!.units).reduce((s, u) => s + u.dealt, 0)
    const dealt2 = Object.values(r2.summary!.units).reduce((s, u) => s + u.dealt, 0)
    expect(dealt1).toBe(dealt2)
  })

  it('回合上限：maxRounds=1 未决出 → winner=null 无战报，不抛异常', async () => {
    const enemy = getEnemyConfig('yaotu_fire')
    expect(enemy).toBeDefined()
    const result = await runQuickBattle({
      allyActors: [makeActor('actor_a', '验证甲士')],
      enemyEnemies: [enemy!],
      maxRounds: 1,
    })

    expect(result.ok).toBe(true)
    expect(result.winner).toBeNull()
    expect(result.rounds).toBe(1)
    expect(result.summary).toBeUndefined()
  })

  it('战斗进行中守卫：引擎 ACTIVE 时拒绝模拟（保护进行中的对局）', async () => {
    const battleSystem = container.resolve(
      (await import('@/domain/battle/entity/BattleInterfaces')).BATTLE_SYSTEM_TOKEN.toString(),
    ) as import('@/domain/battle/BattleSystem').BattleSystem
    const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)

    try {
      const result = await runQuickBattle({
        allyActors: [makeActor('actor_a', '验证甲士')],
        enemyEnemies: [getEnemyConfig('yaotu_fire')!],
      })
      expect(result.ok).toBe(false)
      expect(result.reason).toContain('战斗正在进行')
    } finally {
      // 清理人为制造的 ACTIVE 战斗 + initialize 写入的战斗日志，避免污染后续测试（守卫拒绝时 runQuickBattle 不会清理）
      battleSystem.resetBattle()
      LoggerProvider.logger.clearLogs()
    }
  })

  it('全局状态隔离：headless/日志静默/日志内容跑完复原', async () => {
    const battleSystem = container.resolve(
      (await import('@/domain/battle/entity/BattleInterfaces')).BATTLE_SYSTEM_TOKEN.toString(),
    ) as { getHeadless(): boolean }
    const logger = LoggerProvider.logger
    // battleLogs 为快照恢复的目标桶（exportLogs 混合四类日志、importLogs 并入 battleLogs，
    // 恢复语义有偏是既有行为）——按类型过滤验证模拟的战斗日志不残留
    const internals = logger as unknown as { muted: boolean; autoCleanup: boolean; battleLogs: unknown[] }

    const enemy = getEnemyConfig('yaotu_fire')
    await runQuickBattle({ allyActors: [makeActor('actor_a', '验证甲士')], enemyEnemies: [enemy!] })

    expect(battleSystem.getHeadless()).toBe(false)
    expect(internals.muted).toBe(false)
    expect(internals.autoCleanup).toBe(true)
    // 模拟产生的战斗叙事不残留在日志面板（连跑时桶内可能剩容器重初始化的系统条目，与模拟无关）
    const battleEntries = internals.battleLogs.filter((l) => (l as { type?: string }).type === 'battle')
    expect(battleEntries.length).toBe(0)
  })
})
