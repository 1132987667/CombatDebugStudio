/**
 * 文件: useCompendium.ts
 * 创建日期: 2026-03-07
 * 作者: CombatDebugStudio
 * 功能: 图鉴系统数据加载和状态管理
 * 描述: 提供敌人、buff/状态、物品数据的加载和查询功能
 * 版本: 1.0.0
 */

import { ref, computed } from 'vue'
import enemiesData from '@configs/enemies/enemies.json'
import buffsData from '@configs/buffs/buffs.json'
import materialsData from '@configs/materials/materials.json'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'

export interface CompendiumEnemy {
  id: string
  name: string
  level: number
  stats: {
    health: number
    minAttack: number
    maxAttack: number
    defense: number
    speed: number
  }
  drops: Array<{
    itemId: string
    quantity: number
    chance: number
  }>
  skills: {
    small?: string[]
    passive?: string[]
  }
  description?: string
}

export interface CompendiumBuff {
  id: string
  name: string
  maxStacks: number
  duration: number
  attributes?: Record<string, string>
  description?: string
}

export interface CompendiumSkill {
  id: string
  name: string
  description: string
  energyCost: number
  cooldown: number
  selector: string
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
  const enemies = ref<CompendiumEnemy[]>(enemiesData as CompendiumEnemy[])
  const buffs = ref<CompendiumBuff[]>(buffsData as CompendiumBuff[])
  const skills = ref<CompendiumSkill[]>(GameDataProcessor.getSkillsData() as CompendiumSkill[])
  const items = ref<CompendiumItem[]>(materialsData as CompendiumItem[])

  const isLoading = ref(false)

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
