import type {
  ATTRIBUTE_CODE,
  ModifierType,
} from '@/types/attribute'
import type {
  ModifierTemplate,
  DynamicValueContext,
} from '@/types/modifier-template'
import type {
  AttributeComputeResult,
  CalculationStep,
  SourceContribution,
} from './AttributeValue'

export class AttributeEngine {
  static compute(
    baseValue: number,
    templates: ModifierTemplate[],
    context?: DynamicValueContext,
  ): AttributeComputeResult {
    const steps: CalculationStep[] = []
    let current = baseValue

    const additiveMods = templates.filter((t) => t.type === 'ADDITIVE')
    const percentageMods = templates.filter((t) => t.type === 'PERCENTAGE')
    const multiplicativeMods = templates.filter(
      (t) => t.type === 'MULTIPLICATIVE',
    )
    const finalMods = templates.filter((t) => t.type === 'FINAL')

    const resolveValue = (t: ModifierTemplate): number => {
      if (typeof t.value === 'number') return t.value
      return t.value(context ?? { attributes: {}, params: {} })
    }

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

    let additive = 0
    for (const mod of additiveMods) {
      const modValue = resolveValue(mod)
      const prev = current
      current = current + modValue
      additive += modValue
      recordStep(mod, modValue, prev, current)
    }

    let percentSum = 0
    for (const mod of percentageMods) {
      percentSum += resolveValue(mod)
    }
    const percentMultiplier = 1 + percentSum
    if (percentSum !== 0) {
      const prev = current
      current = current * percentMultiplier
      if (percentageMods.length > 0) {
        steps.push({
          modifierId: 'percent_group',
          sourceName: 'Percentage total',
          type: 'PERCENTAGE',
          appliedValue: percentSum,
          previousValue: prev,
          intermediateResult: current,
        })
      }
    }

    let independentMultiplier = 1
    for (const mod of multiplicativeMods) {
      const modValue = resolveValue(mod)
      const prev = current
      current = current * (1 + modValue)
      independentMultiplier *= 1 + modValue
      recordStep(mod, modValue, prev, current)
    }

    let finalMultiplier = 1
    for (const mod of finalMods) {
      const modValue = resolveValue(mod)
      const prev = current
      current = current * (1 + modValue)
      finalMultiplier *= 1 + modValue
      recordStep(mod, modValue, prev, current)
    }

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
        base: baseValue,
        additive,
        percentMultiplier,
        independentMultiplier,
        finalMultiplier,
      },
    }
  }

  private static calculateSourceContributions(
    baseValue: number,
    steps: CalculationStep[],
    templates: ModifierTemplate[],
  ): SourceContribution[] {
    const contributions = new Map<
      string,
      { sourceName: string; contribution: number; sourceType?: string }
    >()

    const templateTypeMap = new Map<string, string>()
    for (const t of templates) {
      templateTypeMap.set(t.id, t.sourceType)
    }

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

  static toTemplate(
    modifier: {
      buffInstanceId: string
      attribute: ATTRIBUTE_CODE
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

  static toTemplates(
    modifiers: Array<{
      buffInstanceId: string
      attribute: ATTRIBUTE_CODE
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

type ModifierSourceType =
  | 'buff'
  | 'equipment'
  | 'skill'
  | 'terrain'
  | 'formation'
  | 'base'
  | 'talent'
