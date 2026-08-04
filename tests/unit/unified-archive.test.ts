/**
 * 文件: unified-archive.test.ts
 * 功能: 统一事件流存档（类型/校验/索引/调试树/模拟）自检测试
 * 描述: AGENTS.md「非琐碎逻辑必须留一个可运行的检查」——双工作台核心纯函数的最小可运行验证。
 */
import { describe, it, expect } from 'vitest'
import { createDemoArchive, DEMO_ARCHIVE } from '@/domain/battle/replay/unified/demo-archive'
import type { CalcStep } from '@/domain/battle/replay/unified/unified-archive'
import { validateUnified } from '@/domain/battle/replay/unified/unified-validator'
import { buildArchiveIndices } from '@/domain/battle/replay/unified/unified-indices'
import {
  deriveDebugTree,
  allNodesFlat,
  nodeOfEvent,
  buildSegResults,
} from '@/domain/battle/replay/unified/unified-debug-tree'
import {
  freshSim,
  advanceSimTo,
  applyEventToSim,
  currentTurnAt,
  lastEventAt,
  formatTime,
  cloneSimTable,
  buildSimCheckpoints,
  nearestCheckpoint,
} from '@/domain/battle/replay/unified/unified-sim'
import {
  accumulateSteps,
  describeSrc,
  normalizeOp,
} from '@/domain/battle/replay/unified/unified-steps'

const pname = (id: string): string => {
  const p = DEMO_ARCHIVE.initialState.participants.find((x) => x.id === id)
  return p ? p.name : id
}

describe('validateUnified（演示存档应通过全部结构校验）', () => {
  it('无错误、无警告，统计正确', () => {
    const log = createDemoArchive()
    const v = validateUnified(log)
    expect(v.errors).toEqual([])
    // 演示存档含 3 个调试专属事件 → 按分类表产生一条警告（回放投影默认隐藏）
    expect(v.warnings).toEqual([
      '3 个调试专属事件（ai_decision/attribute_recalc/config_load）— 回放投影默认隐藏，调试投影始终可见（按分类表）',
    ])
    expect(v.stats.events).toBe(20)
    expect(v.stats.chains).toBe(8)
    // rolls: ev05×2 + ev06×1 + ev07×2 + ev11×1 + ev12×1 + ev18×2 = 9
    expect(v.stats.checks).toBe(9)
    // snapshot: ev03/04/05/07/10/11/13/18 = 8；anchor: ev02/ev17 = 2
    expect(v.stats.anchorsEv).toBe(8)
    expect(v.stats.anchorsTurn).toBe(2)
    // debugOnly: ev01(config_load) + ev09(ai_decision) + ev14(attribute_recalc) = 3
    expect(v.stats.debugOnly).toBe(3)
  })

  it('版本号异常被报告', () => {
    const log = createDemoArchive()
    log.version = '1.0.0'
    const v = validateUnified(log)
    expect(v.errors).toContain('版本号异常: 1.0.0')
  })

  it('时基非单调与父引用悬空被报告', () => {
    const log = createDemoArchive()
    log.events[5].timestamp = 100 // 破坏单调
    log.events[5].parentId = 'ghost'
    const v = validateUnified(log)
    expect(v.errors.some((e) => e.includes('时基非单调'))).toBe(true)
    expect(v.errors.some((e) => e.includes('父引用悬空'))).toBe(true)
  })
})

describe('buildArchiveIndices', () => {
  it('按 timestamp 排序、注入 RNG idx 与 _delta', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    expect(idx.evs).toHaveLength(20)
    expect(idx.evs[0].id).toBe('ev00')
    expect(idx.evs[19].id).toBe('ev19')
    expect(idx.duration).toBe(3600 + 500)

    const ev05 = idx.byId.get('ev05')!
    const rolls = ev05.payload.rolls as Array<{ idx?: number }>
    expect(rolls[0].idx).toBe(1)
    expect(rolls[1].idx).toBe(2)

    const ev03 = idx.byId.get('ev03')!
    expect(ev03._delta).toEqual([{ id: 'u2', fields: [{ k: 'HP', before: 500, after: 485 }] }])

    // 回合开始锚点：u2 energy 60 → 70（相对游标有变化）
    const ev02 = idx.byId.get('ev02')!
    expect(ev02._delta).toEqual([{ id: 'u2', fields: [{ k: 'EN', before: 60, after: 70 }] }])
  })

  it('children 按 parentId 聚合且按时间排序', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const kids = idx.children.get('ev04')!
    expect(kids.map((k) => k.id)).toEqual(['ev05', 'ev06', 'ev07', 'ev08'])
  })
})

describe('deriveDebugTree', () => {
  it('派生：初始化 + 回合（行动/结算节点）+ 结束', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const entries = deriveDebugTree(idx.evs, idx.byId, pname)
    expect(entries[0].kind).toBe('node')
    expect(entries[entries.length - 1].kind).toBe('node')
    const rounds = entries.filter((e) => e.kind === 'round')
    expect(rounds).toHaveLength(2)

    const flat = allNodesFlat(entries)
    const actionNodes = flat.filter((n) => n.action)
    expect(actionNodes).toHaveLength(2)
    // 普通攻击（3 段 · 连击之心）→ seg 结果 [c, m, h]
    const excalibur = actionNodes.find((n) => n.hits === 3)!
    expect(buildSegResults(excalibur)).toEqual(['c', 'm', 'h'])
  })

  it('nodeOfEvent 能定位事件所属节点', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const entries = deriveDebugTree(idx.evs, idx.byId, pname)
    const node = nodeOfEvent(entries, 'ev05')
    expect(node).not.toBeNull()
    expect(node!.id).toBe('n_ev04')
  })
})

describe('unified-sim（回放投影状态推演）', () => {
  it('freshSim 深拷贝 initialState', () => {
    const log = createDemoArchive()
    const sim = freshSim(log)
    expect(sim.u1.hp).toBe(350)
    expect(sim.u1.buffs[0].name).toBe('复仇怒火')
    // 修改克隆不影响原存档
    sim.u1.buffs[0].stacks = 99
    expect(log.initialState.participants[0].buffs![0].stacks).toBe(1)
  })

  it('推进到时点 ev18 时 u2 阵亡、u1 保持 287', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const sim = freshSim(log)
    const fired = advanceSimTo(sim, idx.evs, 3600)
    expect(fired).toBe(20)
    expect(sim.u2.hp).toBe(0)
    expect(sim.u1.hp).toBe(287)
    // 第 2 回合开始锚点将 u2 能量重置为 60（覆盖 ev10 的 50）
    expect(sim.u2.en).toBe(60)
  })

  it('buff_lifecycle apply/update 增量生效', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const sim = freshSim(log)
    advanceSimTo(sim, idx.evs, 1500) // 到 ev08（破甲打击被抵抗，不施加）
    expect(sim.u2.buffs.some((b) => b.name === '破甲打击')).toBe(false)
    advanceSimTo(sim, idx.evs, 2760) // ev16 update 复仇怒火 1→2
    expect(sim.u1.buffs.find((b) => b.name === '复仇怒火')!.stacks).toBe(2)
  })

  it('currentTurnAt / lastEventAt / formatTime', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    expect(currentTurnAt(idx.evs, 0)).toBe(0)
    expect(currentTurnAt(idx.evs, 500)).toBe(1)
    expect(currentTurnAt(idx.evs, 3300)).toBe(2)
    expect(lastEventAt(idx.evs, 1100)!.id).toBe('ev05')
    expect(formatTime(63400)).toBe('1:03.400')
  })

  it('单事件应用幂等：applyEventToSim 不改无关单位', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const sim = freshSim(log)
    applyEventToSim(sim, idx.byId.get('ev03')!)
    expect(sim.u2.hp).toBe(485)
    expect(sim.u1.hp).toBe(350)
  })
})

describe('unified-sim 检查点（seek 性能优化）', () => {
  it('从最近检查点续推与全量推演结果一致（多时点）', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const cps = buildSimCheckpoints(log, idx.evs, 5)
    for (const t of [0, 340, 1500, 2760, 3600]) {
      const full = freshSim(log)
      const fullFired = advanceSimTo(full, idx.evs, t)
      const cp = nearestCheckpoint(cps, t)
      const sim = cloneSimTable(cp.sim)
      const fired = advanceSimTo(sim, idx.evs, t, cp.idx)
      expect(fired).toBe(fullFired)
      expect(sim).toEqual(full)
    }
  })

  it('末位检查点续推到终态与全量一致', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const cps = buildSimCheckpoints(log, idx.evs, 7)
    const last = cps[cps.length - 1]
    const sim = cloneSimTable(last.sim)
    advanceSimTo(sim, idx.evs, Infinity, last.idx)
    const full = freshSim(log)
    advanceSimTo(full, idx.evs, Infinity)
    expect(sim).toEqual(full)
  })

  it('cloneSimTable 深拷贝，改动克隆不影响源表', () => {
    const log = createDemoArchive()
    const src = freshSim(log)
    const copy = cloneSimTable(src)
    copy.u1.hp = 999
    copy.u1.buffs[0].stacks = 99
    expect(src.u1.hp).toBe(350)
    expect(src.u1.buffs[0].stacks).toBe(1)
  })

  it('增量扩展：尾部追加事件后与全量重建完全一致', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    // 先用小事件子集建检查点，再追加剩余事件走增量路径
    const cut = 11
    const first = idx.evs.slice(0, cut)
    const cps1 = buildSimCheckpoints(log, first, 4)
    const cps2 = buildSimCheckpoints(log, idx.evs, 4, cps1)
    const full = buildSimCheckpoints(log, idx.evs, 4)
    expect(cps2).toEqual(full)
    // 末尾追加后可从新检查点续推到达终态
    const sim = cloneSimTable(cps2[cps2.length - 1].sim)
    advanceSimTo(sim, idx.evs, Infinity, cps2[cps2.length - 1].idx)
    const ff = freshSim(log)
    advanceSimTo(ff, idx.evs, Infinity)
    expect(sim).toEqual(ff)
  })

  it('增量前缀不一致（边界事件被替换）时回退全量重建', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const cps1 = buildSimCheckpoints(log, idx.evs.slice(0, 8), 4)
    // 破坏 idx7（末位检查点 lastId 对应的事件）：前缀校验失败 → 回退全量
    const reordered = [...idx.evs.slice(0, 7), { ...idx.evs[7], id: 'ev_prefix_broken' }, ...idx.evs.slice(8)]
    const cps2 = buildSimCheckpoints(log, reordered, 4, cps1)
    const full = buildSimCheckpoints(log, reordered, 4)
    expect(cps2).toEqual(full)
  })

  it('nearestCheckpoint 空序列返回 null，不做全量回退以外的静默错误', () => {
    expect(nearestCheckpoint([], 100)).toBeNull()
  })
})

describe('unified-steps（结算步骤展示辅助）', () => {
  it('逐步累计：20 +65 −15 ×1.5 +8 = 113', () => {
    const out = accumulateSteps([
      { n: '技能基础值', op: '', v: 20, src: 'skill_cfg.base' },
      { n: '攻击力', op: '+', v: 65, src: 'unit.atk' },
      { n: '防御减免', op: '−', v: 15, src: 'target.def' },
      { n: '暴击倍率', op: '×', v: 1.5, src: 'crit_rate' },
      { n: '复仇怒火', op: '+', v: 8, src: 'buff_guardian_revenge_rage' },
    ])
    expect(out.map((s) => s.running)).toEqual([20, 85, 70, 105, 113])
    expect(out.map((s) => s.op)).toEqual(['', '+', '−', '×', '+'])
  })

  it('运算符归一：半角 - * x 归一为全角', () => {
    expect(normalizeOp('-')).toBe('−')
    expect(normalizeOp('*')).toBe('×')
    expect(normalizeOp('x')).toBe('×')
    expect(normalizeOp('+')).toBe('+')
  })

  it('src 释义：精确命中 + 前缀归类 + 未命中', () => {
    expect(describeSrc('skill_cfg.base')).toBe('技能基础值')
    expect(describeSrc('unit.atk')).toBe('攻击者攻击力')
    expect(describeSrc('target.def')).toBe('目标防御力')
    expect(describeSrc('buff_guardian_revenge_rage')).toBe('复仇怒火')
    expect(describeSrc('unit.spd')).toBe('攻击者属性 · spd')
    expect(describeSrc('passive.combo_heart')).toBe('连击之心被动')
    expect(describeSrc('foo.bar')).toBeNull()
  })

  it('demo 全部 steps 链：累计终值与 result 偏差 ≤1（链式假设自检）', () => {
    const log = createDemoArchive()
    let chains = 0
    for (const e of log.events) {
      const steps = (e.payload as Record<string, unknown>)?.steps as CalcStep[] | undefined
      if (!steps?.length) continue
      chains++
      const acc = accumulateSteps(steps)
      const r = (e.payload as Record<string, unknown>).result
      expect(typeof r).toBe('number')
      expect(Math.abs(acc[acc.length - 1].running - (r as number))).toBeLessThanOrEqual(1)
    }
    // demo 确有 steps 链（防止该自检因数据缺失而空转）
    expect(chains).toBeGreaterThan(0)
  })
})
