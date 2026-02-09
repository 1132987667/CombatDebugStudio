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

/**
 * 游戏数据处理工具类
 * 提供单例模式和自动加载功能
 */
export class GameDataProcessor {
  private dataProcessor: DataProcessor
  private static instance: GameDataProcessor

  private constructor() {
    this.dataProcessor = new DataProcessor()
  }

  public static getInstance(): GameDataProcessor {
    if (!GameDataProcessor.instance) {
      GameDataProcessor.instance = new GameDataProcessor()
    }
    return GameDataProcessor.instance
  }

  /**
   * 获取所有敌人数据
   */
  getEnemiesData(): Enemy[] {
    return enemiesData
  }

  /**
   * 获取所有场景数据
   */
  getScenesData(): SceneData[] {
    return scenesData
  }

  /**
   * 根据ID查找敌人
   */
  findEnemyById(enemyId: string): Enemy | undefined {
    const cacheKey = `enemy_${enemyId}`
    const cached = this.dataProcessor.getCachedData<Enemy>(cacheKey)
    if (cached) return cached
    const enemy = DataProcessor.find(enemiesData, (e) => e.id === enemyId)
    if (enemy) {
      this.dataProcessor.setCachedData(cacheKey, enemy)
    }
    return enemy
  }

  /**
   * 根据名称搜索敌人
   */
  searchEnemiesByName(name: string, limit?: number): Enemy[] {
    const cacheKey = `enemy_search_${name}_${limit}`
    const cached = this.dataProcessor.getCachedData<Enemy[]>(cacheKey)
    if (cached) return cached

    const result = DataProcessor.search(enemiesData, {
      fields: ['name'],
      keyword: name,
      fuzzy: true,
    })

    const limitedResult = limit ? result.slice(0, limit) : result
    this.dataProcessor.setCachedData(cacheKey, limitedResult)
    return limitedResult
  }

  /**
   * 根据场景ID获取场景数据
   */
  findSceneById(sceneId: string): SceneData | undefined {
    const cacheKey = `scene_${sceneId}`
    const cached = this.dataProcessor.getCachedData<SceneData>(cacheKey)
    if (cached) return cached
    const scene = DataProcessor.find(scenesData, (s) => s.id === sceneId)
    if (scene) {
      this.dataProcessor.setCachedData(cacheKey, scene)
    }
    return scene
  }

  /**
   * 获取场景中的敌人数据
   */
  getSceneEnemies(
    sceneId: string,
    difficulty: 'easy' | 'normal' | 'hard' = 'easy',
  ): Enemy[] {
    const cacheKey = `scene_enemies_${sceneId}_${difficulty}`
    const cached = this.dataProcessor.getCachedData<Enemy[]>(cacheKey)
    if (cached) return cached
    const scene = this.findSceneById(sceneId)
    if (!scene) return []

    const enemyIds = scene.difficulties[difficulty]?.enemyIds || []
    const enemies = enemyIds
      .map((id) => this.findEnemyById(id))
      .filter((enemy): enemy is Enemy => enemy !== undefined)

    this.dataProcessor.setCachedData(cacheKey, enemies)
    return enemies
  }

  /**
   * 根据技能ID查找技能
   */
  findSkillById(skillId: string): SkillConfig | undefined {
    const cacheKey = `skill_${skillId}`
    const cached = this.dataProcessor.getCachedData<SkillConfig>(cacheKey)
    if (cached) return cached

    const skill = DataProcessor.find(skillsData, (s) => s.id === skillId)
    if (skill) {
      this.dataProcessor.setCachedData(cacheKey, skill)
    }
    return skill
  }

  /**
   * 获取角色的技能信息
   */
  getCharacterSkills(id: string): {
    small?: any
    passive?: any
    ultimate?: any
  } {
    if (!id) return {}

    const cacheKey = `character_skills_${id}`
    const cached = this.dataProcessor.getCachedData<any>(cacheKey)
    if (cached) return cached

    const enemy = this.findEnemyById(id)
    if (!enemy) return {}

    const skills: any = {}

    if (enemy.skills?.small?.[0]) {
      skills.small = this.findSkillById(enemy.skills.small[0])
    }
    if (enemy.skills?.passive?.[0]) {
      skills.passive = this.findSkillById(enemy.skills.passive[0])
    }
    if (enemy.skills?.ultimate?.[0]) {
      skills.ultimate = this.findSkillById(enemy.skills.ultimate[0])
    }

    this.dataProcessor.setCachedData(cacheKey, skills)
    return skills
  }

  /**
   * 转换敌人数据为战斗角色
   */
  createBattleCharacter(
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
   * 批量创建战斗角色
   */
  createBattleCharacters(
    enemies: Enemy[],
    startIndex: number = 0,
    isEnemyParty: boolean = false,
  ): CharacterStats[] {
    return enemies.map((enemy, index) =>
      this.createBattleCharacter(enemy, startIndex + index, isEnemyParty),
    )
  }

  /**
   * 过滤活跃角色
   */
  filterActiveCharacters(characters: CharacterStats[]): CharacterStats[] {
    return DataProcessor.filter(characters, {
      condition: (char) => char.enabled === true,
      sortBy: 'speed',
      sortDirection: 'desc',
    })
  }

  /**
   * 根据ID查找角色
   */
  findCharacterById(
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
  findCharacterByName(
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
  calculateStatBonus(character: CharacterStats, stat: string): number {
    if (!character.buffs) return 0

    const bonuses = character.buffs.filter((buff) => !buff.isPositive)
    if (stat === 'attack') return bonuses.length * 10
    if (stat === 'defense') return bonuses.length * 5
    return 0
  }

  /**
   * 计算伤害加成
   */
  calculateDamageBonus(character: CharacterStats): number {
    if (!character.buffs) return 0

    const bonuses = character.buffs.filter((buff) => buff.isPositive)
    return bonuses.length * 15
  }

  /**
   * 计算最终属性值
   */
  calculateFinalStat(character: CharacterStats, stat: string): number {
    const base = stat === 'attack' ? character.attack : character.defense
    const bonus = this.calculateStatBonus(character, stat)
    return Math.floor(base * (1 + bonus / 100))
  }

  /**
   * 获取角色生命值百分比
   */
  getHpPercent(character: CharacterStats): number {
    return Math.max(0, (character.currentHp / character.maxHp) * 100)
  }

  /**
   * 获取角色生命值颜色类别
   */
  getHpColorClass(character: CharacterStats): string {
    const percent = this.getHpPercent(character)
    if (percent <= 25) return 'low'
    if (percent <= 50) return 'medium'
    return 'high'
  }

  /**
   * 验证战斗角色数据
   */
  validateBattleCharacter(character: CharacterStats): {
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
  getCharacterPassiveSkill(character: CharacterStats): string {
    const skills = this.getCharacterSkills(character)
    return skills.passive?.name || ''
  }

  /**
   * 获取角色小技能
   */
  getCharacterSmallSkill(character: CharacterStats): string {
    const skills = this.getCharacterSkills(character)
    return skills.small?.name || ''
  }

  /**
   * 获取角色终极技能
   */
  getCharacterUltimateSkill(character: CharacterStats): string {
    const skills = this.getCharacterSkills(character)
    return skills.ultimate?.name || ''
  }

  /**
   * 分组场景敌人数据
   */
  groupEnemiesByScene(): Array<{ scene: SceneData; enemies: Enemy[] }> {
    const cacheKey = 'grouped_enemies'
    const cached = this.dataProcessor.getCachedData<any[]>(cacheKey)
    if (cached) return cached

    const grouped = scenesData
      .map((scene) => {
        const sceneEnemies = scene.difficulties.easy.enemyIds
          .map((id: string) => this.findEnemyById(id))
          .filter((enemy): enemy is Enemy => enemy !== undefined)

        return { scene, enemies: sceneEnemies }
      })
      .filter((group) => group.enemies.length > 0)

    this.dataProcessor.setCachedData(cacheKey, grouped)
    return grouped
  }

  /**
   * 搜索和过滤敌人数据
   */
  searchAndFilterEnemies(
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
      const scene = this.findSceneById(sceneId)
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
  getInjectableStatuses(): any[] {
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
  clearCache(): void {
    this.dataProcessor.clearCache()
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; keys: string[] } {
    // 这里需要访问内部缓存，但为了封装性，我们只返回基本信息
    return {
      size: 0, // 实际实现中需要计算缓存大小
      keys: [], // 实际实现中需要返回缓存键列表
    }
  }
}
