// @vitest-environment happy-dom
/**
 * save-bridge.test.ts — 存档端口实现（store ↔ SaveData 映射，AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: collect 状态映射、restore 状态恢复、collect→restore 往返一致
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { xiyouSaveBridge } from '@/presentation/modules/yanjie/xiyou/save-bridge'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { usePackStore } from '@/presentation/stores/packStore'
import { scenes } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import { SaveManager } from '@/shared/utils/save-manager'
import { createInitialGameState, verifySaveChecksum, type SaveData } from '@/shared/utils/save-schema'

/** 内存版持久化（代替 IndexedDB，packStore.flush/load 使用） */
const { __mem, __storage } = vi.hoisted(() => {
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
      async remove(store: string, key: string): Promise<boolean> {
        return mem.get(store)?.delete(key) ?? false
      },
    },
  }
})

vi.mock('@/infrastructure/adapters/storage', () => ({ persistentStorage: __storage }))

beforeEach(() => {
  setActivePinia(createPinia())
  __mem.clear()
})

describe('collect 状态映射', () => {
  it('玩家等级 / 货币 / 加点 / 当前场景映射到 SaveData', async () => {
    const player = usePlayerStore()
    const pack = usePackStore()
    player.player.level = 6
    player.currency.copper = 200
    player.currency.jade = 30
    player.statPoints.strength = 2
    await pack.init()

    const data = await xiyouSaveBridge.collect({ currentSceneId: 'scene_1_1' })
    expect(data.player.level).toBe(6)
    expect(data.player.gold).toBe(200)
    expect(data.player.jade).toBe(30)
    expect(data.player.base_atk).toEqual([player.player.attackMin, player.player.attackMax])
    expect(data.player.statBonuses?.strength).toBe(2)
    expect(data.progress.current_scene).toBe('scene_1_1')
    // 初始档第一关解锁 → max_scene >= 1
    expect(data.progress.max_scene).toBeGreaterThanOrEqual(1)
    expect(validateShape(data)).toBe(true)
  })

  it('物品按 type 分类到 inventory 四类', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem('elix_001', 2) // 丹药
    pack.addItem('mat_taomu', 3) // 材料（初始 24 → 27）
    pack.addItem('quest_001', 1) // 任务（初始已有，分类到 misc）

    const data = await xiyouSaveBridge.collect({ currentSceneId: null })
    expect(data.inventory.elixirs['elix_001']).toBe(7) // 初始 5 + 2
    expect(data.inventory.materials['mat_taomu']).toBe(27)
    expect(data.inventory.misc['quest_001']).toBe(2) // 初始 1 + 1
  })

  it('已穿戴装备映射到 6 槽（weapon/armor/helmet/boots/charm/glove 一一对应）', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip('wp_t1_light_01') // 竹剑 → weapon
    pack.equip('hf_t1_life_01') // 淡水玉护符 → charm

    const data = await xiyouSaveBridge.collect({ currentSceneId: null })
    expect(data.equipment.weapon).toBe(pack.equipped.weapon?.instanceId)
    expect(data.equipment.charm).toBe(pack.equipped.charm?.instanceId)
    expect(data.equipment.helmet).toBeNull()
    expect(data.equipment.boots).toBeNull()
    expect(data.equipment.glove).toBeNull()
    // 实例化装备带词缀（凡品 1 条）与强化等级，可还原
    expect(data.equipment_instances?.some((i) => i.itemId === 'wp_t1_light_01')).toBe(true)
    expect(data.equipment_instances?.some((i) => i.itemId === 'hf_t1_life_01')).toBe(true)
  })
})

describe('restore 状态恢复', () => {
  it('恢复玩家 / 货币 / 物品 / 装备 / 场景解锁', async () => {
    const data: SaveData = {
      ...createInitialGameState(),
      player: {
        ...createInitialGameState().player,
        level: 9,
        exp: 500,
        gold: 300,
        silver: 5,
        jade: 10,
        base_atk: [20, 30],
        hp_max: 900,
        energy_max: 250,
        statBonuses: { available: 0, strength: 2, vitality: 0, agility: 0, spirit: 0 },
      },
      progress: {
        ...createInitialGameState().progress,
        current_scene: 'scene_1_1',
        unlocked_scenes: ['scene_1_1', 'scene_1_2'],
      },
      inventory: {
        materials: { mat_taomu: 5 },
        equipments: { wp_t1_light_01: 1 },
        elixirs: { elix_001: 3 },
        misc: { quest_001: 1 },
      },
      equipment: {
        weapon: 'wp_t1_light_01',
        armor: null,
        helmet: null,
        boots: null,
        charm: null,
        glove: null,
      },
    }
    await xiyouSaveBridge.restore(data)

    const player = usePlayerStore()
    const pack = usePackStore()
    expect(player.player.level).toBe(9)
    expect(player.player.maxHp).toBe(900)
    expect(player.player.energy).toBe(250)
    expect(player.currency.copper).toBe(300)
    expect(pack.countOf('mat_taomu')).toBe(5)
    expect(pack.countOf('elix_001')).toBe(3)
    expect(pack.countOf('quest_001')).toBe(1)
    expect(pack.equipped.weapon?.itemId).toBe('wp_t1_light_01')
    expect(scenes.find(s => s.id === 'scene_1_2')?.unlocked).toBe(true)
  })
})

describe('手动存档全链路（真实 bridge → 落盘）', () => {
  it('save(manual) 收集真实运行时状态写入 main + localStorage，checksum 有效', async () => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    const pack = usePackStore()
    player.player.level = 5
    player.player.exp = 360
    player.currency.copper = 999
    await pack.init()
    pack.equip('wp_t1_light_01')

    const manager = new SaveManager(xiyouSaveBridge, __storage)
    manager.setCurrentSceneId('scene_1_1')
    const ok = await manager.save('manual')

    expect(ok).toBe(true)
    const saved = __mem.get('saves')?.get('save:main') as SaveData | undefined
    expect(saved).toBeTruthy()
    expect(saved?.player.level).toBe(5)
    expect(saved?.player.exp).toBe(360)
    expect(saved?.player.gold).toBe(999)
    // 装备：equipment.weapon 存 instanceId，equipment_instances 存完整实例（含词缀/强化）
    const wp = saved?.equipment_instances?.find((i) => i.itemId === 'wp_t1_light_01')
    expect(wp).toBeTruthy()
    expect(saved?.equipment.weapon).toBe(wp?.instanceId)
    expect(saved?.progress.current_scene).toBe('scene_1_1')
    // 落盘数据必须带有效 checksum（下次加载完整性校验依赖）
    expect(saved && verifySaveChecksum(saved)).toBe(true)
    // 手动存档写 localStorage 降级副本，但不写 auto 备份
    expect(JSON.parse(localStorage.getItem('xiyou_save')!).player.level).toBe(5)
    expect(__mem.get('saves')?.get('save:auto')).toBeUndefined()
  })

  it('save(manual) 未初始化行囊时也能收集（自动 init，不丢 configs 初始物品）', async () => {
    setActivePinia(createPinia())
    const manager = new SaveManager(xiyouSaveBridge, __storage)
    manager.setCurrentSceneId('scene_1_1')
    const ok = await manager.save('manual')
    expect(ok).toBe(true)
    const saved = __mem.get('saves')?.get('save:main') as SaveData | undefined
    // 材料组初始持有（桃木×24）进入 materials，而非空背包
    expect(saved?.inventory.materials['mat_taomu']).toBe(24)
  })
})

describe('collect → restore 往返', () => {
  it('恢复后状态与存档前一致', async () => {
    const player = usePlayerStore()
    const pack = usePackStore()
    player.player.level = 5
    player.currency.copper = 777
    await pack.init()
    pack.addItem('elix_perm_01', 1)
    pack.equip('wp_t1_light_01')

    const data = await xiyouSaveBridge.collect({ currentSceneId: 'scene_1_1' })

    // 新实例恢复
    setActivePinia(createPinia())
    __mem.clear()
    await xiyouSaveBridge.restore(data)

    const player2 = usePlayerStore()
    const pack2 = usePackStore()
    expect(player2.player.level).toBe(5)
    expect(player2.currency.copper).toBe(777)
    expect(pack2.equipped.weapon?.itemId).toBe('wp_t1_light_01')
    // 往返后再次收集应一致（装备仍在穿戴上，背包无该装备）
    const data2 = await xiyouSaveBridge.collect({ currentSceneId: 'scene_1_1' })
    expect(data2.player.level).toBe(5)
    expect(data2.player.gold).toBe(777)
    expect(data2.equipment.weapon).toBe(pack2.equipped.weapon?.instanceId)
  })
})

/** 轻量形状断言：关键字段存在 */
function validateShape(data: SaveData): boolean {
  return !!(
    data.meta?.version &&
    data.player &&
    data.progress?.current_scene !== undefined &&
    data.inventory &&
    data.equipment
  )
}
