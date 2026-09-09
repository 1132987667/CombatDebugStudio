/**
 * registry.ts — 数值级校验分级体系（封神榜数值体系扩展 §5.5）
 *
 * 统一所有「数值校验」的出口：每条规则一个纯函数，注册进 NUMERIC_VALIDATION_RULES，
 * 执行入口 runValidations 跑全量并聚合。新增校验 = 注册一条规则，不改执行器
 * （对齐 schema.ts REFERENCE_RULES 模式）。与 DataIntegrityService 的引用级
 * HealthCheckIssue 并列，不复用其 kind 枚举。
 *
 * 分级语义（§5.5 表）：
 * - error：数值级错误，保存拦截（FengshenDataService.save 过滤 severity==='error'）
 * - warn：疑似问题，不拦截，HealthView 黄标
 * - info：参考信息，灰标
 */

import type {
  AttributeDef,
  AttributeLimitConfig,
  EquipmentAffixData,
  PlayerGrowthConfig,
  SystemBudgetConfig,
  SystemDistributionConfig,
} from '@/domain/fengshen/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import { checkAttributeLimits } from '@/domain/fengshen/validators/attribute-limits'

export type ValidationSeverity = 'error' | 'warn' | 'info'

/** 一键修复：把值钳回合法区间的操作描述（HealthView 按此写入） */
export interface ValidationQuickFix {
  /** 要修正的字段（定位用，如 'valueRange.max'） */
  field: string
  /** 钳回的合法值 */
  value: number
  label: string
}

/** 数值级校验统一输出 */
export interface ValidationIssue {
  /** 规则 id（如 'attribute_limits' / 'budget_deviation'） */
  ruleId: string
  severity: ValidationSeverity
  /** 问题所在表（封神榜表名 / params 域 key） */
  table: string
  /** 问题行 id（可定位跳转） */
  rowId: string
  field?: string
  /** 人话描述，含实际值与阈值 */
  message: string
  quickFix?: ValidationQuickFix
}

/**
 * 校验上下文：解包后的强类型配置快照，全部可选——规则只消费自己需要的字段，
 * 缺配置时守卫跳过（如 attributeLimit 未配置则属性上限规则直接返回空）。
 */
export interface ValidationContext {
  playerConfig?: PlayerGrowthConfig
  systemBudget?: SystemBudgetConfig
  systemDistribution?: SystemDistributionConfig
  attributeLimit?: AttributeLimitConfig
  attributes?: AttributeDef[]
  equipmentAffixes?: EquipmentAffixData[]
  buffs?: BuffJsonEntry[]
}

/** 校验规则：run 为纯函数，输入全量配置快照，输出该规则的 issue 列表 */
export interface ValidationRule {
  id: string
  /** 规则声明级别（run 可按偏离程度动态上调，如 ±40% warn / ±100% error） */
  severity: ValidationSeverity
  run: (ctx: ValidationContext) => ValidationIssue[]
}

/**
 * 规则注册表（静态聚合，无副作用 import）：新增规则 = 新建规则文件（纯导出检查函数）
 * + 此处加一行。执行入口与 HealthView / 保存拦截均从此处取全量。
 */
export const NUMERIC_VALIDATION_RULES: ValidationRule[] = [
  { id: 'attribute_limits', severity: 'error', run: checkAttributeLimits },
]

export interface ValidationReport {
  issues: ValidationIssue[]
  errorCount: number
  warnCount: number
  infoCount: number
}

export interface RunValidationOptions {
  /** 显式指定规则集（缺省 = NUMERIC_VALIDATION_RULES 全量）；测试与局部校验用 */
  rules?: ValidationRule[]
}

/** 统一执行入口：跑全部（或指定）规则，issue 保持规则注册顺序，附三级计数 */
export function runValidations(ctx: ValidationContext, opts: RunValidationOptions = {}): ValidationReport {
  const rules = opts.rules ?? NUMERIC_VALIDATION_RULES
  const issues: ValidationIssue[] = []
  for (const rule of rules) {
    issues.push(...rule.run(ctx))
  }
  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warnCount = issues.filter((i) => i.severity === 'warn').length
  const infoCount = issues.filter((i) => i.severity === 'info').length
  return { issues, errorCount, warnCount, infoCount }
}
