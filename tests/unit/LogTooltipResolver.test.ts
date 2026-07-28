/**
 * 文件: LogTooltipResolver.test.ts
 * 功能: LogTooltipResolver 单元测试
 */
import { describe, it, expect, vi } from 'vitest'
import { LogTooltipResolver } from '@/application/projection/LogTooltipResolver'
import type { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import type { SkillManager } from '@/domain/skill/SkillManager'

function createMockRegistries(): { buffRegistry: BuffScriptRegistry; skillManager: SkillManager } {
  const buffRegistry = {
    getBuffConfig: vi.fn((id: string) => {
      const configs: Record<string, any> = {
        buff_leader_aura: {
          id: 'buff_leader_aura',
          name: '首领光环',
          category: 'aura',
          duration: -1,
          aura: {
            targetSelector: 'allies',
            modifiers: [{ targetAttribute: 'attack', type: 'PERCENTAGE', value: 0.15 }],
          },
        },
        buff_poison: {
          id: 'buff_poison',
          name: '中毒',
          category: 'dot',
          duration: 3,
          tags: ['dot', 'debuff'],
          isDebuff: true,
        },
        buff_stun: {
          id: 'buff_stun',
          name: '眩晕',
          category: 'control',
          controlType: 'stun',
          duration: 1,
        },
        buff_iron_armor: {
          id: 'buff_iron_armor',
          name: '铁甲护体',
          category: 'attribute',
          duration: -1,
          attributes: { dmgReduction: '+20%' },
        },
        buff_no_config: undefined,
      }
      return configs[id]
    }),
    getResolvedBuffConfig: vi.fn(() => undefined),
  } as unknown as BuffScriptRegistry

  const skillManager = {
    getSkillConfig: vi.fn((id: string) => undefined),
    getSkillConfigs: vi.fn(() => new Map()),
  } as unknown as SkillManager

  return { buffRegistry, skillManager }
}

describe('LogTooltipResolver', () => {
  it('resolves aura buff', () => {
    const { buffRegistry, skillManager } = createMockRegistries()
    const resolver = new LogTooltipResolver(buffRegistry, skillManager)

    const data = resolver.resolve({ kind: 'buff', id: 'buff_leader_aura' })
    expect(data).not.toBeNull()
    expect(data!.name).toBe('首领光环')
    expect(data!.badge).toContain('光环')
    expect(data!.durationLabel).toBe('永久')
    expect(data!.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '生效范围', value: '全体友方' }),
      ]),
    )
  })

  it('resolves dot buff', () => {
    const { buffRegistry, skillManager } = createMockRegistries()
    const resolver = new LogTooltipResolver(buffRegistry, skillManager)

    const data = resolver.resolve({ kind: 'buff', id: 'buff_poison' })
    expect(data).not.toBeNull()
    expect(data!.name).toBe('中毒')
    expect(data!.durationLabel).toBe('3回合')
  })

  it('resolves control buff', () => {
    const { buffRegistry, skillManager } = createMockRegistries()
    const resolver = new LogTooltipResolver(buffRegistry, skillManager)

    const data = resolver.resolve({ kind: 'buff', id: 'buff_stun' })
    expect(data).not.toBeNull()
    expect(data!.name).toBe('眩晕')
    expect(data!.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '效果', value: '无法行动' }),
      ]),
    )
  })

  it('resolves modifier buff', () => {
    const { buffRegistry, skillManager } = createMockRegistries()
    const resolver = new LogTooltipResolver(buffRegistry, skillManager)

    const data = resolver.resolve({ kind: 'buff', id: 'buff_iron_armor' })
    expect(data).not.toBeNull()
    expect(data!.name).toBe('铁甲护体')
    expect(data!.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'dmgReduction', value: '+20%' }),
      ]),
    )
  })

  it('returns fallback for unknown buff', () => {
    const { buffRegistry, skillManager } = createMockRegistries()
    const resolver = new LogTooltipResolver(buffRegistry, skillManager)

    const data = resolver.resolve({ kind: 'buff', id: 'buff_no_config' })
    expect(data).not.toBeNull()
    expect(data!.name).toBe('buff_no_config')
    expect(data!.description).toBe('未找到配置')
  })

  it('returns null for unknown kind', () => {
    const { buffRegistry, skillManager } = createMockRegistries()
    const resolver = new LogTooltipResolver(buffRegistry, skillManager)

    const data = resolver.resolve({ kind: 'skill', id: 'unknown_skill' })
    expect(data).not.toBeNull()
    expect(data!.name).toBe('unknown_skill')
    expect(data!.description).toBe('未找到配置')
  })
})
