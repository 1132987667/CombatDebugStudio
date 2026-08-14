/**
 * 文件: battle-end-trace.test.ts
 * 功能: 战斗结束 trace 收尾（battle_end 事件补发 + traceEvents 落盘）回归测试
 * 描述: 修复前：
 *       - 无任何发射端发 battle_lifecycle action='battle_end'，LiveBattleStream 的
 *         isBattleEnd 恒 false，实时战斗结束后不收尾、摘要无胜方；
 *       - 手动结束（BattleManager.endBattle）不落盘 traceEvents，实时战报（从录制
 *         派生）恒为空。
 *       修复后自然结束（BattleSystem.endBattle）与手动结束共用 finalizeBattleTrace。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleManager } from '@/domain/battle/BattleManager'
import { BattleStatus, ParticipantSide } from '@/domain/battle/type/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { TracePhase } from '@/shared/types/trace-event'
import { fromRecordedBattle } from '@/application/service/UnifiedArchiveService'
import { summarizeBattle } from '@/domain/battle/replay/unified/unified-summary'

describe('战斗结束 trace 收尾（battle_end 事件补发 + 落盘）', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(
      BATTLE_SYSTEM_TOKEN.toString(),
    )
  })

  function startBattle(): string {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire'],
      ['guardian_gold'],
    )
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    return battleSystem.getBattleData()!.battleId
  }

  it('自然结束（BattleSystem.endBattle）：补发 battle_end 事件，胜方与战报正确', async () => {
    const battleId = startBattle()

    await battleSystem.endBattle(ParticipantSide.ALLY)

    // traceCollector 已有 battle_end 事件（此前无发射端，实时流/回放缺结束标记）
    const ends = battleSystem.traceCollector
      .query({ phase: TracePhase.BATTLE_LIFECYCLE })
      .filter((e) => (e.payload as Record<string, unknown>).action === 'battle_end')
    expect(ends).toHaveLength(1)
    expect((ends[0].payload as { winner: string }).winner).toBe('ally')

    // 录制已含 traceEvents 与 battle_end → fromRecordedBattle 不再合成 evt_be
    const rec = battleSystem.getBattleRecording(battleId)!
    const archive = fromRecordedBattle(rec)!
    const be = archive.events.filter(
      (e) => e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>).action === 'battle_end',
    )
    expect(be).toHaveLength(1)
    expect(be[0].id).not.toBe('evt_be')

    // 战报胜方与胜负边际可信
    const sum = summarizeBattle(archive)
    expect(sum.winner).toBe('ally')
    expect(sum.survivorCount).toBeGreaterThan(0)
  })

  it('手动收尾（finalizeBattleTrace）：traceEvents 落盘，战报从录制派生非空', async () => {
    const battleId = startBattle()
    // 产生若干 trace 事件（真实行动链路）
    for (let i = 0; i < 3 && battleSystem.getBattleStatus() === BattleStatus.ACTIVE; i++) {
      await battleSystem.processTurn()
    }

    // 手动结束路径（BattleManager.endBattle 调用）只做 trace 收尾，不碰 lifecycle
    battleSystem.finalizeBattleTrace(ParticipantSide.ENEMY)

    const rec = battleSystem.getBattleRecording(battleId)!
    expect(rec.traceEvents?.length ?? 0).toBeGreaterThan(0)
    // 修复前 traceEvents 未落盘 → 战报全 0；修复后从真实事件派生
    const archive = fromRecordedBattle(rec)!
    const sum = summarizeBattle(archive)
    const totalDealt = Object.values(sum.units).reduce((s, u) => s + u.dealt, 0)
    expect(totalDealt).toBeGreaterThan(0)
    expect(sum.winner).toBe('enemy')
  })

  it('BattleManager.endBattle（手动结束 UI 路径）调用 finalizeBattleTrace', async () => {
    const traceSpy = vi.spyOn(battleSystem, 'finalizeBattleTrace')
    const bs = battleSystem
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire'],
      ['guardian_gold'],
    )
    bs.initialize(allies, enemies)
    bs.setBattleState(BattleStatus.ACTIVE)
    bs.setQuickMode(true)

    // 以最小 mock 装配 BattleManager（构造参数仅作桥接）
    const manager = new BattleManager(
      bs,
      { getBattleId: () => 'b1' } as unknown as Parameters<ConstructorParameters<typeof BattleManager>[1]>,
      {
        stopAutoBattle: vi.fn(),
      } as unknown as Parameters<ConstructorParameters<typeof BattleManager>[2]>,
      { emit: vi.fn() } as unknown as Parameters<ConstructorParameters<typeof BattleManager>[3]>,
      {
        emit: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
      } as unknown as Parameters<ConstructorParameters<typeof BattleManager>[4]>,
    )
    manager.endBattle(ParticipantSide.ALLY)

    expect(traceSpy).toHaveBeenCalledWith(ParticipantSide.ALLY)
    traceSpy.mockRestore()
  })
})
