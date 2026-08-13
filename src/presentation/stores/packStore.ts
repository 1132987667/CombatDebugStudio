/**
 * packStore.ts — 行囊（背包/仓库/坊市/快捷栏）运行时状态（Pinia Composition API）
 *
 * 设计要点（对照 documents/演劫台/修改意见.md 方案二）：
 * - 目录静态源：items.json（经 mock.ts 的 packItems 全量索引）；持有量（inventory）为运行时状态
 * - 初始持有量：pack.json 的 materials/equipment/pills/consumables 按 name 匹配 items.json 生成
 * - 持久化：封神榜 xiyou 表 id='pack_runtime'（复用现有方案 B 存储路径），防抖 500ms
 * - 货币：store 内独立持有，变更时同步写回 mock.ts 的 currency（顶栏/坊市同一货币口径）
 * - 战斗联动：useInBattle 经 BattleSystem.getBuffSystem() 注入 requestHeal/requestEnergy/addBuff
 */

import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { XiyouCatalogItem, XiyouCurrency, XiyouPlayer, XiyouShopGood } from '@/presentation/modules/yanjie/games/xiyou/data/mock'
import {
  currency as mockCurrency,
  materials,
  equipment,
  packItems,
  pills,
  consumables,
  player as mockPlayer,
  storageCells,
} from '@/presentation/modules/yanjie/games/xiyou/data/mock'
import type { XiyouData } from '@/domain/fengshen/types'
import type { EnemyDrop } from '@/shared/types/enemy'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import { useNotificationStore } from './notificationStore'
import { useBattleStore } from './battleStore'

/** 仓库格子（itemId=null 表示空位） */
export interface StorageSlot {
  itemId: string | null
  count: number
}

/** 行囊运行时持久化快照（xiyou 表 pack_runtime 文档的 data） */
export interface PackRuntimeSnapshot {
  version: 1
  inventory: Record<string, number>
  storage: StorageSlot[]
  quickSlots: (string | null)[]
  currency: XiyouCurrency
  updatedAt: string
}

const PACK_RUNTIME_ID = 'pack_runtime'
const QUICK_SLOT_COUNT = 4
const STORAGE_BASE = 12
const STORAGE_EXPAND_STEP = 6
const MAX_STORAGE = 36
/** 扩容消耗（灵石），按扩容次数取档 */
const EXPAND_COSTS = [50, 100, 200, 400]

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

/** 永久丹药效果表（items.json 未给 effects，此处按 source 文案补齐，供战斗外使用） */
const PERM_PILL_EFFECTS: Record<string, { attr: keyof XiyouPlayer; label: string; value: number }> = {
  elix_perm_01: { attr: 'maxHp', label: '气血上限', value: 20 },
  elix_perm_02: { attr: 'defense', label: '防御', value: 5 },
  elix_perm_03: { attr: 'attackMin', label: '攻击', value: 5 },
  elix_perm_04: { attr: 'speed', label: '速度', value: 3 },
}

/** 晶球开启产出（crys_* → 强化材料 mat_enh_*） */
const ORB_DROPS: Record<string, string[]> = {
  crys_001: ['mat_enh_01'],
  crys_002: ['mat_enh_01'],
  crys_003: ['mat_enh_01'],
  crys_004: ['mat_enh_03'],
  crys_005: ['mat_enh_03'],
  crys_006: ['mat_enh_03'],
  crys_007: ['mat_enh_02'],
  crys_008: ['mat_enh_02'],
  crys_009: ['mat_enh_02'],
}

export const usePackStore = defineStore('pack', () => {
  const notification = useNotificationStore()

  /** 背包持有量：itemId → count（仅记录 >0 的条目） */
  const inventory = ref<Record<string, number>>({})
  /** 仓库格子（长度即容量） */
  const storage = ref<StorageSlot[]>([])
  /** 快捷栏（固定 4 格，存 itemId） */
  const quickSlots = ref<(string | null)[]>(Array(QUICK_SLOT_COUNT).fill(null))
  /** 货币（独立持有，变更写回 mock.currency 保持全局一致） */
  const currency = reactive<XiyouCurrency>({ ...mockCurrency })

  function syncCurrency(): void {
    mockCurrency.copper = currency.copper
    mockCurrency.silver = currency.silver
    mockCurrency.jade = currency.jade
  }

  /** 目录查询 */
  function catalogById(itemId: string | null | undefined): XiyouCatalogItem | undefined {
    return itemId ? catalogMap.get(itemId) : undefined
  }

  function countOf(itemId: string): number {
    return inventory.value[itemId] ?? 0
  }

  /** 持有多大的"拥有物品"列表（count > 0） */
  const ownedItems = computed(() => packItems.filter((it) => (inventory.value[it.id] ?? 0) > 0))
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
      version: 1,
      inventory: { ...inventory.value },
      storage: storage.value.map((s) => ({ itemId: s.itemId, count: s.count })),
      quickSlots: [...quickSlots.value],
      currency: { copper: currency.copper, silver: currency.silver, jade: currency.jade },
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
        syncCurrency()
      }
    } catch {
      // IDB 不可用/损坏时保持 configs 兜底
    }
  }

  /** 初始持有量：pack.json 的 four 组按 name 匹配 items.json */
  function buildFromConfigs(): void {
    const inv: Record<string, number> = {}
    for (const group of [materials, equipment, pills, consumables]) {
      for (const item of group) {
        const id = nameToId.get(item.name)
        if (id) inv[id] = item.count
      }
    }
    inventory.value = inv

    storage.value = storageCells.map((cell) => {
      if (cell.locked || !cell.name || cell.name === '空位') return { itemId: null, count: 0 }
      const id = nameToId.get(cell.name)
      return id ? { itemId: id, count: cell.count } : { itemId: null, count: 0 }
    })
  }

  let initialized = false

  /** 初始化（幂等）：configs 兜底 + IDB 覆盖 */
  async function init(): Promise<void> {
    if (initialized) return
    initialized = true
    buildFromConfigs()
    await load()
  }

  // ════════════ 背包操作 ════════════

  function addItem(itemId: string, count: number): void {
    if (count <= 0) return
    inventory.value[itemId] = (inventory.value[itemId] ?? 0) + count
    scheduleSave()
  }

  /** 扣除数量；不足返回 false（不扣） */
  function removeItem(itemId: string, count: number): boolean {
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
    const count = inventory.value[itemId] ?? 0
    if (count <= 0) return false
    delete inventory.value[itemId]
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
    syncCurrency()
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
    syncCurrency()
    scheduleSave()
    return true
  }

  /** 购买；返回失败原因文案（成功返回 null）。成功直接扣减库存（stock=-1 表示无限，不扣）。 */
  function purchase(good: XiyouShopGood, count: number): string | null {
    if (count <= 0) return '数量无效'
    const itemId = nameToId.get(good.name)
    if (!itemId) return '商品未收录'
    if (good.stock >= 0 && good.stock < count) return '库存不足'
    const unit = UNIT_KEY[good.unit]
    const wallet = currency[unit]
    const total = good.price * count
    if (wallet < total) return '货币不足'
    currency[unit] = wallet - total
    syncCurrency()
    if (good.stock >= 0) good.stock -= count
    addItem(itemId, count)
    scheduleSave()
    notification.toast(`购买了「${good.name}」×${count}`)
    return null
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

  /** 战斗外使用：永久丹药提升属性、晶球开启产出；其余（heal/energy/buff 丹药）提示仅战斗中可用 */
  function useItem(itemId: string): boolean {
    const item = catalogById(itemId)
    const count = countOf(itemId)
    if (!item || count <= 0) return false

    const perm = PERM_PILL_EFFECTS[itemId]
    if (perm) {
      const p = mockPlayer as XiyouPlayer
      if (perm.attr === 'maxHp') p.maxHp += perm.value
      else if (perm.attr === 'attackMin') {
        p.attackMin += perm.value
        p.attackMax += perm.value
      } else {
        p[perm.attr] += perm.value
      }
      removeItem(itemId, 1)
      notification.toast(`使用了「${item.name}」，${perm.label} +${perm.value}`, 'success')
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
   *  - 晶球：开启产出
   *  - 永久丹药：仅已在 PERM_PILL_EFFECTS 中实现者（洗髓丹等未实现者不显示使用） */
  function canUseOutOfBattle(itemId: string): boolean {
    const item = catalogById(itemId)
    if (!item) return false
    if (item.type === '晶球') return true
    return item.type === '永久丹药' && !!PERM_PILL_EFFECTS[itemId]
  }

  function openOrb(itemId: string): string | null {
    const pool = ORB_DROPS[itemId]
    return pool?.[Math.floor(Math.random() * pool.length)] ?? null
  }

  /**
   * 战斗胜利掉落结算：逐条 roll（命中 chance 才入包）+ toast
   * NOTE: 掉落为表现层结算（引擎不处理），用 Math.random；确定性由战斗引擎自身保证，掉落非其验证点
   */
  function applyDrops(drops: EnemyDrop[]): void {
    for (const d of drops) {
      const item = catalogById(d.itemId)
      if (!item || d.quantity <= 0 || d.chance <= 0) continue
      if (Math.random() >= d.chance) continue
      addItem(d.itemId, d.quantity)
      notification.toast(`获得「${item.name}」×${d.quantity}`, 'success')
    }
  }

  return {
    inventory,
    storage,
    storageCapacity,
    quickSlots,
    currency,
    ownedItems,
    catalogById,
    countOf,
    canUseOutOfBattle,
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
    setQuickSlot,
    useInBattle,
    useItem,
    applyDrops,
    flush,
  }
})
