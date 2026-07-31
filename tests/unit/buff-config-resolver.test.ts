/**
 * BuffConfigResolver 契约测试
 *
 * 守护：resolve() 是配置数据进入运行时的唯一边界——
 *  - polarity 显式声明优先，缺失时从 controlType/tags 推导，推导失败抛错
 *  - description 缺失时由解析器自动生成（effectSummary），下游无需运行时回退
 *  - effectSummary 从 effectPlan 显式派生，格式正确
 */
import { describe, it, expect } from 'vitest'
import { BuffConfigResolver } from '@/domain/buff/atomic/BuffConfigResolver'
import { AtomicEffectRegistry } from '@/domain/buff/atomic/AtomicEffectRegistry'

function makeResolver(): BuffConfigResolver {
  return new BuffConfigResolver(new AtomicEffectRegistry())
}

describe('BuffConfigResolver 契约', () => {
  it('显式 polarity 优先', () => {
    const resolved = makeResolver().resolve({
      id: 'explicit',
      polarity: 'positive',
      effects: [],
    })
    expect(resolved.polarity).toBe('positive')
  })

  it('缺失 polarity 时从 controlType 推导为 negative', () => {
    const resolved = makeResolver().resolve({
      id: 'stun_test',
      controlType: 'stun',
      effects: [],
    })
    expect(resolved.polarity).toBe('negative')
  })

  it('缺失 polarity 且无法推导时抛错（校验失败 = 构建失败）', () => {
    expect(() => makeResolver().resolve({ id: 'bare', effects: [] })).toThrow(
      /缺少 polarity/,
    )
  })

  it('缺失 description 时用 effectSummary 自动生成', () => {
    const resolved = makeResolver().resolve({
      id: 'no_desc',
      polarity: 'positive',
      duration: 2,
      effects: [{
        type: 'modifier',
        params: {
          attributes: { attack: { value: 20, type: 'PERCENTAGE' } },
        },
      }],
    })
    expect(resolved.effectSummary).toContain('攻击力↑20%')
    expect(resolved.effectSummary).toContain('（2回合）')
    expect(resolved.description).toBe(resolved.effectSummary)
  })

  it('effectSummary 区分 PERCENTAGE 与 ADDITIVE（显式类型，无 <1 猜测）', () => {
    const resolved = makeResolver().resolve({
      id: 'summary',
      polarity: 'negative',
      duration: -1,
      effects: [{
        type: 'modifier',
        params: {
          attributes: {
            attack: { value: 20, type: 'PERCENTAGE' },
            defense: { value: -5, type: 'ADDITIVE' },
          },
        },
      }],
    })
    expect(resolved.effectSummary).toContain('攻击力↑20%')
    expect(resolved.effectSummary).toContain('防御力↓5')
    expect(resolved.effectSummary).toContain('（永久）')
  })

  it('executionMode 从配置结构显式推导（取代 _track_passive_ 前缀猜测）', () => {
    const resolver = makeResolver()
    expect(
      resolver.resolve({
        id: 'eff',
        polarity: 'positive',
        effects: [{ type: 'modifier', params: {} }],
      }).executionMode,
    ).toBe('effectPlan')
    expect(
      resolver.resolve({
        id: 'trig',
        polarity: 'positive',
        triggers: [{ phase: 'turn_start', scriptId: 'x' }],
      }).executionMode,
    ).toBe('triggerOnly')
    expect(
      resolver.resolve({ id: 'bare', polarity: 'neutral' }).executionMode,
    ).toBe('marker')
  })
})
