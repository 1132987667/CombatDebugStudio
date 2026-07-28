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
