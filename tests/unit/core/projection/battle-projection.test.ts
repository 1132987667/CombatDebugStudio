/**
 * battle-projection.test.ts — BattleProjection 批处理与版本语义（T3）
 *
 * 锁三条契约：
 *   1. markDirty 经 microtask 合并，一帧最多投影一次
 *   2. statsVersion 未变 → 跳过写入；已存在快照 → Object.assign 就地更新（引用不变）
 *   3. 单个实体投影抛错只吞掉该实体，不拖垮同批其他参与者
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BattleProjection, type ParticipantStore } from '@/application/projection/BattleProjection'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { createParticipantFromEnemy } from '@tests/fixtures/participants'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { UIParticipantSnapshot } from '@/shared/types/projection'

const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn(), offByListenerId: vi.fn() }

interface ControllableEntity {
  id: string
  name: string
  level: number
  team: ParticipantSide
  currentHealth: number
  maxHealth: number
  currentEnergy: number
  maxEnergy: number
  statsVersion: number
  getAttribute: (code: string) => number
  isAlive: () => boolean
  getBuffInstanceIds: () => string[]
  setDirtyCallback: (cb: () => void) => void
  markDirty: () => void // 调已注入回调，模拟领域侧变更
  toEntity: () => BattleEntity
}

function createControllableEntity(id: string): ControllableEntity {
  let dirtyCb: (() => void) | null = null
  const e: ControllableEntity = {
    id,
    name: `实体-${id}`,
    level: 10,
    team: ParticipantSide.ALLY,
    currentHealth: 300,
    maxHealth: 300,
    currentEnergy: 30,
    maxEnergy: 100,
    statsVersion: 1,
    getAttribute: () => 50,
    isAlive: () => true,
    getBuffInstanceIds: () => [],
    setDirtyCallback: (cb) => { dirtyCb = cb },
    markDirty: () => dirtyCb?.(),
    toEntity: () => e as unknown as BattleEntity,
  }
  return e
}

/** 让出一帧 microtask 队列（BattleProjection 的 flush 走 queueMicrotask） */
async function settleMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('BattleProjection', () => {
  let store: ParticipantStore
  let buffSystem: BuffSystem
  let projection: BattleProjection

  beforeEach(() => {
    const mockLogger = createMockLogManager()
    LoggerProvider.logger = mockLogger
    buffSystem = new BuffSystem(new BuffScriptRegistry(), mockEventBus as never, mockLogger)
    store = { participants: new Map<string, UIParticipantSnapshot>() }
    projection = new BattleProjection(store, buffSystem)
  })

  it('markDirty → microtask 后快照写入 store', async () => {
    const e = createControllableEntity('a')
    projection.register(e.toEntity())

    e.markDirty()
    expect(store.participants.has('a')).toBe(false) // 尚未 flush
    await settleMicrotasks()

    expect(store.participants.get('a')?.name).toBe('实体-a')
    expect(store.participants.get('a')?.healthPercent).toBe(100)
  })

  it('同帧多次 markDirty 合并为一次投影（最终值一致）', async () => {
    const e = createControllableEntity('a')
    projection.register(e.toEntity())

    e.name = '第一次'
    e.statsVersion++
    e.markDirty()
    e.name = '第二次'
    e.statsVersion++
    e.markDirty()
    await settleMicrotasks()

    expect(store.participants.get('a')?.name).toBe('第二次')
  })

  it('statsVersion 未变 → 跳过写入（快照停留在旧值）', async () => {
    const e = createControllableEntity('a')
    projection.register(e.toEntity())
    e.markDirty()
    await settleMicrotasks()
    expect(store.participants.get('a')?.name).toBe('实体-a')

    // 变更数据但不推进版本号 → 投影应跳过
    e.name = '改了个名'
    e.markDirty()
    await settleMicrotasks()
    expect(store.participants.get('a')?.name).toBe('实体-a')

    // 推进版本号后更新生效，且对象引用不变（就地 Object.assign，reactive 契约）
    const before = store.participants.get('a')
    e.statsVersion++
    e.markDirty()
    await settleMicrotasks()
    expect(store.participants.get('a')?.name).toBe('改了个名')
    expect(store.participants.get('a')).toBe(before)
  })

  it('单个实体投影抛错被吞并记 console.error，同批其他实体正常投影', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = createControllableEntity('bad')
    bad.getAttribute = () => { throw new Error('属性读取爆炸') }
    const good = createControllableEntity('good')
    projection.registerAll([bad.toEntity(), good.toEntity()])

    projection.flushAll()

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[BattleProjection] flush 失败 (id=bad)'),
      expect.any(Error),
    )
    expect(store.participants.get('good')?.name).toBe('实体-good')
    errSpy.mockRestore()
  })

  it('unregister 后不再参与 flushAll；clear 清空版本缓存', async () => {
    const e = createControllableEntity('a')
    projection.register(e.toEntity())
    projection.flushAll()
    expect(store.participants.has('a')).toBe(true)

    projection.unregister('a')
    store.participants.clear()
    projection.flushAll()
    expect(store.participants.has('a')).toBe(false)

    // clear 后重新注册：版本号缓存已清空，即使 version 未变也会全量投影
    projection.register(e.toEntity())
    projection.clear()
    projection.register(e.toEntity())
    projection.flushAll()
    expect(store.participants.has('a')).toBe(true)
  })

  it('getReviveCount 注入透传到快照', () => {
    const p = new BattleProjection(store, buffSystem, () => 3)
    const e = createControllableEntity('a')
    p.register(e.toEntity())
    p.flushAll()
    expect(store.participants.get('a')?.reviveCount).toBe(3)
  })

  it('端到端：真实参与者叠 3 层 buff → flushAll 快照与 BuffSystem 实值一致', async () => {
    BattleParticipantImpl.eventBus = mockEventBus as never
    const mockLogger = createMockLogManager()
    const bs = new BuffSystem(new BuffScriptRegistry(), mockEventBus as never, mockLogger)
    const store2: ParticipantStore = { participants: new Map() }
    const proj = new BattleProjection(store2, bs)

    const pl = createParticipantFromEnemy('yaotu_fire', ParticipantSide.ALLY)
    if (!pl) throw new Error('配置缺失')
    pl.setBuffQuery(bs as never)
    proj.register(pl as unknown as BattleEntity)

    for (let i = 0; i < 3; i++) bs.addBuff(pl.id, 'buff_fengshi', {}, 1)
    proj.flushAll()

    const snap = store2.participants.get(pl.id)
    const item = snap?.buffs.find((b) => b.buffId === 'buff_fengshi')
    expect(item?.currentStacks).toBe(3)
    const inst = bs.getBuffInstances(pl.id).find((i) => i.buffId === 'buff_fengshi')
    expect(item?.remainingTurns).toBe(inst?.remainingTurns)
    expect(item?.name).toBeTruthy() // 展示名由 JSON 配置解析，不应回退成 id
  })
})
