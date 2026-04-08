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

/** 修饰符计算类型，依次为: 加法/乘法/百分比加成/最终乘区 */
export type ModifierCalcType = 'add' | 'multiply' | 'percent' | 'final'

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
export const AttributeCodes = {
  HP: 'HP',
  MAX_HP: 'MAX_HP',
  ATK: 'ATK',
  MIN_ATK: 'MIN_ATK',
  MAX_ATK: 'MAX_ATK',
  DEF: 'DEF',
  SPD: 'SPD',
  CRIT_RATE: 'CRIT_RATE',
  CRIT_DMG: 'CRIT_DMG',
  DMG_REDUCTION: 'DMG_REDUCTION',
  ENERGY: 'ENERGY',
  MAX_ENERGY: 'MAX_ENERGY',
  HP_BONUS: 'HP_BONUS',
  ATK_BONUS: 'ATK_BONUS',
  DEF_BONUS: 'DEF_BONUS',
  SPD_BONUS: 'SPD_BONUS',
} as const

export const AttributeCodeNames = {
  HP: '生命值',
  MAX_HP: '最大生命值',
  ATK: '攻击力',
  MIN_ATK: '最小攻击力',
  MAX_ATK: '最大攻击力',
  DEF: '防御力',
  SPD: '速度',
  CRIT_RATE: '暴击率',
  CRIT_DMG: '暴击伤害',
  DMG_REDUCTION: '免伤率',
  ENERGY: '能量',
  MAX_ENERGY: '最大能量值',
  HP_BONUS: '生命值加成',
  ATK_BONUS: '攻击力加成',
  DEF_BONUS: '防御力加成',
  SPD_BONUS: '速度加成',
}

/**
 * 标准化属性名称
 * 将不同格式的属性名称转换为统一的内部格式
 * @param attribute 属性名称
 * @returns 标准化后的属性名称
 */
export function normalizeAttributeCode(attribute: string): string {
  const attributeMap: Record<string, string> = {
    // 基础属性
    speed: 'SPD',           // 速度 → 标准化为 SPD
    attack: 'ATK',          // 攻击力 → 标准化为 ATK
    defense: 'DEF',         // 防御力 → 标准化为 DEF
    health: 'HP',           // 生命值 → 标准化为 HP

    hpBonus: 'HP_BONUS',    // 生命值加成 → 标准化为 HP_BONUS
    atkBonus: 'ATK_BONUS',  // 攻击力加成 → 标准化为 ATK_BONUS
    defBonus: 'DEF_BONUS',  // 防御力加成 → 标准化为 DEF_BONUS
    spdBonus: 'SPD_BONUS',  // 速度加成 → 标准化为 SPD_BONUS
    
    // 战斗属性
    critRate: 'CRIT_RATE',  // 暴击率 → 标准化为 CRIT_RATE
    critDamage: 'CRIT_DMG', // 暴击伤害 → 标准化为 CRIT_DMG
    
    // 元素伤害承受
    magicDamageTaken: 'MAGIC_DMG_TAKEN',        // 魔法伤害承受 → 标准化为 MAGIC_DMG_TAKEN
    fireDamageTaken: 'FIRE_DMG_TAKEN',          // 火焰伤害承受 → 标准化为 FIRE_DMG_TAKEN
    waterDamageTaken: 'WATER_DMG_TAKEN',        // 水元素伤害承受 → 标准化为 WATER_DMG_TAKEN
    lightningDamageTaken: 'LIGHTNING_DMG_TAKEN', // 雷元素伤害承受 → 标准化为 LIGHTNING_DMG_TAKEN
    
    // 元素伤害
    demonDamage: 'DEMON_DMG',     // 魔系伤害 → 标准化为 DEMON_DMG
    buddhistDamage: 'BUDDHIST_DMG', // 佛系伤害 → 标准化为 BUDDHIST_DMG
    fireDamage: 'FIRE_DMG',        // 火焰伤害 → 标准化为 FIRE_DMG
    
    // 状态免疫与抗性
    slowImmune: 'SLOW_IMMUNE',         // 减速免疫 → 标准化为 SLOW_IMMUNE
    stunResist: 'STUN_RESIST',         // 眩晕抗性 → 标准化为 STUN_RESIST
    knockbackResist: 'KNOCKBACK_RESIST', // 击退抗性 → 标准化为 KNOCKBACK_RESIST
    poisonResist: 'POISON_RESIST',      // 中毒抗性 → 标准化为 POISON_RESIST
    bleedResist: 'BLEED_RESIST',        // 流血抗性 → 标准化为 BLEED_RESIST
    burnImmune: 'BURN_IMMUNE',          // 燃烧免疫 → 标准化为 BURN_IMMUNE
    
    // 特殊属性
    poisonChance: 'POISON_CHANCE',     // 中毒几率 → 标准化为 POISON_CHANCE
    webSuccessRate: 'WEB_SUCCESS_RATE', // 缠绕成功率 → 标准化为 WEB_SUCCESS_RATE
    debuffDuration: 'DEBUFF_DURATION',  //  debuff 持续时间 → 标准化为 DEBUFF_DURATION
    hitRate: 'HIT_RATE',                // 命中率 → 标准化为 HIT_RATE
    dodge: 'DODGE',                     // 闪避率 → 标准化为 DODGE
    skillCooldown: 'SKILL_CD',          // 技能冷却 → 标准化为 SKILL_CD
  }
  return attributeMap[attribute.toLowerCase()] || attribute.toUpperCase()
}

/**
 * 创建默认 AttributeValue
 * @param base 基础值
 * @param isPercentage 是否为百分比属性
 * @returns AttributeValue 对象
 */
export function createAttributeValue(
  base: number,
  isPercentage: boolean = false,
): AttributeValue {
  return {
    value: base,
    base,
    modifiers: [],
    isPercentage,
    dirty: false,
  }
}

/**
 * 应用修饰符计算最终值
 * @param base 基础值
 * @param modifiers 修饰符列表
 * @returns 最终值和计算拆解
 */
export function calculateFinalValue(
  base: number,
  modifiers: ModifierDetail[],
): { value: number; breakdown: CalculationBreakdown } {
  let additive = 0
  let percentMultiplier = 1
  let independentMultiplier = 1
  let finalMultiplier = 1
  let finalValue = base

  // 计算百分比加成
  let percentSum = 0
  for (const mod of modifiers) {
    if (mod.type === 'percent') {
      percentSum += mod.value
    }
  }
  if (percentSum !== 0) {
    percentMultiplier = 1 + percentSum
    finalValue += base * percentSum
  }

  // 计算加法加成
  for (const mod of modifiers) {
    if (mod.type === 'add') {
      additive += mod.value
      finalValue += mod.value
    }
  }

  // 计算独立乘区
  let multiplyFactor = 1
  for (const mod of modifiers) {
    if (mod.type === 'multiply') {
      multiplyFactor *= 1 + mod.value
    }
  }
  if (multiplyFactor !== 1) {
    independentMultiplier = multiplyFactor
    finalValue *= multiplyFactor
  }

  // 计算最终乘区
  let finalMulti = 1
  for (const mod of modifiers) {
    if (mod.type === 'final') {
      finalMulti *= 1 + mod.value
    }
  }
  if (finalMulti !== 1) {
    finalMultiplier = finalMulti
    finalValue *= finalMulti
  }

  return {
    value: finalValue,
    breakdown: {
      base,
      additive,
      percentMultiplier,
      independentMultiplier,
      finalMultiplier,
    },
  }
}

/** 属性名称类型 */
export type AttributeCode = (typeof AttributeCodes)[keyof typeof AttributeCodes]

/**
 * 属性元数据（用于UI展示）
 */
export interface AttributeMeta {
  /** 属性名称 */
  name: AttributeCode
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
export const AttributeMetaMap: Record<AttributeCode, AttributeMeta> = {
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
  DMG_REDUCTION: {
    name: 'DMG_REDUCTION',
    displayName: '免伤率',
    isPercentage: true,
    description: '伤害减免比例',
  },
  ENERGY: {
    name: 'ENERGY',
    displayName: '能量',
    isPercentage: false,
    description: '当前能量值',
  },
  MAX_ENERGY: {
    name: 'MAX_ENERGY',
    displayName: '最大能量值',
    isPercentage: false,
    description: '最大能量上限',
  },
  HP_BONUS: {
    name: 'HP_BONUS',
    displayName: '生命值加成',
    isPercentage: true,
    description: '生命值加成',
  },
  ATK_BONUS: {
    name: 'ATK_BONUS',
    displayName: '攻击力加成',
    isPercentage: true,
    description: '攻击力加成',
  },
  DEF_BONUS: {
    name: 'DEF_BONUS',
    displayName: '防御力加成',
    isPercentage: true,
    description: '防御力加成',
  },
  SPD_BONUS: {
    name: 'SPD_BONUS',
    displayName: '速度加成',
    isPercentage: true,
    description: '速度加成',
  },
}
