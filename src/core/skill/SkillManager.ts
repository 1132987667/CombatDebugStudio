import type { SkillConfig, SkillStep, ExtendedSkillStep, CalculationLog } from '@/types/skill'
import type { BattleAction, BattleParticipant } from '@/types/battle'
import { BuffSystem } from '@/core/BuffSystem'
import { DamageCalculator } from './DamageCalculator'
import { HealCalculator } from './HealCalculator'
import { logger } from '@/utils/logging'

/**
 * 技能管理器类
 * 负责技能配置的加载、解析和执行，集成完整的伤害/治疗计算系统
 */
export class SkillManager {
  private logger = logger
  private skillConfigs = new Map<string, SkillConfig>()
  private buffSystem = BuffSystem.getInstance()
  private damageCalculator = new DamageCalculator()
  private healCalculator = new HealCalculator()

  /**
   * 加载技能配置
   * @param skillConfigs 技能配置数组
   */
  public loadSkillConfigs(skillConfigs: SkillConfig[]): void {
    for (const config of skillConfigs) {
      this.skillConfigs.set(config.id, config)
      this.logger.debug(`加载技能配置: ${config.id} - ${config.name}`)
    }
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

    // 按优先级排序执行技能步骤
    const sortedSteps = [...skillConfig.steps].sort((a, b) => (a.priority || 0) - (b.priority || 0))
    
    for (const skillStep of sortedSteps) {
      this.executeSkillStep(skillStep as ExtendedSkillStep, action, source, target)
    }

    return action
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
    switch (skillStep.type) {
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
        this.logger.warn(`未知的技能步骤类型: ${skillStep.type}`)
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
    const damage = this.damageCalculator.calculateDamage(skillStep, source, target)
    const actualDamage = this.damageCalculator.applyDamage(target, damage)
    
    battleAction.damage += actualDamage
    battleAction.effects.push({
      type: 'damage',
      value: actualDamage,
      description: `${source.name} 造成 ${actualDamage} 伤害`
    })

    this.logger.info(`伤害步骤执行完成: ${source.name} → ${target.name}, 伤害: ${actualDamage}`)
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
    this.logger.info('技能配置已清空')
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
    if (!step.type || !step.formula) {
      return false
    }

    // 验证DAMAGE/HEAL类型的计算配置
    if (step.type === 'DAMAGE' || step.type === 'HEAL') {
      if (!step.calculation) {
        this.logger.warn(`技能步骤缺少计算配置: ${step.type}`)
        return false
      }

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

    return true
  }
}