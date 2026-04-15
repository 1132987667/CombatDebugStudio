/**
 * 文件：useParticipantStats.ts
 * 创建日期：2026-04-08
 * 功能：参与者属性访问 Composable
 * 描述：提供便捷的属性访问和格式化功能
 */

import { computed, type ComputedRef } from 'vue'
import type { BattleEntity } from '@/types/battle'
import type { AttributeValue, AttributeCodes } from '@/types/attribute'
import { AttributeCodes } from '@/types/attribute'

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
 * 属性访问 Composable 返回值
 */
export interface UseParticipantStatsReturn {
  /** 获取格式化属性 */
  getFormatted: (type: AttributeCodes) => FormattedAttribute
  /** 获取属性值 */
  getValue: (type: AttributeCodes) => number
  /** 获取属性对象 */
  getAttribute: (type: AttributeCodes) => AttributeValue | undefined
  /** 获取计算拆解 */
  getBreakdown: (type: AttributeCodes) => any
  /** 生命值 */
  hp: ComputedRef<FormattedAttribute>
  /** 最大生命值 */
  maxHp: ComputedRef<FormattedAttribute>
  /** 能量 */
  energy: ComputedRef<FormattedAttribute>
  /** 最大能量 */
  maxEnergy: ComputedRef<FormattedAttribute>
  /** 攻击力 */
  atk: ComputedRef<FormattedAttribute>
  /** 防御力 */
  def: ComputedRef<FormattedAttribute>
  /** 速度 */
  spd: ComputedRef<FormattedAttribute>
  /** 暴击率 */
  critRate: ComputedRef<FormattedAttribute>
  /** 暴击伤害 */
  critDmg: ComputedRef<FormattedAttribute>
  /** 伤害减免 */
  dmgReduction: ComputedRef<FormattedAttribute>
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
  const getFormatted = (type: AttributeCodes): FormattedAttribute => {
    const attrValue = participant.getAttributeValue(type)
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
  const getValue = (type: AttributeCodes): number => {
    return participant.getAttributeValue(type)?.value ?? 0
  }

  // 获取属性对象
  const getAttribute = (type: AttributeCodes): AttributeValue | undefined => {
    return participant.getAttributeValue(type)
  }

  // 获取计算拆解
  const getBreakdown = (type: AttributeCodes): any => {
    return getAttribute(type)?.breakdown || null
  }

  // 常用属性的计算属性
  const hp = computed(() => getFormatted(AttributeCodes.currentHealth))
  const maxHp = computed(() => getFormatted(AttributeCodes.maxHealth))
  const energy = computed(() => getFormatted(AttributeCodes.energy))
  const maxEnergy = computed(() => getFormatted(AttributeCodes.maxEnergy))
  const atk = computed(() => getFormatted(AttributeCodes.attack))
  const def = computed(() => getFormatted(AttributeCodes.defense))
  const spd = computed(() => getFormatted(AttributeCodes.speed))
  const critRate = computed(() => getFormatted(AttributeCodes.critRate))
  const critDmg = computed(() => getFormatted(AttributeCodes.critDamage))
  const dmgReduction = computed(() =>
    getFormatted(AttributeCodes.damageReduction),
  )

  return {
    getFormatted,
    getValue,
    getAttribute,
    getBreakdown,
    hp,
    maxHp,
    energy,
    maxEnergy,
    atk,
    def,
    spd,
    critRate,
    critDmg,
    dmgReduction,
  }
}

/**
 * 战斗属性类型（用于 UI 显示）
 */
export type CombatStatType = 'hp' | 'energy' | 'atk' | 'def' | 'spd' | 'crit'

/**
 * 获取战斗属性显示名称
 */
export function getStatName(type: CombatStatType): string {
  const names: Record<CombatStatType, string> = {
    hp: '生命',
    energy: '能量',
    atk: '攻击',
    def: '防御',
    spd: '速度',
    crit: '暴击',
  }
  return names[type]
}

/**
 * 获取战斗属性图标
 */
export function getStatIcon(type: CombatStatType): string {
  const icons: Record<CombatStatType, string> = {
    hp: '❤️',
    energy: '⚡',
    atk: '⚔️',
    def: '🛡️',
    spd: '💨',
    crit: '🎯',
  }
  return icons[type]
}
