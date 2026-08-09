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
  roundStepVal,
  stepNameCN,
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

  it('行动节点：name = 名字 · 技能名（无"战"图标），controlMode 正确映射', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const entries = deriveDebugTree(idx.evs, idx.byId, pname)
    const flat = allNodesFlat(entries)
    const actions = flat.filter((n) => n.action)
    // demo：火护法 普通攻击(player)、金护法 普通攻击(ai)
    const u1 = actions.find((n) => n.actor === 'u1')!
    const u2 = actions.find((n) => n.actor === 'u2')!
    expect(u1.name).toBe('火护法 · 普通攻击')
    expect(u1.icon).toBe('')
    expect(u1.meta).toBe('') // 'player' 不是合法 ControlMode，不显示
    expect(u2.name).toBe('金护法 · 普通攻击')
    expect(u2.meta).toBe('AI') // 'ai' 归一为 AI
  })

  it('行动节点：action_execution 无 skill 时，从同链 damage/heal 事件推断技能名（真实录制契约）', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    // 构造：克隆 demo 后，把某 action_execution 的 payload.skill 抹掉（模拟真实录制），
    // 保留同链 damage 的 skillName → 节点仍应显示"名字 · 技能名"
    const log2 = JSON.parse(JSON.stringify(log)) as typeof log
    const ev = log2.events.find((e) => e.id === 'ev04')!
    ;(ev.payload as Record<string, unknown>).skill = undefined
    const evs2 = buildArchiveIndices(log2).evs
    const byId2 = new Map(evs2.map((e) => [e.id, e]))
    const entries = deriveDebugTree(evs2, byId2, pname)
    const flat = allNodesFlat(entries)
    const u1 = flat.find((n) => n.action && n.actor === 'u1')!
    // demo 同链 ev05(seg1,skillName 缺失)… 实际 demo damage 事件无 skillName 字段 → 回退仅名字
    // 该路径的真实来源是 TraceDamageLogger 的 skillName；此处验证无 skillName 时优雅回退
    expect(u1.name).toBe('火护法')
    // 显式构造带 skillName 的同链事件，验证推断生效
    const ev05 = log2.events.find((e) => e.id === 'ev05')!
    ;(ev05.payload as Record<string, unknown>).skillName = '普通攻击'
    const evs3 = buildArchiveIndices(log2).evs
    const byId3 = new Map(evs3.map((e) => [e.id, e]))
    const entries3 = deriveDebugTree(evs3, byId3, pname)
    const u1b = allNodesFlat(entries3).find((n) => n.action && n.actor === 'u1')!
    expect(u1b.name).toBe('火护法 · 普通攻击')
  })

  it('行动节点 actionType：demo 普攻推断为 attack，无子事件节点无标签', () => {
    const log = createDemoArchive()
    const idx = buildArchiveIndices(log)
    const entries = deriveDebugTree(idx.evs, idx.byId, pname)
    const actions = allNodesFlat(entries).filter((n) => n.action)
    // demo 两个行动都是普通攻击（payload.skill='普通攻击'），旧存档推断 → attack
    expect(actions.every((n) => n.actionType === 'attack')).toBe(true)
    // 回合开始·结算等非行动节点不标行动类型
    const phase = allNodesFlat(entries).find((n) => n.phase)!
    expect(phase.actionType).toBeUndefined()
  })

  it('行动节点 actionType：action_execution payload.actionType 优先（被控制/跳过/技能类型）', () => {
    const log = createDemoArchive()
    const mk = (
      id: string,
      payload: Record<string, unknown>,
      phase: string,
      parentId?: string,
    ): (typeof log.events)[number] => ({
      id,
      phase: phase as never,
      correlationId: 'corr_x',
      parentId,
      timestamp: 1,
      level: 'info',
      sourceId: 'u1',
      payload,
      summary: 'x',
    })
    // 被控制 / 跳过：无子事件，仅事件流无法区分，必须由引擎 actionType 标记
    const statusEv = mk('s1', { controlMode: 'ai', actionType: 'status' }, 'action_execution')
    const skipEv = mk('s2', { controlMode: 'ai', actionType: 'skip' }, 'action_execution')
    // 大招：action_execution 标记 skill + skillType
    const skillEv = mk('s3', { controlMode: 'ai', actionType: 'skill', skillType: 'ultimate' }, 'action_execution')
    const dmg = mk('d1', { skillName: '雷霆一击', skillType: 'ultimate' }, 'damage_calculation', 's3')
    const byId = new Map([statusEv, skipEv, skillEv, dmg].map((e) => [e.id, e]))
    const entries = deriveDebugTree([statusEv, skipEv, skillEv, dmg], byId, (id: string) => id)
    const flat = allNodesFlat(entries)
    expect(flat.find((n) => n.id === 'n_s1')!.actionType).toBe('status')
    expect(flat.find((n) => n.id === 'n_s2')!.actionType).toBe('skip')
    // 大招：action_execution 标记优先（即使子事件也带 skillType）
    expect(flat.find((n) => n.id === 'n_s3')!.actionType).toBe('skill_ultimate')
  })

  it('行动节点 actionType：旧存档子事件 skillType 推断（小技能）', () => {
    const log = createDemoArchive()
    const log2 = JSON.parse(JSON.stringify(log)) as typeof log
    // 把 ev10（金护法普攻）改成无 payload.actionType 的旧存档，同链 damage 带 skillType: small
    const exec = log2.events.find((e) => e.id === 'ev10')!
    delete (exec.payload as Record<string, unknown>).skill
    const dmg = log2.events.find((e) => e.id === 'ev11')!
    ;(dmg.payload as Record<string, unknown>).skillType = 'small'
    ;(dmg.payload as Record<string, unknown>).skillName = '流火诀'
    const idx = buildArchiveIndices(log2)
    const entries = deriveDebugTree(idx.evs, idx.byId, pname)
    const u2 = allNodesFlat(entries).find((n) => n.action && n.actor === 'u2')!
    expect(u2.actionType).toBe('skill_small')
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

  it('roundStepVal：消除浮点尾差（extraValues 累加产生的 50.830000000000005）', () => {
    expect(roundStepVal(50.830000000000005)).toBe(50.83)
    expect(roundStepVal(0.30000000000000004)).toBe(0.3)
    expect(roundStepVal(50)).toBe(50)
    expect(roundStepVal(1.5)).toBe(1.5)
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

  it('stepNameCN：引擎英文标识映射中文，未命中原样返回', () => {
    expect(stepNameCN('base')).toBe('基础值')
    expect(stepNameCN('defense')).toBe('防御')
    expect(stepNameCN('crit')).toBe('暴击')
    expect(stepNameCN('fireSkillDmgBonus')).toBe('火系增伤')
    // demo 已中文 / 未知来源不误改
    expect(stepNameCN('技能基础值')).toBe('技能基础值')
    expect(stepNameCN('whatever')).toBe('whatever')
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
