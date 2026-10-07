<script lang="ts">
export type PackSub = 'pack' | 'storage' | 'shop'
</script>

<template>
  <div class="xy-pack-pane">
    <Tabs :model-value="sub" :tabs="tabs" destroy-inactive class="xy-pack-tabs" @update:model-value="onSubChange">
      <!-- ── 背包 ── -->
      <template #pack>
        <div class="xy-pack-layout xy-panel-tabs">
          <div class="xy-pack-toolbar">
            <TacticalInput v-model="keyword" type="text" placeholder="搜索物品…" class="xy-pack-search" />
            <TacticalSelect v-model="sortBy" :options="SORT_OPTIONS" placeholder="排序" class="xy-pack-sort" />
          </div>

          <!-- 装备词条筛选 + 排序（仅作用于装备实例卡：非装备物品无词条可筛，保持不变） -->
          <StatFilterPanel v-model:conditions="gearConditions" v-model:sorts="gearSorts"
            :options="gearStatOptions" scope="gear" class="xy-pack-sf" />

          <Tabs v-model="cat" :tabs="PACK_TABS" size="sm" destroy-inactive class="xy-pack-sub">
            <template v-for="c in PACK_CATEGORIES" :key="c.id" #[c.id]>
              <div class="xy-pack-list xy-panel-tabs">
                <template v-if="displayGroups(c.types).length">
                  <div v-for="group in displayGroups(c.types)" :key="group.type" class="xy-cabinet-cat">
                    <h4 class="xy-sec-title">{{ group.type }}<span class="xy-sec-count">×{{ group.cards.length }}</span></h4>
                    <div class="xy-card-grid">
                      <PackItemCard
                        v-for="card in group.cards" :key="card.key"
                        :item="card.item" :count="card.gear ? 1 : countOf(card.item.id)" :gear="card.gear"
                        :conditions="gearConditions"
                        :selected="selectedId === card.item.id && !card.gear"
                        @open="(id, inst) => emit('open-detail', id, inst)" @use="emit('use', $event)"
                        @storage="emit('move-storage', $event)" @discard="emit('ask-card-discard', $event)"
                        @discard-instance="emit('discard-gear-instance', $event)"
                        @equip="emit('equip-gear-instance', $event)"
                        @sell="onSellCard($event)" />
                    </div>
                  </div>
                </template>
                <EmptyState v-else>{{ emptyText }}</EmptyState>
              </div>
            </template>
          </Tabs>
        </div>
      </template>

      <!-- ── 仓库 ── -->
      <template #storage>
        <div class="xy-pack-list xy-panel-tabs">
          <!-- 仓库切换条：每座一钮，点击切换当前仓；可建造时追加「建造仓库」 -->
          <div class="xy-storage-tabs">
            <button v-for="w in pack.warehouses" :key="w.id" type="button" class="xy-storage-tab"
              :class="{ 'is-active': w.id === pack.activeWarehouseId }" @click="pack.switchActiveWarehouse(w.id)">
              {{ w.name }}<span class="xy-storage-tab-count">{{ usedOf(w) }}/{{ w.slots.length }}</span>
            </button>
            <button v-if="pack.canBuildWarehouse" type="button" class="xy-storage-tab xy-storage-tab--build"
              :disabled="!canBuild" :title="buildHint" @click="askBuild = true">
              建造仓库
            </button>
          </div>

          <div class="xy-storage-head">
            <p class="xy-panel-hint">{{ pack.activeWarehouse?.name ?? '仓库' }} {{ pack.storageCapacity }}/{{ MAX_STORAGE }} 格</p>
            <div class="xy-storage-actions">
              <Button size="small" variant="ghost" @click="askRename">改名</Button>
              <Button size="small" variant="energy" :disabled="pack.storageCapacity >= MAX_STORAGE" @click="askExpand = true">
                扩容 · {{ pack.expandCost() }} 金钱
              </Button>
            </div>
          </div>

          <p class="xy-panel-hint xy-storage-buildcost">建造下一座：{{ buildCostText }}</p>

          <div class="xy-card-grid">
            <template v-for="s in storageSlots" :key="s.index">
              <PackItemCard v-if="s.item" :item="s.item" :count="s.count" in-storage
                @open="emit('open-storage-cell', s.index)" />
              <button v-else type="button" class="xy-storage-cell"
                :aria-label="`空位，第 ${s.index + 1} 格`" @click="emit('open-storage-cell', s.index)">
                <span class="xy-storage-count">空</span>
                <span class="xy-storage-name">空位</span>
              </button>
            </template>
          </div>
        </div>

        <!-- 仓库改名 -->
        <Dialog v-model="renameOpen" title="重命名仓库" width="320px">
          <TacticalInput v-model="renameValue" type="text" placeholder="仓库名（最多 8 字）" maxlength="8" />
          <div class="xy-storage-rename-actions">
            <Button size="small" @click="renameOpen = false">取消</Button>
            <Button size="small" variant="primary" :disabled="!renameValue.trim()" @click="confirmRename">确定</Button>
          </div>
        </Dialog>

        <!-- 建造仓库二次确认（材料不可逆消耗） -->
        <ConfirmDialog v-model="askBuild" title="建造仓库" :message="buildMsg" confirm-text="建造"
          @confirm="pack.buildWarehouse()" />

        <!-- 扩容二次确认（金钱不可逆消耗，作用于当前仓） -->
        <ConfirmDialog v-model="askExpand" title="扩容仓库" :message="expandMsg" confirm-text="扩容"
          @confirm="pack.expandStorage()" />
      </template>

      <!-- ── 坊市 ── -->
      <template #shop>
        <div class="xy-pack-list xy-panel-tabs">
          <div class="xy-shop-head">
            <p class="xy-panel-hint">每日刷新 · 当前上架 {{ pack.shopGoods.length }} 种</p>
            <Button size="small" variant="energy" @click="pack.refreshShop()">刷新商品</Button>
          </div>
          <div v-for="g in pack.shopGoods" :key="g.name" class="xy-row-card xy-shop-row">
            <div class="xy-row-top">
              <span class="xy-row-name">{{ g.name }}</span>
              <span class="xy-chip xy-chip--jade">{{ g.type }}</span>
              <span v-if="g.tag" class="xy-chip" :class="g.tag === '限量' ? 'xy-chip--gold' : 'xy-chip--seal'">{{ g.tag }}</span>
              <span class="xy-shop-price">{{ pack.shopPrice(g) }} 金钱</span>
            </div>
            <div class="xy-row-bottom">
              <p class="xy-row-desc">库存 {{ g.stock }}</p>
              <button v-if="g.stock > 0" type="button" class="xy-shop-buy" @click="toggleBuy(g)">购买</button>
              <span v-else class="xy-chip xy-chip--muted">已售罄</span>
            </div>

            <div v-if="buyState && buyState.good.name === g.name" class="xy-shop-buybox">
              <div class="xy-shop-qty">
                <Button size="small" :disabled="buyState.count <= 1" @click="buyState.count--">−</Button>
                <span class="xy-shop-qty-num">{{ buyState.count }}</span>
                <Button size="small" :disabled="buyState.count >= buyMax(g)" @click="buyState.count++">＋</Button>
              </div>
              <p class="xy-shop-total">总价 {{ pack.shopPrice(g) * buyState.count }} 金钱</p>
              <Button size="small" variant="primary" :disabled="walletShort(g) !== null" @click="doBuy(g)">确认购买</Button>
              <p v-if="walletShort(g)" class="xy-shop-diff">差额 {{ walletShort(g) }} 金钱</p>
            </div>
          </div>
          <p class="xy-panel-hint">
            金钱 {{ pack.currency.money.toLocaleString() }} · 灵韵 {{ pack.currency.xianyuan }}
          </p>
        </div>
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TabItem } from '@/presentation/components'

import { usePackStore, MAX_STORAGE, type GearInstance, type Warehouse } from '@/presentation/stores/packStore'
import { fabaoDefByName, purchaseFabaoGood } from '../fabao'
import { ITEM_CATEGORIES, type ItemCategoryId } from '@/shared/constants/item-types'
import type { XiyouCatalogItem, XiyouShopGood } from '../types'
import PackItemCard from './PackItemCard.vue'
import StatFilterPanel from './StatFilterPanel.vue'
import {
  collectStatOptions,
  filterStatTargets,
  makeStatTarget,
  sortStatTargets,
  type StatCondition,
  type StatSortKey,
} from '../statFilter'

const props = defineProps<{
  /** 当前激活页签（v-model:sub，互斥由父级保证） */
  sub: PackSub
  /** 对侧面板当前占用的页签：本侧该页签禁用（互斥 = 禁止切换，而非挤占对侧） */
  excluded?: PackSub | null
  /** 全局选中的物品 id（用于卡片高亮，弹窗在父级统一管理） */
  selectedId: string | null
}>()

const emit = defineEmits<{
  'update:sub': [PackSub]
  'open-detail': [itemId: string, instanceId?: string]
  'use': [itemId: string]
  'move-storage': [itemId: string]
  'ask-card-discard': [itemId: string]
  'discard-gear-instance': [instanceId: string]
  'equip-gear-instance': [instanceId: string]
  'open-storage-cell': [index: number]
}>()

/** 卡片右键「出售」：全部卖出（数量 = 当前持有），结果经 pack.sell 提示 */
function onSellCard(itemId: string): void {
  const count = pack.countOf(itemId)
  if (count <= 0) return
  pack.sell(itemId, count)
}

function onSubChange(v: string): void {
  emit('update:sub', v as PackSub)
}

const pack = usePackStore()

const SUBS: TabItem[] = [
  { id: 'pack', label: '背包' },
  { id: 'storage', label: '仓库' },
  { id: 'shop', label: '坊市' },
]

/** 互斥页签：对侧占用的 tab 禁用（disabled 由 Tabs 处理点击/键盘跳过） */
const tabs = computed<TabItem[]>(() =>
  SUBS.map((t) => (t.id === props.excluded ? { ...t, disabled: true } : t)),
)

/**
 * 背包二级分类：分类树单源派生（@/shared/constants/item-types ITEM_CATEGORIES）+「全部」首组。
 * 类型归属调整去 item-types.ts 改，勿在此手补——漏登记的类型行囊分类页签会漏收。
 */
type PackCatId = ItemCategoryId | 'all'
const PACK_CATEGORIES: ReadonlyArray<{ id: PackCatId; label: string; types: readonly string[] }> = [
  { id: 'all', label: '全部', types: [] },
  ...ITEM_CATEGORIES,
]

const cat = ref<PackCatId>('all')

const PACK_TABS: TabItem[] = PACK_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))

/* ── 搜索 + 排序 ── */
const keyword = ref('')
const debouncedKeyword = ref('')
let kwTimer: ReturnType<typeof setTimeout> | null = null
watch(keyword, () => {
  if (kwTimer) clearTimeout(kwTimer)
  kwTimer = setTimeout(() => {
    debouncedKeyword.value = keyword.value.trim()
  }, 300)
})

type PackSortKey = 'default' | 'rarity-desc' | 'rarity-asc' | 'name' | 'count-desc'
const sortBy = ref<PackSortKey>('default')

const SORT_OPTIONS = [
  { value: 'default', label: '默认排序' },
  { value: 'rarity-desc', label: '品质降序' },
  { value: 'rarity-asc', label: '品质升序' },
  { value: 'name', label: '名称' },
  { value: 'count-desc', label: '数量降序' },
]

/** 全局过滤（搜索交集）+ 排序，作为各分类面板的数据源 */
const filtered = computed<XiyouCatalogItem[]>(() => {
  let list = pack.ownedItems
  const kw = debouncedKeyword.value
  if (kw) {
    list = list.filter((it) =>
      [it.name, it.type, it.source ?? '', it.description ?? ''].some((s) => s.includes(kw)),
    )
  }
  const by = sortBy.value
  if (by === 'rarity-desc') return [...list].sort((a, b) => b.rarity - a.rarity)
  if (by === 'rarity-asc') return [...list].sort((a, b) => a.rarity - b.rarity)
  if (by === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  if (by === 'count-desc') return [...list].sort((a, b) => countOf(b.id) - countOf(a.id))
  return list
})

/** 装备词条筛选条件（会话级，不落存档）与排序键（下标 0 主键 / 1 次键） */
const gearConditions = ref<StatCondition[]>([])
const gearSorts = ref<StatSortKey[]>([])

/** 背包装备实例 + 属性投影（筛选/排序的唯一数据源，口径同装备池：核心 + 词条） */
const gearStatEntries = computed(() =>
  pack.packGearInstances().map((g) => ({
    gear: g,
    target: makeStatTarget({
      id: g.instanceId,
      name: pack.catalogById(g.itemId)?.name ?? g.itemId,
      quality: g.quality,
      rows: pack.instanceStats(g),
    }),
  })),
)

/** 候选属性：只收录当前背包装备真实出现过的属性 */
const gearStatOptions = computed(() => collectStatOptions(gearStatEntries.value.map((e) => e.target)))

/** 已筛选 + 排序的装备实例（全局序列，按 itemId 归组与跨条目重排都以它为序） */
const orderedGearInstances = computed<GearInstance[]>(() => {
  const targets = filterStatTargets(gearStatEntries.value.map((e) => e.target), gearConditions.value)
  const ordered = sortStatTargets(targets, gearSorts.value)
  const gearById = new Map(gearStatEntries.value.map((e) => [e.target.id, e.gear]))
  return ordered.map((t) => gearById.get(t.id)).filter((g): g is GearInstance => g !== undefined)
})

/** 装备实例的全局排序位（instanceId → 序号；条目在序列中连续，取首个实例即代表该条目位次） */
const gearRankById = computed<Map<string, number>>(() => {
  const rank = new Map<string, number>()
  orderedGearInstances.value.forEach((g, i) => rank.set(g.instanceId, i))
  return rank
})

/** 已筛选 + 排序的装备实例，按 itemId 归组（供各分类 tab 直接取用） */
const filteredGearByItem = computed<Map<string, GearInstance[]>>(() => {
  const map = new Map<string, GearInstance[]>()
  for (const gear of orderedGearInstances.value) {
    const group = map.get(gear.itemId)
    if (group) group.push(gear)
    else map.set(gear.itemId, [gear])
  }
  return map
})

/** 装备条目在全局排序序列中的位次；非装备条目（或未命中筛选）排到末尾，保持原相对顺序 */
function gearRankOf(itemId: string): number {
  const first = filteredGearByItem.value.get(itemId)?.[0]
  return first ? gearRankById.value.get(first.instanceId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
}

/** 空态文案：筛选态优先提示「筛选」，其次关键词，最后才是分类本身为空 */
const emptyText = computed(() => {
  if (gearConditions.value.length > 0) return '没有符合筛选条件的装备'
  return debouncedKeyword.value ? `未找到「${debouncedKeyword.value}」相关物品` : '该分类下暂无物品'
})

/** 背包卡片视图：普通物品一张聚合卡；装备逐实例展开（key=instanceId，不叠加） */
interface PackCard {
  key: string
  item: XiyouCatalogItem
  gear?: GearInstance
}

/** 按二级分类过滤 + 按 type 分组（组顺序 = items.json 顺序），装备组内逐实例展开并应用词条筛选/排序 */
function displayGroups(types: readonly string[]): Array<{ type: string; cards: PackCard[] }> {
  const base = types.length === 0 ? filtered.value : filtered.value.filter((it) => types.includes(it.type))

  // 先按 type 归组（组顺序取目录序，不受排序影响，避免分组标题随排序跳动）
  const byType = new Map<string, XiyouCatalogItem[]>()
  for (const it of base) {
    const group = byType.get(it.type)
    if (group) group.push(it)
    else byType.set(it.type, [it])
  }

  const out: Array<{ type: string; cards: PackCard[] }> = []
  for (const [type, items] of byType) {
    // NOTE: 组内装备条目按词条排序位重排，使「排序」跨不同装备条目生效（否则只在同 itemId 实例组内有序）。
    // 无排序键时保持目录序；Array.sort 稳定，非装备条目（位次并列最大）维持原相对顺序。
    const orderedItems =
      gearSorts.value.length > 0 ? [...items].sort((a, b) => gearRankOf(a.id) - gearRankOf(b.id)) : items
    const cards: PackCard[] = []
    for (const it of orderedItems) {
      if (!pack.gearById(it.id)) {
        cards.push({ key: it.id, item: it })
        continue
      }
      const insts = filteredGearByItem.value.get(it.id)
      // 装备被筛选条件排除时不占位（否则会留下「空分组标题」）
      if (!insts) continue
      cards.push(...insts.map((g) => ({ key: g.instanceId, item: it, gear: g })))
    }
    if (cards.length > 0) out.push({ type, cards })
  }
  return out
}

function countOf(itemId: string): number {
  return pack.countOf(itemId)
}

/** 当前仓格数据：目录缺失的 itemId 视同空位渲染 */
const storageSlots = computed<Array<{ index: number; item: XiyouCatalogItem | null; count: number }>>(() =>
  (pack.activeWarehouse?.slots ?? []).map((slot, index) => ({
    index,
    item: slot.itemId ? pack.catalogById(slot.itemId) ?? null : null,
    count: slot.count,
  })),
)

/* ── 多仓库（切换 / 建造 / 改名） ── */

/** 建造成本展示文案：名称×数量 以 + 连接 */
function costText(cost: Array<{ itemId: string; count: number }>): string {
  return cost.map((m) => `${pack.catalogById(m.itemId)?.name ?? m.itemId}×${m.count}`).join(' + ')
}

/** 某仓已用格数（有物品的格子） */
function usedOf(w: Warehouse): number {
  return w.slots.filter((s) => !!s.itemId).length
}

/** 下一座仓库建造成本（材料）；已达上限为 null */
const nextBuildCost = computed(() => pack.buildCost())

/** 建造材料是否充足 */
const canBuild = computed(() => {
  const cost = nextBuildCost.value
  return !!cost && cost.every((m) => countOf(m.itemId) >= m.count)
})

/** 下一座建造成本文案 */
const buildCostText = computed(() => {
  const cost = nextBuildCost.value
  return cost ? costText(cost) : '已达上限'
})

/** 建造按钮悬停提示（缺料时列出缺料项） */
const buildHint = computed(() => {
  const cost = nextBuildCost.value
  if (!cost) return '仓库已达上限'
  const lack = cost.filter((m) => countOf(m.itemId) < m.count)
  return lack.length ? `材料不足：${costText(lack)}` : '建造新仓库'
})

/** 改名弹窗 */
const renameOpen = ref(false)
const renameValue = ref('')

function askRename(): void {
  renameValue.value = pack.activeWarehouse?.name ?? ''
  renameOpen.value = true
}

function confirmRename(): void {
  if (!pack.activeWarehouse) return
  if (pack.renameWarehouse(pack.activeWarehouse.id, renameValue.value)) renameOpen.value = false
}

/** 建造二次确认（材料不可逆消耗） */
const askBuild = ref(false)

/** 建造确认文案：材料清单 */
const buildMsg = computed(() => {
  const cost = nextBuildCost.value
  return cost ? `消耗 ${costText(cost)} 建造一座新仓库？` : ''
})

/** 扩容二次确认（金钱不可逆消耗，作用于当前仓） */
const askExpand = ref(false)

/** 扩容确认文案：当前仓下一次扩容消耗（容量未达上限时按钮才可用，故固定 +6 格） */
const expandMsg = computed(() => `消耗 金钱 ×${pack.expandCost()} 扩容 6 格？`)

/* ── 坊市购买 ── */
interface BuyState {
  good: XiyouShopGood
  count: number
}
const buyState = ref<BuyState | null>(null)

function toggleBuy(g: XiyouShopGood): void {
  buyState.value = buyState.value?.good.name === g.name ? null : { good: g, count: 1 }
}

function buyMax(g: XiyouShopGood): number {
  const price = pack.shopPrice(g)
  const byMoney = price > 0 ? Math.floor(pack.currency.money / price) : 0
  const byStock = g.stock < 0 ? Infinity : g.stock
  return Math.max(1, Math.min(byMoney, byStock))
}

/** 余额差额（不足返回正数，足够返回 null） */
function walletShort(g: XiyouShopGood): number | null {
  const total = pack.shopPrice(g) * buyState.value!.count
  const short = total - pack.currency.money
  return short > 0 ? short : null
}

function doBuy(g: XiyouShopGood): void {
  if (!buyState.value) return
  // 法宝/神器为目录外商品（名字不在物品目录），走 fabao 购买桥（价格口径同为 shopPrice）
  const err = fabaoDefByName(g.name)
    ? purchaseFabaoGood(g, buyState.value.count, pack.shopPrice(g))
    : pack.purchase(g, buyState.value.count)
  if (err === null) buyState.value = null
}

</script>

<style scoped lang="scss">
/* 单侧面板：撑满父级 grid cell，内部 Tabs 纵向铺满 */
.xy-pack-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;

  :deep(.tabs-root) {
    flex: 1;
    min-height: 0;
  }
}

.xy-pack-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.xy-pack-sub {
  flex: 1;
  min-height: 0;
}

.xy-pack-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 四周留白兜住卡片 hover 上移 4px + 外圈 ring（同 xy-gear-side/xy-roster-pack-list 口径） */
  padding: 14px var(--space-3);
  /* 容器宽度基准：驱动下方 @container 卡片多列自适应 */
  container-type: inline-size;
}

/* 行囊卡片网格：窄容器（行路态 290px 宝阁）保持 2 列紧凑；宽容器（全屏宝阁）自动增列，
   避免 feature 态卡片被拉得过宽（修复行囊豁免全局 grid 化后的回归） */
@container (min-width: 420px) {
  .xy-card-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}

.xy-pack-tabs,
.xy-pack-sub {
  /* 公共 Tabs 融入水墨主题：朱印为激活色 */
  --tabs-accent: var(--xy-seal);
  --tabs-accent-glow: rgba(var(--rgb-brand-red), var(--alpha-glow));
}

/* 一级 tabs 独占一行居中 */
.xy-pack-tabs :deep(.tabs-header) {
  justify-content: center;
}

/* 二级分类 tab：窄屏横向滚动兜底 */
.xy-pack-sub {
  margin-bottom: var(--space-3);

  :deep(.tabs-header) {
    overflow-x: auto;
  }
}

.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 坊市刷新栏 ── */
.xy-shop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);

  .xy-panel-hint {
    margin: 0;
  }
}

/* ── 背包工具栏（搜索 + 排序） ── */
.xy-pack-toolbar {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin-bottom: var(--space-3);

  .t-select {
    width: 9rem;
  }
}

/* 词条筛选面板：工具栏下方独占一行 */
.xy-pack-sf {
  margin-bottom: var(--space-3);
}

.xy-pack-search {
  flex: 1;
  min-width: 0;
}

.xy-pack-sort {
  flex-shrink: 0;
}

/* ── 背包 ── */
.xy-cabinet-cat {
  margin-bottom: var(--space-4);
}

/* 分组标题的数量紧跟类型（覆盖 xiyou.scss 全局 margin-left:auto 右推） */
.xy-sec-title .xy-sec-count {
  margin-left: 0;
}

/* ── 仓库（有物品的格子复用 PackItemCard，仅空位保留虚线格） ── */
/* 仓库切换条：每座一钮 + 建造入口 */
.xy-storage-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.xy-storage-tab {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
  color: var(--xy-ink-2);
  font-family: inherit;
  font-size: var(--font-size-md);
  cursor: pointer;

  &:hover {
    border-color: var(--xy-seal);
  }

  &.is-active {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.xy-storage-tab-count {
  color: var(--xy-ink-4);
  font-size: var(--font-size-md);
}

.xy-storage-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-storage-buildcost {
  margin-top: calc(-1 * var(--space-2));
}

.xy-storage-rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.xy-storage-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);

  .xy-panel-hint {
    margin: 0;
  }
}

.xy-storage-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  align-self: start;
  padding: var(--space-2) 0;
  border: 1px dashed var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
  cursor: pointer;
  font-family: inherit;

  &:hover {
    border-color: var(--xy-seal);
  }
}

.xy-storage-count {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-storage-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

/* ── 坊市 ── */
.xy-shop-price {
  margin-left: auto;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  color: var(--xy-ink-2);

}

.xy-row-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);

  .xy-row-desc {
    margin: 0;
  }
}

/* .xy-shop-buy 已提升到 xiyou.scss 全局（EquipPanel/MatePanel/TowerPanel 等跨组件使用，
   scoped 定义对它们不可达——按钮曾回落浏览器默认样式） */
.xy-shop-buybox {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--xy-ink-line);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.xy-shop-qty {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-shop-qty-num {
  min-width: 2.5em;
  text-align: center;
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-shop-total {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

.xy-shop-diff {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--color-debuff);
}
</style>
