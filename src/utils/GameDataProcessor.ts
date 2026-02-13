/**
 * 文件: GameDataProcessor.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 游戏数据处理工具类
 * 描述: 专门处理游戏相关的数据操作，提供敌人、技能、场景等数据的加载和查询功能
 * 版本: 1.0.0
 */

/**
 * 游戏数据处理工具类
 * 专门处理游戏相关的数据操作，提供游戏特定的API接口
 */

import { DataProcessor } from './DataProcessor'
import enemiesData from '@configs/enemies/enemies.json'
import scenesData from '@configs/scenes/scenes.json'
import skillsData from '@configs/skills/skills.json'
import type { Enemy, SkillConfig, SceneData, CharacterStats } from '@/types'
import type { UIBattleCharacter } from '@/types/UI/UIBattleCharacter'
import type { ParticipantSide } from '@/types/battle'
import { PARTICIPANT_SIDE } from '@/types/battle'
import {
  BattleParticipantImpl,
  type ParticipantInitData,
} from '@/core/battle/BattleParticipantImpl'

/**
 * 游戏数据处理工具类
 * 提供纯静态方法和模块级缓存
 */
export class GameDataProcessor {
  /**
   * 获取所有敌人数据
   */
  static getEnemiesData(): Enemy[] {
    return enemiesData
  }

  /**
   * 获取所有场景数据
   */
  static getScenesData(): SceneData[] {
    return scenesData
  }

  /**
   * 根据ID查找敌人
   */
  static findEnemyById(enemyId: string): Enemy | undefined {
    const cacheKey = `enemy_${enemyId}`
    const cached = DataProcessor.getCachedData<Enemy>(cacheKey)
    if (cached) return cached
    const enemy = DataProcessor.find(enemiesData, (e) => e.id === enemyId)
    if (enemy) {
      DataProcessor.setCachedData(cacheKey, enemy)
    }
    return enemy
  }

  /**
   * 根据ID数组批量查找敌人
   * @param enemyIds - 敌人ID数组
   * @returns Enemy[] - 找到的敌人数组
   */
  static findEnemiesByIds(enemyIds: string[]): Enemy[] {
    return enemyIds
      .map((id) => this.findEnemyById(id))
      .filter((enemy) => enemy !== undefined) as Enemy[]
  }

  /**
   * 将Enemy转换为BattleParticipant
   * 使用 BattleParticipantImpl 类创建参与者实例
   * @param enemy - 敌人数据
   * @param type - 参与者类型
   * @returns BattleParticipant - 包含完整战斗属性的参与者实例
   */
  static enemyToParticipantInfo(
    enemy: Enemy,
    type: ParticipantSide = PARTICIPANT_SIDE.ENEMY,
  ): BattleParticipantImpl {
    return new BattleParticipantImpl({
      id: enemy.id,
      name: enemy.name,
      type: type,
      level: enemy.level,
      maxHealth: enemy.stats.health,
      currentHealth: enemy.stats.health,
      minAttack: enemy.stats.minAttack,
      maxAttack: enemy.stats.maxAttack,
      defense: enemy.stats.defense,
      speed: enemy.stats.speed,
      skills: {
        small: GameDataProcessor.normalizeSkillIds(enemy.skills?.small),
        passive: GameDataProcessor.normalizeSkillIds(enemy.skills?.passive),
        ultimate: GameDataProcessor.normalizeSkillIds(enemy.skills?.ultimate),
      },
    })
  }

  /**
   * 根据名称搜索敌人
   */
  static searchEnemiesByName(name: string, limit?: number): Enemy[] {
    const cacheKey = `enemy_search_${name}_${limit}`
    const cached = DataProcessor.getCachedData<Enemy[]>(cacheKey)
    if (cached) return cached

    const result = DataProcessor.search(enemiesData, {
      fields: ['name'],
      keyword: name,
      fuzzy: true,
    })

    const limitedResult = limit ? result.slice(0, limit) : result
    DataProcessor.setCachedData(cacheKey, limitedResult)
    return limitedResult
  }

  /**
   * 根据场景ID获取场景数据
   */
  static findSceneById(sceneId: string): SceneData | undefined {
    const cacheKey = `scene_${sceneId}`
    const cached = DataProcessor.getCachedData<SceneData>(cacheKey)
    if (cached) return cached
    const scene = DataProcessor.find(scenesData, (s) => s.id === sceneId)
    if (scene) {
      DataProcessor.setCachedData(cacheKey, scene)
    }
    return scene
  }

  /**
   * 获取场景中的敌人数据
   */
  static getSceneEnemies(
    sceneId: string,
    difficulty: 'easy' | 'normal' | 'hard' = 'easy',
  ): Enemy[] {
    const cacheKey = `scene_enemies_${sceneId}_${difficulty}`
    const cached = DataProcessor.getCachedData<Enemy[]>(cacheKey)
    if (cached) return cached
    const scene = GameDataProcessor.findSceneById(sceneId)
    if (!scene) return []

    const enemyIds = scene.difficulties[difficulty]?.enemyIds || []
    const enemies = enemyIds
      .map((id) => GameDataProcessor.findEnemyById(id))
      .filter((enemy): enemy is Enemy => enemy !== undefined)

    DataProcessor.setCachedData(cacheKey, enemies)
    return enemies
  }

  /**
   * 根据技能ID查找技能
   */
  static findSkillById(skillId: string): SkillConfig | undefined {
    const cacheKey = `skill_${skillId}`
    const cached = DataProcessor.getCachedData<SkillConfig>(cacheKey)
    if (cached) return cached

    const skill = DataProcessor.find(skillsData, (s) => s.id === skillId) as SkillConfig | undefined
    if (skill) {
      DataProcessor.setCachedData(cacheKey, skill)
    } else {
      console.warn(`Skill with ID ${skillId} not found`)
    }
    return skill
  }

  /**
   * 获取角色的技能信息
   */
  static getCharacterSkills(id: string): {
    small?: SkillConfig | undefined
    passive?: SkillConfig | undefined
    ultimate?: SkillConfig | undefined
  } {
    if (!id) return {}

    const cacheKey = `character_skills_${id}`
    const cached = DataProcessor.getCachedData(cacheKey)
    if (cached) return cached

    const enemy = GameDataProcessor.findEnemyById(id)
    if (!enemy) return {}

    const skills: any = {}

    const smallIds = GameDataProcessor.normalizeSkillIds(enemy.skills?.small)
    const passiveIds = GameDataProcessor.normalizeSkillIds(enemy.skills?.passive)
    const ultimateIds = GameDataProcessor.normalizeSkillIds(enemy.skills?.ultimate)

    if (smallIds[0]) {
      skills.small = GameDataProcessor.findSkillById(smallIds[0])
    }
    if (passiveIds[0]) {
      skills.passive = GameDataProcessor.findSkillById(passiveIds[0])
    }
    if (ultimateIds[0]) {
      skills.ultimate = GameDataProcessor.findSkillById(ultimateIds[0])
    }

    DataProcessor.setCachedData(cacheKey, skills)
    return skills
  }

  /**
   * 转换敌人数据为战斗角色
   */
  static createBattleCharacter(
    enemy: Enemy,
    index: number,
    isEnemyParty: boolean = false,
  ): CharacterStats {
    return {
      originalId: enemy.id,
      id: isEnemyParty ? `enemy_${index + 1}` : `char_${index + 1}`,
      name: enemy.name,
      level: enemy.level,
      maxHp: enemy.stats.health,
      currentHp: enemy.stats.health,
      maxMp: 100,
      currentMp: 100,
      currentEnergy: 0,
      maxEnergy: 150,
      attack: Math.floor((enemy.stats.minAttack + enemy.stats.maxAttack) / 2),
      defense: enemy.stats.defense,
      speed: enemy.stats.speed,
      enabled: index < 3,
      isFirst: index === 0,
      buffs:
        index === 0
          ? [
              {
                id: isEnemyParty ? 'debuff_1' : 'buff_1',
                name: isEnemyParty ? '灼烧' : '力量祝福',
                remainingTurns: isEnemyParty ? 2 : 5,
                isPositive: !isEnemyParty,
              },
            ]
          : [],
    }
  }

  /**
   * 转换敌人数据为UI角色
   * @param enemy - 敌人数据
   * @param index - 队伍中的索引位置
   * @param isEnemy - 是否为敌方队伍
   * @returns UIBattleCharacter - UI层可用的角色对象
   */
  static enemyToBattleCharacter(
    enemy: Enemy,
    index: number,
    isEnemy: boolean = false,
  ): UIBattleCharacter {
    return {    
      originalId: enemy.id,
      id: isEnemy
        ? `${PARTICIPANT_SIDE.ENEMY}_${index + 1}`
        : `${PARTICIPANT_SIDE.ALLY}_${index + 1}`,
      team: isEnemy ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY,
      name: enemy.name,
      level: enemy.level,
      maxHp: enemy.stats.health,
      currentHp: enemy.stats.health,
      maxMp: 100,
      currentMp: 100,
      currentEnergy: 0,
      maxEnergy: 150,
      minAttack: enemy.stats.minAttack,
      maxAttack: enemy.stats.maxAttack,
      attack: Math.floor((enemy.stats.minAttack + enemy.stats.maxAttack) / 2),
      defense: enemy.stats.defense,
      speed: enemy.stats.speed,
      critRate: 10,
      critDamage: 125,
      damageReduction: 0,
      healthBonus: 0,
      attackBonus: 0,
      defenseBonus: 0,
      speedBonus: 0,
      enabled: index < 3,
      isFirst: index === 0,
      buffs: [],
      skills: {
        small: GameDataProcessor.getSkillByIds(enemy.skills?.small || []),
        passive: GameDataProcessor.getSkillByIds(enemy.skills?.passive || []),
        ultimate: GameDataProcessor.getSkillByIds(enemy.skills?.ultimate || []),
      },
    }
  }

  /**
   * 将技能ID标准化为数组格式
   * @param skillIds - 技能ID（字符串或字符串数组）
   * @returns 标准化后的技能ID数组
   */
  static normalizeSkillIds(skillIds: string | string[] | undefined): string[] {
    if (!skillIds) return []
    return Array.isArray(skillIds) ? skillIds : [skillIds]
  }

  /**
   * 根据技能ID数组获取有效的技能配置
   * @param skillIds - 技能ID数组
   * @returns 有效的技能配置数组
   */
  static getSkillByIds (skillIds: string[]): SkillConfig[] {
    if (!skillIds || skillIds.length === 0) return []
    let validSkills: SkillConfig[] = []
    for (const id of skillIds) {
      const skill = GameDataProcessor.findSkillById(id)
      if (skill) {
        validSkills.push(skill)
      }
    }
    return validSkills
  }

  /**
   * 批量创建战斗角色
   */
  static createBattleCharacters(
    enemies: Enemy[],
    startIndex: number = 0,
    isEnemyParty: boolean = false,
  ): CharacterStats[] {
    return enemies.map((enemy, index) =>
      GameDataProcessor.createBattleCharacter(
        enemy,
        startIndex + index,
        isEnemyParty,
      ),
    )
  }

  /**
   * 过滤活跃角色
   */
  static filterActiveCharacters(
    characters: CharacterStats[],
  ): CharacterStats[] {
    return DataProcessor.filter(characters, {
      condition: (char) => char.enabled === true,
      sortBy: 'speed',
      sortDirection: 'desc',
    })
  }

  /**
   * 根据ID查找角色
   */
  static findCharacterById(
    characters: CharacterStats[],
    enemyParty: CharacterStats[],
    characterId: string,
  ): CharacterStats | undefined {
    return (
      DataProcessor.find(characters, (c) => c.id === characterId) ||
      DataProcessor.find(enemyParty, (e) => e.id === characterId)
    )
  }

  /**
   * 根据名称查找角色
   */
  static findCharacterByName(
    characters: CharacterStats[],
    enemyParty: CharacterStats[],
    name: string,
  ): CharacterStats | undefined {
    return (
      DataProcessor.find(characters, (c) => c.name === name) ||
      DataProcessor.find(enemyParty, (e) => e.name === name)
    )
  }

  /**
   * 计算角色属性加成
   */
  static calculateStatBonus(character: CharacterStats, stat: string): number {
    if (!character.buffs) return 0

    const bonuses = character.buffs.filter((buff) => !buff.isPositive)
    if (stat === 'attack') return bonuses.length * 10
    if (stat === 'defense') return bonuses.length * 5
    return 0
  }

  /**
   * 计算伤害加成
   */
  static calculateDamageBonus(character: CharacterStats): number {
    if (!character.buffs) return 0

    const bonuses = character.buffs.filter((buff) => buff.isPositive)
    return bonuses.length * 15
  }

  /**
   * 计算最终属性值
   */
  static calculateFinalStat(character: CharacterStats, stat: string): number {
    const base = stat === 'attack' ? character.attack : character.defense
    const bonus = GameDataProcessor.calculateStatBonus(character, stat)
    return Math.floor(base * (1 + bonus / 100))
  }

  /**
   * 获取角色生命值百分比
   */
  static getHpPercent(character: CharacterStats): number {
    return Math.max(0, (character.currentHp / character.maxHp) * 100)
  }

  /**
   * 获取角色生命值颜色类别
   */
  static getHpColorClass(character: CharacterStats): string {
    const percent = GameDataProcessor.getHpPercent(character)
    if (percent <= 25) return 'low'
    if (percent <= 50) return 'medium'
    return 'high'
  }

  /**
   * 验证战斗角色数据
   */
  static validateBattleCharacter(character: CharacterStats): {
    isValid: boolean
    errors: string[]
  } {
    return DataProcessor.validate(character, [
      { field: 'id', type: 'required', message: '角色ID是必填字段' },
      { field: 'name', type: 'required', message: '角色名称是必填字段' },
      {
        field: 'level',
        type: 'number',
        min: 1,
        max: 100,
        message: '等级必须在1-100之间',
      },
      {
        field: 'maxHp',
        type: 'number',
        min: 1,
        message: '最大生命值必须大于0',
      },
      {
        field: 'currentHp',
        type: 'number',
        min: 0,
        message: '当前生命值不能为负数',
      },
      { field: 'attack', type: 'number', min: 0, message: '攻击力不能为负数' },
      { field: 'defense', type: 'number', min: 0, message: '防御力不能为负数' },
      { field: 'speed', type: 'number', min: 0, message: '速度不能为负数' },
    ])
  }

  /**
   * 获取角色被动技能
   */
  static getCharacterPassiveSkill(character: CharacterStats): string {
    const skills = GameDataProcessor.getCharacterSkills(
      character.originalId || '',
    )
    return skills.passive?.name || ''
  }

  /**
   * 获取角色小技能
   */
  static getCharacterSmallSkill(character: CharacterStats): string {
    const skills = GameDataProcessor.getCharacterSkills(
      character.originalId || '',
    )
    return skills.small?.name || ''
  }

  /**
   * 获取角色终极技能
   */
  static getCharacterUltimateSkill(character: CharacterStats): string {
    const skills = GameDataProcessor.getCharacterSkills(
      character.originalId || '',
    )
    return skills.ultimate?.name || ''
  }

  /**
   * 分组场景敌人数据
   */
  static groupEnemiesByScene(): Array<{ scene: SceneData; enemies: Enemy[] }> {
    const cacheKey = 'grouped_enemies'
    const cached = DataProcessor.getCachedData<any[]>(cacheKey)
    if (cached) return cached

    const grouped = scenesData
      .map((scene) => {
        const sceneEnemies = scene.difficulties.easy.enemyIds
          .map((id: string) => GameDataProcessor.findEnemyById(id))
          .filter((enemy): enemy is Enemy => enemy !== undefined)

        return { scene, enemies: sceneEnemies }
      })
      .filter((group) => group.enemies.length > 0)

    DataProcessor.setCachedData(cacheKey, grouped)
    return grouped
  }

  /**
   * 搜索和过滤敌人数据
   */
  static searchAndFilterEnemies(
    searchQuery: string,
    sceneId?: string,
  ): { grouped: Array<{ scene: SceneData; enemies: Enemy[] }>; all: Enemy[] } {
    let allEnemies = [...enemiesData]

    // 按名称搜索
    if (searchQuery.trim()) {
      allEnemies = DataProcessor.search(allEnemies, {
        fields: ['name'],
        keyword: searchQuery,
        fuzzy: true,
      })
    }

    // 按场景过滤
    if (sceneId) {
      const scene = GameDataProcessor.findSceneById(sceneId)
      if (scene) {
        const sceneEnemyIds = new Set([
          ...scene.difficulties.easy.enemyIds,
          ...scene.difficulties.normal.enemyIds,
          ...scene.difficulties.hard.enemyIds,
        ])
        allEnemies = allEnemies.filter((enemy) => sceneEnemyIds.has(enemy.id))
      }
    }

    const grouped = scenesData
      .map((scene) => {
        const sceneEnemies = allEnemies.filter(
          (enemy) =>
            scene.difficulties.easy.enemyIds.includes(enemy.id) ||
            scene.difficulties.normal.enemyIds.includes(enemy.id) ||
            scene.difficulties.hard.enemyIds.includes(enemy.id),
        )
        return { scene, enemies: sceneEnemies }
      })
      .filter((group) => group.enemies.length > 0)

    return { grouped, all: allEnemies }
  }

  /**
   * 获取所有可用的状态效果
   */
  static getInjectableStatuses(): any[] {
    return [
      {
        id: 'burn',
        name: '灼烧',
        duration: 3,
        effect: '伤害:15/回合',
        active: false,
        isPositive: false,
      },
      {
        id: 'power',
        name: '力量祝福',
        duration: 5,
        effect: 'ATK+20%',
        active: true,
        isPositive: true,
      },
      {
        id: 'weak',
        name: '虚弱',
        duration: 2,
        effect: 'DEF-30%',
        active: false,
        isPositive: false,
      },
      {
        id: 'poison',
        name: '中毒',
        duration: 4,
        effect: '伤害:20/回合',
        active: false,
        isPositive: false,
      },
      {
        id: 'shield',
        name: '护盾',
        duration: 3,
        effect: '吸收100伤害',
        active: false,
        isPositive: true,
      },
    ]
  }

  /**
   * 清除所有缓存
   */
  static clearCache(): void {
    DataProcessor.clearCache()
  }

  /**
   * 获取缓存统计信息
   */
  static getCacheStats(): { size: number; keys: string[] } {
    return {
      size: 0,
      keys: [],
    }
  }
}
