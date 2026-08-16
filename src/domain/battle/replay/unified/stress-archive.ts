/**
 * 文件: stress-archive.ts
 * 功能: 压测存档合成器（纯函数，确定性）
 * 描述: 依据《调试日志UI-调试系统示例.html》"压测 · 合成 2k+ 事件"能力：
 *       生成覆盖全部 phase 与富 payload（steps/rolls/snapshot）的巨型存档，
 *       用于验证卡片流虚拟列表与渲染性能。
 */

import type { UnifiedArchive, UnifiedEvent } from './unified-archive'

/** xorshift32 确定性伪随机（seed 可复现） */
function createRng(seed: number): () => number {
  let s = seed >>> 0
  if (s === 0) s = 0x8f3a7c21
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 0xffffffff
  }
}

// NOTE: 技能名取自现有系统（configs/skills 与 yaotu 被动），参与者为真实角色
const SKILLS = ['普通攻击', '复仇怒火', '破甲打击', '连击之心', '首领光环', '能量过载', '疾风叠步', '灼烧爆破']

/**
 * 生成压测存档。
 * @param eventCount 目标事件总数（含根事件）
 * @param seed       随机种子（默认 0x8F3A7C21）
 */
export function createStressArchive(eventCount: number, seed = 0x8f3a7c21): UnifiedArchive {
  const rng = createRng(seed)
  const p1 = { id: 'u1', name: '火护法', maxHp: 350, side: 'ally' as const }
  const p2 = { id: 'u2', name: '金护法', maxHp: 500, side: 'enemy' as const }
  const participants = [
    { ...p1, hp: p1.maxHp, maxEnergy: 100, energy: 100, buffs: [] as Array<{ name: string; stacks: number; turns: number }>, attributes: { attack: 65, defense: 20, speed: 90, critRate: 25, critDamage: 150, damageReduction: 5, dodge: 8, hit: 90 } },
    { ...p2, hp: p2.maxHp, maxEnergy: 100, energy: 60, buffs: [] as Array<{ name: string; stacks: number; turns: number }>, attributes: { attack: 58, defense: 32, speed: 70, critRate: 10, critDamage: 125, damageReduction: 12, dodge: 10, hit: 90 } },
  ]

  const events: UnifiedEvent[] = []
  const simHp = new Map<string, number>([
    ['u1', p1.maxHp],
    ['u2', p2.maxHp],
  ])
  const simEn = new Map<string, number>([
    ['u1', 100],
    ['u2', 60],
  ])

  const push = (e: Omit<UnifiedEvent, '_delta'>): UnifiedEvent => {
    const ev = e as UnifiedEvent
    events.push(ev)
    return ev
  }

  // 根事件：battle_start
  push({
    id: 'evt_bs',
    phase: 'battle_lifecycle',
    correlationId: 'corr_root',
    timestamp: 0,
    randomSeed: seed.toString(16),
    level: 'info',
    payload: { action: 'battle_start', engine: 'Aegis 2.4.1' },
    summary: '战斗开始',
  })

  let ts = 0
  let seq = 0
  const nextId = (): string => `evt_${(++seq).toString().padStart(4, '0')}`

  let actions = 0
  while (events.length < eventCount - 1) {
    const round = actions + 1
    const corr = `corr_r${round}`
    // 回合开始（全量锚点）
    push({
      id: nextId(),
      phase: 'turn_flow',
      correlationId: corr,
      timestamp: ts,
      turn: round,
      level: 'info',
      payload: {
        action: 'start',
        turn: round,
        anchor: {
          participants: [
            { id: 'u1', hp: simHp.get('u1'), energy: simEn.get('u1') },
            { id: 'u2', hp: simHp.get('u2'), energy: simEn.get('u2') },
          ],
        },
      },
      summary: `第 ${round} 回合开始`,
    })
    ts += 40

    // 每次行动内生成 1~3 个结算事件
    const perAction = 1 + Math.floor(rng() * 3)
    for (let a = 0; a < perAction && events.length < eventCount - 1; a++) {
      const attacker = rng() < 0.5 ? 'u1' : 'u2'
      const defender = attacker === 'u1' ? 'u2' : 'u1'
      const skill = SKILLS[Math.floor(rng() * SKILLS.length)]
      const isHeal = attacker === 'u1' && rng() < 0.25
      const actorName = attacker === 'u1' ? p1.name : p2.name
      const actionId = nextId()

      // 行动事件（因果链根，无 parentId）；技能行动携带 actionType+energyCost，供行动卡片头部展示
      const isAttack = skill === '普通攻击'
      const actionPayload: Record<string, unknown> = {
        skill,
        hits: 1,
        controlMode: rng() < 0.5 ? 'player' : 'ai',
        actionType: isAttack ? 'attack' : 'skill',
      }
      if (!isAttack) actionPayload.energyCost = 20 + Math.floor(rng() * 31)
      push({
        id: actionId,
        phase: 'action_execution',
        correlationId: corr,
        timestamp: ts,
        level: 'info',
        sourceId: attacker,
        targetId: defender,
        payload: actionPayload,
        summary: `${actorName} 使用 [${skill}] → ${defender === 'u1' ? p1.name : p2.name}`,
      })
      ts += 30

      // 结算事件（伤害或治疗）
      const evId = nextId()
      const base = 15 + Math.floor(rng() * 25)
      const atk = 40 + Math.floor(rng() * 30)
      const def = 10 + Math.floor(rng() * 20)
      const crit = rng() < 0.2
      const dodge = !isHeal && rng() < 0.12
      const result = dodge ? 0 : Math.max(0, Math.round((base + atk - def) * (crit ? 1.5 : 1)))

      const payload: Record<string, unknown> = {
        seg: 1,
        steps: [
          { n: '技能基础值', op: '', v: base, src: 'skill_cfg.base' },
          { n: '攻击力', op: '+', v: atk, src: 'unit.atk' },
          { n: isHeal ? '治疗加成' : '防御减免', op: isHeal ? '×' : '−', v: isHeal ? 1.2 : def, src: isHeal ? 'buff.heal' : 'target.def' },
        ],
        result,
      }
      if (crit) payload.crit = true
      if (dodge) payload.dodge = true
      const rolls: Array<{ kind: string; rate: number; roll: number }> = [
        { kind: 'hit', rate: 0.875, roll: Math.round(rng() * 1000) / 1000 },
      ]
      if (crit) rolls.push({ kind: 'crit', rate: 0.25, roll: Math.round(rng() * 1000) / 1000 })
      if (!isHeal && !dodge) {
        const resistRoll = { kind: 'resist', rate: 0.3, roll: Math.round(rng() * 1000) / 1000 }
        rolls.push(resistRoll)
        if (resistRoll.roll >= resistRoll.rate) payload.buff = '破甲'
      }
      payload.rolls = rolls

      const cur = simHp.get(defender) ?? 0
      const next = dodge || isHeal ? Math.min(cur + result, (defender === 'u1' ? p1 : p2).maxHp) : Math.max(0, cur - result)
      simHp.set(defender, next)
      const evt = push({
        id: evId,
        phase: isHeal ? 'heal_calculation' : 'damage_calculation',
        correlationId: corr,
        parentId: actionId,
        timestamp: ts,
        level: 'info',
        sourceId: attacker,
        targetId: defender,
        payload,
        snapshot: { turn: round, participants: [{ id: defender, hp: next }] },
        summary: isHeal
          ? `${defender === 'u1' ? p1.name : p2.name} 受到治疗 ${result}`
          : dodge
            ? `${defender === 'u1' ? p1.name : p2.name} 闪避了 ${skill}`
            : `${crit ? '暴击！' : ''}${defender === 'u1' ? p1.name : p2.name} 受到 ${result} 伤害`,
      })
      if (next <= 0) {
        payload.death = true
        evt.level = 'warn'
        simHp.set(defender, 0)
      }
      ts += 30
    }
    actions++
  }

  // 根事件：battle_end
  const lastTs = events.length ? events[events.length - 1].timestamp : 0
  const winner = (simHp.get('u1') ?? 0) >= (simHp.get('u2') ?? 0) ? 'u1' : 'u2'
  push({
    id: nextId(),
    phase: 'battle_lifecycle',
    correlationId: 'corr_end',
    timestamp: lastTs + 50,
    level: 'info',
    payload: { action: 'battle_end', winner, rounds: actions },
    summary: `战斗结束 · ${winner === 'u1' ? p1.name : p2.name} 获胜`,
  })

  return {
    battleId: `BT-STRESS-${eventCount}`,
    replayId: 'rp-stress',
    version: '2.0.0',
    randomSeed: seed.toString(16).toUpperCase(),
    startTime: Date.now(),
    winner,
    checksum: 'stress',
    initialState: { participants },
    events,
  }
}
