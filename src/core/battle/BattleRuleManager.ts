/**
 * 文件: BattleRuleManager.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗规则管理器
 * 描述: 负责加载和管理战斗规则配置，包括回合系统、战斗机制、伤害计算、AI行为等规则
 * 版本: 1.0.0
 */

import { battleLogManager } from '@/utils/logging'

/**
 * 战斗规则配置接口
 */
export interface BattleRulesConfig {
  version: string
  rules: {
    turnSystem: {
      speedFirst: boolean
      fixedTurns: boolean
      maxTurns: number
      turnTimeout: number
    }
    combat: {
      critEnabled: boolean
      dodgeEnabled: boolean
      minDamage: number
      maxDamage: number
      energyGainPerTurn: number
      energyGainOnHit: number
    }
    damage: {
      critical: {
        enabled: boolean
        defaultRate: number
        defaultMultiplier: number
      }
      defense: {
        enabled: boolean
        physicalDefenseFactor: number
        magicDefenseFactor: number
        normalDefenseFactor: number
      }
      thresholds: {
        minDamage: number
        maxDamage: number
      }
    }
    ai: {
      decisionDelay: number
      skillPriority: {
        heal: number
        attack: number
        buff: number
        debuff: number
      }
    }
    autoBattle: {
      enabled: boolean
      defaultSpeed: number
      availableSpeeds: number[]
      turnInterval: number
    }
  }
  scenes: Record<string, any>
}

/**
 * 战斗规则管理器类
 * 负责加载、管理和应用战斗规则配置
 */
export class BattleRuleManager {
  private logger = battleLogManager
  private config: BattleRulesConfig | null = null

  /**
   * 加载战斗规则配置
   */
  public async loadConfig(): Promise<BattleRulesConfig> {
    this.config = this.getDefaultConfig()
    this.logger.info('战斗规则配置加载成功', { version: this.config.version })
    return this.config
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): BattleRulesConfig {
    return {
      version: '1.0.0',
      rules: {
        turnSystem: {
          speedFirst: true,
          fixedTurns: false,
          maxTurns: 999,
          turnTimeout: 30000,
        },
        combat: {
          critEnabled: true,
          dodgeEnabled: false,
          minDamage: 1,
          maxDamage: 9999,
          energyGainPerTurn: 25,
          energyGainOnHit: 15,
        },
        damage: {
          critical: {
            enabled: true,
            defaultRate: 0.05,
            defaultMultiplier: 1.5,
          },
          defense: {
            enabled: true,
            physicalDefenseFactor: 0.01,
            magicDefenseFactor: 0.01,
            normalDefenseFactor: 0.005,
          },
          thresholds: {
            minDamage: 1,
            maxDamage: 9999,
          },
        },
        ai: {
          decisionDelay: 1000,
          skillPriority: {
            heal: 90,
            attack: 70,
            buff: 60,
            debuff: 50,
          },
        },
        autoBattle: {
          enabled: true,
          defaultSpeed: 1.0,
          availableSpeeds: [0.5, 1.0, 2.0, 5.0],
          turnInterval: 1000,
        },
      },
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
    this.logger.info('战斗规则配置已更新', { version: this.config.version })
  }

  /**
   * 深度合并对象
   */
  private deepMerge<T extends Record<string, any>>(
    target: T,
    source: Partial<T>,
  ): T {
    const result = { ...target }

    for (const key in source) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(result[key] || {}, source[key])
      } else {
        result[key] = source[key] as any
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
   * 获取伤害计算规则
   */
  public getDamageRules() {
    return this.getConfig().rules.damage
  }

  /**
   * 获取AI规则
   */
  public getAIRules() {
    return this.getConfig().rules.ai
  }

  /**
   * 获取自动战斗规则
   */
  public getAutoBattleRules() {
    return this.getConfig().rules.autoBattle
  }

  /**
   * 验证配置有效性
   */
  public validateConfig(): { valid: boolean; errors: string[] } {
    const config = this.getConfig()
    const errors: string[] = []

    // 验证回合系统规则
    const turnRules = config.rules.turnSystem
    if (turnRules.maxTurns <= 0) {
      errors.push('最大回合数必须大于0')
    }
    if (turnRules.turnTimeout <= 0) {
      errors.push('回合超时时间必须大于0')
    }

    // 验证战斗规则
    const combatRules = config.rules.combat
    if (combatRules.minDamage < 0) {
      errors.push('最小伤害值不能为负数')
    }
    if (combatRules.maxDamage <= combatRules.minDamage) {
      errors.push('最大伤害值必须大于最小伤害值')
    }

    // 验证伤害规则
    const damageRules = config.rules.damage
    if (
      damageRules.critical.defaultRate < 0 ||
      damageRules.critical.defaultRate > 1
    ) {
      errors.push('默认暴击率必须在0到1之间')
    }
    if (damageRules.critical.defaultMultiplier < 1) {
      errors.push('默认暴击倍率必须大于等于1')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * 导出配置为JSON字符串
   */
  public exportConfig(): string {
    return JSON.stringify(this.getConfig(), null, 2)
  }

  /**
   * 从JSON字符串导入配置
   */
  public importConfig(jsonString: string): {
    success: boolean
    error?: string
  } {
    try {
      const newConfig = JSON.parse(jsonString) as BattleRulesConfig

      // 临时设置配置以进行验证
      const originalConfig = this.config
      this.config = newConfig
      const validation = this.validateConfig()

      // 恢复原始配置
      this.config = originalConfig

      if (!validation.valid) {
        return {
          success: false,
          error: `配置验证失败: ${validation.errors.join(', ')}`,
        }
      }

      this.config = newConfig
      this.logger.info('战斗规则配置导入成功')
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        success: false,
        error: `配置导入失败: ${errorMessage}`,
      }
    }
  }

  /**
   * 重置为默认配置
   */
  public resetToDefault(): void {
    this.config = this.getDefaultConfig()
    this.logger.info('战斗规则配置已重置为默认值')
  }
}
