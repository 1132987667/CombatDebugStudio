// @vitest-environment happy-dom
/**
 * debugActions-sim.test.ts — 一键实测「真实模拟」口径的聚合语义测试
 * 用 mock 的 runQuickBattle 注入固定胜负/拒绝序列，钉住报告分母口径：
 * 胜率分母 = 成功执行场数（被引擎拒绝的场不计入，也不算作败场）；真实无头对局的
 * 端到端覆盖在 debug-actions.test.ts。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ParticipantSide } from '@/domain/battle/type/types'

// ── mock runQuickBattle：注入确定性结果序列（不触引擎/DI 容器） ──
vi.mock('@/application/service/QuickBattleSim', () => ({
  runQuickBattle: vi.fn(),
}))

import { runQuickBattle } from '@/application/service/QuickBattleSim'
const mockedRun = vi.mocked(runQuickBattle)

import { createDebugCategories, type DebugCategory } from '@/presentation/modules/yanjie/xiyou/debugActions'
import type { PlayerStoreDebugEnv } from '@/presentation/modules/yanjie/xiyou/debugEnv'
import { packItems, quests, scenes, schools, shopGoods, skillPoints } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import { saveManager } from '@/presentation/modules/yanjie/xiyou/save-bridge'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { usePackStore } from '@/presentation/stores/packStore'

// ── 内存持久化 mock（packStore 依赖 persistentStorage，与 debug-actions.test.ts 同款） ──
const { __mem } = vi.hoisted(() => {
  const mem = new Map<string, Map<string, unknown>>()
  return {
    __mem: mem,
  }
})

vi.mock('@/infrastructure/adapters/storage', () => ({
  persistentStorage: {
    async get(store: string, key: string): Promise<unknown> {
      return __mem.get(store)?.get(key) ?? null
    },
    async set(store: string, key: string, value: unknown): Promise<boolean> {
      if (!__mem.has(store)) mem.set(store, new Map())
      __mem.get(store)!.set(key, value)
      return true
    },
    async remove(): Promise<boolean> {
      return true
    },
    async keys(): Promise<string[]> {
      return []
    },
    async clear(): Promise<boolean> {
      return true
    },
  },
}))

beforeEach(() => {
  setActivePinia(createPinia())
  __mem.clear()
  vi.restoreAllMocks()
  mockedRun.mockReset()
})

/** 胜/负场结果（我方存活数可指定） */
function simResult(winner: ParticipantSide | null, rounds: number, survivors: number) {
  return {
    ok: true,
    winner,
    rounds,
    summary: { teams: [{ side: ParticipantSide.ALLY, survivors }] } as unknown,
    allyNames: ['主角'],
    enemyNames: ['敌'],
  }
}

function makeEnv(): PlayerStoreDebugEnv {
  return {
    battle: {} as PlayerStoreDebugEnv['battle'],
    player: usePlayerStore(),
    pack: usePackStore(),
    save: saveManager,
    diag: {
      healthCheck: async () => ({ scannedRules: 0, checkedEntities: 0, issues: [] }),
      dataVersion: async () => 0,
      reloadXiyou: async () => false,
    },
    scenes,
    quests,
    schools,
    skillPoints,
    items: packItems,
    shopGoods,
    equipmentCatalog: [],
    forgeRecipes: [],
    alchemyRecipes: [],
    toast: vi.fn(),
  }
}

describe('一键实测 · 真实模拟聚合语义（mock 对局序列）', () => {
  let sceneUnlocked: boolean[] = []
  beforeEach(() => {
    sceneUnlocked = scenes.map((s) => s.unlocked)
  })
  afterEach(() => {
    scenes.forEach((s, i) => (s.unlocked = sceneUnlocked[i]!))
  })

  it('被拒场次不计入胜率分母（2 胜 1 负 1 拒 → 67% 而非 50%）', async () => {
    mockedRun
      .mockResolvedValueOnce(simResult(ParticipantSide.ALLY, 3, 4))
      .mockResolvedValueOnce(simResult(ParticipantSide.ENEMY, 5, 1))
      .mockResolvedValueOnce({ ok: false, reason: '对局进行中', winner: null, rounds: 0, allyNames: [], enemyNames: [] })
      .mockResolvedValueOnce(simResult(ParticipantSide.ALLY, 4, 3))
    scenes[0]!.unlocked = true
    const env = makeEnv()
    const battleCat = createDebugCategories(env).find((c) => c.id === 'battle') as DebugCategory
    const sweep = battleCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_sweep')!
    const r = await sweep.execute({ mode: 'sim', count: '4', stats: 'none', gear: 'no', mates: 'no', scope: 'unlocked' })
    expect(r.success).toBe(true)
    expect(r.message).toContain('未启动 1 场')
    const payload = r.payload as {
      scenes: { battles: number; wins: number; winRate: number | null; avgRounds: number | null; avgSurvivors: number | null }[]
      total: { battles: number; executed: number; wins: number; winRate: number | null; failures: { reason: string; count: number }[] }
    }
    // 场景行：分母 = 成功执行 3 场（而非发起 4 场）
    expect(payload.scenes[0]!.battles).toBe(4)
    expect(payload.scenes[0]!.wins).toBe(2)
    expect(payload.scenes[0]!.winRate).toBe(67)
    // 平均回合/存活只计有战报的已决出场：(3+5+4)/3 = 4；(4+1+3)/3 ≈ 2.7
    expect(payload.scenes[0]!.avgRounds).toBe(4)
    expect(payload.scenes[0]!.avgSurvivors).toBe(2.7)
    // 总计：拒绝原因入 failures
    expect(payload.total.battles).toBe(4)
    expect(payload.total.executed).toBe(3)
    expect(payload.total.winRate).toBe(67)
    expect(payload.total.failures).toEqual([{ reason: '对局进行中', count: 1 }])
  })

  it('全部场次被拒时返回失败并列出原因', async () => {
    mockedRun.mockResolvedValue({ ok: false, reason: '对局进行中', winner: null, rounds: 0, allyNames: [], enemyNames: [] })
    scenes[0]!.unlocked = true
    const env = makeEnv()
    const battleCat = createDebugCategories(env).find((c) => c.id === 'battle') as DebugCategory
    const sweep = battleCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_sweep')!
    const r = await sweep.execute({ mode: 'sim', count: '2', stats: 'none', gear: 'no', mates: 'no', scope: 'unlocked' })
    expect(r.success).toBe(false)
    expect(r.message).toContain('模拟未能启动')
    expect(r.message).toContain('对局进行中')
  })

  it('全拒 fail 分支：prep 已生效的报告随 payload 返回且状态落盘（防状态丢失感知）', async () => {
    mockedRun.mockResolvedValue({ ok: false, reason: '对局进行中', winner: null, rounds: 0, allyNames: [], enemyNames: [] })
    scenes[0]!.unlocked = true
    const env = makeEnv()
    env.player.statPoints.available = 5
    const atkBefore = env.player.statPoints.atk
    const saveAutoSaveSpy = vi.spyOn(env.save, 'autoSave').mockResolvedValue(true)
    const battleCat = createDebugCategories(env).find((c) => c.id === 'battle') as DebugCategory
    const sweep = battleCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_sweep')!
    const r = await sweep.execute({ mode: 'sim', count: '1', stats: 'atk', gear: 'no', mates: 'no', scope: 'unlocked' })
    expect(r.success).toBe(false)
    // prep 明细随 fail payload 返回（点数已消耗，不能静默丢失）
    const payload = r.payload as { prep: { stats?: { allocated: Record<string, number> } }; failures: { reason: string; count: number }[] }
    expect(payload.prep.stats?.allocated.atk).toBe(5)
    expect(payload.failures).toEqual([{ reason: '对局进行中', count: 1 }])
    expect(env.player.statPoints.atk).toBe(atkBefore + 5)
    expect(saveAutoSaveSpy).toHaveBeenCalled()
  })

  it('场景敌表为空时返回失败（而非「成功 0 战」）', async () => {
    scenes[0]!.unlocked = true
    const enemiesBackup = scenes[0]!.enemies
    const yaotuBackup = scenes[0]!.yaotu
    ;(scenes[0] as unknown as { enemies: unknown[] }).enemies = []
    delete (scenes[0] as unknown as { yaotu?: unknown }).yaotu
    try {
      const env = makeEnv()
      const battleCat = createDebugCategories(env).find((c) => c.id === 'battle') as DebugCategory
      const sweep = battleCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_sweep')!
      const r = await sweep.execute({ mode: 'sim', count: '1', stats: 'none', gear: 'no', mates: 'no', scope: 'unlocked' })
      expect(r.success).toBe(false)
      expect(r.message).toContain('没有可模拟的敌方编成')
    } finally {
      ;(scenes[0] as unknown as { enemies: unknown[] }).enemies = enemiesBackup
      ;(scenes[0] as unknown as { yaotu?: unknown }).yaotu = yaotuBackup
    }
  })
})
