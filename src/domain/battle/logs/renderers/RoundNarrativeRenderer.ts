/**
 * 文件: RoundNarrativeRenderer.ts
 * 功能: 方案 B · 玩家叙事流 — 回合级聚合渲染器
 * 描述: 将 CombatRecord[] 按攻击动作聚合为叙事块，渲染为玩家可读的 LogSegment[]。
 *       相对于调试树（方案 A），叙事流强调"谁对谁做了什么、结果如何"，
 *       省略伤害计算过程、未触发的被动、系统噪音。
 *
 * 数据流：
 *   CombatRecord[] → 按 (turn, actorId) 分组 → NarrativeBlock[]
 *   → 每块渲染为 LogSegment[]（着色 + 高光）
 *
 * 静默规则：
 *   - 未触发的概率被动 → 完全省略
 *   - 伤害计算过程 → 只给最终值，暴击标 ★
 *   - 系统初始化日志 → 过滤
 */

import type { CombatRecord, DamageBreakdown } from '@/domain/battle/combat-record'
import type { LogSegment, BattleLogEntry } from '@/shared/types/battle-log'
import type { NarrativeBlock as BattleLogNarrativeBlock } from '@/shared/types/battle-log'
import { skillSegment } from '@/shared/utils/log-segment-factory'
import type { SkillConfigLookup } from '@/shared/utils/log-segment-factory'
import { BattleSummaryGenerator } from '@/domain/battle/logs/BattleSummaryGenerator'

// ==================== 叙事块类型 ====================

/** 已触发的被动信息 */
export interface TriggeredPassive {
  name: string
  effect: string
}

/** 高光标记 */
export type Highlight = 'crit' | 'kill' | 'immune' | 'control'

/** 叙事块——一次攻击/技能的聚合 */
export interface NarrativeBlock {
  turn: number
  actor: string
  actorId: string
  target: string
  targetId: string
  actionName: string
  /** 技能 ID（用于可悬浮技能名） */
  skillId?: string
  /** 伤害来源类型 */
  damageSource?: 'attack' | 'skill' | 'dot' | 'thorns' | 'reaction'
  /** 是否为目标行为（有别于系统行为） */
  isAction: boolean
  /** 主伤害值 */
  damage: number
  /** 治疗值 */
  heal: number
  /** 伤害类型描述（如"物理伤害"、"水属性伤害"） */
  damageType?: string
  /** 目标受击前 HP（跟踪累计） */
  targetHpBefore?: number
  /** 目标受击后 HP */
  targetHpAfter?: number
  /** 已触发的被动 */
  passives: TriggeredPassive[]
  /** 高光标记 */
  highlights: Highlight[]
  /** 是否击杀 */
  isKill: boolean
  /** 是否暴击 */
  isCrit: boolean
}

// ==================== HP 追踪器 ====================

/** 简单 HP 状态追踪 */
class HpTracker {
  private hp = new Map<string, { current: number; max: number; name?: string }>()
  private side = new Map<string, string>()

  /** 设置初始 HP */
  init(id: string, current: number, max: number, name?: string): void {
    this.hp.set(id, { current, max, name })
  }

  /** 设置阵营 */
  setSide(id: string, side: string): void {
    this.side.set(id, side)
  }

  /** 获取阵营 */
  getSide(id: string): string | undefined {
    return this.side.get(id)
  }

  /** 应用伤害 */
  applyDamage(id: string, damage: number): void {
    const entry = this.hp.get(id)
    if (entry) entry.current = Math.max(0, entry.current - damage)
  }

  /** 应用治疗 */
  applyHeal(id: string, heal: number): void {
    const entry = this.hp.get(id)
    if (entry) entry.current = Math.min(entry.max, entry.current + heal)
  }

  getHp(id: string): { current: number; max: number } | undefined {
    return this.hp.get(id)
  }

  /** 获取所有参与者的态势快照 */
  getAll(): Map<string, { current: number; max: number; name?: string }> {
    return new Map(this.hp)
  }
}

// ==================== 渲染器 ====================

export class RoundNarrativeRenderer {
  private hpTracker = new HpTracker()
  private skillLookup?: SkillConfigLookup

  /** 设置技能配置查找器（用于可悬浮技能名） */
  setSkillLookup(lookup: SkillConfigLookup): void {
    this.skillLookup = lookup
  }

  /**
   * 重置 HP 追踪状态（新战斗开始时调用）
   */
  reset(): void {
    this.hpTracker = new HpTracker()
  }

  /**
   * 把 BattleLogEntry[] 分组成叙事块（玩家日志新管道入口）
   *
   * 分组规则（基于 meta.role）：
   *  - battle: `battle-header` 块
   *  - action: `action` 块，header=segments, result=buildResult(meta)
   *  - sub: 作为从属行挂到最近的 action 块下
   *  - settlement: 归入 `settlement` 块
   *  - snapshot: 归入 `snapshot` 块
   *  - condition: `section` 块
   *  - 其他/无 meta: `plain` 块
   *  回合号变化时插入 `round` 块
   */
  renderEntries(entries: BattleLogEntry[]): BattleLogNarrativeBlock[] {
    const blocks: BattleLogNarrativeBlock[] = []
    let currentTurn = -1
    let currentAction: Extract<BattleLogNarrativeBlock, { type: 'action' }> | null = null
    let settlement: LogSegment[][] | null = null
    let snapshot: LogSegment[][] | null = null
    let roundTag: string | undefined

    const flushAction = () => { if (currentAction) { blocks.push(currentAction); currentAction = null } }
    const flushSettlement = () => { if (settlement) { blocks.push({ type: 'settlement', lines: settlement }); settlement = null } }
    const flushSnapshot = () => { if (snapshot) { blocks.push({ type: 'snapshot', lines: snapshot }); snapshot = null } }
    const flushAll = () => { flushAction(); flushSettlement(); flushSnapshot() }

    for (const e of entries) {
      const meta = e.meta ?? {}
      const turn = typeof e.turn === 'number' ? e.turn : (parseInt(String(e.turn), 10) || 0)

      // 回合切换 → 先落盘上一回合，再推入回合头
      if (turn !== currentTurn) {
        flushAll()
        blocks.push({ type: 'round', turn, tag: roundTag })
        currentTurn = turn
        roundTag = undefined
      }
      if (meta.roundTag) roundTag = meta.roundTag

      switch (meta.role) {
        case 'battle':
          flushAll()
          blocks.push({ type: 'battle-header', segments: e.segments ?? [{ text: e.message || '' }] })
          break
        case 'action':
          flushAll()
          currentAction = {
            type: 'action',
            header: e.segments ?? [{ text: e.message || '' }],
            result: this.buildResult(meta),
            subs: [],
          }
          break
        case 'sub':
          flushSettlement()
          flushSnapshot()
          if (currentAction) {
            currentAction.subs.push(e.segments ?? [{ text: e.message || '' }])
          } else {
            blocks.push({ type: 'plain', segments: e.segments ?? [{ text: e.message || '' }] })
          }
          break
        case 'settlement':
          flushAction()
          flushSnapshot()
          ;(settlement ??= []).push(this.buildSettlementLine(e, meta))
          break
        case 'snapshot':
          flushAction()
          flushSettlement()
          ;(snapshot ??= []).push(e.segments ?? [{ text: e.message || '' }])
          break
        case 'condition':
          flushAction()
          blocks.push({ type: 'section', title: '条件激活', lines: [e.segments ?? [{ text: e.message || '' }]] })
          break
        default:
          flushAction()
          blocks.push({ type: 'plain', segments: e.segments ?? [{ text: e.message || '' }] })
      }
    }
    flushAll()

    // 战报摘要：战斗结束后追加 summary 块
    const summary = BattleSummaryGenerator.instance.lastSummary
    if (summary) {
      const summaryLines: LogSegment[][] = []
      summaryLines.push([
        { text: `战斗结束 · ${summary.winner}胜利 · ${summary.totalRounds}回合`, classStr: 'log-system' },
      ])
      summaryLines.push([
        { text: `总伤害 ${summary.totalDamageDealt} · 总治疗 ${summary.totalHealing} · `, classStr: 'log-text' },
        { text: `暴击 ${summary.highestSingleDamage?.crit ? '是' : '否'}`, classStr: 'log-text' },
      ])
      if (summary.highestSingleDamage) {
        summaryLines.push([
          { text: `最高单次: ${summary.highestSingleDamage.actor} — ${summary.highestSingleDamage.value}`, classStr: 'log-friendly' },
        ])
      }
      // MVP：按总伤害排序
      let mvp = '', mvpDmg = -1
      for (const p of summary.participants) {
        if (p.totalDamageDealt > mvpDmg) { mvpDmg = p.totalDamageDealt; mvp = p.name }
      }
      if (mvp) {
        summaryLines.push([
          { text: `MVP: ${mvp} — 总伤害 ${mvpDmg}`, classStr: 'log-friendly' },
        ])
      }
      blocks.push({ type: 'summary', lines: summaryLines })
    }

    // ★ 回合标签推断：遍历 blocks，为每个 round 块推断标签
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      if (b.type !== 'round') continue
      const roundEntries: BattleLogNarrativeBlock[] = []
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[j].type === 'round' || blocks[j].type === 'battle-header' || blocks[j].type === 'summary') break
        roundEntries.push(blocks[j])
      }
      const tag = this.inferRoundTag(roundEntries)
      if (tag) b.tag = tag
    }

    return blocks
  }

  /** 从当前回合的叙事块推断回合标签 */
  private inferRoundTag(blocks: BattleLogNarrativeBlock[]): string | undefined {
    let hasKill = false
    let hasLethal = false
    let subCount = 0
    for (const b of blocks) {
      if (b.type === 'action') subCount += b.subs.length
      if (b.type === 'action' && b.result) {
        // 检查 result segments 中是否包含击杀/致死标记
        for (const s of b.result) {
          if (s.classStr === 'log-kill') hasKill = true
          if (s.classStr === 'log-lethal') hasLethal = true
        }
      }
    }
    if (hasKill) return '击杀!'
    if (hasLethal) return '致命保护!'
    if (subCount > 3) return '多重触发'
    return undefined
  }

  /** 结果行：`42 点物理伤害  450 → 408`，暴击前缀 ★，致死/击杀标记 */
  private buildResult(meta: import('@/shared/types/battle-log').BattleLogMeta): LogSegment[] | undefined {
    if (meta.damage == null && meta.heal == null) return undefined
    const segs: LogSegment[] = []
    if (meta.crit) segs.push({ text: '★ 暴击! ', classStr: 'log-crit' })
    if (meta.damage != null) {
      const damageType = '物理伤害'
      segs.push({ text: `${meta.damage} 点${damageType}  `, classStr: meta.crit ? 'log-crit' : 'log-damage' })
    } else if (meta.heal != null) {
      segs.push({ text: `+${meta.heal}`, classStr: 'log-heal' })
      segs.push({ text: ' HP  ' })
    }
    if (meta.hpBefore != null && meta.hpAfter != null) {
      segs.push({ text: `${meta.hpBefore} → ${meta.hpAfter}`, classStr: 'log-hp' })
    }
    if (meta.lethal) segs.push({ text: ' — 致死!', classStr: 'log-lethal' })
    if (meta.kill) segs.push({ text: ' ✦ 击杀!', classStr: 'log-kill' })
    return segs
  }

  /** 结算行：DOT `中毒 -10HP → 303` */
  private buildSettlementLine(e: BattleLogEntry, meta: import('@/shared/types/battle-log').BattleLogMeta): LogSegment[] {
    const segs: LogSegment[] = [...(e.segments ?? [])]
    if (meta.hpAfter != null) segs.push({ text: ` → ${meta.hpAfter}`, classStr: 'log-hp' })
    return segs
  }

  /**
   * @deprecated 用于 BattleRecordingDialog 回放；玩家视图已改用 renderEntries
   * 每条是一个完整的叙事块
   */
  renderRecords(
    records: CombatRecord[],
    participants: Map<string, { name: string; currentHealth: number; maxHealth: number; side?: string }>,
  ): LogSegment[][] {
    if (records.length === 0) return []

    // 初始化 HP + 阵营
    for (const [id, p] of participants) {
      this.hpTracker.init(id, p.currentHealth, p.maxHealth, p.name)
      if (p.side === 'ally' || p.side === 'enemy') {
        this.hpTracker.setSide(id, p.side)
      } else {
        // 从 ID 前缀推断阵营
        const inferredSide = id.startsWith('enemy') ? 'enemy' : (id.startsWith('ally') ? 'ally' : undefined)
        if (inferredSide) this.hpTracker.setSide(id, inferredSide)
      }
    }

    // 按回合分组
    const byTurn = new Map<number, CombatRecord[]>()
    const sortedTurns: number[] = []
    for (const r of records) {
      if (!byTurn.has(r.turn)) {
        byTurn.set(r.turn, [])
        sortedTurns.push(r.turn)
      }
      byTurn.get(r.turn)!.push(r)
    }
    sortedTurns.sort((a, b) => a - b)

    const result: LogSegment[][] = []

    // 战斗初始化块
    result.push(...this.renderBattleHeader())

    for (let ti = 0; ti < sortedTurns.length; ti++) {
      const turn = sortedTurns[ti]
      const turnRecords = byTurn.get(turn)!

      // 回合装饰线 + 标题
      const isLast = ti === sortedTurns.length - 1
      const annotation = this.detectTurnAnnotation(turnRecords, ti, sortedTurns.length)
      result.push(...this.renderRoundHeader(turn, annotation))

      // 分离 DOT / 常规行动 / 系统记录
      const dotRecords: CombatRecord[] = []
      const actionRecords: CombatRecord[] = []
      const systemRecords: CombatRecord[] = []
      let specialLines: string[] = []

      for (const r of turnRecords) {
        if (r.damageSource === 'dot') {
          dotRecords.push(r)
        } else if (r.actorId === 'system' || r.actorId.startsWith('system')) {
          if (r.message || r.effects?.length > 0) {
            systemRecords.push(r)
          }
        } else {
          actionRecords.push(r)
        }

        // 检测特殊效果（免疫/不屈/分担）
        if (r.effects) {
          for (const e of r.effects) {
            if (e.effectTag === 'immune') {
              specialLines.push(`✦ ${e.description}`)
            } else if (e.effectTag === 'unyielding') {
              specialLines.push(`✦ ${e.description}`)
            } else if (e.effectTag === 'share') {
              specialLines.push(`├ ${e.description}`)
            }
          }
        }
      }

      // 条件激活块
      if (systemRecords.length > 0) {
        result.push(...this.renderSystemBlock(systemRecords))
      }

      // 按 actorId 分组常规行动
      const byActor = new Map<string, CombatRecord[]>()
      for (const r of actionRecords) {
        if (!byActor.has(r.actorId)) byActor.set(r.actorId, [])
        byActor.get(r.actorId)!.push(r)
      }

      // 常规行动
      for (const [, actorRecords] of byActor) {
        const blocks = this.buildBlocks(actorRecords, turn)
        for (const block of blocks) {
          result.push(this.renderBlock(block, turn))
        }
      }

      // 特殊效果行（免疫/不屈/分担）
      for (const line of specialLines) {
        result.push([{ text: `  ${line}`, classStr: 'log-crit' }])
      }

      // 回合结算（DOT）
      if (dotRecords.length > 0) {
        result.push([{ text: `  ── 回合结算 ──`, classStr: 'log-system' }])
        for (const dot of dotRecords) {
          const blocks = this.buildBlocks([dot], turn)
          for (const block of blocks) {
            result.push(this.renderBlock(block, turn))
          }
        }
      }

      // 回合态势快照
      result.push(this.renderSnapshot(turn))

      // 回合间分隔线
      if (ti < sortedTurns.length - 1 || isLast) {
        result.push(this.renderTurnSeparator())
      }
    }

    // 战斗结束摘要
    const summary = this.computeSummary(records, byTurn)
    result.push(...this.renderBattleSummary(summary))

    return result
  }

  /** 探测回合标注 */
  private detectTurnAnnotation(
    records: CombatRecord[],
    turnIndex: number,
    totalTurns: number,
  ): string | undefined {
    let hasKill = false
    let hasCrit = false
    let passiveCount = 0
    let immunityCount = 0

    for (const r of records) {
      if (r.damage > 0) {
        const hp = this.hpTracker.getHp(r.targetId)
        if (hp && hp.current - r.damage <= 0) hasKill = true
      }
      if (r.damageBreakdown?.isCritical) hasCrit = true
      if (r.effects?.some((e) => e.effectTag === 'immune')) immunityCount++
      // 粗略检测被动触发：多个 actor 在同一回合行动且含 damage 辅助效果
      if (r.skillName?.includes('被动') || r.message?.includes('触发')) passiveCount++
    }

    if (turnIndex === totalTurns - 1) return '终结'
    if (hasKill && immunityCount > 0) return '致命保护!'
    if (hasKill) return '击杀!'
    if (hasCrit && passiveCount > 2) return '多重触发'
    return undefined
  }

  /** 渲染战斗初始化 */
  private renderBattleHeader(): LogSegment[][] {
    return [
      [{ text: '═══════════════════════════════════════════════════════════', classStr: 'log-system' }],
      [{ text: '  战斗开始', classStr: 'log-system' }],
      [{ text: '═══════════════════════════════════════════════════════════', classStr: 'log-system' }],
    ]
  }

  /** 渲染回合标题 */
  private renderRoundHeader(turn: number, annotation?: string): LogSegment[][] {
    const lines: LogSegment[][] = []
    lines.push([{ text: '───────────────────────────────────────────────────────────', classStr: 'log-system' }])

    const title = annotation ? `  第 ${turn} 回合  ·  ${annotation}` : `  第 ${turn} 回合`
    lines.push([{ text: title, classStr: 'log-system' }])
    lines.push([{ text: '───────────────────────────────────────────────────────────', classStr: 'log-system' }])

    return lines
  }

  /** 渲染系统/条件信息块 */
  private renderSystemBlock(records: CombatRecord[]): LogSegment[][] {
    const lines: LogSegment[][] = []
    const messages = records
      .map((r) => r.effects?.map((e) => e.description).filter(Boolean).join('；') || r.message)
      .filter(Boolean)

    if (messages.length > 0) {
      lines.push([{ text: `  【条件激活】`, classStr: 'log-info' }])
      for (const msg of messages) {
        lines.push([{ text: `    ${msg}`, classStr: 'log-text' }])
      }
    }
    return lines
  }

  /** 渲染回合间分隔线 */
  private renderTurnSeparator(): LogSegment[] {
    return [{ text: '', classStr: 'log-system' }]
  }

  /** 计算战斗摘要 */
  private computeSummary(
    records: CombatRecord[],
    byTurn: Map<number, CombatRecord[]>,
  ): {
    totalDamage: number
    totalHeal: number
    critCount: number
    killCount: number
    totalTurns: number
    mvpName: string
    mvpDamage: number
    mvpKills: number
    mvpCrits: number
  } {
    let totalDamage = 0
    let totalHeal = 0
    let critCount = 0
    let killCount = 0
    const damageByActor = new Map<string, { damage: number; kills: number; crits: number; name: string }>()

    for (const r of records) {
      totalDamage += r.damage
      totalHeal += r.heal ?? 0
      if (r.damageBreakdown?.isCritical) critCount++

      // 击杀检测
      if (r.damage > 0) {
        const hp = this.hpTracker.getHp(r.targetId)
        if (hp && hp.current - r.damage <= 0) killCount++
      }

      // 按角色累积伤害
      if (r.actorId !== 'system' && r.damage > 0) {
        if (!damageByActor.has(r.actorId)) {
          damageByActor.set(r.actorId, { damage: 0, kills: 0, crits: 0, name: r.actorName })
        }
        const entry = damageByActor.get(r.actorId)!
        entry.damage += r.damage
        if (r.damageBreakdown?.isCritical) entry.crits++
        // 击杀
        const hp = this.hpTracker.getHp(r.targetId)
        if (hp && hp.current - r.damage <= 0) entry.kills++
      }
    }

    // MVP
    let mvpName = ''
    let mvpDamage = 0
    let mvpKills = 0
    let mvpCrits = 0
    for (const [, entry] of damageByActor) {
      if (entry.damage > mvpDamage) {
        mvpName = entry.name
        mvpDamage = entry.damage
        mvpKills = entry.kills
        mvpCrits = entry.crits
      }
    }

    return {
      totalDamage,
      totalHeal,
      critCount,
      killCount,
      totalTurns: byTurn.size,
      mvpName,
      mvpDamage,
      mvpKills,
      mvpCrits,
    }
  }

  /** 渲染战斗结束摘要 */
  private renderBattleSummary(summary: {
    totalDamage: number
    totalHeal: number
    critCount: number
    killCount: number
    totalTurns: number
    mvpName: string
    mvpDamage: number
    mvpKills: number
    mvpCrits: number
  }): LogSegment[][] {
    const lines: LogSegment[][] = []

    lines.push([{ text: '═══════════════════════════════════════════════════════════', classStr: 'log-system' }])
    lines.push([{ text: `  战斗结束  ·  我方胜利  ·  ${summary.totalTurns} 回合`, classStr: 'log-system' }])
    lines.push([{ text: '═══════════════════════════════════════════════════════════', classStr: 'log-system' }])
    lines.push([{ text: '', classStr: 'log-system' }])
    lines.push([{ text: '  ── 战报摘要 ──', classStr: 'log-system' }])
    lines.push([
      { text: `  总伤害 ${summary.totalDamage} · 总治疗 ${summary.totalHeal} · 暴击 ${summary.critCount} 次 · 击杀 ${summary.killCount}`, classStr: 'log-text' },
    ])
    if (summary.mvpName) {
      lines.push([
        { text: `  MVP: ${summary.mvpName} — 总伤害 ${summary.mvpDamage}, 击杀 ${summary.mvpKills}, 暴击 ${summary.mvpCrits}`, classStr: 'log-friendly' },
      ])
    }

    return lines
  }

  /**
   * 从同一角色的一次行动记录构建叙事块
   */
  private buildBlocks(records: CombatRecord[], turn: number): NarrativeBlock[] {
    if (records.length === 0) return []

    const blocks: NarrativeBlock[] = []

    for (const record of records) {
      const actorName = record.actorName
      const targetName = record.targetName ?? '未知'
      const actionName = record.skillName || '普通攻击'
      const skillId = record.skillId || record.skillName || undefined
      const bd = record.damageBreakdown
      const isCrit = bd?.isCritical ?? false
      const damage = record.damage
      const heal = record.heal ?? 0
      const isKill = damage > 0 && this.isFatal(record.targetId, damage)

      // 追踪 HP
      this.hpTracker.applyDamage(record.targetId, damage)
      this.hpTracker.applyHeal(record.targetId, heal)

      const targetHp = this.hpTracker.getHp(record.targetId)
      const targetHpBefore = targetHp ? targetHp.current + damage : undefined
      const targetHpAfter = targetHp?.current

      const highlights: Highlight[] = []
      if (isCrit) highlights.push('crit')
      if (isKill) highlights.push('kill')

      // 伤害类型
      let damageType: string | undefined
      if (bd?.damageCategory === 'physical') damageType = '物理伤害'
      else if (bd?.damageCategory === 'elemental') damageType = '元素伤害'
      else if (bd?.damageCategory === 'true') damageType = '真实伤害'

      blocks.push({
        turn,
        actor: actorName,
        actorId: record.actorId,
        target: targetName,
        targetId: record.targetId,
        actionName,
        skillId,
        damageSource: record.damageSource,
        isAction: true,
        damage,
        heal,
        damageType,
        targetHpBefore,
        targetHpAfter,
        passives: [],
        highlights,
        isKill,
        isCrit,
      })
    }

    return blocks
  }

  /** 判断伤害是否致命 */
  private isFatal(targetId: string, damage: number): boolean {
    const hp = this.hpTracker.getHp(targetId)
    if (!hp) return false
    return hp.current - damage <= 0
  }

  /**
   * 将单个叙事块渲染为 LogSegment[]
   */
  private renderBlock(block: NarrativeBlock, _turn: number): LogSegment[] {
    const segs: LogSegment[] = []

    // DOT 伤害 — 特殊格式：无 ◆ 图标，显示为"actor 效果名 -XHP"
    if (block.damageSource === 'dot') {
      segs.push({ text: `  ${block.target} `, classStr: 'log-hostile' })
      segs.push({ text: `${block.actionName} -${block.damage}HP`, classStr: 'log-damage' })
      if (block.targetHpAfter != null) {
        segs.push({ text: ` → ${block.targetHpAfter}`, classStr: 'log-text' })
      }
      return segs
    }

    // 反伤 — 特殊格式
    if (block.damageSource === 'thorns') {
      segs.push({ text: `  ${block.actionName} 反弹 `, classStr: 'log-passive' })
      segs.push({ text: `${block.damage}`, classStr: 'log-damage' })
      segs.push({ text: ` 点${block.damageType || '物理伤害'}`, classStr: 'log-text' })
      segs.push({ text: ` → `, classStr: 'log-text' })
      segs.push({ text: block.actor, classStr: 'log-friendly' })
      if (block.targetHpBefore != null && block.targetHpAfter != null) {
        segs.push({ text: ` ${block.targetHpBefore}`, classStr: 'log-text' })
        segs.push({ text: ` → `, classStr: 'log-text' })
        segs.push({ text: `${block.targetHpAfter}`, classStr: 'log-text' })
      }
      return segs
    }

    // 攻击行动行（常规行动）
    segs.push({ text: `◆ `, classStr: 'log-text' })
    segs.push({ text: block.actor, classStr: 'log-friendly' })
    segs.push({ text: ` → `, classStr: 'log-text' })
    segs.push({ text: block.target, classStr: 'log-hostile' })

    // 技能名 — 有 skillId 时可悬浮，否则普通着色
    if (block.skillId && this.skillLookup) {
      segs.push({ text: `「`, classStr: 'log-text' })
      segs.push(skillSegment(block.skillId, this.skillLookup))
      segs.push({ text: `」`, classStr: 'log-text' })
    } else {
      segs.push({ text: `「${block.actionName}」`, classStr: 'log-skill' })
    }

    // 伤害/治疗行
    if (block.damage > 0) {
      if (block.isCrit) {
        segs.push({ text: `\n  ★ 暴击! `, classStr: 'log-crit' })
        segs.push({ text: `${block.damage}`, classStr: 'log-crit' })
      } else {
        segs.push({ text: `\n  `, classStr: 'log-text' })
        segs.push({ text: `${block.damage}`, classStr: 'log-damage' })
      }
      segs.push({ text: ` 点${block.damageType || '物理伤害'}`, classStr: 'log-text' })

      // HP 变化
      if (block.targetHpBefore != null && block.targetHpAfter != null) {
        segs.push({ text: `  `, classStr: 'log-text' })
        segs.push({ text: block.target, classStr: 'log-hostile' })
        segs.push({ text: ` ${block.targetHpBefore}`, classStr: 'log-text' })
        segs.push({ text: ` → `, classStr: 'log-text' })
        segs.push({ text: `${block.targetHpAfter}`, classStr: block.targetHpAfter === 0 ? 'log-crit' : 'log-text' })
      }
    }

    if (block.heal > 0) {
      segs.push({ text: `\n  `, classStr: 'log-text' })
      segs.push({ text: `+${block.heal}`, classStr: 'log-heal' })
      segs.push({ text: ` HP`, classStr: 'log-text' })
    }

    // 击杀高光
    if (block.isKill) {
      segs.push({ text: `\n  ✦ 击杀!`, classStr: 'log-crit' })
    }

    // 已触发的被动
    for (const p of block.passives) {
      segs.push({ text: `\n  ├ `, classStr: 'log-text' })
      segs.push({ text: `【${p.name}】`, classStr: 'log-passive' })
      segs.push({ text: ` ${p.effect}`, classStr: 'log-text' })
    }

    return segs
  }

  /**
   * 渲染回合末态势快照
   */
  private renderSnapshot(turn: number): LogSegment[] {
    const segs: LogSegment[] = []
    segs.push({ text: `\n── 态势 ──`, classStr: 'log-system' })

    const allHp = this.hpTracker.getAll()
    const allies: string[] = []
    const enemies: string[] = []

    for (const [id, hp] of allHp) {
      const pct = hp.current / hp.max
      const warning = pct < 0.3 ? ' ⚠' : ''
      const name = hp.name ?? id
      const line = `${name} ${hp.current}/${hp.max}${warning}`
      const side = this.hpTracker.getSide(id)
      if (side === 'enemy') {
        enemies.push(line)
      } else {
        allies.push(line)
      }
    }

    if (allies.length > 0) {
      segs.push({ text: `\n  我方  `, classStr: 'log-text' })
      segs.push({ text: allies.join(' · '), classStr: 'log-friendly' })
    }
    if (enemies.length > 0) {
      segs.push({ text: `\n  敌方  `, classStr: 'log-text' })
      segs.push({ text: enemies.join(' · '), classStr: 'log-hostile' })
    }

    return segs
  }
}
