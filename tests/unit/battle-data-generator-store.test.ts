/**
 * BattleDataGenerator.generate 下载决策回归测试
 *
 * 背景：调试面板「存入昊天镜」走 generate({ format: 'record', download: false })，
 *       旧实现 `if (record && download!==false) ... else ...` 会让 record+download=false
 *       落入 else 分支误下载 txt 文件（"存入昊天镜"仍触发下载）。
 *       本测试锁定下载决策：
 *         - format='record' + download=false → 只入库不下载
 *         - format='record'（缺省 download）→ 下载合并 JSON
 *         - format='txt' → 下载 txt
 *
 * 运行: npx vitest run tests/unit/battle-data-generator-store.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BattleDataGenerator } from '@/application/service/BattleDataGenerator'
import { BattleStatus, ParticipantSide } from '@/domain/battle/type/types'
import { RoundNarrativeRenderer } from '@/domain/battle/logs/renderers/RoundNarrativeRenderer'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

// ── 模块 mock：生成器依赖 LoggerProvider.logger 收集日志、GameDataProcessor 提供敌人/参与者 ──
// NOTE: vi.hoisted 内无法引用 import 的工厂（hoisting 时机早于模块求值），故内联定义完整 mock。
const { mockLogMgr } = vi.hoisted(() => ({
  mockLogMgr: {
    addDebugLog: vi.fn(),
    addSystemLog: vi.fn(),
    addBattleLog: vi.fn(),
    addActionLog: vi.fn(),
    addItemLog: vi.fn(),
    clearLogs: vi.fn(),
    getSystemLogs: vi.fn(() => []),
    getDebugLogs: vi.fn(() => []),
    getAllLogs: vi.fn(() => []),
    getFilteredLogs: vi.fn(() => []),
    getFilters: vi.fn(() => ({ battle: true, system: true, item: true, action: true, debug: true })),
    updateFilters: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    setAutoCleanup: vi.fn(),
    setMuted: vi.fn(),
    syncBattleLogs: vi.fn(),
    beginBufferSubLogs: vi.fn(),
    flushBufferedSubLogs: vi.fn(),
    exportLogs: vi.fn(() => []),
    importLogs: vi.fn(),
  },
}))

vi.mock('@/shared/utils/GameDataProcessor', () => ({
  GameDataProcessor: {
    getEnemiesData: () => [{ id: 'e1', name: '敌人1' }],
    enemyToParticipant: (enemy: { id: string }, _side: unknown, seatIndex: number) => ({
      id: `p_${enemy.id}_${seatIndex}`,
      name: enemy.id,
    }),
  },
}))

/** 最小可运行战斗系统 mock：processTurn 一次后战斗即结束，winner 固定为友方 */
function makeBattleSystem() {
  let active = true
  let battleId = 'b_1'
  const state: { battleData: unknown } = { battleData: null }
  const battleSystem = {
    getHeadless: vi.fn(() => false),
    setHeadless: vi.fn(),
    regenerateBattleId: vi.fn(() => {
      battleId = `b_${Math.random()}`
    }),
    initialize: vi.fn(() => {
      active = true
      const data = { battleId, winner: ParticipantSide.ALLY, currentTurn: 1, participants: new Map() }
      state.battleData = data
      return data
    }),
    setBattleState: vi.fn(),
    getBattleStatus: vi.fn(() => (active ? BattleStatus.ACTIVE : BattleStatus.ENDED)),
    processTurn: vi.fn(async () => {
      active = false
    }),
    getBattleData: vi.fn(() => state.battleData),
    getBattleRecording: vi.fn((id: string) => ({
      battleId: id,
      name: 'mock',
      replayId: `r_${id}`,
      version: '2.0.0',
      randomSeed: 'seed',
      startTime: 1,
      endTime: 2,
      winner: ParticipantSide.ALLY,
      checksum: 'c',
      saveKey: id,
      result: { winner: ParticipantSide.ALLY, duration: 1, totalRounds: 1, totalEvents: 2, stats: { totalDamage: 0, totalHealing: 0, criticalHits: 0, dodges: 0, buffsApplied: 0, buffsRemoved: 0 } },
      rounds: [],
      combatRecords: [],
      traceEvents: [],
      events: [],
      initialState: { participants: [] },
    })),
    getBuffSystem: vi.fn(() => ({ clearCharacterState: vi.fn() })),
    resetBattle: vi.fn(() => {
      active = false
    }),
    saveBattleRecording: vi.fn(async () => 'save_key'),
  }
  return { battleSystem }
}

async function runGenerate(options: Parameters<BattleDataGenerator['generate']>[0]) {
  const { battleSystem } = makeBattleSystem()
  const generator = Object.create(BattleDataGenerator.prototype) as BattleDataGenerator
  ;(generator as unknown as { battleSystem: unknown }).battleSystem = battleSystem
  ;(generator as unknown as { renderer: unknown }).renderer = new RoundNarrativeRenderer()
  const downloadSpy = vi
    .spyOn(generator as unknown as { downloadFile: (...a: unknown[]) => void }, 'downloadFile')
    .mockImplementation(() => {})
  await generator.generate({ totalBattles: 1, ...options })
  return { battleSystem, downloadSpy }
}

describe('BattleDataGenerator.generate 下载决策', () => {
  beforeEach(() => {
    LoggerProvider.logger = mockLogMgr
    mockLogMgr.getAllLogs.mockReturnValue([])
    vi.clearAllMocks()
  })

  it('存入昊天镜路径（format=record, download=false）：只入库不下载', async () => {
    const { battleSystem, downloadSpy } = await runGenerate({ format: 'record', download: false, record: true })

    expect(battleSystem.saveBattleRecording).toHaveBeenCalled()
    expect(downloadSpy).not.toHaveBeenCalled()
  })

  it('record 格式缺省 download：下载合并 JSON', async () => {
    const { downloadSpy } = await runGenerate({ format: 'record' })

    expect(downloadSpy).toHaveBeenCalledTimes(1)
    expect(downloadSpy.mock.calls[0][1]).toContain('battle-recordings')
  })

  it('txt 格式：下载 txt', async () => {
    const { downloadSpy } = await runGenerate({ format: 'txt' })

    expect(downloadSpy).toHaveBeenCalledTimes(1)
    expect(downloadSpy.mock.calls[0][1]).toContain('battle-data')
  })

  it('json 格式单场：下载单个统一存档（昊天镜可直接导入）', async () => {
    const { downloadSpy } = await runGenerate({ format: 'json' })

    expect(downloadSpy).toHaveBeenCalledTimes(1)
    expect(downloadSpy.mock.calls[0][1]).toContain('battle-archive-')
    const parsed = JSON.parse(downloadSpy.mock.calls[0][0] as string)
    expect(Array.isArray(parsed.events)).toBe(true)
  })

  it('json 格式多场：下载统一存档数组', async () => {
    const { downloadSpy } = await runGenerate({ format: 'json', totalBattles: 2 })

    expect(downloadSpy).toHaveBeenCalledTimes(1)
    expect(downloadSpy.mock.calls[0][1]).toContain('battle-archives-')
    const parsed = JSON.parse(downloadSpy.mock.calls[0][0] as string)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
  })
})
