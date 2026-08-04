/**
 * BattleLifecycleManager headless 守卫测试
 *
 * 背景：批量数据生成（BattleDataGenerator）期间强制 headless=true，
 *       endBattle 不应广播 BATTLE_ENDED（避免 UI 状态/战报弹窗被批量战斗污染），
 *       同时 headless 下跳过自动保存（saveRecording），避免与生成器手动保存双写。
 *
 * 运行: npx vitest run tests/unit/battle-lifecycle-headless.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { BattleLifecycleManager } from '@/domain/battle/service/BattleLifecycleManager'
import { BattleStatus, RoundStatus, ParticipantSide } from '@/domain/battle/type/types'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import type { BattleData } from '@/domain/battle/type/types'

function makeBattle(headless: boolean): BattleData {
  return {
    battleId: 'b_headless_test',
    currentTurn: 3,
    battleState: BattleStatus.ACTIVE,
    roundState: RoundStatus.START,
    winner: undefined,
    endTime: undefined,
    actions: [],
    participants: new Map(),
    headless,
  } as unknown as BattleData
}

function makeManager(headless: boolean) {
  const battle = makeBattle(headless)
  const battleRecorder = {
    recordAction: vi.fn(),
    endRecording: vi.fn(),
    saveRecording: vi.fn().mockResolvedValue('save_key'),
  }
  const uiEventPort = { emit: vi.fn() }
  const debugGate = { waitIfNeeded: vi.fn().mockResolvedValue(undefined) }
  const buffSystem = { clearAllBuffs: vi.fn() }
  const animationManager = { cleanupAnimationState: vi.fn() }
  const rafTimer = { setTimeout: vi.fn(), clear: vi.fn() }
  const processTurnInternal = vi.fn()

  const manager = new BattleLifecycleManager(
    () => battle,
    rafTimer as unknown as ConstructorParameters<typeof BattleLifecycleManager>[1],
    battleRecorder as unknown as ConstructorParameters<typeof BattleLifecycleManager>[2],
    buffSystem as unknown as ConstructorParameters<typeof BattleLifecycleManager>[3],
    processTurnInternal,
    animationManager as unknown as ConstructorParameters<typeof BattleLifecycleManager>[5],
    uiEventPort as unknown as ConstructorParameters<typeof BattleLifecycleManager>[6],
    debugGate as unknown as ConstructorParameters<typeof BattleLifecycleManager>[7],
  )
  return { manager, battle, battleRecorder, uiEventPort, debugGate }
}

describe('BattleLifecycleManager endBattle headless 守卫', () => {
  it('headless=true：不广播 BATTLE_ENDED、跳过自动保存，但正常 endRecording', async () => {
    const { manager, battle, battleRecorder, uiEventPort } = makeManager(true)

    await manager.endBattle(ParticipantSide.ALLY)

    // 录制收尾照常（battle_end 事件写入录制，供生成器 saveBattleRecording 使用）
    expect(battleRecorder.endRecording).toHaveBeenCalledWith(battle.battleId, ParticipantSide.ALLY)
    // headless：跳过自动保存（避免与 BattleDataGenerator 手动保存双写）
    expect(battleRecorder.saveRecording).not.toHaveBeenCalled()
    // headless：不广播 UI 事件（避免 battleStore/BattleEventManager 状态被批量战斗污染）
    expect(uiEventPort.emit).not.toHaveBeenCalledWith(BattleEventCodes.BATTLE_ENDED, expect.anything())
  })

  it('headless=false（正常战斗）：广播 BATTLE_ENDED 并自动保存，行为与改动前一致', async () => {
    const { manager, battle, battleRecorder, uiEventPort } = makeManager(false)

    await manager.endBattle(ParticipantSide.ENEMY)

    expect(battleRecorder.endRecording).toHaveBeenCalledWith(battle.battleId, ParticipantSide.ENEMY)
    expect(battleRecorder.saveRecording).toHaveBeenCalledWith(battle.battleId)
    expect(uiEventPort.emit).toHaveBeenCalledWith(BattleEventCodes.BATTLE_ENDED, { winner: ParticipantSide.ENEMY })
  })
})
