/**
 * 文件: GameDataProcessor.ts
 * 创建日期: 2026-02-09
 * 作者:
 * 功能: 游戏数据处理工具类
 * 描述: 专门处理游戏相关的数据操作，提供敌人、技能、场景等数据的加载和查询功能
 * 版本: 3.0.0
 */

import {
  ATTRIBUTE_CODE,
  ModifierSourceType,
  ModifierType,
} from '@/domain/attribute/types'
import {
  BattleParticipantImpl,
  type BattleParticipantData,
} from '@/domain/battle/entity/BattleParticipantImpl'
import { BattleEntity, ParticipantSide, BattleTriggerPhase } from '@/domain/battle/type/types'
import type {
  PassiveSkillConfig,
  PassiveSkillManager,
} from '@/domain/skill/PassiveSkillManager'
import type { SkillConfig } from '@/domain/skill/types'
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene'
import { Counter } from '@/shared/utils/Counter'
import { DataProcessor } from '@/shared/utils/DataProcessor'
import { toArray } from '@/shared/utils/Utils'
import enemiesDataRaw from '@configs/enemies/enemies.json'
import enemiesTestDataRaw from '@configs/enemies/enemies_test.json'
import scenesData from '@configs/scenes/scenes.json'
import passiveSkillsData from '@configs/skills/skill_passive.json'
import guardianPassiveSkillsData from '@configs/skills/skill_passive_guardian.json'
import passiveTestSkillsData from '@configs/skills/skill_passive_test.json'
import skillsData from '@configs/skills/skills.json'

const enemiesData = [
  ...(enemiesDataRaw as Enemy[]),
  ...(enemiesTestDataRaw as Enemy[]),
]
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
    return [
      ...skillsData,
      ...passiveSkillsData,
      ...guardianPassiveSkillsData,
      ...passiveTestSkillsData,
    ] as SkillConfig[]
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
    type: ParticipantSide = ParticipantSide.ENEMY,
    seatIndex: number = 0,
  ): BattleParticipantImpl {
    // 1. 解析被动技能并生成修饰符模板列表
    const passiveSkills = GameDataProcessor.getSkillByIds(
      enemy.skills?.passive ?? [],
    )

    // 3. 补全派生属性（配置只有 currentHealth/minAttack/maxAttack，但引擎需要 maxHealth）
    const stats = { ...enemy.stats } as Partial<Record<ATTRIBUTE_CODE, number>>
    if (
      !stats[ATTRIBUTE_CODE.maxHealth] &&
      stats[ATTRIBUTE_CODE.currentHealth]
    ) {
      stats[ATTRIBUTE_CODE.maxHealth] = stats[ATTRIBUTE_CODE.currentHealth]
    }

    // 将攻击力加成/气血加成的基础值提取出来，后续直接作为 PERCENTAGE 修饰符注入
    const attackBonusBase = stats[ATTRIBUTE_CODE.attackBonus] || 0
    const healthBonusBase = stats[ATTRIBUTE_CODE.healthBonus] || 0

    // 3. 构造标准初始化 DTO
    const initData: BattleParticipantData = {
      id: `[${type}]_${enemy.id}_${counter.next()}`,
      name: enemy.name,
      team: type,
      level: enemy.level,
      enabled: true,
      seatIndex,
      noAttack: enemy.noAttack ?? false,
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
    const curHp = participant.getAttrVal(ATTRIBUTE_CODE.currentHealth)
    if (curHp) {
      curHp.value = participant.getAttribute(ATTRIBUTE_CODE.maxHealth)
    }

    return participant
  }

  /** 将 triggerTimes 字符串映射到 BattleTriggerPhase */
  private static readonly TRIGGER_TIME_MAP: Record<string, BattleTriggerPhase> =
    {
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
      dodge: BattleTriggerPhase.DODGE,
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

      for (const rawTrigger of triggerTimes) {
        const phase = GameDataProcessor.TRIGGER_TIME_MAP[rawTrigger]
        if (!phase) {
          console.warn(`未知的被动触发时机: ${rawTrigger} (技能: ${skill.id})`)
          continue
        }

        // ponytail: 非 battle_start 无默认限制（undefined = 不限次数）
        const maxTriggerCount =
          skill.maxUses ?? (rawTrigger === 'battle_start' ? 1 : undefined)

        // ponytail: 多 trigger 共享 skillId，通过 id 后缀区分以便独立计数/冷却
        const config: PassiveSkillConfig = {
          id: `${entity.id}:${skill.id}:${rawTrigger}`,
          name: skill.name,
          description: skill.description || '',
          trigger: phase,
          skillId: skill.id,
          cooldown: skill.cooldown || 0,
          condition: skill.condition,
          maxTriggerCount,
          // 从 parameters 或顶层读取额外触发配置（兼容两种写法）
          triggerProbability:
            (skill.parameters?.triggerProbability as
              | number
              | undefined) ?? skill.triggerProbability,
          hpThreshold: skill.parameters?.hpThreshold as number | undefined,
        }

        passiveSkillManager.registerPassive(entity.id, config)
      }
    }
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
}
