import { computed } from 'vue'
import { GameDataProcessor } from '@/utils/GameDataProcessor'
import type { UIBattleCharacter } from '@/types'

/**
 * 角色列表管理的组合式函数
 * 提供角色列表的过滤、排序等通用逻辑
 */
export function useCharacterList() {
  /**
   * 获取角色的速度值
   * @param char 角色对象
   * @returns 速度值
   */
  const getSpeed = (char: UIBattleCharacter | null): number => {
    if (!char) return 0
    return GameDataProcessor.getAttributeValue(char.speed)
  }

  /**
   * 过滤并排序盟友队伍
   * @param allyTeam 盟友队伍
   * @returns 过滤并排序后的盟友队伍
   */
  const filterAndSortAllyTeam = (allyTeam: UIBattleCharacter[]) => {
    return computed(() => {
      return allyTeam
        .filter((c) => c.enabled)
        .sort((a, b) => getSpeed(b) - getSpeed(a))
    })
  }

  /**
   * 过滤并排序敌人队伍
   * @param enemyTeam 敌人队伍
   * @returns 过滤并排序后的敌人队伍
   */
  const filterAndSortEnemyTeam = (enemyTeam: UIBattleCharacter[]) => {
    return computed(() => {
      return enemyTeam
        .filter((c) => c.enabled)
        .sort((a, b) => getSpeed(b) - getSpeed(a))
    })
  }

  /**
   * 获取角色在队伍中的顺序索引
   * @param charId 角色ID
   * @param allyTeam 盟友队伍
   * @param enemyTeam 敌人队伍
   * @returns 顺序索引（从1开始）
   */
  const getOrderIndex = (charId: string, allyTeam: UIBattleCharacter[], enemyTeam: UIBattleCharacter[]) => {
    const sortedAllyTeam = allyTeam
      .filter((c) => c.enabled)
      .sort((a, b) => getSpeed(b) - getSpeed(a))

    const sortedEnemyTeam = enemyTeam
      .filter((c) => c.enabled)
      .sort((a, b) => getSpeed(b) - getSpeed(a))

    const allyIndex = sortedAllyTeam.findIndex((c) => c.id === charId)
    if (allyIndex >= 0) return allyIndex + 1

    const enemyIndex = sortedEnemyTeam.findIndex((c) => c.id === charId)
    return enemyIndex >= 0 ? enemyIndex + 1 : 0
  }

  /**
   * 获取角色的HP百分比
   * @param char 角色对象
   * @returns HP百分比
   */
  const getHpPercent = (char: UIBattleCharacter | null): number => {
    if (!char) return 0
    const maxHp = typeof char.maxHp === 'object' ? GameDataProcessor.getAttributeValue(char.maxHp) : char.maxHp
    if (!maxHp) return 0
    return Math.max(0, (char.currentHp / maxHp) * 100)
  }

  /**
   * 获取角色的HP颜色类
   * @param char 角色对象
   * @returns HP颜色类名
   */
  const getHpColorClass = (char: UIBattleCharacter | null): string => {
    if (!char) return 'high'
    const maxHp = typeof char.maxHp === 'object' ? GameDataProcessor.getAttributeValue(char.maxHp) : char.maxHp
    if (!maxHp) return 'high'
    const percent = (char.currentHp / maxHp) * 100
    if (percent <= 25) return 'low'
    if (percent <= 50) return 'medium'
    return 'high'
  }

  /**
   * 获取角色的最大HP值
   * @param char 角色对象
   * @returns 最大HP值
   */
  const getMaxHp = (char: UIBattleCharacter | null): number => {
    if (!char) return 0
    return GameDataProcessor.getAttributeValue(char.maxHp)
  }

  /**
   * 获取角色的HP显示文本
   * @param char 角色对象
   * @returns HP显示文本
   */
  const getMemberHp = (char: UIBattleCharacter | null): string => {
    if (!char) return '0/0'
    const maxHp = getMaxHp(char)
    return `${char.currentHp}/${maxHp}`
  }

  /**
   * 获取角色的速度显示值
   * @param char 角色对象
   * @returns 速度显示值
   */
  const getMemberSpeed = (char: UIBattleCharacter | null): number => {
    if (!char) return 0
    return getSpeed(char)
  }

  return {
    getSpeed,
    filterAndSortAllyTeam,
    filterAndSortEnemyTeam,
    getOrderIndex,
    getHpPercent,
    getHpColorClass,
    getMaxHp,
    getMemberHp,
    getMemberSpeed
  }
}
