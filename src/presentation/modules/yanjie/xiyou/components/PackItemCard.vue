<template>
  <div class="xy-item-card-wrap">
    <button type="button"
      :class="['xy-item-card', `xy-item-card--r${item.rarity}`, { 'is-selected': selected }, 'xy-ink-hover']"
      :aria-label="`${item.name} ×${count}`" @mouseenter="onEnter" @mouseleave="onLeave" @click="$emit('open', item.id)"
      @contextmenu.prevent="openMenu($event)">
      <span class="xy-item-title">
        <span class="xy-item-name" :class="qualityClass(item.rarity)">{{ item.name }}</span>
        <span class="xy-item-type">{{ item.type }}</span>
      </span>
      <span class="xy-item-meta">
        <span v-if="sellable" class="xy-item-price">
          <span class="xy-item-price-icon" aria-hidden="true" v-html="moneyIcon"></span>
          <span class="xy-item-price-value">{{ item.sellPrice }}</span>
        </span>
        <span class="xy-item-count" :class="{ 'is-sellable': sellable }">×{{ count }}</span>
      </span>
    </button>

    <!-- 悬浮信息卡（复用 EntityTooltip 范式：Teleport + rect 定位 + 视口翻转） -->
    <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="triggerRect"
      @hide="tooltipVisible = false" />

    <!-- 右键操作菜单 -->
    <Teleport to="body">
      <div v-if="menuOpen" ref="menuRef" class="xy-ctx" role="menu" :style="menuStyle" aria-label="物品操作">
        <button v-if="showUse" type="button" class="xy-ctx-item" :disabled="!canUseNow"
          :title="inBattleOnly ? '仅战斗中可用（行囊·快捷栏）' : undefined" @click="act('use')">使用</button>
        <button v-if="canStore" type="button" class="xy-ctx-item" @click="act('storage')">存入仓库</button>
        <button v-if="canDiscard" type="button" class="xy-ctx-item xy-ctx-item--danger"
          @click="act('discard')">丢弃</button>
        <button type="button" class="xy-ctx-item" @click="act('open')">查看详情</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import EntityTooltip from '@/presentation/components/EntityTooltip.vue'
import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import moneyIconRaw from '@/presentation/assets/icons/money.svg?raw'
import { usePackStore } from '@/presentation/stores/packStore'
import { qualityClass, qualityColor, qualityOf } from '../quality'
import type { XiyouCatalogItem } from '../types'

/** 货币图标（money.svg 单行 XML → 提取 <svg>，随 ControlBar.vue 惯例 v-html 内联以便 CSS 着色） */
const moneyIcon = moneyIconRaw.replace(/^[\s\S]*?(<svg[\s\S]*<\/svg>)/, '$1')

const props = defineProps<{
  item: XiyouCatalogItem
  count: number
  selected?: boolean
}>()

const emit = defineEmits<{
  (e: 'open', itemId: string): void
  (e: 'use', itemId: string): void
  (e: 'storage', itemId: string): void
  (e: 'discard', itemId: string): void
}>()

const pack = usePackStore()

/* ── 悬浮信息 ── */
const tooltipVisible = ref(false)
const triggerRect = ref<DOMRect | null>(null)

const tooltipData = computed<TooltipData>(() => ({
  name: props.item.name,
  description: props.item.description ?? '暂无描述',
  badge: qualityOf(props.item.rarity),
  // 悬浮面板在 body 层（无 --xy-* 变量），用全局 --color-* 令牌映射品阶色
  nameColor: qualityColor(props.item.rarity),
  badgeColor: qualityColor(props.item.rarity),
  details: [
    { label: '类型', value: props.item.type },
    { label: '持有', value: `×${props.count}` },
  ],
  source: props.item.source,
}))

function onEnter(e: MouseEvent): void {
  triggerRect.value = (e.currentTarget as HTMLElement)?.getBoundingClientRect() ?? null
  tooltipVisible.value = true
}

function onLeave(): void {
  tooltipVisible.value = false
}

/* ── 右键菜单 ── */
const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
let removeDocListener: (() => void) | null = null

const canUseNow = computed(() => pack.canUseOutOfBattle(props.item.id))
/** 恢复/增益类丹药：战斗外不可用（禁用态，引导快捷栏） */
const inBattleOnly = computed(() => !!props.item.effects?.[0] && !canUseNow.value)
const showUse = computed(() => canUseNow.value || inBattleOnly.value)

const canStore = computed(() => props.count > 0 && pack.storage.some((s) => !s.itemId))
const canDiscard = computed(() => props.count > 0 && props.item.type !== '任务')

/** 可出售：items.json sellPrice > 0（无该字段视为不可出售，如任务/钥匙/宝箱） */
const sellable = computed(() => (props.item.sellPrice ?? 0) > 0)

function openMenu(e: MouseEvent): void {
  tooltipVisible.value = false
  menuStyle.value = {
    left: `${Math.min(e.clientX, window.innerWidth - 132)}px`,
    top: `${Math.min(e.clientY, window.innerHeight - 168)}px`,
  }
  menuOpen.value = true
  removeDocListener = () => {
    window.removeEventListener('mousedown', onDocMouseDown, true)
  }
  window.addEventListener('mousedown', onDocMouseDown, true)
}

function onDocMouseDown(e: MouseEvent): void {
  if (menuRef.value?.contains(e.target as Node)) return
  closeMenu()
}

function closeMenu(): void {
  menuOpen.value = false
  removeDocListener?.()
  removeDocListener = null
}

function act(action: 'use' | 'storage' | 'discard' | 'open'): void {
  closeMenu()
  emit(action, props.item.id)
}

onBeforeUnmount(() => {
  removeDocListener?.()
})
</script>

<style scoped lang="scss">
@use 'sass:color';
@use '@/presentation/styles/mixins' as *;

.xy-item-card {
  --r-color: var(--xy-ink-line);
  --ring: var(--r-color);
  --glow: color-mix(in srgb, var(--r-color) 40%, transparent);
  isolation: isolate;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--r-color);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  border-radius: 2px;

  &::after {
    @include mixin-bg-dual-dots();
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 0 0 3px var(--xy-paper),
      0 0 0 6px var(--ring),
      0 0 34px var(--glow),
      0 22px 46px rgba(0, 0, 0, 0.4);

    &::after {
      animation: dots-flow 6s linear infinite;
    }
  }

  &.is-selected {
    outline: 2px solid var(--xy-seal);
    outline-offset: 2px;
  }

  &--r1 {
    --r-color: var(--rarity-1);

    &::after {
      @include mixin-bg-dual-dots($color: color.adjust(#7a7a86));
    }
  }

  &--r2 {
    --r-color: var(--rarity-2);

    &::after {
      @include mixin-bg-dual-dots($color: color.adjust(#4caf50));
    }
  }

  &--r3 {
    --r-color: var(--rarity-3);

    &::after {
      @include mixin-bg-dual-dots($color: color.adjust(#60a5fa));
    }
  }

  &--r4 {
    --r-color: var(--rarity-4);

    &::after {
      @include mixin-bg-dual-dots($color: color.adjust(#a855f7));
    }
  }

  &--r5 {
    --r-color: var(--rarity-5);

    &::after {
      @include mixin-bg-dual-dots($color: color.adjust(#ff9800));
    }
  }
}

/* 名称行：名词 + 类型（类型贴名词右侧） */
.xy-item-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
  flex-wrap: wrap;
}

/* 名称用品阶色（xy-q--* 全局类）；此处不设 color，避免覆盖品阶类 */
.xy-item-name {
  font-size: var(--font-size-md);
}

.xy-item-type {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-item-rarity {
  font-size: var(--font-size-md);
}

/* 价值 + 数量同行：价值最左、数量最右 */
.xy-item-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
}

.xy-item-price {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--font-size-md);
  color: var(--xy-gold);
}

.xy-item-price-icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--xy-gold);

  :deep(svg) {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }
}

/* 数量（meta 行右端）；可出售时用绿色标识 */
.xy-item-count {
  font-size: var(--font-size-md);
  color: var(--xy-seal);

  &.is-sellable {
    color: var(--color-success);
  }
}

/* 右键菜单（Teleport 到 body，用全局令牌） */
.xy-ctx {
  position: fixed;
  z-index: calc(var(--z-modal) + 60);
  display: flex;
  flex-direction: column;
  min-width: 128px;
  padding: var(--space-1);
  background: var(--color-overlay-panel);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
}

.xy-ctx-item {
  padding: var(--space-2) var(--space-3);
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--font-size-md);
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-sm);

  &:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-warning);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &--danger:hover:not(:disabled) {
    color: var(--color-danger);
  }
}
</style>
