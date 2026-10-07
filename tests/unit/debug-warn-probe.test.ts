// @vitest-environment happy-dom
/**
 * debug-warn-probe.test.ts — 战斗调试日志 WARN 刷屏回归检查
 * 背景（2026-10-07）：调试页签被 1000 条 WRN 刷满，根因是「有 JSON 配置但无脚本 → effectPlan 驱动」
 * 这条合法路径每次施加 buff 都写一条 `Buff script not found: xxx` 的 WARN 误报（BuffSystem.applyBuff）。
 * 本测试跑一场真实战斗，断言该误报不再以 WARN 级出现，并输出 WARN 分布供排查参考。
 * 运行: npx vitest run tests/unit/debug-warn-probe.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { ParticipantSide, BattleStatus } from '@/domain/battle/type/types'
import { LogLevel } from '@/shared/types/battle-log'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'

describe('战斗调试日志 WARN 分布（刷屏回归检查）', () => {
  it('一场真实战斗不产生 "Buff script not found" 的 WARN 误报', async () => {
    container.clear()
    initializeContainer()
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())

    const warns: string[] = []
    const original = battleLogManager.addDebugLog.bind(battleLogManager)
    battleLogManager.addDebugLog = ((message: string, options?: { level?: LogLevel }) => {
      if ((options?.level ?? LogLevel.INFO) === LogLevel.WARN) warns.push(String(message))
      original(message, options as never)
    }) as typeof battleLogManager.addDebugLog

    const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)

    let rounds = 0
    while (battleSystem.getBattleStatus() === BattleStatus.ACTIVE && rounds < 50) {
      await battleSystem.processTurn()
      rounds++
    }
    if (battleSystem.getBattleStatus() === BattleStatus.ACTIVE) {
      await battleSystem.endBattle(ParticipantSide.ALLY)
    }

    const byMsg = new Map<string, number>()
    for (const m of warns) byMsg.set(m.replace(/\d+/g, '*'), (byMsg.get(m.replace(/\d+/g, '*')) ?? 0) + 1)
    // happy-dom 无 IndexedDB 的存储告警属环境噪音，过滤后再看战斗链路自身的 WARN
    const battleWarns = [...byMsg.entries()].filter(([m]) => !m.includes('存储'))
    console.log(`[探针] 回合数=${rounds}，WARN 总数=${warns.length}，战斗链路 WARN 分布:`, battleWarns)

    // 回归点：effectPlan 驱动的合法 buff 施加路径不得以 WARN 报"脚本缺失"
    expect(warns.filter((m) => m.startsWith('Buff script not found'))).toHaveLength(0)
  })
})
