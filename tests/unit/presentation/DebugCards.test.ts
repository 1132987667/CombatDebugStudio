// @vitest-environment happy-dom
/**
 * DebugCards 行动卡片标题与头部元信息测试
 *
 * 背景：真实录制 action_execution 的 summary 是引擎占位"X 执行行动"（技能选定前发射），
 *       不表达"执行了什么操作"。卡片标题应对 action_execution 行显示节点已解析的
 *       "名字 · 技能名"（deriveDebugTree 从同链 damage/heal 推断），原始 summary 留悬浮。
 *       头部 ht-stream-hd 展示行动人（居中）+ 行动类型标签 + 目标结果遍历（目标可多个）。
 *
 * 验证：① 选中行动节点后，action_execution 卡片标题为"火护法 · 普通攻击"，而非占位 summary。
 *       ② 头部标题 = 行动人角色名，行动类型与时间线标签一致，目标行显示"角色名 -> 结果"。
 *       ③ 多目标存档：各目标独立聚合伤害/治疗/状态结果。
 *
 * 运行: npx vitest run tests/unit/presentation/DebugCards.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import { createPinia } from 'pinia'

import DebugCards from '@/presentation/modules/haotian/views/DebugCards.vue'
import { useHaotianStore } from '@/presentation/modules/haotian/stores/haotianStore'
import type { UnifiedArchive, UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'

let app: App | null = null
let host: HTMLElement | null = null

async function mountCards(): Promise<HTMLElement> {
  host = document.createElement('div')
  host.style.height = '600px'
  document.body.appendChild(host)
  const pinia = createPinia()
  app = createApp({ render: () => h(DebugCards, { active: true }) })
  app.use(pinia)
  app.mount(host)
  const store = useHaotianStore()
  await store.loadDemo()
  // 选中第一个行动节点（火护法 普通攻击）
  const node = store.debugNodes.find((n) => n.action)
  if (node) store.selectDebugNode(node.id)
  await new Promise((r) => setTimeout(r, 30))
  return host
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
  document.body.innerHTML = ''
})

/** 多目标存档：一个行动命中两个目标（金护法受伤+buff、水护法受治疗） */
function createMultiTargetArchive(): UnifiedArchive {
  const ev = (e: Omit<UnifiedEvent, '_delta'>): UnifiedEvent => e
  return {
    battleId: 'BT-MULTI',
    replayId: 'rp-multi',
    version: '2.0.0',
    randomSeed: '1',
    startTime: 0,
    winner: 'u1',
    initialState: {
      participants: [
        { id: 'u1', name: '火护法', maxHp: 350, hp: 350, maxEnergy: 100, energy: 100, side: 'ally', buffs: [] },
        { id: 'u2', name: '金护法', maxHp: 500, hp: 500, maxEnergy: 100, energy: 60, side: 'enemy', buffs: [] },
        { id: 'u3', name: '水护法', maxHp: 400, hp: 300, maxEnergy: 100, energy: 40, side: 'ally', buffs: [] },
      ],
    },
    events: [
      ev({ id: 'm0', phase: 'battle_lifecycle', correlationId: 'c0', timestamp: 0, level: 'info', payload: { action: 'battle_start' }, summary: 'x' }),
      ev({ id: 'm1', phase: 'turn_flow', correlationId: 'c1', timestamp: 100, level: 'info', turn: 1, payload: { action: 'start', turn: 1 }, summary: 'x' }),
      ev({ id: 'm2', phase: 'action_execution', correlationId: 'c2', timestamp: 200, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { controlMode: 'ai', actionType: 'attack' }, summary: 'x' }),
      ev({ id: 'm3', phase: 'damage_calculation', correlationId: 'c2', parentId: 'm2', timestamp: 300, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { result: 10, skillName: '普通攻击' }, summary: 'x' }),
      ev({ id: 'm4', phase: 'heal_calculation', correlationId: 'c2', parentId: 'm2', timestamp: 400, level: 'info', sourceId: 'u1', targetId: 'u3', payload: { result: 5, skillName: '甘霖' }, summary: 'x' }),
      ev({ id: 'm5', phase: 'buff_lifecycle', correlationId: 'c2', parentId: 'm2', timestamp: 500, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { action: 'apply', buffName: '破甲' }, summary: 'x' }),
    ],
  }
}

/** 真实录制风格存档：damage/heal summary 带"源→目标"角色段（meta 行已展示角色） */
function createRealtimeSummaryArchive(): UnifiedArchive {
  const ev = (e: Omit<UnifiedEvent, '_delta'>): UnifiedEvent => e
  return {
    battleId: 'BT-REAL',
    replayId: 'rp-real',
    version: '2.0.0',
    randomSeed: '1',
    startTime: 0,
    winner: 'u2',
    initialState: {
      participants: [
        { id: 'u1', name: '小狮兵', maxHp: 300, hp: 300, maxEnergy: 100, energy: 100, side: 'ally', buffs: [] },
        { id: 'u2', name: '巨岩妖', maxHp: 600, hp: 600, maxEnergy: 100, energy: 80, side: 'enemy', buffs: [] },
      ],
    },
    events: [
      ev({ id: 'r0', phase: 'battle_lifecycle', correlationId: 'c0', timestamp: 0, level: 'info', payload: { action: 'battle_start' }, summary: 'x' }),
      ev({ id: 'r1', phase: 'turn_flow', correlationId: 'c1', timestamp: 100, level: 'info', turn: 1, payload: { action: 'start', turn: 1 }, summary: 'x' }),
      ev({ id: 'r2', phase: 'action_execution', correlationId: 'c2', timestamp: 200, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { actionType: 'attack', controlMode: 'AI' }, summary: 'x' }),
      ev({ id: 'r3', phase: 'damage_calculation', correlationId: 'c2', parentId: 'r2', timestamp: 300, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { result: 24, crit: true, skillName: '普通攻击' }, summary: '伤害计算 小狮兵→巨岩妖 最终伤害 24 ★暴击' }),
    ],
  }
}

/** 技能行动存档：actionType=skill + energyCost，验证头部"消耗"行显示 */
function createSkillArchive(): UnifiedArchive {
  const ev = (e: Omit<UnifiedEvent, '_delta'>): UnifiedEvent => e
  return {
    battleId: 'BT-SKILL',
    replayId: 'rp-skill',
    version: '2.0.0',
    randomSeed: '1',
    startTime: 0,
    winner: 'u1',
    initialState: {
      participants: [
        { id: 'u1', name: '火护法', maxHp: 350, hp: 350, maxEnergy: 100, energy: 100, side: 'ally', buffs: [] },
        { id: 'u2', name: '金护法', maxHp: 500, hp: 500, maxEnergy: 100, energy: 60, side: 'enemy', buffs: [] },
      ],
    },
    events: [
      ev({ id: 's0', phase: 'battle_lifecycle', correlationId: 'c0', timestamp: 0, level: 'info', payload: { action: 'battle_start' }, summary: 'x' }),
      ev({ id: 's1', phase: 'turn_flow', correlationId: 'c1', timestamp: 100, level: 'info', turn: 1, payload: { action: 'start', turn: 1 }, summary: 'x' }),
      ev({ id: 's2', phase: 'action_execution', correlationId: 'c2', timestamp: 200, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { controlMode: 'ai', actionType: 'skill', energyCost: 30 }, snapshot: { turn: 1, participants: [{ id: 'u1', energy: 70 }] }, summary: 'x' }),
      ev({ id: 's3', phase: 'damage_calculation', correlationId: 'c2', parentId: 's2', timestamp: 300, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { result: 50, skillName: '烈焰斩', skillType: 'ultimate' }, summary: 'x' }),
    ],
  }
}

/** 条渲染存档：同一行动链内目标受伤(u2)、目标受治疗+回能量(u3)，验证气血/能量条四态 */
function createBarsArchive(): UnifiedArchive {
  const ev = (e: Omit<UnifiedEvent, '_delta'>): UnifiedEvent => e
  return {
    battleId: 'BT-BARS',
    replayId: 'rp-bars',
    version: '2.0.0',
    randomSeed: '1',
    startTime: 0,
    winner: 'u1',
    initialState: {
      participants: [
        { id: 'u1', name: '火护法', maxHp: 350, hp: 350, maxEnergy: 100, energy: 100, side: 'ally', buffs: [] },
        { id: 'u2', name: '金护法', maxHp: 500, hp: 500, maxEnergy: 100, energy: 60, side: 'enemy', buffs: [] },
        { id: 'u3', name: '水护法', maxHp: 400, hp: 300, maxEnergy: 100, energy: 40, side: 'ally', buffs: [] },
      ],
    },
    events: [
      ev({ id: 'b0', phase: 'battle_lifecycle', correlationId: 'c0', timestamp: 0, level: 'info', payload: { action: 'battle_start' }, summary: 'x' }),
      ev({ id: 'b1', phase: 'turn_flow', correlationId: 'c1', timestamp: 100, level: 'info', turn: 1, payload: { action: 'start', turn: 1 }, summary: 'x' }),
      ev({ id: 'b2', phase: 'action_execution', correlationId: 'c2', timestamp: 200, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { controlMode: 'ai', actionType: 'attack' }, summary: 'x' }),
      ev({ id: 'b3', phase: 'damage_calculation', correlationId: 'c2', parentId: 'b2', timestamp: 300, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { result: 70, skillName: '普通攻击' }, snapshot: { turn: 1, participants: [{ id: 'u2', hp: 430 }] }, summary: 'x' }),
      ev({ id: 'b4', phase: 'heal_calculation', correlationId: 'c2', parentId: 'b2', timestamp: 400, level: 'info', sourceId: 'u1', targetId: 'u3', payload: { result: 20, skillName: '甘霖' }, snapshot: { turn: 1, participants: [{ id: 'u3', hp: 320, energy: 60 }] }, summary: 'x' }),
    ],
  }
}

/** 技能描述存档：技能行动技能名"吸血"（skill_passive_test.json 配置，description 非空） */
function createSkillDescArchive(): UnifiedArchive {
  const ev = (e: Omit<UnifiedEvent, '_delta'>): UnifiedEvent => e
  return {
    battleId: 'BT-DESC',
    replayId: 'rp-desc',
    version: '2.0.0',
    randomSeed: '1',
    startTime: 0,
    winner: 'u1',
    initialState: {
      participants: [
        { id: 'u1', name: '火护法', maxHp: 350, hp: 350, maxEnergy: 100, energy: 100, side: 'ally', buffs: [] },
        { id: 'u2', name: '金护法', maxHp: 500, hp: 500, maxEnergy: 100, energy: 60, side: 'enemy', buffs: [] },
      ],
    },
    events: [
      ev({ id: 'd0', phase: 'battle_lifecycle', correlationId: 'c0', timestamp: 0, level: 'info', payload: { action: 'battle_start' }, summary: 'x' }),
      ev({ id: 'd1', phase: 'turn_flow', correlationId: 'c1', timestamp: 100, level: 'info', turn: 1, payload: { action: 'start', turn: 1 }, summary: 'x' }),
      ev({ id: 'd2', phase: 'action_execution', correlationId: 'c2', timestamp: 200, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { controlMode: 'ai', actionType: 'skill', skill: '吸血' }, summary: 'x' }),
      ev({ id: 'd3', phase: 'damage_calculation', correlationId: 'c2', parentId: 'd2', timestamp: 300, level: 'info', sourceId: 'u1', targetId: 'u2', payload: { result: 80, skillName: '吸血', skillType: 'ultimate' }, snapshot: { turn: 1, participants: [{ id: 'u2', hp: 420 }] }, summary: 'x' }),
    ],
  }
}

describe('DebugCards 行动卡片标题', () => {
  it('action_execution 卡片显示操作名（名字 · 技能名）而非占位 summary', async () => {
    const root = await mountCards()
    const text = root.textContent ?? ''
    expect(text).toContain('火护法 · 普通攻击')
    // 不应出现引擎占位"执行行动"（demo summary 是"使用 [普通攻击]"，但占位词不应成为标题）
    expect(text).not.toContain('执行行动')
  })

  it('伤害/治疗卡片标题剥离"源→目标"角色段（meta 行已展示角色）', async () => {
    await mountCards()
    const store = useHaotianStore()
    await store.loadArchiveFile(new File([JSON.stringify(createRealtimeSummaryArchive())], 'real.json'))
    await new Promise((r) => setTimeout(r, 30))
    const node = store.debugNodes.find((n) => n.action)
    if (node) store.selectDebugNode(node.id)
    await new Promise((r) => setTimeout(r, 30))
    const titles = [...host!.querySelectorAll<HTMLElement>('.ht-ev-title')]
    const dmg = titles.find((t) => t.textContent?.startsWith('伤害计算'))
    expect(dmg?.textContent).toBe('伤害计算 最终伤害 24 ★暴击')
    // 原始 summary（含角色段）保留在悬浮提示，不丢信息
    expect(dmg?.title).toBe('伤害计算 小狮兵→巨岩妖 最终伤害 24 ★暴击')
  })

  it('头部：标题为"第 N 回合 · 行动人角色名"（居中），行动类型与时间线标签一致，目标行显示"角色名 -> 结果"', async () => {
    const root = await mountCards()
    const title = root.querySelector('.ht-sh-title')
    expect(title?.textContent).toBe('第 1 回合 · 火护法')
    const text = root.textContent ?? ''
    // 行动类型（与时间线一致）
    expect(text).toContain('行动类型')
    expect(text).toContain('普通攻击')
    // 目标结果行：金护法 -> 造成 171 伤害 · 暴击；施加 破甲打击（被抵抗）
    // demo ev04 链：ev05 暴击 113 + ev06 闪避 + ev07 58 + ev08 buff apply 被抵抗
    expect(text).toContain('目标')
    expect(text).toContain('金护法')
    expect(text).toContain('造成 171 伤害')
    expect(text).toContain('暴击')
    expect(text).toContain('施加 破甲打击（被抵抗）')
  })

  it('头部多目标：各目标独立聚合伤害/治疗/状态结果', async () => {    await mountCards()
    const store = useHaotianStore()
    await store.loadArchiveFile(new File([JSON.stringify(createMultiTargetArchive())], 'multi.json'))
    await new Promise((r) => setTimeout(r, 30))
    const rows = [...host!.querySelectorAll<HTMLElement>('.ht-sh-row')]
    const targetRow = (name: string): string =>
      rows.find((r) => r.querySelector('b')?.textContent === name)?.textContent ?? ''
    expect(store.pname('u1')).toBe('火护法')
    expect(targetRow('金护法')).toContain('造成 10 伤害')
    expect(targetRow('金护法')).toContain('施加 破甲')
    expect(targetRow('水护法')).toContain('治疗 5')
    // 非行动节点（回合开始·结算）不显示目标行
    const phaseNode = store.debugNodes.find((n) => n.phase)
    if (phaseNode) store.selectDebugNode(phaseNode.id)
    await new Promise((r) => setTimeout(r, 30))
    expect(host!.querySelectorAll('.ht-sh-row').length).toBe(0)
  })

  it('头部技能行动：显示"消耗: X能量"；普攻/无消耗数据不显示', async () => {
    await mountCards()
    const store = useHaotianStore()
    // 技能行动：显示消耗
    await store.loadArchiveFile(new File([JSON.stringify(createSkillArchive())], 'skill.json'))
    await new Promise((r) => setTimeout(r, 30))
    const text = host!.textContent ?? ''
    expect(text).toContain('行动类型')
    expect(text).toContain('技能')
    expect(text).toContain('消耗')
    expect(text).toContain('30能量')
    // 消耗行同侧显示行动者剩余能量（action_execution 快照 EN 末态 100→70）
    expect(text).toContain('剩余 70能量')
    // 普攻行动（demo 首个节点）：无消耗行
    await store.loadDemo()
    await new Promise((r) => setTimeout(r, 30))
    const node = store.debugNodes.find((n) => n.action)
    if (node) store.selectDebugNode(node.id)
    await new Promise((r) => setTimeout(r, 30))
    expect(host!.textContent ?? '').not.toContain('消耗')
  })

  it('目标行气血/能量条：伤害红段、治疗亮绿段、回能亮蓝段，按 HP/EN 前后值渲染', async () => {
    await mountCards()
    const store = useHaotianStore()
    await store.loadArchiveFile(new File([JSON.stringify(createBarsArchive())], 'bars.json'))
    await new Promise((r) => setTimeout(r, 30))
    const node = store.debugNodes.find((n) => n.action)
    if (node) store.selectDebugNode(node.id)
    await new Promise((r) => setTimeout(r, 30))
    const tgts = [...host!.querySelectorAll<HTMLElement>('.ht-sh-tgt')]
    const tgtOf = (name: string): HTMLElement => tgts.find((t) => t.querySelector('b')?.textContent === name)!
    // 受伤目标 u2：气血条 剩余86%（430/500）+ 扣减红段14%（70/500），无能量条
    const u2 = tgtOf('金护法')
    expect(u2.querySelector('.ht-bar-hp .keep')?.getAttribute('style')).toContain('86%')
    const u2Change = u2.querySelector('.ht-bar-hp .change')
    expect(u2Change?.classList.contains('damage')).toBe(true)
    expect(u2Change?.getAttribute('style')).toContain('14%')
    expect(u2.querySelector('.ht-bar-en')).toBeNull()
    // 受治疗+回能目标 u3：气血条 原有75% + 治疗亮绿5%；能量条 原有40% + 回复亮蓝20%
    const u3 = tgtOf('水护法')
    expect(u3.querySelector('.ht-bar-hp .keep')?.getAttribute('style')).toContain('75%')
    const healSeg = u3.querySelector('.ht-bar-hp .change')
    expect(healSeg?.classList.contains('heal')).toBe(true)
    expect(healSeg?.getAttribute('style')).toContain('5%')
    expect(u3.querySelector('.ht-bar-en .keep')?.getAttribute('style')).toContain('40%')
    const gainSeg = u3.querySelector('.ht-bar-en .change')
    expect(gainSeg?.classList.contains('gain')).toBe(true)
    expect(gainSeg?.getAttribute('style')).toContain('20%')
    // 条内文字：当前/最大 ± 变化量
    expect(u2.querySelector('.ht-bar-hp .ht-bar-text')?.textContent).toBe('430/500 - 70')
    expect(u3.querySelector('.ht-bar-hp .ht-bar-text')?.textContent).toBe('320/400 + 20')
    expect(u3.querySelector('.ht-bar-en .ht-bar-text')?.textContent).toBe('60/100 + 20')
  })

  it('技能描述：技能类行动（小/大/被动归通用 skill）在头部下方显示配置 description', async () => {
    await mountCards()
    const store = useHaotianStore()
    // 普攻行动无技能描述
    expect(host!.querySelector('.ht-sh-skill-desc')).toBeNull()
    // 技能行动：技能名"吸血"（skill_passive_test.json 配置），描述来自配置
    await store.loadArchiveFile(new File([JSON.stringify(createSkillDescArchive())], 'desc.json'))
    await new Promise((r) => setTimeout(r, 30))
    const node = store.debugNodes.find((n) => n.action)
    if (node) store.selectDebugNode(node.id)
    await new Promise((r) => setTimeout(r, 30))
    const desc = host!.querySelector('.ht-sh-skill-desc')
    expect(desc?.textContent).toContain('恢复伤害')
  })
})
