/**
 * 文件: modifier-template.ts
 * 创建日期: 2026-04-07
 * 作者: CombatDebugStudio
 * 功能: 结构化修饰符模板定义
 * 描述: 定义结构化的修饰符模板，用于配置解析与属性计算
 * 版本: 1.0.0
 */

import type {
  ATTRIBUTE_CODE,
  ModifierType,
  ModifierSourceType,
} from '@/domain/attribute/types'

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
  targetAttribute: ATTRIBUTE_CODE
  /** 修饰类型 */
  type: ModifierType
  /** 修饰数值（固定值） */
  value: number
  /** 生效条件（可选） */
  condition?: string
}


