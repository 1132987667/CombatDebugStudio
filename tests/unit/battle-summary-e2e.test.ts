/**
 * 文件: battle-summary-e2e.test.ts
 * 功能: 真实战斗端到端战报自洽测试（数据可信验证）
 * 描述: 从真实 BattleSystem 跑一场完整战斗，经 fromRecordedBattle → summarizeBattle
 *       验证战报七层自洽与数值合理。这是对合成/录制路径测试的补充——
 *       直接验证「发射端 → 录制 → 存档 → 统计」全链路的数字一致性，
 *       若任一环节漏事件/错归一化，自洽断言即红。
 *       不精确断言具体数值（战斗含随机/护盾/反击，HP 模拟为契约近似），
 *       以稳健的自洽/合理性断言锁定"战报可信"这一核心不变量。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { ParticipantSide, BattleStatus } from '@/domain/battle/type/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { fromRecordedBattle } from '@/application/service/UnifiedArchiveService'
import { summarizeBattle } from '@/domain/battle/replay/unified/unified-summary'

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

describe('真实战斗端到端战报（七层自洽与数值合理）', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
  })

  it('1v1 真实战斗到结束 → 战报覆盖全部参战者、判定/阵营/HP 自洽', async () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire'],
      ['guardian_gold'],
    )
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    const battleData = battleSystem.getBattleData()!
    const battleId = battleData.battleId

    // 跑战斗直到自然结束（上限 50 回合防死循环，未决出则强制结束）
    let rounds = 0
    while (battleSystem.getBattleStatus() === BattleStatus.ACTIVE && rounds < 50) {
      await battleSystem.processTurn()
      rounds++
    }
    if (battleSystem.getBattleStatus() === BattleStatus.ACTIVE) {
      await battleSystem.endBattle(ParticipantSide.ALLY)
    }

    const rec = battleSystem.getBattleRecording(battleId)!
    const archive = fromRecordedBattle(rec)!
    const sum = summarizeBattle(archive)

    // 1. L3 单位表覆盖全部参战者（含无行动者）
    for (const p of [...allies, ...enemies]) {
      expect(sum.units[p.id]).toBeDefined()
    }

    // 2. 战斗确实发生
    expect(sum.rounds).toBeGreaterThan(0)
    expect(sum.durationMs).toBeGreaterThan(0)

    // 3. L3 数值合理：有输出/承伤（普攻必有），治疗非负
    const allUnits = Object.values(sum.units)
    const totalDealt = allUnits.reduce((s, u) => s + u.dealt, 0)
    const totalTaken = allUnits.reduce((s, u) => s + u.taken, 0)
    const totalHealed = allUnits.reduce((s, u) => s + u.healed, 0)
    expect(totalDealt).toBeGreaterThan(0)
    expect(totalTaken).toBeGreaterThan(0)
    expect(totalHealed).toBeGreaterThanOrEqual(0)

    // 4. L4 判定自洽：暴击是命中的子集，暴击率在合法区间
    expect(sum.judgment.hits).toBeGreaterThan(0)
    expect(sum.judgment.crits).toBeLessThanOrEqual(sum.judgment.hits)
    expect(sum.judgment.critRate).toBeGreaterThanOrEqual(0)
    expect(sum.judgment.critRate).toBeLessThanOrEqual(100)
    expect(sum.judgment.attacks).toBeGreaterThan(0)

    // 5. HP 模拟合理：所有单位 hpEnd 在 [0, hpMax]，存活单位恒 > 0
    //    NOTE: 存活单位 > 0 依赖"伤害事件 final 为实际扣血"，护盾/过量为其契约近似——
    //          若该角色组合含护盾导致失真，此断言会红，届时需显式排除护盾单位。
    for (const u of allUnits) {
      expect(u.hpEnd).toBeGreaterThanOrEqual(0)
      expect(u.hpEnd).toBeLessThanOrEqual(u.hpMax)
      if (u.alive) expect(u.hpEnd).toBeGreaterThan(0)
    }

    // 6. L2 阵营：存活数不超总数，双方阵营均存在
    expect(sum.teams.length).toBeGreaterThanOrEqual(2)
    for (const t of sum.teams) {
      expect(t.survivors).toBeGreaterThanOrEqual(0)
      expect(t.survivors).toBeLessThanOrEqual(t.total)
    }

    // 7. L1 胜方：战斗结束必有胜负，且为真实阵营 side
    expect(sum.winner).toBeDefined()
    expect(['ally', 'enemy']).toContain(sum.winner)

    // 8. 输出/承伤对账：无来源伤害（dot/反伤）只进承伤 → 承伤 ≥ 输出
    expect(totalTaken).toBeGreaterThanOrEqual(totalDealt)

    // 9. L5 技能表：至少一个技能有伤害
    expect(sum.skills.some((s) => s.damage > 0)).toBe(true)

    // 10. L7 关键事件：回合号合法（非负）
    for (const ev of sum.keyEvents) {
      expect(ev.turn).toBeGreaterThanOrEqual(0)
    }
  })

  it('2v2 真实战斗 → 战报在 2v2 下同样自洽', async () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire', 'guardian_gold'],
      ['guardian_fire', 'guardian_gold'],
    )
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    const battleId = battleSystem.getBattleData()!.battleId

    let rounds = 0
    while (battleSystem.getBattleStatus() === BattleStatus.ACTIVE && rounds < 50) {
      await battleSystem.processTurn()
      rounds++
    }
    if (battleSystem.getBattleStatus() === BattleStatus.ACTIVE) {
      await battleSystem.endBattle(ParticipantSide.ALLY)
    }

    const rec = battleSystem.getBattleRecording(battleId)!
    const archive = fromRecordedBattle(rec)!
    const sum = summarizeBattle(archive)

    // 覆盖全部 4 名参战者
    for (const p of [...allies, ...enemies]) {
      expect(sum.units[p.id]).toBeDefined()
    }
    // 阵营表覆盖双方
    const sides = sum.teams.map((t) => t.side)
    expect(sides).toContain('ally')
    expect(sides).toContain('enemy')
    // 判定自洽
    expect(sum.judgment.crits).toBeLessThanOrEqual(sum.judgment.hits)
    // HP 合理
    for (const u of Object.values(sum.units)) {
      expect(u.hpEnd).toBeGreaterThanOrEqual(0)
      expect(u.hpEnd).toBeLessThanOrEqual(u.hpMax)
    }
    expect(['ally', 'enemy']).toContain(sum.winner)
  })
})
