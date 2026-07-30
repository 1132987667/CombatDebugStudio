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
 * 职责：将 JSON 配置解析为运行时 ResolvedBuffConfig，
 * 核心产出是 effectPlan 数组——一个 Buff 可包含多个原子效果原语。
 *
 * 契约：
 * - effects[] 字段是唯一的声明方式
 * - triggers 字段保持不变，走现有 TriggerEventBus
 * - 脚本类 Buff（selfContained）的 effectPlan 为空数组，脚本自行管理
 * - 旧字段（attributes / controlType / immunities / aura）不再被识别
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

    const rawEffects: Array<{ type: string; params: Record<string, unknown> }> =
      raw.effects ?? []
    for (const rawEffect of rawEffects) {
      const handler = this.registry.get(rawEffect.type as AtomicEffectType)
      if (!handler) {
        throw new Error(
          `[BuffConfigResolver] ${raw.id ?? 'unknown'}: 未知原子效果类型 "${rawEffect.type}"`
        )
      }
      plan.push({
        type: rawEffect.type as AtomicEffectType,
        handler,
        params: rawEffect.params ?? {},
      })
    }

    // 不兼容旧格式——没有 effects[] 就是空 plan
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
      dispellable: raw.dispellable ?? true,
      tags: raw.tags ?? [],
      immunities: raw.immunities ?? undefined,
      parameters: raw.parameters ?? undefined,
      attributes: raw.attributes ?? undefined,
      triggers: raw.triggers ?? undefined,
    }
  }
}
