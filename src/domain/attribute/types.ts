/**
 * 文件: types.ts
 * 创建日期: 2026-04-07
 * 作者: CombatDebugStudio
 * 功能: 属性系统类型定义与计算核心
 * 描述: 定义属性类型、修饰符、属性值对象、修饰符详情和属性名称常量
 * 版本: 2.1.0 (Schema-Driven — ATTRIBUTE_CODE/AttributeMetaMap 由 JSON 自动生成)
 */

// ========== 类型定义 ==========

/** 修饰符计算类型 四个类型 */
export const ModifierType = {
  ADDITIVE: 'ADDITIVE',
  MULTIPLICATIVE: 'MULTIPLICATIVE',
  PERCENTAGE: 'PERCENTAGE',
  FINAL: 'FINAL',
} as const
export type ModifierType = (typeof ModifierType)[keyof typeof ModifierType]

export const ModifierTypeNames: Record<ModifierType, string> = {
  ADDITIVE: '加法',
  MULTIPLICATIVE: '乘法',
  PERCENTAGE: '百分比',
  FINAL: '最终',
}

/** 修饰符来源类型 */
export const ModifierSourceType = {
  BUFF: 'buff',
  EQUIPMENT: 'equipment',
  SKILL: 'skill',
  TERRAIN: 'terrain',
  FORMATION: 'formation',
  BASE: 'base',
  TALENT: 'talent',
  AFFIX: 'affix',
} as const
/** 修饰符来源类型 */
export type ModifierSourceType =
  (typeof ModifierSourceType)[keyof typeof ModifierSourceType]

/** 修饰符来源类型显示名称映射 */
export const ModifierSourceTypeNames: Record<ModifierSourceType, string> = {
  buff: '增益',
  equipment: '装备',
  skill: '技能',
  terrain: '地形',
  formation: '阵型',
  base: '基础',
  talent: '天赋',
  affix: '词缀',
}

/** 属性值类型 */
export const AttributeValueType = {
  VALUE: 'value', // 数值
  PERCENT: 'percent', // 百分比
} as const
/** 属性值类型 */
export type AttributeValueType =
  (typeof AttributeValueType)[keyof typeof AttributeValueType]

// ========== 核心接口 ==========

/**
 * 修饰符详情（用于 UI 展示与调试）
 */
export interface Modifier {
  /** 来源标识，如 "buff_attack_up" 或 "装备:铁剑" */
  sourceKey: string
  /** 来源类型 */
  sourceType: ModifierSourceType
  /** 目标属性 */
  attribute: ATTRIBUTE_CODE
  /** 加成原始值 */
  value: number
  /** 加成类型 */
  type: ModifierType
  /** 可选描述文本 */
  description?: string
}

/**
 * 属性计算拆解（用于查看计算过程）
 */
export interface CalculationBreakdown {
  /** 基础值 */
  base: number
  /** 加法修正总和 */
  additive: number
  /** 百分比乘区系数（1 + 百分比总和） */
  percentMultiplier: number
  /** 独立乘区系数 */
  independentMultiplier: number
  /** 最终修正系数 */
  finalMultiplier: number
}

/**
 * 单步计算记录
 */
export interface CalculationStep {
  /** 修饰符模板 ID */
  modifierId: string
  /** 来源名称 */
  sourceName: string
  /** 修饰类型 */
  type: ModifierType
  /** 解析后的实际数值 */
  appliedValue: number
  /** 该步骤执行前的中间结果 */
  previousValue: number
  /** 该步骤执行后的中间结果 */
  intermediateResult: number
}

/**
 * 属性值对象（缓存最终值及来源）
 */
export interface AttributeValue {
  /** 最终计算值（缓存） */
  value: number
  /** 基础值（未加任何修饰符） */
  base: number
  /** 修饰符详情列表（用于调试和 UI） */
  modifiers: Modifier[]
  /** 是否为百分比属性（用于 UI 格式化） */
  isPercentage: boolean
  /** 缓存版本戳，与 ParticipantStats.version 比对 */
  cachedVersion: number
  /** 计算拆解（可选，仅 Debug 开启时记录） */
  breakdown?: CalculationBreakdown
}

// ========== 抽象接口（依赖倒置） ==========

/**
 * 修饰符堆栈接口（抽象 ModifierStack 的核心能力）
 * 用于解耦 BattleParticipantImpl 与具体实现
 */
export interface IModifierStack {
  /** 获取指定属性的原始修饰符列表 */
  getModifiers(attribute?: ATTRIBUTE_CODE): Modifier[]
  /** 获取当前堆栈中修饰符总数 */
  getModifierCount(): number
  /** 添加修饰符 */
  addModifier(
    buffInstanceId: string,
    attribute: ATTRIBUTE_CODE,
    value: number,
    type: ModifierType,
  ): void
  /** 移除修饰符 */
  removeModifier(buffInstanceId: string): void
  /** 清空所有修饰符 */
  clear(): void
}

/**
 * 修饰符提供者接口（核心抽象）
 * 用于解耦 BattleParticipantImpl 与 BuffSystem 的直接依赖
 */
export interface IModifierProvider {
  /**
   * 获取参与者的修饰符堆栈
   * @param participantId 参与者ID
   * @returns 修饰符堆栈实例，不存在则返回 null
   */
  getModifierStack(participantId: string): IModifierStack | null

  /**
   * 获取修饰符来源显示名称
   * @param sourceId 来源ID（如 buffInstanceId）
   */
  getSourceName(sourceId: string): string | null

  /**
   * 获取修饰符来源类型
   * @param sourceId 来源ID
   */
  getSourceType(sourceId: string): ModifierSourceType

  /** 是否处于调试模式 */
  isDebugMode(): boolean
}

/** 所有属性的值对象映射（键为属性代码，值为属性值对象） */
export type AttributeValues = Record<ATTRIBUTE_CODE, AttributeValue>

// ========== 属性代码常量（Schema-Driven） ==========
// NOTE: ATTRIBUTE_CODE 与 AttributeMetaMap 由 scripts/generate-attributes.cjs 基于
//       configs/attributes/attributes.json 自动生成（见 attribute-codes.generated.ts），
//       勿手动编辑。修改属性列表请改 attributes.json 后运行 npm run generate:attributes。

import { ATTRIBUTE_CODE, AttributeMetaMap } from './attribute-codes.generated'

export { ATTRIBUTE_CODE, AttributeMetaMap } from './attribute-codes.generated'

// ========== 属性元数据 ==========

/**
 * 属性元数据（用于 UI 展示）
 */
export interface AttributeMeta {
  code: ATTRIBUTE_CODE
  name: string
  displayName: string
  description: string
  range: string
  impact: string
  iconPath?: string
  isPercentage: boolean
  defaultValue?: number
  /** 运行时状态属性（血量、能量），不由公式重算，由 setAttributeValue 单独维护 */
  isRuntimeState?: boolean
}

/** 从元数据派生的属性显示名称映射 */
export const AttributeCodeNames: Record<ATTRIBUTE_CODE, string> =
  Object.fromEntries(
    Object.entries(AttributeMetaMap).map(([key, meta]) => [
      key,
      meta.displayName,
    ]),
  ) as Record<ATTRIBUTE_CODE, string>

/**
 * 根据属性编码获取属性元数据
 */
export function getAttrMeta(code: ATTRIBUTE_CODE): AttributeMeta | undefined {
  return AttributeMetaMap[code]
}

/**
 * 根据属性编码获取属性的中文显示名称
 * @param code 属性编码
 * @returns 中文显示名称，未定义时返回 code 本身
 */
export function getAttrName(code: ATTRIBUTE_CODE): string {
  return AttributeCodeNames[code] ?? code
}

/**
 * 根据属性编码获取属性默认值
 * @param code 属性编码
 * @returns 默认值，未定义时返回 0
 */
export function getAttrDv(code: ATTRIBUTE_CODE): number {
  return AttributeMetaMap[code]?.defaultValue ?? 0
}
