/**
 * 文件: AttributeEngine.ts
 * 创建日期: 2026-04-07
 * 作者: CombatDebugStudio
 * 功能: 属性计算引擎
 * 描述: 提供可追溯的最终值计算，支持详细步骤记录和来源贡献分析
 * 版本: 1.0.0
 */

import type { AttributeCodes, ModifierType } from '@/types/attribute'
import type {
  ModifierTemplate,
  DynamicValueContext,
} from '@/types/modifier-template'

// ========== 计算追踪数据结构 ==========

/**
 * 单步计算记录
 */
export interface CalculationStep {
  /** 修饰符模板 ID */
  modifierId: string
  /** 来源名称 */
  sourceName: string
  /** 修饰类型 */
  type: ModifierType
  /** 解析后的实际数值 */
  appliedValue: number
  /** 该步骤执行前的中间结果 */
  previousValue: number
  /** 该步骤执行后的中间结果 */
  intermediateResult: number
}

/**
 * 来源贡献记录
 */
export interface SourceContribution {
  /** 来源 ID */
  sourceId: string
  /** 来源名称 */
  sourceName: string
  /** 来源类型 */
  sourceType?: string
  /** 对最终值的净贡献 */
  contribution: number
}

/**
 * 属性计算最终结果（包含追踪）
 */
export interface AttributeComputeResult {
  /** 最终计算值 */
  finalValue: number
  /** 基础值 */
  baseValue: number
  /** 所有步骤记录（按计算顺序） */
  steps: CalculationStep[]
  /** 按来源分组的贡献值（便于 UI 展示） */
  sourceContributions: SourceContribution[]
  /** 计算拆解（用于调试） */
  breakdown: {
    /** 加法修正总和 */
    additive: number
    /** 百分比乘区系数 */
    percentMultiplier: number
    /** 独立乘区系数 */
    independentMultiplier: number
    /** 最终乘区系数 */
    finalMultiplier: number
  }
}

// ========== 计算引擎实现 ==========

/**
 * 属性计算引擎
 * 提供统一、可追溯的属性计算能力
 */
export class AttributeEngine {
  /**
   * 计算属性最终值
   * @param baseValue 基础值
   * @param templates 修饰符模板列表
   * @param context 动态值计算上下文（可选）
   */
  static compute(
    baseValue: number,
    templates: ModifierTemplate[],
    context?: DynamicValueContext,
  ): AttributeComputeResult {
    const steps: CalculationStep[] = []
    let current = baseValue

    // 按类型分组
    const additiveMods = templates.filter((t) => t.type === 'ADDITIVE')
    const percentageMods = templates.filter((t) => t.type === 'PERCENTAGE')
    const multiplicativeMods = templates.filter(
      (t) => t.type === 'MULTIPLICATIVE',
    )
    const finalMods = templates.filter((t) => t.type === 'FINAL')

    // 辅助函数：解析数值
    const resolveValue = (t: ModifierTemplate): number => {
      if (typeof t.value === 'number') return t.value
      return t.value(context ?? { attributes: {}, params: {} })
    }

    // 辅助函数：记录计算步骤
    const recordStep = (
      mod: ModifierTemplate,
      modValue: number,
      prevValue: number,
      newValue: number,
    ) => {
      steps.push({
        modifierId: mod.id,
        sourceName: mod.sourceName,
        type: mod.type,
        appliedValue: modValue,
        previousValue: prevValue,
        intermediateResult: newValue,
      })
    }

    // 1. 加法修正
    let additive = 0
    for (const mod of additiveMods) {
      const modValue = resolveValue(mod)
      const prev = current
      current = current + modValue
      additive += modValue
      recordStep(mod, modValue, prev, current)
    }

    // 2. 百分比修正
    let percentSum = 0
    for (const mod of percentageMods) {
      percentSum += resolveValue(mod)
    }
    const percentMultiplier = 1 + percentSum
    if (percentSum !== 0) {
      const prev = current
      current = current * percentMultiplier
      // 将百分比组作为聚合步骤记录
      if (percentageMods.length > 0) {
        steps.push({
          modifierId: 'percent_group',
          sourceName: '百分比加成合计',
          type: 'PERCENTAGE',
          appliedValue: percentSum,
          previousValue: prev,
          intermediateResult: current,
        })
      }
    }

    // 3. 独立乘区
    let independentMultiplier = 1
    for (const mod of multiplicativeMods) {
      const modValue = resolveValue(mod)
      const prev = current
      current = current * (1 + modValue)
      independentMultiplier *= 1 + modValue
      recordStep(mod, modValue, prev, current)
    }

    // 4. 最终乘区
    let finalMultiplier = 1
    for (const mod of finalMods) {
      const modValue = resolveValue(mod)
      const prev = current
      current = current * (1 + modValue)
      finalMultiplier *= 1 + modValue
      recordStep(mod, modValue, prev, current)
    }

    // 5. 计算来源贡献
    const sourceContributions = this.calculateSourceContributions(
      baseValue,
      steps,
      templates,
    )

    return {
      finalValue: current,
      baseValue,
      steps,
      sourceContributions,
      breakdown: {
        additive,
        percentMultiplier,
        independentMultiplier,
        finalMultiplier,
      },
    }
  }

  /**
   * 计算每个来源对最终值的净贡献
   * @param baseValue 基础值
   * @param steps 计算步骤列表
   * @param templates 修饰符模板列表
   */
  private static calculateSourceContributions(
    baseValue: number,
    steps: CalculationStep[],
    templates: ModifierTemplate[],
  ): SourceContribution[] {
    const contributions = new Map<
      string,
      { sourceName: string; contribution: number; sourceType?: string }
    >()

    // 构建模板 ID 到来源类型的映射
    const templateTypeMap = new Map<string, string>()
    for (const t of templates) {
      templateTypeMap.set(t.id, t.sourceType)
    }

    // 每个修饰符的贡献 = 应用后值 - 应用前值
    for (const step of steps) {
      const contribution = step.intermediateResult - step.previousValue
      const existing = contributions.get(step.modifierId)
      if (existing) {
        existing.contribution += contribution
      } else {
        contributions.set(step.modifierId, {
          sourceName: step.sourceName,
          contribution,
          sourceType: templateTypeMap.get(step.modifierId),
        })
      }
    }

    return Array.from(contributions.entries()).map(([id, data]) => ({
      sourceId: id,
      sourceName: data.sourceName,
      sourceType: data.sourceType,
      contribution: data.contribution,
    }))
  }

  /**
   * 将原始修饰符转换为模板格式
   * @param modifier 原始修饰符
   * @param sourceName 来源名称
   * @param sourceType 来源类型
   */
  static toTemplate(
    modifier: {
      buffInstanceId: string
      attribute: AttributeCodes
      value: number
      type: ModifierType
    },
    sourceName: string,
    sourceType: ModifierSourceType = 'buff',
  ): ModifierTemplate {
    return {
      id: modifier.buffInstanceId,
      sourceName,
      sourceType,
      targetAttribute: modifier.attribute,
      type: modifier.type,
      value: modifier.value,
    }
  }

  /**
   * 批量转换原始修饰符为模板格式
   * @param modifiers 原始修饰符列表
   * @param getSourceName 获取来源名称的函数
   * @param getSourceType 获取来源类型的函数
   */
  static toTemplates(
    modifiers: Array<{
      buffInstanceId: string
      attribute: AttributeCodes
      value: number
      type: ModifierType
    }>,
    getSourceName: (id: string) => string,
    getSourceType: (id: string) => ModifierSourceType,
  ): ModifierTemplate[] {
    return modifiers.map((mod) =>
      this.toTemplate(
        mod,
        getSourceName(mod.buffInstanceId),
        getSourceType(mod.buffInstanceId),
      ),
    )
  }
}
