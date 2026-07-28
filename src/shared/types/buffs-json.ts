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
  category?: string
  duration?: number
  maxStacks?: number
  aura?: BuffJsonAura
  polarity?: string
  description?: string
  attributes?: Record<string, string>
  triggers?: BuffJsonTriggerEntry[]
  controlType?: string
  controlPriority?: number
  stackRule?: string
  tags?: string[]
  onAdd?: string
  immunities?: string[]
  statusType?: string
  shield?: unknown
  isDebuff?: boolean
  parameters?: Record<string, unknown>
  cooldown?: number
  dispellable?: boolean
}
