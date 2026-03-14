/**
 * 文件: SkillManager.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 技能管理器
 * 描述: 负责技能配置的加载、解析和执行，集成完整的伤害/治疗计算系统，支持插件化的计算器注册
 * 版本: 1.0.0
 */

import type {
  SkillConfig,
  SkillStep,
  ExtendedSkillStep,
  CalculationLog,
} from '@/types/skill'
import type { BattleAction, BattleParticipant } from '@/types/battle'
import type { CombatRecord } from '@/types/combat-record'
import { BuffSystem } from '@/core/BuffSystem'
import { StackRule, ControlType } from '@/types/buff'
import { DamageCalculator } from '@/core/skill/DamageCalculator'
import { HealCalculator } from '@/core/skill/HealCalculator'
import { battleLogManager, LogLevel } from '@/utils/logging'
import { validateSkillConfigs } from '@/utils/schema-validator'

/**
 * 计算上下文接口 - 统一伤害和治疗计算的输入
 * 借鉴framework的CalculationSystem设计
 */
export interface CalculationContext {
  source: BattleParticipant
  target: BattleParticipant
  skill?: SkillConfig
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
  calculate(
    context: CalculationContext,
    step: ExtendedSkillStep,
  ): CalculationResult
  getSupportedTypes(): string[]
}

/**
 * 技能管理器类
 * 负责技能配置的加载、解析和执行，集成完整的伤害/治疗计算系统
 * 支持插件化的计算器注册
 * 推荐通过容器注入使用
 */
export class SkillManager {
  private battleLogManager = battleLogManager
  private skillConfigs = new Map<string, SkillConfig>()
  private buffSystem: BuffSystem
  private damageCalculator: DamageCalculator
  private healCalculator: HealCalculator
  private calculators: Map<string, SkillCalculator> = new Map()

  /**
   * 构造函数
   * @param buffSystem Buff系统实例（通过构造函数注入）
   */
  public constructor(buffSystem: BuffSystem) {
    this.buffSystem = buffSystem
    this.damageCalculator = new DamageCalculator()
    this.healCalculator = new HealCalculator()
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
      validationResult.errors.forEach((error) => {
        battleLogManager.addDebugLog(
          `技能配置验证失败: ${error}`,
          LogLevel.ERROR,
        )
      })

      // 拒绝无效配置
      throw new Error('技能配置验证失败，请检查配置文件')
    }

    // 加载验证通过的配置
    for (const config of skillConfigs) {
      this.skillConfigs.set(config.id, config)
      battleLogManager.addDebugLog(
        `加载技能配置: ${config.id} - ${config.name}`,
      )
    }

    battleLogManager.addDebugLog(
      `成功加载 ${skillConfigs.length} 个技能配置`,
      LogLevel.INFO,
    )
    battleLogManager.addDebugLog(
      `技能配置加载完成，共加载 ${skillConfigs.length} 个技能`,
      LogLevel.INFO,
    )
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
    if (
      'isSkillAvailable' in source &&
      typeof source.isSkillAvailable === 'function'
    ) {
      if (!source.isSkillAvailable(skillId)) {
        return false
      }
    }

    // 检查能量是否足够
    const energyCost = skillConfig.energyCost || 0
    if (source.currentEnergy < energyCost) {
      return false
    }

    return true
  }

  /**
   * 执行技能动作
   * @param skillId 技能ID
   * @param source 施放者
   * @param target 目标
   * @param record 战斗记录对象（可选）
   * @returns 战斗动作
   */
  public executeSkill(
    skillId: string,
    source: BattleParticipant,
    target: BattleParticipant,
    record?: CombatRecord,
  ): BattleAction {
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
      effects: [],
    }

    // 兼容旧格式和新格式
    if (skillConfig.steps && skillConfig.steps.length > 0) {
      // 新格式：使用步骤配置
      const sortedSteps = [...skillConfig.steps].sort(
        (a, b) => (a.priority || 0) - (b.priority || 0),
      )

      for (const skillStep of sortedSteps) {
        // 每段伤害前检查目标是否存活
        if (!target.isAlive()) {
          break
        }

        this.executeSkillStep(
          skillStep as ExtendedSkillStep,
          action,
          source,
          target,
          record,
        )

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
        description: `${source.name} 使用 ${skillConfig.name || skillId} 造成 ${actualDamage} 伤害`,
      })
      battleLogManager.addDebugLog(
        `旧格式技能执行完成: ${skillId}, 伤害: ${actualDamage}`,
      )

      // 兼容处理旧格式中的其他效果属性
      // 处理 heal 属性（治疗效果）
      if ((skillConfig as any).heal) {
        const healValue = (skillConfig as any).heal
        const actualHeal = source.heal
          ? source.heal(healValue)
          : Math.floor(healValue)
        action.heal = actualHeal
        action.effects.push({
          type: 'heal',
          value: actualHeal,
          description: `${source.name} 使用 ${skillConfig.name || skillId} 恢复 ${actualHeal} 生命值`,
        })
        battleLogManager.addDebugLog(
          `旧格式技能治疗效果: ${skillId}, 治疗: ${actualHeal}`,
        )
      }

      // 处理 buffId 属性（Buff效果）
      if ((skillConfig as any).buffId) {
        const buffId = (skillConfig as any).buffId
        const scriptRegistry = this.buffSystem.getScriptRegistry()

        if (scriptRegistry.has(buffId)) {
          const buffConfig = {
            id: buffId,
            name: buffId,
            description: `来自技能 ${skillConfig.name || skillId} 的效果`,
            duration: (skillConfig as any).buffDuration ?? 1,
            maxStacks: 1,
            cooldown: 0,
            stackRule: StackRule.LIMITED,
            controlType: ControlType.NONE,
            controlPriority: 0,
            isDebuff: false,
            parameters: {},
          }

          const instanceId = this.buffSystem.addBuff(
            target.id,
            buffId,
            buffConfig,
          )
          if (instanceId) {
            target.addBuff(instanceId)
          }

          action.effects.push({
            type: 'buff',
            buffId: buffId,
            instanceId,
            description: `${source.name} 使用 ${skillConfig.name || skillId} 对 ${target.name} 施加 ${buffId}`,
          })
          battleLogManager.addDebugLog(
            `旧格式技能Buff效果: ${skillId}, Buff: ${buffId}`,
          )
        } else {
          battleLogManager.addDebugLog(`旧格式技能Buff未找到: ${buffId}`)
        }
      }

      // 处理 buffDuration 属性（Debuff效果）
      if ((skillConfig as any).debuffId) {
        const debuffId = (skillConfig as any).debuffId
        const scriptRegistry = this.buffSystem.getScriptRegistry()

        if (scriptRegistry.has(debuffId)) {
          const debuffConfig = {
            id: debuffId,
            name: debuffId,
            description: `来自技能 ${skillConfig.name || skillId} 的debuff效果`,
            duration: (skillConfig as any).debuffDuration ?? 1,
            maxStacks: 1,
            cooldown: 0,
            stackRule: StackRule.LIMITED,
            controlType: ControlType.NONE,
            controlPriority: 0,
            isDebuff: true,
            parameters: {},
          }

          const instanceId = this.buffSystem.addBuff(
            target.id,
            debuffId,
            debuffConfig,
          )
          if (instanceId) {
            target.addBuff(instanceId)
          }

          action.effects.push({
            type: 'debuff',
            buffId: debuffId,
            instanceId,
            description: `${source.name} 使用 ${skillConfig.name || skillId} 对 ${target.name} 施加 ${debuffId}`,
          })
          battleLogManager.addDebugLog(
            `旧格式技能Debuff效果: ${skillId}, Debuff: ${debuffId}`,
          )
        }
      }
    } else {
      throw new Error(
        `技能配置无效: ${skillId}，既没有 steps 也没有 damage 属性`,
      )
    }

    // 设置技能冷却
    if (skillConfig.cooldown && skillConfig.cooldown > 0) {
      if (
        'setSkillCooldown' in source &&
        typeof source.setSkillCooldown === 'function'
      ) {
        source.setSkillCooldown(skillId, skillConfig.cooldown)
        battleLogManager.addDebugLog(
          `技能设置冷却: ${skillId}, 冷却回合数: ${skillConfig.cooldown}`,
        )
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
   * @param record 战斗记录对象（可选）
   */
  private executeSkillStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
    record?: CombatRecord,
  ): void {
    // 标准化技能步骤类型，处理大小写差异
    const normalizedType = this.normalizeSkillStepType(skillStep.type)

    switch (normalizedType) {
      case 'DAMAGE':
        this.executeDamageStep(skillStep, battleAction, source, target, record)
        break
      case 'HEAL':
        this.executeHealStep(skillStep, battleAction, source, target, record)
        break
      case 'BUFF':
      case 'DEBUFF':
        this.executeBuffStep(skillStep, battleAction, source, target, record)
        break
      case 'SHIELD':
        this.executeShieldStep(skillStep, battleAction, source, target)
        break
      case 'CONTROL':
      case 'STUN':
      case 'SILENCE':
        this.executeControlStep(
          skillStep,
          battleAction,
          source,
          target,
          normalizedType,
        )
        break
      default:
        battleLogManager.addDebugLog(
          `未知的技能步骤类型: ${skillStep.type} (标准化后: ${normalizedType})`,
        )
    }
  }

  /**
   * 执行伤害步骤
   */
  private executeDamageStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
    record?: CombatRecord,
  ): void {
    // 使用新的伤害计算器
    const damageResult = this.damageCalculator.calculateDamage(
      skillStep,
      source,
      target,
      record,
    )

    if (damageResult.isMiss) {
      // 处理闪避情况
      battleAction.effects.push({
        type: 'miss',
        value: 0,
        description: `${target.name} 闪避了攻击`,
      })

      battleLogManager.addDebugLog(
        `伤害步骤执行完成: ${source.name} → ${target.name}, 闪避`,
      )
    } else {
      // 处理正常伤害情况
      const actualDamage = this.damageCalculator.applyDamage(
        target,
        damageResult.damage,
      )

      battleAction.damage += actualDamage
      battleAction.effects.push({
        type: 'damage',
        value: actualDamage,
        description: `${source.name} 造成 ${actualDamage} 伤害`,
        isCritical: damageResult.isCritical,
      })

      battleLogManager.addDebugLog(
        `伤害步骤执行完成: ${source.name} → ${target.name}, 伤害: ${actualDamage}, 暴击: ${damageResult.isCritical}`,
      )
    }
  }

  /**
   * 执行治疗步骤
   */
  private executeHealStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
    record?: CombatRecord,
  ): void {
    // 使用新的治疗计算器
    const heal = this.healCalculator.calculateHeal(
      skillStep,
      source,
      target,
      record,
    )
    const actualHeal = this.healCalculator.applyHeal(target, heal)

    battleAction.heal += actualHeal
    battleAction.effects.push({
      type: 'heal',
      value: actualHeal,
      description: `${source.name} 恢复 ${actualHeal} 生命值`,
    })

    // 检查是否为单回合效果
    if (this.healCalculator.isSingleTurnEffect(skillStep)) {
      battleAction.effects.push({
        type: 'status',
        description: '单回合治疗效果立即生效',
      })
    }

    battleLogManager.addDebugLog(
      `治疗步骤执行完成: ${source.name} → ${target.name}, 治疗: ${actualHeal}`,
    )
  }

  /**
   * 执行buff步骤
   */
  private executeBuffStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
    record?: CombatRecord,
  ): void {
    if (!skillStep.buffId) {
      battleLogManager.addDebugLog(`buff步骤缺少buffId: ${skillStep.type}`)
      return
    }

    // 检查 Buff 脚本是否已注册
    const scriptRegistry = this.buffSystem.getScriptRegistry()

    if (!scriptRegistry.has(skillStep.buffId)) {
      battleLogManager.addDebugLog(
        `Buff脚本未找到: ${skillStep.buffId}，跳过buff效果`,
      )
      battleAction.effects.push({
        type: 'buff',
        buffId: skillStep.buffId,
        description: `${source.name} 尝试施加 ${skillStep.buffId} 失败（脚本未注册）`,
      })
      return
    }

    // 确定buff目标
    const buffTarget = skillStep.targetType === 'self' ? source : target

    // 创建buff配置
    const buffConfig = {
      id: skillStep.buffId,
      name: skillStep.buffId,
      description: `来自技能 ${battleAction.skillId} 的效果`,
      duration: skillStep.duration ?? 1,
      maxStacks: skillStep.stacks || 1,
      cooldown: 0,
      stackRule: StackRule.LIMITED,
      controlType: ControlType.NONE,
      controlPriority: 0,
      isDebuff: skillStep.type === 'DEBUFF',
      parameters: skillStep.parameters || {},
    }

    // 添加buff
    const instanceId = this.buffSystem.addBuff(
      buffTarget.id,
      skillStep.buffId,
      buffConfig,
      0,
      record,
    )
    if (instanceId) {
      buffTarget.addBuff(instanceId)
    }

    battleAction.effects.push({
      type: 'buff',
      buffId: skillStep.buffId,
      instanceId,
      description: `${source.name} 施加 ${skillStep.buffId} 给 ${buffTarget.name}`,
    })

    battleLogManager.addDebugLog(
      `buff步骤执行完成: ${skillStep.buffId} 施加给 ${buffTarget.name}`,
    )
  }

  /**
   * 执行护盾步骤
   */
  private executeShieldStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
  ): void {
    // 护盾逻辑待实现
    battleLogManager.addDebugLog(`护盾步骤: ${skillStep.formula}`)
    battleAction.effects.push({
      type: 'status',
      description: '护盾效果（待实现）',
    })
  }

  /**
   * 执行控制步骤
   */
  private executeControlStep(
    skillStep: ExtendedSkillStep,
    battleAction: BattleAction,
    source: BattleParticipant,
    target: BattleParticipant,
    normalizedType: string = 'CONTROL',
  ): void {
    const controlType =
      normalizedType === 'STUN'
        ? ControlType.STUN
        : normalizedType === 'SILENCE'
          ? ControlType.SILENCE
          : ControlType.STUN

    const controlBuffId = skillStep.buffId || `control_${controlType}`
    const controlConfig = {
      id: controlBuffId,
      name: controlBuffId,
      description: `来自技能 ${battleAction.skillId} 的控制效果`,
      duration: skillStep.duration ?? 1,
      maxStacks: 1,
      cooldown: 0,
      stackRule: StackRule.REFRESH,
      controlType,
      controlPriority: 100,
      isDebuff: true,
      parameters: skillStep.parameters || {},
    }

    const instanceId = this.buffSystem.addBuff(
      target.id,
      controlBuffId,
      controlConfig,
    )
    if (instanceId) {
      target.addBuff(instanceId)
    }

    battleLogManager.addDebugLog(
      `控制步骤执行: ${controlType} -> ${target.name}`,
    )
    battleAction.effects.push({
      type: 'status',
      buffId: controlBuffId,
      description: `${source.name} 对 ${target.name} 施加了${controlType === ControlType.STUN ? '眩晕' : '沉默'}`,
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
    battleLogManager.addDebugLog('所有计算日志已清空')
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
    battleLogManager.addDebugLog('所有技能配置已清空')
  }

  /**
   * 注册自定义计算器 - 借鉴framework的插件化设计
   * 允许动态注册新的计算逻辑
   * @param type 计算器类型标识
   * @param calculator 计算器实例
   */
  public registerCalculator(type: string, calculator: SkillCalculator): void {
    this.calculators.set(type, calculator)
    battleLogManager.addDebugLog(`注册技能计算器: ${type}`)
  }

  /**
   * 注销计算器
   * @param type 计算器类型标识
   */
  public unregisterCalculator(type: string): void {
    this.calculators.delete(type)
    battleLogManager.addDebugLog(`注销技能计算器: ${type}`)
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
        battleLogManager.addDebugLog(
          `DAMAGE/HEAL 类型的技能步骤需要 formula 或 calculation`,
        )
        return false
      }

      if (step.calculation) {
        if (step.calculation.baseValue < 0) {
          battleLogManager.addDebugLog(
            `基础值不能为负数: ${step.calculation.baseValue}`,
          )
          return false
        }

        // 验证额外值配置
        for (const extra of step.calculation.extraValues) {
          if (!extra.attribute || extra.ratio < 0) {
            battleLogManager.addDebugLog(
              `无效的额外值配置: ${JSON.stringify(extra)}`,
            )
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
    battleLogManager.addDebugLog('伤害计算器重新配置完成')
  }

  /**
   * 重新配置治疗计算器
   */
  public reconfigureHealCalculator(config: any): void {
    this.healCalculator.setConfig(config)
    battleLogManager.addDebugLog('治疗计算器重新配置完成')
  }
}
