/**
 * buff-effect-display-name.test.ts — 战斗日志 buff 显示名（effects[].buffName）
 *
 * 回归锁定（2026-10-13 修复）：BuffSystem 施加路径（被动/触发器，如桃林守护者
 * 终极技的山神系自增益）构造 BattleEffect 时曾漏填 buffName，EffectRenderer
 * 的 `buffName ?? buffId` 兜底把内部 id（buff_mountain_god）直出到玩家日志；
 * 技能路径由 SkillExecutor 填充不受影响。本测试钉死：任何经 addBuff 的施加，
 * record.effects 必须携带配置显示名。
 *
 * 运行: npx vitest run tests/unit/buff-effect-display-name.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import { createParticipantFromEnemy } from '@tests/fixtures/participants'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import type { CombatRecord } from '@/domain/battle/type/types'

const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn(), offByListenerId: vi.fn() }

function makeBuffCfg(id: string, name: string): BuffJsonEntry {
  return {
    id,
    name,
    description: '',
    duration: 2,
    maxStacks: 1,
    stackRule: 'limited',
    polarity: 'positive',
    effects: [
      { type: 'modifier', params: { attributes: { attack: { value: 5, type: 'ADDITIVE' } } } },
    ],
  } as unknown as BuffJsonEntry
}

describe('record.effects 携带 buff 显示名', () => {
  let buffSystem: BuffSystem
  let entity: BattleEntity
  let entityId: string

  beforeEach(() => {
    const mockLogger = createMockLogManager()
    LoggerProvider.logger = mockLogger
    const registry = new BuffScriptRegistry()
    registry.loadBuffConfigsFromArray([
      makeBuffCfg('buff_test_named', '古桃之怒'),
      makeBuffCfg('buff_test_debuff_name', '蚀骨毒'),
    ])
    buffSystem = new BuffSystem(registry, mockEventBus as never, mockLogger)

    BattleParticipantImpl.eventBus = mockEventBus as never
    const p = createParticipantFromEnemy('yaotu_gold', ParticipantSide.ENEMY)
    if (!p) throw new Error('配置缺失')
    p.setBuffQuery(buffSystem as never)
    entity = p as unknown as BattleEntity
    entityId = p.id
  })

  it('施加增益：effects[].buffName 为配置显示名而非 buffId', () => {
    const record = { effects: [] } as unknown as CombatRecord
    buffSystem.addBuff(entityId, 'buff_test_named', {}, 1, { record })
    const effect = record.effects?.[0] as { buffName?: string; buffId?: string }
    expect(effect.buffName).toBe('古桃之怒')
    expect(effect.buffId).toBe('buff_test_named')
  })

  it('施加减益：DEBUFF 类型同样携带显示名', () => {
    const record = { effects: [] } as unknown as CombatRecord
    buffSystem.addBuff(entityId, 'buff_test_debuff_name', { polarity: 'negative' }, 1, { record })
    const effect = record.effects?.[0] as { buffName?: string; type?: unknown }
    expect(effect.buffName).toBe('蚀骨毒')
  })
})
