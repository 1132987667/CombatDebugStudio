/**
 * 文件: useCompendium.ts
 * 创建日期: 2026-03-07
 * 作者: CombatDebugStudio
 * 功能: 图鉴系统数据加载和状态管理
 * 描述: 提供敌人、buff/状态、物品数据的加载和查询功能
 * 版本: 1.0.0
 */

import { ref, computed } from 'vue'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { AtomicEffectType } from '@/domain/buff/atomic/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'

export interface CompendiumEnemy {
  id: string
  name: string
  level: number
  stats: {
    currentHealth: number
    attack: number
    defense: number
    speed: number
    critRate?: number
    critDamage?: number
  }
  drops: Array<{
    itemId: string
    quantity: number
    chance: number
  }>
  skills: {
    small?: string[]
    passive?: string[]
    ultimate?: string[]
  }
  description?: string
}

export interface CompendiumBuff {
  id: string
  name: string
  maxStacks: number
  duration: number
  /** 属性修正：标准 {value,type} 对象或旧字符串格式（"+10%"） */
  attributes?: Record<string, unknown>
  description?: string
  category?: string
  polarity?: string
}

export interface CompendiumSkill {
  id: string
  name: string
  description: string
  energyCost: number
  cooldown: number
  selector: string
  passiveCategory?: AtomicEffectType[]
}

export interface CompendiumItem {
  id: string
  name: string
  type: string
  description: string
  rarity: number
  effects?: Array<{ type: string; value: number }>
  stats?: Record<string, number>
  slot?: string
}

export type CompendiumTabType = 'enemy' | 'buff' | 'item'

export function useCompendium() {
  // NOTE: 数据源经 GameDataProcessor 出口读取（封神榜 IDB 写入后 BattleDataLoader 切换/刷新），
  //       图鉴与战斗引擎、封神榜编辑共享同一份数据，不再读静态 configs。
  const enemies = ref<CompendiumEnemy[]>([])
  const buffs = ref<CompendiumBuff[]>([])
  const skills = ref<CompendiumSkill[]>([])
  const items = ref<CompendiumItem[]>([])

  const isLoading = ref(false)

  /** 从引擎数据源重新装载（封神榜写操作后数据源已刷新，图鉴打开时调用） */
  function refresh(): void {
    enemies.value = GameDataProcessor.getEnemiesData() as unknown as CompendiumEnemy[]
    buffs.value = GameDataProcessor.getBuffsData() as unknown as CompendiumBuff[]
    skills.value = GameDataProcessor.getSkillsData() as unknown as CompendiumSkill[]
    items.value = GameDataProcessor.getMaterialsData() as unknown as CompendiumItem[]
  }

  refresh()

  const getEnemyById = (id: string): CompendiumEnemy | undefined => {
    return enemies.value.find((e) => e.id === id)
  }

  const getBuffById = (id: string): CompendiumBuff | undefined => {
    return buffs.value.find((b) => b.id === id)
  }

  const getItemById = (id: string): CompendiumItem | undefined => {
    return items.value.find((i) => i.id === id)
  }

  const getSkillById = (id: string): CompendiumSkill | undefined => {
    return skills.value.find((s) => s.id === id)
  }

  const getEnemySkills = (enemy: CompendiumEnemy): CompendiumSkill[] => {
    const skillIds = [
      ...(enemy.skills.small || []),
      ...(enemy.skills.passive || []),
    ]
    return skillIds
      .map((id) => getSkillById(id))
      .filter((s): s is CompendiumSkill => s !== undefined)
  }

  const enemyCount = computed(() => enemies.value.length)
  const buffCount = computed(() => buffs.value.length)
  const itemCount = computed(() => items.value.length)

  return {
    enemies,
    buffs,
    skills,
    items,
    isLoading,
    refresh,
    getEnemyById,
    getBuffById,
    getItemById,
    getSkillById,
    getEnemySkills,
    enemyCount,
    buffCount,
    itemCount,
  }
}
