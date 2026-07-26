import type { IAtomicEffect, AtomicEffectType } from './types'
import { AtomicEffectRegistry } from './AtomicEffectRegistry'
import type { BuffConfig, StackRule, ControlType } from '@/domain/buff/types'

/** 解析后的运行时效果计划 */
export interface ResolvedEffectPlan {
  type: AtomicEffectType
  handler: IAtomicEffect
  params: Record<string, unknown>
}

/**
 * 解析后的完整 Buff 运行时配置
 * 在 BuffConfig 基础上附加 effectPlan，供 BuffSystem 驱动原子效果
 */
export interface ResolvedBuffConfig extends BuffConfig {
  /** 原子效果执行计划（有序） */
  effectPlan: ResolvedEffectPlan[]
}

/**
 * Buff 配置解析器
 *
 * 职责：将 JSON 配置（或旧格式配置）解析为运行时 ResolvedBuffConfig，
 * 核心产出是 effectPlan 数组——一个 Buff 可包含多个原子效果原语。
 *
 * 向后兼容策略：
 * - effects[] 字段存在时优先使用
 * - 不存在时从旧字段（attributes / controlType / immunities / aura）自动派生
 * - triggers 字段保持不变，走现有 TriggerEventBus
 * - 脚本类 Buff（selfContained）的 effectPlan 为空数组，脚本自行管理
 */
export class BuffConfigResolver {
  constructor(private registry: AtomicEffectRegistry) {}

  /**
   * 将原始配置解析为运行时配置
   * 可在 BuffScriptRegistry.loadBuffConfigs 之后调用
   */
  resolve(raw: Record<string, any>): ResolvedBuffConfig {
    const effectPlan = this.buildEffectPlan(raw)

    return {
      ...this.buildBaseConfig(raw),
      effectPlan,
    }
  }

  private buildEffectPlan(raw: Record<string, any>): ResolvedEffectPlan[] {
    const plan: ResolvedEffectPlan[] = []

    // 1. 优先从 effects 数组解析
    const rawEffects: Array<{ type: string; params: Record<string, unknown> }> =
      raw.effects ?? []
    for (const rawEffect of rawEffects) {
      const handler = this.registry.get(rawEffect.type as AtomicEffectType)
      if (!handler) {
        console.warn(`[BuffConfigResolver] 未知原子效果类型: ${rawEffect.type}`)
        continue
      }
      plan.push({
        type: rawEffect.type as AtomicEffectType,
        handler,
        params: rawEffect.params ?? {},
      })
    }
    if (plan.length > 0) return plan // effects 存在时优先使用，不派生

    // 2. 兼容旧格式：从 attributes 字段自动生成 modifier 效果
    if (raw.attributes && Object.keys(raw.attributes).length > 0) {
      const modifierHandler = this.registry.get('modifier')
      if (modifierHandler) {
        plan.push({
          type: 'modifier',
          handler: modifierHandler,
          params: { attributes: raw.attributes, perStack: true },
        })
      }
    }

    // 3. 兼容旧格式：从 controlType 字段自动生成 control 效果
    if (raw.controlType && raw.controlType !== 'none' && raw.controlType !== 'NONE') {
      const controlHandler = this.registry.get('control')
      if (controlHandler) {
        plan.push({
          type: 'control',
          handler: controlHandler,
          params: {
            controlType: raw.controlType,
            priority: raw.controlPriority ?? 50,
          },
        })
      }
    }

    // 4. 兼容旧格式：从 immunities 字段自动生成 immunity 效果
    if (raw.immunities?.length > 0) {
      const immunityHandler = this.registry.get('immunity')
      if (immunityHandler) {
        plan.push({
          type: 'immunity',
          handler: immunityHandler,
          params: { tags: raw.immunities },
        })
      }
    }

    // 5. 兼容旧格式：从 aura 字段自动生成 aura 效果
    if (raw.aura) {
      const auraHandler = this.registry.get('aura')
      if (auraHandler) {
        plan.push({
          type: 'aura',
          handler: auraHandler,
          params: raw.aura,
        })
      }
    }

    return plan
  }

  private buildBaseConfig(raw: Record<string, any>): BuffConfig {
    return {
      id: raw.id,
      name: raw.name ?? raw.id,
      description: raw.description ?? '',
      duration: raw.duration ?? 1,
      maxStacks: raw.maxStacks ?? 1,
      cooldown: raw.cooldown ?? 0,
      stackRule: (raw.stackRule ?? 'LIMITED') as StackRule,
      controlType: (raw.controlType ?? 'NONE') as ControlType,
      controlPriority: raw.controlPriority ?? 0,
      isDebuff: raw.isDebuff ?? false,
      dispellable: raw.dispellable ?? true,
      tags: raw.tags ?? [],
      immuneTags: raw.immuneTags ?? raw.immunities ?? undefined,
      parameters: raw.parameters ?? undefined,
      attributes: raw.attributes ?? undefined,
      triggers: raw.triggers ?? undefined,
    }
  }
}
