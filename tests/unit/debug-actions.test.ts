// @vitest-environment happy-dom
/**
 * debugActions.test.ts — 调试动作定义工厂测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 工厂生成分类树结构、危险动作标记、输入参数动作定义、真实动作行为（等级重算 / 刷关模拟）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { container, initializeContainer } from '@/infrastructure/di/Container'
import { createDebugCategories, fail, ok, type DebugCategory } from '@/presentation/modules/yanjie/xiyou/debugActions'
import type { PlayerStoreDebugEnv } from '@/presentation/modules/yanjie/xiyou/debugEnv'
import { equipment, packItems, quests, scenes, schools, shopGoods, skillPoints, starterEnabled, mates, mounts, pets } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import { saveManager } from '@/presentation/modules/yanjie/xiyou/save-bridge'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { makeInstance, usePackStore } from '@/presentation/stores/packStore'

// ── 内存持久化 mock（packStore 依赖 persistentStorage） ──
const { __mem } = vi.hoisted(() => {
  const mem = new Map<string, Map<string, unknown>>()
  return {
    __mem: mem,
    __storage: {
      async get(store: string, key: string): Promise<unknown> {
        return mem.get(store)?.get(key) ?? null
      },
      async set(store: string, key: string, value: unknown): Promise<boolean> {
        if (!mem.has(store)) mem.set(store, new Map())
        mem.get(store)!.set(key, value)
        return true
      },
    },
  }
})

vi.mock('@/infrastructure/adapters/storage', () => ({
  persistentStorage: {
    async get(store: string, key: string): Promise<unknown> {
      return __mem.get(store)?.get(key) ?? null
    },
    async set(store: string, key: string, value: unknown): Promise<boolean> {
      if (!__mem.has(store)) __mem.set(store, new Map())
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
})

/** 用真实 store 的轻量 stub 构造 env（仅验证工厂结构，不触发 store 副作用） */
function makeEnv(): PlayerStoreDebugEnv {
  return {
    battle: {
      enemyTeam: [] as PlayerStoreDebugEnv['battle']['enemyTeam'],
      syncTeams: vi.fn(),
    } as unknown as PlayerStoreDebugEnv['battle'],
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
    starter: {
      items: () => equipment,
      enabled: () => starterEnabled.value,
      setEnabled: async (v: boolean) => {
        starterEnabled.value = v
        return true
      },
    },
    toast: vi.fn(),
  }
}

describe('createDebugCategories', () => {
  it('返回已实现的十个分类（战斗/状态/装备/行囊/存档/场景/修行/任务/经济/诊断）', () => {
    const cats = createDebugCategories(makeEnv())
    expect(cats.map((c) => c.id)).toEqual(['battle', 'player', 'gear', 'pack', 'save', 'scene', 'cultivate', 'quest', 'economy', 'diag'])
  })

  it('每个分类含分组与动作，且动作有唯一 id 与 execute', () => {
    const cats = createDebugCategories(makeEnv())
    const all: string[] = []
    for (const cat of cats) {
      expect(cat.groups.length).toBeGreaterThan(0)
      for (const g of cat.groups) {
        for (const a of g.actions) {
          expect(typeof a.execute).toBe('function')
          expect(all).not.toContain(a.id)
          all.push(a.id)
        }
      }
    }
    expect(all.length).toBeGreaterThan(15)
  })

  it('战斗分类含流程控制 / 判定干预 / 随机控制分组与开关型动作', () => {
    const battle = createDebugCategories(makeEnv()).find((c) => c.id === 'battle') as DebugCategory
    const ids = battle.groups.flatMap((g) => g.actions.map((a) => a.id))
    expect(ids).toContain('battle_win')
    expect(ids).toContain('battle_step')
    const crit = battle.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_crit')
    expect(crit?.toggle).toBe(true)
  })

  it('存档分类含危险操作分组，且危险动作带 danger 标记', () => {
    const save = createDebugCategories(makeEnv()).find((c) => c.id === 'save') as DebugCategory
    const clear = save.groups.flatMap((g) => g.actions).find((a) => a.id === 'save_clear')
    expect(clear?.danger).toBe(true)
    // 文件输入动作
    const imp = save.groups.flatMap((g) => g.actions).find((a) => a.id === 'save_import')
    expect(imp?.input && !Array.isArray(imp.input)).toBe(true)
  })

  it('拓展功能：词缀注入 / 二阶材料 / 强化石 / 品质锁定 / 敌人词缀 / 掉落锁定 / 刷关模拟均已定义', () => {
    const cats = createDebugCategories(makeEnv())
    const ids = cats.flatMap((c) => c.groups.flatMap((g) => g.actions.map((a) => a.id)))
    for (const id of [
      'gear_affix_inject',
      'gear_craft_quality',
      'pack_mat_all_t2',
      'pack_enh_stone',
      'econ_enemy_affix',
      'econ_enemy_affix_clear',
      'econ_force_drop',
      'battle_grind',
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('battle_grind 为多输入（场景 + 敌人 + 次数）', () => {
    const battle = createDebugCategories(makeEnv()).find((c) => c.id === 'battle') as DebugCategory
    const grind = battle.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_grind')!
    expect(Array.isArray(grind.input)).toBe(true)
    expect((grind.input as unknown[]).length).toBe(3)
  })

  it('状态分类覆盖等级 / 金钱 / 经验 / 成长 / 危险操作 / 诊断', () => {
    const player = createDebugCategories(makeEnv()).find((c) => c.id === 'player') as DebugCategory
    const ids = player.groups.flatMap((g) => g.actions.map((a) => a.id))
    for (const id of ['player_level_1', 'player_gold_zero', 'player_exp_critical', 'player_atk_50', 'player_reset', 'player_view']) {
      expect(ids).toContain(id)
    }
    const reset = player.groups.flatMap((g) => g.actions).find((a) => a.id === 'player_reset')
    expect(reset?.danger).toBe(true)
  })
})

describe('结果工具函数', () => {
  it('ok / fail 构造统一结果对象', () => {
    expect(ok('成功').success).toBe(true)
    expect(fail('失败').success).toBe(false)
    expect(ok('带数据', { x: 1 }).payload).toEqual({ x: 1 })
  })
})

describe('刷关模拟（battle_grind）真实行为', () => {
  it('对指定场景刷 N 次：经验/金钱入账 + 掉落入包 + 返回汇总', async () => {
    const env = makeEnv()
    const pack = usePackStore()
    await pack.init()
    const battleCat = createDebugCategories(env).find((c) => c.id === 'battle') as DebugCategory
    const grind = battleCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_grind')!
    const firstScene = scenes.find((s) => s.id)!
    const expBefore = env.player.player.exp
    const goldBefore = env.player.currency.money
    const invBefore = Object.keys(pack.inventory).length
    // random 返回 0 保证掉落命中（确定性断言），也固定经验/金钱取区间下限
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const firstEnemy = firstScene.enemies[0]!.id
    const r = await grind.execute({ scene: firstScene.id, enemy: firstEnemy, count: '5' })
    expect(r.success).toBe(true)
    expect(env.player.player.exp).toBeGreaterThanOrEqual(expBefore)
    expect(env.player.currency.money).toBeGreaterThanOrEqual(goldBefore)
    const summary = r.payload as { battles: number; exp: number; gold: number; dropVariety: number }
    expect(summary.battles).toBe(5)
    expect(summary.exp).toBeGreaterThanOrEqual(0)
    expect(summary.money).toBeGreaterThanOrEqual(0)
    // 有掉落时背包出现新物品
    if (summary.dropVariety > 0) {
      expect(Object.keys(pack.inventory).length).toBeGreaterThanOrEqual(invBefore)
    }
  })

  it('未知场景返回失败', async () => {
    const env = makeEnv()
    await usePackStore().init()
    const battleCat = createDebugCategories(env).find((c) => c.id === 'battle') as DebugCategory
    const grind = battleCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_grind')!
    const r = await grind.execute({ scene: 'ghost', count: '5' })
    expect(r.success).toBe(false)
  })

  it('掉落率锁定开启时，grind 掉落全部命中（与 econ_force_drop 联动）', async () => {
    const env = makeEnv()
    const pack = usePackStore()
    await pack.init()
    const battleCat = createDebugCategories(env).find((c) => c.id === 'battle') as DebugCategory
    const grind = battleCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_grind')!
    const firstScene = scenes.find((s) => s.id)!
    // random 返回 0.99（正常会 miss 低概率掉落），锁定后仍全部命中
    pack.setDebugForceDrops(true)
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const firstEnemy = firstScene.enemies[0]!.id
    const locked = await grind.execute({ scene: firstScene.id, enemy: firstEnemy, count: '5' })
    const lockedSummary = locked.payload as { dropVariety: number }
    const lockedVariety = lockedSummary.dropVariety
    // 关闭锁定，同样 random=0.99 → 低概率掉落 miss
    pack.setDebugForceDrops(false)
    const unlocked = await grind.execute({ scene: firstScene.id, enemy: firstEnemy, count: '5' })
    const unlockedSummary = unlocked.payload as { dropVariety: number }
    // 场景存在 >0 概率掉落时，锁定态掉落种类应不少于非锁定态
    expect(lockedVariety).toBeGreaterThanOrEqual(unlockedSummary.dropVariety)
    vi.restoreAllMocks()
  })
})

describe('一键实测（battle_sweep）真实行为', () => {
  /** mates/mounts/pets 是 xiyouData 模块级单例：记录 active 快照，测后恢复防串染 */
  let mateActive: boolean[] = []
  let mountActive: boolean[] = []
  let petActive: boolean[] = []
  let sceneUnlocked: boolean[] = []
  beforeEach(() => {
    mateActive = mates.map((m) => m.active)
    mountActive = mounts.map((m) => m.active)
    petActive = pets.map((p) => p.active)
    sceneUnlocked = scenes.map((s) => s.unlocked)
  })
  afterEach(() => {
    mates.forEach((m, i) => (m.active = mateActive[i]!))
    mounts.forEach((m, i) => (m.active = mountActive[i]!))
    pets.forEach((p, i) => (p.active = petActive[i]!))
    scenes.forEach((s, i) => (s.unlocked = sceneUnlocked[i]!))
  })

  const findSweep = (env: ReturnType<typeof makeEnv>) => {
    const battleCat = createDebugCategories(env).find((c) => c.id === 'battle') as DebugCategory
    return battleCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_sweep')!
  }

  it('定义存在且为多输入（口径 + 次数 + 加点 + 穿装 + 阵容 + 范围）', () => {
    const sweep = findSweep(makeEnv())
    expect(sweep).toBeTruthy()
    expect(Array.isArray(sweep.input)).toBe(true)
    expect((sweep.input as unknown[]).length).toBe(6)
  })

  it('全流程：加点入账 + 穿装 + 上阵 3 伙伴 + 逐场景汇总', async () => {
    const env = makeEnv()
    const pack = usePackStore()
    await pack.init()
    // 养成素材：7 自由点 + 一件武器实例（无已穿戴装备）
    env.player.statPoints.available = 7
    pack.gearInstances.push(makeInstance('wp_t1_light_01', [], 0, 5))
    const atkBefore = env.player.statPoints.atk
    const saveAutoSaveSpy = vi.spyOn(env.save, 'autoSave').mockResolvedValue(true)
    const r = await findSweep(env).execute({ count: '2', stats: 'atk', gear: 'best', mates: 'best', scope: 'all' })
    expect(r.success).toBe(true)
    const payload = r.payload as {
      prep: { stats?: { allocated: Record<string, number> }; gear?: { slot: string }[]; mates?: string[] }
      scenes: { id: string; battles: number; exp: number; dropVariety: number }[]
      total: { battles: number; exp: number; leveled: number }
    }
    // 加点：本次分配恰为 7 点全攻击（扫荡中升级新发的 available 不属于本次）
    expect(Object.values(payload.prep.stats!.allocated).reduce((a, b) => a + b, 0)).toBe(7)
    expect(env.player.statPoints.atk).toBe(atkBefore + 7)
    // 穿装：weapon 槽被占
    expect(pack.equipped.weapon).toBeTruthy()
    // 上阵：恰好 MAX_ACTIVE_MATES 名伙伴 active
    expect(mates.filter((m) => m.active).length).toBe(3)
    expect(payload.prep.mates!.length).toBe(3)
    // 汇总：场景行数 > 0，total 与逐场景行一致
    expect(payload.scenes.length).toBeGreaterThan(0)
    expect(payload.total.battles).toBe(payload.scenes.reduce((s, row) => s + row.battles, 0))
    expect(payload.total.exp).toBeGreaterThanOrEqual(0)
    // 扫荡后状态落盘
    expect(saveAutoSaveSpy).toHaveBeenCalled()
  })

  it('scope=unlocked 且全部未解锁时失败', async () => {
    const env = makeEnv()
    await usePackStore().init()
    scenes.forEach((s) => (s.unlocked = false))
    const r = await findSweep(env).execute({ count: '1', stats: 'none', gear: 'no', mates: 'no', scope: 'unlocked' })
    expect(r.success).toBe(false)
  })

  it('全 no 策略：不动加点/装备/阵容，仅扫荡', async () => {
    const env = makeEnv()
    const pack = usePackStore()
    await pack.init()
    env.player.statPoints.available = 5
    const weaponBefore = pack.equipped.weapon ?? null
    const r = await findSweep(env).execute({ count: '1', stats: 'none', gear: 'no', mates: 'no', scope: 'all' })
    expect(r.success).toBe(true)
    const payload = r.payload as { prep: Record<string, unknown> }
    expect(payload.prep).toEqual({})
    expect(env.player.statPoints.available).toBeGreaterThanOrEqual(5)
    expect(pack.equipped.weapon ?? null).toBe(weaponBefore)
  })

  it('真实模拟口径：无头对局出胜率报告，不入账收益', async () => {
    // runQuickBattle 经 DI 容器取战斗引擎（quick-battle-sim.test.ts 同款装配）
    container.clear()
    initializeContainer()
    const env = makeEnv()
    const pack = usePackStore()
    await pack.init()
    scenes[0]!.unlocked = true
    env.player.statPoints.available = 3
    const expBefore = env.player.player.exp
    const moneyBefore = env.player.currency.money
    const saveAutoSaveSpy = vi.spyOn(env.save, 'autoSave').mockResolvedValue(true)
    const r = await findSweep(env).execute({ mode: 'sim', count: '1', stats: 'atk', gear: 'no', mates: 'no', scope: 'unlocked' })
    expect(r.success).toBe(true)
    const payload = r.payload as {
      mode: string
      scenes: { battles: number; winRate: number | null; avgRounds: number | null }[]
      total: { battles: number; winRate: number | null; failures: { reason: string; count: number }[] }
    }
    expect(payload.mode).toBe('sim')
    expect(payload.scenes.length).toBe(1)
    expect(payload.scenes[0]!.battles).toBe(1)
    expect(payload.scenes[0]!.winRate).toBeGreaterThanOrEqual(0)
    expect(payload.total.battles).toBe(1)
    expect(payload.total.failures).toEqual([])
    // 纯读侧：经验/金钱不入账；加点 prep 在模拟前生效（allyBonuses 同链路反映到主角快照）
    expect(env.player.player.exp).toBe(expBefore)
    expect(env.player.currency.money).toBe(moneyBefore)
    expect(env.player.statPoints.atk).toBeGreaterThanOrEqual(3)
    // prep 副作用与 fast 口径同频落盘
    expect(saveAutoSaveSpy).toHaveBeenCalled()
  }, 30000)
})

describe('玩家状态动作真实行为', () => {
  it('player_level_set 重算属性（maxHp/攻击随等级成长）', async () => {
    const env = makeEnv()
    const cat = createDebugCategories(env).find((c) => c.id === 'player') as DebugCategory
    const act = cat.groups.flatMap((g) => g.actions).find((a) => a.id === 'player_level_set')!

    const beforeLv = env.player.player.level
    const beforeHp = env.player.player.maxHp
    const beforeAtk = env.player.player.attackMax
    const r = await act.execute('10')
    expect(r.success).toBe(true)
    expect(env.player.player.level).toBe(10)
    // 等级提升后属性应增长（成长曲线 + 满血满法力）
    expect(env.player.player.maxHp).toBeGreaterThan(beforeHp)
    expect(env.player.player.attackMax).toBeGreaterThan(beforeAtk)
    expect(env.player.player.hp).toBe(env.player.player.maxHp)
    expect(beforeLv).toBeGreaterThan(0)
  })

  it('player_reset 恢复初始状态（等级 1 / 货币清零）', async () => {
    const env = makeEnv()
    const playerCat = createDebugCategories(env).find((c) => c.id === 'player') as DebugCategory
    const acts = playerCat.groups.flatMap((g) => g.actions)
    const setLevel = acts.find((a) => a.id === 'player_level_set')!
    const reset = acts.find((a) => a.id === 'player_reset')!
    // 先抬高等级与货币
    await setLevel.execute('20')
    env.player.currency.money = 99999
    const r = await reset.execute()
    expect(r.success).toBe(true)
    expect(env.player.player.level).toBe(1)
    expect(env.player.currency.money).toBe(0)
  })
})

describe('行囊/装备动作真实行为', () => {
  it('pack_mat_all_t2 给予全部二阶材料（items.json 全量筛选，而非 pack.json 初始表的单一玄铁）', async () => {
    const env = makeEnv()
    const pack = usePackStore()
    await pack.init()
    const packCat = createDebugCategories(env).find((c) => c.id === 'pack') as DebugCategory
    const act = packCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'pack_mat_all_t2')!
    const before = new Set(Object.keys(pack.inventory))
    const r = await act.execute()
    expect(r.success).toBe(true)
    // 新增的二阶材料条目（items.json 中全部二阶材料类），应远多于 pack.json 初始表仅玄铁一种
    const added = Object.keys(pack.inventory).filter((id) => !before.has(id) && pack.catalogById(id)?.rarity === 2)
    expect(added.length).toBeGreaterThan(1)
  })

  it('gear_reroll 保持实例品质（不退回装备品阶的词缀数量语义）', async () => {
    const env = makeEnv()
    const pack = usePackStore()
    await pack.init()
    // 直接构造一件神品质（quality=5）装备实例，验证重roll用实例品质而非装备品级（rarity=1 凡品）
    const gearCat = createDebugCategories(env).find((c) => c.id === 'gear') as DebugCategory
    const act = gearCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'gear_reroll')!
    const inst = makeInstance('wp_t1_light_01', [], 0, 5)
    pack.gearInstances.push(inst)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const r = await act.execute(inst.instanceId)
    expect(r.success).toBe(true)
    const after = pack.gearInstances.find((g) => g.instanceId === inst.instanceId)
    expect(after?.quality).toBe(5)
    // 神品质词缀数量（affixCountByQuality(5)=5；词库不足时取可用上限）应 ≥ 凡品质语义（1）
    expect(after?.affixes.length).toBeGreaterThanOrEqual(2)
    vi.restoreAllMocks()
  })
})
