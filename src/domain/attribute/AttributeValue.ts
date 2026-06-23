import type { ATTRIBUTE_CODE } from '@/types/attribute'

export type ModifierType =
  | 'ADDITIVE'
  | 'MULTIPLICATIVE'
  | 'PERCENTAGE'
  | 'FINAL'

export type ModifierSourceType =
  | 'buff'
  | 'equipment'
  | 'skill'
  | 'terrain'
  | 'formation'
  | 'base'
  | 'talent'

export interface Modifier {
  sourceKey: string
  sourceType: ModifierSourceType
  attribute: ATTRIBUTE_CODE
  value: number
  type: ModifierType
  description?: string
}

export interface CalculationBreakdown {
  base: number
  additive: number
  percentMultiplier: number
  independentMultiplier: number
  finalMultiplier: number
}

export interface CalculationStep {
  modifierId: string
  sourceName: string
  type: ModifierType
  appliedValue: number
  previousValue: number
  intermediateResult: number
}

export interface AttributeValue {
  value: number
  base: number
  modifiers: Modifier[]
  isPercentage: boolean
  dirty: boolean
  breakdown?: CalculationBreakdown
  trace?: AttributeComputeResult
}

export interface AttributeComputeResult {
  finalValue: number
  baseValue: number
  steps: CalculationStep[]
  sourceContributions: SourceContribution[]
  breakdown: CalculationBreakdown
}

export interface SourceContribution {
  sourceId: string
  sourceName: string
  sourceType?: string
  contribution: number
}

export type AttributeValues = Record<ATTRIBUTE_CODE, AttributeValue>
