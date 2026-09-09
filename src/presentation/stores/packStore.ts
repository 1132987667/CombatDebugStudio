/**
 * packStore.ts — 行囊（背包/仓库/坊市/快捷栏）运行时状态（Pinia Composition API）
 *
 * 设计要点（对照 documents/演劫台/修改意见.md 方案二）：
 * - 目录静态源：caveLogic 合并目录（items.json + equipment.json 派生装备条目，唯一全量索引）
 * - 初始持有量：pack.json 的 materials/pills/consumables 按 name 匹配目录生成；equipment 按 itemId 逐件实例化
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
import type { EquipmentData, EquipmentStatEntry, GearAffix } from '@/domain/fengshen/types'
import type { XiyouData } from '@/domain/fengshen/types'
import type { EnemyDrop } from '@/shared/types/enemy'
import { EquipmentSlot, EQUIPMENT_SLOT_LABELS } from '@/shared/types/Item'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import { buildEquipFormula, buildPlayerConfig } from '@/infrastructure/adapters/storage/seed'
import { rollGearStats, rollAppendAffixes } from '@/domain/fengshen/gear-generate'
import { affixRuleDefaults } from '@/domain/fengshen/affix-rule-defaults'
import type { AffixRuleConfig, EquipFormulaConfig } from '@/domain/fengshen/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import {
  enhanceCost,
  enhanceFactor,
  enhanceMaterialOf,
  enhanceMaxByRarity,
  enhanceSuccessRate,
  STAR_MAX,
  STAR_STONES,
  starCost,
  starFactor,
  WASH_COST_GOLD,
  WASH_MATERIAL_NAMES,
  WASH_MATERIALS,
  washAllowed,
  type WashMode,
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

/** 装备槽位键（8 类装备槽）——单一来源 shared/types/Item 的 EquipmentSlot，别名保留兼容既有调用方 */
export type GearSlotKey = EquipmentSlot

/** 装备槽位展示名（EquipPanel 用）——单一来源 EQUIPMENT_SLOT_LABELS */
export const GEAR_SLOT_LABELS: Record<GearSlotKey, string> = EQUIPMENT_SLOT_LABELS

/** 装备词条（实例化：制造/掉落时从 affix-rule 池抽取并锁定数值）——结构定义见 domain/fengshen/types */
export type { GearAffix } from '@/domain/fengshen/types'

/** 随机数生成器（可注入做确定性测试） */
export type Rng = () => number

/** 装备实例唯一 id（优先 crypto.randomUUID，降级时间戳+随机） */
export function newInstanceId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// ════════════ §21 装备属性生成（制造/掉落时刻 roll 并锁存） ════════════

/** 阶位 t1~t5 → affix-rule tier_weight 键（凡/玄/地/天/仙） */
const TIER_KEY: Record<string, string> = { t1: 'fan', t2: 'xuan', t3: 'di', t4: 'tian', t5: 'xian' }

/** 词条投放规则 + 装备公式 + 转化系数（configs 权威源，与封神榜验证器同口径；模块级只构建一次） */
const AFFIX_RULE: AffixRuleConfig = affixRuleDefaults()
const EQUIP_FORMULA: EquipFormulaConfig = buildEquipFormula().data as unknown as EquipFormulaConfig
const PLAYER_CONVERSION: Record<string, number> = (buildPlayerConfig().data as unknown as { conversion: Record<string, number> }).conversion

/** 按实例品质 roll 一件装备的全部属性（核心 1 条 + 主要/附加词条；§21 三属性固定/随机边界） */
function rollInstanceParts(
  itemId: string,
  quality: number,
  qualityFactor: number,
  rng: Rng = Math.random,
): { stats: EquipmentStatEntry[]; affixes: GearAffix[] } {
  const g = equipmentCatalog.find((e) => e.id === itemId)
  if (!g) return { stats: [], affixes: [] }
  const r = rollGearStats(
    {
      slot: g.slot,
      subType: g.subType ?? g.slot,
      tier: TIER_KEY[g.tier ?? 't1'] ?? 'fan',
      itemLevel: Math.max(1, g.itemLevel ?? 1),
      quality,
      qualityFactor,
    },
    AFFIX_RULE,
    EQUIP_FORMULA,
    PLAYER_CONVERSION,
    rng,
  )
  return { stats: r.core ? [r.core] : [], affixes: r.affixes }
}

/** 创建装备实例（enhance 0、品质 1 凡品、系数取品质区间中值；属性按公式 roll 锁存）。
 *  affixes 传入时沿用调用方词条（stats 仍按公式 roll）；未传入时主要/附加词条一并 roll。 */
export function makeInstance(
  itemId: string,
  affixes: GearAffix[] = [],
  enhance = 0,
  quality = 1,
  qualityFactor = qualityFactorOf(quality),
  star = 0,
): GearInstance {
  const parts = rollInstanceParts(itemId, quality, qualityFactor)
  return {
    instanceId: newInstanceId(),
    itemId,
    enhance,
    quality,
    qualityFactor,
    star,
    stats: parts.stats,
    affixes: affixes.length ? affixes : parts.affixes,
  }
}

/** 装备实例（唯一 id；核心属性/词条/强化等级/品质/品质系数为实例属性，独立于 equipment.json 静态定义。
 *  PRD §21：静态定义不携带写死 stats，核心/主要/附加属性在制造时刻按公式 roll 并锁存于本实例） */
export interface GearInstance {
  instanceId: string
  itemId: string
  enhance: number
  /** 品质（1-5 → 凡/精/超/绝/神，制造/掉落时 roll；决定附加词条行数与核心属性品质系数） */
  quality: number
  /** 品质系数（制造时品质区间内 roll 并锁存；旧档/未锁定实例用区间中值兜底） */
  qualityFactor: number
  /** 星级（0-3，§21 升星表：+5%/+10%/+10%）；升星消耗同名装备 + 残魂点 */
  star: number
  /** 强化连败次数（成功率保底：每连败 1 次 +10%，成功清零；§21 装备强化） */
  enhanceFails?: number
  /** 核心属性 0~1 条（制造时公式 roll 锁存；子类型缺 core_affix_ratio 时为空 = 显式缺口） */
  stats: EquipmentStatEntry[]
  /** 主要（fixed 标记第 1 条固定）+ 附加词条（制造时 roll 锁存；洗练/重铸重 roll） */
  affixes: GearAffix[]
}

/** 行囊运行时持久化快照（xiyou 表 pack_runtime 文档的 data；v3 实例品质；v5 药园迁移；v6 货币收缩 money/xianyuan） */
export interface PackRuntimeSnapshot {
  version: 6
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
/** 扩容消耗（金钱），按扩容次数取档 */
const EXPAND_COSTS = [50, 100, 200, 400]

/** 药园地块数量（对齐 cave.json crops 六格） */
const GARDEN_PLOT_COUNT = 6
/** 坊市每轮上架商品数量（从商品池随机抽取） */
const SHOP_PICK_COUNT = 6
/** 强化保护符物品 id（强化失败时消耗一张保住材料） */
const ENH_PROTECT_ID = 'enh_protect'

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

/** 永久丹药效果表（items.json 未给 effects，此处按《完整项目说明.md》§永久丹药补齐，供战斗外使用；limit = 服用次数上限，防属性溢出） */
const PERM_PILL_EFFECTS: Record<string, { attrs: Array<{ attr: NumericPlayerKey; value: number }>; label: string; limit: number }> = {
  // 铁骨丹 防御+2
  elix_perm_01: { attrs: [{ attr: 'defense', value: 2 }], label: '防御', limit: 10 },
  // 灵犀丹 速度+2
  elix_perm_02: { attrs: [{ attr: 'speed', value: 2 }], label: '速度', limit: 10 },
  // 破境丹 攻击+2
  elix_perm_03: { attrs: [{ attr: 'attackMin', value: 2 }], label: '攻击', limit: 10 },
  // 固本丹 气血+12
  elix_perm_04: { attrs: [{ attr: 'maxHp', value: 12 }], label: '气血上限', limit: 10 },
  // 凝神丹 命中+2
  elix_perm_05: { attrs: [{ attr: 'hitRate', value: 2 }], label: '命中', limit: 10 },
  // 凌波丹 闪避+2
  elix_perm_06: { attrs: [{ attr: 'dodgeRate', value: 2 }], label: '闪避', limit: 10 },
}

/** 悟道丹物品 id（items.json；服用 +1 技能点，全存档最多 10 颗，需求 §2.1.2） */
const WUDAO_PILL_ID = 'mat_wudao_dan'

export const usePackStore = defineStore('pack', () => {
  const notification = useNotificationStore()
  const playerStore = usePlayerStore()

  /** 背包持有量：itemId → count（仅记录 >0 的条目；装备不在此列，见 gearInstances） */
  const inventory = ref<Record<string, number>>({})
  /** 永久丹药服用计数：itemId → 已服颗数（上限校验；save-bridge 持久化到存档 pill_uses） */
  const pillUses = ref<Record<string, number>>({})
  /** 永久丹药属性累计增量：attr → 总和（save-bridge 持久化到存档 pill_bonuses，恢复时叠回 player） */
  const pillBonuses = ref<Record<string, number>>({})
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
      version: 6,
      inventory: { ...inventory.value },
      storage: storage.value.map((s) => ({ itemId: s.itemId, count: s.count })),
      quickSlots: [...quickSlots.value],
      currency: { money: currency.money, xianyuan: currency.xianyuan },
      gearInstances: gearInstances.value.map((g) => ({
        instanceId: g.instanceId,
        itemId: g.itemId,
        enhance: g.enhance,
        enhanceFails: g.enhanceFails ?? 0,
        stats: g.stats,
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
      snapshotVersion = snap.version as number
      // v4 旧档在无主存档恢复路径下于此处直接迁移；有主存档时 restore 覆盖后再补
      migrateV5StarterHerbs()
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
        const c = snap.currency as XiyouCurrency & { copper?: number; silver?: number; jade?: number; lingyun?: number }
        if (typeof c.money === 'number') {
          currency.money = c.money
        } else {
          // v6 货币收缩迁移：旧档铜钱/银两/灵石按 curr_001 换算（1:1 / ×100 / ×1000）合并为金钱
          currency.money = (c.copper ?? 0) + (c.silver ?? 0) * 100 + (c.jade ?? 0) * 1000
        }
        // 旧档无灵韵字段（灵韵/缺省）时保持初始值，让老玩家同样能体验药园催熟
        currency.xianyuan = c.xianyuan ?? c.lingyun ?? currency.xianyuan
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
              // 旧档无锁存属性（写死 stats 时代的实例）→ 按公式补 roll 一次
              stats: Array.isArray(g.stats) ? g.stats.map((s) => ({ ...s })) : rollInstanceParts(g.itemId as string, quality, Number.isFinite(g.qualityFactor) ? (g.qualityFactor as number) : qualityFactorOf(quality)).stats,
              affixes: Array.isArray(g.affixes) ? g.affixes.map((a) => ({ ...a })) : [],
            }
          }
        }
      }
      if (Array.isArray(snap.gearInstances)) {
        gearInstances.value = snap.gearInstances
          .filter((g): g is GearInstance => !!g && typeof g.itemId === 'string')
          .map((g) => {
            const quality = Number.isInteger(g.quality) && g.quality >= 1 && g.quality <= 5 ? g.quality : 1
            return {
              instanceId: g.instanceId ?? newInstanceId(),
              itemId: g.itemId,
              enhance: Number.isFinite(g.enhance) ? g.enhance : 0,
              enhanceFails: Number.isInteger(g.enhanceFails) && (g.enhanceFails as number) >= 0 ? (g.enhanceFails as number) : 0,
              quality,
              qualityFactor: Number.isFinite(g.qualityFactor) ? g.qualityFactor : qualityFactorOf(g.quality ?? 1),
              star: Number.isInteger(g.star) && (g.star as number) >= 0 ? (g.star as number) : 0,
              // 旧档无锁存属性（写死 stats 时代）→ 按公式补 roll 一次
              stats: Array.isArray(g.stats) ? g.stats.map((s) => ({ ...s })) : rollInstanceParts(g.itemId, quality, Number.isFinite(g.qualityFactor) ? g.qualityFactor : qualityFactorOf(g.quality ?? 1)).stats,
              affixes: Array.isArray(g.affixes) ? g.affixes.map((a) => ({ ...a })) : [],
            }
          })
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

    // 装备组：每件生成一个实例（无词缀、enhance 0；pack.json 按 itemId 引用装备定义）
    const gear: GearInstance[] = []
    for (const item of equipment) {
      if (gearById(item.itemId)) {
        for (let i = 0; i < item.count; i++) gear.push(makeInstance(item.itemId, [], 0))
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

  /**
   * v5 药园（灵韵催熟制）迁移：种子体系移除后，v4 旧档既没有启动草药也拿不到种子——补发一阶启动草药
   * （对齐 pack.json 初始量）并清理 seed_* 残留条目。二阶以上母株靠对应场景关卡草药掉落
   * （enemies.json drops，"杀敌即成长"），不在此补发。
   * NOTE: restore 会用主存档整表覆盖 inventory（抹掉 load 时补的株数），覆盖后需再调一次；
   *       故本函数只读判断不写版本号，落盘升版由 flush 的 version 常量承担。
   */
  let snapshotVersion = 0
  function migrateV5StarterHerbs(): void {
    if (snapshotVersion >= 5) return
    inventory.value['mat_zhixuecao'] = (inventory.value['mat_zhixuecao'] ?? 0) + 3
    inventory.value['mat_qingxinye'] = (inventory.value['mat_qingxinye'] ?? 0) + 3
    for (const id of Object.keys(inventory.value)) {
      if (id.startsWith('seed_')) delete inventory.value[id]
    }
    scheduleSave()
  }

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

  /** 装备对应的槽位键（weapon/armor/helmet/boots/charm/glove）；非装备返回 null */
  function slotKeyOf(itemId: string): GearSlotKey | null {
    // EquipmentData.slot 为 string（引擎口径），此处收窄为背包八槽 union
    return (gearById(itemId)?.slot as GearSlotKey | undefined) ?? null
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

  /** 实例最终属性（锁存核心 stats × 强化倍率 × 星级倍率 + 词条；未穿戴/未定义返回空） */
  function instanceStats(inst: GearInstance): EquipmentStatEntry[] {
    // 强化 ×(1+4%×L)、升星 ×(5%/10%/10% 累计 25%) 只增强基础属性（§21）；词条不吃养成倍率
    const factor = enhanceFactor(inst.enhance) * starFactor(inst.star ?? 0)
    const base = (inst.stats ?? []).map((s) => ({ ...s, value: Math.round(s.value * factor) }))
    const affixStats = (inst.affixes ?? []).map((a) => ({
      attribute: a.attribute,
      modifierType: a.modifierType,
      value: a.value,
    }))
    return [...base, ...affixStats]
  }

  /** 已穿戴装备的 stats 汇总（供 buildBattleTeams 注入主角与属性面板重算，未穿戴返回空） */
  function equippedStats(): EquipmentStatEntry[] {
    const out: EquipmentStatEntry[] = []
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
    const mat = enhanceMaterialOf(inst.enhance)
    if ((inventory.value[mat.itemId] ?? 0) < mat.count) {
      notification.toast(`强化材料不足（需要「${mat.name}」×${mat.count}）`, 'warning')
      return false
    }
    const cost = enhanceCost(inst.enhance, g.rarity)
    if (currency.money < cost) {
      notification.toast(`金钱不足（需要 ${cost}）`, 'warning')
      return false
    }
    inventory.value[mat.itemId] = (inventory.value[mat.itemId] ?? 0) - mat.count
    if (inventory.value[mat.itemId]! <= 0) delete inventory.value[mat.itemId]
    currency.money -= cost
    if (rng() * 100 < enhanceSuccessRate(inst.enhance, inst.enhanceFails ?? 0)) {
      inst.enhance += 1
      inst.enhanceFails = 0
      scheduleSave()
      notification.toast(`强化成功！「${g.name}」强化 +${inst.enhance}`, 'success')
      return true
    }
    inst.enhanceFails = (inst.enhanceFails ?? 0) + 1
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
    notification.toast(`强化失败，「${g.name}」等级不变（连败 ${inst.enhanceFails}，下次成功率 +10%）`, 'error')
    return false
  }

  /**
   * 升星当前槽位装备：残魂点支付（每星 3 点，累计 3/6/9）→ 星级 +1（§21 装备养成操作与材料）
   * 点源混合支付，优先级：破境耀星石（上3/中2/下1，贪心）→ 兵解残魄晶（1 点/个）→ 同名未穿戴装备（1 点/件，被消耗）
   * NOTE: 升星只增强基础属性（+5%/+10%/+10% 累计 25%），不改词条内容/数量
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
    const need = starCost(cur + 1)
    if (starPointsAvailable(inst.itemId) < need) {
      notification.toast(`残魂点不足（需 ${need} 点：破境耀星石 / 兵解残魄晶 / 同名装备均可）`, 'warning')
      return false
    }
    consumeStarPoints(inst.itemId, need)
    inst.star = cur + 1
    scheduleSave()
    notification.toast(`升星成功！「${g.name}」升至 ${inst.star} 星`, 'success')
    return true
  }

  /** 升星可用残魂点：破境耀星石（上3/中2/下1）+ 兵解残魄晶 decomp_soul（1/个）+ 同名未穿戴装备（1/件） */
  function starPointsAvailable(itemId: string): number {
    const stonePts = STAR_STONES.reduce((sum, [id, pts]) => sum + (inventory.value[id] ?? 0) * pts, 0)
    const souls = inventory.value['decomp_soul'] ?? 0
    const sameCount = gearInstances.value.filter((x) => x.itemId === itemId).length
    return stonePts + souls + sameCount
  }

  /** 按优先级扣减残魂点（调用方先以 starPointsAvailable 校验充足），支付顺序见 starGear 注释 */
  function consumeStarPoints(itemId: string, need: number): void {
    let remain = need
    const takeItem = (id: string, count: number): number => {
      const use = Math.min(inventory.value[id] ?? 0, count)
      if (use > 0) {
        inventory.value[id] = (inventory.value[id] ?? 0) - use
        if (inventory.value[id]! <= 0) delete inventory.value[id]
      }
      return use
    }
    for (const [id, pts] of STAR_STONES) {
      if (remain <= 0) break
      const use = takeItem(id, Math.floor(remain / pts))
      remain -= use * pts
    }
    if (remain > 0) remain -= takeItem('decomp_soul', remain)
    while (remain > 0) {
      const sameIdx = gearInstances.value.findIndex((x) => x.itemId === itemId)
      if (sameIdx < 0) break
      gearInstances.value.splice(sameIdx, 1)
      remain--
    }
  }

  /**
   * 洗练当前槽位装备词条（§21 装备养成操作与材料）：
   * normal 全部重 roll / directed 指定 1 条重 roll / locked 锁 1 条（种类+数值不变）其余重 roll。
   * 词条数不变、同部位池内抽取、结果可能更差；开放品质 washAllowed（§8.4.4：凡普通/精定向/超锁词条）。
   * 消耗：对应洗练材料 ×1 + 200 金钱；先 roll 后扣（池耗尽不扣消耗）。
   */
  function washGear(slot: GearSlotKey, mode: WashMode, targetIndex: number, rng: Rng = Math.random): boolean {
    const inst = equipped[slot]
    const g = inst ? gearById(inst.itemId) : undefined
    if (!inst || !g) {
      notification.toast('该槽位未穿戴装备')
      return false
    }
    if (!washAllowed(mode, inst.quality)) {
      notification.toast(`品质不足，「${WASH_MATERIAL_NAMES[mode]}」洗练未开放`, 'warning')
      return false
    }
    // 洗练只作用于附加词条；主要属性（fixed 第 1 条 / main 第 2 条，§21）不可洗
    const affixes = inst.affixes
    const appendIdxs = affixes.map((a, i) => (a.fixed || a.main ? -1 : i)).filter((i) => i >= 0)
    if (appendIdxs.length === 0) {
      notification.toast('该装备没有可洗练的附加词条', 'warning')
      return false
    }
    if (mode !== 'normal' && (targetIndex < 0 || targetIndex >= appendIdxs.length)) {
      notification.toast('请先选择要操作的词条', 'warning')
      return false
    }
    const matId = WASH_MATERIALS[mode]
    if ((inventory.value[matId] ?? 0) < 1) {
      notification.toast(`洗练材料不足（需要「${WASH_MATERIAL_NAMES[mode]}」×1）`, 'warning')
      return false
    }
    if (currency.money < WASH_COST_GOLD) {
      notification.toast(`金钱不足（需要 ${WASH_COST_GOLD}）`, 'warning')
      return false
    }
    const keyOf = (a: GearAffix): string => a.attribute
    // 先 roll（纯计算，不消耗）——池耗尽直接拒绝；targetIndex 为附加词条数组下标（UI 仅列附加条）
    let nextAppend: GearAffix[]
    if (mode === 'normal') {
      nextAppend = rollAffixes(inst.itemId, appendIdxs.length, rng, { count: appendIdxs.length })
    } else if (mode === 'directed') {
      const keepKeys = new Set(appendIdxs.filter((i) => i !== appendIdxs[targetIndex]).map((i) => keyOf(affixes[i])))
      const rolled = rollAffixes(inst.itemId, 1, rng, { count: 1, excludeKeys: keepKeys })
      if (rolled.length === 0) {
        notification.toast('词条池已无可替换词条', 'warning')
        return false
      }
      nextAppend = appendIdxs.map((i) => affixes[i])
      nextAppend[targetIndex] = rolled[0]
    } else {
      const keepKey = keyOf(affixes[appendIdxs[targetIndex]])
      const rolled = rollAffixes(inst.itemId, appendIdxs.length - 1, rng, {
        count: appendIdxs.length - 1,
        excludeKeys: new Set([keepKey]),
      })
      if (rolled.length < appendIdxs.length - 1) {
        notification.toast('词条池不足以完成锁词条洗练', 'warning')
        return false
      }
      nextAppend = appendIdxs.map((i) => affixes[i])
      let ri = 0
      for (let i = 0; i < nextAppend.length; i++) {
        if (i !== targetIndex) nextAppend[i] = rolled[ri++]
      }
    }
    // roll 成功后扣消耗；主要条（fixed/main）保持在前，附加条整体替换
    inventory.value[matId] = (inventory.value[matId] ?? 0) - 1
    if (inventory.value[matId]! <= 0) delete inventory.value[matId]
    currency.money -= WASH_COST_GOLD
    inst.affixes = [...affixes.filter((a) => a.fixed || a.main), ...nextAppend]
    scheduleSave()
    notification.toast(`洗练完成！「${g.name}」词条已更新`, 'success')
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
    // 词条与核心属性在 makeInstance 内按 affix-rule 公式一次 roll 并锁存（§21；品质定词条行数）
    const inst = makeInstance(itemId, [], 0, quality, qualityFactor)
    gearInstances.value.push(inst)
    scheduleSave()
    notification.toast(`铸造成功！获得「${g.name}」`, 'success')
    return inst
  }

  /** 附加词条抽取（affix-rule 投放矩阵前 N 行按 side 池，N=品质档；§21 附加属性投放）。
   *  opts.count 覆盖条数、opts.excludeKeys 排除的属性码（洗练锁词条/定向时保持去重约束）。
   *  主要属性（fixed/random）不参与洗练，仅附加走本函数。 */
  function rollAffixes(
    itemId: string,
    quality: number,
    rng: Rng = Math.random,
    opts?: { count?: number; excludeKeys?: ReadonlySet<string> },
  ): GearAffix[] {
    const g = gearById(itemId)
    if (!g) return []
    const warnings: string[] = []
    const rolled = rollAppendAffixes(
      {
        slot: g.slot,
        subType: g.subType ?? g.slot,
        tier: TIER_KEY[g.tier ?? 't1'] ?? 'fan',
        itemLevel: Math.max(1, g.itemLevel ?? 1),
        quality: opts?.count ?? quality,
        qualityFactor: 1,
      },
      { cfg: AFFIX_RULE, formula: EQUIP_FORMULA, conversion: PLAYER_CONVERSION, rng },
      opts?.excludeKeys,
      warnings,
    )
    if (opts?.count != null) {
      // count 语义 = 精确条数（洗练锁词条/定向按现有附加数补齐）：行矩阵耗尽时按品质行收口
      return rolled.affixes.slice(0, opts.count)
    }
    return rolled.affixes
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
    if (currency.money < cost) {
      notification.toast('金钱不足')
      return false
    }
    currency.money -= cost
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
   *  无 itemId（引路香）用配置兜底价；货币统一为金钱 */
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
   *  入账货币为金钱（价值 × 出售系数），普通物品扣 inventory、装备移除对应数量实例 */
  function sell(itemId: string, count: number): string | null {
    if (count <= 0) return '数量无效'
    const price = sellPriceOf(itemId)
    if (price <= 0) return '该物品不可出售'
    if (countOf(itemId) < count) return '数量不足'
    if (!removeItem(itemId, count)) return '数量不足'
    currency.money += price * count
    scheduleSave()
    const item = catalogById(itemId)
    notification.toast(`出售「${item?.name ?? itemId}」×${count}，获得 ${price * count} 金钱`)
    return null
  }

  /** 购买；返回失败原因文案（成功返回 null）。成功直接扣减库存（stock=-1 表示无限，不扣）。
   *  单价 = shopPrice（有 itemId 的商品按 实际价值 × 购买系数 派生） */
  function purchase(good: XiyouShopGood, count: number): string | null {
    if (count <= 0) return '数量无效'
    const itemId = nameToId.get(good.name)
    if (!itemId) return '商品未收录'
    if (good.stock >= 0 && good.stock < count) return '库存不足'
    const wallet = currency.money
    const total = shopPrice(good) * count
    if (wallet < total) return '金钱不足'
    currency.money = wallet - total
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

  /**
   * 种植（灵韵催熟制）：空置（且冷却已结束）地块投入 input 株作物 + 灵韵一次催熟，种下即可收获。
   * 草药需背包先有 1 株（种 1 收多，§10.1 产量表）；灵植（灵芝/朱果/仙桃）无来源不投入，只耗灵韵。
   */
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
    const inputCount = crop.input ?? 0
    if (inputCount > 0 && countOf(crop.id) < inputCount) {
      notification.toast(`「${crop.name}」数量不足（需投入 ${inputCount} 株）`, 'warning')
      return false
    }
    if (currency.xianyuan < crop.xianyuan) {
      notification.toast(`灵韵不足（需 ${crop.xianyuan}，战斗胜利可获得）`, 'warning')
      return false
    }
    if (inputCount > 0) removeItem(crop.id, inputCount)
    currency.xianyuan -= crop.xianyuan
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

  /** 战斗外使用：悟道丹加技能点、永久丹药提升属性；其余（heal/energy/buff 丹药）提示仅战斗中可用 */
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
      const used = pillUses.value[itemId] ?? 0
      if (used >= perm.limit) {
        notification.toast(`「${item.name}」已服满 ${perm.limit} 颗，无法再服用`, 'warning')
        return false
      }
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
        // 记录全量累计增量（恢复时 save-bridge 只叠非 hp_max/base_atk 键，防双算）
        pillBonuses.value[a.attr] = (pillBonuses.value[a.attr] ?? 0) + a.value
      }
      pillUses.value[itemId] = used + 1
      removeItem(itemId, 1)
      notification.toast(`使用了「${item.name}」，${perm.label} ${applied.join('，')}`, 'success')
      return true
    }

    if (item.type === '永久丹药') {
      notification.toast('该丹药效果暂未开放')
      return false
    }

    notification.toast('该物品仅可在战斗中作为消耗品使用')
    return false
  }

  /** 战斗外可即时生效（有实现）：
   *  - 悟道丹：服用 +1 技能点
   *  - 永久丹药：PERM_PILL_EFFECTS 已登记的 6 种（服用受次数上限约束） */
  function canUseOutOfBattle(itemId: string): boolean {
    const item = catalogById(itemId)
    if (!item) return false
    if (itemId === WUDAO_PILL_ID) return true
    return item.type === '永久丹药' && !!PERM_PILL_EFFECTS[itemId]
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
    pillUses,
    pillBonuses,
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
    starPointsAvailable,
    washGear,
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
    migrateV5StarterHerbs,
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
