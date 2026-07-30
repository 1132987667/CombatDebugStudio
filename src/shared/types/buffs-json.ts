import { BuffPolarity } from '@/shared/types/buff-classification'
import { StatusCategory, ControlKind } from '@/shared/types/status-meta'
import { StackRule } from '@/domain/buff/types'


/**
 * buffs.json 完整类型定义
 *
 * 这是配置数据的纯 schema 类型——描述 JSON 文件中的字段结构，
 * 而非领域模型。用于替代散布在各处的局部接口和 `any` 转换。
 *
 * 所有非 id 字段均为可选（JSON 中并非每条 entry 都有所有字段）。
 */
export interface BuffJsonAuraModifier {
  id?: string
  targetAttribute: string
  type: string
  value: number
  condition?: string
}

export interface BuffJsonAura {
  targetSelector: string
  modifiers: BuffJsonAuraModifier[]
}

export interface BuffJsonTriggerEntry {
  phase: string
  scriptId: string
  params?: Record<string, unknown>
  probability?: number
  cooldown?: number
  maxTriggers?: number
  condition?: string
}

export interface BuffJsonEntry {
  id: string
  name?: string
  category?: StatusCategory
  duration?: number
  maxStacks?: number
  aura?: BuffJsonAura
  polarity?: BuffPolarity
  description?: string
  attributes?: Record<string, string>
  triggers?: BuffJsonTriggerEntry[]
  controlType?: ControlKind
  stackRule?: StackRule
  tags?: string[]
  onAdd?: string

  // --- 补全遗漏字段 ---
  immunities?: string[] // 免疫标签
  effects?: Array<{
    // 原子效果系统配置
    type: string
    params?: Record<string, unknown>
  }>
  cascadeRemove?: boolean // 级联移除标记
  isPermanent?: boolean // 是否永久
  iconPath?: string // 图标路径
  // ----------------------

  shield?: unknown
  parameters?: Record<string, unknown>
  cooldown?: number
  // 是否可驱散
  dispellable?: boolean
}

import rawBuffsData from '@configs/buffs/buffs.json'

export const buffsData: readonly BuffJsonEntry[] =
  rawBuffsData as BuffJsonEntry[]
