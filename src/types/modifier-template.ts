/**
 * 文件: modifier-template.ts
 * 创建日期: 2026-04-07
 * 作者: CombatDebugStudio
 * 功能: 结构化修饰符模板定义
 * 描述: 定义结构化的修饰符模板，用于配置解析与属性计算
 * 版本: 1.0.0
 */

import type {
  AttributeCodes,
  ModifierType,
  ModifierSourceType,
} from './attribute'

/**
 * 动态数值计算上下文
 */
export interface DynamicValueContext {
  /** 参与者当前属性快照 */
  attributes: Partial<Record<AttributeCodes, number>>
  /** 自定义参数（如技能等级、层数等） */
  params: Record<string, number>
}

/**
 * 动态数值解析器（运行时根据上下文计算）
 */
export type DynamicValueResolver = (context: DynamicValueContext) => number

/**
 * 条件表达式（可扩展为 AST，现阶段先用字符串）
 */
export type ConditionExpression = string

/**
 * 修饰符模板（配置层使用）
 * 由技能/Buff/装备等配置转换而来，不包含运行时状态
 */
export interface ModifierTemplate {
  /** 模板唯一标识（用于追踪来源） */
  id: string
  /** 显示来源名称（如 "战吼"、"铁剑"） */
  sourceName: string
  /** 来源类型 */
  sourceType: ModifierSourceType
  /** 目标属性 */
  targetAttribute: AttributeCodes
  /** 修饰类型 */
  type: ModifierType
  /** 修饰数值（固定值或动态计算函数） */
  value: number | DynamicValueResolver
  /** 生效条件（可选，表达式字符串或函数） */
  condition?: ConditionExpression
}

/**
 * Buff 配置的结构化表示（替代原有的任意 BuffConfig）
 */
export interface StructuredBuffConfig {
  /** Buff 唯一标识 */
  id: string
  /** Buff 显示名称 */
  name?: string
  /** 直接修饰符列表 */
  modifiers?: ModifierTemplate[]
  /** 其他扩展字段 */
  [key: string]: unknown
}

/**
 * 被动技能步骤的结构化表示
 */
export interface PassiveSkillStep {
  /** 步骤类型 */
  type: 'apply_buff' | 'modify_attribute'
  /** 关联的 Buff ID */
  buffId?: string
  /** 直接修饰符列表 */
  modifiers?: ModifierTemplate[]
}

/**
 * 技能配置的结构化表示
 */
export interface StructuredSkillConfig {
  /** 技能唯一标识 */
  id: string
  /** 技能名称 */
  name?: string
  /** 技能步骤列表 */
  steps?: PassiveSkillStep[]
  /** 其他扩展字段 */
  [key: string]: unknown
}
