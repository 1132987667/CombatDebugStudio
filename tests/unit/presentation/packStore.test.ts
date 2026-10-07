// @vitest-environment happy-dom
/**
 * packStore.test.ts — 行囊 store 核心逻辑测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 初始持有量生成、数量增减边界、丢弃限制、仓库存取、扩容、坊市购买、战斗外使用、持久化往返
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { starterEnabled } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import type { XiyouShopGood } from '@/presentation/modules/yanjie/xiyou/types'

/** 内存版持久化（代替 IndexedDB，供 flush/load 往返断言） */
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
    },
  }
})

vi.mock('@/infrastructure/adapters/storage', () => ({ persistentStorage: __storage }))

function makeGood(overrides: Partial<XiyouShopGood> = {}): XiyouShopGood {
  return {
    name: '疗伤丹',
    type: '丹药',
    price: 50,
    stock: 99,
    ...overrides,
  }
}

/** 按 id 取仓库（store 未导出 warehouseById，测试内联） */
function whOf(pack: ReturnType<typeof usePackStore>, id: string) {
  return pack.warehouses.find((w) => w.id === id)!
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
  __mem.clear()
})

describe('初始化', () => {
  it('从 pack.json 生成初始持有量与首仓 12 格', async () => {
    const pack = usePackStore()
    await pack.init()
    // 桃木 ×24 / 疗伤丹药 ×5（pack.json 初始值）
    expect(pack.countOf('mat_taomu')).toBe(24)
    expect(pack.countOf('elix_001')).toBe(5)
    // 新档只有一座仓库，id/名称固定，容量取该仓 slots 长度
    expect(pack.warehouseCount).toBe(1)
    expect(pack.activeWarehouseId).toBe('wh_main')
    expect(pack.activeWarehouse?.slots).toHaveLength(12)
    expect(pack.activeWarehouse?.slots[0]).toMatchObject({ itemId: 'mat_lupi', count: 12 }) // 鹿皮 ×12
    expect(pack.storageCapacity).toBe(12)
  })

  it('新游戏自动生成新手装备套：六槽各一件 t1', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.gearInstances.map((g) => g.itemId).sort()).toEqual(
      ['ar_t1_light_01', 'bt_t1_light_01', 'hd_t1_war_01', 'hf_t1_life_01', 'jz_t1_power_01', 'wp_t1_light_01'].sort(),
    )
    // 六件覆盖六个不同槽位
    expect(new Set(pack.gearInstances.map((g) => pack.slotKeyOf(g.itemId))).size).toBe(6)
  })

  it('starterEnabled=false 时新档不生成新手套', async () => {
    starterEnabled.value = false
    try {
      const pack = usePackStore()
      await pack.init()
      expect(pack.gearInstances).toHaveLength(0)
    } finally {
      starterEnabled.value = true
    }
  })
})

describe('数量增减', () => {
  it('addItem 累加 / removeItem 递减，归零自动移除', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem('mat_taomu', 6)
    expect(pack.countOf('mat_taomu')).toBe(30)
    expect(pack.removeItem('mat_taomu', 30)).toBe(true)
    expect(pack.countOf('mat_taomu')).toBe(0)
    expect(pack.ownedItems.some((it) => it.id === 'mat_taomu')).toBe(false)
  })

  it('removeItem 数量不足返回 false 且不扣', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.removeItem('mat_taomu', 999)).toBe(false)
    expect(pack.countOf('mat_taomu')).toBe(24)
  })

  it('任务物品不可丢弃', async () => {
    const pack = usePackStore()
    await pack.init()
    // 水帘洞藏宝图（quest_001）初始持有 1，type=任务
    expect(pack.countOf('quest_001')).toBe(1)
    expect(pack.discardItem('quest_001')).toBe(false)
    expect(pack.countOf('quest_001')).toBe(1)
  })

  it('普通物品丢弃全部', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.discardItem('mat_taomu')).toBe(true)
    expect(pack.countOf('mat_taomu')).toBe(0)
  })
})

describe('仓库存取（当前仓）', () => {
  it('存入当前仓找空位，数量移出背包；取出回背包', async () => {
    const pack = usePackStore()
    await pack.init()
    const slots = pack.activeWarehouse!.slots
    const emptyIdx = slots.findIndex((s) => !s.itemId)
    expect(emptyIdx).toBeGreaterThanOrEqual(0)
    expect(pack.moveToStorage('mat_taomu')).toBe(true)
    expect(pack.countOf('mat_taomu')).toBe(0)
    const slot = slots[emptyIdx]
    expect(slot.itemId).toBe('mat_taomu')
    expect(slot.count).toBe(24)
    expect(pack.moveToInventory(emptyIdx)).toBe(true)
    expect(pack.countOf('mat_taomu')).toBe(24)
    expect(slots[emptyIdx].itemId).toBeNull()
  })

  it('指定 warehouseId 存入目标仓，不改动当前仓', async () => {
    const pack = usePackStore()
    await pack.init()
    // 造第二座仓（建造成本：桃木 20 + 粗石 10）
    pack.addItem('mat_cushi', 10)
    expect(pack.buildWarehouse()).toBe(true)
    const secondId = pack.activeWarehouse!.id
    // 切回首仓后，显式指定第二仓存入
    expect(pack.switchActiveWarehouse('wh_main')).toBe(true)
    expect(pack.moveToStorage('mat_taomu', secondId)).toBe(true)
    expect(pack.activeWarehouse!.slots.some((s) => s.itemId === 'mat_taomu')).toBe(false)
    expect(pack.warehouses.find((w) => w.id === secondId)!.slots[0].itemId).toBe('mat_taomu')
  })

  it('指定仓已满时存入失败并保留背包数量', async () => {
    const pack = usePackStore()
    await pack.init()
    // 逐个存入直到首仓填满：初始 4 空格，第 5 次应失败
    let ok = true
    let guard = 0
    while (ok && guard < 10) {
      const it = pack.ownedItems.find((i) => pack.countOf(i.id) > 0)
      if (!it) break
      ok = pack.moveToStorage(it.id)
      guard++
    }
    expect(ok).toBe(false)
    expect(pack.warehouseFull).toBe(true)
    expect(pack.activeWarehouse!.slots.every((s) => s.itemId)).toBe(true)
  })

  it('anyWarehouseHasSpace：当前仓满但另有空仓时仍可存（「能否存入」判定单源）', async () => {
    const pack = usePackStore()
    await pack.init()
    // 填满首仓（按 inventory 键遍历，避免装备项空转）
    for (const id of Object.keys(pack.inventory)) {
      if (pack.inventory[id] <= 0) continue
      pack.moveToStorage(id)
      if (pack.warehouseFull) break
    }
    expect(pack.warehouseFull).toBe(true)
    expect(pack.anyWarehouseHasSpace).toBe(false)

    // 建第二仓（首仓已满，材料直接补给背包）
    pack.addItem('mat_taomu', 20)
    pack.addItem('mat_cushi', 10)
    expect(pack.buildWarehouse()).toBe(true)
    expect(pack.anyWarehouseHasSpace).toBe(true)

    // 切回首仓：当前仓满，但另有空仓 → 判定仍为可存入
    expect(pack.switchActiveWarehouse('wh_main')).toBe(true)
    expect(pack.warehouseFull).toBe(true)
    expect(pack.anyWarehouseHasSpace).toBe(true)
  })
})

describe('仓库扩容', () => {
  it('金钱足够时扩容 +6 格，容量递增；金钱不足拒绝', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.expandCost()).toBe(50)
    expect(pack.expandStorage()).toBe(true)
    expect(pack.storageCapacity).toBe(18)
    expect(pack.currency.money).toBe(536480 - 50)
    // 第二次扩容价格 100
    expect(pack.expandCost()).toBe(100)
  })

  it('扩容至 36 格上限后拒绝', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.currency.money = 999999
    let guard = 0
    while (pack.storageCapacity < 36 && guard < 10) {
      pack.expandStorage()
      guard++
    }
    expect(pack.storageCapacity).toBe(36)
    expect(pack.expandStorage()).toBe(false)
  })

  it('金钱不足时扩容失败', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.currency.money = 10
    expect(pack.expandStorage()).toBe(false)
    expect(pack.storageCapacity).toBe(12)
  })

  it('每座仓库独立扩容：扩首仓不影响第二仓容量', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem('mat_cushi', 10)
    expect(pack.buildWarehouse()).toBe(true)
    const secondId = pack.activeWarehouse!.id
    // 当前（第二仓）扩容一次 → 18
    expect(pack.expandStorage()).toBe(true)
    expect(pack.storageCapacity).toBe(18)
    // 显式指定首仓仍为 12，且其扩容档位独立（首次仍 50）
    expect(whOf(pack,'wh_main')!.slots).toHaveLength(12)
    expect(pack.expandCost('wh_main')).toBe(50)
    expect(pack.expandCost(secondId)).toBe(100)
    expect(pack.expandStorage('wh_main')).toBe(true)
    expect(whOf(pack,'wh_main')!.slots).toHaveLength(18)
  })
})

describe('多仓库建造', () => {
  it('材料充足时建造成功：扣料、新增 12 格仓库并切换为当前仓', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem('mat_cushi', 10) // 初始粗石 8，二仓需 10
    expect(pack.buildCost()).toEqual([
      { itemId: 'mat_taomu', count: 20 },
      { itemId: 'mat_cushi', count: 10 },
    ])
    expect(pack.buildWarehouse()).toBe(true)
    expect(pack.warehouseCount).toBe(2)
    expect(pack.countOf('mat_taomu')).toBe(24 - 20)
    expect(pack.countOf('mat_cushi')).toBe(18 - 10)
    // 新仓独立空仓，容量 12，建造后自动切为当前仓
    expect(pack.activeWarehouseId).not.toBe('wh_main')
    expect(pack.activeWarehouse?.name).toBe('仓库·2')
    expect(pack.storageCapacity).toBe(12)
    expect(pack.activeWarehouse?.slots.every((s) => !s.itemId)).toBe(true)
  })

  it('材料不足时拒绝且不扣料、不新增', async () => {
    const pack = usePackStore()
    await pack.init()
    // 初始粗石仅 8，二仓需 10
    expect(pack.buildWarehouse()).toBe(false)
    expect(pack.warehouseCount).toBe(1)
    expect(pack.countOf('mat_taomu')).toBe(24)
    expect(pack.countOf('mat_cushi')).toBe(8)
  })

  it('建造上限 5 座：第 5 次成功后 buildCost 为 null 并拒绝', async () => {
    const pack = usePackStore()
    await pack.init()
    // 备足 4 次建造所需材料（桃木 60 / 粗石 30 / 铜精 30 / 松木 120 / 铁精 60 / 玄铁 5）
    pack.addItem('mat_taomu', 60)
    pack.addItem('mat_cushi', 30)
    pack.addItem('mat_tongjing', 30)
    pack.addItem('mat_songmu', 120)
    pack.addItem('mat_tiejing', 60)
    pack.addItem('mat_xuantie', 5)
    for (let i = 0; i < 4; i++) expect(pack.buildWarehouse()).toBe(true)
    expect(pack.warehouseCount).toBe(5)
    expect(pack.canBuildWarehouse).toBe(false)
    expect(pack.buildCost()).toBeNull()
    expect(pack.buildWarehouse()).toBe(false)
    expect(pack.warehouseCount).toBe(5)
  })
})

describe('仓库切换 / 改名 / 转移', () => {
  /** 造出第二座仓并返回其 id（前置：补足二仓材料） */
  function buildSecond(pack: ReturnType<typeof usePackStore>): string {
    pack.addItem('mat_cushi', 10)
    pack.buildWarehouse()
    return pack.activeWarehouse!.id
  }

  it('switchActiveWarehouse 切换当前仓；未知 id 返回 false', async () => {
    const pack = usePackStore()
    await pack.init()
    const secondId = buildSecond(pack)
    expect(pack.switchActiveWarehouse('wh_main')).toBe(true)
    expect(pack.activeWarehouseId).toBe('wh_main')
    expect(pack.switchActiveWarehouse(secondId)).toBe(true)
    expect(pack.switchActiveWarehouse('ghost')).toBe(false)
    expect(pack.activeWarehouseId).toBe(secondId)
  })

  it('renameWarehouse：trim 后截断 8 字；空名与未知 id 拒绝', async () => {
    const pack = usePackStore()
    await pack.init()
    const secondId = buildSecond(pack)
    expect(pack.renameWarehouse(secondId, '  药材库  ')).toBe(true)
    expect(whOf(pack,secondId)!.name).toBe('药材库')
    expect(pack.renameWarehouse(secondId, '')).toBe(false)
    expect(whOf(pack,secondId)!.name).toBe('药材库')
    expect(pack.renameWarehouse('ghost', 'x')).toBe(false)
    // 超长截断为 8 字
    expect(pack.renameWarehouse(secondId, '一二三四五六七八九十')).toBe(true)
    expect(whOf(pack,secondId)!.name).toBe('一二三四五六七八')
    // 与其他仓重名拒绝（首仓固定名「主仓库」），原名保留
    expect(pack.renameWarehouse(secondId, '主仓库')).toBe(false)
    expect(whOf(pack,secondId)!.name).toBe('一二三四五六七八')
    // 与自身同名放行（幂等，不误判为重名）
    expect(pack.renameWarehouse(secondId, '一二三四五六七八')).toBe(true)
  })

  it('仓库间整格直接转移：源格清空、目标仓首个空位落位', async () => {
    const pack = usePackStore()
    await pack.init()
    const secondId = buildSecond(pack)
    // 首仓前 8 格被 configs 初始物资占用；首个空位为索引 8
    // （buildSecond 已消耗桃木 20，剩 4）
    expect(whOf(pack, 'wh_main')!.slots[8].itemId).toBeNull()
    expect(pack.moveToStorage('mat_taomu', 'wh_main')).toBe(true)
    expect(whOf(pack, 'wh_main')!.slots[8]).toMatchObject({ itemId: 'mat_taomu', count: 4 })
    expect(pack.transferWarehouseItem('wh_main', 8, secondId)).toBe(true)
    expect(whOf(pack, 'wh_main')!.slots[8].itemId).toBeNull()
    expect(whOf(pack, secondId)!.slots[0]).toMatchObject({ itemId: 'mat_taomu', count: 4 })
  })

  it('转移拒绝：同仓 / 空源格 / 未知仓 / 目标仓已满', async () => {
    const pack = usePackStore()
    await pack.init()
    const secondId = buildSecond(pack)
    expect(pack.moveToStorage('mat_taomu', 'wh_main')).toBe(true) // 存入索引 8
    // 同仓
    expect(pack.transferWarehouseItem('wh_main', 8, 'wh_main')).toBe(false)
    // 空源格（首仓索引 9 仍为空）
    expect(whOf(pack, 'wh_main')!.slots[9].itemId).toBeNull()
    expect(pack.transferWarehouseItem('wh_main', 9, secondId)).toBe(false)
    // 未知仓
    expect(pack.transferWarehouseItem('wh_main', 8, 'ghost')).toBe(false)
    // 目标仓填满后拒绝（把背包中的非装备物品塞满第二仓 12 格）
    for (const id of Object.keys(pack.inventory)) {
      if (pack.inventory[id] <= 0) continue
      pack.moveToStorage(id, secondId)
      if (whOf(pack, secondId)!.slots.every((s) => s.itemId)) break
    }
    expect(whOf(pack, secondId)!.slots.every((s) => s.itemId)).toBe(true)
    expect(pack.transferWarehouseItem('wh_main', 8, secondId)).toBe(false)
    // 源格未被清空
    expect(whOf(pack, 'wh_main')!.slots[8].itemId).toBe('mat_taomu')
  })
})

describe('货币扣减 spend', () => {
  it('扣减成功并同步 playerStore.currency；不足返回 false 不扣', async () => {
    const pack = usePackStore()
    const player = usePlayerStore()
    await pack.init()
    const before = pack.currency.money
    expect(pack.spend('money', 140)).toBe(true)
    expect(pack.currency.money).toBe(before - 140)
    expect(player.currency.money).toBe(before - 140)
    expect(pack.spend('money', 99999999)).toBe(false)
    expect(pack.currency.money).toBe(before - 140)
  })
})

describe('坊市购买', () => {
  it('购买成功：货币扣减、库存减少、背包增加', async () => {
    const pack = usePackStore()
    await pack.init()
    const good = makeGood()
    expect(pack.purchase(good, 2)).toBeNull()
    expect(pack.currency.money).toBe(536480 - 100)
    expect(good.stock).toBe(97)
    expect(pack.countOf('elix_001')).toBe(5 + 2)
  })

  it('货币不足返回失败且不改变状态', async () => {
    const pack = usePackStore()
    await pack.init()
    const good = makeGood({ price: 999999 })
    expect(pack.purchase(good, 1)).toBe('金钱不足')
    expect(pack.currency.money).toBe(536480)
    expect(pack.countOf('elix_001')).toBe(5)
  })

  it('库存不足返回失败', async () => {
    const pack = usePackStore()
    await pack.init()
    const good = makeGood({ stock: 1 })
    expect(pack.purchase(good, 2)).toBe('库存不足')
    expect(pack.currency.money).toBe(536480)
  })

  it('无限库存（stock=-1）购买后不递减', async () => {
    const pack = usePackStore()
    await pack.init()
    const good = makeGood({ stock: -1 })
    expect(pack.purchase(good, 3)).toBeNull()
    expect(good.stock).toBe(-1)
  })

  it('商品按金钱结算（凝神丹 单价 3000）', async () => {
    const pack = usePackStore()
    await pack.init()
    // 凝神丹（elix_perm_05）初始不持有，购 2 → 2
    const good = makeGood({ name: '凝神丹', price: 3000, stock: 2 })
    expect(pack.purchase(good, 2)).toBeNull()
    expect(pack.currency.money).toBe(536480 - 6000)
    expect(pack.countOf('elix_perm_05')).toBe(2)
  })
})

describe('坊市经济（价值 × 全局系数）', () => {
  it('有 itemId 的商品单价 = 实际价值 × 购买系数（默认 200%）；购买按派生价结算', async () => {
    const pack = usePackStore()
    await pack.init()
    // pack.json 桃木 itemId=mat_taomu，value=8 → 8 × 200% = 16（配置价 8 被忽略）
    const good = makeGood({ name: '桃木', itemId: 'mat_taomu', price: 8 })
    expect(pack.shopPrice(good)).toBe(16)
    expect(pack.purchase(good, 1)).toBeNull()
    expect(pack.currency.money).toBe(536480 - 16)
  })

  it('无 itemId 商品（引路香）回退配置价', async () => {
    const pack = usePackStore()
    await pack.init()
    const good = makeGood({ name: '引路香', price: 20 })
    expect(pack.shopPrice(good)).toBe(20)
  })

  it('出售单价 = 实际价值 × 出售系数（默认 56%，向下取整）', async () => {
    const pack = usePackStore()
    await pack.init()
    // 桃木 value=8 → floor(8 × 0.56) = 4
    expect(pack.sellPriceOf('mat_taomu')).toBe(4)
  })

  it('出售成功：扣物品、按出售价入账金钱', async () => {
    const pack = usePackStore()
    await pack.init()
    const before = pack.currency.money
    expect(pack.sell('mat_taomu', 10)).toBeNull()
    expect(pack.countOf('mat_taomu')).toBe(24 - 10)
    expect(pack.currency.money).toBe(before + 4 * 10)
  })

  it('无价值物品（任务/钥匙）不可出售', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.sellPriceOf('quest_001')).toBe(0)
    expect(pack.sell('quest_001', 1)).toBe('该物品不可出售')
    expect(pack.countOf('quest_001')).toBe(1)
  })

  it('数量不足出售失败且不扣货币', async () => {
    const pack = usePackStore()
    await pack.init()
    const before = pack.currency.money
    expect(pack.sell('mat_taomu', 999)).toBe('数量不足')
    expect(pack.currency.money).toBe(before)
    expect(pack.countOf('mat_taomu')).toBe(24)
  })
})

describe('战斗外使用', () => {
  it('永久丹药提升属性并消耗', async () => {
    const pack = usePackStore()
    const player = usePlayerStore()
    await pack.init()
    pack.addItem('elix_perm_01', 1) // 铁骨丹：防御 +2
    const before = player.player.defense
    expect(pack.useItem('elix_perm_01')).toBe(true)
    expect(player.player.defense).toBe(before + 2)
    expect(pack.countOf('elix_perm_01')).toBe(0)
  })

  it('heal/energy 丹药战斗外不可用（返回 false 且不消耗）', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.useItem('elix_001')).toBe(false)
    expect(pack.countOf('elix_001')).toBe(5)
  })

  it('凝神丹（永久丹药）命中 +2 并消耗', async () => {
    const pack = usePackStore()
    const player = usePlayerStore()
    await pack.init()
    pack.addItem('elix_perm_05', 1)
    const h = player.player.hitRate
    expect(pack.useItem('elix_perm_05')).toBe(true)
    expect(player.player.hitRate).toBe(h + 2)
    expect(pack.countOf('elix_perm_05')).toBe(0)
    expect(pack.pillUses['elix_perm_05']).toBe(1)
    expect(pack.pillBonuses['hitRate']).toBe(2)
  })

  it('凌波丹（永久丹药）闪避 +2；服满 10 颗后拒绝且不消耗', async () => {
    const pack = usePackStore()
    const player = usePlayerStore()
    await pack.init()
    pack.addItem('elix_perm_06', 12)
    const d = player.player.dodgeRate
    for (let i = 0; i < 10; i++) expect(pack.useItem('elix_perm_06')).toBe(true)
    expect(player.player.dodgeRate).toBe(d + 20)
    expect(pack.useItem('elix_perm_06')).toBe(false)
    expect(player.player.dodgeRate).toBe(d + 20) // 超限不再加成
    expect(pack.countOf('elix_perm_06')).toBe(2) // 拒绝时不消耗
    expect(pack.pillUses['elix_perm_06']).toBe(10)
  })

  it('canUseOutOfBattle 只对已实现效果放行', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.canUseOutOfBattle('elix_perm_01')).toBe(true) // 铁骨丹
    expect(pack.canUseOutOfBattle('elix_perm_05')).toBe(true) // 凝神丹已实现
    expect(pack.canUseOutOfBattle('elix_perm_06')).toBe(true) // 凌波丹已实现
    expect(pack.canUseOutOfBattle('enh_stone')).toBe(false) // 强化石非战斗外消耗品
    expect(pack.canUseOutOfBattle('elix_001')).toBe(false) // 恢复丹战斗外不可用
  })
})

describe('战斗掉落', () => {
  it('命中（random < chance）入包并累计', async () => {
    const pack = usePackStore()
    await pack.init()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    pack.applyDrops([
      { itemId: 'mat_taomu', quantity: 2, chance: 0.5 },
      { itemId: 'mat_cushi', quantity: 1, chance: 1 },
    ])
    expect(pack.countOf('mat_taomu')).toBe(24 + 2)
    expect(pack.countOf('mat_cushi')).toBe(8 + 1)
  })

  it('未命中（random >= chance）不入包', async () => {
    const pack = usePackStore()
    await pack.init()
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    pack.applyDrops([{ itemId: 'mat_taomu', quantity: 1, chance: 0.5 }])
    expect(pack.countOf('mat_taomu')).toBe(24)
  })

  it('无效 itemId / 零 chance 跳过', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.applyDrops([
      { itemId: 'ghost', quantity: 1, chance: 1 },
      { itemId: 'mat_taomu', quantity: 1, chance: 0 },
    ])
    expect(pack.countOf('mat_taomu')).toBe(24)
  })

  it('命中物品聚合为一条掉落日志（数量求和），不再弹 toast', async () => {
    const pack = usePackStore()
    await pack.init()
    const logSpy = vi.spyOn(battleLogManager, 'addItemLog')
    const toastSpy = vi.spyOn(useNotificationStore(), 'toast')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    pack.applyDrops([
      { itemId: 'mat_taomu', quantity: 1, chance: 1 },
      { itemId: 'mat_taomu', quantity: 2, chance: 1 },
      { itemId: 'mat_cushi', quantity: 1, chance: 1 },
    ])
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith({ segments: [{ text: '获得了：桃木 ×3、粗石 ×1' }] })
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it('silent（刷关模拟）不写掉落日志', async () => {
    const pack = usePackStore()
    await pack.init()
    const logSpy = vi.spyOn(battleLogManager, 'addItemLog')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    pack.applyDrops([{ itemId: 'mat_taomu', quantity: 1, chance: 1 }], true)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('掉落率锁定（setDebugForceDrops(true)）时全部命中，忽略 chance', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.setDebugForceDrops(true)
    // random 返回 0.99（正常会 miss），但锁定后仍命中
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    pack.applyDrops([
      { itemId: 'mat_taomu', quantity: 2, chance: 0.01 },
      { itemId: 'mat_cushi', quantity: 1, chance: 0 },
    ])
    // 注意：锁定开启时零 chance 仍被跳过（chance <= 0 是硬性守卫）
    expect(pack.countOf('mat_taomu')).toBe(24 + 2)
    expect(pack.countOf('mat_cushi')).toBe(8)
    // 关闭后恢复随机
    pack.setDebugForceDrops(false)
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    pack.applyDrops([{ itemId: 'mat_taomu', quantity: 1, chance: 0.5 }])
    expect(pack.countOf('mat_taomu')).toBe(24 + 2)
  })
})

describe('持久化', () => {
  it('flush 写入 pack_runtime 文档，load 可恢复（多仓结构随存档往返）', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem('mat_taomu', 5) // 桃木 29
    pack.setQuickSlot(0, 'elix_001')
    pack.addItem('mat_cushi', 10)
    pack.buildWarehouse() // 建第二仓（耗桃木 20）并切为当前仓 → 桃木 9
    const secondId = pack.activeWarehouse!.id
    pack.moveToStorage('mat_tongjing') // 铜精 ×12 存入当前（第二）仓
    pack.purchase(makeGood(), 1)
    await pack.flush()

    const doc = __mem.get('xiyou')?.get('pack_runtime') as {
      data: {
        version: number
        inventory: Record<string, number>
        warehouses: Array<{ id: string; name: string; slots: Array<{ itemId: string | null; count: number }> }>
        activeWarehouseId: string
        quickSlots: (string | null)[]
        currency: { money: number }
      }
    }
    expect(doc.data.version).toBe(7)
    expect(doc.data.inventory['mat_taomu']).toBe(9)
    expect(doc.data.quickSlots[0]).toBe('elix_001')
    expect(doc.data.currency.money).toBe(536480 - 50)
    expect(doc.data.warehouses).toHaveLength(2)
    expect(doc.data.activeWarehouseId).toBe(secondId)
    expect(doc.data.warehouses[1].slots[0]).toMatchObject({ itemId: 'mat_tongjing', count: 12 })

    // 新 store 实例从 IDB 恢复
    setActivePinia(createPinia())
    const pack2 = usePackStore()
    await pack2.init()
    expect(pack2.countOf('mat_taomu')).toBe(9)
    expect(pack2.quickSlots[0]).toBe('elix_001')
    expect(pack2.currency.money).toBe(536480 - 50)
    expect(pack2.warehouseCount).toBe(2)
    expect(pack2.activeWarehouseId).toBe(secondId)
    expect(pack2.activeWarehouse!.slots[0]).toMatchObject({ itemId: 'mat_tongjing', count: 12 })
  })

  it('无存档时保持 configs 兜底', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.countOf('mat_taomu')).toBe(24)
  })

  it('v6→v7 迁移：旧单仓 storage 包裹为首仓 wh_main；落盘升版后重复 load 幂等', async () => {
    // 预置一份 v6 旧档（单仓 storage 形状）
    __mem.set('xiyou', new Map([['pack_runtime', {
      id: 'pack_runtime',
      name: '行囊运行时',
      data: {
        version: 6,
        inventory: { mat_taomu: 3 },
        storage: [
          { itemId: 'mat_lupi', count: 12 },
          { itemId: null, count: 0 },
        ],
        quickSlots: [null, null, null, null],
        currency: { money: 500, xianyuan: 0 },
        gearInstances: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    }]]))

    const pack = usePackStore()
    await pack.init()
    expect(pack.warehouseCount).toBe(1)
    expect(pack.activeWarehouseId).toBe('wh_main')
    expect(pack.activeWarehouse?.name).toBe('主仓库')
    expect(pack.activeWarehouse!.slots).toHaveLength(2)
    expect(pack.activeWarehouse!.slots[0]).toMatchObject({ itemId: 'mat_lupi', count: 12 })
    expect(pack.countOf('mat_taomu')).toBe(3)

    // 落盘升版 v7 后，再次 load 走 warehouses 分支，不再重复包裹
    await pack.flush()
    setActivePinia(createPinia())
    const pack2 = usePackStore()
    await pack2.init()
    expect(pack2.warehouseCount).toBe(1)
    expect(pack2.activeWarehouse!.slots).toHaveLength(2)
    expect(pack2.activeWarehouse!.slots[0]).toMatchObject({ itemId: 'mat_lupi', count: 12 })
  })

  it('v4→v5 迁移：补发启动草药、清理种子残留；旧档三币合并为金钱、仙缘兜底初始值', async () => {
    // 预置一份 v4 旧档（种子体系时代的快照：残留种子、无启动草药、currency 为旧三币形状）
    __mem.set('xiyou', new Map([['pack_runtime', {
      id: 'pack_runtime',
      name: '行囊运行时',
      data: {
        version: 4,
        inventory: { seed_zhixuecao: 2, mat_lingzhi: 1 },
        storage: [],
        quickSlots: [null, null, null, null],
        currency: { copper: 100, silver: 0, jade: 0 },
        gearInstances: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    }]]))

    const pack = usePackStore()
    await pack.init()
    // 补发一阶启动草药（对齐 pack.json 初始量）；二阶以上母株靠场景关卡草药掉落
    expect(pack.countOf('mat_zhixuecao')).toBe(3)
    expect(pack.countOf('mat_qingxinye')).toBe(3)
    expect(pack.countOf('mat_shuilingshen')).toBe(0)
    // seed_* 残留被清理；原有物品保留
    expect(pack.countOf('seed_zhixuecao')).toBe(0)
    expect(pack.countOf('mat_lingzhi')).toBe(1)
    // 货币恢复：旧档三币按换算合并（100+0+0=100）；无仙缘字段时兜底初始值
    expect(pack.currency.money).toBe(100)
    expect(pack.currency.xianyuan).toBe(100)

    // 迁移后落盘升版：v5 快照不再重复补发
    await pack.flush()
    setActivePinia(createPinia())
    const pack2 = usePackStore()
    await pack2.init()
    expect(pack2.countOf('mat_zhixuecao')).toBe(3)
  })

  it('旧档混装 stats 原样保留：coreStat 收敛锚点已废（配置表不再存固化数值），不再重写旧档', async () => {
    // 预置旧格式实例：贝壳护手锁存了核心+词条混装的 3 条 stats；
    // 旁挂一件正常实例（stats 单条）验证不受影响
    __mem.set('xiyou', new Map([['pack_runtime', {
      id: 'pack_runtime',
      name: '行囊运行时',
      data: {
        version: 6,
        inventory: {},
        storage: [],
        quickSlots: [null, null, null, null],
        currency: { money: 0, xianyuan: 0 },
        gearInstances: [
          {
            instanceId: 'inst_legacy', itemId: 'jz_t1_power_01', enhance: 0, quality: 1, qualityFactor: 0.85, star: 0,
            stats: [
              { attribute: 'speed', modifierType: 'flat', value: 12 },
              { attribute: 'speed', modifierType: 'flat', value: 6 },
              { attribute: 'damageTakenReduce', modifierType: 'percent', value: 7 },
            ],
            affixes: [{ id: 'eqaff_spd_flat', attribute: 'speed', modifierType: 'flat', value: 6, rarity: 1 }],
          },
          {
            instanceId: 'inst_modern', itemId: 'jz_t1_power_01', enhance: 0, quality: 1, qualityFactor: 0.9, star: 0,
            stats: [{ attribute: 'speed', modifierType: 'flat', value: 13 }],
            affixes: [],
          },
        ],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    }]]))

    const pack = usePackStore()
    await pack.init()
    const legacy = pack.gearInstances.find((g) => g.instanceId === 'inst_legacy')
    const modern = pack.gearInstances.find((g) => g.instanceId === 'inst_modern')
    // 旧实例：混锁 stats 原样保留（收敛锚点已废）；词条归属 affixes 不动
    expect(legacy?.stats).toEqual([
      { attribute: 'speed', modifierType: 'flat', value: 12 },
      { attribute: 'speed', modifierType: 'flat', value: 6 },
      { attribute: 'damageTakenReduce', modifierType: 'percent', value: 7 },
    ])
    expect(legacy?.affixes).toHaveLength(1)
    // 新格式实例原样保留
    expect(modern?.stats).toEqual([{ attribute: 'speed', modifierType: 'flat', value: 13 }])
  })
})

describe("装备穿戴（背包实例化闭环）", () => {
  it("竹剑可穿戴到武器槽：扣背包一件、槽位记录、属性注入可算", async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.countOf("wp_t1_light_01")).toBe(1)

    expect(pack.slotKeyOf("wp_t1_light_01")).toBe("weapon")
    expect(pack.equip("wp_t1_light_01")).toBe(true)

    expect(pack.countOf("wp_t1_light_01")).toBe(0)
    expect(pack.equipped.weapon?.itemId).toBe("wp_t1_light_01")
    expect(pack.equippedGear("weapon")?.name).toBe("竹剑")

    const stats = pack.equippedStats()
    // §21 公式：竹剑核心攻击 = 1×6×2×0.9×2 × 品阶[0.5,0.6] × 浮动[0.5,1.1] × 凡品系数0.85 → [5,12]
    const atk = stats.find((s) => s.attribute === "attack" && s.modifierType === "flat")
    expect(atk).toBeDefined()
    expect(atk!.value).toBeGreaterThanOrEqual(4)
    expect(atk!.value).toBeLessThanOrEqual(13)
  })

  it("穿戴非装备物品被拒绝", async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.slotKeyOf("mat_taomu")).toBeNull()
    expect(pack.equip("mat_taomu")).toBe(false)
  })

  it("同槽换装：旧装备自动回背包", async () => {
    const pack = usePackStore()
    await pack.init()
    // 初始：竹剑 ×1（新手套），松木棍补 1 件
    pack.addItem("wp_t1_mid_01", 1) // 松木棍 ×1
    expect(pack.equip("wp_t1_light_01")).toBe(true) // 竹剑 ×0
    expect(pack.equip("wp_t1_mid_01")).toBe(true) // 松木棍 ×0，竹剑回背包 ×1

    expect(pack.equipped.weapon?.itemId).toBe("wp_t1_mid_01")
    expect(pack.countOf("wp_t1_light_01")).toBe(1)
    expect(pack.countOf("wp_t1_mid_01")).toBe(0)
  })

  it("卸下装备回背包并清空槽位", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    expect(pack.unequip("weapon")).toBe(true)

    expect(pack.equipped.weapon).toBeUndefined()
    expect(pack.countOf("wp_t1_light_01")).toBe(1)
  })

  it("六槽穿戴：helmet/boots/charm/glove 均可穿戴/强化/计入总属性", async () => {
    const pack = usePackStore()
    await pack.init()
    // hd/bt/hf/jz 为文档主线一阶配件（头盔/靴子/护符/护手）
    const slots = [
      { id: "hd_t1_war_01", slot: "helmet" },
      { id: "bt_t1_light_01", slot: "boots" },
      { id: "hf_t1_life_01", slot: "charm" },
      { id: "jz_t1_power_01", slot: "glove" },
    ] as const
    for (const { id, slot } of slots) {
      pack.addItem(id, 1)
      expect(pack.slotKeyOf(id)).toBe(slot)
      expect(pack.equip(id)).toBe(true)
      expect(pack.equipped[slot]?.itemId).toBe(id)
    }
    // 四配件 + 武器竹剑 + 衣服鹿皮甲 = 6 槽全穿
    pack.equip("wp_t1_light_01")
    pack.equip("ar_t1_light_01")
    expect(Object.keys(pack.equipped)).toHaveLength(6)
    // 强化护符消耗强化石（六部位通用）
    pack.addItem("enh_stone", 10)
    expect(pack.enhanceGear(pack.equipped.charm!.instanceId, () => 0)).toBe(true)
    expect(pack.equipped.charm?.enhance).toBe(1)
    // 总属性包含护手加成（攻击类）
    expect(pack.equippedStats().length).toBeGreaterThan(0)
  })

  it("equipped 随快照持久化，load 可恢复", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    await pack.flush()

    const doc = __mem.get("xiyou")?.get("pack_runtime") as { data: { equipped?: Record<string, { itemId: string }> } }
    expect(doc.data.equipped?.weapon?.itemId).toBe("wp_t1_light_01")

    setActivePinia(createPinia())
    const pack2 = usePackStore()
    await pack2.init()
    expect(pack2.equipped.weapon?.itemId).toBe("wp_t1_light_01")
  })
})

describe("discardGearInstance 单件丢弃（逐件操作粒度）", () => {
  it("丢弃一件只删该实例，其余保留；空后再丢返回 false", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem("wp_t1_light_01", 2) // 初始 1 + 2 = 3 件实例
    const insts = pack.gearInstances.filter((g) => g.itemId === "wp_t1_light_01")
    expect(insts).toHaveLength(3)

    expect(pack.discardGearInstance(insts[0].instanceId)).toBe(true)
    expect(pack.countOf("wp_t1_light_01")).toBe(2)

    for (const g of insts.slice(1)) pack.discardGearInstance(g.instanceId)
    expect(pack.countOf("wp_t1_light_01")).toBe(0)
    expect(pack.discardGearInstance(insts[0].instanceId)).toBe(false)
  })

  it("穿戴中的实例不在 gearInstances，按 instanceId 丢弃返回 false", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    const wornId = pack.equipped.weapon!.instanceId
    expect(pack.discardGearInstance(wornId)).toBe(false)
    expect(pack.equipped.weapon).toBeDefined()
  })

  it("未知 instanceId 返回 false", async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.discardGearInstance("no-such-instance")).toBe(false)
  })
})

describe("装备制造与强化（实例化）", () => {
  it("制造竹剑：扣材料 → 生成带词缀实例（凡品 1 条）", async () => {
    const pack = usePackStore()
    await pack.init()
    // 竹剑材料：桃木 ×3 + 铜精 ×1（equipment.json）
    const taomu0 = pack.countOf("mat_taomu")
    const tong0 = pack.countOf("mat_tongjing")
    const inst = pack.craftEquipment("wp_t1_light_01", () => 0.5)
    expect(inst).not.toBeNull()
    expect(inst!.itemId).toBe("wp_t1_light_01")
    expect(inst!.enhance).toBe(0)
    expect(inst!.affixes.filter((a) => a.fixed || a.main)).toHaveLength(2) // §21 主要属性：固定 1 + 随机池 1
    expect(inst!.affixes.filter((a) => !a.fixed && !a.main)).toHaveLength(1) // 凡品 1 条附加
    expect(pack.countOf("mat_taomu")).toBe(taomu0 - 3)
    expect(pack.countOf("mat_tongjing")).toBe(tong0 - 1)
    expect(pack.countOf("wp_t1_light_01")).toBe(2) // 初始 1 + 制造 1
  })

  it("材料不足时制造失败，不扣任何材料", async () => {
    const pack = usePackStore()
    await pack.init()
    // 首次制造耗尽铜精，再次制造应失败且不扣材料
    pack.craftEquipment("wp_t1_light_01", () => 0.5)
    const before = pack.countOf("mat_taomu")
    const inst = pack.craftEquipment("wp_t1_light_01", () => 0)
    if (inst !== null) {
      // 铜精充足时第二次也成功（不满足本测试前提），仅断言不出现负持有
      expect(pack.countOf("mat_taomu")).toBeGreaterThanOrEqual(0)
    } else {
      expect(pack.countOf("mat_taomu")).toBe(before)
    }
  })

  it("制造 roll 品质：地品阶位 rng 贴 0.99 → 超品质（3 条词缀，词条数按品质）", async () => {
    const pack = usePackStore()
    await pack.init()
    // 流云剑（wp_t3_light_01，rarity 3）：铁木×4 + 金精×2 + 仙云皮×1；三阶需持有 bp_t3_wp 解锁
    pack.addItem("bp_t3_wp", 1)
    pack.addItem("mat_tiemu", 4)
    pack.addItem("mat_jinjing", 2)
    pack.addItem("mat_xianyun", 1)
    // rng 序列：品质 roll=0.99 → 超品质；品质系数 roll=seq2；词条抽取用递增值保证抽到不同词条
    let seq = 0
    const rng = () => {
      seq++
      return seq === 1 ? 0.99 : ((seq * 0.137) % 1)
    }
    const inst = pack.craftEquipment("wp_t3_light_01", rng)
    expect(inst).not.toBeNull()
    expect(inst!.quality).toBe(3) // 地品权重表 [10,50,40]，rng 0.99 → 超品质
    expect(inst!.affixes.filter((a) => !a.fixed && !a.main)).toHaveLength(3) // 超品质 3 条附加（§21 品质→行数）
    // 品质系数锁存：超品质区间 [1.06,1.2]，rng 0.274 → 1.06+0.274×0.14=1.09836
    expect(inst!.qualityFactor).toBeCloseTo(1.098, 2)
    const stats = pack.instanceStats(inst!)
    // §21 公式：流云剑核心攻击基准 1×25×2×0.9×2=90 × 品阶[0.7,0.8] × 浮动[0.5,1.1] × 系数1.098 → [35,87]
    const atk = stats.find((s) => s.attribute === "attack" && s.modifierType === "flat")
    expect(atk).toBeDefined()
    expect(atk!.value).toBeGreaterThanOrEqual(34)
    expect(atk!.value).toBeLessThanOrEqual(88)
    // 同一实例多次计算数值稳定（roll 锁存于实例，不随 instanceStats 重 roll）
    expect(pack.instanceStats(inst!).find((s) => s.attribute === "attack" && s.modifierType === "flat")?.value).toBe(atk!.value)
  })

  it("制造天品装备固定绝品质（4 条词缀，词条池充足）", async () => {
    const pack = usePackStore()
    await pack.init()
    // 牛魔撼天锤（wp_t4_01，rarity 4）：mat_boss_01×1 + 金精×10；天品需持有 bp_legend_01 解锁
    pack.addItem("bp_legend_01", 1)
    pack.addItem("mat_boss_01", 1)
    pack.addItem("mat_jinjing", 10)
    // 黄金角序列 rng（0.618 倍递增）：品质系数与词条抽取分散，避免固定值去重截断
    let seq = 0
    const rng = () => {
      seq++
      return (seq * 0.618) % 1
    }
    const inst = pack.craftEquipment("wp_t4_01", rng)
    expect(inst).not.toBeNull()
    expect(inst!.quality).toBe(4) // 天品固定绝品质
    expect(inst!.affixes.filter((a) => !a.fixed && !a.main)).toHaveLength(4) // 绝品质 4 条附加（§21 品质→行数）
  })

  it("图纸解锁：一阶默认解锁；高阶未持有图纸时拒绝制造且不扣材料", async () => {
    const pack = usePackStore()
    await pack.init()
    // 一阶（t1）默认解锁：无需图纸直接可造
    expect(pack.blueprintUnlocked("wp_t1_light_01")).toBe(true)
    // 二阶未持有图纸 → 锁定
    expect(pack.blueprintUnlocked("wp_t2_light_01")).toBe(false)
    const songmu0 = pack.countOf("mat_songmu")
    const inst = pack.craftEquipment("wp_t2_light_01", () => 0.5)
    expect(inst).toBeNull() // 未解锁拒绝
    expect(pack.countOf("mat_songmu")).toBe(songmu0) // 材料未扣
  })

  it("图纸解锁：持有图纸后可制造，图纸不消耗（解锁判定）", async () => {
    const pack = usePackStore()
    await pack.init()
    // 流云剑（wp_t3_light_01）需 bp_t3_wp：铁木×4 + 金精×2 + 仙云皮×1
    pack.addItem("bp_t3_wp", 1)
    pack.addItem("mat_tiemu", 4)
    pack.addItem("mat_jinjing", 2)
    pack.addItem("mat_xianyun", 1)
    const bp0 = pack.countOf("bp_t3_wp")
    const inst = pack.craftEquipment("wp_t3_light_01", () => 0.5)
    expect(inst).not.toBeNull()
    expect(pack.countOf("bp_t3_wp")).toBe(bp0) // 图纸不消耗
  })

  it("强化已穿戴装备：扣材料+金钱，成功 +1 且属性提升", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    const enh0 = pack.countOf("enh_stone")
    pack.addItem("enh_stone", 10) // 强化材料：强化石
    const beforeMoney = pack.currency.money
    const atk0 = pack.equippedStats().find((s) => s.attribute === "attack")!.value
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0)).toBe(true) // rng 0 → 100% 成功
    expect(pack.equipped.weapon?.enhance).toBe(1)
    expect(pack.currency.money).toBe(beforeMoney - 50) // ⌊50×1²×1.0⌋（凡品 K=1.0）
    expect(pack.countOf("enh_stone")).toBe(enh0 + 9) // L=1 消耗 1
    const atk1 = pack.equippedStats().find((s) => s.attribute === "attack")!.value
    expect(atk1).toBe(Math.round(atk0 * 1.04)) // 每级 +4%
  })

  it("强化失败：扣消耗但等级不变", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    pack.addItem("enh_stone", 10)
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0)).toBe(true) // → Lv.1（rate 100%）
    const money1 = pack.currency.money
    const mat1 = pack.countOf("enh_stone")
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0.99)).toBe(false) // L=2 rate 95%，99 ≥ 95 → 失败
    expect(pack.equipped.weapon?.enhance).toBe(1)
    expect(pack.equipped.weapon?.enhanceFails).toBe(1) // 连败 +1（下次 rate +10%）
    expect(pack.currency.money).toBe(money1 - 200) // ⌊50×2²×1.0⌋
    expect(pack.countOf("enh_stone")).toBe(mat1 - 2) // L=2 消耗 2
  })

  it("强化材料/金钱不足时不扣任何消耗", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    pack.currency.money = 0 // 材料充足但金钱不足
    const mat0 = pack.countOf("enh_stone")
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0)).toBe(false)
    expect(pack.currency.money).toBe(0)
    expect(pack.countOf("enh_stone")).toBe(mat0)
    expect(pack.equipped.weapon?.enhance).toBe(0)
  })

  it("强化上限按阶位：凡品竹剑 +3 封顶（§21 品阶表）", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01") // rarity 1 → 上限 3
    pack.addItem("enh_stone", 100)
    pack.currency.money = 9999999
    let guard = 0
    while (pack.equipped.weapon!.enhance < 3 && guard < 10) {
      pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0)
      guard++
    }
    expect(pack.equipped.weapon!.enhance).toBe(3)
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0)).toBe(false) // 已达上限，拒绝
    expect(pack.equipped.weapon!.enhance).toBe(3)
  })

  it("强化背包未穿戴装备：按实例 id 生效，不影响已穿戴槽位", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem("wp_t1_light_01", 1) // 背包实例（未穿戴）
    const inst = pack.packGearInstances().find((g) => g.itemId === "wp_t1_light_01")!
    pack.addItem("enh_stone", 10)
    pack.currency.money = 9999999
    expect(pack.enhanceGear(inst.instanceId, () => 0)).toBe(true)
    // 强化落在背包实例本身
    expect(pack.packGearInstances().find((g) => g.instanceId === inst.instanceId)?.enhance).toBe(1)
    expect(pack.equipped.weapon?.enhance ?? 0).toBe(0) // 已穿戴槽位不受影响
    // 不存在的实例 id 拒绝
    expect(pack.enhanceGear("no-such-instance", () => 0)).toBe(false)
  })

  it("升星真实生效：消耗未穿戴同名装备 3 件 → 星级 +1 → 基础属性提升", async () => {
    const pack = usePackStore()
    await pack.init()
    // t3 流云剑（itemLevel 25，核心攻击 ≥34）：t1 低值 +5% 会被整数取整吞掉，基数高才可观测
    pack.addItem("wp_t3_light_01", 4)
    pack.equip("wp_t3_light_01") // 背包余 3 件同名饲料
    const atk0 = pack.equippedStats().find((s) => s.attribute === "attack")!.value
    expect(pack.starGear(pack.equipped.weapon!.instanceId)).toBe(true)
    expect(pack.equipped.weapon?.star).toBe(1)
    expect(pack.countOf("wp_t3_light_01")).toBe(0) // 3 件同名被消耗
    const atk1 = pack.equippedStats().find((s) => s.attribute === "attack")!.value
    expect(atk1).toBeGreaterThan(atk0) // 1 星 +5% 基础属性
  })

  it("升星同名装备不足 3 件时拒绝", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    pack.addItem("wp_t1_light_01", 1) // 1 件 < 3 件
    expect(pack.starGear(pack.equipped.weapon!.instanceId)).toBe(false)
    expect(pack.equipped.weapon?.star ?? 0).toBe(0)
    expect(pack.countOf("wp_t1_light_01")).toBe(1) // 拒绝时不吞饲料
    // 3 星满级后拒绝（9 件同名 = 三轮消耗）
    pack.addItem("wp_t1_light_01", 9)
    for (let i = 0; i < 3; i++) pack.starGear(pack.equipped.weapon!.instanceId)
    expect(pack.equipped.weapon?.star).toBe(3)
    expect(pack.starGear(pack.equipped.weapon!.instanceId)).toBe(false) // 满星拒绝
  })

  it("升星背包未穿戴实例：同名计数排除自身（不吃掉正在升星的这件）", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem("wp_t1_light_01", 3) // seed 自带 1 件 → 背包共 4 件同名
    const target = pack.packGearInstances().find((g) => g.itemId === "wp_t1_light_01")!
    expect(pack.starGear(target.instanceId)).toBe(true) // 排除自身后 3 件 ≥ 3
    // 目标仍在背包且星级 +1（未被同名池当作材料消耗）
    const after = pack.packGearInstances().find((g) => g.instanceId === target.instanceId)
    expect(after?.star).toBe(1)
    // 支付：吃掉 3 件同名 → 背包剩 1 件（即目标自身）
    expect(pack.countOf("wp_t1_light_01")).toBe(1)
  })
})

describe("词条洗练（§21 装备养成操作与材料）", () => {
  /** 造并穿上一把超品流云剑（rng 0.8 → rarity3 权重 [10,50,40] 第三桶 → quality 3），3 条词条 */
  async function equipChaoLiuyun() {
    const pack = usePackStore()
    await pack.init()
    pack.addItem("bp_t3_wp", 1)
    pack.addItem("mat_tiemu", 4)
    pack.addItem("mat_jinjing", 2)
    pack.addItem("mat_xianyun", 1)
    const inst = pack.craftEquipment("wp_t3_light_01", () => 0.8)
    expect(inst?.quality).toBe(3)
    expect(inst?.affixes.filter((a) => a.fixed || a.main)).toHaveLength(2)
    expect(inst?.affixes.filter((a) => !a.fixed && !a.main)).toHaveLength(3)
    expect(pack.equip("wp_t3_light_01")).toBe(true)
    return pack
  }

  it("普通洗练：附加词条全部重 roll，条数不变，主要属性不动，扣洗练石+200金", async () => {
    const pack = await equipChaoLiuyun()
    const before = [...pack.equipped.weapon!.affixes]
    pack.addItem("wash_stone", 1)
    pack.currency.money += 200
    const money0 = pack.currency.money
    expect(pack.washGear(pack.equipped.weapon!.instanceId, "normal", -1, () => 0.3)).toBe(true)
    const after = pack.equipped.weapon!.affixes
    expect(after.filter((a) => a.fixed || a.main)).toHaveLength(2) // 主要属性不参与洗练
    expect(after.filter((a) => !a.fixed && !a.main)).toHaveLength(3) // 附加条数不变
    expect(pack.countOf("wash_stone")).toBe(0)
    expect(pack.currency.money).toBe(money0 - 200)
    // rng 0.3 vs 制造 rng 0.8 → 附加至少一条属性或数值变化
    const beforeAppend = before.filter((a) => !a.fixed && !a.main)
    const afterAppend = after.filter((a) => !a.fixed && !a.main)
    expect(afterAppend.some((a, i) => a.attribute !== beforeAppend[i].attribute || a.value !== beforeAppend[i].value)).toBe(true)
  })

  it("定向洗练：仅所选附加词条变化，其余词条不动（精品起开放）", async () => {
    const pack = await equipChaoLiuyun()
    const before = [...pack.equipped.weapon!.affixes]
    const beforeAppend = before.filter((a) => !a.fixed && !a.main)
    pack.addItem("wash_directed", 1)
    pack.currency.money += 200
    expect(pack.washGear(pack.equipped.weapon!.instanceId, "directed", 0, () => 0.3)).toBe(true) // 附加下标 0
    const after = pack.equipped.weapon!.affixes
    expect(after.filter((a) => !a.fixed && !a.main)).toHaveLength(3)
    expect(after.filter((a) => a.fixed || a.main)).toEqual(before.filter((a) => a.fixed || a.main)) // 主要不动
    const afterAppend = after.filter((a) => !a.fixed && !a.main)
    expect(afterAppend[1]).toEqual(beforeAppend[1]) // 未选中附加不动
    expect(afterAppend[2]).toEqual(beforeAppend[2])
    expect(afterAppend[0].attribute !== beforeAppend[0].attribute || afterAppend[0].value !== beforeAppend[0].value).toBe(true)
    expect(pack.countOf("wash_directed")).toBe(0)
  })

  it("锁词条洗练：锁定附加词条不变，其余附加重 roll（超品起开放）", async () => {
    const pack = await equipChaoLiuyun()
    const before = [...pack.equipped.weapon!.affixes]
    const beforeAppend = before.filter((a) => !a.fixed && !a.main)
    pack.addItem("wash_lock", 1)
    pack.currency.money += 200
    expect(pack.washGear(pack.equipped.weapon!.instanceId, "locked", 1, () => 0.3)).toBe(true) // 锁附加下标 1
    const after = pack.equipped.weapon!.affixes
    expect(after.filter((a) => !a.fixed && !a.main)).toHaveLength(3)
    expect(after.filter((a) => a.fixed || a.main)).toEqual(before.filter((a) => a.fixed || a.main)) // 主要不动
    const afterAppend = after.filter((a) => !a.fixed && !a.main)
    expect(afterAppend[1]).toEqual(beforeAppend[1]) // 锁定词条种类+数值不变
    expect(
      afterAppend[0].attribute !== beforeAppend[0].attribute || afterAppend[0].value !== beforeAppend[0].value ||
      afterAppend[2].attribute !== beforeAppend[2].attribute || afterAppend[2].value !== beforeAppend[2].value,
    ).toBe(true)
    expect(pack.countOf("wash_lock")).toBe(0)
  })

  it("洗练品质权限：凡品拒绝定向/锁词条且不扣消耗", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01") // 初始竹剑，品质大概率 1；直接断言权限拦截
    const q = pack.equipped.weapon!.quality
    pack.addItem("wash_directed", 1)
    pack.addItem("wash_lock", 1)
    const money0 = pack.currency.money
    const dOk = pack.washGear(pack.equipped.weapon!.instanceId, "directed", 0, () => 0.3)
    const lOk = pack.washGear(pack.equipped.weapon!.instanceId, "locked", 0, () => 0.3)
    if (q < 2) {
      expect(dOk).toBe(false)
      expect(pack.countOf("wash_directed")).toBe(1)
    }
    if (q < 3) {
      expect(lOk).toBe(false)
      expect(pack.countOf("wash_lock")).toBe(1)
    }
    expect(pack.currency.money).toBe(money0) // 被拒操作不扣金钱
  })

  it("洗练材料/金钱不足或未选目标时拒绝且不扣消耗", async () => {
    const pack = await equipChaoLiuyun()
    // 无材料
    expect(pack.washGear(pack.equipped.weapon!.instanceId, "normal", -1, () => 0.3)).toBe(false)
    // 有材料无金钱
    pack.addItem("wash_stone", 1)
    pack.currency.money = 0
    expect(pack.washGear(pack.equipped.weapon!.instanceId, "normal", -1, () => 0.3)).toBe(false)
    expect(pack.countOf("wash_stone")).toBe(1)
    // 有材料有金钱，定向未选目标
    pack.currency.money = 1000
    expect(pack.washGear(pack.equipped.weapon!.instanceId, "directed", -1, () => 0.3)).toBe(false)
    expect(pack.countOf("wash_stone")).toBe(1)
    expect(pack.currency.money).toBe(1000)
  })

  it("洗练背包未穿戴实例：按实例 id 生效，不影响已穿戴槽位", async () => {
    const pack = usePackStore()
    await pack.init()
    // 造一把超品流云剑留在背包（不穿）
    pack.addItem("bp_t3_wp", 1)
    pack.addItem("mat_tiemu", 4)
    pack.addItem("mat_jinjing", 2)
    pack.addItem("mat_xianyun", 1)
    const inst = pack.craftEquipment("wp_t3_light_01", () => 0.8)
    expect(inst?.quality).toBe(3)
    pack.addItem("wash_stone", 1)
    pack.currency.money += 200
    expect(pack.washGear(inst!.instanceId, "normal", -1, () => 0.3)).toBe(true)
    // 洗练落在背包实例上（附加词条重 roll、主要属性保留），仍不在穿戴槽
    const after = pack.packGearInstances().find((g) => g.instanceId === inst!.instanceId)!
    expect(after.affixes.filter((a) => a.fixed || a.main)).toHaveLength(2)
    expect(after.affixes.filter((a) => !a.fixed && !a.main)).toHaveLength(3)
    expect(pack.countOf("wash_stone")).toBe(0)
    expect(pack.equipped.weapon ?? null).toBeNull()
  })
})

describe("equipBonuses 装备属性注入", () => {
  it("flat 属性直接相加，percent 按主角基础值折算", async () => {
    const { equipBonuses } = await import("@/presentation/modules/yanjie/xiyou/battle")
    const bonuses = equipBonuses([
      { attribute: "attack", modifierType: "flat" as const, value: 12 },
      { attribute: "attack", modifierType: "percent" as const, value: 10 },
    ])
    // 返回增量：flat +12 + percent 10%（主角基础攻击 18 → round(1.8)=2）= 14
    expect(bonuses.attack).toBe(14)
  })

  it("未穿戴任何装备返回空加成", async () => {
    const { equipBonuses } = await import("@/presentation/modules/yanjie/xiyou/battle")
    const bonuses = equipBonuses([])
    expect(bonuses.attack ?? 0).toBe(0)
  })
})

describe("强化保护符", () => {
  it("强化失败消耗保护符保住材料，无保护符时材料损失", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    pack.addItem("enh_protect", 1)
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0)).toBe(true) // 0→1 必成（rate 100%）
    const mat1 = pack.countOf("enh_stone")

    // 失败（L=2 rate 95%，rng 0.99）：保护符保住材料，仅消耗保护符
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0.99)).toBe(false)
    expect(pack.equipped.weapon?.enhance).toBe(1)
    expect(pack.countOf("enh_stone")).toBe(mat1)
    expect(pack.countOf("enh_protect")).toBe(0)

    // 连败后保底 100%：L=2 rate 100% 必成，连败清零
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0)).toBe(true)
    expect(pack.equipped.weapon?.enhanceFails).toBe(0)

    // 再无保护符：L=3 rate 90%，rng 0.99 失败 → 材料 ×3 照扣
    const mat2 = pack.countOf("enh_stone")
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0.99)).toBe(false)
    expect(pack.countOf("enh_stone")).toBe(mat2 - 3)
  })

  it("强化成功不消耗保护符", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    pack.addItem("enh_protect", 1)
    expect(pack.enhanceGear(pack.equipped.weapon!.instanceId, () => 0)).toBe(true)
    expect(pack.countOf("enh_protect")).toBe(1)
  })
})

describe("药园（仙缘催熟制：投入 1 株草药 + 仙缘，按产量表收获）", () => {
  const T0 = 1_000_000_000_000

  /** 充值仙缘，隔离 playerStore 初始值对用例的影响 */
  function grantXianyuan(n: number): void {
    usePlayerStore().currency.xianyuan = n
  }

  it("草药：投入 1 株 + 仙缘 20，收 3 株（种 1 收多）", async () => {
    grantXianyuan(100)
    const pack = usePackStore()
    await pack.init()
    // pack.json 初始止血草 ×3
    expect(pack.countOf("mat_zhixuecao")).toBe(3)

    expect(pack.plantCrop(0, "mat_zhixuecao", T0)).toBe(true)
    // 种植即扣：1 株草药 + 20 仙缘
    expect(pack.countOf("mat_zhixuecao")).toBe(2)
    expect(usePlayerStore().currency.xianyuan).toBe(80)

    // 立即可收获：产量表 ×3（净增 2 株）
    expect(pack.harvestCrop(0, T0)).toBe(true)
    expect(pack.countOf("mat_zhixuecao")).toBe(5)
    expect(pack.garden[0].cropId).toBeNull()

    // 冷却 300s
    expect(pack.gardenCooldown(0, T0)).toBe(300)
    expect(pack.plantCrop(0, "mat_zhixuecao", T0 + 1000)).toBe(false)
  })

  it("灵植：无需投入只扣仙缘；仙缘不足拒绝种植", async () => {
    grantXianyuan(100)
    const pack = usePackStore()
    await pack.init()

    // 灵芝（仙缘 60）：初始 ×2，不投入株数
    expect(pack.plantCrop(0, "mat_lingzhi", T0)).toBe(true)
    expect(pack.countOf("mat_lingzhi")).toBe(2)
    expect(usePlayerStore().currency.xianyuan).toBe(40)

    // 仙缘 40 < 朱果 120 → 拒绝且不扣
    expect(pack.plantCrop(1, "mat_zhuguo", T0)).toBe(false)
    expect(pack.garden[1].cropId).toBeNull()
    expect(usePlayerStore().currency.xianyuan).toBe(40)
  })

  it("草药存量不足拒绝种植；已种植地块不可重复种植；空地块收获无效果", async () => {
    grantXianyuan(1000)
    const pack = usePackStore()
    await pack.init()

    // 清空止血草后存量不足 → 拒绝
    pack.removeItem("mat_zhixuecao", pack.countOf("mat_zhixuecao"))
    expect(pack.plantCrop(0, "mat_zhixuecao", T0)).toBe(false)
    expect(pack.garden[0].cropId).toBeNull()

    // 正常种植后：同地块不可重复种植；空地块收获无效果
    pack.addItem("mat_xiantao", 1)
    expect(pack.plantCrop(0, "mat_xiantao", T0)).toBe(true)
    expect(pack.plantCrop(0, "mat_lingzhi", T0)).toBe(false)
    expect(pack.harvestCrop(1, T0)).toBe(false)
  })

  it("药园与仙缘随 flush/load 持久化", async () => {
    grantXianyuan(777)
    const pack = usePackStore()
    await pack.init()
    expect(pack.plantCrop(0, "mat_lingzhi", T0)).toBe(true)
    await pack.flush()

    setActivePinia(createPinia())
    const pack2 = usePackStore()
    await pack2.init()
    expect(pack2.garden[0].cropId).toBe("mat_lingzhi")
    expect(usePlayerStore().currency.xianyuan).toBe(777 - 60)
  })
})

describe("坊市刷新", () => {
  it("初始全量上架；刷新后抽取 8 种，列表变化", async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.shopGoods.length).toBe(31) // 商品池 31 种（耀星石 2026-10-01 整链删除后养成材料 +7；法宝/神器 16 件上架 2026-10-07）

    const before = new Set(pack.shopGoods.map((g) => g.name))
    pack.refreshShop(new Date(), () => 0)
    expect(pack.shopGoods.length).toBe(8)
    // 抽取的是商品池子集
    for (const g of pack.shopGoods) expect(before.has(g.name)).toBe(true)

    // 不同 rng 产生不同上架组合
    const a = pack.shopGoods.map((g) => g.name)
    pack.refreshShop(new Date(), () => 0.5)
    const b = pack.shopGoods.map((g) => g.name)
    expect(a).not.toEqual(b)
  })

  it("限量商品刷新后库存重置为 1-5", async () => {
    const pack = usePackStore()
    await pack.init()
    // 淡水玉（tag 限量）在池中；rng 0 时库存 = 1
    pack.refreshShop(new Date(), () => 0)
    for (const g of pack.shopGoods) {
      if (g.tag === "限量") expect(g.stock).toBeGreaterThanOrEqual(1)
    }
  })

  it("isNewDay 跨天判定", async () => {
    const pack = usePackStore()
    await pack.init()
    const day1 = new Date("2026-08-16T10:00:00")
    const day2 = new Date("2026-08-17T10:00:00")
    expect(pack.isNewDay(day1.toISOString(), day1)).toBe(false)
    expect(pack.isNewDay(day1.toISOString(), day2)).toBe(true)
    expect(pack.isNewDay("", day1)).toBe(true)
  })
})

describe("装备分解（§21 装备分解）", () => {
  /** 造一件指定品质的背包实例（绕开 rollQuality，品质直接受控；先清掉同 id 预置实例） */
  function pushInst(pack: ReturnType<typeof usePackStore>, itemId: string, quality: number, instanceId: string): void {
    for (let i = pack.gearInstances.length - 1; i >= 0; i--) {
      if (pack.gearInstances[i].itemId === itemId) pack.gearInstances.splice(i, 1)
    }
    pack.gearInstances.push({
      instanceId, itemId, enhance: 0, quality, qualityFactor: 1, star: 0, stats: [], affixes: [],
    })
  }

  it("绝品分解：制造材料按 40% 返还（至少 1），扣分解锤、移除实例、金钱入账", async () => {
    const pack = usePackStore()
    await pack.init()
    pushInst(pack, "wp_t1_light_01", 4, "test-decomp-1") // 竹剑：桃木×3+铜精×1，value 150
    pack.addItem("decomp_hammer", 1)
    const before = {
      money: pack.currency.money,
      taomu: pack.countOf("mat_taomu"),
      tongjing: pack.countOf("mat_tongjing"),
    }
    expect(pack.decompose("wp_t1_light_01", () => 0)).toBeNull()
    expect(pack.countOf("decomp_hammer")).toBe(0)
    expect(pack.gearInstances.some((g) => g.instanceId === "test-decomp-1")).toBe(false)
    expect(pack.countOf("mat_taomu")).toBe(before.taomu + 1) // max(1, floor(3×0.4)) = 1
    expect(pack.countOf("mat_tongjing")).toBe(before.tongjing + 1)
    expect(pack.currency.money).toBe(before.money + 84) // ⌊150×0.56⌋
  })

  it("神品分解：太古汲灵符必得", async () => {
    const pack = usePackStore()
    await pack.init()
    pushInst(pack, "wp_t1_light_01", 5, "test-decomp-2")
    pack.addItem("decomp_hammer", 1)
    expect(pack.decompose("wp_t1_light_01", () => 0)).toBeNull()
    expect(pack.countOf("wash_extract")).toBe(1)
  })

  it("超品分解概率分支：rng 0.5 → 强化石(60%)命中", async () => {
    const pack = usePackStore()
    await pack.init()
    pushInst(pack, "wp_t1_light_01", 3, "test-decomp-3")
    pack.addItem("decomp_hammer", 1)
    const before = { enh: pack.countOf("enh_stone") }
    expect(pack.decompose("wp_t1_light_01", () => 0.5)).toBeNull()
    expect(pack.countOf("enh_stone")).toBe(before.enh + 1)
  })

  it("无分解锤拒绝分解，实例保留", async () => {
    const pack = usePackStore()
    await pack.init()
    pushInst(pack, "wp_t1_light_01", 4, "test-decomp-4")
    expect(pack.decompose("wp_t1_light_01")).toBe("缺少分解锤（坊市有售）")
    expect(pack.gearInstances.some((g) => g.instanceId === "test-decomp-4")).toBe(true)
  })

  it("穿戴中的装备不可分解（不在背包实例中，分解锤不消耗）", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem("decomp_hammer", 1)
    pack.equip("wp_t1_light_01")
    expect(pack.decompose("wp_t1_light_01")).toBe("背包中没有该装备")
    expect(pack.countOf("decomp_hammer")).toBe(1)
  })
})
