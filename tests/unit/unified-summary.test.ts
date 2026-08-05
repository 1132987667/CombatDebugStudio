/**
 * 文件: unified-summary.test.ts
 * 功能: 战斗摘要统计（summarizeBattle）自检测试
 */
import { describe, it, expect } from 'vitest'
import { createDemoArchive } from '@/domain/battle/replay/unified/demo-archive'
import { summarizeBattle } from '@/domain/battle/replay/unified/unified-summary'

describe('summarizeBattle（战斗摘要统计）', () => {
  it('demo 存档指标正确', () => {
    const sum = summarizeBattle(createDemoArchive())
    expect(sum.rounds).toBe(2)
    expect(sum.winner).toBe('u1')
    expect(sum.durationMs).toBe(3600)

    const u1 = sum.units.u1
    const u2 = sum.units.u2

    // u1：ev04 行动 1 次；输出 = ev05 113 + ev07 58 + ev13 32 + ev18 306 = 509
    expect(u1.attacks).toBe(1)
    expect(u1.dealt).toBe(509)
    // 暴击：仅 ev05 带顶层 crit 标记（ev18 暴击只在 rolls 里，无顶层标志）= 1；击杀：ev18 = 1
    expect(u1.crits).toBe(1)
    expect(u1.kills).toBe(1)
    // 承伤：ev11 63
    expect(u1.taken).toBe(63)

    // u2：承伤 = dot 15 + 113 + 58 + 32 + 306 = 524（含无来源 dot，不计入任何单位输出）
    expect(u2.taken).toBe(524)
    expect(u2.attacks).toBe(1)
    expect(u2.dealt).toBe(63)
    // 闪避 ev06 = 1；抵抗 ev08 = 1；无成功施加
    expect(u2.dodges).toBe(1)
    expect(u2.resists).toBe(1)
    expect(u2.buffsApplied).toBe(0)
    expect(u1.buffsApplied).toBe(0)
  })

  it('无事件存档：全零 + 回合 0', () => {
    const log = createDemoArchive()
    log.events = []
    const sum = summarizeBattle(log)
    expect(sum.rounds).toBe(0)
    expect(sum.durationMs).toBe(0)
    expect(sum.units.u1.attacks).toBe(0)
    expect(sum.units.u1.dealt).toBe(0)
  })

  it('单位表预置全部参战单位（含无行动者）', () => {
    const log = createDemoArchive()
    const sum = summarizeBattle(log)
    expect(Object.keys(sum.units).sort()).toEqual(['u1', 'u2'])
  })

  it('七层战报：L1 胜负边际 / L2 阵营对比 / L4 判定 / L5 技能 / L7 关键事件', () => {
    const sum = summarizeBattle(createDemoArchive())

    // L1 胜负边际：胜方 ally（u1）存活 1，剩余血量 287/350
    expect(sum.survivorCount).toBe(1)
    expect(sum.survivorHpPct).toBe(82)

    // L2 阵营对比
    const ally = sum.teams.find((t) => t.side === 'ally')!
    const enemy = sum.teams.find((t) => t.side === 'enemy')!
    expect(ally.dealt).toBe(509)
    expect(ally.kills).toBe(1)
    expect(enemy.dealt).toBe(63)
    expect(enemy.survivors).toBe(0)
    expect(enemy.hpEnd).toBe(0)
    expect(enemy.hpMax).toBe(500)

    // L4 判定健康度：攻击 2（ev04/ev10）、命中 5（dot ev03 不计）、暴击 1（ev05 顶层标记）、闪避 1、抵抗 1
    expect(sum.judgment.attacks).toBe(2)
    expect(sum.judgment.hits).toBe(5)
    expect(sum.judgment.crits).toBe(1)
    expect(sum.judgment.critRate).toBe(20)
    expect(sum.judgment.dodges).toBe(1)
    expect(sum.judgment.resists).toBe(1)

    // L5 技能（demo 无 skillName → 归"未标记技能"；5 次伤害计算，dot 不计）
    expect(sum.skills.length).toBe(1)
    expect(sum.skills[0].skillName).toBe('未标记技能')
    expect(sum.skills[0].uses).toBe(5)
    expect(sum.skills[0].damage).toBe(572)

    // L7 关键事件：首杀与击杀（ev18）
    const first = sum.keyEvents.find((e) => e.kind === 'first_blood')
    const kill = sum.keyEvents.find((e) => e.kind === 'kill')
    expect(first?.kind).toBe('first_blood')
    expect(kill?.text).toContain('火护法')

    // 存活标记：u2 被击杀，u1 存活
    expect(sum.units.u2.alive).toBe(false)
    expect(sum.units.u1.alive).toBe(true)
  })
})
