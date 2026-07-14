/**
 * 文件: GameDataProcessor.ts
 * 创建日期: 2026-02-09
 * 作者:
 * 功能: 游戏数据处理工具类
 * 描述: 专门处理游戏相关的数据操作，提供敌人、技能、场景等数据的加载和查询功能
 * 版本: 3.0.0
 */

import { DataProcessor } from '@/shared/utils/DataProcessor'
import enemiesDataRaw from '@configs/enemies/enemies.json'
const enemiesData = enemiesDataRaw as Enemy[]
import scenesData from '@configs/scenes/scenes.json'
import skillsData from '@configs/skills/skills.json'
import passiveSkillsData from '@configs/skills/skill_passive.json'
import newSkillsData from '@configs/skills/skills_new.json'
import guardianPassiveSkillsData from '@configs/skills/skill_passive_guardian.json'
import type { Enemy } from '@/shared/types/enemy'
import type { SkillConfig, SkillStep } from '@/domain/skill/types'
import type { SceneData } from '@/shared/types/scene'
import type { CharacterStats } from '@/domain/character/types'
import { ATTRIBUTE_CODE, ModifierType, ModifierSourceType, type Modifier } from '@/domain/attribute/types'
import type { ParticipantSide } from '@/domain/battle/type/types'
import { PARTICIPANT_SIDE, BattleTriggerPhase } from '@/domain/battle/type/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import {
  BattleParticipantImpl,
  type BattleParticipantData,
} from '@/domain/battle/entity/BattleParticipantImpl'
import type { PassiveSkillManager, PassiveSkillConfig } from '@/domain/skill/PassiveSkillManager'
import { toArray } from '@/shared/utils/Utils'
import { Counter } from '@/shared/utils/Counter'
const counter = new Counter()

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
   * 根据ID查找敌人
   * @param enemyId - 敌人ID
   * @returns Enemy | undefined - 找到的敌人数据
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
      .map((id) => {
        const cacheKey = `enemy_${id}`
        const cached = DataProcessor.getCachedData<Enemy>(cacheKey)
        if (cached) return cached
        const enemy = DataProcessor.find(enemiesData, (e) => e.id === id)
        if (enemy) {
          // ponytail: 先设 maxHealth 再缓存，避免后续修改副作用
          enemy.stats.maxHealth = enemy.stats.currentHealth
          DataProcessor.setCachedData(cacheKey, enemy)
        }
        return enemy
      })
      .filter((enemy) => enemy !== undefined) as Enemy[]
  }

  static getSkillsData(): SkillConfig[] {
    return (skillsData as any[]).concat(passiveSkillsData as any[], newSkillsData as any[], guardianPassiveSkillsData as any[]) as SkillConfig[]
  }

  /**
   * 获取所有场景数据
   */
  static getScenesData(): SceneData[] {
    return scenesData
  }



  /**
   * 将 Enemy 转换为 BattleParticipant（重构版）
   *
   * 改进点：
   * - 不再预先计算最终属性，只传入基础值
   * - 被动技能 modify_attribute 步骤的修饰符直接添加到参与者属性中
   * - 支持属性组成追踪和调试拆解
   *
   * @param enemy - 敌人数据
   * @param type - 参与者类型
   * @returns BattleParticipantImpl - 包含基础属性的参与者实例
   */
  static enemyToParticipant(
    enemy: Enemy,
    type: ParticipantSide = PARTICIPANT_SIDE.ENEMY,
  ): BattleParticipantImpl {

    // 1. 解析被动技能并生成修饰符模板列表
    const passiveSkills = GameDataProcessor.getSkillByIds(enemy.skills?.passive ?? [])

    // 3. 补全派生属性（配置只有 currentHealth/minAttack/maxAttack，但引擎需要 maxHealth）
    const stats = { ...enemy.stats } as Partial<Record<ATTRIBUTE_CODE, number>>
    if (!stats[ATTRIBUTE_CODE.maxHealth] && stats[ATTRIBUTE_CODE.currentHealth]) {
      stats[ATTRIBUTE_CODE.maxHealth] = stats[ATTRIBUTE_CODE.currentHealth]
    }

    // 将攻击力加成/气血加成的基础值提取出来，后续直接作为 PERCENTAGE 修饰符注入
    const attackBonusBase = stats[ATTRIBUTE_CODE.attackBonus] || 0
    const healthBonusBase = stats[ATTRIBUTE_CODE.healthBonus] || 0

    // 3. 构造标准初始化 DTO
    const initData: BattleParticipantData = {
      id: `[${type}]_${enemy.id}_${counter.next()}`,
      name: enemy.name,
      type,
      team: type,
      level: enemy.level,
      enabled: true,
      seatIndex: 0,
      skills: {
        small: GameDataProcessor.getSkillByIds(enemy.skills?.small ?? []),
        passive: passiveSkills,
        ultimate: GameDataProcessor.getSkillByIds(enemy.skills?.ultimate ?? []),
      },
      attributeValues: stats,
    }

    // 4. 实例化参与者（内部自动创建 AttributeValue 并标记 dirty）
    const participant = new BattleParticipantImpl(initData)

    // 6. 将配置中的 attackBonus/healthBonus 作为 PERCENTAGE 修饰符注入到对应属性
    if (attackBonusBase) {
      for (const attr of [ATTRIBUTE_CODE.minAttack, ATTRIBUTE_CODE.maxAttack]) {
        const attrData = participant.getAttrValue(attr)
        if (attrData) {
          attrData.modifiers.push({
            sourceKey: 'bonus:attackBonus',
            sourceType: ModifierSourceType.BASE,
            attribute: attr,
            value: attackBonusBase,
            type: ModifierType.PERCENTAGE,
            description: '攻击加成',
          })
        }
      }
    }
    if (healthBonusBase) {
      const hpData = participant.getAttrValue(ATTRIBUTE_CODE.maxHealth)
      if (hpData) {
        hpData.modifiers.push({
          sourceKey: 'bonus:healthBonus',
          sourceType: ModifierSourceType.BASE,
          attribute: ATTRIBUTE_CODE.maxHealth,
          value: healthBonusBase,
          type: ModifierType.PERCENTAGE,
          description: '气血加成',
        })
      }
    }

    // 7. 重新计算全部属性（使被动技能和配置加成的修饰符生效），初始满血
    participant.recalcAll()
    // ponytail: setAttributeBase 只改 base 不改 value，而 currentHealth 是运行时属性
    // （recalcAttribute 跳过），value 永不会从 base 同步，故直接写 value
    const curHp = participant.getAttrValue(ATTRIBUTE_CODE.currentHealth)
    if (curHp) {
      curHp.value = participant.getAttribute(ATTRIBUTE_CODE.maxHealth)
    }

    return participant
  }

  private static readonly ATTR_TO_BONUS_MAP: Partial<Record<ATTRIBUTE_CODE, ATTRIBUTE_CODE>> = {
    [ATTRIBUTE_CODE.speed]: ATTRIBUTE_CODE.speedBonus,
    [ATTRIBUTE_CODE.attack]: ATTRIBUTE_CODE.attackBonus,
    [ATTRIBUTE_CODE.defense]: ATTRIBUTE_CODE.defenseBonus,
    [ATTRIBUTE_CODE.maxHealth]: ATTRIBUTE_CODE.healthBonus,
    [ATTRIBUTE_CODE.minAttack]: ATTRIBUTE_CODE.attackBonus,
    [ATTRIBUTE_CODE.maxAttack]: ATTRIBUTE_CODE.attackBonus,
  }

  /**
   * 创建并添加一个修饰符到参与者，同时同步加成属性
   */
  private static pushModifier(
    participant: BattleParticipantImpl,
    skill: SkillConfig,
    mod: { id?: string; targetAttribute: string; type: string; value: number },
  ): void {
    const attrCode = mod.targetAttribute as ATTRIBUTE_CODE
    const modType = mod.type === 'PERCENTAGE' ? ModifierType.PERCENTAGE
      : mod.type === 'ADDITIVE' ? ModifierType.ADDITIVE
      : mod.type === 'MULTIPLICATIVE' ? ModifierType.MULTIPLICATIVE
      : mod.type === 'FINAL' ? ModifierType.FINAL
      : ModifierType.ADDITIVE

    // ponytail: buff aura 的 PERCENTAGE value 为 0.15（表示 15%），需 ×100 对齐 ModifierType 单位
    let value = typeof mod.value === 'number' ? mod.value : 0
    if (modType === ModifierType.PERCENTAGE && Math.abs(value) < 1) {
      value = Math.round(value * 10000) / 100
    }

    const sourceKey = `passive:${mod.id || skill.name}`
    const m: Modifier = {
      sourceKey,
      sourceType: ModifierSourceType.SKILL,
      attribute: attrCode,
      value,
      type: modType,
      description: skill.name,
    }

    const attrData = participant.getAttrValue(attrCode)
    if (attrData) {
      attrData.modifiers.push(m)
      attrData.cachedVersion = -1
    }

    // PERCENTAGE → 同步到加成属性
    if (modType === ModifierType.PERCENTAGE) {
      const bonusAttrCode = GameDataProcessor.ATTR_TO_BONUS_MAP[attrCode]
      if (bonusAttrCode) {
        const bonusMod: Modifier = {
          sourceKey,
          sourceType: ModifierSourceType.SKILL,
          attribute: bonusAttrCode,
          value,
          type: ModifierType.ADDITIVE,
          description: skill.name,
        }
        const bonusData = participant.getAttrValue(bonusAttrCode)
        if (bonusData) {
          bonusData.modifiers.push(bonusMod)
          bonusData.cachedVersion = -1
        }
      }
      // ponytail: PERCENTAGE 作用于 attack 时同步到 minAttack/maxAttack
      if (attrCode === ATTRIBUTE_CODE.attack) {
        for (const targetAttr of [ATTRIBUTE_CODE.minAttack, ATTRIBUTE_CODE.maxAttack]) {
          const targetData = participant.getAttrValue(targetAttr)
          if (targetData) {
            targetData.modifiers.push({
              sourceKey,
              sourceType: ModifierSourceType.SKILL,
              attribute: targetAttr,
              value,
              type: ModifierType.PERCENTAGE,
              description: skill.name,
            })
            targetData.cachedVersion = -1
          }
        }
      }
    }
  }

  /**
   * 将光环 aura 修饰符分发到指定的参与者
   * 由 BattleSystem.initialize 在 pending buff 循环后调用，处理 allies/enemies 光环
   */
  static applyAuraModifiersToParticipant(
    target: BattleParticipantImpl,
    sourceKey: string,
    modifiers: Array<{ targetAttribute: string; type: string; value: number }>,
  ): void {
    for (const mod of modifiers) {
      const attrCode = mod.targetAttribute as ATTRIBUTE_CODE
      const modType = mod.type === 'PERCENTAGE' ? ModifierType.PERCENTAGE
        : mod.type === 'ADDITIVE' ? ModifierType.ADDITIVE
        : mod.type === 'MULTIPLICATIVE' ? ModifierType.MULTIPLICATIVE
        : mod.type === 'FINAL' ? ModifierType.FINAL
        : ModifierType.ADDITIVE
      let value = typeof mod.value === 'number' ? mod.value : 0
      if (modType === ModifierType.PERCENTAGE && Math.abs(value) < 1) {
        value = Math.round(value * 10000) / 100
      }
      const m: Modifier = {
        sourceKey,
        sourceType: ModifierSourceType.SKILL,
        attribute: attrCode,
        value,
        type: modType,
        description: sourceKey,
      }
      const attrData = target.getAttrValue(attrCode)
      if (attrData) {
        attrData.modifiers.push(m)
        attrData.cachedVersion = -1
      }
    }
    target.recalcAll()
  }

  /** 将 triggerTimes 字符串映射到 BattleTriggerPhase */
  private static readonly TRIGGER_TIME_MAP: Record<string, BattleTriggerPhase> = {
    battle_start: BattleTriggerPhase.BATTLE_START,
    turn_start: BattleTriggerPhase.TURN_START,
    turn_end: BattleTriggerPhase.TURN_END,
    before_attack: BattleTriggerPhase.BEFORE_ATTACK,
    after_attack: BattleTriggerPhase.AFTER_ATTACK,
    on_hit: BattleTriggerPhase.ON_HIT,
    on_death: BattleTriggerPhase.ON_DEATH,
    on_kill: BattleTriggerPhase.ON_KILL,
    damage_taken: BattleTriggerPhase.DAMAGE_TAKEN,
    heal_received: BattleTriggerPhase.HEAL_RECEIVED,
    energy_gained: BattleTriggerPhase.ENERGY_GAINED,
    skill_use: BattleTriggerPhase.SKILL_USE,
    hp_lower_than: BattleTriggerPhase.HP_LOWER_THAN,
  }

  /**
   * 注册参与者的触发型被动技能到 PassiveSkillManager
   * 只有配置了 triggerTimes 的被动技能才会被注册
   * @param participant 参与者实体
   * @param passiveSkillManager PassiveSkillManager 实例
   */
  static registerParticipantPassives(
    entity: BattleEntity,
    passiveSkillManager: PassiveSkillManager,
  ): void {
    const passives = entity.skills?.passive
    if (!passives || passives.length === 0) return

    for (const skill of passives) {
      // ponytail: 统一管道 — 无 triggerTimes 的被动按 battle_start 注册
      const triggerTimes = skill.triggerTimes?.length
        ? skill.triggerTimes
        : [BattleTriggerPhase.BATTLE_START]

      const phase = GameDataProcessor.TRIGGER_TIME_MAP[triggerTimes[0]]
      if (!phase) {
        console.warn(`未知的被动触发时机: ${triggerTimes[0]} (技能: ${skill.id})`)
        continue
      }

      // ponytail: battle_start 被动默认触发 1 次
      const maxTriggerCount = skill.maxUses ?? (triggerTimes[0] === 'battle_start' ? 1 : undefined)

      const config: PassiveSkillConfig = {
        id: `${entity.id}:${skill.id}`,
        name: skill.name,
        description: skill.description || '',
        trigger: phase,
        skillId: skill.id,
        cooldown: skill.cooldown || 0,
        condition: skill.condition,
        maxTriggerCount,
        // 从 parameters 中读取额外触发配置
        triggerProbability: skill.parameters?.triggerProbability as number | undefined,
        hpThreshold: skill.parameters?.hpThreshold as number | undefined,
      }

      passiveSkillManager.registerPassive(entity.id, config)
    }
  }

  /**
   * 从被动技能构建结构化修饰符模板列表
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
    const skill = DataProcessor.find(
      GameDataProcessor.getSkillsData(),
      (s) => s.id === skillId,
    ) as SkillConfig | undefined

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
    small?: SkillConfig[]
    passive?: SkillConfig[]
    ultimate?: SkillConfig[]
  } {
    if (!id) return {}

    const cacheKey = `character_skills_${id}`
    const cached = DataProcessor.getCachedData(cacheKey)
    if (cached) return cached

    const enemyCacheKey = `enemy_${id}`
    const cachedEnemy = DataProcessor.getCachedData<Enemy>(enemyCacheKey)
    const enemy =
      cachedEnemy || DataProcessor.find(enemiesData, (e) => e.id === id)
    if (!enemy) return {}

    if (!cachedEnemy) {
      DataProcessor.setCachedData(enemyCacheKey, enemy)
    }

    const skills: Record<string, SkillConfig[] | undefined> = {}

    const smallIds = GameDataProcessor.normalizeSkillIds(enemy.skills?.small)
    const passiveIds = GameDataProcessor.normalizeSkillIds(
      enemy.skills?.passive,
    )
    const ultimateIds = GameDataProcessor.normalizeSkillIds(
      enemy.skills?.ultimate,
    )

    if (smallIds.length > 0) {
      skills.small = smallIds
        .map((id) => GameDataProcessor.findSkillById(id))
        .filter((s): s is SkillConfig => s !== undefined)
    }
    if (passiveIds.length > 0) {
      skills.passive = passiveIds
        .map((id) => GameDataProcessor.findSkillById(id))
        .filter((s): s is SkillConfig => s !== undefined)
    }
    if (ultimateIds.length > 0) {
      skills.ultimate = ultimateIds
        .map((id) => GameDataProcessor.findSkillById(id))
        .filter((s): s is SkillConfig => s !== undefined)
    }

    DataProcessor.setCachedData(cacheKey, skills)
    return skills
  }

  /**
   * 从被动技能中解析属性加成
   * @param passiveSkills - 被动技能配置数组
   * @returns 属性加成映射，包含来源详情
   */

  /**
   * 根据技能 ID 数组获取技能配置
   * @param skillIds - 技能 ID 数组
   * @returns SkillConfig[] - 技能配置数组
   */
  static getSkillByIds(skillIds: string[]): SkillConfig[] {
    return toArray(skillIds)
      .map((id) => {
        const skillCacheKey = `skill_${id}`
        const cachedSkill =
          DataProcessor.getCachedData<SkillConfig>(skillCacheKey)
        if (cachedSkill) return cachedSkill
        // 更新技能查找位置，包含新技能
        const skill = GameDataProcessor.findSkillById(id)
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
   * 将技能 ID 标准化为数组格式
   * @param skillIds - 技能 ID（字符串、字符串数组或对象）
   * @returns 标准化后的技能 ID 数组
   */
  static normalizeSkillIds(
    skillIds: string | string[] | object | undefined,
  ): string[] {
    if (!skillIds) return []
    if (Array.isArray(skillIds)) {
      // 过滤掉非字符串元素
      return skillIds.filter((id) => typeof id === 'string')
    }
    if (typeof skillIds === 'string') {
      return [skillIds]
    }
    // 如果是对象，返回空数组，防止出现[object Object]错误
    console.warn(
      '技能ID格式错误，预期字符串或字符串数组，实际为对象:',
      skillIds,
    )
    return []
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
    if (stat === ATTRIBUTE_CODE.attackBonus) return bonuses.length * 10
    if (stat === ATTRIBUTE_CODE.defenseBonus) return bonuses.length * 5
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
    return skills.passive?.map((s) => s.name).join(', ') || ''
  }

  /**
   * 获取角色小技能
   */
  static getCharacterSmallSkill(character: CharacterStats): string {
    const skills = GameDataProcessor.getCharacterSkills(
      character.originalId || '',
    )
    return skills.small?.map((s) => s.name).join(', ') || ''
  }

  /**
   * 获取角色终极技能
   */
  static getCharacterUltimateSkill(character: CharacterStats): string {
    const skills = GameDataProcessor.getCharacterSkills(
      character.originalId || '',
    )
    return skills.ultimate?.map((s) => s.name).join(', ') || ''
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
   * 清除所有缓存
   */
  static clearCache(): void {
    DataProcessor.clearCache()
  }
}
