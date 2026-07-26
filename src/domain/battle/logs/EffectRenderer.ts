import type { BattleEffect, BattleEntity } from '@/domain/battle/type/types'
import type { LogSegment } from '@/shared/types/battle-log'
import { EffectType } from '@/shared/types/effect'

/**
 * 渲染上下文 — 提供执行来源、目标和 HP 快照
 */
export interface RenderContext {
  /** 效果来源实体（施法者/受击者） */
  source: BattleEntity
  /** 效果目标实体列表 */
  targets: BattleEntity[]
  /** 获取实体名称的函数 */
  getEntityName: (id: string) => string
  /** HP 快照（执行前的值 → 执行后的值） */
  hpSnapshots: Map<string, { before: number; after: number }>
}

/**
 * EffectRenderer — 纯函数渲染器
 *
 * 职责：将结构化 BattleEffect[] 无脑翻译为 LogSegment[]。
 * - 不依赖外部状态（BuffSystem、EventBus、全局缓存）
 * - 所有文本排版逻辑唯一集中于此
 * - 对每个 effect 独立渲染，用逗号隔开
 */
export class EffectRenderer {
  /**
   * 将结构化的 effects 渲染为 LogSegment[]
   */
  render(effects: BattleEffect[], ctx: RenderContext): LogSegment[] {
    const segments: LogSegment[] = []

    for (const effect of effects) {
      const rendered = this.renderSingleEffect(effect, ctx)
      if (rendered.length > 0) {
        if (segments.length > 0) segments.push({ text: '，' })
        segments.push(...rendered)
      }
    }

    return segments.length > 0 ? segments : [{ text: '生效', classStr: 'log-info' }]
  }

  private renderSingleEffect(effect: BattleEffect, ctx: RenderContext): LogSegment[] {
    const targetName = effect.targetId ? ctx.getEntityName(effect.targetId) : '未知'
    const snapshot = effect.targetId ? ctx.hpSnapshots.get(effect.targetId) : undefined

    switch (effect.type) {
      case EffectType.DAMAGE:
        return this.renderDamage(effect, targetName, snapshot)
      case EffectType.HEAL:
        return this.renderHeal(effect, targetName, snapshot)
      case EffectType.DRAIN:
        return this.renderDrain(effect, ctx, snapshot)
      case EffectType.REFLECT:
        return this.renderReflect(effect, ctx, snapshot)
      case EffectType.BUFF:
      case EffectType.DEBUFF:
        return this.renderBuff(effect, targetName)
      case EffectType.SHIELD:
        return this.renderShield(effect, targetName)
      case EffectType.MISS:
        return this.renderMiss(effect, targetName)
      case EffectType.STATUS:
      case EffectType.CRITICAL:
      case EffectType.SPECIAL:
      default:
        return effect.description ? [{ text: effect.description }] : []
    }
  }

  // --- 具体渲染逻辑 ---

  /**
   * 渲染伤害：对 {name} 造成 {damage} 点伤害
   */
  private renderDamage(
    e: BattleEffect,
    name: string,
    snap?: { before: number; after: number },
  ): LogSegment[] {
    const dmg = Math.round(e.damage ?? e.value ?? 0)
    const segs: LogSegment[] = [
      { text: `对 ${name} 造成 ` },
      { text: `${dmg}`, classStr: 'log-damage' },
      { text: ' 点伤害' },
    ]
    if (e.isCritical) {
      segs.push({ text: ' (暴击)', classStr: 'log-crit' })
    }
    if (e.shieldAbsorbed && e.shieldAbsorbed > 0) {
      segs.push({ text: ` (护盾吸收 ${Math.round(e.shieldAbsorbed)})`, classStr: 'log-shield' })
    }
    if (snap) segs.push(...this.renderHpArrow(snap))
    return segs
  }

  /**
   * 渲染治疗：{name} 恢复 {heal} 点气血
   */
  private renderHeal(
    e: BattleEffect,
    name: string,
    snap?: { before: number; after: number },
  ): LogSegment[] {
    const heal = Math.round(e.heal ?? e.value ?? 0)
    const segs: LogSegment[] = [
      { text: `${name} 恢复 ` },
      { text: `${heal}`, classStr: 'log-heal' },
      { text: ' 点气血' },
    ]
    if (e.overflow && e.overflow > 0) {
      segs.push({ text: ` (溢出 ${Math.round(e.overflow)})`, classStr: 'log-info' })
    }
    if (snap) segs.push(...this.renderHpArrow(snap))
    return segs
  }

  /**
   * 渲染吸血：吸取 {target} {damage} 生命，{source} 恢复 {heal} 气血
   */
  private renderDrain(
    e: BattleEffect,
    ctx: RenderContext,
    _snap?: { before: number; after: number },
  ): LogSegment[] {
    const targetName = ctx.getEntityName(e.targetId!)
    const sourceName = ctx.getEntityName(e.sourceId!)
    const dmg = Math.round(e.damage ?? e.value ?? 0)
    const heal = Math.round(e.heal ?? 0)
    const segs: LogSegment[] = [
      { text: `吸取 ${targetName} ` },
      { text: `${dmg}`, classStr: 'log-damage' },
      { text: ` 生命，${sourceName} 恢复 ` },
      { text: `${heal}`, classStr: 'log-heal' },
      { text: ' 气血' },
    ]
    if (e.overflow && e.overflow > 0) {
      segs.push({ text: ` (溢出 ${Math.round(e.overflow)})`, classStr: 'log-info' })
    }
    return segs
  }

  /**
   * 渲染反伤：反弹 {damage} 点伤害给 {attacker}
   */
  private renderReflect(
    e: BattleEffect,
    ctx: RenderContext,
    snap?: { before: number; after: number },
  ): LogSegment[] {
    const attackerName = ctx.getEntityName(e.targetId!) // 反伤的目标是攻击者
    const dmg = Math.round(e.damage ?? e.value ?? 0)
    const segs: LogSegment[] = [
      { text: `反弹 ` },
      { text: `${dmg}`, classStr: 'log-damage' },
      { text: ` 点伤害给 ${attackerName}` },
    ]
    if (snap) segs.push(...this.renderHpArrow(snap))
    return segs
  }

  /**
   * 渲染 Buff：附加【{buffName}】
   */
  private renderBuff(e: BattleEffect, _name: string): LogSegment[] {
    const displayName = e.buffName ?? e.buffId ?? '未知效果'
    const segs: LogSegment[] = [
      { text: `附加 `, classStr: 'log-info' },
      {
        text: `【${displayName}】`,
        classStr: 'log-buff',
        hover: e.buffId ? { kind: 'buff', id: e.buffId } : undefined,
      },
    ]
    if (e.stacks && e.stacks > 1) {
      segs.push({ text: ` (${e.stacks}层)` })
    }
    if (e.duration && e.duration > 0) {
      segs.push({ text: ` ${e.duration}回合` })
    }
    return segs
  }

  /**
   * 渲染护盾：{name} 获得 {value} 点护盾
   */
  private renderShield(e: BattleEffect, name: string): LogSegment[] {
    const shieldVal = Math.round(e.value ?? 0)
    return [
      { text: `${name} 获得 ` },
      { text: `${shieldVal}`, classStr: 'log-shield' },
      { text: ' 点护盾' },
    ]
  }

  /**
   * 渲染未命中：{name} 闪避了攻击
   */
  private renderMiss(e: BattleEffect, name: string): LogSegment[] {
    return [{ text: `${name} 闪避了攻击`, classStr: 'log-info' }]
  }

  // --- 辅助方法 ---

  /**
   * 渲染 HP 变化箭头：{before} → {after}
   */
  private renderHpArrow(snap: { before: number; after: number }): LogSegment[] {
    if (snap.before === snap.after) return []
    return [
      { text: '  ' },
      { text: `${Math.round(snap.before)}`, classStr: 'log-hp' },
      { text: ' → ', classStr: 'log-info' },
      { text: `${Math.round(snap.after)}`, classStr: 'log-warning' },
    ]
  }
}
