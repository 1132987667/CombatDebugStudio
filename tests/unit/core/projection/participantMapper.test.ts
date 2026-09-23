/**
 * participantMapper.test.ts — 领域实体 → UI 快照映射语义（T3）
 *
 * participantMapper 是投影层纯函数，UI 所有数值/标签都经它出，此前零测试。
 * 重点锁：除零守卫、护盾读取、失效实例跳过、perStack 透传契约。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { participantToSnapshot } from '@/application/projection/participantMapper'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { createParticipantFromEnemy } from '@tests/fixtures/participants'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'

const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn(), offByListenerId: vi.fn() }

/** 可控最小实体：mapper 只读这些公有字段 */
function fakeEntity(overrides?: Partial<Record<string, unknown>>): BattleEntity {
  return {
    id: 'fake_1',
    name: '假人',
    level: 1,
    team: ParticipantSide.ALLY,
    currentHealth: 500,
    maxHealth: 1000,
    currentEnergy: 50,
    maxEnergy: 200,
    getAttribute: (code: string) =>
      ({ [ATTRIBUTE_CODE.attack]: 88, [ATTRIBUTE_CODE.defense]: 12, [ATTRIBUTE_CODE.speed]: 30, [ATTRIBUTE_CODE.critRate]: 5, [ATTRIBUTE_CODE.critDamage]: 150 })[code] ?? 0,
    isAlive: () => true,
    getBuffInstanceIds: () => [],
    statsVersion: 7,
    ...overrides,
  } as unknown as BattleEntity
}

describe('participantToSnapshot', () => {
  let buffSystem: BuffSystem
  let registry: BuffScriptRegistry

  beforeEach(() => {
    const mockLogger = createMockLogManager()
    LoggerProvider.logger = mockLogger
    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus as never, mockLogger)
  })

  describe('核心数值与派生状态', () => {
    it('healthPercent/energyPercent 按真实值计算，version 透传 statsVersion', () => {
      const snap = participantToSnapshot(fakeEntity(), buffSystem)
      expect(snap.healthPercent).toBe(50)
      expect(snap.energyPercent).toBe(25)
      expect(snap.version).toBe(7)
      expect(snap.attack).toBe(88)
    })

    it('maxHealth=0 → healthPercent 0 而非 NaN（除零守卫）', () => {
      const snap = participantToSnapshot(
        fakeEntity({ maxHealth: 0, currentHealth: 0 }),
        buffSystem,
      )
      expect(snap.healthPercent).toBe(0)
    })

    it('maxEnergy=0 → energyPercent 0 而非 NaN', () => {
      const snap = participantToSnapshot(
        fakeEntity({ maxEnergy: 0 }),
        buffSystem,
      )
      expect(snap.energyPercent).toBe(0)
    })

    it('shield 读取 BuffSystem.getShieldValue', () => {
      buffSystem.setShieldValue('fake_1', 123)
      const snap = participantToSnapshot(fakeEntity(), buffSystem)
      expect(snap.shield).toBe(123)
    })

    it('formationRow / reviveCount 透传可选参数', () => {
      const snap = participantToSnapshot(fakeEntity(), buffSystem, 'back', 2)
      expect(snap.formationRow).toBe('back')
      expect(snap.reviveCount).toBe(2)
    })
  })

  describe('buff 原始条目构建', () => {
    it('getBuffInstanceIds 返回已失效实例 id 时跳过而非崩溃', () => {
      const entity = fakeEntity({ getBuffInstanceIds: () => ['ghost_id'] })
      const snap = participantToSnapshot(entity, buffSystem)
      expect(snap.buffs).toEqual([])
    })

    it('真实 buff 快照：层数/剩余回合与 BuffSystem 实值一致', () => {
      BattleParticipantImpl.eventBus = mockEventBus as never
      const p = createParticipantFromEnemy('yaotu_gold', ParticipantSide.ENEMY)
      if (!p) throw new Error('配置缺失')
      p.setBuffQuery(buffSystem as never)

      buffSystem.addBuff(p.id, 'buff_liejia', {}, 1)
      buffSystem.addBuff(p.id, 'buff_liejia', {}, 1) // LIMITED 叠 2 层

      const snap = participantToSnapshot(p as unknown as BattleEntity, buffSystem)
      const item = snap.buffs.find((b) => b.buffId === 'buff_liejia')
      expect(item).toBeDefined()
      expect(item?.currentStacks).toBe(2)
      // 快照剩余回合与引擎实例一致
      const inst = buffSystem
        .getBuffInstances(p.id)
        .find((i) => i.buffId === 'buff_liejia')
      expect(item?.remainingTurns).toBe(inst?.remainingTurns)
    })

    // 回归锁定（2026-09-22 修复）：addBuff 合并链此前不写入 polarity，
    // 快照 isNegative 恒 false、UI 减益全按增益着色；现由 resolver 解析结果透传。
    it('减益 buff 的 isNegative 应为 true', () => {
      BattleParticipantImpl.eventBus = mockEventBus as never
      const p = createParticipantFromEnemy('yaotu_gold', ParticipantSide.ENEMY)
      if (!p) throw new Error('配置缺失')
      p.setBuffQuery(buffSystem as never)
      buffSystem.addBuff(p.id, 'buff_liejia', {}, 1)

      const snap = participantToSnapshot(p as unknown as BattleEntity, buffSystem)
      expect(snap.buffs.find((b) => b.buffId === 'buff_liejia')?.isNegative).toBe(true)
    })

    // 回归锁定（2026-09-23 A1 修复）：合并链此前不读 JSON description，
    // 快照描述恒空 → useBuffDisplay 回退成 buff 名，190 条配置描述从未上屏。
    it('JSON 声明的 description 应透传到快照条目', () => {
      BattleParticipantImpl.eventBus = mockEventBus as never
      const p = createParticipantFromEnemy('yaotu_gold', ParticipantSide.ENEMY)
      if (!p) throw new Error('配置缺失')
      p.setBuffQuery(buffSystem as never)
      buffSystem.addBuff(p.id, 'buff_liejia', {}, 1)

      const snap = participantToSnapshot(p as unknown as BattleEntity, buffSystem)
      const expected = registry.getBuffConfig('buff_liejia')?.description
      expect(expected).toBeTruthy()
      expect(snap.buffs.find((b) => b.buffId === 'buff_liejia')?.description).toBe(expected)
    })

    it('perStack=false 的修饰符透传该标志（展示层据此跳过 ×stacks）', () => {
      const cfg = {
        id: 'test_psr_off',
        name: '固定加成',
        description: '',
        duration: 2,
        maxStacks: 3,
        stackRule: 'limited',
        polarity: 'positive',
        effects: [
          {
            type: 'modifier',
            params: {
              attributes: { attack: { value: 10, type: 'PERCENTAGE' } },
              perStack: false,
            },
          },
        ],
      } as unknown as BuffJsonEntry
      registry.loadBuffConfigsFromArray([cfg])

      BattleParticipantImpl.eventBus = mockEventBus as never
      const p = createParticipantFromEnemy('yaotu_gold', ParticipantSide.ENEMY)
      if (!p) throw new Error('配置缺失')
      p.setBuffQuery(buffSystem as never)
      buffSystem.addBuff(p.id, 'test_psr_off', {}, 1)
      buffSystem.addBuff(p.id, 'test_psr_off', {}, 1) // 2 层

      const snap = participantToSnapshot(p as unknown as BattleEntity, buffSystem)
      const item = snap.buffs.find((b) => b.buffId === 'test_psr_off')
      expect(item?.attributes?.attack).toBeDefined()
      expect(
        (item?.attributes?.attack as unknown as { perStack?: boolean }).perStack,
      ).toBe(false)
    })

    // 回归锁定（2026-09-22 修复）：光环修饰符嵌套在 AURA.params.modifiers，
    // 此前只扫 effectPlan 顶层 MODIFIER，光环 buff 悬停属性明细恒为空。
    it('光环 buff 从 AURA.params.modifiers 提取属性明细（perStack:false 与叠层不放大语义对齐）', () => {
      const cfg = {
        id: 'test_aura_attrs',
        name: '测试光环',
        description: '',
        duration: -1,
        maxStacks: 1,
        stackRule: 'limited',
        polarity: 'positive',
        effects: [
          {
            type: 'aura',
            params: {
              targetSelector: 'self',
              modifiers: [
                { id: 'aura_atk', targetAttribute: 'attack', type: 'PERCENTAGE', value: 10 },
                { id: 'aura_def', targetAttribute: 'defense', type: 'ADDITIVE', value: 5 },
              ],
            },
          },
        ],
      } as unknown as BuffJsonEntry
      registry.loadBuffConfigsFromArray([cfg])

      BattleParticipantImpl.eventBus = mockEventBus as never
      const p = createParticipantFromEnemy('yaotu_gold', ParticipantSide.ENEMY)
      if (!p) throw new Error('配置缺失')
      p.setBuffQuery(buffSystem as never)
      buffSystem.addBuff(p.id, 'test_aura_attrs', {}, 1)

      const snap = participantToSnapshot(p as unknown as BattleEntity, buffSystem)
      const item = snap.buffs.find((b) => b.buffId === 'test_aura_attrs')
      expect(item?.isAura).toBe(true)
      expect(item?.attributes?.attack).toEqual({ value: 10, type: 'PERCENTAGE', perStack: false })
      expect(item?.attributes?.defense).toEqual({ value: 5, type: 'ADDITIVE', perStack: false })
    })
  })
})
