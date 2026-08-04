/**
 * 守护者被动日志顺序 + 连击之心目标 E2E
 *
 * 背景（bug 根因）：
 * - ON_HIT/DAMAGE_TAKEN 被动（能量过载/疾风叠步/复仇怒火）在 BattleExecutor.settleDamage
 *   中触发，而 settleDamage 先于 emitAttackLog（攻击主日志）执行；
 * - BattleLogManager.addBattleLog 原本不检查 _buffering，攻击结算期间的 sub 日志直接入列，
 *   导致被动日志排在所属攻击日志之前，渲染时变成独立行/挂错攻击块。
 * - 修复：addBattleLog 在缓冲期间暂存 role='sub' 日志，攻击主日志后统一 flush。
 *
 * 另：连击之心（guardian_combo_heart）与毒素浸染（guardian_toxin_soak）原 selector 为
 * faction:'self'，on_hit 的 deal_damage 会打在自己身上；已改为 faction:'enemy'。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus } from '@/domain/battle/type/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { RoundNarrativeRenderer } from '@/domain/battle/logs/renderers/RoundNarrativeRenderer'
import type { NarrativeBlock } from '@/shared/types/battle-log'
import { NarrativeBlockType } from '@/shared/types/battle-log'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))

vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    setTimeout(fn: (...args: unknown[]) => void, _ms?: number): symbol {
      fn()
      return Symbol('mock')
    }
    setInterval = () => Symbol('mock')
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

const blockText = (segs: { text: string }[]): string =>
  segs.map((s) => s.text).join('')

describe('守护者被动日志顺序（攻击后触发 + 缓冲 flush）', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(
      BATTLE_SYSTEM_TOKEN.toString(),
    )
  })

  it('能量过载/疾风叠步作为火护法攻击的 sub 显示，复仇怒火作为金护法攻击的 sub 显示', async () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire'],
      ['guardian_gold'],
    )
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)

    const battleData = battleSystem.getBattleData()!
    for (let i = 0; i < 2; i++) {
      if (battleData.battleState !== BattleStatus.ACTIVE) break
      await battleSystem.processTurn()
    }

    const logs = LoggerProvider.logger.getAllLogs()
    const blocks = new RoundNarrativeRenderer().renderEntries(logs)
    const actions = blocks.filter(
      (b): b is Extract<NarrativeBlock, { type: 'action' }> =>
        b.type === NarrativeBlockType.ACTION,
    )
    // 速度更快者先行动：火护法（speed 35）> 金护法（speed 30）
    expect(actions.length).toBeGreaterThanOrEqual(2)

    const subTexts = (b: Extract<NarrativeBlock, { type: 'action' }>): string =>
      b.subs.map(blockText).join('\n')

    // 火护法攻击块：命中触发的能量过载/疾风叠步应挂在攻击之后
    const fireAction = actions.find((b) =>
      blockText(b.header).startsWith('[友方]火护法'),
    )
    expect(fireAction).toBeDefined()
    expect(subTexts(fireAction!)).toContain('能量过载')
    expect(subTexts(fireAction!)).toContain('疾风叠步')

    // A2：块内顺序应为「受到伤害 → 被动效果」——第一个 sub 是结算行而非被动
    expect(subTexts(fireAction!).indexOf('受到')).toBeLessThan(
      subTexts(fireAction!).indexOf('能量过载'),
    )

    // 金护法攻击块：火护法受击触发的复仇怒火应挂在对应攻击之后
    const goldAction = actions.find((b) =>
      blockText(b.header).startsWith('[敌方]金护法'),
    )
    expect(goldAction).toBeDefined()
    expect(subTexts(goldAction!)).toContain('复仇怒火')
    expect(subTexts(goldAction!).indexOf('受到')).toBeLessThan(
      subTexts(goldAction!).indexOf('复仇怒火'),
    )

    // 修复前：被动日志在攻击主日志之前入列，渲染成独立 plain 块。修复后不应存在独立 plain 的能量过载
    const standalone = blocks.filter(
      (b) =>
        b.type === NarrativeBlockType.PLAIN &&
        blockText(b.segments).includes('能量过载'),
    )
    expect(standalone).toHaveLength(0)

    // A3：回合开始能量应有可见日志（且实体段带敌我前缀 — 统一口径回归断言）
    const energyLogs = logs.filter((l) =>
      (l.message ?? '').includes('获得回合开始能量'),
    )
    expect(energyLogs.length).toBeGreaterThanOrEqual(2)
    expect(energyLogs[0].message).toMatch(/回合开始能量 \+/)
    expect(energyLogs.every((l) => /[友方]|[敌方]/.test(l.message ?? ''))).toBe(
      true,
    )

    // B3：叠加 buff 应显示层数（第 2 回合疾风叠步/复仇怒火叠加到 2 层）
    const layerLogs = logs.filter((l) => (l.message ?? '').includes('层)'))
    expect(layerLogs.length).toBeGreaterThanOrEqual(2)

    // P3 因果链：被动日志 meta 携带 triggerPhase（为什么触发）+ sourceId（谁触发）
    const findMeta = (sub: string) => {
      const entry = logs.find((l) => (l.message ?? '').includes(sub))
      expect(entry).toBeDefined()
      return entry!.meta as { triggerPhase?: string; sourceId?: string }
    }
    // 能量过载 = 普攻命中触发（on_hit）
    const overloadMeta = findMeta('能量过载')
    expect(overloadMeta.triggerPhase).toBe('on_hit')
    expect(overloadMeta.sourceId).toBeTruthy()
    // 复仇怒火 = 受击触发（damage_taken）
    expect(findMeta('复仇怒火').triggerPhase).toBe('damage_taken')
    // 首领光环 = 战斗开始触发（battle_start，standalone 无 role 但保留因果链）
    const auraMeta = findMeta('首领光环')
    expect(auraMeta.triggerPhase).toBe('battle_start')
    expect(auraMeta.role).toBeUndefined()

    // B1：回合结束阶段标记存在
    const turnEndLogs = logs.filter((l) =>
      (l.message ?? '').includes('回合结束'),
    )
    expect(turnEndLogs.length).toBeGreaterThanOrEqual(2)
    expect(turnEndLogs[0].message).toMatch(/第 \d+ 回合结束/)

    // B2：回合开始能量日志携带 before/after 快照（且显示实际到账）
    const energyEntry = logs.find((l) =>
      (l.message ?? '').includes('获得回合开始能量'),
    )!
    const energyMeta = energyEntry.meta as {
      energyBefore?: number
      energyAfter?: number
    }
    expect(energyMeta.energyBefore).toBeTypeOf('number')
    expect(energyMeta.energyAfter).toBeTypeOf('number')
    expect(energyMeta.energyAfter!).toBeGreaterThanOrEqual(
      energyMeta.energyBefore!,
    )
  })

  it('缓冲机制：sub 日志在 flush 前不入列，flush 后排在 action 日志之后', () => {
    const logger = LoggerProvider.logger
    logger.clearLogs()

    logger.beginBufferSubLogs()
    logger.addBattleLog({
      turn: 1,
      message: 'sub-buffered',
      meta: { role: 'sub' },
    })
    // 缓冲期间：sub 日志不应出现在日志流中
    expect(logger.getAllLogs().some((l) => l.message === 'sub-buffered')).toBe(
      false,
    )

    logger.addBattleLog({ turn: 1, message: 'action-main', meta: { role: 'action' } })
    logger.flushBufferedSubLogs()

    const msgs = logger.getAllLogs().map((l) => l.message)
    expect(msgs).toContain('sub-buffered')
    expect(msgs.indexOf('action-main')).toBeLessThan(msgs.indexOf('sub-buffered'))
  })

  it('连击之心额外普攻的目标是敌方而非自己', async () => {
    let comboMessage: string | null = null

    // 25% 触发概率，多次战斗循环直到触发（每次战斗最多 8 回合）
    for (let attempt = 0; attempt < 8 && comboMessage === null; attempt++) {
      container.clear()
      initializeContainer()
      battleSystem = container.resolve<BattleSystem>(
        BATTLE_SYSTEM_TOKEN.toString(),
      )
      const { allies, enemies } = createTestParticipantsFromConfig(
        ['guardian_fire'],
        ['guardian_gold'],
      )
      battleSystem.initialize(allies, enemies)
      battleSystem.setBattleState(BattleStatus.ACTIVE)
      battleSystem.setQuickMode(true)

      const battleData = battleSystem.getBattleData()!
      for (let i = 0; i < 8; i++) {
        if (battleData.battleState !== BattleStatus.ACTIVE) break
        await battleSystem.processTurn()
      }

      const logs = LoggerProvider.logger.getAllLogs()
      comboMessage =
        logs.find((l) => (l.message ?? '').includes('连击之心'))?.message ??
        null
    }

    expect(comboMessage).not.toBeNull()
    // 修复前：`连击之心 [友方]火护法 对 [友方]火护法 造成 N 点伤害`（打自己）
    // 修复后：`连击之心 [友方]火护法 对 [敌方]金护法 造成 N 点伤害`
    expect(comboMessage).toMatch(/对 \[敌方\]金护法/)
    expect(comboMessage).not.toMatch(/对 \[友方\]火护法/)
  })
})
