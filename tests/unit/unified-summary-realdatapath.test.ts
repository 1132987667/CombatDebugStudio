/**
 * 文件: unified-summary-realdatapath.test.ts
 * 功能: 真实录制路径战报统计回归测试
 * 描述: 通过 fromRecordedBattle（模拟 TraceDamageLogger / BattleSystem 的真实事件形态）→
 *       summarizeBattle 验证对抗评审修复：
 *       - crit 对象（{ rate, triggered }）不被误判为暴击（修复 A）
 *       - lethalMark 击杀事件不双算伤害/命中（修复 B）
 *       - dot 不计入命中/暴击率分母（修复 E）
 */
import { describe, it, expect } from 'vitest'
import type { RecordedBattle } from '@/domain/battle/service/BattleRecorder'
import { TracePhase, TraceLevel, type TraceEvent } from '@/shared/types/trace-event'
import type { UnifiedArchive } from '@/domain/battle/replay/unified/unified-archive'
import { fromRecordedBattle } from '@/application/service/UnifiedArchiveService'
import { summarizeBattle } from '@/domain/battle/replay/unified/unified-summary'
import { ParticipantSide } from '@/domain/battle/type/types'

function ev(p: Partial<TraceEvent> & { phase: TracePhase; payload: Record<string, unknown>; summary: string; timestamp: number }): TraceEvent {
  return {
    id: `evt_${p.timestamp}`,
    correlationId: 'corr_test',
    level: TraceLevel.INFO,
    ...p,
  }
}

function buildRecording(): RecordedBattle {
  return {
    battleId: 'bt_test',
    replayId: 'rp_test',
    version: '2.0.0',
    randomSeed: 'seed',
    startTime: 0,
    events: [],
    rounds: [],
    combatRecords: [],
    initialState: {
      participants: [
        { id: 'a1', name: '剑客', team: ParticipantSide.ALLY, maxHealth: 100, currentHealth: 100, maxEnergy: 100, currentEnergy: 100 },
        { id: 'e1', name: '史莱姆', team: ParticipantSide.ENEMY, maxHealth: 100, currentHealth: 100, maxEnergy: 100, currentEnergy: 100 },
      ],
    },
    traceEvents: [
      ev({ timestamp: 100, phase: TracePhase.ACTION_EXECUTION, sourceId: 'a1', payload: {}, summary: 'a1 行动' }),
      ev({
        timestamp: 200, phase: TracePhase.DAMAGE_CALCULATION, sourceId: 'a1', targetId: 'e1',
        payload: { result: 10, skillName: '技能A', crit: { rate: 0.3, triggered: false } },
        summary: '10 伤害',
      }),
      ev({
        timestamp: 300, phase: TracePhase.DAMAGE_CALCULATION, sourceId: 'a1', targetId: 'e1',
        payload: { result: 10, skillName: '技能B', crit: { rate: 0.3, triggered: true } },
        summary: '10 暴击',
      }),
      ev({
        timestamp: 400, phase: TracePhase.DAMAGE_CALCULATION, sourceId: 'e1', targetId: 'a1',
        payload: { result: 0, dodge: true },
        summary: 'a1 被闪避',
      }),
      ev({
        timestamp: 500, phase: TracePhase.DAMAGE_CALCULATION, targetId: 'e1',
        payload: { result: 5, dot: true, crit: { rate: 0, triggered: true } },
        summary: 'e1 中毒 5（dot 暴击不计入战报暴击）',
      }),
      ev({
        timestamp: 600, phase: TracePhase.DAMAGE_CALCULATION, sourceId: 'a1', targetId: 'e1',
        payload: { result: 20, skillName: '技能A', crit: { rate: 0.3, triggered: false } },
        summary: '20 伤害',
      }),
      ev({
        timestamp: 700, phase: TracePhase.DAMAGE_CALCULATION, sourceId: 'a1', targetId: 'e1',
        payload: { result: 55, skillName: '技能A', crit: { rate: 0.3, triggered: false } },
        summary: '55 伤害（致死）',
      }),
      // 最终死亡确认：lethalMark 事件 result=0，仅作击杀标记
      ev({
        timestamp: 800, phase: TracePhase.DAMAGE_CALCULATION, sourceId: 'a1', targetId: 'e1',
        payload: { result: 0, death: true, lethalMark: true },
        summary: 'a1 击败 e1',
      }),
      // Buff 施加（真实形态：BuffTraceLogger.onApply 发大写 BuffAction.APPLY，targetId=被施加者）
      ev({
        timestamp: 850, phase: TracePhase.BUFF_LIFECYCLE, targetId: 'e1',
        payload: { buffName: '破甲打击', action: 'APPLY', stacks: 1, duration: 2 },
        summary: '施加 【破甲打击】',
      }),
    ],
    winner: ParticipantSide.ALLY,
  }
}

describe('真实录制路径战报统计（对抗评审修复回归）', () => {
  const archive = fromRecordedBattle(buildRecording())!
  const sum = summarizeBattle(archive)

  it('crit 对象 triggered=false 不误判暴击，triggered=true 计暴击', () => {
    expect(sum.judgment.crits).toBe(1)
    expect(sum.units.a1.crits).toBe(1)
  })

  it('lethalMark 击杀事件不双算伤害/命中', () => {
    // 输出 = 10+10+20+55 = 95（lethalMark 的 result=0 不再计入）
    expect(sum.units.a1.dealt).toBe(95)
    // 承伤 = 10+10+5+20+55 = 100（dot 计入承伤，lethalMark 不计）
    expect(sum.units.e1.taken).toBe(100)
    // 命中 = 4 次伤害计算（ev200/300/600/700；dodge、dot、lethalMark 不计）
    expect(sum.judgment.hits).toBe(4)
    expect(sum.judgment.attacks).toBe(1)
  })

  it('dot 不计入命中与暴击率分母', () => {
    // 命中 4：技能A×3 + 技能B×1；dot(ev500) 不计
    expect(sum.judgment.hits).toBe(4)
    expect(sum.judgment.critRate).toBe(25)
  })

  it('dot 暴击不计入全局暴击数（非攻击判定，与命中分母同口径）', () => {
    // ev500 为 dot 且 crit.triggered=true：若计入则 crits=2/critRate=50%，实为 1/25%
    expect(sum.judgment.crits).toBe(1)
    expect(sum.judgment.critRate).toBe(25)
    // dot 无来源，不归属任何单位输出/暴击
    expect(sum.units.a1.crits).toBe(1)
  })

  it('击杀标记：kills/alive 正确且无重复', () => {
    expect(sum.units.a1.kills).toBe(1)
    expect(sum.units.e1.alive).toBe(false)
    expect(sum.keyEvents.filter((e) => e.kind === 'kill').length).toBe(1)
  })

  it('技能统计：lethalMark/dot 不计入使用次数', () => {
    const skA = sum.skills.find((s) => s.skillName === '技能A')!
    const skB = sum.skills.find((s) => s.skillName === '技能B')!
    expect(skA.uses).toBe(3)
    expect(skA.damage).toBe(85)
    expect(skA.pct).toBe(89)
    expect(skB.uses).toBe(1)
    expect(skB.damage).toBe(10)
    expect(skB.pct).toBe(11)
  })

  it('HP 模拟含 dot 扣血', () => {
    expect(sum.units.e1.hpEnd).toBe(0)
    expect(sum.units.a1.hpEnd).toBe(100)
  })

  it('buff_lifecycle 大写 APPLY（真实路径形态）被识别为成功施加', () => {
    // 修复前：summarizeBattle 只匹配小写 'apply'，真实录制 buffsApplied 恒为 0
    expect(sum.units.e1.buffsApplied).toBe(1)
    expect(sum.units.e1.resists).toBe(0)
    expect(sum.judgment.resists).toBe(0)
  })
})

/** 合成存档：覆盖复活 / 触发器伤害 / HOT 治疗 / 治疗技能名 四项战报口径 */
function buildReviveArchive(): UnifiedArchive {
  const ev = (e: { phase: string; correlationId: string; timestamp: number; sourceId?: string; targetId?: string; payload: Record<string, unknown>; summary: string }): UnifiedArchive['events'][number] => ({
    id: `evt_${e.timestamp}`,
    phase: e.phase as UnifiedArchive['events'][number]['phase'],
    correlationId: e.correlationId,
    timestamp: e.timestamp,
    level: TraceLevel.INFO,
    sourceId: e.sourceId,
    targetId: e.targetId,
    payload: e.payload,
    summary: e.summary,
  })
  return {
    battleId: 'bt_revive',
    replayId: 'rp_revive',
    version: '2.0.0',
    randomSeed: 'seed',
    startTime: 0,
    winner: 'ally',
    initialState: {
      participants: [
        { id: 'a1', name: '剑客', maxHp: 100, hp: 100, maxEnergy: 100, energy: 100, side: 'ally' },
        { id: 'e1', name: '史莱姆', maxHp: 100, hp: 100, maxEnergy: 100, energy: 100, side: 'enemy' },
      ],
    },
    events: [
      // 击杀：60 + 40 = 100，致死确认
      ev({ phase: 'damage_calculation', correlationId: 'c1', timestamp: 100, sourceId: 'a1', targetId: 'e1', payload: { result: 60, skillName: '重斩' }, summary: '60' }),
      ev({ phase: 'damage_calculation', correlationId: 'c1', timestamp: 150, sourceId: 'a1', targetId: 'e1', payload: { result: 40, skillName: '重斩' }, summary: '40' }),
      ev({ phase: 'damage_calculation', correlationId: 'c2', timestamp: 200, sourceId: 'a1', targetId: 'e1', payload: { result: 0, death: true, lethalMark: true }, summary: '击杀' }),
      // 复活：alive 恢复 + HP 40
      ev({ phase: 'battle_lifecycle', correlationId: 'c3', timestamp: 300, targetId: 'e1', payload: { action: 'revive', hp: 40 }, summary: '复活' }),
      // 触发器伤害（反伤）：无 sourceId、无 dot 标记
      ev({ phase: 'damage_calculation', correlationId: 'c4', timestamp: 400, targetId: 'e1', payload: { result: 10 }, summary: '反伤 10' }),
      // HOT 持续治疗
      ev({ phase: 'heal_calculation', correlationId: 'c5', timestamp: 500, targetId: 'e1', payload: { result: 5, hot: true }, summary: 'hot 5' }),
      // 技能治疗（带 skillName）
      ev({ phase: 'heal_calculation', correlationId: 'c6', timestamp: 600, sourceId: 'a1', targetId: 'e1', payload: { result: 20, skillName: '治疗术' }, summary: '治疗 20' }),
    ],
  }
}

describe('战报口径：复活 / 触发器伤害 / HOT / 治疗技能名', () => {
  const sum = summarizeBattle(buildReviveArchive())

  it('复活恢复存活标记与 HP（lethalMark 后 alive=false → revive 后 alive=true）', () => {
    const e1 = sum.units.e1
    expect(e1.alive).toBe(true)
    // HP 模拟：100 − 60 − 40 → 0（死亡 clamp）→ +40 → −10 → +5 → +20 = 55
    expect(e1.hpEnd).toBe(55)
  })

  it('触发器伤害（无 sourceId 非 dot）计入承伤，不计命中/技能/输出', () => {
    const e1 = sum.units.e1
    const a1 = sum.units.a1
    // 承伤 = 60 + 40 + 10（触发器）
    expect(e1.taken).toBe(110)
    // 输出仅归属 a1 的重斩
    expect(a1.dealt).toBe(100)
    expect(a1.hits).toBe(2)
    // 命中 = 仅 2 次有来源攻击（lethalMark / 触发器不计）
    expect(sum.judgment.hits).toBe(2)
    const zhan = sum.skills.find((s) => s.skillName === '重斩')!
    expect(zhan.uses).toBe(2)
    expect(zhan.damage).toBe(100)
  })

  it('HOT 持续治疗不计入技能表，只恢复 HP', () => {
    expect(sum.units.e1.healed).toBe(0) // HOT 无来源，治疗量不入任何单位
    const unnamed = sum.skills.find((s) => s.skillName === '未标记技能')
    expect(unnamed).toBeUndefined()
  })

  it('治疗技能带 skillName 正确分组', () => {
    const heal = sum.skills.find((s) => s.skillName === '治疗术')!
    expect(heal.uses).toBe(1)
    expect(heal.heal).toBe(20)
    expect(sum.units.a1.healed).toBe(20)
  })

  it('击杀保留、复活后首杀事件不变', () => {
    expect(sum.units.a1.kills).toBe(1)
    expect(sum.keyEvents.filter((e) => e.kind === 'kill').length).toBe(1)
  })
})

/**
 * 复活 hp 语义契约：发射端（BattleExecutor）发的是复活后绝对血量（revived.currentHealth），
 * 统计层必须按"绝对值设置"恢复 HP，而非增量加法。正常流程"复活前必死亡→HP 模拟已 clamp 0"
 * 两者数值等价，但异常/未来数据（死亡后残留治疗）会分叉——此场景用于锁定绝对值语义。
 */
function buildReviveAfterHealArchive(): UnifiedArchive {
  const ev = (e: { phase: string; correlationId: string; timestamp: number; sourceId?: string; targetId?: string; payload: Record<string, unknown>; summary: string }): UnifiedArchive['events'][number] => ({
    id: `evt_${e.timestamp}`,
    phase: e.phase as UnifiedArchive['events'][number]['phase'],
    correlationId: e.correlationId,
    timestamp: e.timestamp,
    level: TraceLevel.INFO,
    sourceId: e.sourceId,
    targetId: e.targetId,
    payload: e.payload,
    summary: e.summary,
  })
  return {
    battleId: 'bt_revive_heal',
    replayId: 'rp_revive_heal',
    version: '2.0.0',
    randomSeed: 'seed',
    startTime: 0,
    winner: 'ally',
    initialState: {
      participants: [
        { id: 'a1', name: '剑客', maxHp: 100, hp: 100, maxEnergy: 100, energy: 100, side: 'ally' },
        { id: 'e1', name: '史莱姆', maxHp: 100, hp: 100, maxEnergy: 100, energy: 100, side: 'enemy' },
      ],
    },
    events: [
      ev({ phase: 'damage_calculation', correlationId: 'c1', timestamp: 100, sourceId: 'a1', targetId: 'e1', payload: { result: 60, skillName: '重斩' }, summary: '60' }),
      ev({ phase: 'damage_calculation', correlationId: 'c1', timestamp: 150, sourceId: 'a1', targetId: 'e1', payload: { result: 40, skillName: '重斩' }, summary: '40' }),
      ev({ phase: 'damage_calculation', correlationId: 'c2', timestamp: 200, sourceId: 'a1', targetId: 'e1', payload: { result: 0, death: true, lethalMark: true }, summary: '击杀' }),
      // 异常/未来数据：死亡后 HP 模拟残留治疗（正常引擎不会发生，用于锁定复活绝对值语义）
      ev({ phase: 'heal_calculation', correlationId: 'c3', timestamp: 250, targetId: 'e1', payload: { result: 50, hot: true }, summary: 'hot 50' }),
      // 复活：payload.hp = 复活后绝对血量 40
      ev({ phase: 'battle_lifecycle', correlationId: 'c4', timestamp: 300, targetId: 'e1', payload: { action: 'revive', hp: 40 }, summary: '复活' }),
    ],
  }
}

describe('复活 hp 语义：绝对值而非增量加法', () => {
  it('复活前 HP 模拟残留治疗时，复活仍按 payload.hp 绝对值恢复', () => {
    const sum = summarizeBattle(buildReviveAfterHealArchive())
    const e1 = sum.units.e1
    // 加法语义（旧实现）会得 50 + 40 = 90；绝对值语义应为 40
    expect(e1.hpEnd).toBe(40)
    expect(e1.alive).toBe(true)
  })
})
