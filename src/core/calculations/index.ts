/**
 * 计算模块统一导出
 * 整合伤害计算和治疗计算功能
 */

export { DamageCalculator } from './DamageCalculator'
export type {
  DamageCalculationConfig,
  DamageModifier,
  DamageCalculationResult,
} from './DamageCalculator'

export { HealCalculator } from './HealCalculator'

export { BuffScriptUtils } from './BuffScriptUtils'
