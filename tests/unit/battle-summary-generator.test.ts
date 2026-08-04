/**
 * BattleSummaryGenerator 战报敌我前缀契约测试
 *
 * 覆盖本次统一：战报时间线 / 最高单次记录 / 参与者列表的单位名
 * 带 [友方]/[敌方] 前缀（与战斗日志口径一致）；id 反查不到阵营时保持纯名不误标。
 */
import { describe, it, expect } from 'vitest'
import { BattleSummaryGenerator } from '@/domain/battle/logs/BattleSummaryGenerator'
import { createEmptyRecord } from '@/domain/battle/combat-record'
import { ActionTypes, ParticipantSide } from '@/domain/battle/type/types'

describe('BattleSummaryGenerator 战报敌我前缀', () => {
  it('时间线/最高记录/参与者列表带 [友方]/[敌方] 前缀', () => {
    const gen = BattleSummaryGenerator.instance
    gen.reset()
    gen.startBattle('b1', [
      { id: 'a1', team: ParticipantSide.ALLY, name: '剑客' },
      { id: 'e1', team: ParticipantSide.ENEMY, name: '史莱姆' },
    ])

    const attack = createEmptyRecord(
      'b1', 'a1', '剑客', ActionTypes.ATTACK, 'e1', '史莱姆', 1,
    )
    attack.damage = 30
    attack.message = '攻击'
    gen.onAction(attack)

    const heal = createEmptyRecord(
      'b1', 'e1', '史莱姆', ActionTypes.SKILL, 'a1', '剑客', 1,
    )
    heal.heal = 10
    heal.message = '治疗'
    gen.onAction(heal)

    const summary = gen.onBattleEnd(ParticipantSide.ALLY, [
      { id: 'a1', name: '剑客', team: ParticipantSide.ALLY, hpEnd: 100, hpMax: 100 },
      { id: 'e1', name: '史莱姆', team: ParticipantSide.ENEMY, hpEnd: 20, hpMax: 50 },
    ])

    expect(summary!.actionTimeline[0].actor).toBe('[友方]剑客')
    expect(summary!.actionTimeline[0].target).toBe('[敌方]史莱姆')
    expect(summary!.actionTimeline[1].actor).toBe('[敌方]史莱姆')
    expect(summary!.actionTimeline[1].target).toBe('[友方]剑客')
    expect(summary!.highestSingleDamage!.actor).toBe('[友方]剑客')
    expect(summary!.highestSingleHeal!.actor).toBe('[敌方]史莱姆')
    expect(summary!.participants[0].name).toBe('[友方]剑客')
    expect(summary!.participants[1].name).toBe('[敌方]史莱姆')
  })

  it('id 反查不到阵营时保持纯名（不误标）', () => {
    const gen = BattleSummaryGenerator.instance
    gen.reset()
    gen.startBattle('b1') // 无参与者 → 无阵营映射
    const r = createEmptyRecord(
      'b1', 'x1', '神秘人', ActionTypes.ATTACK, 'y1', '路人', 1,
    )
    r.damage = 5
    r.message = 'x'
    gen.onAction(r)
    const summary = gen.onBattleEnd(ParticipantSide.ALLY)
    expect(summary!.actionTimeline[0].actor).toBe('神秘人')
    expect(summary!.actionTimeline[0].target).toBe('路人')
  })
})
