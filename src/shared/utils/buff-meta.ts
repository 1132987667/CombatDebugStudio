/**
 * 文件: buff-meta.ts
 * 功能: 存档 Buff 元数据反查（纯函数）
 * 描述: 统一存档的 ArchiveBuff 仅含 name/stacks/turns（契约限制），
 *       展示层需要正负标记与属性明细时按名字反查 buffs.json 配置补全。
 *       匹配顺序：先按 id（buff_suffocation），再按中文名（窒息）。
 */

import { buffsData, type AttributeValueConfig } from '@/shared/types/buffs-json'

export interface ResolvedBuffMeta {
  /** 是否为减益（配置 polarity === 'negative'） */
  isNegative?: boolean
  /** 属性修正（key=ATTRIBUTE_CODE，value=显式声明的 { value, type }） */
  attributes?: Record<string, AttributeValueConfig>
  /** 效果描述 */
  description?: string
}

/** 按名字/id 反查 buffs.json 配置；未命中返回空对象 */
export function resolveBuffMeta(name: string): ResolvedBuffMeta {
  if (!name) return {}
  const entry = buffsData.find((b) => b.name === name || b.id === name)
  if (!entry) return {}

  const attributes: Record<string, AttributeValueConfig> = {}
  for (const fx of entry.effects ?? []) {
    const attrs = (fx.params?.attributes ?? {}) as Record<string, AttributeValueConfig>
    for (const [k, v] of Object.entries(attrs)) {
      if (v && typeof v === 'object' && typeof v.value === 'number') attributes[k] = v
    }
  }

  return {
    isNegative: entry.polarity === 'negative',
    attributes: Object.keys(attributes).length ? attributes : undefined,
    description: entry.description,
  }
}
