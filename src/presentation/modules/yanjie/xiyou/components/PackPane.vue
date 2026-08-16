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

          <Tabs v-model="cat" :tabs="PACK_TABS" size="sm" destroy-inactive class="xy-pack-sub">
            <template v-for="c in PACK_CATEGORIES" :key="c.id" #[c.id]>
              <div class="xy-pack-list xy-panel-tabs">
                <template v-if="displayGroups(c.types).length">
                  <div v-for="group in displayGroups(c.types)" :key="group.type" class="xy-cabinet-cat">
                    <h4 class="xy-sec-title">{{ group.type }}<span class="xy-sec-count">×{{ group.items.length }}</span></h4>
                    <div class="xy-card-grid">
                      <PackItemCard
                        v-for="it in group.items" :key="it.id"
                        :item="it" :count="countOf(it.id)" :selected="selectedId === it.id"
                        @open="emit('open-detail', $event)" @use="emit('use', $event)"
                        @storage="emit('move-storage', $event)" @discard="emit('ask-card-discard', $event)"
                        @sell="onSellCard($event)" />
                    </div>
                  </div>
                </template>
                <EmptyState v-else>{{ keyword.trim() ? '未找到「' + keyword.trim() + '」相关物品' : '该分类下暂无物品' }}</EmptyState>
              </div>
            </template>
          </Tabs>
        </div>
      </template>

      <!-- ── 仓库 ── -->
      <template #storage>
        <div class="xy-pack-list xy-panel-tabs">
          <div class="xy-storage-head">
            <p class="xy-panel-hint">仓库 {{ pack.storageCapacity }}/{{ MAX_STORAGE }} 格</p>
            <Button size="small" variant="energy" :disabled="pack.storageCapacity >= MAX_STORAGE" @click="pack.expandStorage()">
              扩容 · {{ pack.expandCost() }} 灵石
            </Button>
          </div>
          <div class="xy-storage-grid">
            <button v-for="(slot, i) in pack.storage" :key="i" type="button" class="xy-storage-cell"
              :class="{ 'is-empty': !slot.itemId }" @click="emit('open-storage-cell', i)">
              <span class="xy-storage-count" :class="{ 'is-empty': !slot.itemId }">{{ slot.itemId ? `×${slot.count}` : '空' }}</span>
              <span class="xy-storage-name" :style="slot.itemId ? { color: qualityColor(pack.catalogById(slot.itemId)?.rarity ?? 1) } : undefined">{{ slot.itemId ? nameOf(slot.itemId) : '空位' }}</span>
            </button>
          </div>
        </div>
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
              <span class="xy-shop-price" :class="`xy-shop-price--${g.unit}`">{{ pack.shopPrice(g) }} {{ g.unit }}</span>
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
              <p class="xy-shop-total">总价 {{ pack.shopPrice(g) * buyState.count }} {{ g.unit }}</p>
              <Button size="small" variant="primary" :disabled="walletShort(g) !== null" @click="doBuy(g)">确认购买</Button>
              <p v-if="walletShort(g)" class="xy-shop-diff">差额 {{ walletShort(g) }} {{ g.unit }}</p>
            </div>
          </div>
          <p class="xy-panel-hint">
            铜钱 {{ pack.currency.copper.toLocaleString() }} · 银两 {{ pack.currency.silver }} · 灵石 {{ pack.currency.jade }}
          </p>
        </div>
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/presentation/components/Button.vue'
import EmptyState from '@/presentation/components/EmptyState.vue'
import Tabs from '@/presentation/components/Tabs.vue'
import type { TabItem } from '@/presentation/components/Tabs.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'
import TacticalSelect from '@/presentation/components/TacticalSelect.vue'
import { usePackStore } from '@/presentation/stores/packStore'
import type { XiyouCatalogItem, XiyouShopGood } from '../types'
import { qualityColor } from '../quality'
import PackItemCard from './PackItemCard.vue'

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
  'open-detail': [itemId: string]
  'use': [itemId: string]
  'move-storage': [itemId: string]
  'ask-card-discard': [itemId: string]
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

const MAX_STORAGE = 36

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
 * 背包二级分类（方案二 2.2：40 种 type → 7 组）
 * NOTE: 原方案 7 组遗漏「图纸」type，归入材料组（图纸为制造配方，属制造链路），避免物品无处归类。
 */
const PACK_CATEGORIES = [
  { id: 'all', label: '全部', types: [] as string[] },
  { id: 'equip', label: '装备', types: ['武器', '衣服', '头盔', '靴子', '护符', '戒指', '法宝', '神器'] },
  { id: 'consumable', label: '消耗', types: ['丹药', '永久丹药', '符箓', '晶球', '药引', '经验丹', '卷轴'] },
  { id: 'material', label: '材料', types: ['木材', '矿石', '金属', '玉石', '水产', '皮革', '织物', '陶瓷', '古董', '液体', '毒物', '特殊材料', 'BOSS材料', '图纸', '草药', '制造辅助'] },
  { id: 'essence', label: '灵气', types: ['灵气', '碎片'] },
  { id: 'enhance', label: '强化', types: ['强化', '升星', '精锻', '洗练', '洗炼', '重铸', '传承', '分解', '突破', '技能书', '经验'] },
  { id: 'misc', label: '杂物', types: ['货币', '杂物', '钥匙', '门票', '任务', '器灵', '套装烙印', '功能道具'] },
] as const

type PackCatId = (typeof PACK_CATEGORIES)[number]['id']

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

/** 按二级分类过滤 + 按 type 分组（保持 items.json 顺序） */
function displayGroups(types: readonly string[]): Array<{ type: string; items: XiyouCatalogItem[] }> {
  const list = types.length === 0 ? filtered.value : filtered.value.filter((it) => types.includes(it.type))
  const map = new Map<string, XiyouCatalogItem[]>()
  for (const it of list) {
    const group = map.get(it.type)
    if (group) group.push(it)
    else map.set(it.type, [it])
  }
  return [...map.entries()].map(([type, items]) => ({ type, items }))
}

function countOf(itemId: string): number {
  return pack.countOf(itemId)
}

function nameOf(itemId: string): string {
  return pack.catalogById(itemId)?.name ?? itemId
}

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
  const key = UNIT_KEY[g.unit]
  const price = pack.shopPrice(g)
  const byMoney = price > 0 ? Math.floor(pack.currency[key] / price) : 0
  const byStock = g.stock < 0 ? Infinity : g.stock
  return Math.max(1, Math.min(byMoney, byStock))
}

/** 余额差额（不足返回正数，足够返回 null） */
function walletShort(g: XiyouShopGood): number | null {
  const key = UNIT_KEY[g.unit]
  const total = pack.shopPrice(g) * buyState.value!.count
  const short = total - pack.currency[key]
  return short > 0 ? short : null
}

function doBuy(g: XiyouShopGood): void {
  if (!buyState.value) return
  const err = pack.purchase(g, buyState.value.count)
  if (err === null) buyState.value = null
}

const UNIT_KEY: Record<XiyouShopGood['unit'], 'copper' | 'silver' | 'jade'> = {
  铜钱: 'copper',
  银两: 'silver',
  灵石: 'jade',
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
  padding-left: var(--space-2);
  padding-right: var(--space-2);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
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

/* ── 仓库 ── */
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

.xy-storage-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
}

.xy-storage-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-2) 0;
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
  cursor: pointer;
  font-family: inherit;

  &.is-empty {
    border-style: dashed;
  }

  &:hover {
    border-color: var(--xy-seal);
  }
}

.xy-storage-count {
  font-size: var(--font-size-md);
  color: var(--xy-seal);

  &.is-empty {
    color: var(--xy-ink-4);
  }
}

.xy-storage-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  white-space: nowrap;
}

/* ── 坊市 ── */
.xy-shop-price {
  margin-left: auto;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  color: var(--xy-ink-2);

  &--灵石 {
    color: var(--xy-gold);
  }

  &--银两 {
    color: var(--color-skill-active);
  }

  &--铜钱 {
    color: var(--xy-ink-2);
  }
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

.xy-shop-buy {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--xy-seal);
  border-radius: 2px;
  background: var(--xy-seal-soft);
  color: var(--xy-seal);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);

  &:hover {
    background: var(--xy-seal);
    color: #fff;
  }
}

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
