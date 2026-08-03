/**
 * 文件: unified-migrate-stress.test.ts
 * 功能: 迁移器（v0.9 → v2.0.0）与压测存档合成器自检测试
 */
import { describe, it, expect } from 'vitest'
import { migrateUnifiedLog } from '@/domain/battle/replay/unified/unified-migrate'
import { createStressArchive } from '@/domain/battle/replay/unified/stress-archive'
import { validateUnified, type ValidationResult } from '@/domain/battle/replay/unified/unified-validator'
import { buildArchiveIndices } from '@/domain/battle/replay/unified/unified-indices'
import { deriveDebugTree, allNodesFlat } from '@/domain/battle/replay/unified/unified-debug-tree'
import { createDemoArchive } from '@/domain/battle/replay/unified/demo-archive'
import { diffArchives, createRateVariant, diffSummary } from '@/domain/battle/replay/unified/unified-diff'
import { fromRecordedBattle } from '@/application/service/UnifiedArchiveService'

/** v0.9 旧格式日志（file2 RAW_LOG 缩影） */
function legacyLog() {
  return {
    schema: '0.9',
    meta: { battleId: 'BT-9527', seed: 88237419, rng: 'xorshift32', engine: 'Aegis 2.4.1', recordedAt: '2026-07-31 08:14:22 UTC' },
    units: [
      { id: 'u1', name: '剑士 · 阿尔托莉雅', maxHp: 3200 },
      { id: 'u2', name: '骷髅战士', maxHp: 1500 },
    ],
    timeline: [
      {
        type: 'round', id: 'r1', name: '第 1 回合',
        children: [
          {
            type: 'action', id: 'r1_a1', name: '剑士',
            events: [
              {
                id: 'e1', type: 'crit', title: '多段攻击 · 誓约胜利之剑',
                calc: { base: 200, atk: 450, def: 150, crit: 1.5, final: 900 },
                rolls: [{ kind: 'hit', rate: 0.875, roll: 0.642 }, { kind: 'crit', rate: 0.25, roll: 0.12 }],
                hp: { target: 'u2', before: 1380, after: 480 },
                chain: [{ t: '受到攻击', d: '剑士 → 骷髅战士' }],
              },
              {
                id: 'e2', type: 'damage', title: '多段攻击 · 誓约胜利之剑',
                calc: { base: 200, atk: 450, def: 150, final: 420 },
                hp: { target: 'u2', before: 480, after: 60 },
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('migrateUnifiedLog（v0.9 → v2.0.0）', () => {
  it('迁移结构并保留富 payload', () => {
    const { archive, report } = migrateUnifiedLog(legacyLog())
    expect(archive).not.toBeNull()
    expect(report.errors).toEqual([])
    expect(report.from).toBe('0.9')
    expect(report.converted).toBe(2)

    const a = archive!
    expect(a.version).toBe('2.0.0')
    expect(a.events[0].phase).toBe('battle_lifecycle')
    expect(a.events[0].payload.action).toBe('battle_start')
    expect(a.events[a.events.length - 1].payload.action).toBe('battle_end')

    const ev1 = a.events.find((e) => e.id === 'e1')!
    expect(ev1.phase).toBe('damage_calculation')
    expect((ev1.payload.steps as Array<{ n: string }>)[2].n).toBe('防御减免')
    expect((ev1.payload.rolls as Array<{ kind: string }>)[1].kind).toBe('crit')
    expect(ev1.snapshot?.participants[0]).toEqual({ id: 'u2', hp: 480 })
    expect((ev1.payload.chain as Array<{ t: string }>)[0].t).toBe('受到攻击')
    // 同行动共享 correlationId
    const ev2 = a.events.find((e) => e.id === 'e2')!
    expect(ev2.correlationId).toBe(ev1.correlationId)
    expect(ev2.parentId).toBe('e1')
  })

  it('迁移结果通过结构校验', () => {
    const { archive } = migrateUnifiedLog(legacyLog())
    const v = validateUnified(archive!)
    expect(v.errors).toEqual([])
  })

  it('v2.0.0 原样返回；未知 schema 报错', () => {
    const ok = { version: '2.0.0', battleId: 'x', replayId: 'x', randomSeed: '1', startTime: 0, initialState: { participants: [] }, events: [] }
    const r1 = migrateUnifiedLog(ok)
    expect(r1.report.from).toBe('2.0.0')
    expect(r1.archive).toBe(ok)

    const r2 = migrateUnifiedLog({ version: '9.9' })
    expect(r2.report.errors.length).toBeGreaterThan(0)
    expect(r2.archive).toBeNull()
  })
})

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
    expect(changed[0].fields.some((f) => f.kind === 'roll' && f.before === '阈值 0.25' && f.after === '阈值 0.3')).toBe(true)

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
              { stepName: '技能基础值', value: 200, description: '基础', before: 200, after: 200, sourceType: 'base' },
              { stepName: '攻击力', value: 220, description: '加成', before: 200, after: 420, sourceType: 'system' },
            ],
          },
          summary: '伤害计算 剑士→骷髅 200→420 ★暴击',
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
    expect(steps[0]).toEqual({ n: '技能基础值', op: '+', v: 200, src: 'base' })
    expect(steps[1]).toEqual({ n: '攻击力', op: '+', v: 220, src: 'system' })
    // HP 快照：1500 - 420 = 1080
    expect(dmg.snapshot?.participants[0]).toEqual({ id: 'u2', hp: 1080 })
    expect(validateUnified(arch).errors).toEqual([])
  })
})
