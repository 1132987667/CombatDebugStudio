/**
 * packStore.ts — 行囊（背包/仓库/坊市/快捷栏）运行时状态（Pinia Composition API）
 *
 * 设计要点（对照 documents/演劫台/修改意见.md 方案二）：
 * - 目录静态源：items.json（经 mock.ts 的 packItems 全量索引）；持有量（inventory）为运行时状态
 * - 初始持有量：pack.json 的 materials/equipment/pills/consumables 按 name 匹配 items.json 生成
 * - 持久化：封神榜 xiyou 表 id='pack_runtime'（复用现有方案 B 存储路径），防抖 500ms
 * - 货币：引用 playerStore.currency（顶栏/坊市同一货币口径）
 * - 战斗联动：useInBattle 经 BattleSystem.getBuffSystem() 注入 requestHeal/requestEnergy/addBuff
 */

import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { XiyouCatalogItem, XiyouCurrency, XiyouGardenCrop, XiyouPlayer, XiyouShopGood } from '@/presentation/modules/yanjie/xiyou/types'
import {
  equipmentCatalog,
  materials,
  equipment,
  packItems,
  pills,
  consumables,
  storageCells,
  grantPillPoint,
  gardenCrops,
  shopGoods as shopPool,
} from '@/presentation/modules/yanjie/xiyou/xiyouData'
import type { EquipmentAffixData, EquipmentData } from '@/domain/fengshen/types'
import type { XiyouData } from '@/domain/fengshen/types'
import type { EnemyDrop } from '@/shared/types/enemy'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import equipmentAffixesJson from '@configs/equipment/equipment-affixes.json'
import { affixAppliesTo, rollAffixStat, rollEquipmentAffix } from '@/shared/utils/equipmentAffix'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import {
  enhanceCost,
  enhanceFactor,
  enhanceMaterialOf,
  enhanceMaxByRarity,
  enhanceSuccessRate,
  STAR_MAX,
  starCost,
} from '@/presentation/modules/yanjie/xiyou/caveLogic'
import { affixCountByQuality, qualityFactorOf, rollQuality, rollQualityFactor } from '@/presentation/modules/yanjie/xiyou/quality'
import { useNotificationStore } from './notificationStore'
import { useBattleStore } from './battleStore'
import { usePlayerStore } from './playerStore'

/** 仓库格子（itemId=null 表示空位） */
export interface StorageSlot {
  itemId: string | null
  count: number
}

/** 药园地块（运行时）：cropId 非空 = 已种植可收获；cropId 空且 cooldownUntil 未到 = 冷却中 */
export interface GardenPlot {
  cropId: string | null
  cooldownUntil: number | null
}

/** 装备槽位键（六类装备槽，对齐 equipment.json slot：weapon/armor/helmet/boots/charm/ring） */
export type GearSlotKey = 'weapon' | 'armor' | 'helmet' | 'boots' | 'charm' | 'ring'

/** 装备槽位展示名（EquipPanel 用） */
export const GEAR_SLOT_LABELS: Record<GearSlotKey, string> = {
  weapon: '武器',
  armor: '衣服',
  helmet: '头盔',
  boots: '靴子',
  charm: '护符',
  ring: '戒指',
}

/** 装备词条（实例化：制造时从 equipment-affixes.json 抽取并锁定数值） */
export interface GearAffix {
  id: string
  attribute: string
  modifierType: 'flat' | 'percent'
  value: number
}

/** 装备实例（唯一 id；词缀 / 强化等级 / 品质 / 品质系数为实例属性，独立于 equipment.json 静态定义） */
export interface GearInstance {
  instanceId: string
  itemId: string
  enhance: number
  /** 品质（1-5 → 凡/精/超/绝/神，制造/掉落时 roll；决定词条数量与基础属性系数） */
  quality: number
  /** 品质系数（制造时品质区间内 roll 并锁存；旧档/未锁定实例用区间中值兜底） */
  qualityFactor: number
  /** 星级（0-3，设计稿补充-装备 §8：每星基础属性 +10%）；升星消耗同名装备 + 魂玉 */
  star: number
  affixes: GearAffix[]
}

/** 装备词条库（equipment-affixes.json 静态索引，模块级构建一次） */
const EQUIP_AFFIXES = equipmentAffixesJson as unknown as EquipmentAffixData[]

/** 随机数生成器（可注入做确定性测试） */
export type Rng = () => number

/** 装备实例唯一 id（优先 crypto.randomUUID，降级时间戳+随机） */
export function newInstanceId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** 创建装备实例（默认无词缀、enhance 0、品质 1 凡品、系数取品质区间中值） */
export function makeInstance(
  itemId: string,
  affixes: GearAffix[] = [],
  enhance = 0,
  quality = 1,
  qualityFactor = qualityFactorOf(quality),
  star = 0,
): GearInstance {
  return { instanceId: newInstanceId(), itemId, enhance, quality, qualityFactor, star, affixes }
}

/** 行囊运行时持久化快照（xiyou 表 pack_runtime 文档的 data；v3 新增实例 quality/qualityFactor） */
export interface PackRuntimeSnapshot {
  version: 4
  inventory: Record<string, number>
  storage: StorageSlot[]
  quickSlots: (string | null)[]
  currency: XiyouCurrency
  /** 背包中未穿戴的装备实例 */
  gearInstances: GearInstance[]
  /** 已穿戴装备（槽位 → 实例，缺省未穿戴） */
  equipped?: Partial<Record<GearSlotKey, GearInstance>>
  /** 药园地块（v4） */
  garden?: GardenPlot[]
  /** 坊市当前上架商品（v4） */
  shopGoods?: XiyouShopGood[]
  /** 坊市上次刷新时间（v4，ISO） */
  shopRefreshedAt?: string
  updatedAt: string
}

const PACK_RUNTIME_ID = 'pack_runtime'
const QUICK_SLOT_COUNT = 4
const STORAGE_BASE = 12
const STORAGE_EXPAND_STEP = 6
const MAX_STORAGE = 36
/** 扩容消耗（灵石），按扩容次数取档 */
const EXPAND_COSTS = [50, 100, 200, 400]

/** 药园地块数量（对齐 cave.json crops 六格） */
const GARDEN_PLOT_COUNT = 6
/** 坊市每轮上架商品数量（从商品池随机抽取） */
const SHOP_PICK_COUNT = 6
/** 强化保护符物品 id（强化失败时消耗一张保住材料） */
const ENH_PROTECT_ID = 'enh_protect'

/** 坊市货币单位 → 货币字段 */
const UNIT_KEY: Record<XiyouShopGood['unit'], keyof XiyouCurrency> = {
  铜钱: 'copper',
  银两: 'silver',
  灵石: 'jade',
}

/** 目录索引（items.json 静态，模块级构建一次） */
const catalogMap = new Map<string, XiyouCatalogItem>()
const nameToId = new Map<string, string>()
for (const it of packItems) {
  catalogMap.set(it.id, it)
  if (!nameToId.has(it.name)) nameToId.set(it.name, it.id)
}

/** 玩家数值属性键（name/title 等字符串属性不可参与加减） */
type NumericPlayerKey = {
  [K in keyof XiyouPlayer]: XiyouPlayer[K] extends number ? K : never
}[keyof XiyouPlayer]

/** 永久丹药效果表（items.json 未给 effects，此处按《全物品文档-8.16》第四章补齐，供战斗外使用） */
const PERM_PILL_EFFECTS: Record<string, { attrs: Array<{ attr: NumericPlayerKey; value: number }>; label: string }> = {
  // 铁骨丹 防御+5
  elix_perm_01: { attrs: [{ attr: 'defense', value: 5 }], label: '防御' },
  // 灵犀丹 速度+3
  elix_perm_02: { attrs: [{ attr: 'speed', value: 3 }], label: '速度' },
  // 破境丹 攻击+5
  elix_perm_03: { attrs: [{ attr: 'attackMin', value: 5 }], label: '攻击' },
  // 固本丹 气血+30
  elix_perm_04: { attrs: [{ attr: 'maxHp', value: 30 }], label: '气血上限' },
  // 洗髓丹 全属性+2
  elix_perm_05: { attrs: [
    { attr: 'maxHp', value: 2 },
    { attr: 'attackMin', value: 2 },
    { attr: 'defense', value: 2 },
    { attr: 'speed', value: 2 },
  ], label: '全属性' },
}

/** 晶球开启产出（crys_* → 强化材料 mat_enh_*） */
const ORB_DROPS: Record<string, string[]> = {
  crys_001: ['mat_yikuang'],
  crys_002: ['mat_yikuang'],
  crys_003: ['mat_yikuang'],
  crys_004: ['mat_lingqi'],
  crys_005: ['mat_lingqi'],
  crys_006: ['mat_lingqi'],
  crys_007: ['mat_lingshui'],
  crys_008: ['mat_lingshui'],
  crys_009: ['mat_lingshui'],
  crys_010: ['mat_yikuang'],
  crys_011: ['mat_yikuang'],
  crys_012: ['mat_lingqi'],
  crys_013: ['mat_lingqi'],
  crys_014: ['mat_lingshui'],
  crys_015: ['mat_lingshui'],
}

/** 悟道丹物品 id（items.json；服用 +1 技能点，全存档最多 10 颗，需求 §2.1.2） */
const WUDAO_PILL_ID = 'mat_wudao_dan'

export const usePackStore = defineStore('pack', () => {
  const notification = useNotificationStore()
  const playerStore = usePlayerStore()

  /** 背包持有量：itemId → count（仅记录 >0 的条目；装备不在此列，见 gearInstances） */
  const inventory = ref<Record<string, number>>({})
  /** 仓库格子（长度即容量） */
  const storage = ref<StorageSlot[]>([])
  /** 快捷栏（固定 4 格，存 itemId） */
  const quickSlots = ref<(string | null)[]>(Array(QUICK_SLOT_COUNT).fill(null))
  /** 背包中未穿戴的装备实例（制造 / 掉落 / 初始装备均实例化） */
  const gearInstances = ref<GearInstance[]>([])
  /** 已穿戴装备：槽位 → 实例（穿戴从 gearInstances 移出，卸下回填） */
  const equipped = reactive<Partial<Record<GearSlotKey, GearInstance>>>({})
  /** 货币（引用 playerStore 同一对象，变更即全局一致） */
  const currency = playerStore.currency
  /** 药园地块（种植/收获运行时） */
  const garden = ref<GardenPlot[]>([])
  /** 坊市当前上架商品（运行时副本，刷新时从商品池抽取） */
  const shopGoods = ref<XiyouShopGood[]>([])
  /** 坊市上次刷新时间（ISO） */
  const shopRefreshedAt = ref('')

  /** 目录查询 */
  function catalogById(itemId: string | null | undefined): XiyouCatalogItem | undefined {
    return itemId ? catalogMap.get(itemId) : undefined
  }

  function countOf(itemId: string): number {
    if (gearById(itemId)) return gearCount(itemId)
    return inventory.value[itemId] ?? 0
  }

  /** 装备持有量：背包中未穿戴实例数（穿戴上即不计入，与"扣背包一件"语义一致） */
  function gearCount(itemId: string): number {
    return gearInstances.value.filter((g) => g.itemId === itemId).length
  }

  /** 持有多大的"拥有物品"列表（count > 0） */
  const ownedItems = computed(() => {
    const has = new Set<string>()
    for (const [id, c] of Object.entries(inventory.value)) if (c > 0) has.add(id)
    for (const g of gearInstances.value) has.add(g.itemId)
    return packItems.filter((it) => has.has(it.id))
  })
  const storageCapacity = computed(() => storage.value.length)

  // ════════════ 持久化 ════════════
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void flush()
    }, 500)
  }

  async function flush(): Promise<void> {
    // 未 init（从未打开行囊）时跳过：避免把空快照写入覆盖 configs 初始持有
    if (!initialized) return
    const snapshot: PackRuntimeSnapshot = {
      version: 4,
      inventory: { ...inventory.value },
      storage: storage.value.map((s) => ({ itemId: s.itemId, count: s.count })),
      quickSlots: [...quickSlots.value],
      currency: { copper: currency.copper, silver: currency.silver, jade: currency.jade },
      gearInstances: gearInstances.value.map((g) => ({
        instanceId: g.instanceId,
        itemId: g.itemId,
        enhance: g.enhance,
        quality: g.quality,
        qualityFactor: g.qualityFactor,
        star: g.star ?? 0,
        affixes: g.affixes.map((a) => ({ ...a })),
      })),
      equipped: Object.fromEntries(
        (Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[])
          .filter((slot) => equipped[slot])
          .map((slot) => [slot, equipped[slot]] as [GearSlotKey, GearInstance]),
      ) as Partial<Record<GearSlotKey, GearInstance>>,
      garden: garden.value.map((p) => ({ cropId: p.cropId, cooldownUntil: p.cooldownUntil })),
      shopGoods: shopGoods.value.map((g) => ({ ...g })),
      shopRefreshedAt: shopRefreshedAt.value,
      updatedAt: new Date().toISOString(),
    }
    try {
      await persistentStorage.set(FENGSHEN_STORE.XIYOU, PACK_RUNTIME_ID, {
        id: PACK_RUNTIME_ID,
        name: '行囊运行时',
        data: snapshot,
        updatedAt: snapshot.updatedAt,
      } satisfies XiyouData)
    } catch {
      notification.toast('行囊数据保存失败', 'error')
    }
  }

  async function load(): Promise<void> {
    try {
      const doc = await persistentStorage.get<XiyouData>(FENGSHEN_STORE.XIYOU, PACK_RUNTIME_ID)
      const snap = doc?.data as PackRuntimeSnapshot | undefined
      if (!snap?.inventory) return
      inventory.value = { ...snap.inventory }
      // NOTE: v1 旧档装备计数在 inventory 中；升级到实例模型前先迁移（幂等：仅当快照无 gearInstances 时）
      if (!Array.isArray(snap.gearInstances) || snap.gearInstances.length === 0) {
        const migrated = new Map<string, number>()
        for (const [id, count] of Object.entries(inventory.value)) {
          if (gearById(id)) {
            migrated.set(id, count)
            delete inventory.value[id]
          }
        }
        const gear: GearInstance[] = []
        for (const [id, count] of migrated) {
          for (let i = 0; i < count; i++) gear.push(makeInstance(id, [], 0))
        }
        gearInstances.value = gear
      }
      if (Array.isArray(snap.storage)) {
        storage.value = snap.storage.map((s) => ({ itemId: s.itemId, count: s.count ?? 0 }))
      }
      if (Array.isArray(snap.quickSlots)) {
        quickSlots.value = [...snap.quickSlots.slice(0, QUICK_SLOT_COUNT)]
        while (quickSlots.value.length < QUICK_SLOT_COUNT) quickSlots.value.push(null)
      }
      if (snap.currency) {
        currency.copper = snap.currency.copper
        currency.silver = snap.currency.silver
        currency.jade = snap.currency.jade
      }
      // NOTE: v1 旧档 equipped 为槽位 → itemId；升级为实例（无词缀、enhance 0、凡品）。v2 起存实例。
      //       三槽时代的 accessory 键迁移到六槽 charm（对齐 save-bridge 的 accessory → charm 映射）。
      if (snap.equipped) {
        const legacy = Object.entries(snap.equipped) as [string, unknown][]
        const shifted = new Map<string, unknown>()
        for (const [key, raw] of legacy) {
          if (key === 'accessory' && raw) shifted.set('charm', raw)
          else if (raw) shifted.set(key, raw)
        }
        for (const [key, raw] of shifted) {
          if (!(key in GEAR_SLOT_LABELS)) continue
          const slot = key as GearSlotKey
          if (typeof raw === 'string') equipped[slot] = makeInstance(raw, [], 0)
          else if (raw && typeof raw === 'object' && 'itemId' in raw) {
            const g = raw as Partial<GearInstance>
            const quality = Number.isInteger(g.quality) && (g.quality as number) >= 1 && (g.quality as number) <= 5 ? (g.quality as number) : 1
            equipped[slot] = {
              instanceId: g.instanceId ?? newInstanceId(),
              itemId: g.itemId as string,
              enhance: Number.isFinite(g.enhance) ? (g.enhance as number) : 0,
              quality,
              qualityFactor: Number.isFinite(g.qualityFactor) ? (g.qualityFactor as number) : qualityFactorOf(quality),
              star: Number.isInteger(g.star) && (g.star as number) >= 0 ? (g.star as number) : 0,
              affixes: Array.isArray(g.affixes) ? g.affixes.map((a) => ({ ...a })) : [],
            }
          }
        }
      }
      if (Array.isArray(snap.gearInstances)) {
        gearInstances.value = snap.gearInstances
          .filter((g): g is GearInstance => !!g && typeof g.itemId === 'string')
          .map((g) => ({
            instanceId: g.instanceId ?? newInstanceId(),
            itemId: g.itemId,
            enhance: Number.isFinite(g.enhance) ? g.enhance : 0,
            quality: Number.isInteger(g.quality) && g.quality >= 1 && g.quality <= 5 ? g.quality : 1,
            qualityFactor: Number.isFinite(g.qualityFactor) ? g.qualityFactor : qualityFactorOf(g.quality ?? 1),
            star: Number.isInteger(g.star) && (g.star as number) >= 0 ? (g.star as number) : 0,
            affixes: Array.isArray(g.affixes) ? g.affixes.map((a) => ({ ...a })) : [],
          }))
      }
      // v4 药园：恢复地块（缺省补满空置地块）
      garden.value = Array.from({ length: GARDEN_PLOT_COUNT }, (_, i) => {
        const p = Array.isArray(snap.garden) ? snap.garden[i] : undefined
        return { cropId: p?.cropId ?? null, cooldownUntil: p?.cooldownUntil ?? null }
      })
      // v4 坊市：恢复上架商品（缺省保持 buildFromConfigs 的池兜底）
      if (Array.isArray(snap.shopGoods) && snap.shopGoods.length > 0) {
        shopGoods.value = snap.shopGoods.map((g) => ({ ...g }))
      }
      shopRefreshedAt.value = snap.shopRefreshedAt ?? shopRefreshedAt.value
    } catch {
      // IDB 不可用/损坏时保持 configs 兜底
    }
  }

  /** 仅储存了 name 和 count */
  function buildFromConfigs(): void {
    const inv: Record<string, number> = {}
    for (const group of [materials, pills, consumables]) {
      for (const item of group) {
        const id = nameToId.get(item.name)
        if (id) inv[id] = item.count
      }
    }
    inventory.value = inv

    // 装备组：每件生成一个实例（无词缀、enhance 0）
    const gear: GearInstance[] = []
    for (const item of equipment) {
      const id = nameToId.get(item.name)
      if (id && gearById(id)) {
        for (let i = 0; i < item.count; i++) gear.push(makeInstance(id, [], 0))
      }
    }
    gearInstances.value = gear

    storage.value = storageCells.map((cell) => {
      if (cell.locked || !cell.name || cell.name === '空位') return { itemId: null, count: 0 }
      const id = nameToId.get(cell.name)
      return id ? { itemId: id, count: cell.count } : { itemId: null, count: 0 }
    })

    garden.value = Array.from({ length: GARDEN_PLOT_COUNT }, () => ({ cropId: null, cooldownUntil: null }))
    shopGoods.value = shopPool.map((g) => ({ ...g }))
    shopRefreshedAt.value = new Date().toISOString()
  }

  let initialized = false

  /** 初始化（幂等）：configs 兜底 + IDB 覆盖 */
  async function init(): Promise<void> {
    if (initialized) return
    initialized = true
    buildFromConfigs()
    await load()
    // 每日自动刷新：跨天则重抽坊市商品（静默，避免 init 时打扰）
    if (isNewDay(shopRefreshedAt.value)) refreshShop(new Date(), Math.random, true)
  }

  // ════════════ 装备（实例化模型） ════════════

  /** 装备定义查询（equipment.json 唯一权威；不在目录内返回 undefined） */
  function gearById(itemId: string): EquipmentData | undefined {
    return equipmentCatalog.find((g) => g.id === itemId)
  }

  /** 装备对应的槽位键（weapon/armor/helmet/boots/charm/ring）；非装备返回 null */
  function slotKeyOf(itemId: string): GearSlotKey | null {
    return gearById(itemId)?.slot ?? null
  }

  /** 当前槽位已穿戴的装备定义（基础属性，不含强化/词缀） */
  function equippedGear(slot: GearSlotKey): EquipmentData | undefined {
    const inst = equipped[slot]
    return inst ? gearById(inst.itemId) : undefined
  }

  /** 当前槽位已穿戴的装备实例（含强化等级与词缀；未穿戴返回 null） */
  function equippedInstance(slot: GearSlotKey): GearInstance | null {
    return equipped[slot] ?? null
  }

  /** 穿戴装备实例：从背包移入槽位（同槽旧装备自动卸下回背包） */
  function equipInstance(instanceId: string): boolean {
    const idx = gearInstances.value.findIndex((g) => g.instanceId === instanceId)
    if (idx < 0) {
      notification.toast('背包中没有该装备')
      return false
    }
    const inst = gearInstances.value[idx]
    const slot = slotKeyOf(inst.itemId)
    if (!slot) {
      notification.toast('该物品不可穿戴')
      return false
    }
    // 同槽旧装备先卸下回背包
    const old = equipped[slot]
    if (old) gearInstances.value.push(old)
    equipped[slot] = inst
    gearInstances.value.splice(idx, 1)
    scheduleSave()
    notification.toast(`已穿戴「${gearById(inst.itemId)?.name ?? inst.itemId}」`, 'success')
    return true
  }

  /** 穿戴装备（按物品 id）：取背包中该装备一件实例穿戴；无实例时从 inventory 遗留计数件生成（v1 兼容） */
  function equip(itemId: string): boolean {
    const slot = slotKeyOf(itemId)
    if (!slot) {
      notification.toast('该物品不可穿戴')
      return false
    }
    const inst = gearInstances.value.find((g) => g.itemId === itemId)
    if (inst) return equipInstance(inst.instanceId)
    if ((inventory.value[itemId] ?? 0) > 0) {
      inventory.value[itemId]! -= 1
      if (inventory.value[itemId]! <= 0) delete inventory.value[itemId]
      const old = equipped[slot]
      if (old) gearInstances.value.push(old)
      equipped[slot] = makeInstance(itemId, [], 0)
      scheduleSave()
      notification.toast(`已穿戴「${gearById(itemId)?.name ?? itemId}」`, 'success')
      return true
    }
    notification.toast('背包中没有该装备')
    return false
  }

  /** 背包实例装备列表（未穿戴） */
  function packGearInstances(): GearInstance[] {
    return [...gearInstances.value]
  }

  /** 卸载装备：槽位清空 → 实例回背包 */
  function unequip(slot: GearSlotKey): boolean {
    const inst = equipped[slot]
    if (!inst) return false
    delete equipped[slot]
    gearInstances.value.push(inst)
    scheduleSave()
    notification.toast(`已卸下「${gearById(inst.itemId)?.name ?? inst.itemId}」`, 'success')
    return true
  }

  /** 实例最终属性（基础 stats × 品质系数 × 强化倍率 + 词缀；未穿戴/未定义返回空） */
  function instanceStats(inst: GearInstance): EquipmentData['stats'] {
    const g = gearById(inst.itemId)
    if (!g) return []
    // 基础属性 = 原始 × 品质系数 × 强化倍率 × 星级倍率（设计稿 §8.1：每星 +10%）
    const factor = inst.qualityFactor * enhanceFactor(inst.enhance) * (1 + 0.1 * (inst.star ?? 0))
    const base = g.stats.map((s) => ({ ...s, value: Math.round(s.value * factor) }))
    const affixStats: EquipmentData['stats'] = inst.affixes.map((a) => ({
      attribute: a.attribute,
      modifierType: a.modifierType,
      value: a.value,
    }))
    return [...base, ...affixStats]
  }

  /** 已穿戴装备的 stats 汇总（供 buildBattleTeams 注入主角与属性面板重算，未穿戴返回空） */
  function equippedStats(): EquipmentData['stats'] {
    const out: EquipmentData['stats'] = []
    for (const slot of Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]) {
      const inst = equipped[slot]
      if (inst) out.push(...instanceStats(inst))
    }
    return out
  }

  /** 强化当前槽位装备：扣材料与金钱 → 成功率判定 → 强化等级 +1（失败只扣消耗） */
  function enhanceGear(slot: GearSlotKey, rng: Rng = Math.random): boolean {
    const inst = equipped[slot]
    const g = inst ? gearById(inst.itemId) : undefined
    if (!inst || !g) {
      notification.toast('该槽位未穿戴装备')
      return false
    }
    const maxEnhance = enhanceMaxByRarity(g.rarity)
    if (inst.enhance >= maxEnhance) {
      notification.toast('已达强化上限')
      return false
    }
    const mat = enhanceMaterialOf(slot)
    if (!mat) {
      notification.toast('该部位暂不支持强化')
      return false
    }
    if ((inventory.value[mat.itemId] ?? 0) < mat.count) {
      notification.toast(`强化材料不足（需要「${mat.name}」×${mat.count}）`, 'warning')
      return false
    }
    const cost = enhanceCost(inst.enhance, g.rarity)
    if (currency.copper < cost) {
      notification.toast(`铜钱不足（需要 ${cost}）`, 'warning')
      return false
    }
    inventory.value[mat.itemId] = (inventory.value[mat.itemId] ?? 0) - mat.count
    if (inventory.value[mat.itemId]! <= 0) delete inventory.value[mat.itemId]
    currency.copper -= cost
    if (rng() * 100 < enhanceSuccessRate(inst.enhance)) {
      inst.enhance += 1
      scheduleSave()
      notification.toast(`强化成功！「${g.name}」强化 +${inst.enhance}`, 'success')
      return true
    }
    // 失败：持有强化保护符则回退材料并消耗一张（金钱照扣），否则材料损失
    if ((inventory.value[ENH_PROTECT_ID] ?? 0) > 0) {
      inventory.value[mat.itemId] = (inventory.value[mat.itemId] ?? 0) + mat.count
      inventory.value[ENH_PROTECT_ID] = (inventory.value[ENH_PROTECT_ID] ?? 0) - 1
      if (inventory.value[ENH_PROTECT_ID]! <= 0) delete inventory.value[ENH_PROTECT_ID]
      scheduleSave()
      notification.toast(`强化失败，保护符保住了「${mat.name}」`, 'warning')
      return false
    }
    scheduleSave()
    notification.toast(`强化失败，「${g.name}」等级不变`, 'error')
    return false
  }

  /**
   * 升星当前槽位装备：扣同名装备一件 + 魂玉 → 星级 +1（设计稿 §8：0-3 星，每星基础属性 +10%）
   * NOTE: 升星只增强基础属性，不改词条内容/数量（与强化独立成长线）
   */
  function starGear(slot: GearSlotKey): boolean {
    const inst = equipped[slot]
    const g = inst ? gearById(inst.itemId) : undefined
    if (!inst || !g) {
      notification.toast('该槽位未穿戴装备')
      return false
    }
    const cur = inst.star ?? 0
    if (cur >= STAR_MAX) {
      notification.toast('已达满星')
      return false
    }
    // 同名装备 ×1（背包中未穿戴的同款，从 gearInstances 移除）
    const sameIdx = gearInstances.value.findIndex((x) => x.itemId === inst.itemId)
    if (sameIdx < 0) {
      notification.toast('需要同名装备一件（当前升星消耗）', 'warning')
      return false
    }
    const need = starCost(cur)
    if ((inventory.value['star_soul_01'] ?? 0) < need) {
      notification.toast(`魂玉不足（需要 ${need}）`, 'warning')
      return false
    }
    gearInstances.value.splice(sameIdx, 1)
    inventory.value['star_soul_01'] = (inventory.value['star_soul_01'] ?? 0) - need
    if (inventory.value['star_soul_01']! <= 0) delete inventory.value['star_soul_01']
    inst.star = cur + 1
    scheduleSave()
    notification.toast(`升星成功！「${g.name}」升至 ${inst.star} 星`, 'success')
    return true
  }

  /**
   * 图纸解锁判定：装备无 blueprintId（旧版/非图纸体系）→ 直接可造；
   * 一阶（t1）图纸默认解锁（新手期无门槛，设计稿 §3.1「默认解锁」）；
   * 其余阶位需背包持有对应图纸（解锁判定不消耗图纸，对齐设计稿「解锁制造权限」语义）。
   */
  function blueprintUnlocked(itemId: string): boolean {
    const g = gearById(itemId)
    if (!g?.blueprintId) return true
    if (g.tier === 't1') return true
    return (inventory.value[g.blueprintId] ?? 0) > 0
  }

  /**
   * 制造装备：图纸解锁校验 → 检查材料 → 扣材料 → 生成装备实例（按稀有度随机词缀）→ 入背包
   * NOTE: 图纸仅作解锁判定（持图可造、制造不消耗），一阶默认解锁；词缀数值在制造时锁定（rollAffixStat）
   */
  function craftEquipment(itemId: string, rng: Rng = Math.random): GearInstance | null {
    const g = gearById(itemId)
    if (!g) {
      notification.toast('未知装备配方')
      return null
    }
    if (!g.materials?.length) {
      notification.toast(`「${g.name}」无需材料`)
      return null
    }
    if (!blueprintUnlocked(itemId)) {
      const bp = catalogById(g.blueprintId)
      notification.toast(`未解锁「${g.name}」制造，需持有「${bp?.name ?? g.blueprintId}」`, 'warning')
      return null
    }
    for (const m of g.materials) {
      if ((inventory.value[m.itemId] ?? 0) < m.count) {
        notification.toast('材料不足，无法铸造', 'error')
        return null
      }
    }
    for (const m of g.materials) {
      inventory.value[m.itemId] = (inventory.value[m.itemId] ?? 0) - m.count
      if (inventory.value[m.itemId]! <= 0) delete inventory.value[m.itemId]
    }
    const quality = rollQuality(g.rarity, rng)
    const qualityFactor = rollQualityFactor(quality, rng)
    const inst = makeInstance(itemId, rollAffixes(itemId, quality, rng), 0, quality, qualityFactor)
    gearInstances.value.push(inst)
    scheduleSave()
    notification.toast(`铸造成功！获得「${g.name}」`, 'success')
    return inst
  }

  /** 从词条库按部位/子类型抽取词缀（weight 加权随机，词条数按品质 1/2/3/4/5） */
  function rollAffixes(itemId: string, quality: number, rng: Rng = Math.random): GearAffix[] {
    const g = gearById(itemId)
    if (!g) return []
    const pool = EQUIP_AFFIXES.filter((a) => affixAppliesTo(a, g.slot, g.subType))
    const out: GearAffix[] = []
    const seen = new Set<string>()
    let count = affixCountByQuality(quality)
    // 词缀质量随品质抬升：凡品取 rarity=1 的词条（weight>0），高品质全池
    const source = quality === 1
      ? pool.filter((a) => a.rarity === 1)
      : pool
    // NOTE: 去重不放回——每次从「键未使用」的候选中加权抽取，保证绝/神品词条数达标，
    //       且 rng 单调（固定值）时无死循环（remaining 单调缩小）。同键词条同装备不重复（设计稿 §9.4）
    let remaining = source
    while (count > 0 && remaining.length > 0) {
      const affix = rollEquipmentAffix(remaining, g.slot, g.subType, rng)
      if (!affix) break
      const key = `${affix.attribute}:${affix.modifierType}`
      seen.add(key)
      const stat = rollAffixStat(affix, rng)
      out.push({ id: affix.id, attribute: stat.attribute, modifierType: stat.modifierType, value: stat.value })
      remaining = source.filter((a) => !seen.has(`${a.attribute}:${a.modifierType}`))
      count--
    }
    return out
  }

  // ════════════ 背包操作 ════════════

  function addItem(itemId: string, count: number): void {
    if (count <= 0) return
    // 装备进 gearInstances（每件一个实例，掉落按阶位 roll 品质与系数）；其余进 inventory 计数
    const def = gearById(itemId)
    if (def) {
      for (let i = 0; i < count; i++) {
        const quality = rollQuality(def.rarity)
        gearInstances.value.push(makeInstance(itemId, [], 0, quality, rollQualityFactor(quality)))
      }
    } else {
      inventory.value[itemId] = (inventory.value[itemId] ?? 0) + count
    }
    scheduleSave()
  }

  /** 扣除数量；不足返回 false（不扣）。装备从 gearInstances 移除（穿戴中的装备不在背包） */
  function removeItem(itemId: string, count: number): boolean {
    if (gearById(itemId)) {
      const idxs = gearInstances.value.map((g, i) => (g.itemId === itemId ? i : -1)).filter((i) => i >= 0)
      if (idxs.length < count) return false
      for (let i = 0; i < count; i++) gearInstances.value.splice(idxs[i] - i, 1)
      scheduleSave()
      return true
    }
    const cur = inventory.value[itemId] ?? 0
    if (cur < count) return false
    const next = cur - count
    if (next <= 0) delete inventory.value[itemId]
    else inventory.value[itemId] = next
    scheduleSave()
    return true
  }

  /** 丢弃（全部）；任务物品禁丢 */
  function discardItem(itemId: string): boolean {
    const item = catalogById(itemId)
    if (item?.type === '任务') {
      notification.toast('任务物品不可丢弃')
      return false
    }
    const count = countOf(itemId)
    if (count <= 0) return false
    if (gearById(itemId)) {
      gearInstances.value = gearInstances.value.filter((g) => g.itemId !== itemId)
    } else {
      delete inventory.value[itemId]
    }
    scheduleSave()
    notification.toast(`丢弃了「${item?.name ?? itemId}」×${count}`)
    return true
  }

  // ════════════ 仓库存取 ════════════

  /** 存入仓库（全部数量），找第一个空位 */
  function moveToStorage(itemId: string): boolean {
    const count = inventory.value[itemId] ?? 0
    if (count <= 0) return false
    const slot = storage.value.find((s) => !s.itemId)
    if (!slot) {
      notification.toast('仓库已满，可扩容', 'warning')
      return false
    }
    slot.itemId = itemId
    slot.count = count
    delete inventory.value[itemId]
    scheduleSave()
    notification.toast(`「${catalogById(itemId)?.name ?? itemId}」已存入仓库 ×${count}`)
    return true
  }

  /** 取出回背包（该格全部） */
  function moveToInventory(slotIdx: number): boolean {
    const slot = storage.value[slotIdx]
    if (!slot?.itemId || slot.count <= 0) return false
    const { itemId, count } = slot
    inventory.value[itemId] = (inventory.value[itemId] ?? 0) + count
    slot.itemId = null
    slot.count = 0
    scheduleSave()
    notification.toast(`「${catalogById(itemId)?.name ?? itemId}」已取回背包 ×${count}`)
    return true
  }

  // ════════════ 仓库扩容 ════════════

  function expandCost(): number {
    const times = Math.floor((storage.value.length - STORAGE_BASE) / STORAGE_EXPAND_STEP)
    return EXPAND_COSTS[Math.min(Math.max(times, 0), EXPAND_COSTS.length - 1)]
  }

  function expandStorage(): boolean {
    if (storage.value.length >= MAX_STORAGE) {
      notification.toast('仓库已达上限')
      return false
    }
    const cost = expandCost()
    if (currency.jade < cost) {
      notification.toast('灵石不足')
      return false
    }
    currency.jade -= cost
    const added = Math.min(STORAGE_EXPAND_STEP, MAX_STORAGE - storage.value.length)
    for (let i = 0; i < added; i++) storage.value.push({ itemId: null, count: 0 })
    scheduleSave()
    notification.toast(`扩容成功，仓库新增 ${added} 格`)
    return true
  }

  // ════════════ 坊市购买 ════════════

  /** 通用货币扣减（洞府强化/升星等消耗）；不足返回 false 不扣 */
  function spend(unit: keyof XiyouCurrency, amount: number): boolean {
    if (amount <= 0) return true
    if (currency[unit] < amount) return false
    currency[unit] -= amount
    scheduleSave()
    return true
  }

  /**
   * 坊市经济（物品实际价值 → 买卖价）：系数由 params 域 economy_ratios 控制（购买 200% / 出售 56%），
   * 改参数即全局生效，物品数据只存单一「实际价值」。
   */
  /** 默认购买系数（无 params 域参数兜底）：价值 × 2.0 = 坊市购买价 */
  const DEFAULT_BUY_RATIO = 2
  /** 默认出售系数（无 params 域参数兜底）：价值 × 0.56 = 出售价 */
  const DEFAULT_SELL_RATIO = 0.56

  /** 购买系数（百分比参数 → 小数）；读取 params 域 economy_ratios.buyPercent */
  function buyRatio(): number {
    return (GameDataProcessor.getEconomyRatios()?.buyPercent ?? DEFAULT_BUY_RATIO * 100) / 100
  }

  /** 出售系数（百分比参数 → 小数）；读取 params 域 economy_ratios.sellPercent */
  function sellRatio(): number {
    return (GameDataProcessor.getEconomyRatios()?.sellPercent ?? DEFAULT_SELL_RATIO * 100) / 100
  }

  /** 坊市商品单价：有 itemId 的物品按 实际价值 × 购买系数 派生（四舍五入）；
   *  无 itemId（引路香 / 跨货币单位商品如灵石、银两）用配置兜底价 */
  function shopPrice(good: XiyouShopGood): number {
    if (good.itemId) {
      const value = catalogById(good.itemId)?.value
      if (value != null && value > 0) return Math.round(value * buyRatio())
    }
    return good.price
  }

  /** 物品出售单价：实际价值 × 出售系数（向下取整，防刷金） */
  function sellPriceOf(itemId: string): number {
    const value = catalogById(itemId)?.value ?? 0
    return Math.floor(value * sellRatio())
  }

  /** 出售物品（背包普通物品或未穿戴装备实例）；返回失败原因文案（成功返回 null）。
   *  入账货币为铜钱（价值 × 出售系数），普通物品扣 inventory、装备移除对应数量实例 */
  function sell(itemId: string, count: number): string | null {
    if (count <= 0) return '数量无效'
    const price = sellPriceOf(itemId)
    if (price <= 0) return '该物品不可出售'
    if (countOf(itemId) < count) return '数量不足'
    if (!removeItem(itemId, count)) return '数量不足'
    currency.copper += price * count
    scheduleSave()
    const item = catalogById(itemId)
    notification.toast(`出售「${item?.name ?? itemId}」×${count}，获得 ${price * count} 铜钱`)
    return null
  }

  /** 购买；返回失败原因文案（成功返回 null）。成功直接扣减库存（stock=-1 表示无限，不扣）。
   *  单价 = shopPrice（有 itemId 的商品按 实际价值 × 购买系数 派生） */
  function purchase(good: XiyouShopGood, count: number): string | null {
    if (count <= 0) return '数量无效'
    const itemId = nameToId.get(good.name)
    if (!itemId) return '商品未收录'
    if (good.stock >= 0 && good.stock < count) return '库存不足'
    const unit = UNIT_KEY[good.unit]
    const wallet = currency[unit]
    const total = shopPrice(good) * count
    if (wallet < total) return '货币不足'
    currency[unit] = wallet - total
    if (good.stock >= 0) good.stock -= count
    addItem(itemId, count)
    scheduleSave()
    notification.toast(`购买了「${good.name}」×${count}`)
    return null
  }

  // ════════════ 药园 ════════════

  function gardenCropById(cropId: string): XiyouGardenCrop | undefined {
    return gardenCrops.find((c) => c.id === cropId)
  }

  /** 地块剩余冷却秒数（冷却中返回 >0，否则 0） */
  function gardenCooldown(plotIdx: number, now = Date.now()): number {
    const plot = garden.value[plotIdx]
    if (!plot?.cooldownUntil) return 0
    return Math.max(0, Math.ceil((plot.cooldownUntil - now) / 1000))
  }

  /** 种植：空置（且冷却已结束）地块种下作物，立即可收获 */
  function plantCrop(plotIdx: number, cropId: string, now = Date.now()): boolean {
    const plot = garden.value[plotIdx]
    if (!plot) return false
    if (plot.cropId) {
      notification.toast('该地块已有作物')
      return false
    }
    if (plot.cooldownUntil && plot.cooldownUntil > now) {
      notification.toast('该地块仍在恢复中')
      return false
    }
    const crop = gardenCropById(cropId)
    if (!crop) {
      notification.toast('未知作物')
      return false
    }
    plot.cropId = cropId
    plot.cooldownUntil = null
    scheduleSave()
    return true
  }

  /** 收获：产出 yield 数量材料入包，地块进入冷却 */
  function harvestCrop(plotIdx: number, now = Date.now()): boolean {
    const plot = garden.value[plotIdx]
    const crop = plot?.cropId ? gardenCropById(plot.cropId) : undefined
    if (!plot || !crop) return false
    addItem(crop.id, crop.yield)
    plot.cropId = null
    plot.cooldownUntil = now + crop.cooldown * 1000
    scheduleSave()
    notification.toast(`收获「${crop.name}」×${crop.yield}`, 'success')
    return true
  }

  // ════════════ 坊市刷新 ════════════

  /** 是否已跨天（用于每日自动刷新判定） */
  function isNewDay(iso: string, now = new Date()): boolean {
    if (!iso) return true
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) || d.toDateString() !== now.toDateString()
  }

  /** 刷新坊市：从商品池随机抽取 SHOP_PICK_COUNT 种上架，限量商品库存重置 1-5 */
  function refreshShop(now = new Date(), rng: Rng = Math.random, silent = false): void {
    const pool = [...shopPool]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = pool[i]
      pool[i] = pool[j]
      pool[j] = tmp
    }
    shopGoods.value = pool.slice(0, SHOP_PICK_COUNT).map((g) => {
      const stock = g.stock >= 0 && g.tag === '限量' ? 1 + Math.floor(rng() * 5) : g.stock
      return { ...g, stock }
    })
    shopRefreshedAt.value = now.toISOString()
    scheduleSave()
    if (!silent) notification.toast('坊市商品已刷新', 'success')
  }

  // ════════════ 快捷栏 ════════════

  function setQuickSlot(idx: number, itemId: string | null): void {
    if (idx < 0 || idx >= QUICK_SLOT_COUNT) return
    quickSlots.value[idx] = itemId
    scheduleSave()
  }

  /** 战斗中使用：heal/energy 走 BuffSystem 回调，buff 尝试 addBuff（未注册的 buffId 返回空串） */
  function useInBattle(slotIdx: number): void {
    const itemId = quickSlots.value[slotIdx]
    const item = catalogById(itemId)
    if (!itemId || !item) return
    if (countOf(itemId) <= 0) {
      notification.toast('快捷栏物品已用完')
      return
    }
    if (item.type === '永久丹药') {
      notification.toast('永久丹药请在行囊中（战斗外）使用')
      return
    }
    const effect = item.effects?.[0]
    if (!effect) {
      notification.toast('该物品无法在战斗中使用')
      return
    }

    let battle
    try {
      battle = useBattleStore()
    } catch {
      notification.toast('战斗服务未就绪')
      return
    }
    const battleService = battle.battleService
    if (!battleService || !battleService.getIsBattleActive()) {
      notification.toast('当前不在战斗中')
      return
    }
    const targetId = pickBattleTarget(battle)
    if (!targetId) {
      notification.toast('请先选中我方角色')
      return
    }

    const buffSystem = battleService.getBattleManager().getBattleSystem().getBuffSystem()
    switch (effect.type) {
      case 'heal':
        buffSystem.requestHeal(targetId, effect.value)
        notification.toast(`使用「${item.name}」，恢复 ${effect.value} 气血`, 'success')
        break
      case 'energy':
        buffSystem.requestEnergy(targetId, effect.value)
        notification.toast(`使用「${item.name}」，恢复 ${effect.value} 能量`, 'success')
        break
      case 'buff':
        if (!effect.buffId) {
          notification.toast('该增益未配置')
          return
        }
        if (!buffSystem.addBuff(targetId, effect.buffId)) {
          notification.toast(`「${item.name}」增益暂未生效`)
          return
        }
        notification.toast(`使用「${item.name}」，获得增益`, 'success')
        break
      default:
        notification.toast('该物品无法在战斗中使用')
        return
    }
    removeItem(itemId, 1)
    battle.syncTeams()
  }

  /** 挑选使用目标：优先当前选中我方角色，其次当前行动者，最后我方首位 */
  function pickBattleTarget(battle: ReturnType<typeof useBattleStore>): string | null {
    const isAlly = (id: string | null): boolean => !!id && battle.allyTeam.some((p) => p.id === id)
    const selected = battle.selectedCharacterId
    if (isAlly(selected)) return selected
    const actor = battle.currentActorId
    if (isAlly(actor)) return actor
    return battle.allyTeam[0]?.id ?? null
  }

  // ════════════ 战斗外使用 ════════════

  /** 战斗外使用：悟道丹加技能点、永久丹药提升属性、晶球开启产出；其余（heal/energy/buff 丹药）提示仅战斗中可用 */
  function useItem(itemId: string): boolean {
    const item = catalogById(itemId)
    const count = countOf(itemId)
    if (!item || count <= 0) return false

    // 悟道丹：服用 +1 技能点（全档最多 10 颗）
    if (itemId === WUDAO_PILL_ID) {
      if (!grantPillPoint()) {
        notification.toast('悟道丹已服满 10 颗，无法再获得技能点', 'warning')
        return false
      }
      removeItem(itemId, 1)
      notification.toast('服用了「悟道丹」，技能点 +1', 'success')
      return true
    }

    const perm = PERM_PILL_EFFECTS[itemId]
    if (perm) {
      const p = playerStore.player as XiyouPlayer
      const applied: string[] = []
      for (const a of perm.attrs) {
        if (a.attr === 'maxHp') {
          p.maxHp += a.value
          applied.push(`气血+${a.value}`)
        } else if (a.attr === 'attackMin') {
          p.attackMin += a.value
          p.attackMax += a.value
          applied.push(`攻击+${a.value}`)
        } else {
          p[a.attr] += a.value
          applied.push(`${a.attr}+${a.value}`)
        }
      }
      removeItem(itemId, 1)
      notification.toast(`使用了「${item.name}」，${perm.label} ${applied.join('，')}`, 'success')
      return true
    }

    if (item.type === '永久丹药') {
      notification.toast('该丹药效果暂未开放')
      return false
    }

    if (item.type === '晶球') {
      const got = openOrb(itemId)
      if (got) {
        removeItem(itemId, 1)
        addItem(got, 1)
        notification.toast(`开启「${item.name}」，获得「${catalogById(got)?.name}」×1`, 'success')
        return true
      }
    }

    notification.toast('该物品仅可在战斗中作为消耗品使用')
    return false
  }

  /** 战斗外可即时生效（有实现）：
   *  - 悟道丹：服用 +1 技能点
   *  - 晶球：开启产出
   *  - 永久丹药：仅已在 PERM_PILL_EFFECTS 中实现者（洗髓丹等未实现者不显示使用） */
  function canUseOutOfBattle(itemId: string): boolean {
    const item = catalogById(itemId)
    if (!item) return false
    if (itemId === WUDAO_PILL_ID) return true
    if (item.type === '晶球') return true
    return item.type === '永久丹药' && !!PERM_PILL_EFFECTS[itemId]
  }

  function openOrb(itemId: string): string | null {
    const pool = ORB_DROPS[itemId]
    return pool?.[Math.floor(Math.random() * pool.length)] ?? null
  }

  /**
   * 战斗胜利掉落结算：逐条 roll（命中 chance 才入包）+ toast
   * @param silent 静默模式（批量结算用，如刷关模拟；抑制逐条 toast 刷屏）
   * @returns 实际命中的掉落条目（供结算展示；确定性由战斗引擎自身保证，掉落非其验证点）
   * NOTE: debugForceDrops 为调试开关（DebugCavePanel「掉落率锁定」），开启时全部命中，验证掉落表完整性
   */
  let debugForceDrops = false

  function setDebugForceDrops(on: boolean): void {
    debugForceDrops = on
  }

  /** 读取掉落率锁定状态（DebugCavePanel「刷关模拟」等复用，保证与锁定开关联动） */
  function isDebugForceDrops(): boolean {
    return debugForceDrops
  }

  function applyDrops(drops: EnemyDrop[], silent = false): EnemyDrop[] {
    const hit: EnemyDrop[] = []
    for (const d of drops) {
      const item = catalogById(d.itemId)
      if (!item || d.quantity <= 0 || d.chance <= 0) continue
      if (!debugForceDrops && Math.random() >= d.chance) continue
      addItem(d.itemId, d.quantity)
      hit.push(d)
      if (!silent) notification.toast(`获得「${item.name}」×${d.quantity}`, 'success')
    }
    return hit
  }

  return {
    inventory,
    storage,
    storageCapacity,
    quickSlots,
    currency,
    equipped,
    gearInstances,
    ownedItems,
    catalogById,
    countOf,
    canUseOutOfBattle,
    gearById,
    slotKeyOf,
    equippedGear,
    equippedInstance,
    instanceStats,
    equippedStats,
    packGearInstances,
    equipInstance,
    equip,
    unequip,
    enhanceGear,
    starGear,
    blueprintUnlocked,
    craftEquipment,
    rollAffixes,
    init,
    addItem,
    removeItem,
    discardItem,
    moveToStorage,
    moveToInventory,
    expandCost,
    expandStorage,
    spend,
    purchase,
    shopPrice,
    sellPriceOf,
    sell,
    garden,
    shopGoods,
    shopRefreshedAt,
    gardenCropById,
    gardenCooldown,
    plantCrop,
    harvestCrop,
    refreshShop,
    isNewDay,
    setQuickSlot,
    useInBattle,
    useItem,
    applyDrops,
    flush,
    setDebugForceDrops,
    isDebugForceDrops,
  }
})
