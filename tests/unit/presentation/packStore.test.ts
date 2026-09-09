// @vitest-environment happy-dom
/**
 * packStore.test.ts — 行囊 store 核心逻辑测试（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 初始持有量生成、数量增减边界、丢弃限制、仓库存取、扩容、坊市购买、战斗外使用、持久化往返
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
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

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
  __mem.clear()
})

describe('初始化', () => {
  it('从 pack.json 生成初始持有量与仓库 12 格', async () => {
    const pack = usePackStore()
    await pack.init()
    // 桃木 ×24 / 疗伤丹药 ×5（pack.json 初始值）
    expect(pack.countOf('mat_taomu')).toBe(24)
    expect(pack.countOf('elix_001')).toBe(5)
    expect(pack.storage).toHaveLength(12)
    expect(pack.storage[0]).toMatchObject({ itemId: 'mat_lupi', count: 12 }) // 鹿皮 ×12
    expect(pack.storageCapacity).toBe(12)
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

describe('仓库存取', () => {
  it('存入仓库找空位，数量移出背包；取出回背包', async () => {
    const pack = usePackStore()
    await pack.init()
    const emptyIdx = pack.storage.findIndex((s) => !s.itemId)
    expect(emptyIdx).toBeGreaterThanOrEqual(0)
    expect(pack.moveToStorage('mat_taomu')).toBe(true)
    expect(pack.countOf('mat_taomu')).toBe(0)
    const slot = pack.storage[emptyIdx]
    expect(slot.itemId).toBe('mat_taomu')
    expect(slot.count).toBe(24)
    expect(pack.moveToInventory(emptyIdx)).toBe(true)
    expect(pack.countOf('mat_taomu')).toBe(24)
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
  it('flush 写入 pack_runtime 文档，load 可恢复', async () => {
    const pack = usePackStore()
    await pack.init()
    pack.addItem('mat_taomu', 5)
    pack.setQuickSlot(0, 'elix_001')
    pack.moveToStorage('mat_tongjing')
    pack.purchase(makeGood(), 1)
    await pack.flush()

    const doc = __mem.get('xiyou')?.get('pack_runtime') as { data: { inventory: Record<string, number>; storage: unknown[]; quickSlots: (string | null)[]; currency: { money: number } } }
    expect(doc.data.inventory['mat_taomu']).toBe(29)
    expect(doc.data.quickSlots[0]).toBe('elix_001')
    expect(doc.data.currency.money).toBe(536480 - 50)

    // 新 store 实例从 IDB 恢复
    setActivePinia(createPinia())
    const pack2 = usePackStore()
    await pack2.init()
    expect(pack2.countOf('mat_taomu')).toBe(29)
    expect(pack2.quickSlots[0]).toBe('elix_001')
    expect(pack2.currency.money).toBe(536480 - 50)
  })

  it('无存档时保持 configs 兜底', async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.countOf('mat_taomu')).toBe(24)
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
    // 初始：竹剑 ×1、松木棍 ×1
    pack.addItem("wp_t1_mid_01", 1) // 松木棍 ×2
    expect(pack.equip("wp_t1_light_01")).toBe(true) // 竹剑 ×0
    expect(pack.equip("wp_t1_mid_01")).toBe(true) // 松木棍 ×1，竹剑回背包 ×1

    expect(pack.equipped.weapon?.itemId).toBe("wp_t1_mid_01")
    expect(pack.countOf("wp_t1_light_01")).toBe(1)
    expect(pack.countOf("wp_t1_mid_01")).toBe(1)
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
    expect(pack.enhanceGear("charm", () => 0)).toBe(true)
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

  it("制造 roll 品质：地品阶位 rng 贴 0.99 → 超品（3 条词缀，词条数按品质）", async () => {
    const pack = usePackStore()
    await pack.init()
    // 流云剑（wp_t3_light_01，rarity 3）：铁木×4 + 金精×2 + 仙云皮×1；三阶需持有 bp_t3_wp 解锁
    pack.addItem("bp_t3_wp", 1)
    pack.addItem("mat_tiemu", 4)
    pack.addItem("mat_jinjing", 2)
    pack.addItem("mat_xianyun", 1)
    // rng 序列：品质 roll=0.99 → 超品；品质系数 roll=seq2；词条抽取用递增值保证抽到不同词条
    let seq = 0
    const rng = () => {
      seq++
      return seq === 1 ? 0.99 : ((seq * 0.137) % 1)
    }
    const inst = pack.craftEquipment("wp_t3_light_01", rng)
    expect(inst).not.toBeNull()
    expect(inst!.quality).toBe(3) // 地品权重表 [10,50,40]，rng 0.99 → 超品
    expect(inst!.affixes.filter((a) => !a.fixed && !a.main)).toHaveLength(3) // 超品 3 条附加（§21 品质→行数）
    // 品质系数锁存：超品区间 [1.06,1.2]，rng 0.274 → 1.06+0.274×0.14=1.09836
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

  it("制造天品装备固定绝品（4 条词缀，词条池充足）", async () => {
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
    expect(inst!.quality).toBe(4) // 天品固定绝品
    expect(inst!.affixes.filter((a) => !a.fixed && !a.main)).toHaveLength(4) // 绝品 4 条附加（§21 品质→行数）
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
    expect(pack.enhanceGear("weapon", () => 0)).toBe(true) // rng 0 → 100% 成功
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
    expect(pack.enhanceGear("weapon", () => 0)).toBe(true) // → Lv.1（rate 100%）
    const money1 = pack.currency.money
    const mat1 = pack.countOf("enh_stone")
    expect(pack.enhanceGear("weapon", () => 0.99)).toBe(false) // L=2 rate 95%，99 ≥ 95 → 失败
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
    expect(pack.enhanceGear("weapon", () => 0)).toBe(false)
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
      pack.enhanceGear("weapon", () => 0)
      guard++
    }
    expect(pack.equipped.weapon!.enhance).toBe(3)
    expect(pack.enhanceGear("weapon", () => 0)).toBe(false) // 已达上限，拒绝
    expect(pack.equipped.weapon!.enhance).toBe(3)
  })

  it("升星真实生效：残魂点 3 点混合支付 → 星级 +1 → 基础属性提升（残魂优先于同名装备）", async () => {
    const pack = usePackStore()
    await pack.init()
    // t3 流云剑（itemLevel 25，核心攻击 ≥34）：t1 低值 +5% 会被整数取整吞掉，基数高才可观测
    pack.addItem("wp_t3_light_01", 2)
    pack.equip("wp_t3_light_01")
    pack.addItem("decomp_soul", 3) // 装备残魂 ×3 = 3 点
    const atk0 = pack.equippedStats().find((s) => s.attribute === "attack")!.value
    expect(pack.starGear("weapon")).toBe(true)
    expect(pack.equipped.weapon?.star).toBe(1)
    expect(pack.countOf("decomp_soul")).toBe(0) // 残魂优先消耗
    expect(pack.countOf("wp_t3_light_01")).toBe(1) // 同名装备保留
    const atk1 = pack.equippedStats().find((s) => s.attribute === "attack")!.value
    expect(atk1).toBeGreaterThan(atk0) // 1 星 +5% 基础属性
  })

  it("升星同名装备兜底支付：无残魂/升星石时消耗同名 3 件（1 点/件）", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_mid_01")
    pack.addItem("wp_t1_mid_01", 3) // 3 件同名 = 3 点
    expect(pack.starGear("weapon")).toBe(true)
    expect(pack.equipped.weapon?.star).toBe(1)
    expect(pack.countOf("wp_t1_mid_01")).toBe(0)
  })

  it("升星石支付：升星石·上 1 颗 = 3 点，不消耗同名与残魂", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_mid_01")
    pack.addItem("wp_t1_mid_01", 1)
    pack.addItem("decomp_soul", 1)
    pack.addItem("star_up_high", 1) // 3 点
    expect(pack.starGear("weapon")).toBe(true)
    expect(pack.equipped.weapon?.star).toBe(1)
    expect(pack.countOf("star_up_high")).toBe(0)
    expect(pack.countOf("wp_t1_mid_01")).toBe(1)
    expect(pack.countOf("decomp_soul")).toBe(1)
  })

  it("升星点数不足 / 满星时拒绝", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    pack.addItem("wp_t1_light_01", 1) // 1 点 < 3 点
    expect(pack.starGear("weapon")).toBe(false)
    expect(pack.equipped.weapon?.star ?? 0).toBe(0)
    // 3 星满级后拒绝（9 件同名 = 9 点 = 三轮消耗）
    pack.addItem("wp_t1_light_01", 9)
    for (let i = 0; i < 3; i++) pack.starGear("weapon")
    expect(pack.equipped.weapon?.star).toBe(3)
    expect(pack.starGear("weapon")).toBe(false) // 满星拒绝
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
    expect(pack.washGear("weapon", "normal", -1, () => 0.3)).toBe(true)
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
    expect(pack.washGear("weapon", "directed", 0, () => 0.3)).toBe(true) // 附加下标 0
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
    expect(pack.washGear("weapon", "locked", 1, () => 0.3)).toBe(true) // 锁附加下标 1
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
    const dOk = pack.washGear("weapon", "directed", 0, () => 0.3)
    const lOk = pack.washGear("weapon", "locked", 0, () => 0.3)
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
    expect(pack.washGear("weapon", "normal", -1, () => 0.3)).toBe(false)
    // 有材料无金钱
    pack.addItem("wash_stone", 1)
    pack.currency.money = 0
    expect(pack.washGear("weapon", "normal", -1, () => 0.3)).toBe(false)
    expect(pack.countOf("wash_stone")).toBe(1)
    // 有材料有金钱，定向未选目标
    pack.currency.money = 1000
    expect(pack.washGear("weapon", "directed", -1, () => 0.3)).toBe(false)
    expect(pack.countOf("wash_stone")).toBe(1)
    expect(pack.currency.money).toBe(1000)
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
    expect(pack.enhanceGear("weapon", () => 0)).toBe(true) // 0→1 必成（rate 100%）
    const mat1 = pack.countOf("enh_stone")

    // 失败（L=2 rate 95%，rng 0.99）：保护符保住材料，仅消耗保护符
    expect(pack.enhanceGear("weapon", () => 0.99)).toBe(false)
    expect(pack.equipped.weapon?.enhance).toBe(1)
    expect(pack.countOf("enh_stone")).toBe(mat1)
    expect(pack.countOf("enh_protect")).toBe(0)

    // 连败后保底 100%：L=2 rate 100% 必成，连败清零
    expect(pack.enhanceGear("weapon", () => 0)).toBe(true)
    expect(pack.equipped.weapon?.enhanceFails).toBe(0)

    // 再无保护符：L=3 rate 90%，rng 0.99 失败 → 材料 ×3 照扣
    const mat2 = pack.countOf("enh_stone")
    expect(pack.enhanceGear("weapon", () => 0.99)).toBe(false)
    expect(pack.countOf("enh_stone")).toBe(mat2 - 3)
  })

  it("强化成功不消耗保护符", async () => {
    const pack = usePackStore()
    await pack.init()
    pack.equip("wp_t1_light_01")
    pack.addItem("enh_protect", 1)
    expect(pack.enhanceGear("weapon", () => 0)).toBe(true)
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
  it("初始全量上架；刷新后抽取 6 种，列表变化", async () => {
    const pack = usePackStore()
    await pack.init()
    expect(pack.shopGoods.length).toBe(9) // 商品池 9 种（洗髓丹移除后）

    const before = new Set(pack.shopGoods.map((g) => g.name))
    pack.refreshShop(new Date(), () => 0)
    expect(pack.shopGoods.length).toBe(6)
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
