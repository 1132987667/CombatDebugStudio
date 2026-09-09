import { type IAtomicEffect, AtomicEffectType } from './types'
import { AtomicEffectRegistry } from './AtomicEffectRegistry'
import type { BuffConfig, StackRule, ControlType, TriggerAction } from '@/domain/buff/types'
import type { BuffPolarity } from '@/shared/types/buff-classification'
import type { AttributeValueConfig, BuffJsonEntry } from '@/shared/types/buffs-json'
import { getAttrName, type ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { normalizeTriggerPhase } from '@/domain/battle/type/types'

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
  /** 显式声明的极性（缺失时由 controlType/tags 推导，推导失败抛错） */
  polarity: BuffPolarity
  /** 执行模式（'script' 由注册表脚本信息补充，此处推导数据侧模式） */
  executionMode: 'effectPlan' | 'triggerOnly' | 'marker'
  /** 效果摘要文本（解析时从 effectPlan/时长派生，供日志与 UI 直接读取） */
  effectSummary: string
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
  resolve(raw: BuffJsonEntry): ResolvedBuffConfig {
    const effectPlan = this.buildEffectPlan(raw)
    const base = this.buildBaseConfig(raw)
    const effectSummary = this.buildEffectSummary(raw, effectPlan)

    return {
      ...base,
      effectPlan,
      polarity: this.derivePolarity(raw),
      executionMode: this.deriveExecutionMode(raw),
      effectSummary,
      // 描述缺失时由解析器自动生成，下游不再做运行时三级回退
      description: base.description.trim() || effectSummary,
    }
  }

  /** 推导数据侧执行模式：有效果 → effectPlan；仅触发器 → triggerOnly；否则 → marker */
  private deriveExecutionMode(
    raw: BuffJsonEntry,
  ): 'effectPlan' | 'triggerOnly' | 'marker' {
    if (raw.effects?.length) return 'effectPlan'
    if (raw.triggers?.length) return 'triggerOnly'
    return 'marker'
  }

  /** 推导显式极性：配置声明优先（校验值域），缺失时从 controlType/tags 推导，仍失败则抛错 */
  private derivePolarity(raw: BuffJsonEntry): BuffPolarity {
    const VALID = ['positive', 'negative', 'neutral', 'mixed']
    if (raw.polarity) {
      if (!VALID.includes(raw.polarity)) {
        throw new Error(
          `[BuffConfigResolver] ${raw.id ?? 'unknown'}: polarity "${raw.polarity}" 非法，须为 positive/negative/neutral/mixed`
        )
      }
      return raw.polarity as BuffPolarity
    }
    // buffs.json 的 controlType 值域为 ControlKind（状态码），无 'none' 取值
    if (raw.controlType) {
      return 'negative'
    }
    const tags: string[] = raw.tags ?? []
    if (tags.some((t) => t === 'dot' || t === 'poison' || t === 'debuff')) {
      return 'negative'
    }
    throw new Error(
      `[BuffConfigResolver] ${raw.id ?? 'unknown'}: 缺少 polarity 字段，且无法从 controlType/tags 推导`
    )
  }

  /** 从效果计划派生静态效果摘要（属性修正 + 时长），供日志/UI 直接读取 */
  private buildEffectSummary(
    raw: BuffJsonEntry,
    effectPlan: ResolvedEffectPlan[],
  ): string {
    const parts: string[] = []
    for (const effect of effectPlan) {
      if (effect.type !== AtomicEffectType.MODIFIER) continue
      const attrs = effect.params.attributes as
        | Record<string, AttributeValueConfig>
        | undefined
      if (!attrs) continue
      for (const [code, cfg] of Object.entries(attrs)) {
        const cn = getAttrName(code as ATTRIBUTE_CODE)
        if (!cn) continue
        const arrow = cfg.value >= 0 ? '↑' : '↓'
        const text =
          cfg.type === 'PERCENTAGE'
            ? `${Math.abs(cfg.value)}%`
            : `${Math.abs(cfg.value)}`
        parts.push(`${cn}${arrow}${text}`)
      }
    }
    const duration = raw.duration ?? 1
    if (duration > 0) parts.push(`（${duration}回合）`)
    else if (duration === -1) parts.push(`（永久）`)
    return parts.join(' ')
  }

  private buildEffectPlan(raw: BuffJsonEntry): ResolvedEffectPlan[] {
    const plan: ResolvedEffectPlan[] = []

    const rawEffects = raw.effects ?? []
    for (const rawEffect of rawEffects) {
      const handler = this.registry.get(rawEffect.type)
      if (!handler) {
        throw new Error(
          `[BuffConfigResolver] ${raw.id ?? 'unknown'}: 未知原子效果类型 "${rawEffect.type}"`
        )
      }
      plan.push({
        type: rawEffect.type,
        handler,
        params: rawEffect.params ?? {},
      })
    }

    // 不兼容旧格式——没有 effects[] 就是空 plan
    return plan
  }

  private buildBaseConfig(raw: BuffJsonEntry): BuffConfig {
    return {
      id: raw.id,
      name: raw.name ?? raw.id,
      description: raw.description ?? '',
      duration: raw.duration ?? 1,
      maxStacks: raw.maxStacks ?? 1,
      cooldown: raw.cooldown ?? 0,
      // HACK: 缺省值为大写字符串 'LIMITED'，与 enum 值 StackRule.LIMITED（'limited'）不一致，
      // BuffSystem 叠层 switch 不会命中该分支（buffs.json 121/142 条无 stackRule 走此缺省）。
      // 修正会改变现网叠层行为，须先确认策划语义再统一，见类型收敛报告遗留项
      stackRule: (raw.stackRule ?? 'LIMITED') as StackRule,
      controlType: (raw.controlType ?? 'NONE') as ControlType,
      dispellable: raw.dispellable ?? true,
      blockedByTag: raw.blockedByTag ?? undefined,
      tags: raw.tags ?? [],
      immunities: raw.immunities ?? undefined,
      parameters: raw.parameters ?? undefined,
      attributes: raw.attributes ?? undefined,
      // 触发器阶段在此归一化为枚举值，下游不再做双命名兼容
      triggers: raw.triggers
        ? (raw.triggers as TriggerAction[]).map((t) => ({
            ...t,
            phase: normalizeTriggerPhase(t.phase, raw.id ?? 'unknown'),
          }))
        : undefined,
    }
  }
}
