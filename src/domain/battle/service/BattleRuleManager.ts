/**
 * 文件: BattleRuleManager.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗规则管理器
 * 描述: 负责加载和管理战斗规则配置，包括回合系统、战斗机制、伤害计算、自动战斗等规则
 * 版本: 1.0.0
 */

import type { BattleEntity } from '@/domain/battle/type/types'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

/**
 * 战斗规则配置接口
 */
/** 物理/魔法防御减伤系数 */
const PHYSICAL_DEFENSE_FACTOR = 0.01
const MAGIC_DEFENSE_FACTOR = 0.01
/** 普通防御减伤系数（用于无属性伤害） */
const NORMAL_DEFENSE_FACTOR = 0.005

/**
 * 战斗规则配置接口
 * 定义了游戏战斗系统的全部可配置参数
 */
export interface BattleRulesConfig {
  /** 配置版本号 */
  version: string
  /** 战斗规则集合 */
  rules: {
    /** 回合制系统配置 */
    turnSystem: {
      /** 是否启用速度优先（决定行动顺序） */
      speedFirst: boolean
      /** 是否使用固定回合数（超过最大回合则结束战斗） */
      fixedTurns: boolean
      /** 最大回合数，当 fixedTurns 为 true 时生效 */
      maxTurns: number
      /** 单回合超时时间（毫秒） */
      turnTimeout: number
    }
    /** 基础战斗机制配置 */
    combat: {
      /** 是否启用暴击机制 */
      critEnabled: boolean
      /** 是否启用闪避机制 */
      dodgeEnabled: boolean
      /** 单次攻击的最小伤害值 */
      minDamage: number
      /** 单次攻击的最大伤害值 */
      maxDamage: number
      /** 每回合自动回复的能量值 */
      energyGainPerTurn: number
      /** 命中敌人时获得的额外能量值 */
      energyGainOnHit: number
      /** 仇恨系统配置（可选） */
      threat?: {
        /** 伤害×仇恨系数 */
        damageCoefficient?: number
        /** 嘲讽额外仇恨倍率 */
        tauntMultiplier?: number
        /** 每回合仇恨衰减比例 */
        decayPerTurn?: number
      }
    }
    /** 伤害计算详细规则 */
    damage: {
      /** 暴击相关配置 */
      critical: {
        /** 是否启用暴击（通常与 combat.critEnabled 保持一致） */
        enabled: boolean
        /** 默认暴击率（百分比，如 0.15 表示 15%） */
        defaultRate: number
        /** 默认暴击倍率（如 2.0 表示双倍伤害） */
        defaultMultiplier: number
      }
      /** 防御减伤配置 */
      defense: {
        /** 是否启用防御减伤机制 */
        enabled: boolean
        /** 物理防御减伤系数（0~1，数值越小减免越多） */
        physicalDefenseFactor: number
        /** 魔法防御减伤系数（0~1，数值越小减免越多） */
        magicDefenseFactor: number
        /** 普通防御减伤系数（0~1，用于无属性攻击） */
        normalDefenseFactor: number
      }
      /** 伤害上下限阈值（最终伤害会被限制在此范围内） */
      thresholds: {
        /** 最终伤害最小值 */
        minDamage: number
        /** 最终伤害最大值 */
        maxDamage: number
      }
    }
    /** 自动战斗配置 */
    autoBattle: {
      /** 是否允许自动战斗功能 */
      enabled: boolean
      /** 自动战斗的默认播放速度（倍率） */
      defaultSpeed: number
      /** 可供用户选择的播放速度列表 */
      availableSpeeds: number[]
      /** 自动战斗时每回合的间隔时间（毫秒） */
      turnInterval: number
    }
  }
  /** 场景相关配置（键为场景标识，值为该场景的自定义规则） */
  scenes: Record<string, any>
}

/**
 * 战斗结束判定结果
 */
export interface BattleEndCheckResult {
  shouldEnd: boolean
  winner?: ParticipantSide
}

/**
 * 战斗规则管理器类
 * 负责加载、管理和应用战斗规则配置
 */
export class BattleRuleManager {
  private config: BattleRulesConfig | null = null

  /**
   * 获取默认战斗规则配置
   * 该方法返回系统预设的完整战斗规则配置，包含以下模块：
   * - 回合系统规则：速度优先/固定回合/最大回合数/回合超时
   * - 战斗机制规则：暴击/闪避/伤害范围/能量获取
   * - 伤害计算规则：暴击/防御/伤害阈值
   * - 自动战斗规则：启用状态/速度设置/间隔时间
   * @returns BattleRulesConfig 返回完整的战斗规则配置对象
   */
  private getDefaultConfig(): BattleRulesConfig {
    return {
      // 配置版本号，用于后续配置升级和兼容性处理
      version: '1.0.0',
      rules: {
        // 回合系统规则：控制战斗的回合流程和顺序
        turnSystem: {
          // speedFirst: 是否启用速度优先模式，true表示按速度属性决定行动顺序
          speedFirst: true,
          // fixedTurns: 是否使用固定回合数模式，false表示根据战斗情况自动结束
          fixedTurns: false,
          // maxTurns: 最大回合数限制，达到该回合数时强制结束战斗
          maxTurns: 99,
          // turnTimeout: 单回合操作超时时间（毫秒），超时则判定为自动跳过
          turnTimeout: 30000,
        },
        // 战斗机制规则：控制战斗中的核心机制开关和数值
        combat: {
          // critEnabled: 是否启用暴击机制
          critEnabled: true,
          // dodgeEnabled: 是否启用闪避机制
          dodgeEnabled: false,
          // minDamage: 最小伤害基础值，任何伤害计算结果不低于此值
          minDamage: 1,
          // maxDamage: 最大伤害上限，任何伤害计算结果不超过此值
          maxDamage: 9999,
          // energyGainPerTurn: 每回合开始时自动恢复的能量值（初始30，上限200）
          energyGainPerTurn: 15,
          // energyGainOnHit: 受到攻击时获得的能量值（每回合最多3次）
          energyGainOnHit: 12,
        },
        // 伤害计算规则：控制伤害的各类计算参数
        damage: {
          // critical: 暴击伤害相关配置
          critical: {
            // enabled: 是否启用暴击伤害计算
            enabled: true,
            // defaultRate: 默认基础暴击率（5%），可通过装备/技能提升
            defaultRate: 0.05,
            // defaultMultiplier: 暴击伤害倍率（1.5倍基础伤害）
            defaultMultiplier: 1.5,
          },
          // defense: 防御减伤相关配置
          defense: {
            // enabled: 是否启用防御减伤机制
            enabled: true,
            // physicalDefenseFactor: 物理防御减伤系数，每点防御减少对应比例伤害
            physicalDefenseFactor: PHYSICAL_DEFENSE_FACTOR,
            // magicDefenseFactor: 魔法防御减伤系数
            magicDefenseFactor: MAGIC_DEFENSE_FACTOR,
            // normalDefenseFactor: 普通防御减伤系数（用于无属性伤害）
            normalDefenseFactor: NORMAL_DEFENSE_FACTOR,
          },
          // thresholds: 伤害值的边界限制
          thresholds: {
            // minDamage: 最小伤害阈值，最终伤害不低于此值
            minDamage: 1,
            // maxDamage: 最大伤害阈值，最终伤害不超过此值
            maxDamage: 9999,
          },
        },
        // 自动战斗规则：控制自动战斗功能的相关参数
        autoBattle: {
          // enabled: 是否默认启用自动战斗模式（默认关闭，由玩家手动开启）
          enabled: false,
          // defaultSpeed: 默认战斗播放速度倍率
          defaultSpeed: 1.0,
          // availableSpeeds: 可选的速度倍率列表，供玩家选择
          availableSpeeds: [0.5, 1.0, 2.0, 5.0],
          // turnInterval: 自动战斗模式下回合间隔时间（毫秒）
          turnInterval: 1000,
        },
      },
      // scenes: 场景特定配置，用于不同战斗场景的差异化规则（当前为空对象）
      scenes: {},
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): BattleRulesConfig {
    if (!this.config) {
      this.config = this.getDefaultConfig()
    }
    return this.config
  }

  /**
   * 更新配置
   */
  public updateConfig(updates: Partial<BattleRulesConfig>): void {
    if (!this.config) {
      this.config = this.getDefaultConfig()
    }

    // 深度合并配置
    this.config = this.deepMerge(this.config, updates)
  }

  /**
   * 深度合并对象
   */
  private deepMerge<T extends Record<string, any>>(
    target: T,
    source: Partial<T>,
  ): T {
    const result = { ...target }

    for (const k in source) {
      const key = k as keyof T
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        // ponytail: 递归合并对象类型的字段
        result[key] = this.deepMerge(
          result[key] || ({} as Record<string, any>),
          source[key],
        ) as T[keyof T]
      } else {
        result[key] = source[key] as T[typeof key]
      }
    }

    return result
  }

  /**
   * 获取回合系统规则
   */
  public getTurnSystemRules() {
    return this.getConfig().rules.turnSystem
  }

  /**
   * 获取战斗规则
   */
  public getCombatRules() {
    return this.getConfig().rules.combat
  }

  /**
   * 获取自动战斗规则
   */
  public getAutoBattleRules() {
    return this.getConfig().rules.autoBattle
  }

  /**
   * 检查战斗是否应该结束
   * 这是一个纯业务规则函数，不依赖外部状态
   * maxTurns 从规则配置中读取，统一配置来源
   * @param participants 所有参战方
   * @param currentTurn 当前回合数
   * @returns 判定结果
   */
  public checkBattleEndCondition(
    participants: Map<string, BattleEntity>,
    currentTurn: number,
  ): BattleEndCheckResult {
    const { maxTurns } = this.getConfig().rules.turnSystem
    const aliveCharacters = Array.from(participants.values()).filter(
      (p) => p.team === ParticipantSide.ALLY && p.isAlive(),
    )
    const aliveEnemies = Array.from(participants.values()).filter(
      (p) => p.team === ParticipantSide.ENEMY && p.isAlive(),
    )

    // 1. 一方全灭
    if (aliveCharacters.length === 0) {
      return { shouldEnd: true, winner: ParticipantSide.ENEMY }
    }
    if (aliveEnemies.length === 0) {
      return { shouldEnd: true, winner: ParticipantSide.ALLY }
    }

    // 2. 超过最大回合数（按血量比例判定）
    if (currentTurn >= maxTurns) {
      const charactersHealth = aliveCharacters.reduce(
        (sum, p) =>
          sum +
          p.getAttribute(ATTRIBUTE_CODE.currentHealth) /
            p.getAttribute(ATTRIBUTE_CODE.maxHealth),
        0,
      )
      const enemiesHealth = aliveEnemies.reduce(
        (sum, p) =>
          sum +
          p.getAttribute(ATTRIBUTE_CODE.currentHealth) /
            p.getAttribute(ATTRIBUTE_CODE.maxHealth),
        0,
      )
      const winner =
        charactersHealth >= enemiesHealth
          ? ParticipantSide.ALLY
          : ParticipantSide.ENEMY
      return { shouldEnd: true, winner }
    }

    return { shouldEnd: false }
  }
}
