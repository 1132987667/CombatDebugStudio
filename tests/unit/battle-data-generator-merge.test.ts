/**
 * BattleDataGenerator.mergeRecordings 清洗验证
 *
 * 背景：'record' 格式下载录制 JSON 时，内存录制的 initialState.participants 与
 *       BATTLE_START 事件 data.participants 是活的 BattleEntity 实例（携带
 *       buffQuery→BuffSystem、stats、skillManager 等运行时对象）。若直接 stringify，
 *       会把这些运行时状态连同整个 BuffSystem 快照混入下载文件（体积膨胀、契约不符）。
 *       此处验证白名单清洗后：不抛错、仅含契约字段、运行时字段不泄漏。
 *
 * 运行: npx vitest run tests/unit/battle-data-generator-merge.test.ts
 */
import { describe, it, expect } from 'vitest'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { BattleEventType, ParticipantSide } from '@/domain/battle/type/types'
import { BattleDataGenerator } from '@/application/service/BattleDataGenerator'
import type { RecordedBattle } from '@/domain/battle/service/BattleRecorder'

/** 模拟 BuffSystem 的数据字段（真实 BuffSystem 持有这些 Map/logger/eventBus） */
function makeMockBuffSystem() {
  return {
    buffInstances: new Map<string, unknown>([
      [
        'buff_1',
        {
          id: 'buff_1',
          characterId: 'p1',
          buffId: 'test_buff',
          context: { characterId: 'p1', variables: new Map([['stack', 2]]) },
        },
      ],
    ]),
    modifierStacks: new Map([['p1', { modifiers: new Map() }]]),
    shieldValues: new Map([['p1', 100]]),
    logger: { addBattleLog: () => {}, addSystemLog: () => {} },
    eventBus: {},
  }
}

function makeParticipant(): BattleParticipantImpl {
  const p = new BattleParticipantImpl({
    id: 'p1',
    name: '测试角色',
    level: 1,
    team: ParticipantSide.ALLY,
    enabled: true,
    seatIndex: 0,
    skills: { small: [], passive: [], ultimate: [] },
    attributeValues: { attack: 100, defense: 50, speed: 10 },
  })
  p.setBuffQuery(makeMockBuffSystem() as never)
  return p
}

function makeRecording(participant: BattleParticipantImpl): RecordedBattle {
  return {
    battleId: 'b_1',
    name: '数据生成 第1场（1v1）',
    replayId: 'r_1',
    version: '2.0.0',
    randomSeed: 'seed_1',
    startTime: 1,
    endTime: 2,
    winner: ParticipantSide.ALLY,
    events: [
      {
        eventId: 'e_bs',
        type: BattleEventType.BATTLE_START,
        timestamp: 1,
        turn: 0,
        roundNumber: 0,
        data: { participants: [participant], category: 'status', severity: 'high' },
      },
      {
        eventId: 'e_act',
        type: BattleEventType.ACTION,
        timestamp: 2,
        turn: 1,
        roundNumber: 0,
        data: { action: { id: 'a1', type: 'attack', sourceId: 'p1', targetId: 'p2' } },
      },
    ],
    initialState: { participants: [participant] },
    rounds: [],
    combatRecords: [],
    result: { winner: ParticipantSide.ALLY, duration: 1, totalRounds: 1, totalEvents: 2, stats: { totalDamage: 10, totalHealing: 0, criticalHits: 0, dodges: 0, buffsApplied: 0, buffsRemoved: 0 } },
    checksum: 'abc',
  }
}

const CONTRACT_FIELDS = ['id', 'name', 'team', 'maxHealth', 'currentHealth', 'maxEnergy', 'currentEnergy']

describe('BattleDataGenerator.mergeRecordings', () => {
  it('清洗后序列化不抛错，且仅含契约字段、不泄漏运行时对象', () => {
    const generator = Object.create(BattleDataGenerator.prototype) as BattleDataGenerator
    const json = generator.mergeRecordings([makeRecording(makeParticipant())])
    expect(json).not.toBeNull()

    const parsed = JSON.parse(json!)
    expect(parsed.count).toBe(1)
    expect(parsed.battles).toHaveLength(1)

    // 顶层契约字段保留
    const battle = parsed.battles[0]
    for (const key of ['battleId', 'name', 'replayId', 'version', 'randomSeed', 'startTime', 'winner', 'checksum']) {
      expect(battle[key], `缺失顶层字段 ${key}`).toBeDefined()
    }

    // 参与者快照仅 7 个契约字段
    const snap = battle.initialState.participants[0]
    expect(Object.keys(snap).sort()).toEqual([...CONTRACT_FIELDS].sort())

    // BATTLE_START 事件的 participants 同样被清洗
    const startEvent = battle.events.find((e: { type: string }) => e.type === BattleEventType.BATTLE_START)
    expect(Object.keys(startEvent.data.participants[0]).sort()).toEqual([...CONTRACT_FIELDS].sort())

    // 非 BATTLE_START 事件原样透传（action 纯数据不动）
    const actEvent = battle.events.find((e: { type: string }) => e.type === BattleEventType.ACTION)
    expect(actEvent.data.action.sourceId).toBe('p1')
  })

  it('运行时字段不泄漏进下载文件', () => {
    const generator = Object.create(BattleDataGenerator.prototype) as BattleDataGenerator
    const json = generator.mergeRecordings([makeRecording(makeParticipant())])
    const text = JSON.stringify(JSON.parse(json!))
    for (const forbidden of ['buffInstances', 'modifierStacks', 'shieldValues', 'buffQuery', 'modifierProvider', 'skillManager', '_buffSystem', 'variables']) {
      expect(text, `不应包含运行时字段 ${forbidden}`).not.toContain(forbidden)
    }
  })
})
