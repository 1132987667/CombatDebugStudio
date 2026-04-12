/**
 * 文件：useBattleParticipant.ts
 * 创建日期：2026-04-08
 * 功能：战斗参与者 UI 绑定 Composable
 * 描述：提供 shallowReactive + computed 方案，实现 UI 层直接绑定 BattleEntity
 */

import { computed, shallowReactive, type ShallowReactive } from 'vue'
import type { BattleEntity } from '@/types/battle'
import type { AttributeValue } from '@/types/attribute'
import { AttributeCodes } from '@/types/attribute'

/**
 * 战斗参与者属性集合
 */
export interface ParticipantStats {
  /** 当前生命值 */
  hp: AttributeValue
  /** 最大生命值 */
  maxHp: AttributeValue
  /** 当前能量 */
  energy: AttributeValue
  /** 最大能量 */
  maxEnergy: AttributeValue
  /** 攻击力 */
  atk: AttributeValue
  /** 防御力 */
  def: AttributeValue
  /** 速度 */
  spd: AttributeValue
  /** 暴击率 */
  critRate: AttributeValue
  /** 暴击伤害 */
  critDmg: AttributeValue
  /** 伤害减免 */
  dmgReduction: AttributeValue
  /** 生命加成 */
  hpBonus: AttributeValue
  /** 攻击加成 */
  atkBonus: AttributeValue
  /** 防御加成 */
  defBonus: AttributeValue
  /** 速度加成 */
  spdBonus: AttributeValue
  /** 最小攻击 */
  minAtk: AttributeValue
  /** 最大攻击 */
  maxAtk: AttributeValue
}

/**
 * 战斗参与者 Composable 返回值
 */
export interface UseBattleParticipantReturn {
  /** 参与者实例（浅代理） */
  participant: ShallowReactive<BattleEntity>
  /** 属性集合（计算属性缓存） */
  stats: Readonly<ParticipantStats>
  /** 是否存活 */
  isAlive: Readonly<boolean>
  /** 是否死亡 */
  isDead: Readonly<boolean>
  /** 生命百分比 */
  hpPercent: Readonly<number>
  /** 能量百分比 */
  energyPercent: Readonly<number>
  /** 获取指定属性（直接访问缓存） */
  getAttribute: (type: AttributeCodes) => AttributeValue | undefined
  /** 获取属性计算拆解（仅调试模式） */
  getBreakdown: (type: AttributeCodes) => any
}

/**
 * 战斗参与者 Composable
 * 使用 shallowReactive 避免深层代理开销，computed 缓存属性引用
 * @param participant BattleEntity 实例
 * @returns 响应式包装的参与者数据和属性
 */
export function useBattleParticipant(
  participant: BattleEntity,
): UseBattleParticipantReturn {
  console.log('useBattleParticipant', participant)
  // 使用浅代理，避免 Map 深层代理开销
  const shallowParticipant = shallowReactive<BattleEntity>(participant)

  // 使用 computed 缓存属性引用，避免重复调用 getAttributeValue
  const stats = computed<ParticipantStats>(() => ({
    hp: shallowParticipant.getAttributeValue(AttributeCodes.HP)!,
    maxHp: shallowParticipant.getAttributeValue(AttributeCodes.MAX_HP)!,
    energy: shallowParticipant.getAttributeValue(AttributeCodes.ENERGY)!,
    maxEnergy: shallowParticipant.getAttributeValue(AttributeCodes.MAX_ENERGY)!,
    atk: shallowParticipant.getAttributeValue(AttributeCodes.ATK)!,
    def: shallowParticipant.getAttributeValue(AttributeCodes.DEF)!,
    spd: shallowParticipant.getAttributeValue(AttributeCodes.SPD)!,
    critRate: shallowParticipant.getAttributeValue(AttributeCodes.CRIT_RATE)!,
    critDmg: shallowParticipant.getAttributeValue(AttributeCodes.CRIT_DMG)!,
    dmgReduction: shallowParticipant.getAttributeValue(
      AttributeCodes.DMG_REDUCTION,
    )!,
    hpBonus: shallowParticipant.getAttributeValue(AttributeCodes.HP_BONUS)!,
    atkBonus: shallowParticipant.getAttributeValue(AttributeCodes.ATK_BONUS)!,
    defBonus: shallowParticipant.getAttributeValue(AttributeCodes.DEF_BONUS)!,
    spdBonus: shallowParticipant.getAttributeValue(AttributeCodes.SPD_BONUS)!,
    minAtk: shallowParticipant.getAttributeValue(AttributeCodes.MIN_ATK)!,
    maxAtk: shallowParticipant.getAttributeValue(AttributeCodes.MAX_ATK)!,
  }))

  // 派生状态
  const isAlive = computed(() => shallowParticipant.isAlive())
  const isDead = computed(() => !isAlive.value)

  // 百分比计算
  const hpPercent = computed(() => {
    const hp = stats.value.hp.value
    const maxHp = stats.value.maxHp.value
    return maxHp > 0 ? (hp / maxHp) * 100 : 0
  })

  const energyPercent = computed(() => {
    const energy = stats.value.energy.value
    const maxEnergy = stats.value.maxEnergy.value
    return maxEnergy > 0 ? (energy / maxEnergy) * 100 : 0
  })

  // 直接访问属性的方法
  const getAttribute = (type: AttributeCodes): AttributeValue | undefined => {
    return shallowParticipant.getAttributeValue(type)
  }

  // 获取属性计算拆解（仅调试模式）
  const getBreakdown = (type: AttributeCodes): any => {
    const attrValue = getAttribute(type)
    return attrValue?.breakdown || null
  }

  return {
    participant: shallowParticipant,
    stats,
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
  participants: BattleEntity[],
): UseBattleParticipantReturn[] {
  return participants.map((p) => useBattleParticipant(p))
}
