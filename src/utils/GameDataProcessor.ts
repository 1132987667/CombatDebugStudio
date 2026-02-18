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

import { DataProcessor } from '@/utils/DataProcessor'
import { reactive } from 'vue'
import enemiesData from '@configs/enemies/enemies.json'
import scenesData from '@configs/scenes/scenes.json'
import skillsData from '@configs/skills/skills.json'
import buffsData from '@configs/buffs/buffs.json'
import type { Enemy, SkillConfig, SceneData, CharacterStats } from '@/types'
import type { UIBattleCharacter, AttributeValue, AttributeOption, AttributeValueType } from '@/types/UI/UIBattleCharacter'
import type { ParticipantSide } from '@/types/battle'
import { PARTICIPANT_SIDE } from '@/types/battle'
import { AttributeMetaMap, getAttributeMeta } from '@/types/attribute-meta'
import {
  BattleParticipantImpl,
} from '@/core/battle/BattleParticipantImpl'

/**
 * 游戏数据处理工具类
 * 提供纯静态方法和模块级缓存
 */
export class GameDataProcessor {
  /**
   * 获取属性值
   * 兼容 AttributeValue 对象和普通数字两种格式
   * @param value - 属性值（可能是 AttributeValue 或 number）
   * @returns number - 数值
   */
  static getAttributeValue(value: number | AttributeValue | undefined): number {
    if (value === undefined || value === null) return 0
    if (typeof value === 'number') return value
    if (typeof value === 'object' && 'value' in value) return value.value
    return 0
  }

  /**
   * 获取属性值类型
   * @param value - 属性值
   * @returns string - '数值' | '百分比'
   */
  static getAttributeValueType(value: number | AttributeValue | undefined): string {
    if (value === undefined || value === null) return '数值'
    if (typeof value === 'number') return '数值'
    if (typeof value === 'object' && 'valueType' in value) return value.valueType || '数值'
    return '数值'
  }

  /**
   * 获取属性来源选项
   * @param value - 属性值
   * @returns AttributeOption[] - 属性来源数组
   */
  static getAttributeOptions(value: number | AttributeValue | undefined): AttributeOption[] {
    if (value === undefined || value === null) return []
    if (typeof value === 'number') return []
    if (typeof value === 'object' && 'options' in value) return value.options || []
    return []
  }
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
   * 根据ID数组批量查找敌人
   * @param enemyIds - 敌人ID数组
   * @returns Enemy[] - 找到的敌人数组
   */
  static findEnemiesByIds(enemyIds: string[]): Enemy[] {
    return enemyIds
      .map((id) => {
        const cacheKey = `enemy_${id}`
        const cached = DataProcessor.getCachedData<Enemy>(cacheKey)
        if (cached) return cached
        const enemy = DataProcessor.find(enemiesData, (e) => e.id === id)
        if (enemy) {
          DataProcessor.setCachedData(cacheKey, enemy)
        }
        return enemy
      })
      .filter((enemy) => enemy !== undefined) as Enemy[]
  }

  /**
   * 根据被动技能计算属性加成
   * @param passiveSkills - 被动技能配置数组
   * @returns 包含各项属性加成的对象
   */
  static calculatePassiveSkillBonuses(passiveSkills: SkillConfig[]): {
    healthBonus: number
    attackBonus: number
    defenseBonus: number
    speedBonus: number
    critRate: number
    critDamage: number
    damageReduction: number
  } {
    const bonuses = GameDataProcessor.parsePassiveSkillBonuses(passiveSkills)

    const calcBonus = (attrBonuses: { value: number; valueType: AttributeValueType }[]): number => {
      return attrBonuses.reduce((sum, b) => {
        return b.valueType === '百分比' ? sum + b.value : sum + (b.value / 100)
      }, 0)
    }

    return {
      healthBonus: calcBonus(bonuses.health),
      attackBonus: calcBonus(bonuses.attack),
      defenseBonus: calcBonus(bonuses.defense),
      speedBonus: calcBonus(bonuses.speed),
      critRate: 10,
      critDamage: 125,
      damageReduction: 0,
    }
  }

  /**
   * 将Enemy转换为BattleParticipant
   * 复用enemyToBattleCharacter的属性计算逻辑，避免重复计算
   * @param enemy - 敌人数据
   * @param type - 参与者类型
   * @returns BattleParticipant - 包含完整战斗属性的参与者实例
   */
  static enemyToParticipantInfo(
    enemy: Enemy,
    type: ParticipantSide = PARTICIPANT_SIDE.ENEMY,
  ): BattleParticipantImpl {
    const getSkillsByIds = (skillIds: string[]): SkillConfig[] => {
      return skillIds
        .map((id) => {
          const skillCacheKey = `skill_${id}`
          const cachedSkill = DataProcessor.getCachedData<SkillConfig>(skillCacheKey)
          if (cachedSkill) return cachedSkill
          
          // 只进行精确匹配
          const skill = DataProcessor.find(skillsData, (s) => s.id === id) as SkillConfig | undefined
          
          if (skill) {
            DataProcessor.setCachedData(skillCacheKey, skill)
          } else {
            console.warn(`Skill with ID ${id} not found`)
          }
          return skill
        })
        .filter((skill): skill is SkillConfig => skill !== undefined)
    }

    const passiveSkillIds = GameDataProcessor.normalizeSkillIds(enemy.skills?.passive || [])
    const passiveSkills = getSkillsByIds(passiveSkillIds)
    
    const smallSkills = getSkillsByIds(GameDataProcessor.normalizeSkillIds(enemy.skills?.small || []))
    const ultimateSkills = getSkillsByIds(GameDataProcessor.normalizeSkillIds(enemy.skills?.ultimate || []))
    
    const bonuses = GameDataProcessor.calculatePassiveSkillBonuses(passiveSkills)

    const baseHealth = enemy.stats.health
    const baseAttack = (enemy.stats.minAttack + enemy.stats.maxAttack) / 2
    const baseDefense = enemy.stats.defense
    const baseSpeed = enemy.stats.speed

    const finalHealth = Math.floor(baseHealth * (1 + bonuses.healthBonus))
    const finalAttack = Math.floor(baseAttack * (1 + bonuses.attackBonus))
    const finalDefense = Math.floor(baseDefense * (1 + bonuses.defenseBonus))
    const finalSpeed = Math.floor(baseSpeed * (1 + bonuses.speedBonus))

    return new BattleParticipantImpl({
      id: enemy.id,
      name: enemy.name,
      type: type,
      team: type,
      level: enemy.level,
      maxHealth: finalHealth,
      currentHealth: finalHealth,
      minAttack: enemy.stats.minAttack,
      maxAttack: enemy.stats.maxAttack,
      defense: finalDefense,
      speed: finalSpeed,
      critRate: bonuses.critRate,
      critDamage: bonuses.critDamage,
      damageReduction: bonuses.damageReduction,
      healthBonus: bonuses.healthBonus * 100,
      attackBonus: bonuses.attackBonus * 100,
      defenseBonus: bonuses.defenseBonus * 100,
      speedBonus: bonuses.speedBonus * 100,
      skills: {
        small: smallSkills,
        passive: passiveSkills,
        ultimate: ultimateSkills,
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
      .map((id) => {
        const enemyCacheKey = `enemy_${id}`
        const cachedEnemy = DataProcessor.getCachedData<Enemy>(enemyCacheKey)
        if (cachedEnemy) return cachedEnemy
        const enemy = DataProcessor.find(enemiesData, (e) => e.id === id)
        if (enemy) {
          DataProcessor.setCachedData(enemyCacheKey, enemy)
        }
        return enemy
      })
      .filter((enemy): enemy is Enemy => enemy !== undefined)

    DataProcessor.setCachedData(cacheKey, enemies)
    return enemies
  }

  /**
   * 根据技能ID查找技能
   * 仅支持精确匹配，确保配置一致性
   */
  static findSkillById(skillId: string): SkillConfig | undefined {
    const cacheKey = `skill_${skillId}`
    const cached = DataProcessor.getCachedData<SkillConfig>(cacheKey)
    if (cached) return cached

    // 只进行精确匹配
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

    const enemyCacheKey = `enemy_${id}`
    const cachedEnemy = DataProcessor.getCachedData<Enemy>(enemyCacheKey)
    const enemy = cachedEnemy || DataProcessor.find(enemiesData, (e) => e.id === id)
    if (!enemy) return {}

    if (!cachedEnemy) {
      DataProcessor.setCachedData(enemyCacheKey, enemy)
    }

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
   * 根据buff ID查找buff配置
   */
  static findBuffById(buffId: string): any {
    return buffsData.find((b: any) => b.id === buffId)
  }

  /**
   * 从被动技能中解析属性加成
   * @param passiveSkills - 被动技能配置数组
   * @returns 属性加成映射，包含来源详情
   */
  static parsePassiveSkillBonuses(passiveSkills: SkillConfig[]): Record<string, { value: number; source: string; valueType: AttributeValueType }[]> {
    const bonuses: Record<string, { value: number; source: string; valueType: AttributeValueType }[]> = {
      health: [],
      attack: [],
      defense: [],
      speed: [],
    }

    for (const skill of passiveSkills) {
      if (skill.steps) {
        for (const step of skill.steps) {
          if (step.buffId) {
            const buff = GameDataProcessor.findBuffById(step.buffId)
            if (buff && buff.attributes) {
              for (const [attr, value] of Object.entries(buff.attributes)) {
                const numValue = typeof value === 'string' ? parseFloat(value) : value
                if (attr in bonuses) {
                  bonuses[attr].push({
                    value: numValue * 100,
                    source: buff.name || step.buffId,
                    valueType: '百分比',
                  })
                }
              }
            }
            if (buff && buff.onAdd) {
              const onAdd = buff.onAdd
              const attackMatch = onAdd.match(/attack\s*\*\s*([\d.]+)/)
              const defenseMatch = onAdd.match(/defense\s*\*\s*([\d.]+)/)
              const maxHealthMatch = onAdd.match(/maxHealth\s*\*\s*([\d.]+)/)
              const speedMatch = onAdd.match(/speed\s*[+-]\s*(\d+)/)
              const speedMultMatch = onAdd.match(/speed\s*\*\s*([\d.]+)/)

              if (attackMatch) {
                const percent = (parseFloat(attackMatch[1]) - 1) * 100
                bonuses.attack.push({
                  value: percent,
                  source: buff.name || step.buffId,
                  valueType: '百分比',
                })
              }
              if (defenseMatch) {
                const percent = (parseFloat(defenseMatch[1]) - 1) * 100
                bonuses.defense.push({
                  value: percent,
                  source: buff.name || step.buffId,
                  valueType: '百分比',
                })
              }
              if (maxHealthMatch) {
                const percent = (parseFloat(maxHealthMatch[1]) - 1) * 100
                bonuses.health.push({
                  value: percent,
                  source: buff.name || step.buffId,
                  valueType: '百分比',
                })
              }
              if (speedMatch) {
                bonuses.speed.push({
                  value: parseInt(speedMatch[1]),
                  source: buff.name || step.buffId,
                  valueType: '数值',
                })
              }
              if (speedMultMatch) {
                const percent = (parseFloat(speedMultMatch[1]) - 1) * 100
                bonuses.speed.push({
                  value: percent,
                  source: buff.name || step.buffId,
                  valueType: '百分比',
                })
              }
            }
          }
        }
      }
    }

    return bonuses
  }

  /**
   * 创建属性对象
   * @param baseValue - 基础值
   * @param passiveBonuses - 被动技能加成
   * @param attributeKey - 属性键名
   * @returns AttributeValue - 包含最终值和来源详情的属性对象
   */
  static createAttributeValue(
    baseValue: number,
    passiveBonuses: Record<string, { value: number; source: string; valueType: AttributeValueType }[]> = {},
    attributeKey: string = 'attack'
  ): AttributeValue {
    // 获取属性元数据
    const attributeMeta = getAttributeMeta(attributeKey)
    const isPercentage = attributeMeta?.isPercentage || false
    const valueType = isPercentage ? '百分比' : '数值'
    
    const options: AttributeOption[] = [
      {
        from: '基础',
        value: baseValue,
        valueType: valueType,
      },
    ]

    const bonuses = passiveBonuses[attributeKey] || []
    let totalBonus = 0

    for (const bonus of bonuses) {
      if (bonus.valueType === '百分比') {
        totalBonus += bonus.value
        options.push({
          from: '被动技能',
          sourceName: bonus.source,
          value: bonus.value,
          valueType: '百分比',
        })
      } else {
        totalBonus += bonus.value
        options.push({
          from: '被动技能',
          sourceName: bonus.source,
          value: bonus.value,
          valueType: '数值',
        })
      }
    }

    const finalValue = totalBonus !== 0 
      ? Math.floor(baseValue * (1 + totalBonus / 100)) + (bonuses.filter(b => b.valueType === '数值').reduce((sum, b) => sum + b.value, 0))
      : baseValue

    return {
      value: finalValue,
      valueType: valueType,
      options,
    }
  }

  /**
   * 创建百分比属性对象
   * @param basePercent - 基础百分比值
   * @param passiveBonuses - 被动技能加成
   * @param attributeKey - 属性键名
   * @returns AttributeValue
   */
  static createPercentAttributeValue(
    basePercent: number,
    passiveBonuses: Record<string, { value: number; source: string; valueType: AttributeValueType }[]> = {},
    attributeKey: string = 'attack'
  ): AttributeValue {
    // 获取属性元数据
    const attributeMeta = getAttributeMeta(attributeKey)
    const isPercentage = attributeMeta?.isPercentage || true
    const valueType = isPercentage ? '百分比' : '数值'
    
    const options: AttributeOption[] = [
      {
        from: '基础',
        value: basePercent,
        valueType: valueType,
      },
    ]

    const bonuses = passiveBonuses[attributeKey] || []

    for (const bonus of bonuses) {
      options.push({
        from: '被动技能',
        sourceName: bonus.source,
        value: bonus.value,
        valueType: bonus.valueType,
      })
    }

    const totalBonus = bonuses.reduce((sum, b) => sum + b.value, 0)
    const finalValue = basePercent + totalBonus

    return {
      value: finalValue,
      valueType: valueType,
      options,
    }
  }

  /**
   * 根据技能ID数组获取技能配置
   * @param skillIds - 技能ID数组
   * @returns SkillConfig[] - 技能配置数组
   */
  static getSkillByIds(skillIds: string[]): SkillConfig[] {
    return skillIds
      .map((id) => {
        const skillCacheKey = `skill_${id}`
        const cachedSkill = DataProcessor.getCachedData<SkillConfig>(skillCacheKey)
        if (cachedSkill) return cachedSkill
        
        // 只进行精确匹配
        const skill = DataProcessor.find(skillsData, (s) => s.id === id) as SkillConfig | undefined
        
        if (skill) {
          DataProcessor.setCachedData(skillCacheKey, skill)
        } else {
          console.warn(`Skill with ID ${id} not found`)
        }
        return skill
      })
      .filter((skill): skill is SkillConfig => skill !== undefined)
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
    const getSkillsByIds = (skillIds: string[]): SkillConfig[] => {
      return skillIds
        .map((id) => {
          const skillCacheKey = `skill_${id}`
          const cachedSkill = DataProcessor.getCachedData<SkillConfig>(skillCacheKey)
          if (cachedSkill) return cachedSkill
          
          // 只进行精确匹配
          const skill = DataProcessor.find(skillsData, (s) => s.id === id) as SkillConfig | undefined
          
          if (skill) {
            DataProcessor.setCachedData(skillCacheKey, skill)
          } else {
            console.warn(`Skill with ID ${id} not found`)
          }
          return skill
        })
        .filter((skill): skill is SkillConfig => skill !== undefined)
    }

    const passiveSkillIds = GameDataProcessor.normalizeSkillIds(enemy.skills?.passive || [])
    const passiveSkills = getSkillsByIds(passiveSkillIds)
    const passiveBonuses = GameDataProcessor.parsePassiveSkillBonuses(passiveSkills)

    const baseHealth = enemy.stats.health
    const baseAttack = Math.floor((enemy.stats.minAttack + enemy.stats.maxAttack) / 2)
    const baseDefense = enemy.stats.defense
    const baseSpeed = enemy.stats.speed

    return reactive({
      originalId: enemy.id,
      id: isEnemy
        ? `${PARTICIPANT_SIDE.ENEMY}_${index + 1}`
        : `${PARTICIPANT_SIDE.ALLY}_${index + 1}`,
      team: isEnemy ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY,
      name: enemy.name,
      level: enemy.level,
      maxHp: GameDataProcessor.createAttributeValue(baseHealth, passiveBonuses, 'health'),
      currentHp: baseHealth,
      maxMp: 100,
      currentMp: 100,
      currentEnergy: 0,
      maxEnergy: 150,
      minAttack: enemy.stats.minAttack,
      maxAttack: enemy.stats.maxAttack,
      attack: GameDataProcessor.createAttributeValue(baseAttack, passiveBonuses, 'attack'),
      defense: GameDataProcessor.createAttributeValue(baseDefense, passiveBonuses, 'defense'),
      speed: GameDataProcessor.createAttributeValue(baseSpeed, passiveBonuses, 'speed'),
      critRate: GameDataProcessor.createPercentAttributeValue(10, passiveBonuses, 'critRate'),
      critDamage: GameDataProcessor.createPercentAttributeValue(125, passiveBonuses, 'critDamage'),
      damageReduction: GameDataProcessor.createPercentAttributeValue(0, passiveBonuses, 'damageReduction'),
      healthBonus: GameDataProcessor.createPercentAttributeValue(0, passiveBonuses, 'health'),
      attackBonus: GameDataProcessor.createPercentAttributeValue(0, passiveBonuses, 'attack'),
      defenseBonus: GameDataProcessor.createPercentAttributeValue(0, passiveBonuses, 'defense'),
      speedBonus: GameDataProcessor.createPercentAttributeValue(0, passiveBonuses, 'speed'),
      enabled: index < 3,
      isFirst: index === 0,
      buffs: [],
      skills: {
        small: getSkillsByIds(GameDataProcessor.normalizeSkillIds(enemy.skills?.small || [])),
        passive: passiveSkills,
        ultimate: getSkillsByIds(GameDataProcessor.normalizeSkillIds(enemy.skills?.ultimate || [])),
      },
    }) as UIBattleCharacter
  }

  /**
   * 转换战斗参与者为UI角色
   * @param participant - 战斗参与者
   * @param index - 队伍中的索引位置
   * @returns UIBattleCharacter - UI层可用的角色对象
   */
  static participantToUIBattleCharacter(
    participant: BattleParticipantImpl,
    index: number = 0,
  ): UIBattleCharacter {
    // 生成缓存键
    const cacheKey = `ui_character_${participant.id}_${participant.currentHealth}_${participant.currentEnergy}_${participant.maxEnergy}`;
    
    // 尝试从缓存获取
    const cachedCharacter = DataProcessor.getCachedData<UIBattleCharacter>(cacheKey);
    if (cachedCharacter) {
      // 保留原有的UI特定属性
      cachedCharacter.enabled = index < 3;
      cachedCharacter.isFirst = index === 0;
      return cachedCharacter;
    }

    // 创建属性值对象
    const createAttributeValue = (value: number, type: string): AttributeValue => {
      // 映射属性键名到 attribute-meta.ts 中定义的键名
      const attributeKeyMap: Record<string, string> = {
        'health': 'currentHp',
        'attack': 'attack',
        'defense': 'defense',
        'speed': 'speed',
        'critRate': 'critRate',
        'critDamage': 'critDamage',
        'damageReduction': 'damageReduction',
        'healthBonus': 'healthBonus',
        'attackBonus': 'attackBonus',
        'defenseBonus': 'defenseBonus',
        'speedBonus': 'speedBonus'
      };
      
      const mappedKey = attributeKeyMap[type] || type;
      
      // 获取属性元数据
      const attributeMeta = getAttributeMeta(mappedKey)
      const isPercentage = attributeMeta?.isPercentage || (type !== 'health' && type !== 'attack' && type !== 'defense' && type !== 'speed')
      const valueType = isPercentage ? '百分比' : '数值'
      
      return {
        value,
        valueType: valueType,
        options: [
          {
            from: '基础',
            sourceName: '基础属性',
            value,
            valueType: valueType,
          },
        ],
      }
    }

    const character = reactive({
      originalId: participant.id,
      id: participant.id,
      team: participant.team,
      name: participant.name,
      level: participant.level,
      maxHp: createAttributeValue(participant.maxHealth, 'health'),
      currentHp: participant.currentHealth,
      maxMp: 100,
      currentMp: 100,
      currentEnergy: participant.currentEnergy,
      maxEnergy: participant.maxEnergy,
      minAttack: participant.minAttack,
      maxAttack: participant.maxAttack,
      attack: createAttributeValue(participant.attack, 'attack'),
      defense: createAttributeValue(participant.defense, 'defense'),
      speed: createAttributeValue(participant.speed, 'speed'),
      critRate: createAttributeValue(participant.critRate, 'critRate'),
      critDamage: createAttributeValue(participant.critDamage, 'critDamage'),
      damageReduction: createAttributeValue(participant.damageReduction, 'damageReduction'),
      healthBonus: createAttributeValue(participant.healthBonus, 'healthBonus'),
      attackBonus: createAttributeValue(participant.attackBonus, 'attackBonus'),
      defenseBonus: createAttributeValue(participant.defenseBonus, 'defenseBonus'),
      speedBonus: createAttributeValue(participant.speedBonus, 'speedBonus'),
      enabled: index < 3,
      isFirst: index === 0,
      buffs: [],
      skills: participant.skills,
    }) as UIBattleCharacter;
    
    // 缓存结果
    DataProcessor.setCachedData(cacheKey, character);
    
    return character;
  }

  /**
   * 将技能ID标准化为数组格式
   * @param skillIds - 技能ID（字符串、字符串数组或对象）
   * @returns 标准化后的技能ID数组
   */
  static normalizeSkillIds(skillIds: string | string[] | object | undefined): string[] {
    if (!skillIds) return []
    if (Array.isArray(skillIds)) {
      // 过滤掉非字符串元素
      return skillIds.filter(id => typeof id === 'string')
    }
    if (typeof skillIds === 'string') {
      return [skillIds]
    }
    // 如果是对象，返回空数组，防止出现[object Object]错误
    console.warn('技能ID格式错误，预期字符串或字符串数组，实际为对象:', skillIds)
    return []
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
          .map((id: string) => {
            const enemies = GameDataProcessor.findEnemiesByIds([id])
            return enemies.length > 0 ? enemies[0] : undefined
          })
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
