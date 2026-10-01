// @vitest-environment happy-dom
/**
 * 操作域 e2e 状态机测试（系统行为审计 · 操作域）
 *
 * 驱动真实 battleStore（Pinia）走完关键用户旅程并交错操作：
 * 编队 → 开战 → 回合推进 → 撤销 → 暂停/恢复 → 中断（endBattle）→ 二次开战。
 * 单函数测试管每一步"能不能动"，本文件管"任意交错之后 store/投影/引擎三层状态
 * 是否仍然同源"——这正是 AGENTS.md「清理与重建必须成对」的风险面：
 * endBattle/reset 清了一半、下一场开局没有重建回去，就是脏状态泄漏。
 *
 * 运行: npx vitest run tests/e2e/battle-ops-journey.e2e.test.ts
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { useBattleStore } from '@/presentation/stores/battleStore'
import type { BattleService } from '@/application/facade/BattleFacade'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'

function freshLineup() {
  const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
  return { allies, enemies }
}

describe('battleStore 操作旅程与交错状态机', () => {
  let store: ReturnType<typeof useBattleStore>
  let battleService: BattleService
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    setActivePinia(createPinia())
    store = useBattleStore()
    battleService = container.resolve<BattleService>('BattleService')
    store.initializeBattleService(battleService)
    battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    // NOTE: 用快速模式（UI 语义）跳过动画等待；不能设 headless——captureUndoSnapshot
    //       在 headless 下按设计跳栈（BattleSystem.ts:1788），回退栈断言会恒红。
    //       quickMode 存在 battleData 上，initialize 复用同一对象不重置，开局后仍生效。
    store.toggleQuickMode()
  })

  it('开局即净场：投影参与者齐备、无残留 buff、undoDepth 归零且与引擎同步', async () => {
    const { allies, enemies } = freshLineup()
    battleService.initializeTeams(allies, enemies)
    store.setPendingSeed('ops-open')
    await store.startBattle()

    expect(store.currentBattleId).toBeTruthy()
    expect(store.participants.size).toBe(2)
    // NOTE: 开局 buff 权威是引擎（innate 光环如 skill_enemy_079_passive 属合法初始态），
    //       断言口径 = 投影与引擎逐单位一致，而非恒 0。
    for (const snap of store.participants.values()) {
      const engineCount = battleSystem.getBuffSystem().getBuffInstanceIds(snap.id).length
      expect(snap.buffs.length, `单位 ${snap.id} 投影 buff 与引擎不一致`).toBe(engineCount)
    }
    expect(store.undoDepth).toBe(0)
    expect(store.undoDepth).toBe(battleSystem.getUndoDepth())
  })

  it('回合推进 → 撤销：store 与引擎回退栈深度始终同源', async () => {
    const { allies, enemies } = freshLineup()
    battleService.initializeTeams(allies, enemies)
    store.setPendingSeed('ops-undo')
    await store.startBattle()

    await store.executeManualAction(allies[0]!.id, null, enemies[0]!.id)
    await store.executeManualAction(allies[0]!.id, null, enemies[0]!.id)

    expect(battleSystem.getUndoDepth(), '引擎回退栈未随行动累积').toBeGreaterThan(0)
    expect(store.undoDepth).toBe(battleSystem.getUndoDepth())

    const beforeDepth = battleSystem.getUndoDepth()
    await store.undoLastAction()

    expect(store.undoDepth, 'store 深度未随撤销回落').toBe(beforeDepth - 1)
    expect(store.undoDepth).toBe(battleSystem.getUndoDepth())
    expect(battleSystem.getBattleData()!.currentTurn).toBeLessThanOrEqual(2)
    expect([...store.participants.values()].length).toBe(2)
  })

  it('暂停/恢复交错不打断状态同步：深度与参与者不变', async () => {
    const { allies, enemies } = freshLineup()
    battleService.initializeTeams(allies, enemies)
    store.setPendingSeed('ops-pause')
    await store.startBattle()
    await store.executeManualAction(allies[0]!.id, null, enemies[0]!.id)

    const depth = store.undoDepth
    store.togglePause()
    store.togglePause()

    expect(store.undoDepth).toBe(depth)
    expect(store.participants.size).toBe(2)
    expect(store.undoDepth).toBe(battleSystem.getUndoDepth())
  })

  it('中断后二次开战：脏状态零残留（暂存行动清零、投影重建、引擎栈重置）', async () => {
    const { allies, enemies } = freshLineup()
    battleService.initializeTeams(allies, enemies)
    store.setPendingSeed('ops-first')
    await store.startBattle()
    await store.executeManualAction(allies[0]!.id, null, enemies[0]!.id)

    // 人为制造"操作半途"状态：暂存手动行动 + 回退栈非空
    store.setPendingManualAction({
      participantId: allies[0]!.id, skillId: null, skillName: '普攻',
    })
    const firstBattleId = store.currentBattleId
    expect(store.undoDepth).toBeGreaterThan(0)

    await store.endBattle()
    // 中断语义：暂存行动必须随战斗作废，否则下一场 UI 会带着上一场的待选目标
    expect(store.pendingManualAction, 'endBattle 未清理待选行动（脏状态跨场泄漏）').toBeNull()
    // NOTE: endBattle 保留 currentBattleId 是设计使然——结算/回放面板按 id 取战报（store:291），
    //       句柄换新发生在下一场 startBattle，不要求 endBattle 释放。

    // 二次开战（同一引擎单例——清理/重建配对在此验收）
    const { allies: a2, enemies: e2 } = freshLineup()
    battleService.initializeTeams(a2, e2)
    store.setPendingSeed('ops-second')
    await store.startBattle()

    expect(store.currentBattleId).toBeTruthy()
    expect(store.currentBattleId, '二次开战未换新战斗句柄').not.toBe(firstBattleId)
    expect(store.undoDepth, '第二场开局回退栈未归零').toBe(0)
    expect(store.undoDepth).toBe(battleSystem.getUndoDepth())
    for (const snap of store.participants.values()) {
      const engineCount = battleSystem.getBuffSystem().getBuffInstanceIds(snap.id).length
      expect(snap.buffs.length, `第二场单位 ${snap.id} 投影 buff 与引擎不一致`).toBe(engineCount)
    }
    // 上一场的参与者实例不得残留在 BuffSystem（清理必须按 id 对账）
    const oldStackMods = battleSystem.getBuffSystem().getModifierStack(allies[0]!.id)
      .getModifiers(ATTRIBUTE_CODE.attack)
    expect(oldStackMods.length, '旧参与者修饰符残留于 BuffSystem').toBe(0)
  })

  it('reset 后重开：与从未战斗过的初始态等价', async () => {
    const { allies, enemies } = freshLineup()
    battleService.initializeTeams(allies, enemies)
    store.setPendingSeed('ops-reset')
    await store.startBattle()
    await store.executeManualAction(allies[0]!.id, null, enemies[0]!.id)

    store.resetBattle()
    expect(store.undoDepth).toBe(0)

    const { allies: a2, enemies: e2 } = freshLineup()
    battleService.initializeTeams(a2, e2)
    store.setPendingSeed('ops-after-reset')
    await store.startBattle()
    expect(store.participants.size).toBe(2)
    expect(store.undoDepth).toBe(0)
    expect(store.undoDepth).toBe(battleSystem.getUndoDepth())
  })
})
