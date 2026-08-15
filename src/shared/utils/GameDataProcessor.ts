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
import { SkillType } from '@/domain/skill/types'
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene'
import type {
  LineupData,
  ActorData,
  ExpTableConfig,
  EnemyRewardTableConfig,
  LevelDiffBonusConfig,
  AffixData,
  AffixLibraryData,
} from '@/domain/fengshen/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import type { Item } from '@/shared/types/Item'
import { Counter } from '@/shared/utils/Counter'
import { DataProcessor } from '@/shared/utils/DataProcessor'
import { toArray } from '@/shared/utils/Utils'
import { resolveAffixPlan, applyRandomAffixesByPool } from '@/shared/utils/affix'
import type { IDataSource } from '@/domain/port/IDataSource'
import { ConfigDataSource } from '@/shared/utils/ConfigDataSource'
import affixLibraryRaw from '@configs/affixes/affixes.json'
const counter = new Counter()

// NOTE: 引擎数据源（封神榜开发计划 §3.4）——默认 ConfigDataSource 兜底，
// 启动编排（main.ts bootstrap）完成种子导入后切换为 IdbDataSource。
let dataSource: IDataSource = new ConfigDataSource()

// NOTE: 天命词缀与 BOSS 绑定表（affixes.json 顶层配置，配置静态数据）。
//       与唤灵台「随机词缀」按钮同源读取——该绑定表不随封神榜编辑（affixes 表编辑只动词缀库本体）。
const MANDATE_BINDINGS: ReadonlyMap<string, string> = new Map(
  ((affixLibraryRaw as AffixLibraryData).mandate_bindings ?? []).map((b) => [b.boss_id, b.affix_id]),
)

/**
 * 游戏数据处理工具类
 * 提供纯静态方法和模块级缓存
 */
export class GameDataProcessor {
  /**
   * 切换引擎数据源（封神榜开发计划 §3.4）。
   * 切换后清空实体缓存，避免旧数据残留。
   */
  static setDataSource(source: IDataSource): void {
    dataSource = source
    DataProcessor.clearCache()
  }

  /**
   * 获取所有敌人数据
   */
  static getEnemiesData(): Enemy[] {
    return dataSource.getEnemies()
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

    const enemy = DataProcessor.find(dataSource.getEnemies(), (e) => e.id === enemyId)
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
        const enemy = DataProcessor.find(dataSource.getEnemies(), (e) => e.id === id)
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
    return dataSource.getSkills()
  }

  /** 获取所有 Buff 定义（统一 BuffJsonEntry 格式，与 BuffScriptRegistry 配置层同源） */
  static getBuffsData(): BuffJsonEntry[] {
    return dataSource.getBuffs()
  }

  /** 获取所有材料（materials 表，图鉴等消费方读取） */
  static getMaterialsData(): Item[] {
    return dataSource.getMaterials()
  }

  /** 获取词缀库（affixes 表；enemyToParticipant 按 affixPool 自动应用词缀时读取） */
  static getAffixesData(): AffixData[] {
    return dataSource.getAffixes()
  }

  /** 获取玩家升级经验表（params 域 exp_table；数据源不存在时返回 null，调用方回退默认） */
  static getExpTable(): ExpTableConfig | null {
    return dataSource.getExpTable()
  }

  /** 获取敌人经验与金钱基准表（params 域 enemy_reward_table） */
  static getEnemyRewardTable(): EnemyRewardTableConfig | null {
    return dataSource.getEnemyRewardTable()
  }

  /** 获取等级差经验加成规则（params 域 level_diff_bonus） */
  static getLevelDiffBonus(): LevelDiffBonusConfig | null {
    return dataSource.getLevelDiffBonus()
  }

  /**
   * 获取所有场景数据
   */
  static getScenesData(): SceneData[] {
    return dataSource.getScenes()
  }

  /** 获取所有预设阵容数据（lineups 表，场景 lineupId 展开用） */
  static getLineupsData(): LineupData[] {
    return dataSource.getLineups()
  }

  /** 根据阵容 ID 查找预设阵容 */
  static findLineupById(lineupId: string): LineupData | undefined {
    const cacheKey = `lineup_${lineupId}`
    const cached = DataProcessor.getCachedData<LineupData>(cacheKey)
    if (cached) return cached
    const lineup = DataProcessor.find(dataSource.getLineups(), (l) => l.id === lineupId)
    if (lineup) {
      DataProcessor.setCachedData(cacheKey, lineup)
    }
    return lineup
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

    // 3. 补全派生属性（配置只有 currentHealth/attack，但引擎需要 maxHealth）
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
      // NOTE: 阵营元素（克制矩阵用）——configs 敌人暂未建模 faction 字段，读扩展字段兼容
      faction: (enemy as Enemy & { faction?: string }).faction,
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
      const attrData = participant.getAttrValue(ATTRIBUTE_CODE.attack)
      if (attrData) {
        attrData.modifiers.push({
          sourceKey: 'bonus:attackBonus',
          sourceType: ModifierSourceType.BASE,
          attribute: ATTRIBUTE_CODE.attack,
          value: attackBonusBase,
          type: ModifierType.PERCENTAGE,
          description: '攻击加成',
        })
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

    // 7. 重新计算全部属性（使被动技能和配置加成的修饰符生效）
    participant.recalcAll()

    // 8. 词缀自动生效（W12 词缀闭环自动路径）：按 enemy.affixPool 解析词缀池并附加。
    //    buffTier 0 / 缺省 / 词缀库为空 → resolveAffixPlan 返回 null，跳过。
    //    词缀库取引擎数据源（affixes 表，封神榜编辑后 reload 生效）；天命绑定表为配置静态数据。
    const affixPlan = resolveAffixPlan(enemy, GameDataProcessor.getAffixesData(), MANDATE_BINDINGS)
    if (affixPlan && affixPlan.pool.length > 0 && affixPlan.count > 0) {
      applyRandomAffixesByPool([participant], () => affixPlan)
    }

    // 9. 初始满血（词缀可能含 maxHealth 修正，故在词缀应用后再同步 currentHealth）
    // ponytail: setAttributeBase 只改 base 不改 value，而 currentHealth 是运行时属性
    // （recalcAttribute 跳过），value 永不会从 base 同步，故直接写 value
    const curHp = participant.getAttrVal(ATTRIBUTE_CODE.currentHealth)
    if (curHp) {
      curHp.value = participant.getAttribute(ATTRIBUTE_CODE.maxHealth)
    }

    return participant
  }

  /**
   * 将封神榜角色（actors 表）转换为 BattleParticipant。
   * 技能按 skillType 分桶（small/ultimate/passive）；faction 供阵营克制矩阵使用。
   */
  static actorToParticipant(
    actor: ActorData,
    type: ParticipantSide = ParticipantSide.ALLY,
    seatIndex: number = 0,
  ): BattleParticipantImpl {
    const skillConfigs = GameDataProcessor.getSkillByIds(actor.skillIds)
    const initData: BattleParticipantData = {
      id: `[${type}]_${actor.id}_${counter.next()}`,
      name: actor.name,
      team: type,
      level: actor.level,
      enabled: true,
      seatIndex,
      noAttack: false,
      faction: actor.faction,
      skills: {
        small: skillConfigs.filter((s) => s.skillType === SkillType.SMALL),
        passive: skillConfigs.filter((s) => s.skillType === SkillType.PASSIVE),
        ultimate: skillConfigs.filter((s) => s.skillType === SkillType.ULTIMATE),
      },
      attributeValues: actor.stats as Partial<Record<ATTRIBUTE_CODE, number>>,
    }
    const participant = new BattleParticipantImpl(initData)
    participant.recalcAll()
    const curHp = participant.getAttrVal(ATTRIBUTE_CODE.currentHealth)
    if (curHp) {
      curHp.value = participant.getAttribute(ATTRIBUTE_CODE.maxHealth)
    }
    return participant
  }

  /**
   * 从参与者 id 解析原始 roleId（id 格式 [side]_sourceId_counter，sourceId 可含下划线且可数字结尾）。
   * 兼容纯 roleId 输入（已是 roleId 时原样返回），供场景快照/队伍导出的保存-加载对称还原。
   */
  static sourceRoleIdOf(participant: { id: string }): string {
    const m = /^\[(?:ALLY|ENEMY)\]_(.+)_\d+$/.exec(participant.id)
    return m ? m[1] : participant.id
  }

  /**
   * 将 roleId 解析为参战者：先查 actors（封神榜我方角色），再查 enemies（敌方）。
   * 两边都查不到返回 null（调用方负责日志/提示，避免"少人"静默开战）。
   * side/seatIndex 由调用方按语义决定。
   */
  static resolveRoleToParticipant(
    roleId: string,
    side: ParticipantSide,
    seatIndex: number,
    actors: readonly ActorData[],
  ): BattleParticipantImpl | null {
    const actor = actors.find((a) => a.id === roleId)
    if (actor) return GameDataProcessor.actorToParticipant(actor, side, seatIndex)
    const enemy = GameDataProcessor.findEnemyById(roleId)
    if (enemy) return GameDataProcessor.enemyToParticipant(enemy, side, seatIndex)
    return null
  }

  /**
   * 按预设阵容展开为参战者（场景 lineupId / 一键布阵）。
   * 按 seatIndex 排序；roleId 优先按敌人解析（敌方阵容），查不到的站位跳过。
   * 我方阵容引用角色（actors 表）的完整支持随演劫台接入。
   */
  static lineupToEnemies(lineup: LineupData): BattleParticipantImpl[] {
    const roles = [...lineup.roles].sort((a, b) => a.seatIndex - b.seatIndex)
    return roles
      .map((role) => {
        const enemy = GameDataProcessor.findEnemyById(role.roleId)
        if (!enemy) return null
        return GameDataProcessor.enemyToParticipant(enemy, ParticipantSide.ENEMY, role.seatIndex)
      })
      .filter((p): p is BattleParticipantImpl => p !== null)
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
    const scene = DataProcessor.find(dataSource.getScenes(), (s) => s.id === sceneId)
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
