/**
 * effects.json 完整类型定义
 *
 * 配置数据的纯 schema 类型——描述 JSON 文件中 effects 数组的结构，
 * 而非运行时效果模型。
 */
export interface EffectsJsonEntry {
  id: string
  type: string
  params: Record<string, unknown>
  description?: string
}

export interface EffectsJsonData {
  effects: EffectsJsonEntry[]
}

import type { BuffJsonEntry, AttributeValueConfig } from '@/shared/types/buffs-json'

/**
 * 将 effects.json 条目转换为 BuffJsonEntry 格式（buff 配置统一入口）。
 * BuffScriptRegistry 构造时与数据源归一化共用，避免两套转换逻辑漂移。
 */
export function effectsEntryToBuffConfig(effect: EffectsJsonEntry): BuffJsonEntry {
  const params = effect.params || {}
  const attributes = (params.attributes ?? {}) as Record<string, AttributeValueConfig>
  const polarity =
    effect.type === 'debuff'
      ? 'negative'
      : effect.type === 'buff'
        ? 'positive'
        : undefined
  return {
    id: effect.id,
    name: effect.id,
    polarity,
    description: effect.description ?? '',
    duration: (params.duration as number) ?? 1,
    maxStacks: (params.maxStacks as number) ?? 1,
    effects: [{
      type: 'modifier',
      params: {
        attributes,
        perStack: true,
      },
    }],
  }
}

/**
 * 封神榜 buffs 表为混合格式（buffs.json 的 BuffJsonEntry + effects.json 的原始条目）。
 * 归一化为统一 BuffJsonEntry，供引擎注册表 / 数据源 / 图鉴共用。
 * 判定：有顶层 type 且无 effects 字段 → effects.json 条目；否则视为 BuffJsonEntry。
 */
export function normalizeBuffEntries(entries: unknown[]): BuffJsonEntry[] {
  const out: BuffJsonEntry[] = []
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as { id?: unknown; type?: unknown; effects?: unknown }
    if (typeof entry.id !== 'string' || !entry.id) continue
    if (entry.type !== undefined && entry.effects === undefined) {
      out.push(effectsEntryToBuffConfig(entry as unknown as EffectsJsonEntry))
    } else {
      out.push(entry as unknown as BuffJsonEntry)
    }
  }
  return out
}
