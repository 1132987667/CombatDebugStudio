<template>
  <div class="xy-panel-scroll">
    <!-- 子系统页签 -->
    <div class="xy-panel-tabs" role="tablist" aria-label="行囊子系统">
      <button v-for="s in SUBS" :key="s.id" type="button" role="tab" class="xy-panel-tab"
        :class="{ active: sub === s.id }" :aria-selected="sub === s.id" @click="sub = s.id">
        {{ s.label }}
      </button>
    </div>

    <!-- 背包 -->
    <div v-if="sub === 'pack'">
      <div v-for="cat in packCats" :key="cat.key" class="xy-cabinet-cat">
        <h4 class="xy-sec-title">{{ cat.label }}<span class="xy-sec-count">×{{ cat.items.length }}</span></h4>
        <div class="xy-card-grid">
          <button v-for="it in cat.items" :key="it.name" type="button" class="xy-item-card xy-ink-hover">
            <span class="xy-item-name">{{ it.name }}</span>
            <span class="xy-item-count">×{{ it.count }}</span>
            <span class="xy-item-rarity" :class="rarityClass(it.rarity)">{{ it.rarity }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 仓库 -->
    <div v-else-if="sub === 'storage'">
      <p class="xy-panel-hint">仓库共 12 格 · 解锁后可用灵石扩容</p>
      <div class="xy-storage-grid">
        <div v-for="(c, i) in storageCells" :key="i" class="xy-storage-cell" :class="{ locked: c.locked }">
          <span class="xy-storage-count">{{ c.locked ? '锁' : `×${c.count}` }}</span>
          <span class="xy-storage-name">{{ c.locked ? '空位' : c.name }}</span>
        </div>
      </div>
    </div>

    <!-- 坊市 -->
    <div v-else class="xy-shop">
      <div v-for="g in shopGoods" :key="g.name" class="xy-row-card xy-shop-row">
        <div class="xy-row-top">
          <span class="xy-row-name">{{ g.name }}</span>
          <span class="xy-chip xy-chip--jade">{{ g.type }}</span>
          <span v-if="g.tag" class="xy-chip" :class="g.tag === '限量' ? 'xy-chip--gold' : 'xy-chip--seal'">{{ g.tag }}</span>
          <span class="xy-shop-price" :class="`xy-shop-price--${g.unit}`">{{ g.price }} {{ g.unit }}</span>
        </div>
        <p class="xy-row-desc">库存 {{ g.stock }}</p>
      </div>
      <p class="xy-panel-hint">铜钱 {{ currency.copper.toLocaleString() }} · 银两 {{ currency.silver }} · 灵石 {{ currency.jade }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { consumables, currency, equipment, materials, pills, shopGoods, storageCells } from '../data/mock'

const sub = ref<'pack' | 'storage' | 'shop'>('pack')

const SUBS = [
  { id: 'pack', label: '背包' },
  { id: 'storage', label: '仓库' },
  { id: 'shop', label: '坊市' },
] as const

const packCats = [
  { key: 'materials', label: '材料', items: materials },
  { key: 'equipment', label: '装备', items: equipment },
  { key: 'pills', label: '丹药', items: pills },
  { key: 'consumables', label: '消耗品', items: consumables },
]

const RARITY_TO_Q: Record<string, string> = { 普通: '凡品', 稀有: '玄品', 珍品: '天品', 仙品: '仙品' }

function rarityClass(rarity: string): string {
  return `xy-q--${RARITY_TO_Q[rarity] ?? '凡品'}`
}
</script>

<style scoped lang="scss">
.xy-panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding-right: var(--space-2);
}

.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 背包 ── */
.xy-cabinet-cat {
  margin-bottom: var(--space-4);
}

.xy-item-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  border-radius: 2px;

  &:hover {
    border-color: var(--xy-ink-2);
  }
}

.xy-item-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-item-count {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-item-rarity {
  font-size: var(--font-size-md);
}

/* ── 仓库 ── */
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

  &.locked {
    opacity: 0.45;
    background: var(--color-bg-secondary);
  }
}

.xy-storage-count {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
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
</style>
