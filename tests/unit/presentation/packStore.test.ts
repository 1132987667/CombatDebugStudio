// @vitest-environment happy-dom
/**
 * packStore.test.ts — 行囊 store 核心逻辑测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 初始持有量生成、数量增减边界、丢弃限制、仓库存取、扩容、坊市购买、战斗外使用、持久化往返
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePackStore } from '@/presentation/stores/packStore'
import { player as mockPlayer } from '@/presentation/modules/yanjie/games/xiyou/data/mock'
import { currency as mockCurrency } from '@/presentation/modules/yanjie/games/xiyou/data/mock'
import type { XiyouShopGood } from '@/presentation/modules/yanjie/games/xiyou/data/mock'

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
    name: '疗伤丹药',
    type: '丹药',
    price: 50,
    unit: '铜钱',
    stock: 99,
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
  __mem.clear()
  mockCurrency.copper = 12880
  mockCurrency.silver = 36
  mockCurrency.jade = 520
})

describe('初始化', () => {
  it('从 pack.json 生成初始持有量与仓库 12 格', async () => {
    const pack = usePackStore()
    await pack.init()
    // 桃木 ×24 / 疗伤丹药 ×5（pack.json 初始值）
    expect(pack.countOf('mat_001')).toBe(24)
    expect(pack.countOf('elix_001')).toBe(5)
    expect(pack.storage).toHaveLength(12)
    expect(pack.storage[0]).toMatchObject({ itemId: 'mat_009', count: 12 }) // 鹿皮 ×12
    expect(pack.storageCapacity).toBe(12)
  })
})

describe('数量增减', () => {
  it('addItem 累加 / removeItem 递减，归零自动移除', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem('mat_001', 6)
    expect(pack.countOf('mat_001')).toBe(30)
    expect(pack.removeItem('mat_001', 30)).toBe(true)
    expect(pack.countOf('mat_001')).toBe(0)
    expect(pack.ownedItems.some((it) => it.id === 'mat_001')).toBe(false)
  })

  it('removeItem 数量不足返回 false 且不扣', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.removeItem('mat_001', 999)).toBe(false)
    expect(pack.countOf('mat_001')).toBe(24)
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
    expect(pack.discardItem('mat_001')).toBe(true)
    expect(pack.countOf('mat_001')).toBe(0)
  })
})

describe('仓库存取', () => {
  it('存入仓库找空位，数量移出背包；取出回背包', async () => {
    const pack = usePackStore()
    await pack.init()
    const emptyIdx = pack.storage.findIndex((s) => !s.itemId)
    expect(emptyIdx).toBeGreaterThanOrEqual(0)
    expect(pack.moveToStorage('mat_001')).toBe(true)
    expect(pack.countOf('mat_001')).toBe(0)
    const slot = pack.storage[emptyIdx]
    expect(slot.itemId).toBe('mat_001')
    expect(slot.count).toBe(24)
    expect(pack.moveToInventory(emptyIdx)).toBe(true)
    expect(pack.countOf('mat_001')).toBe(24)
    expect(pack.storage[emptyIdx].itemId).toBeNull()
  })

  it('仓库满时存入失败并保留背包数量', async () => {
    const pack = usePackStore()
    await pack.init()
    // 逐个存入直到仓库填满：初始 4 空格，第 5 次应失败
    let ok = true
    let guard = 0
    while (ok && guard < 10) {
      const it = pack.ownedItems.find((i) => pack.countOf(i.id) > 0)
      if (!it) break
      ok = pack.moveToStorage(it.id)
      guard++
    }
    expect(ok).toBe(false)
    expect(pack.storage.every((s) => s.itemId)).toBe(true)
  })
})

describe('仓库扩容', () => {
  it('灵石足够时扩容 +6 格，容量递增；灵石不足拒绝', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.expandCost()).toBe(50)
    expect(pack.expandStorage()).toBe(true)
    expect(pack.storageCapacity).toBe(18)
    expect(pack.currency.jade).toBe(520 - 50)
    // 第二次扩容价格 100
    expect(pack.expandCost()).toBe(100)
  })

  it('扩容至 36 格上限后拒绝', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.currency.jade = 99999
    let guard = 0
    while (pack.storageCapacity < 36 && guard < 10) {
      pack.expandStorage()
      guard++
    }
    expect(pack.storageCapacity).toBe(36)
    expect(pack.expandStorage()).toBe(false)
  })

  it('灵石不足时扩容失败', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.currency.jade = 10
    expect(pack.expandStorage()).toBe(false)
    expect(pack.storageCapacity).toBe(12)
  })
})

describe('货币扣减 spend', () => {
  it('扣减成功并写回 mock.currency；不足返回 false 不扣', async () => {
    const pack = usePackStore()
    await pack.init()
    const before = pack.currency.copper
    expect(pack.spend('copper', 140)).toBe(true)
    expect(pack.currency.copper).toBe(before - 140)
    expect(mockCurrency.copper).toBe(before - 140)
    expect(pack.spend('copper', 99999999)).toBe(false)
    expect(pack.currency.copper).toBe(before - 140)
  })
})

describe('坊市购买', () => {
  it('购买成功：货币扣减、库存减少、背包增加', async () => {
    const pack = usePackStore()
    await pack.init()
    const good = makeGood()
    expect(pack.purchase(good, 2)).toBeNull()
    expect(pack.currency.copper).toBe(12880 - 100)
    expect(good.stock).toBe(97)
    expect(pack.countOf('elix_001')).toBe(5 + 2)
  })

  it('货币不足返回失败且不改变状态', async () => {
    const pack = usePackStore()
    await pack.init()
    const good = makeGood({ price: 999999 })
    expect(pack.purchase(good, 1)).toBe('货币不足')
    expect(pack.currency.copper).toBe(12880)
    expect(pack.countOf('elix_001')).toBe(5)
  })

  it('库存不足返回失败', async () => {
    const pack = usePackStore()
    await pack.init()
    const good = makeGood({ stock: 1 })
    expect(pack.purchase(good, 2)).toBe('库存不足')
    expect(pack.currency.copper).toBe(12880)
  })

  it('无限库存（stock=-1）购买后不递减', async () => {
    const pack = usePackStore()
    await pack.init()
    const good = makeGood({ stock: -1 })
    expect(pack.purchase(good, 3)).toBeNull()
    expect(good.stock).toBe(-1)
  })

  it('灵石商品扣灵石（洗髓丹 3 灵石）', async () => {
    const pack = usePackStore()
    await pack.init()
    // 洗髓丹（elix_perm_05）初始持有 1，再购 2 → 3
    const good = makeGood({ name: '洗髓丹', unit: '灵石', price: 3, stock: 2 })
    expect(pack.purchase(good, 2)).toBeNull()
    expect(pack.currency.jade).toBe(520 - 6)
    expect(pack.countOf('elix_perm_05')).toBe(3)
  })
})

describe('战斗外使用', () => {
  it('永久丹药提升属性并消耗', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem('elix_perm_01', 1) // 培元丹：气血上限 +20
    const before = mockPlayer.maxHp
    expect(pack.useItem('elix_perm_01')).toBe(true)
    expect(mockPlayer.maxHp).toBe(before + 20)
    expect(pack.countOf('elix_perm_01')).toBe(0)
  })

  it('晶球开启获得强化材料', async () => {
    const pack = usePackStore()
    await pack.init()
    // 异矿（mat_enh_01）初始持有 6（pack.json materials），开晶球 +1 → 7
    pack.addItem('crys_001', 1) // 灿金晶球 → 异矿 mat_enh_01
    expect(pack.useItem('crys_001')).toBe(true)
    expect(pack.countOf('crys_001')).toBe(0)
    expect(pack.countOf('mat_enh_01')).toBe(6 + 1)
  })

  it('heal/energy 丹药战斗外不可用（返回 false 且不消耗）', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.useItem('elix_001')).toBe(false)
    expect(pack.countOf('elix_001')).toBe(5)
  })

  it('未实现的永久丹药（洗髓丹）提示暂未开放且不消耗', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.countOf('elix_perm_05')).toBe(1)
    expect(pack.useItem('elix_perm_05')).toBe(false)
    expect(pack.countOf('elix_perm_05')).toBe(1)
  })

  it('canUseOutOfBattle 只对已实现效果放行', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.canUseOutOfBattle('elix_perm_01')).toBe(true) // 培元丹
    expect(pack.canUseOutOfBattle('elix_perm_05')).toBe(false) // 洗髓丹未实现
    expect(pack.canUseOutOfBattle('crys_001')).toBe(true) // 晶球
    expect(pack.canUseOutOfBattle('elix_001')).toBe(false) // 恢复丹战斗外不可用
  })
})

describe('战斗掉落', () => {
  it('命中（random < chance）入包并累计', async () => {
    const pack = usePackStore()
    await pack.init()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    pack.applyDrops([
      { itemId: 'mat_001', quantity: 2, chance: 0.5 },
      { itemId: 'mat_002', quantity: 1, chance: 1 },
    ])
    expect(pack.countOf('mat_001')).toBe(24 + 2)
    expect(pack.countOf('mat_002')).toBe(8 + 1)
  })

  it('未命中（random >= chance）不入包', async () => {
    const pack = usePackStore()
    await pack.init()
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    pack.applyDrops([{ itemId: 'mat_001', quantity: 1, chance: 0.5 }])
    expect(pack.countOf('mat_001')).toBe(24)
  })

  it('无效 itemId / 零 chance 跳过', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.applyDrops([
      { itemId: 'ghost', quantity: 1, chance: 1 },
      { itemId: 'mat_001', quantity: 1, chance: 0 },
    ])
    expect(pack.countOf('mat_001')).toBe(24)
  })
})

describe('持久化', () => {
  it('flush 写入 pack_runtime 文档，load 可恢复', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem('mat_001', 5)
    pack.setQuickSlot(0, 'elix_001')
    pack.moveToStorage('mat_003')
    pack.purchase(makeGood(), 1)
    await pack.flush()

    const doc = __mem.get('xiyou')?.get('pack_runtime') as { data: { inventory: Record<string, number>; storage: unknown[]; quickSlots: (string | null)[]; currency: { copper: number } } }
    expect(doc.data.inventory['mat_001']).toBe(29)
    expect(doc.data.quickSlots[0]).toBe('elix_001')
    expect(doc.data.currency.copper).toBe(12880 - 50)

    // 新 store 实例从 IDB 恢复
    setActivePinia(createPinia())
    const pack2 = usePackStore()
    await pack2.init()
    expect(pack2.countOf('mat_001')).toBe(29)
    expect(pack2.quickSlots[0]).toBe('elix_001')
    expect(pack2.currency.copper).toBe(12880 - 50)
  })

  it('无存档时保持 configs 兜底', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.countOf('mat_001')).toBe(24)
  })
})
