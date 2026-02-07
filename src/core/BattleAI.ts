import type {
  BattleParticipant,
  BattleAction,
  BattleState,
} from '@/types/battle'
import { logger } from '@/utils/logging'

/**
 * 战斗AI接口
 * 定义了AI在战斗中的核心行为和决策方法
 * 所有AI实现都必须遵循此接口规范
 */
export interface BattleAI {
  /**
   * 做出战斗决策
   */
  makeDecision(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAction

  /**
   * 选择目标
   */
  selectTarget(battleState: BattleState, participant: BattleParticipant): string

  /**
   * 检查是否应该使用技能
   */
  shouldUseSkill(participant: BattleParticipant): boolean

  /**
   * 选择技能
   */
  selectSkill(participant: BattleParticipant): string | null

  /**
   * 选择攻击
   */
  selectAttack(participant: BattleParticipant): BattleAction
}

/**
 * 技能类型枚举
 * 定义了游戏中技能的不同类型
 */
export enum SkillType {
  /** 被动技能 */
  PASSIVE = 'passive',
  /** 小技能 */
  SMALL = 'small',
  /** 终极技能（大招） */
  ULTIMATE = 'ultimate',
}

/**
 * 技能定义接口
 * 描述了技能的基本属性和效果
 */
export interface Skill {
  /** 技能唯一标识符 */
  id: string
  /** 技能名称 */
  name: string
  /** 技能类型 */
  type: SkillType
  /** 技能能量消耗 */
  energyCost: number
  /** 技能冷却时间（毫秒） */
  cooldown: number
  /** 技能上次使用时间戳 */
  lastUsed: number
  /** 技能描述 */
  description: string
  /** 技能伤害值（可选） */
  damage?: number
  /** 技能治疗值（可选） */
  heal?: number
  /** 技能附加的buff ID（可选） */
  buffId?: string
}

/**
 * 战场分析结果接口
 * 包含AI分析战场态势后得出的关键信息
 */
interface BattleAnalysis {
  /** 友方单位列表 */
  allies: BattleParticipant[]
  /** 敌方单位列表 */
  enemies: BattleParticipant[]
  /** 团队血量百分比 */
  teamHealthPercent: number
  /** 最高威胁的敌人 */
  highestThreatEnemy: { enemy: BattleParticipant | null; threat: number }
  /** 是否需要治疗 */
  needsHealing: boolean
  /** 是否应该使用技能 */
  shouldUseSkill: boolean
}

/**
 * 基础AI策略类
 * 提供了AI的通用实现，作为具体AI实现的基类
 * 包含技能管理、战场分析、决策逻辑等核心功能
 */
export class BaseBattleAI implements BattleAI {
  /** 技能集合，以技能ID为键 */
  protected skills: Map<string, Skill> = new Map()

  /**
   * 构造函数
   * 初始化AI实例并加载默认技能
   */
  constructor() {
    this.initializeSkills()
  }

  /**
   * 初始化技能
   * 子类应重写此方法添加特定技能
   */
  protected initializeSkills(): void {
    // 子类实现
  }

  public makeDecision(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAction {
    try {
      // 验证参数
      if (!battleState || !participant) {
        logger.error('AI决策参数无效:', { battleState, participant })
        return this.selectAttack(participant)
      }

      // 分析战场态势
      const battleAnalysis = this.analyzeBattleState(battleState, participant)

      // 基于战场分析做出决策
      if (battleAnalysis.shouldUseSkill) {
        const skillId = this.selectSkill(participant, battleAnalysis)
        if (skillId) {
          try {
            return this.createSkillStep(battleState, participant, skillId)
          } catch (skillError) {
            logger.error('技能执行出错:', skillError)
            return this.selectAttack(participant)
          }
        }
      }

      // 默认使用攻击
      return this.selectAttack(participant)
    } catch (error) {
      logger.error('AI决策出错:', error)
      try {
        return this.selectAttack(participant)
      } catch (attackError) {
        logger.error('攻击执行出错:', attackError)
        // 返回一个安全的默认行动
        return {
          id: `fallback_${Date.now()}`,
          type: 'attack',
          sourceId: participant?.id || 'unknown',
          targetId: 'unknown',
          damage: 10,
          success: true,
          timestamp: Date.now(),
          effects: [
            {
              type: 'damage',
              value: 10,
              description: '默认攻击',
            },
          ],
        }
      }
    }
  }

  /**
   * 分析战场态势
   */
  protected analyzeBattleState(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAnalysis {
    const allies = Array.from(battleState.participants.values()).filter(
      (p) => p.type === participant.type && p.isAlive(),
    )

    const enemies = Array.from(battleState.participants.values()).filter(
      (p) => p.type !== participant.type && p.isAlive(),
    )

    // 计算团队血量
    const teamHealth = allies.reduce((sum, p) => sum + p.currentHealth, 0)
    const teamMaxHealth = allies.reduce((sum, p) => sum + p.maxHealth, 0)
    const teamHealthPercent = teamMaxHealth > 0 ? teamHealth / teamMaxHealth : 0

    // 计算敌人威胁
    const highestThreatEnemy = enemies.reduce<{
      enemy: BattleParticipant | null
      threat: number
    }>(
      (max, enemy) => {
        const threat = this.calculateThreat(enemy, participant, battleState)
        return threat > max.threat ? { enemy, threat } : max
      },
      { enemy: null, threat: 0 },
    )

    // 检查是否有需要治疗的队友
    const needsHealing = allies.some((p) => p.currentHealth / p.maxHealth < 0.3)

    return {
      allies,
      enemies,
      teamHealthPercent,
      highestThreatEnemy,
      needsHealing,
      shouldUseSkill: this.shouldUseSkill(participant),
    }
  }

  public selectTarget(
    battleState: BattleState,
    _participant: BattleParticipant,
  ): string {
    const enemies = Array.from(battleState.participants.values())
      .filter((p) => p.type !== _participant.type && p.isAlive())
      .map((p) => p)

    if (enemies.length === 0) {
      throw new Error('No valid targets')
    }

    // 基于威胁值排序选择目标
    const targetsWithThreat = enemies.map((target) => ({
      target,
      threat: this.calculateThreat(target, _participant, battleState),
    }))

    // 按威胁值排序
    targetsWithThreat.sort((a, b) => b.threat - a.threat)

    return targetsWithThreat[0].target.id
  }

  /**
   * 计算目标的威胁值
   */
  protected calculateThreat(
    target: BattleParticipant,
    participant: BattleParticipant,
    _battleState: BattleState,
  ): number {
    let threat = 0

    // 基于血量
    const healthPercent = target.currentHealth / target.maxHealth
    threat += (1 - healthPercent) * 50 // 血量越低威胁越高

    // 基于能量
    const energyPercent = target.currentEnergy / target.maxEnergy
    threat += energyPercent * 30 // 能量越高威胁越高

    // 基于类型
    if (target.type === 'character' && participant.type === 'enemy') {
      threat += 20 // 敌人优先攻击角色
    }

    // 基于状态效果
    if (target.buffs.length > 0) {
      threat += target.buffs.length * 10 // 有buff的目标威胁更高
    }

    return threat
  }

  public shouldUseSkill(participant: BattleParticipant): boolean {
    // 检查能量是否足够
    const energy =
      participant.getAttribute('energy') || participant.currentEnergy || 0
    const maxEnergy =
      participant.getAttribute('max_energy') || participant.maxEnergy || 150

    // 能量达到70%以上考虑使用技能
    return energy >= maxEnergy * 0.7
  }

  public selectSkill(
    _participant: BattleParticipant,
    analysis?: BattleAnalysis,
  ): string | null {
    // 简单的技能选择逻辑
    const skills = Array.from(this.skills.values())
    if (skills.length === 0) {
      return null
    }

    // 基于战场分析的技能选择
    if (analysis) {
      // 优先选择治疗技能如果团队需要治疗
      if (analysis.needsHealing) {
        const healSkill = skills.find((s) => s.heal && s.heal > 0)
        if (healSkill) {
          return healSkill.id
        }
      }

      // 如果敌人威胁很高，优先选择高伤害技能
      if (analysis.highestThreatEnemy.threat > 50) {
        const damageSkill = skills.find((s) => s.damage && s.damage > 0)
        if (damageSkill) {
          return damageSkill.id
        }
      }
    }

    // 优先选择小技能
    const smallSkill = skills.find((s) => s.type === SkillType.SMALL)
    if (smallSkill) {
      return smallSkill.id
    }

    // 其次选择大招
    const ultimateSkill = skills.find((s) => s.type === SkillType.ULTIMATE)
    if (ultimateSkill) {
      return ultimateSkill.id
    }

    return null
  }

  public selectAttack(participant: BattleParticipant): BattleAction {
    return {
      id: `attack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'attack',
      sourceId: participant.id,
      targetId: '', // 会在makeDecision中设置
      damage: Math.floor(Math.random() * 20) + 10,
      success: true,
      timestamp: Date.now(),
      effects: [
        {
          type: 'damage',
          value: Math.floor(Math.random() * 20) + 10,
          description: `${participant.name} 普通攻击`,
        },
      ],
    }
  }

  /**
   * 选择治疗目标
   */
  protected selectHealTarget(
    battleState: BattleState,
    participant: BattleParticipant,
  ): string {
    // 收集所有友方目标
    const allies: { target: BattleParticipant; healthPercent: number }[] = []

    battleState.participants.forEach((target) => {
      // 只选择同类型的目标（角色选择角色，敌人选择敌人）
      if (target.type === participant.type && target.isAlive()) {
        const healthPercent = target.currentHealth / target.maxHealth
        allies.push({ target, healthPercent })
      }
    })

    // 按血量百分比排序，优先选择血量低的目标
    allies.sort((a, b) => a.healthPercent - b.healthPercent)

    // 返回血量最低的友方目标
    return allies.length > 0 ? allies[0].target.id : participant.id
  }

  protected createSkillStep(
    battleState: BattleState,
    participant: BattleParticipant,
    skillId: string,
  ): BattleAction {
    const skill = this.skills.get(skillId)

    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    // 根据技能类型选择目标
    let targetId = ''
    if (skill.heal) {
      // 治疗技能选择友方目标
      targetId = this.selectHealTarget(battleState, participant)
    } else {
      // 其他技能选择敌方目标
      targetId = this.selectTarget(battleState, participant)
    }

    const action: BattleAction = {
      id: `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'skill',
      sourceId: participant.id,
      targetId,
      skillId,
      success: true,
      timestamp: Date.now(),
      effects: [
        {
          type: 'status',
          description: `${participant.name} 使用 ${skill.name}`,
        },
      ],
    }

    // 添加技能效果
    if (skill.damage) {
      action.damage = skill.damage
      action.effects.push({
        type: 'damage',
        value: skill.damage,
        description: `造成 ${skill.damage} 伤害`,
      })
    }

    if (skill.heal) {
      action.heal = skill.heal
      action.effects.push({
        type: 'heal',
        value: skill.heal,
        description: `恢复 ${skill.heal} 生命值`,
      })
    }

    if (skill.buffId) {
      action.buffId = skill.buffId
      action.effects.push({
        type: 'buff',
        buffId: skill.buffId,
        description: `施加 ${skill.name} 效果`,
      })
    }

    return action
  }

  /**
   * 添加技能
   */
  public addSkill(skill: Skill): void {
    this.skills.set(skill.id, skill)
  }

  /**
   * 获取技能
   */
  public getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId)
  }

  /**
   * 获取所有技能
   */
  public getSkills(): Skill[] {
    return Array.from(this.skills.values())
  }
}

/**
 * 角色AI类
 * 为玩家角色提供特定的AI行为
 * 包含治疗优先、血量保护、智能技能选择等特性
 */
export class CharacterAI extends BaseBattleAI {
  /**
   * 初始化技能
   * 添加角色默认技能：治疗术、强力攻击、终极技能
   */
  protected initializeSkills(): void {
    // 默认角色技能
    this.addSkill({
      id: 'skill_heal',
      name: '治疗术',
      type: SkillType.SMALL,
      energyCost: 30,
      cooldown: 2000,
      lastUsed: 0,
      description: '恢复生命值',
      heal: 50,
    })

    this.addSkill({
      id: 'skill_attack',
      name: '强力攻击',
      type: SkillType.SMALL,
      energyCost: 25,
      cooldown: 1500,
      lastUsed: 0,
      description: '造成额外伤害',
      damage: 35,
    })

    this.addSkill({
      id: 'skill_ultimate',
      name: '终极技能',
      type: SkillType.ULTIMATE,
      energyCost: 100,
      cooldown: 5000,
      lastUsed: 0,
      description: '造成大量伤害',
      damage: 80,
    })
  }

  public shouldUseSkill(participant: BattleParticipant): boolean {
    // 角色特有逻辑
    const healthPercent = participant.currentHealth / participant.maxHealth

    // 血量低于50%时优先治疗
    if (healthPercent < 0.5) {
      return true
    }

    return super.shouldUseSkill(participant)
  }

  public selectSkill(
    participant: BattleParticipant,
    analysis?: BattleAnalysis,
  ): string | null {
    const healthPercent = participant.currentHealth / participant.maxHealth

    // 血量低时优先使用治疗技能
    if (healthPercent < 0.5) {
      const healSkill = Array.from(this.skills.values()).find(
        (s) => s.heal && s.heal > 0,
      )
      if (healSkill) {
        return healSkill.id
      }
    }

    // 满血时不使用治疗技能
    const healSkill = Array.from(this.skills.values()).find(
      (s) => s.heal && s.heal > 0,
    )
    if (healSkill && healthPercent >= 1) {
      // 满血，跳过治疗技能，选择其他技能
      const attackSkills = Array.from(this.skills.values()).filter(
        (s) => s.damage && s.damage > 0,
      )
      if (attackSkills.length > 0) {
        // 优先选择伤害最高的技能
        attackSkills.sort((a, b) => (b.damage || 0) - (a.damage || 0))
        return attackSkills[0].id
      }
    }

    // 能量足够时优先使用大招
    if (participant.currentEnergy >= 100) {
      const ultimateSkill = Array.from(this.skills.values()).find(
        (s) => s.type === SkillType.ULTIMATE,
      )
      if (ultimateSkill) {
        return ultimateSkill.id
      }
    }

    return super.selectSkill(participant, analysis)
  }

  public selectTarget(
    battleState: BattleState,
    _participant: BattleParticipant,
  ): string {
    const enemies = Array.from(battleState.participants.values())
      .filter((p) => p.type === 'enemy' && p.isAlive())
      .map((p) => p)

    if (enemies.length === 0) {
      throw new Error('No enemies found')
    }

    // 优先攻击血量最低的敌人
    enemies.sort((a, b) => a.currentHealth - b.currentHealth)
    return enemies[0].id
  }
}

/**
 * 敌人AI类
 * 为敌人单位提供特定的AI行为
 * 包含更激进的技能使用策略和目标选择逻辑
 */
export class EnemyAI extends BaseBattleAI {
  /**
   * 初始化技能
   * 添加敌人默认技能：爪击、狂暴
   */
  protected initializeSkills(): void {
    // 默认敌人技能
    this.addSkill({
      id: 'enemy_skill_1',
      name: '爪击',
      type: SkillType.SMALL,
      energyCost: 20,
      cooldown: 1000,
      lastUsed: 0,
      description: '快速攻击',
      damage: 25,
    })

    this.addSkill({
      id: 'enemy_skill_2',
      name: '狂暴',
      type: SkillType.ULTIMATE,
      energyCost: 80,
      cooldown: 3000,
      lastUsed: 0,
      description: '增加攻击力',
      damage: 60,
    })
  }

  public shouldUseSkill(participant: BattleParticipant): boolean {
    // 敌人更激进
    return participant.currentEnergy >= 50
  }

  public selectSkill(
    participant: BattleParticipant,
    analysis?: BattleAnalysis,
  ): string | null {
    return super.selectSkill(participant, analysis)
  }

  public selectTarget(
    battleState: BattleState,
    _participant: BattleParticipant,
  ): string {
    const characters = Array.from(battleState.participants.values())
      .filter((p) => p.type === 'character' && p.isAlive())
      .map((p) => p)

    if (characters.length === 0) {
      throw new Error('No characters found')
    }

    // 优先攻击血量最低的角色
    characters.sort((a, b) => a.currentHealth - b.currentHealth)
    return characters[0].id
  }
}

/**
 * AI工厂类
 * 负责创建不同类型的AI实例
 * 使用工厂模式简化AI实例的创建和管理
 */
export class BattleAIFactory {
  /**
   * 创建AI实例
   * 根据类型创建角色AI或敌人AI
   * @param type AI类型：character或enemy
   * @returns 创建的AI实例
   */
  public static createAI(type: 'character' | 'enemy'): BattleAI {
    return type === 'character' ? new CharacterAI() : new EnemyAI()
  }
}
