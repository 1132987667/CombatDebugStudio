/**
 * 封神榜 · 数值校验分级体系测试（§5.5 registry）
 *
 * 覆盖：
 * - runValidations：空 ctx / 空规则集返回空报告
 * - opts.rules 注入测试规则：执行、保持传入顺序、issue 原样透传
 * - 三级计数 errorCount / warnCount / infoCount 统计正确
 * - NUMERIC_VALIDATION_RULES 注册表形态（步骤 1 为空，规则文件后续注册）
 *
 * 具体规则（attribute-limits / budget-deviation）的行为在各自规则单测中断言，
 * 此处只锁定执行入口契约。
 *
 * 运行: npx vitest run tests/unit/fengshen-validators.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  NUMERIC_VALIDATION_RULES,
  runValidations,
  type ValidationContext,
  type ValidationIssue,
  type ValidationRule,
} from '@/domain/fengshen/validators/registry'

function issueOf(over: Partial<ValidationIssue>): ValidationIssue {
  return { ruleId: 'test_rule', severity: 'error', table: 'params', rowId: 'row', message: 'msg', ...over }
}

const errorRule: ValidationRule = {
  id: 'r_error',
  severity: 'error',
  run: () => [issueOf({ severity: 'error', message: 'e1' }), issueOf({ severity: 'warn', message: 'w1' })],
}
const infoRule: ValidationRule = {
  id: 'r_info',
  severity: 'info',
  run: (ctx) => (ctx.attributes ? [issueOf({ severity: 'info' })] : []),
}

describe('runValidations 执行入口', () => {
  it('空规则集 + 空 ctx 返回空报告', () => {
    const report = runValidations({}, { rules: [] })
    expect(report.issues).toEqual([])
    expect(report.errorCount).toBe(0)
    expect(report.warnCount).toBe(0)
    expect(report.infoCount).toBe(0)
  })

  it('按传入顺序执行规则并透传 issue', () => {
    const report = runValidations({}, { rules: [errorRule, infoRule] })
    expect(report.issues.map((i) => i.message)).toEqual(['e1', 'w1'])
    expect(report.errorCount).toBe(1)
    expect(report.warnCount).toBe(1)
    expect(report.infoCount).toBe(0)
  })

  it('规则内按 ctx 字段守卫跳过（attributes 缺失时 infoRule 输出空）', () => {
    const report = runValidations({}, { rules: [infoRule] })
    expect(report.issues).toEqual([])
    const withAttrs = runValidations({ attributes: [] }, { rules: [infoRule] })
    expect(withAttrs.infoCount).toBe(1)
  })

  it('缺省 rules 时跑注册表全量（当前为空，未来规则注册后自动纳入）', () => {
    const report = runValidations({})
    expect(report.issues).toHaveLength(NUMERIC_VALIDATION_RULES.reduce((n, r) => n + r.run({}).length, 0))
  })
})

describe('NUMERIC_VALIDATION_RULES 注册表', () => {
  it('注册表 id 唯一（防重复注册）', () => {
    const ids = NUMERIC_VALIDATION_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
