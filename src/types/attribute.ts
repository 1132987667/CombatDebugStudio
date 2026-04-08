/**
 * 文件: attribute.ts
 * 创建日期: 2026-04-07
 * 作者: CombatDebugStudio
 * 功能: 属性系统类型定义
 * 描述: 定义属性值对象、修饰符详情和属性名称常量
 * 版本: 
 */

import type { Modifier, AttributeType } from '@/types/modifier'

/** 修饰符来源类型 */
export type ModifierSourceType =
  | 'buff'
  | 'equipment'
  | 'skill'
  | 'terrain'
  | 'formation'
  | 'base'
  | 'talent'

export const ModifierSourceTypeNames = {
  buff: 'buff',
  equipment: '装备',
  skill: '技能',
  terrain: '地形',
  formation: '阵型',
  base: '基础',
  talent: '天赋',
}  

/** 修饰符计算类型，依次为: 加法/乘法/百分比加成 */
export type ModifierCalcType = 'add' | 'multiply' | 'percent'

/**
 * 修饰符详情（用于调试和UI展示）
 */
export interface ModifierDetail {
  /** 来源标识，如 "buff_attack_up" 或 "装备:铁剑" */
  source: string
  /** 来源类型 */
  sourceType: ModifierSourceType
  /** 加成值（原始值） */
  value: number
  /** 加成类型：加法/乘法/百分比加成 */
  type: ModifierCalcType
  /** 可选描述 */
  description?: string
}

/**
 * 属性计算拆解（仅调试模式填充）
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
 * 属性值对象（缓存最终值和来源）
 */
export interface AttributeValue {
  /** 最终计算值（缓存） */
  value: number
  /** 基础值（未加任何修饰符） */
  base: number
  /** 修饰符列表（用于调试和 UI） */
  modifiers: ModifierDetail[]
  /** 是否为百分比属性（用于 UI 格式化） */
  isPercentage: boolean
  /** 是否需要重新计算（脏标记） */
  dirty: boolean
  /** 计算拆解（可选，仅 Debug 开启时记录） */
  breakdown?: CalculationBreakdown
}

/**
 * 修饰符堆栈接口（抽象 ModifierStack 的核心能力）
 * 用于解耦 BattleParticipantImpl 与具体实现
 */
export interface IModifierStack {
  /** 获取指定属性的修饰符列表 */
  getModifiers(attribute: AttributeType): Modifier[]
  /** 计算属性最终值 */
  calculate(attribute: AttributeType, baseValue: number): number
  /** 获取修饰符总数 */
  getModifierCount(): number
}

/**
 * 修饰符提供者接口（核心抽象）
 * 用于解耦 BattleParticipantImpl 与 BuffSystem 的直接依赖
 * 支持单元测试、回放模式、多战斗实例隔离
 */
export interface IModifierProvider {
  /**
   * 获取参与者的修饰符堆栈
   * @param participantId 参与者ID
   * @returns 修饰符堆栈实例，不存在则返回 null
   */
  getModifierStack(participantId: string): IModifierStack | null

  /**
   * 获取修饰符来源名称
   * @param sourceId 来源ID（如 buffInstanceId）
   * @returns 来源名称，不存在则返回 null
   */
  getSourceName(sourceId: string): string | null

  /**
   * 获取修饰符来源类型
   * @param sourceId 来源ID
   * @returns 来源类型
   */
  getSourceType(sourceId: string): ModifierSourceType

  /**
   * 检查是否处于调试模式
   * @returns 是否处于调试模式
   */
  isDebugMode(): boolean
}

/**
 * 属性名称常量（便于类型提示）
 */
export const AttributeNames = {
  HP: 'HP',
  MAX_HP: 'MAX_HP',
  ATK: 'ATK',
  MIN_ATK: 'MIN_ATK',
  MAX_ATK: 'MAX_ATK',
  DEF: 'DEF',
  SPD: 'SPD',
  CRIT_RATE: 'CRIT_RATE',
  CRIT_DMG: 'CRIT_DMG',
  DMG_RED: 'DMG_RED',
  ENERGY: 'energy',
  MAX_ENERGY: 'max_energy',
} as const

/** 属性名称类型 */
export type AttributeName = (typeof AttributeNames)[keyof typeof AttributeNames]

/**
 * 属性元数据（用于UI展示）
 */
export interface AttributeMeta {
  /** 属性名称 */
  name: AttributeName
  /** 显示名称 */
  displayName: string
  /** 是否为百分比属性 */
  isPercentage: boolean
  /** 描述 */
  description?: string
}

/**
 * 属性元数据映射
 */
export const AttributeMetaMap: Record<AttributeName, AttributeMeta> = {
  HP: {
    name: 'HP',
    displayName: '生命值',
    isPercentage: false,
    description: '当前生命值',
  },
  MAX_HP: {
    name: 'MAX_HP',
    displayName: '最大生命值',
    isPercentage: false,
    description: '最大生命值上限',
  },
  ATK: {
    name: 'ATK',
    displayName: '攻击力',
    isPercentage: false,
    description: '攻击力',
  },
  MIN_ATK: {
    name: 'MIN_ATK',
    displayName: '最小攻击力',
    isPercentage: false,
    description: '最小攻击力',
  },
  MAX_ATK: {
    name: 'MAX_ATK',
    displayName: '最大攻击力',
    isPercentage: false,
    description: '最大攻击力',
  },
  DEF: {
    name: 'DEF',
    displayName: '防御力',
    isPercentage: false,
    description: '防御力',
  },
  SPD: {
    name: 'SPD',
    displayName: '速度',
    isPercentage: false,
    description: '速度值',
  },
  CRIT_RATE: {
    name: 'CRIT_RATE',
    displayName: '暴击率',
    isPercentage: true,
    description: '暴击率',
  },
  CRIT_DMG: {
    name: 'CRIT_DMG',
    displayName: '暴击伤害',
    isPercentage: true,
    description: '暴击伤害加成',
  },
  DMG_RED: {
    name: 'DMG_RED',
    displayName: '免伤率',
    isPercentage: true,
    description: '伤害减免比例',
  },
  energy: {
    name: 'energy',
    displayName: '能量',
    isPercentage: false,
    description: '当前能量值',
  },
  max_energy: {
    name: 'max_energy',
    displayName: '最大能量',
    isPercentage: false,
    description: '最大能量上限',
  },
}
