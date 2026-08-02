import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { createAllyParticipant } from '@tests/factories/ParticipantFactory'
import { ModifierStack } from '@/domain/buff/ModifierStack'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import {
  TracePhase,
  TraceLevel,
  type TraceEvent,
  type TraceScope,
} from '@/shared/types/trace-event'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'

/**
 * ATTRIBUTE_RECALC 事件取证测试（文档 §5 示例 4）
 * 验证：entityId / triggeredBy / before-after 完整 CalculationBreakdown；
 *      且只记录值实际变化的属性（幂等重算是噪音，不产生事件）。
 */
describe('ATTRIBUTE_RECALC trace（文档 §5 示例 4）', () => {
  let events: TraceEvent[]

  beforeEach(() => {
    events = []
    const port: IDebugTracePort = {
      emit: (e) => { events.push(e); return e.id },
      isEnabled: () => true,
      beginScope: () => ({ correlationId: 'x', phase: TracePhase.ACTION_EXECUTION, child: () => ({}) } as TraceScope),
    }
    BattleParticipantImpl.setTracePort(port)
  })

  afterEach(() => {
    BattleParticipantImpl.setTracePort(null)
  })

  /** 创建带攻击 +10% 修饰符的参与者，保证重算产生实际变化 */
  function participantWithAttackBuff(id: string): BattleParticipantImpl {
    const participant = createAllyParticipant({ id })
    const stack = new ModifierStack()
    participant.setModifierProvider({
      getModifierStack: () => stack,
      getSourceName: () => null,
      getSourceType: () => null,
    })
    stack.addModifier('buff_test', ATTRIBUTE_CODE.attack, 10, ModifierType.PERCENTAGE)
    return participant
  }

  it('emit 携带 entityId 与 triggeredBy（定位是哪个角色、什么触发）', () => {
    const participant = participantWithAttackBuff('hero_1')
    participant.recalcAll('buff_remove:test_buff')

    const evts = events.filter((e) => e.phase === TracePhase.ATTRIBUTE_RECALC)
    expect(evts.length).toBeGreaterThan(0)
    const evt = evts[0]
    expect(evt.level).toBe(TraceLevel.TRACE)
    expect(evt.payload.entityId).toBe('hero_1')
    expect(evt.payload.triggeredBy).toBe('buff_remove:test_buff')
  })

  it('before/after 携带完整 CalculationBreakdown（base/additive/percent/final）', () => {
    const participant = participantWithAttackBuff('hero_1')
    participant.recalcAll('formation')

    const evts = events.filter((e) => e.phase === TracePhase.ATTRIBUTE_RECALC)
    expect(evts.length).toBeGreaterThan(0)
    for (const evt of evts) {
      const before = evt.payload.before as Record<string, number>
      const after = evt.payload.after as Record<string, number>
      expect(before).toHaveProperty('base')
      expect(before).toHaveProperty('additive')
      expect(before).toHaveProperty('percent')
      expect(before).toHaveProperty('final')
      expect(after).toHaveProperty('base')
      expect(after).toHaveProperty('additive')
      expect(after).toHaveProperty('percent')
      expect(after).toHaveProperty('final')
      // percent 归一化：1.1（100% + 10%）
      expect(after.percent).toBeCloseTo(1.1, 5)
    }
  })

  it('未传触发源时 triggeredBy 为 undefined（兼容既有调用）', () => {
    const participant = participantWithAttackBuff('hero_1')
    participant.recalcAll()

    const evts = events.filter((e) => e.phase === TracePhase.ATTRIBUTE_RECALC)
    expect(evts[0].payload.triggeredBy).toBeUndefined()
  })

  it('二次重算后 before.percent 保持归一化（不因复用上次 breakdown 而双除）', () => {
    const participant = createAllyParticipant({ id: 'hero_1' })
    const stack = new ModifierStack()
    participant.setModifierProvider({
      getModifierStack: () => stack,
      getSourceName: () => null,
      getSourceType: () => null,
    })
    stack.addModifier('buff_a', ATTRIBUTE_CODE.attack, 10, ModifierType.PERCENTAGE)
    participant.recalcAll('first')
    stack.addModifier('buff_b', ATTRIBUTE_CODE.attack, 20, ModifierType.PERCENTAGE)
    participant.recalcAll('second')

    const evts = events.filter((e) => e.phase === TracePhase.ATTRIBUTE_RECALC)
    const second = evts[evts.length - 1]
    const before = second.payload.before as Record<string, number>
    const after = second.payload.after as Record<string, number>
    // percent 归一化存储：第一次 110% → 1.1；第二次 before 读上次 breakdown 应仍为 1.1
    // （双除 bug 会变成 0.011），after = 130% → 1.3
    expect(before.percent).toBeCloseTo(1.1, 5)
    expect(after.percent).toBeCloseTo(1.3, 5)
  })

  it('无修饰符变化的幂等重算不产生事件（消除高频噪音）', () => {
    const participant = createAllyParticipant({ id: 'hero_1' })
    participant.recalcAll('formation')
    participant.recalcAll('buff_remove:test_buff')

    const evts = events.filter((e) => e.phase === TracePhase.ATTRIBUTE_RECALC)
    expect(evts.length).toBe(0)
  })
})
