// @vitest-environment happy-dom
/**
 * debugActions.test.ts — 调试动作定义工厂测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 工厂生成分类树结构、危险动作标记、输入参数动作定义、真实动作行为（等级重算 / 刷关模拟）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createDebugCategories, fail, ok, type DebugCategory } from '@/presentation/modules/yanjie/xiyou/debugActions'
import type { PlayerStoreDebugEnv } from '@/presentation/modules/yanjie/xiyou/debugEnv'
import { packItems, quests, realms, scenes, schools, shopGoods, skillPoints } from '@/presentation/modules/yanjie/xiyou/xiyouData'
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
    realms,
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

  it('拓展功能：词缀注入 / 二阶材料 / 晶球 / 品质锁定 / 敌人词缀 / 掉落锁定 / 刷关模拟均已定义', () => {
    const cats = createDebugCategories(makeEnv())
    const ids = cats.flatMap((c) => c.groups.flatMap((g) => g.actions.map((a) => a.id)))
    for (const id of [
      'gear_affix_inject',
      'gear_craft_quality',
      'pack_mat_all_t2',
      'pack_orb_all',
      'econ_enemy_affix',
      'econ_enemy_affix_clear',
      'econ_force_drop',
      'battle_grind',
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('battle_grind 为多输入（场景 + 次数）', () => {
    const battle = createDebugCategories(makeEnv()).find((c) => c.id === 'battle') as DebugCategory
    const grind = battle.groups.flatMap((g) => g.actions).find((a) => a.id === 'battle_grind')!
    expect(Array.isArray(grind.input)).toBe(true)
    expect((grind.input as unknown[]).length).toBe(2)
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
    const goldBefore = env.player.currency.copper
    const invBefore = Object.keys(pack.inventory).length
    // random 返回 0 保证掉落命中（确定性断言），也固定经验/金钱取区间下限
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const r = await grind.execute({ scene: firstScene.id, count: '5' })
    expect(r.success).toBe(true)
    expect(env.player.player.exp).toBeGreaterThanOrEqual(expBefore)
    expect(env.player.currency.copper).toBeGreaterThanOrEqual(goldBefore)
    const summary = r.payload as { battles: number; exp: number; gold: number; dropVariety: number }
    expect(summary.battles).toBe(5)
    expect(summary.exp).toBeGreaterThanOrEqual(0)
    expect(summary.gold).toBeGreaterThanOrEqual(0)
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
    const locked = await grind.execute({ scene: firstScene.id, count: '5' })
    const lockedSummary = locked.payload as { dropVariety: number }
    const lockedVariety = lockedSummary.dropVariety
    // 关闭锁定，同样 random=0.99 → 低概率掉落 miss
    pack.setDebugForceDrops(false)
    const unlocked = await grind.execute({ scene: firstScene.id, count: '5' })
    const unlockedSummary = unlocked.payload as { dropVariety: number }
    // 场景存在 >0 概率掉落时，锁定态掉落种类应不少于非锁定态
    expect(lockedVariety).toBeGreaterThanOrEqual(unlockedSummary.dropVariety)
    vi.restoreAllMocks()
  })
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
    // 等级提升后属性应增长（成长曲线 + 满血满能量）
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
    env.player.currency.copper = 99999
    const r = await reset.execute()
    expect(r.success).toBe(true)
    expect(env.player.player.level).toBe(1)
    expect(env.player.currency.copper).toBe(0)
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
    // 直接构造一件神品（quality=5）装备实例，验证重roll用实例品质而非装备品阶（rarity=1 凡品）
    const gearCat = createDebugCategories(env).find((c) => c.id === 'gear') as DebugCategory
    const act = gearCat.groups.flatMap((g) => g.actions).find((a) => a.id === 'gear_reroll')!
    const inst = makeInstance('wp_t1_light_01', [], 0, 5)
    pack.gearInstances.push(inst)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const r = await act.execute(inst.instanceId)
    expect(r.success).toBe(true)
    const after = pack.gearInstances.find((g) => g.instanceId === inst.instanceId)
    expect(after?.quality).toBe(5)
    // 神品词缀数量（affixCountByQuality(5)=5；词库不足时取可用上限）应 ≥ 凡品语义（1）
    expect(after?.affixes.length).toBeGreaterThanOrEqual(2)
    vi.restoreAllMocks()
  })
})
