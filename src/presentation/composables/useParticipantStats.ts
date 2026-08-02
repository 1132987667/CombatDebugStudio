/**
 * 文件：useParticipantStats.ts
 * 创建日期：2026-04-08
 * 功能：参与者属性访问 Composable
 * 描述：提供便捷的属性访问和格式化功能
 */

import { computed, ref, watchEffect, type ComputedRef } from 'vue'
import type { BattleEntity } from '@/domain/battle/type/types'
import type {
  AttributeValue,
  CalculationBreakdown,
} from '@/domain/attribute/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/**
 * 格式化后的属性值
 */
export interface FormattedAttribute {
  /** 显示值（格式化后） */
  displayValue: string
  /** 原始值 */
  value: number
  /** 是否为百分比 */
  isPercentage: boolean
  /** 计算拆解（调试模式） */
  breakdown?: any
}

/**
 * 属性访问 Composable 返回值（使用官方 ATTRIBUTE_CODE 标准编码）
 */
export interface UseParticipantStatsReturn {
  /** 获取格式化属性 */
  getFormatted: (type: ATTRIBUTE_CODE) => FormattedAttribute
  /** 获取属性值 */
  getValue: (type: ATTRIBUTE_CODE) => number
  /** 获取属性对象 */
  getAttribute: (type: ATTRIBUTE_CODE) => AttributeValue | undefined
  /** 获取计算拆解 */
  getBreakdown: (type: ATTRIBUTE_CODE) => CalculationBreakdown | null
  /** 当前气血值 */
  currentHealth: ComputedRef<FormattedAttribute>
  /** 最大气血值 */
  maxHealth: ComputedRef<FormattedAttribute>
  /** 能量 */
  energy: ComputedRef<FormattedAttribute>
  /** 最大能量 */
  maxEnergy: ComputedRef<FormattedAttribute>
  /** 攻击力 */
  attack: ComputedRef<FormattedAttribute>
  /** 防御力 */
  defense: ComputedRef<FormattedAttribute>
  /** 速度 */
  speed: ComputedRef<FormattedAttribute>
  /** 暴击率 */
  critRate: ComputedRef<FormattedAttribute>
  /** 暴击伤害 */
  critDamage: ComputedRef<FormattedAttribute>
  /** 伤害减免 */
  damageReduction: ComputedRef<FormattedAttribute>
}

/**
 * 格式化属性值
 */
function formatAttributeValue(
  attrValue: AttributeValue,
  displayValue?: number,
): FormattedAttribute {
  const value = displayValue ?? attrValue.value
  const displayValueStr = attrValue.isPercentage
    ? `${value.toFixed(1)}%`
    : Math.round(value).toString()

  return {
    displayValue: displayValueStr,
    value,
    isPercentage: attrValue.isPercentage,
    breakdown: attrValue.breakdown,
  }
}

/**
 * 参与者属性访问 Composable
 * 提供便捷的属性访问和格式化功能
 * @param participant BattleEntity 实例
 * @returns 属性访问方法集合
 */
export function useParticipantStats(
  participant: BattleEntity,
): UseParticipantStatsReturn {
  // 获取格式化属性
  const getFormatted = (type: ATTRIBUTE_CODE): FormattedAttribute => {
    const attrValue = participant.getAttrVal(type)
    if (!attrValue) {
      return {
        displayValue: '0',
        value: 0,
        isPercentage: false,
      }
    }
    return formatAttributeValue(attrValue)
  }

  // 获取属性值
  const getValue = (type: ATTRIBUTE_CODE): number => {
    return participant.getAttrVal(type)?.value ?? 0
  }

  // 获取属性对象
  const getAttribute = (type: ATTRIBUTE_CODE): AttributeValue | undefined => {
    return participant.getAttrVal(type)
  }

  // 获取计算拆解
  const getBreakdown = (type: ATTRIBUTE_CODE): CalculationBreakdown | null => {
    return getAttribute(type)?.breakdown || null
  }

  // 显式追踪 statsVersion 变更驱动 computed 重新求值
  const statsVersionRef = ref(0)
  watchEffect(() => {
    statsVersionRef.value = participant.statsVersion
  })

  // 常用属性的计算属性（使用官方 ATTRIBUTE_CODE 标准编码）
  const currentHealth = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.currentHealth)
  })
  const maxHealth = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.maxHealth)
  })
  const energy = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.currentEnergy)
  })
  const maxEnergy = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.maxEnergy)
  })
  const attack = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.attack)
  })
  const defense = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.defense)
  })
  const speed = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.speed)
  })
  const critRate = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.critRate)
  })
  const critDamage = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.critDamage)
  })
  const damageReduction = computed(() => {
    statsVersionRef.value
    return getFormatted(ATTRIBUTE_CODE.damageReduction)
  })

  return {
    getFormatted,
    getValue,
    getAttribute,
    getBreakdown,
    currentHealth,
    maxHealth,
    energy,
    maxEnergy,
    attack,
    defense,
    speed,
    critRate,
    critDamage,
    damageReduction,
  }
}

/**
 * 战斗属性类型（用于 UI 显示，使用官方 ATTRIBUTE_CODE 标准编码）
 */
export type CombatStatType =
  | 'currentHealth'
  | 'energy'
  | 'attack'
  | 'defense'
  | 'speed'
  | 'crit'

/**
 * 获取战斗属性显示名称
 */
export function getStatName(type: CombatStatType): string {
  const names: Record<CombatStatType, string> = {
    currentHealth: '气血',
    energy: '能量',
    attack: '攻击',
    defense: '防御',
    speed: '速度',
    crit: '暴击',
  }
  return names[type]
}
