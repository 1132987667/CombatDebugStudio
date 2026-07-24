/**
 * 文件：useBattleParticipant.ts
 * 创建日期：2026-04-08
 * 功能：战斗参与者 UI 绑定 Composable
 * 描述：提供 shallowReactive + computed 方案，实现 UI 层直接绑定 BattleEntity
 */

import {
  computed,
  toRef,
  type Ref,
  type ComputedRef,
} from 'vue'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { AttributeValue } from '@/domain/attribute/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/**
 * 战斗参与者属性集合（使用官方 ATTRIBUTE_CODE 标准编码）
 */
export interface ParticipantStats {
  /** 当前生命值 */
  currentHealth: AttributeValue
  /** 最大生命值 */
  maxHealth: AttributeValue
  /** 当前能量 */
  energy: AttributeValue
  /** 最大能量 */
  maxEnergy: AttributeValue
  /** 攻击力 */
  attack: AttributeValue
  /** 防御力 */
  defense: AttributeValue
  /** 速度 */
  speed: AttributeValue
  /** 暴击率 */
  critRate: AttributeValue
  /** 暴击伤害 */
  critDamage: AttributeValue
  /** 伤害减免 */
  damageReduction: AttributeValue
  /** 生命加成 */
  healthBonus: AttributeValue
  /** 攻击加成 */
  attackBonus: AttributeValue
  /** 防御加成 */
  defenseBonus: AttributeValue
  /** 速度加成 */
  speedBonus: AttributeValue
  /** 最小攻击 */
  minAttack: AttributeValue
  /** 最大攻击 */
  maxAttack: AttributeValue
}

/**
 * 战斗参与者 Composable 返回值
 */
export interface UseBattleParticipantReturn {
  /** 参与者实例 Ref（prop 变化时自动更新） */
  participant: Ref<BattleEntity>
  /** 是否存活 */
  isAlive: ComputedRef<boolean>
  /** 是否死亡 */
  isDead: ComputedRef<boolean>
  /** 生命百分比 */
  hpPercent: ComputedRef<number>
  /** 能量百分比 */
  energyPercent: ComputedRef<number>
  /** 获取指定属性（直接访问缓存） */
  getAttribute: (type: ATTRIBUTE_CODE) => AttributeValue | undefined
  /** 获取属性计算拆解（仅调试模式） */
  getBreakdown: (type: ATTRIBUTE_CODE) => any
}

/**
 * 战斗参与者 Composable
 * 使用 shallowReactive 避免深层代理开销，computed 缓存属性引用
 * @param participant BattleEntity 实例
 * @returns 响应式包装的参与者数据和属性
 */
export function useBattleParticipant(
  participantRef: Ref<BattleEntity>,
): UseBattleParticipantReturn {
  // 派生状态
  const isAlive = computed(() => {
    return participantRef.value.isAlive()
  })
  const isDead = computed(() => !isAlive.value)

  // 百分比计算（使用官方 ATTRIBUTE_CODE 标准编码）
  const hpPercent = computed(() => {
    const currentHealth = participantRef.value.currentHealth
    const maxHealth = participantRef.value.maxHealth
    return maxHealth > 0 ? (currentHealth / maxHealth) * 100 : 0
  })

  const energyPercent = computed(() => {
    const energy = participantRef.value.currentEnergy
    const maxEnergy = participantRef.value.maxEnergy
    return maxEnergy > 0 ? (energy / maxEnergy) * 100 : 0
  })

  // 直接访问属性的方法
  const getAttribute = (type: ATTRIBUTE_CODE): AttributeValue | undefined => {
    return participantRef.value.getAttributeValue(type)
  }

  // 获取属性计算拆解（仅调试模式）
  const getBreakdown = (type: ATTRIBUTE_CODE): any => {
    const attrValue = getAttribute(type)
    return attrValue?.breakdown || null
  }

  return {
    participant: participantRef,
    isAlive,
    isDead,
    hpPercent,
    energyPercent,
    getAttribute,
    getBreakdown,
  }
}

/**
 * 批量包装多个参与者
 * @param participants 参与者数组
 * @returns 包装后的参与者数组
 */
export function useBattleParticipants(
  participants: Ref<BattleEntity>[],
): UseBattleParticipantReturn[] {
  return participants.map((p) => useBattleParticipant(p))
}
