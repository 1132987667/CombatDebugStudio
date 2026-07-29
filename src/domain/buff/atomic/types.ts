import type { BuffContext } from '@/domain/buff/BuffContext'
import type { BuffEffectLine } from '@/domain/buff/types'

/**
 * 原子效果类型 — 不可再分的效果原语 + immunity
 */
export const AtomicEffectType = {
  MODIFIER: 'modifier', // 属性修正
  DOT: 'dot', // 持续伤害
  HEAL: 'heal', // 持续治疗
  CONTROL: 'control', // 控制（眩晕/沉默/冰冻等）
  SHIELD: 'shield', // 护盾
  TRIGGER: 'trigger', // 条件触发（受击反伤、击杀回血等）
  AURA: 'aura', // 光环（影响队友/敌人）
  IMMUNITY: 'immunity', // 免疫
  SUMMON: 'summon', // 召唤
  THORNS: 'thorns', // 荆棘|反伤
} as const
export type AtomicEffectType =
  (typeof AtomicEffectType)[keyof typeof AtomicEffectType]

/** 原子效果统一接口 */
export interface IAtomicEffect {
  /** 效果类型标识 */
  readonly type: AtomicEffectType

  /** 施加时调用 */
  onApply(ctx: BuffContext, params: Record<string, unknown>): void

  /** 移除时调用（清理修饰符/状态） */
  onRemove(ctx: BuffContext, params: Record<string, unknown>): void

  /** 每回合更新（DOT/HEAL 用） */
  onTick?(ctx: BuffContext, params: Record<string, unknown>, turn: number): void

  /** 层数变化时调用（重新计算修饰符值） */
  onStackChange?(
    ctx: BuffContext,
    params: Record<string, unknown>,
    newStacks: number,
  ): void

  /** 生成 UI 显示文本 */
  getEffectLines?(
    ctx: BuffContext,
    params: Record<string, unknown>,
  ): BuffEffectLine[]
}
