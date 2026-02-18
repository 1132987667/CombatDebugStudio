/**
 * 文件: SkillManager.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 技能管理器
 * 描述: 负责技能配置的加载、解析和执行，集成完整的伤害/治疗计算系统，支持插件化的计算器注册
 * 版本: 1.0.0
 */

import type { SkillConfig, SkillStep, ExtendedSkillStep, CalculationLog } from '@/types/skill'
import type { BattleAction, BattleParticipant, BattleEnvironment } from '@/types/battle'
import { BuffSystem } from '@/core/BuffSystem'
import { DamageCalculator } from '@/core/skill/DamageCalculator'
import { HealCalculator } from '@/core/skill/HealCalculator'
import { battleLogManager } from '@/utils/logging'
import { validateSkillConfigs } from '@/utils/schema-validator'

/**
 * 计算上下文接口 - 统一伤害和治疗计算的输入
 * 借鉴framework的CalculationSystem设计
 */
export interface CalculationContext {
  source: BattleParticipant
  target: BattleParticipant
  skill?: SkillConfig
  environment?: BattleEnvironment
}

/**
 * 计算结果接口
 */
export interface CalculationResult {
  value: number
  isCritical: boolean
  isDodged: boolean
  details: {
    baseValue: number
    bonus: number
    multiplier: number
  }
}

/**
 * 计算器插件接口 - 支持动态注册扩展
 * 借鉴framework的Calculator接口设计
 */
export interface SkillCalculator {
  calculate(context: CalculationContext, step: ExtendedSkillStep): CalculationResult
  getSupportedTypes(): string[]
}

/**
 * 技能管理器类
 * 负责技能配置的加载、解析和执行，集成完整的伤害/治疗计算系统
 * 支持插件化的计算器注册
 */
export class SkillManager {
  private static instance: SkillManager
  private logger = battleLogManager
  private skillConfigs = new Map<string, SkillConfig>()
  private buffSystem = BuffSystem.getInstance()
  private damageCalculator
  private healCalculator
  private calculators: Map<string, SkillCalculator> = new Map()

  /**
   * 私有构造函数，防止外部实例化
   */
  private constructor() {
    try {
      const { container } = require('@/core/di/Container')
      this.damageCalculator = container.resolve('DamageCalculator')
      this.healCalculator = container.resolve('HealCalculator')
    } catch (error) {
      // 如果依赖注入容器不可用，则使用默认实例
      console.warn('依赖注入容器不可用，使用默认实例初始化', error)
      this.damageCalculator = new DamageCalculator()
      this.healCalculator = new HealCalculator()
    }
  }

  /**
   * 获取单例实例
   * @returns SkillManager实例
   */
  public static getInstance(): SkillManager {
    if (!SkillManager.instance) {
      SkillManager.instance = new SkillManager()
    }
    return SkillManager.instance
  }

  /**
   * 加载技能配置
   * @param skillConfigs 技能配置数组
   */
  public loadSkillConfigs(skillConfigs: SkillConfig[]): void {
    // 验证技能配置
    const validationResult = validateSkillConfigs(skillConfigs)
    
    if (!validationResult.valid) {
      // 记录验证错误
      validationResult.errors.forEach(error => {
        this.logger.error(`技能配置验证失败: ${error}`)
      })
      
      // 拒绝无效配置
      throw new Error('技能配置验证失败，请检查配置文件')
    }
    
    // 加载验证通过的配置
    for (const config of skillConfigs) {
      this.skillConfigs.set(config.id, config)
      this.logger.debug(`加载技能配置: ${config.id} - ${config.name}`)
    }
    
    this.logger.info(`成功加载 ${skillConfigs.length} 个技能配置`)
    this.logger.info(`技能配置加载完成，共加载 ${skillConfigs.length} 个技能`)
  }

  /**
   * 根据技能ID获取技能配置
   * @param skillId 技能ID
   * @returns 技能配置
   */
  public getSkillConfig(skillId: string): SkillConfig | undefined {
    return this.skillConfigs.get(skillId)
  }

  /**
   * 检查技能是否可用（未冷却且满足能量要求）
   * @param skillId 技能ID
   * @param source 施放者
   * @returns 是否可用
   */
  public isSkillAvailable(skillId: string, source: BattleParticipant): boolean {
    const skillConfig = this.getSkillConfig(skillId)
    if (!skillConfig) {
      return false
    }

    // 检查技能冷却
    if ('isSkillAvailable' in source && typeof source.isSkillAvailable === 'function') {
      if (!source.isSkillAvailable(skillId)) {
        return false
      }
    }

    return true
  }

  /**
   * 执行技能动作
   * @param skillId 技能ID
   * @param source 施放者
   * @param target 目标
   * @returns 战斗动作
   */
  public executeSkill(skillId: string, source: BattleParticipant, target: BattleParticipant): BattleAction {
    const skillConfig = this.getSkillConfig(skillId)
    if (!skillConfig) {
      throw new Error(`技能配置不存在: ${skillId}`)
    }

    // 检查技能是否可用
    if (!this.isSkillAvailable(skillId, source)) {
      throw new Error(`技能不可用: ${skillId}`)
    }

    const action: BattleAction = {
      id: `skill_${skillId}_${Date.now()}`,
      type: 'skill',
      skillId,
      sourceId: source.id,
      targetId: target.id,
      damage: 0,
      heal: 0,
      success: true,
      timestamp: Date.now(),
      effects: []
    }

    // 兼容旧格式和新格式
    if (skillConfig.steps && skillConfig.steps.length > 0) {
      // 新格式：使用步骤配置
      const sortedSteps = [...skillConfig.steps].sort((a, b) => (a.priority || 0) - (b.priority || 0))
      
      for (const skillStep of sortedSteps) {
        // 每段伤害前检查目标是否存活
        if (!target.isAlive()) {
          break
        }
        
        this.executeSkillStep(skillStep as ExtendedSkillStep, action, source, target)
        
        // 为多段伤害添加间隔（模拟间隔效果，实际动画间隔由BattleSystem处理）
        if (sortedSteps.length > 1) {
          // 这里可以添加配置化的间隔时间
        }
      }
    } else if ((skillConfig as any).damage) {
      // 旧格式：直接使用 damage 属性创建伤害效果
      const damage = (skillConfig as any).damage
      const actualDamage = target.takeDamage(damage)
      action.damage = actualDamage
      action.effects.push({
        type: 'damage',
        value: actualDamage,
        description: `${source.name} 使用 ${skillConfig.name || skillId} 造成 ${actualDamage} 伤害`
      })
      this.logger.debug(`旧格式技能执行完成: ${skillId}, 伤害: ${actualDamage}`)
    } else {
      throw new Error(`技能配置无效: ${skillId}，既没有 steps 也没有 damage 属性`)
    }

    // 设置技能冷却
    if (skillConfig.cooldown && skillConfig.cooldown > 0) {
      if ('setSkillCooldown' in source && typeof source.setSkillCooldown === 'function') {
        source.setSkillCooldown(skillId, skillConfig.cooldown)
        this.logger.info(`技能设置冷却: ${skillId}, 冷却回合数: ${skillConfig.cooldown}`)
      }
    }

    return action
  }

  /**
   * 标准化技能步骤类型
   * 将小写类型转换为大写，确保与代码中的 SkillStepType 一致
   * @param type 技能步骤类型
   * @returns 标准化后的技能步骤类型
   */
  private normalizeSkillStepType(type: string): string {
    return type.toUpperCase()
  }

  /**
   * 执行单个技能步骤
   * @param skillStep 技能步骤配置
   * @param battleAction 战斗动作
   * @param source 施放者
   * @param target 目标
   */
  private executeSkillStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant
  ): void {
    // 标准化技能步骤类型，处理大小写差异
    const normalizedType = this.normalizeSkillStepType(skillStep.type)
    
    switch (normalizedType) {
      case 'DAMAGE':
        this.executeDamageStep(skillStep, battleAction, source, target)
        break
      case 'HEAL':
        this.executeHealStep(skillStep, battleAction, source, target)
        break
      case 'BUFF':
      case 'DEBUFF':
        this.executeBuffStep(skillStep, battleAction, source, target)
        break
      case 'SHIELD':
        this.executeShieldStep(skillStep, battleAction, source, target)
        break
      case 'CONTROL':
        this.executeControlStep(skillStep, battleAction, source, target)
        break
      default:
        this.logger.warn(`未知的技能步骤类型: ${skillStep.type} (标准化后: ${normalizedType})`)
    }
  }

  /**
   * 执行伤害步骤
   */
  private executeDamageStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant
  ): void {
    // 使用新的伤害计算器
    const damageResult = this.damageCalculator.calculateDamage(skillStep, source, target)
    
    if (damageResult.isMiss) {
      // 处理闪避情况
      battleAction.effects.push({
        type: 'miss',
        value: 0,
        description: `${target.name} 闪避了攻击`
      })
      
      this.logger.info(`伤害步骤执行完成: ${source.name} → ${target.name}, 闪避`)
    } else {
      // 处理正常伤害情况
      const actualDamage = this.damageCalculator.applyDamage(target, damageResult.damage)
      
      battleAction.damage += actualDamage
      battleAction.effects.push({
        type: 'damage',
        value: actualDamage,
        description: `${source.name} 造成 ${actualDamage} 伤害`,
        isCritical: damageResult.isCritical
      })

      this.logger.info(`伤害步骤执行完成: ${source.name} → ${target.name}, 伤害: ${actualDamage}, 暴击: ${damageResult.isCritical}`)
    }
  }

  /**
   * 执行治疗步骤
   */
  private executeHealStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant
  ): void {
    // 使用新的治疗计算器
    const heal = this.healCalculator.calculateHeal(skillStep, source, target)
    const actualHeal = this.healCalculator.applyHeal(target, heal)
    
    battleAction.heal += actualHeal
    battleAction.effects.push({
      type: 'heal',
      value: actualHeal,
      description: `${source.name} 恢复 ${actualHeal} 生命值`
    })

    // 检查是否为单回合效果
    if (this.healCalculator.isSingleTurnEffect(skillStep)) {
      battleAction.effects.push({
        type: 'status',
        description: '单回合治疗效果立即生效'
      })
    }

    this.logger.info(`治疗步骤执行完成: ${source.name} → ${target.name}, 治疗: ${actualHeal}`)
  }

  /**
   * 执行buff步骤
   */
  private executeBuffStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant
  ): void {
    if (!skillStep.buffId) {
      this.logger.warn(`buff步骤缺少buffId: ${skillStep.type}`)
      return
    }

    // 确定buff目标
    const buffTarget = skillStep.targetType === 'self' ? source : target
    
    // 创建buff配置
    const buffConfig = {
      id: skillStep.buffId,
      name: skillStep.buffId,
      description: `来自技能 ${battleAction.skillId} 的效果`,
      duration: (skillStep.duration || 1) * 1000, // 转换为毫秒
      maxStacks: skillStep.stacks || 1,
      cooldown: 0,
      isDebuff: skillStep.type === 'DEBUFF',
      parameters: skillStep.parameters || {}
    }

    // 添加buff
    const instanceId = this.buffSystem.addBuff(buffTarget.id, skillStep.buffId, buffConfig)
    
    battleAction.effects.push({
      type: 'buff',
      buffId: skillStep.buffId,
      instanceId,
      description: `${source.name} 施加 ${skillStep.buffId} 给 ${buffTarget.name}`
    })

    this.logger.info(`buff步骤执行完成: ${skillStep.buffId} 施加给 ${buffTarget.name}`)
  }

  /**
   * 执行护盾步骤
   */
  private executeShieldStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant
  ): void {
    // 护盾逻辑待实现
    this.logger.debug(`护盾步骤: ${skillStep.formula}`)
    battleAction.effects.push({
      type: 'status',
      description: '护盾效果（待实现）'
    })
  }

  /**
   * 执行控制步骤
   */
  private executeControlStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant
  ): void {
    // 控制逻辑待实现
    this.logger.debug(`控制步骤: ${skillStep.formula}`)
    battleAction.effects.push({
      type: 'status',
      description: '控制效果（待实现）'
    })
  }

  /**
   * 获取伤害计算日志
   */
  public getDamageCalculationLogs(): CalculationLog[] {
    return this.damageCalculator.getCalculationLogs()
  }

  /**
   * 获取治疗计算日志
   */
  public getHealCalculationLogs(): CalculationLog[] {
    return this.healCalculator.getCalculationLogs()
  }

  /**
   * 清空所有计算日志
   */
  public clearCalculationLogs(): void {
    this.damageCalculator.clearCalculationLogs()
    this.healCalculator.clearCalculationLogs()
    this.logger.info('所有计算日志已清空')
  }

  /**
   * 获取所有技能配置
   */
  public getAllSkillConfigs(): SkillConfig[] {
    return Array.from(this.skillConfigs.values())
  }

  /**
   * 清空技能配置
   */
  public clearSkillConfigs(): void {
    this.skillConfigs.clear()
    this.logger.info('所有技能配置已清空')
  }

  /**
   * 注册自定义计算器 - 借鉴framework的插件化设计
   * 允许动态注册新的计算逻辑
   * @param type 计算器类型标识
   * @param calculator 计算器实例
   */
  public registerCalculator(type: string, calculator: SkillCalculator): void {
    this.calculators.set(type, calculator)
    this.logger.info(`注册技能计算器: ${type}`)
  }

  /**
   * 注销计算器
   * @param type 计算器类型标识
   */
  public unregisterCalculator(type: string): void {
    this.calculators.delete(type)
    this.logger.info(`注销技能计算器: ${type}`)
  }

  /**
   * 获取计算器
   * @param type 计算器类型标识
   * @returns 计算器实例或undefined
   */
  public getCalculator(type: string): SkillCalculator | undefined {
    return this.calculators.get(type)
  }

  /**
   * 获取所有已注册的计算器
   */
  public getAllCalculators(): Map<string, SkillCalculator> {
    return new Map(this.calculators)
  }

  /**
   * 验证技能配置
   */
  public validateSkillConfig(skillConfig: SkillConfig): boolean {
    if (!skillConfig.id || !skillConfig.name) {
      return false
    }

    if (skillConfig.steps.length === 0) {
      return false
    }

    // 验证每个步骤
    for (const step of skillConfig.steps) {
      if (!this.validateSkillStep(step as ExtendedSkillStep)) {
        return false
      }
    }

    return true
  }

  /**
   * 验证技能步骤
   */
  private validateSkillStep(step: ExtendedSkillStep): boolean {
    if (!step.type) {
      return false
    }

    // 标准化技能步骤类型，处理大小写差异
    const normalizedType = this.normalizeSkillStepType(step.type)

    // 验证DAMAGE/HEAL类型的计算配置（可选）
    if (normalizedType === 'DAMAGE' || normalizedType === 'HEAL') {
      // 允许使用 formula 字符串或 calculation 对象
      if (!step.formula && !step.calculation) {
        this.logger.warn(`DAMAGE/HEAL 类型的技能步骤需要 formula 或 calculation`)
        return false
      }

      if (step.calculation) {
        if (step.calculation.baseValue < 0) {
          this.logger.warn(`基础值不能为负数: ${step.calculation.baseValue}`)
          return false
        }

        // 验证额外值配置
        for (const extra of step.calculation.extraValues) {
          if (!extra.attribute || extra.ratio < 0) {
            this.logger.warn(`无效的额外值配置: ${JSON.stringify(extra)}`)
            return false
          }
        }
      }
    }

    return true
  }

  /**
   * 获取伤害计算器实例
   */
  public getDamageCalculator(): DamageCalculator {
    return this.damageCalculator
  }

  /**
   * 获取治疗计算器实例
   */
  public getHealCalculator(): HealCalculator {
    return this.healCalculator
  }

  /**
   * 重新配置伤害计算器
   */
  public reconfigureDamageCalculator(config: any): void {
    this.damageCalculator.setConfig(config)
    this.logger.info('伤害计算器重新配置完成')
  }

  /**
   * 重新配置治疗计算器
   */
  public reconfigureHealCalculator(config: any): void {
    this.healCalculator.setConfig(config)
    this.logger.info('治疗计算器重新配置完成')
  }
}