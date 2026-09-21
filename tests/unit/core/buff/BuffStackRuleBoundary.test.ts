/**
 * stackRule / controlType 配置边界回归（stackRule 审计遗留项）
 *
 * 锁定四条不变式，防止「假类型安全」再次漏网：
 * 1. resolver 对缺省 stackRule 归一为 StackRule.LIMITED（小写枚举），不是大写字符串
 * 2. resolver 对显式坏值（早期封神榜 'replace'/'stack'、大写 'LIMITED'）抛错，不静默降级
 * 3. addBuff 叠层 switch 采纳 buffs.json 声明的 stackRule（independent 产生独立实例，非退化为无限新建）
 * 4. 保存期 validateBuffConfigShape 拒绝越界枚举；封神榜编辑器值域与引擎 StackRule 同源
 */
import { describe, it, expect, vi } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BuffConfigResolver } from '@/domain/buff/atomic/BuffConfigResolver'
import { AtomicEffectRegistry } from '@/domain/buff/atomic/AtomicEffectRegistry'
import { ControlType, StackRule } from '@/domain/buff/types'
import { validateBuffConfigShape } from '@/domain/buff/buffConfigValidation'
import { STACK_RULE_VALUE_LABEL } from '@/domain/fengshen/schema'
import { getBuffConfig } from '@tests/fixtures/loadTestData'
import { createMockLogManager } from '@tests/mocks/MockLogger'

const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn(), offByListenerId: vi.fn() }
const mockLogger = createMockLogManager()

function makeResolver() {
  return new BuffConfigResolver(new AtomicEffectRegistry())
}

describe('stackRule / controlType 配置边界', () => {
  it('缺省 stackRule → 小写 StackRule.LIMITED（非大写字符串）', () => {
    const raw = getBuffConfig('buff_poison')!
    expect(raw.stackRule).toBeUndefined()
    expect(makeResolver().resolve(raw).stackRule).toBe(StackRule.LIMITED)
  })

  it('缺省 controlType → ControlType.NONE（小写 none，SkillExecutor 净化/受控判定不误命中）', () => {
    const raw = getBuffConfig('buff_poison')!
    expect(raw.controlType).toBeUndefined()
    const resolved = makeResolver().resolve(raw)
    // 消费端判定式：resolved.controlType !== ControlType.NONE 为「受控」
    expect(resolved.controlType === ControlType.NONE).toBe(true)
  })

  it('显式合法 stackRule 原样解析', () => {
    const raw = getBuffConfig('buff_poison')!
    expect(makeResolver().resolve({ ...raw, stackRule: StackRule.INDEPENDENT }).stackRule).toBe(
      StackRule.INDEPENDENT,
    )
  })

  it('越界 stackRule 在 resolver 抛错（大写 LIMITED / 早期编辑器 replace 均须拦截）', () => {
    const raw = getBuffConfig('buff_poison')!
    expect(() => makeResolver().resolve({ ...raw, stackRule: 'LIMITED' as never })).toThrow(/stackRule/)
    expect(() => makeResolver().resolve({ ...raw, stackRule: 'replace' as never })).toThrow(/stackRule/)
  })

  it('越界 controlType 在 resolver 抛错', () => {
    const raw = getBuffConfig('buff_poison')!
    expect(() => makeResolver().resolve({ ...raw, controlType: 'NONE' as never })).toThrow(/controlType/)
  })

  it('addBuff 采纳 JSON 声明的 independent → 重复施加产生独立实例', () => {
    const registry = new BuffScriptRegistry()
    const raw = getBuffConfig('buff_poison')!
    // 借用真实 buff 结构，改造成无脚本 + independent 声明
    registry.loadBuffConfigsFromArray([
      { ...raw, id: 'ind_test_buff', stackRule: StackRule.INDEPENDENT, maxStacks: 5, polarity: 'negative', tags: ['poison'] },
    ])
    const sys = new BuffSystem(registry, mockEventBus, mockLogger)
    for (let i = 0; i < 3; i++) {
      sys.addBuff('c1', 'ind_test_buff', { id: 'ind_test_buff', duration: 2 }, 1 + i)
    }
    const instances = sys.getBuffInstances('c1').filter((b) => b.buffId === 'ind_test_buff')
    // independent：3 个各 1 层的独立实例（LIMITED 退化会是 1 实例多层）
    expect(instances.length).toBe(3)
    expect(instances.every((b) => b.currentStacks === 1)).toBe(true)
  })

  it('保存期 validateBuffConfigShape 拒绝越界 stackRule / controlType', () => {
    expect(validateBuffConfigShape({ id: 'x', polarity: 'positive', stackRule: 'replace' })).toEqual(
      expect.arrayContaining([expect.stringContaining('stackRule')]),
    )
    expect(validateBuffConfigShape({ id: 'x', polarity: 'positive', controlType: 'BAD' })).toEqual(
      expect.arrayContaining([expect.stringContaining('controlType')]),
    )
    // 合法值不报
    expect(validateBuffConfigShape({ id: 'x', polarity: 'positive', stackRule: StackRule.LIMITED })).toEqual([])
  })

  it('封神榜编辑器 stackRule 值域与引擎枚举同源', () => {
    const engineValues = Object.values(StackRule).sort()
    expect(Object.keys(STACK_RULE_VALUE_LABEL).sort()).toEqual(engineValues)
  })
})
