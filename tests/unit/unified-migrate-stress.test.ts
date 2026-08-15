/**
 * 文件: unified-migrate-stress.test.ts
 * 功能: 压测存档合成器 / 校验器 / 分支对比 / 录制映射自检测试
 */
import { describe, it, expect } from 'vitest'
import { createStressArchive } from '@/domain/battle/replay/unified/stress-archive'
import { validateUnified, type ValidationResult } from '@/domain/battle/replay/unified/unified-validator'
import { buildArchiveIndices } from '@/domain/battle/replay/unified/unified-indices'
import { deriveDebugTree, allNodesFlat } from '@/domain/battle/replay/unified/unified-debug-tree'
import { createDemoArchive } from '@/domain/battle/replay/unified/demo-archive'
import { diffArchives, createRateVariant, createRollVariant, diffSummary } from '@/domain/battle/replay/unified/unified-diff'
import { fromRecordedBattle } from '@/application/service/UnifiedArchiveService'

describe('createStressArchive', () => {
  it('生成指定事件数且结构合法', () => {
    const arch = createStressArchive(2000, 0x1234)
    expect(arch.events).toHaveLength(2000)
    expect(arch.events[0].phase).toBe('battle_lifecycle')
    const v = validateUnified(arch)
    expect(v.errors).toEqual([])
    expect(v.stats.checks).toBeGreaterThan(500)
    expect(arch.events[arch.events.length - 1].payload.action).toBe('battle_end')
  })

  it('确定性：同种子两次生成事件 id 一致', () => {
    const a = createStressArchive(500, 42)
    const b = createStressArchive(500, 42)
    expect(a.events.map((e) => e.id)).toEqual(b.events.map((e) => e.id))
  })

  it('索引与调试树在千级事件下可用', () => {
    const arch = createStressArchive(2000)
    const idx = buildArchiveIndices(arch)
    const pname = (id: string): string => id
    const entries = deriveDebugTree(idx.evs, idx.byId, pname)
    const flat = allNodesFlat(entries)
    expect(flat.length).toBeGreaterThan(100)
    // 所有事件归属到节点
    const covered = new Set(flat.flatMap((n) => n.events.map((e) => e.id)))
    for (const e of idx.evs) expect(covered.has(e.id)).toBe(true)
  })
})

describe('validateUnified 自包含（Worker 注入前提）', () => {
  it('toString 后经 new Function 独立执行，无模块级标识符依赖', () => {
    const src = validateUnified.toString()
    const fn = new Function(
      'log',
      `return (${src})(log, ["ai_decision","attribute_recalc","config_load"])`,
    ) as (log: unknown) => ValidationResult
    const v = fn(createDemoArchive())
    expect(v.errors).toEqual([])
    expect(v.stats.events).toBe(20)
  })
})

describe('diffArchives（分支对比）', () => {
  it('改写单个随机判定阈值 → 仅该行变化且字段级标注', () => {
    const base = createDemoArchive()
    // ev05 第 2 个判定（crit，rate 0.25）阈值改为 0.30
    const branch = createRateVariant(base, 'ev05', 1, 0.3)
    const rows = diffArchives(base, branch)

    expect(rows).toHaveLength(base.events.length)
    const changed = rows.filter((r) => r.changed)
    expect(changed).toHaveLength(1)
    expect(changed[0].eventId).toBe('ev05')
    expect(changed[0].fields.some((f) => f.kind === 'roll' && f.before === '阈值 0.25 / 随机 0.12' && f.after === '阈值 0.3 / 随机 0.12')).toBe(true)

    const stats = diffSummary(rows)
    expect(stats.changed).toBe(1)
    expect(stats.total).toBe(20)
  })

  it('新增/删除事件侧标记 base-only / branch-only', () => {
    const base = createDemoArchive()
    const branch = createDemoArchive()
    branch.events.push({
      id: 'ev_extra', phase: 'config_load', correlationId: 'corr_extra', timestamp: 99999,
      level: 'debug', payload: {}, summary: '额外事件',
    })
    const rows = diffArchives(base, branch)
    const extra = rows.filter((r) => r.side === 'branch-only')
    expect(extra).toHaveLength(1)
    expect(extra[0].eventId).toBe('ev_extra')
  })

  it('createRollVariant：改写判定 roll 生成分支，diff 标注随机值变化', () => {
    const base = createDemoArchive()
    // ev05 第 1 个判定（hit，roll 0.642）改为 0.9
    const branch = createRollVariant(base, 'ev05', 0, 0.9)
    const rows = diffArchives(base, branch)

    const changed = rows.filter((r) => r.changed)
    expect(changed).toHaveLength(1)
    expect(changed[0].eventId).toBe('ev05')
    expect(changed[0].fields.some((f) => f.kind === 'roll' && f.before === '阈值 0.875 / 随机 0.642' && f.after === '阈值 0.875 / 随机 0.9')).toBe(true)
    // 原存档不被污染
    const baseRolls = (base.events.find((e) => e.id === 'ev05')!.payload as { rolls: Array<{ roll: number }> }).rolls
    expect(baseRolls[0].roll).toBe(0.642)
  })
})

describe('fromRecordedBattle（录制映射）', () => {
  it('缺根事件时合成 battle_start/end，时基归零', () => {
    const rec = {
      battleId: 'bt-1',
      replayId: 'rp-1',
      version: '1.0.0',
      randomSeed: '77',
      startTime: 1000,
      winner: 'ally',
      initialState: {
        participants: [
          { id: 'u1', name: 'A', team: 'ally', maxHealth: 100, currentHealth: 100, maxEnergy: 50, currentEnergy: 50 },
        ],
      },
      events: [],
      rounds: [],
      combatRecords: [],
      traceEvents: [
        { id: 't1', phase: 'action_execution', correlationId: 'c1', timestamp: 5000, level: 'info', payload: {}, summary: '行动' },
      ],
    } as unknown as Parameters<typeof fromRecordedBattle>[0]
    const arch = fromRecordedBattle(rec)
    expect(arch).not.toBeNull()
    expect(arch!.events[0].phase).toBe('battle_lifecycle')
    expect(arch!.events[0].timestamp).toBe(0)
    // 时基归零后原事件从 0 开始
    expect(arch!.events[1].timestamp).toBe(0)
    expect(arch!.events[arch!.events.length - 1].payload.action).toBe('battle_end')
    expect(validateUnified(arch!).errors).toEqual([])
  })

  it('真实 TraceDamageLogger 字段归一化：final→result、crit→rolls、DamageStep→CalcStep、HP 快照', () => {
    const rec = {
      battleId: 'bt-real',
      replayId: 'rp-1',
      version: '2.0.0',
      randomSeed: '88',
      startTime: 0,
      initialState: {
        participants: [
          { id: 'u1', name: '剑士', team: 'ally', maxHealth: 3200, currentHealth: 3200, maxEnergy: 100, currentEnergy: 100 },
          { id: 'u2', name: '骷髅', team: 'enemy', maxHealth: 1500, currentHealth: 1500, maxEnergy: 100, currentEnergy: 60 },
        ],
      },
      events: [],
      rounds: [],
      combatRecords: [],
      traceEvents: [
        {
          id: 't1', phase: 'action_execution', correlationId: 'c1', timestamp: 100, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { skillName: '斩击', controlMode: 'player' }, summary: '剑士 攻击',
        },
        {
          id: 't2', phase: 'damage_calculation', correlationId: 'c1', parentId: 't1', timestamp: 200, level: 'debug', sourceId: 'u1', targetId: 'u2',
          payload: {
            final: 420,
            crit: { rate: 0.25, multiplier: 1.5, triggered: true },
            steps: [
              { stepName: '技能基础值', value: 200, description: '基础', before: 0, after: 200, sourceType: 'base' },
              { stepName: '攻击力', value: 420, description: '加成', before: 200, after: 420, sourceType: 'system' },
            ],
          },
          summary: '伤害计算 剑士→骷髅 最终伤害 420 ★暴击',
        },
      ],
    } as unknown as Parameters<typeof fromRecordedBattle>[0]

    const arch = fromRecordedBattle(rec)!
    expect(arch.events[1].id).toBe('t1')
    const dmg = arch.events[2]
    expect(dmg.payload.result).toBe(420)
    const rolls = dmg.payload.rolls as Array<{ kind: string; rate: number; derived?: boolean }>
    expect(rolls[0]).toMatchObject({ kind: 'crit', rate: 0.25, derived: true })
    const steps = dmg.payload.steps as Array<{ n: string; op: string; v: number }>
    expect(steps[0]).toEqual({ n: '技能基础值', op: '', v: 200, src: 'base' })
    expect(steps[1]).toEqual({ n: '攻击力', op: '+', v: 220, src: 'system' })
    // HP 快照：1500 - 420 = 1080
    expect(dmg.snapshot?.participants[0]).toEqual({ id: 'u2', hp: 1080 })
    expect(validateUnified(arch).errors).toEqual([])
  })

  it('HP 累减 clamp：治疗不超过 maxHp（过量治疗），伤害不低于 0', () => {
    // 问题 4：录制路径 HP 累减此前未 clamp 上限，治疗会突破 maxHp（回放气血虚高）
    const rec = {
      battleId: 'bt-clamp',
      replayId: 'rp-1',
      version: '2.0.0',
      randomSeed: '1',
      startTime: 0,
      initialState: {
        participants: [
          { id: 'u1', name: '医者', team: 'ally', maxHealth: 100, currentHealth: 60, maxEnergy: 100, currentEnergy: 50 },
        ],
      },
      events: [],
      rounds: [],
      combatRecords: [],
      traceEvents: [
        {
          id: 'h1', phase: 'heal_calculation', correlationId: 'c1', timestamp: 100, level: 'debug', sourceId: 'u1', targetId: 'u1',
          payload: { final: 999 }, summary: '治疗 999',
        },
        {
          id: 'd1', phase: 'damage_calculation', correlationId: 'c2', timestamp: 200, level: 'debug', sourceId: 'u1', targetId: 'u1',
          payload: { final: 50 }, summary: '受伤 50',
        },
      ],
    } as unknown as Parameters<typeof fromRecordedBattle>[0]

    const arch = fromRecordedBattle(rec)!
    const heal = arch.events[1]
    const dmg = arch.events[2]
    // 治疗 999 被 clamp 到 maxHp=100，而非 60+999=1059
    expect(heal.snapshot?.participants[0]).toEqual({ id: 'u1', hp: 100 })
    // 后续伤害从 clamp 后的 100 起算：100 - 50 = 50
    expect(dmg.snapshot?.participants[0]).toEqual({ id: 'u1', hp: 50 })
    expect(validateUnified(arch).errors).toEqual([])
  })

  it('HP 快照优先实际扣血 actual（L3：护盾吸收后 final≠actual，回放气血与实况一致）', () => {
    // TraceDamageLogger 现携带 actual（record.damage，护盾吸收后的真实扣血）。
    // final=420 但 actual=180（240 被护盾吸收）→ 快照按 actual 扣血：1500-180=1320
    const rec = {
      battleId: 'bt-shield',
      replayId: 'rp-shield',
      version: '2.0.0',
      randomSeed: '9',
      startTime: 0,
      initialState: {
        participants: [
          { id: 'u1', name: '剑士', team: 'ally', maxHealth: 3200, currentHealth: 3200, maxEnergy: 100, currentEnergy: 100 },
          { id: 'u2', name: '骷髅', team: 'enemy', maxHealth: 1500, currentHealth: 1500, maxEnergy: 100, currentEnergy: 60 },
        ],
      },
      events: [],
      rounds: [],
      combatRecords: [],
      traceEvents: [
        {
          id: 's1', phase: 'damage_calculation', correlationId: 'c1', timestamp: 100, level: 'debug', sourceId: 'u1', targetId: 'u2',
          payload: { final: 420, actual: 180 }, summary: '伤害计算 剑士→骷髅 最终伤害 420（护盾吸收 240）',
        },
      ],
    } as unknown as Parameters<typeof fromRecordedBattle>[0]

    const arch = fromRecordedBattle(rec)!
    const dmg = arch.events[1]
    // actual 优先：1500 - 180 = 1320（而非 final 的 1080）
    expect(dmg.snapshot?.participants[0]).toEqual({ id: 'u2', hp: 1320 })
    expect(dmg.payload.actual).toBe(180)
    expect(validateUnified(arch).errors).toEqual([])
  })

  it('DamageStep 累计值语义：value 是每步后绝对值，转增量链后累计终值 == result', () => {
    // 真实 TraceDamageLogger 的 DamageStep.value = after（每一步之后的累计伤害），
    // 不是单步增量。若把 value 当增量直转，防御会显示成 +50 且累计 170 ≠ 最终 50（用户报障）。
    // 断言：转换后的 CalcStep 为增量链（+0 → +60 → −10），累计终值与 result 一致，防御 op 为 −。
    const rec = {
      battleId: 'bt-acc',
      replayId: 'rp-acc',
      version: '2.0.0',
      randomSeed: '7',
      startTime: 0,
      initialState: {
        participants: [
          { id: 'u1', name: '佛门叛徒首领', team: 'ally', maxHealth: 3200, currentHealth: 3200, maxEnergy: 100, currentEnergy: 100 },
          { id: 'u2', name: '熔岩小精', team: 'enemy', maxHealth: 1500, currentHealth: 1500, maxEnergy: 100, currentEnergy: 60 },
        ],
      },
      events: [],
      rounds: [],
      combatRecords: [],
      traceEvents: [
        {
          id: 'a1', phase: 'action_execution', correlationId: 'c1', timestamp: 100, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { actionType: 'attack', controlMode: 'AI' }, summary: 'x',
        },
        {
          id: 'a2', phase: 'damage_calculation', correlationId: 'c1', parentId: 'a1', timestamp: 200, level: 'debug', sourceId: 'u1', targetId: 'u2',
          payload: {
            final: 50,
            crit: { rate: 0.25, multiplier: 1.5, triggered: true },
            steps: [
              { stepName: 'base', value: 0, description: '基础威力: 0', before: 0, after: 0, sourceType: 'base' },
              { stepName: 'extra', value: 60.830000000000005, description: '攻击力 额外加成: +60.83 → 60.83', before: 0, after: 60.83, sourceType: 'skill' },
              { stepName: 'preCrit', value: 60.83, description: '加成后伤害: 60.83', before: 0, after: 60.83, sourceType: 'skill' },
              { stepName: 'defense', value: 50, description: '防御减免(-10.83): 60.83 → 50', before: 60.83, after: 50, sourceType: 'system' },
            ],
          },
          summary: '伤害计算 佛门叛徒首领→熔岩小精 最终伤害 50 ★暴击',
        },
      ],
    } as unknown as Parameters<typeof fromRecordedBattle>[0]

    const arch = fromRecordedBattle(rec)!
    const dmg = arch.events.find((e) => e.id === 'a2')!
    const steps = dmg.payload.steps as Array<{ n: string; op: string; v: number }>
    expect(steps).toEqual([
      { n: 'base', op: '', v: 0, src: 'base' },
      { n: 'extra', op: '+', v: 60.83, src: 'skill' },
      { n: 'preCrit', op: '+', v: 0, src: 'skill' },
      { n: 'defense', op: '−', v: 10.83, src: 'system' },
    ])
    // 累计终值 = 最终伤害（Inspector resultMismatch 判定 ≤1）——尾差不得累计进链条
    const running = steps.reduce((acc, s) => (s.op === '−' ? acc - s.v : acc + s.v), 0)
    expect(running).toBeCloseTo(dmg.payload.result, 2)
  })

  it('真实链路百分比暴击率（rate=25）归一化后 roll 不越界', () => {
    // TraceDamageLogger 发射 crit.rate = breakdown.critRate（百分比，如 25=25%），
    // normalize 应归一化为 0~1 后再回推 roll，否则 roll > 1 触发"随机值越界"
    const rec = {
      battleId: 'bt-pct',
      replayId: 'rp-pct',
      version: '2.0.0',
      randomSeed: '99',
      startTime: 0,
      initialState: {
        participants: [
          { id: 'u1', name: '剑士', team: 'ally', maxHealth: 3200, currentHealth: 3200, maxEnergy: 100, currentEnergy: 100 },
          { id: 'u2', name: '骷髅', team: 'enemy', maxHealth: 1500, currentHealth: 1500, maxEnergy: 100, currentEnergy: 60 },
        ],
      },
      events: [],
      rounds: [],
      combatRecords: [],
      traceEvents: [
        {
          id: 't2', phase: 'damage_calculation', correlationId: 'c1', timestamp: 10, level: 'debug', sourceId: 'u1', targetId: 'u2',
          payload: { final: 420, crit: { rate: 25, multiplier: 1.5, triggered: true } },
          summary: '伤害计算 ★暴击',
        },
      ],
    } as unknown as Parameters<typeof fromRecordedBattle>[0]

    const arch = fromRecordedBattle(rec)!
    const dmg = arch.events.find((e) => e.id === 't2')!
    const rolls = dmg.payload.rolls as Array<{ kind: string; rate: number; roll: number; derived?: boolean }>
    expect(rolls[0].rate).toBe(0.25)
    expect(rolls[0].roll).toBeGreaterThanOrEqual(0)
    expect(rolls[0].roll).toBeLessThanOrEqual(0.999)
    expect(validateUnified(arch).errors).toEqual([])
  })
})
