/**
 * 场地效果管理器 — 管理天气/地形/场地效果的生命周期
 *
 * 约束 C2：不走 DI，BattleSystem 构造函数内直接创建。
 * 约束 C1：不修改 BattleEntity 接口，所有状态由本管理器维护。
 */
import type { FieldEffectConfig } from '@/shared/types/scene'
import { type BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { floor } from '@/shared/utils/math'

interface ActiveEffect {
  config: FieldEffectConfig
  remainingTurns: number
}

export class FieldEffectManager {
  private effects: ActiveEffect[] = []
  private static readonly SOURCE_PREFIX = 'field:'

  loadFromScene(fieldEffects: FieldEffectConfig[]): void {
    this.effects = fieldEffects.map(config => ({
      config,
      remainingTurns: config.duration,
    }))
  }

  getActiveEffects(): ActiveEffect[] {
    return this.effects.filter(e => e.remainingTurns !== 0)
  }

  getElementalModifier(elementType: string): number {
    let total = 0
    for (const eff of this.getActiveEffects()) {
      if (eff.config.type !== 'elemental' || !eff.config.elemental) continue
      const elem = eff.config.elemental
      if (elem.bonusElements?.includes(elementType)) total += elem.percent
      if (elem.resistElements?.includes(elementType)) total -= elem.percent
    }
    return total
  }

  applyModifiers(
    participants: Map<string, BattleEntity>,
    buffSystem: BuffSystem,
  ): void {
    for (const eff of this.getActiveEffects()) {
      if (eff.config.type !== 'modifier' || !eff.config.modifiers) continue
      const targets = this.filterByFaction(participants, eff.config.faction)
      for (const target of targets) {
        const stack = buffSystem.getModifierStack(target.id)
        for (const mod of eff.config.modifiers) {
          stack.addModifier(
            `${FieldEffectManager.SOURCE_PREFIX}${eff.config.id}`,
            mod.attribute as ATTRIBUTE_CODE,
            mod.value,
            mod.type as ModifierType,
          )
        }
      }
    }
  }

  triggerPeriodic(
    phase: 'turn_start' | 'turn_end',
    participants: Map<string, BattleEntity>,
    buffSystem: BuffSystem,
  ): void {
    for (const eff of this.getActiveEffects()) {
      if (eff.config.type !== 'periodic' || !eff.config.periodic) continue
      if (eff.config.periodic.phase !== phase) continue
      const targets = this.filterByFaction(participants, eff.config.faction)
      for (const target of targets) {
        if (!target.isAlive()) continue
        const p = eff.config.periodic
        if (p.effect === 'damage') {
          const dmg = p.isPercent
            ? floor(target.getAttribute(ATTRIBUTE_CODE.maxHealth) * p.value / 100)
            : p.value
          buffSystem.requestDamage(target.id, dmg, undefined, undefined, 'trigger')
        } else if (p.effect === 'heal') {
          const heal = p.isPercent
            ? floor(target.getAttribute(ATTRIBUTE_CODE.maxHealth) * p.value / 100)
            : p.value
          buffSystem.requestHeal(target.id, heal)
        } else if (p.effect === 'energy') {
          target.gainEnergy(p.value)
        }
      }
    }
  }

  tick(): void {
    for (const eff of this.effects) {
      if (eff.remainingTurns > 0) eff.remainingTurns--
    }
    this.effects = this.effects.filter(e => e.remainingTurns !== 0)
  }

  /** 移除所有场地修饰符（resetBattle 时调用，修复 S1） */
  removeAll(
    participants: Map<string, BattleEntity>,
    buffSystem: BuffSystem,
  ): void {
    for (const eff of this.effects) {
      if (eff.config.type !== 'modifier') continue
      const targets = this.filterByFaction(participants, eff.config.faction)
      for (const target of targets) {
        const stack = buffSystem.getModifierStack(target.id)
        stack.removeModifier(`${FieldEffectManager.SOURCE_PREFIX}${eff.config.id}`)
      }
    }
    this.reset()
  }

  reset(): void {
    this.effects = []
  }

  private filterByFaction(
    participants: Map<string, BattleEntity>,
    faction: 'all' | 'ally' | 'enemy',
  ): BattleEntity[] {
    return Array.from(participants.values()).filter(p => {
      if (faction === 'all') return true
      return p.team === faction
    })
  }
}
