/**
 * battle-p1-fixes.test.ts — P1 逻辑修复批次回归
 *
 * 覆盖四组修复：
 * 1. 百分比伤害（DOT/自残/场地）击杀走 settleDamage → pendingDeaths：
 *    此前正百分比直接 takeDamage 绕过死亡结算，ON_DEATH/ON_KILL/救护/连击清理全不触发。
 * 2. ENERGY_GAINED 事件携带真实回合（turnProvider 注入）：
 *    此前硬编码 currentTurn:0，触发器冷却判定 turn - lastTurn = 0 < cooldown 永真，
 *    "每 N 回合最多触发一次"的回能触发器首次触发后永久沉默。
 * 3. TurnManager 行动顺序：随机键先取后排（比较器自洽），同 seed 两次结果一致。
 * 4. BattleProjection flush：脏标记是唯一投影信号（statsVersion 不再拦截
 *    buff/冷却类结构变化）；快照构建抛错不吞版本（下次 flush 重试，不冻结）。
 * 5. SeededRandom mulberry32：确定性 + 分布质量（旧 LCG 期望 25% 实测 16% 的系统性偏差）。
 *
 * 运行: npx vitest run tests/unit/battle-p1-fixes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide, BattleTriggerPhase } from '@/domain/battle/type/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import { TurnManager } from '@/domain/battle/service/TurnManager'
import type { BuffSystem as BuffSystemType } from '@/domain/buff/BuffSystem'
import { SeededRandom } from '@/shared/utils/SeededRandom'
import { BattleProjection } from '@/application/projection/BattleProjection'
import { participantToSnapshot } from '@/application/projection/participantMapper'
import type { UIParticipantSnapshot } from '@/shared/types/projection'
import type { BuffSystem as IBuffSystemForProjection } from '@/domain/buff/BuffSystem'

/** BattleSystem 未公开 executor 访问器，测试内取内部 BattleExecutor 验证 pendingDeaths */
const drainPendingDeaths = (bs: BattleSystem): Array<{ deadId: string; killerId: string }> =>
  (bs as unknown as { executor: { drainPendingDeaths(): Array<{ deadId: string; killerId: string }> } })
    .executor.drainPendingDeaths()

describe('百分比伤害死亡结算', () => {
  let buffSystem: BuffSystem
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    buffSystem = container.resolve<BuffSystem>('BuffSystem')
    battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    battleSystem.loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('DOT 百分比伤害击杀目标 → 进入 pendingDeaths（ON_DEATH/ON_KILL 链路可触发）', () => {
    const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    battleSystem.initialize(allies, enemies)
    const enemy = enemies[0]!
    expect(enemy.isAlive()).toBe(true)

    // 100% 当前气血百分比伤害 → 必然击杀（走 damageCallback 正百分比分支）
    buffSystem.requestDamage(enemy.id, 0, undefined, 1.0, 'dot')

    expect(enemy.currentHealth).toBe(0)
    const pending = drainPendingDeaths(battleSystem)
    expect(pending).toHaveLength(1)
    expect(pending[0]!.deadId).toBe(enemy.id)
    // 无来源的触发器伤害，killer 记为 system
    expect(pending[0]!.killerId).toBe('system')
  })

  it('百分比伤害被护盾完全吸收 → 不进 pendingDeaths', () => {
    const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    battleSystem.initialize(allies, enemies)
    const enemy = enemies[0]!

    // 高护盾吸收全部百分比伤害：血量不掉、不死亡
    buffSystem.setShieldValue(enemy.id, 999999)
    buffSystem.requestDamage(enemy.id, 0, undefined, 0.5, 'dot')

    expect(enemy.isAlive()).toBe(true)
    expect(drainPendingDeaths(battleSystem)).toHaveLength(0)
  })
})

describe('ENERGY_GAINED 事件回合', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer() // 注入 BattleParticipantImpl.eventBus
  })

  it('注入 turnProvider 后事件携带真实回合', () => {
    const received: Array<{ currentTurn?: number }> = []
    BattleParticipantImpl.eventBus.on(BattleTriggerPhase.ENERGY_GAINED, (ctx: unknown) => {
      received.push(ctx as { currentTurn?: number })
    })

    const p = new BattleParticipantImpl({
      id: 'p_turn',
      name: '回合测试',
      level: 1,
      team: ParticipantSide.ALLY,
      enabled: true,
      skills: { small: [], passive: [], ultimate: [] },
      attributeValues: { currentEnergy: 0, maxEnergy: 200 },
    })
    p.setTurnProvider(() => 7)
    p.gainEnergy(10)

    expect(received).toHaveLength(1)
    expect(received[0]!.currentTurn).toBe(7)
  })

  it('未注入 provider 时回退 0（测试/非战斗场景语义保持）', () => {
    const received: Array<{ currentTurn?: number }> = []
    BattleParticipantImpl.eventBus.on(BattleTriggerPhase.ENERGY_GAINED, (ctx: unknown) => {
      received.push(ctx as { currentTurn?: number })
    })

    const p = new BattleParticipantImpl({
      id: 'p_turn_fallback',
      name: '回退测试',
      level: 1,
      team: ParticipantSide.ALLY,
      enabled: true,
      skills: { small: [], passive: [], ultimate: [] },
      attributeValues: { currentEnergy: 0, maxEnergy: 200 },
    })
    p.gainEnergy(10)

    expect(received).toHaveLength(1)
    expect(received[0]!.currentTurn).toBe(0)
  })
})

describe('TurnManager 行动顺序确定性', () => {
  const tm = new TurnManager({} as BuffSystemType)

  function makeParticipant(id: string, speed: number): BattleEntity {
    return new BattleParticipantImpl({
      id,
      name: id,
      level: 1,
      team: ParticipantSide.ALLY,
      enabled: true,
      seatIndex: 0,
      skills: { small: [], passive: [], ultimate: [] },
      attributeValues: { currentHealth: 100, maxHealth: 100, speed },
    })
  }

  it('同速度参与者：同 seed 两次排序结果一致（比较器自洽）', () => {
    const group = [makeParticipant('a', 50), makeParticipant('b', 50), makeParticipant('c', 50)]
    const first = tm.createTurnOrder(group, new SeededRandom('fixed-seed'))
    const second = tm.createTurnOrder(group, new SeededRandom('fixed-seed'))
    expect(first).toEqual(second)
    // 输出是输入的全排列，不丢人
    expect([...first].sort()).toEqual(['a', 'b', 'c'])
  })

  it('不同速度参与者仍按速度降序，随机键不干扰', () => {
    const group = [makeParticipant('slow', 5), makeParticipant('fast', 99), makeParticipant('mid', 50)]
    const order = tm.createTurnOrder(group, new SeededRandom('s'))
    expect(order).toEqual(['fast', 'mid', 'slow'])
  })
})

// BattleProjection 依赖 participantMapper 的实体映射，flush 语义用 mock 隔离
vi.mock('@/application/projection/participantMapper', () => ({
  participantToSnapshot: vi.fn(),
}))

const mockedMapper = vi.mocked(participantToSnapshot)

function makeSnapshotEntity(id: string) {
  return {
    id,
    statsVersion: 1, // 恒定不变：模拟纯 tag buff / 冷却等不 bump 版本的结构变化
    setDirtyCallback: vi.fn(),
  } as unknown as BattleEntity & { statsVersion: number }
}

function makeStore() {
  const participants = new Map<string, UIParticipantSnapshot>()
  return participants
}

/** markDirty 走 queueMicrotask 批处理，测试中用微任务边界等待 flush 落盘 */
const nextMicrotask = (): Promise<void> => new Promise<void>((r) => queueMicrotask(r))

describe('BattleProjection flush 语义', () => {
  beforeEach(() => {
    mockedMapper.mockReset()
  })

  it('statsVersion 未变但被标脏 → 仍投影（buff/冷却类结构变化不被版本比对拦截）', async () => {
    const participants = makeStore()
    const projection = new BattleProjection(
      { participants },
      {} as IBuffSystemForProjection,
    )
    const entity = makeSnapshotEntity('e1')
    projection.register(entity)
    mockedMapper.mockReturnValue({ id: 'e1' } as UIParticipantSnapshot)

    entity.setDirtyCallback.mock.calls[0]?.[0]() // markDirty #1
    await nextMicrotask()
    expect(mockedMapper).toHaveBeenCalledTimes(1)

    // 版本号没变，再次标脏（模拟控制类 buff 上身）→ 必须再次投影
    entity.setDirtyCallback.mock.calls[0]?.[0]() // markDirty #2
    await nextMicrotask()
    expect(mockedMapper).toHaveBeenCalledTimes(2)
    expect(participants.has('e1')).toBe(true)
  })

  it('快照构建抛错 → 不吞掉本次脏标记，下次 flush 重试成功', async () => {
    const participants = makeStore()
    const projection = new BattleProjection(
      { participants },
      {} as IBuffSystemForProjection,
    )
    const entity = makeSnapshotEntity('e2')
    projection.register(entity)
    mockedMapper.mockImplementationOnce(() => {
      throw new Error('mapper boom')
    })

    entity.setDirtyCallback.mock.calls[0]?.[0]() // 第一次 flush 抛错
    await nextMicrotask()
    expect(participants.has('e2')).toBe(false)

    mockedMapper.mockReturnValue({ id: 'e2' } as UIParticipantSnapshot)
    entity.setDirtyCallback.mock.calls[0]?.[0]() // 再次标脏 → 成功写入
    await nextMicrotask()
    expect(participants.has('e2')).toBe(true)
  })
})

describe('SeededRandom（mulberry32）', () => {
  it('同 seed 序列确定可复现', () => {
    const a = new SeededRandom('replay-seed')
    const b = new SeededRandom('replay-seed')
    const seqA = Array.from({ length: 32 }, () => a.next())
    const seqB = Array.from({ length: 32 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('restoreSeed 回退后序列重放一致（战斗单步回退契约）', () => {
    const rng = new SeededRandom('undo-seed')
    rng.next()
    rng.next()
    const saved = rng.getSeed()
    const afterSave = [rng.next(), rng.next(), rng.next()]

    rng.restoreSeed(saved)
    const replayed = [rng.next(), rng.next(), rng.next()]
    expect(replayed).toEqual(afterSave)
  })

  it('分布质量：万级样本各十分位频率接近期望（旧 LCG 实测 16% vs 期望 25% 的偏差不复现）', () => {
    const rng = new SeededRandom('distribution-check')
    const N = 20000
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < N; i++) {
      buckets[Math.min(9, Math.floor(rng.next() * 10))]++
    }
    for (const count of buckets) {
      const freq = count / N
      expect(freq).toBeGreaterThan(0.08) // 期望 0.1，±20% 容差
      expect(freq).toBeLessThan(0.12)
    }
  })

  it('nextBoolean 概率判定在大样本下收敛到期望', () => {
    const rng = new SeededRandom('boolean-check')
    let hits = 0
    const N = 20000
    for (let i = 0; i < N; i++) if (rng.nextBoolean(0.3)) hits++
    const freq = hits / N
    expect(freq).toBeGreaterThan(0.24) // 期望 0.3，±20% 容差
    expect(freq).toBeLessThan(0.36)
  })
})
