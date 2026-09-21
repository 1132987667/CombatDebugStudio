<template>
  <div class="xy-item-card-wrap">
    <button type="button"
      :class="['xy-item-card', `xy-item-card--r${item.rarity}`, { 'is-selected': selected }, 'xy-ink-hover']"
      :aria-label="gear ? `${item.name}（${qualityName(gear.quality)}品·强化+${gear.enhance}）` : `${item.name} ×${count}`"
      @mouseenter="onEnter" @mouseleave="onLeave" @click="onCardClick"
      @contextmenu.prevent="onContextmenu">
      <span class="xy-item-title">
        <span class="xy-item-name" :class="qualityClass(item.rarity)">{{ item.name }}</span>
        <span class="xy-item-type">{{ item.type }}</span>
        <span v-if="gear" class="xy-item-quality" :class="equipQualityClass(gear.quality)">
          {{ qualityLabel(gear.quality, gear.qualityFactor) }}
        </span>
        <span v-else class="xy-item-count">×{{ count }}</span>
        <span v-if="gear && gear.enhance > 0" class="xy-item-enhance">强化 +{{ gear.enhance }}</span>
      </span>
      <span v-if="sellable && !gear" class="xy-item-meta">
        <span class="xy-item-price" :title="`实际价值 ${item.value}`">
          <span class="xy-item-price-icon" aria-hidden="true"><IconMoney /></span>
          <span class="xy-item-price-value">{{ item.value }}</span>
        </span>
      </span>
    </button>

    <!-- 悬浮信息卡（复用 EntityTooltip 范式：Teleport + rect 定位 + 视口翻转） -->
    <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="triggerRect"
      @hide="tooltipVisible = false" />

    <!-- 右键操作菜单 -->
    <Teleport to="body">
      <div v-if="menuOpen" ref="menuRef" class="xy-ctx" role="menu" :style="menuStyle" aria-label="物品操作">
        <template v-if="gear">
          <button type="button" class="xy-ctx-item" @click="act('equip')">穿戴</button>
          <button type="button" class="xy-ctx-item xy-ctx-item--danger" @click="act('discardInstance')">丢弃这一件</button>
          <button type="button" class="xy-ctx-item" @click="act('open')">查看详情</button>
        </template>
        <template v-else>
          <button v-if="showUse" type="button" class="xy-ctx-item" :disabled="!canUseNow"
            :title="inBattleOnly ? '仅战斗中可用（行囊·快捷栏）' : undefined" @click="act('use')">使用</button>
          <button v-if="showSell" type="button" class="xy-ctx-item" @click="act('sell')">出售</button>
          <button v-if="canStore" type="button" class="xy-ctx-item" @click="act('storage')">存入仓库</button>
          <button v-if="canDiscard" type="button" class="xy-ctx-item xy-ctx-item--danger"
            @click="act('discard')">丢弃</button>
          <button type="button" class="xy-ctx-item" @click="act('open')">查看详情</button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import IconMoney from '~icons/app/money'
import { usePackStore, GEAR_SLOT_LABELS, type GearInstance } from '@/presentation/stores/packStore'
import { equipQualityClass, qualityClass, qualityColor, qualityLabel, qualityName, qualityOf } from '../quality'
import { gearTooltipData } from '../gearTooltip'
import type { XiyouCatalogItem } from '../types'

const props = defineProps<{
  item: XiyouCatalogItem
  count: number
  selected?: boolean
  /** 仓库格模式：点击/右键均由父级处理（open 回传格索引），禁用背包操作菜单 */
  inStorage?: boolean
  /** 装备实例模式：逐件独立卡（品质/强化按实例展示，不显示数量，操作回传 instanceId） */
  gear?: GearInstance
}>()

const emit = defineEmits<{
  (e: 'open', itemId: string, instanceId?: string): void
  (e: 'use', itemId: string): void
  (e: 'sell', itemId: string): void
  (e: 'storage', itemId: string): void
  (e: 'discard', itemId: string): void
  (e: 'discardInstance', instanceId: string): void
  (e: 'equip', instanceId: string): void
}>()

const pack = usePackStore()

/* ── 悬浮信息 ── */
const tooltipVisible = ref(false)
const triggerRect = ref<DOMRect | null>(null)

const tooltipData = computed<TooltipData>(() => {
  if (props.gear) {
    return gearTooltipData(pack, GEAR_SLOT_LABELS, { ...props.gear, name: props.item.name, rarity: props.item.rarity })
  }
  return {
    name: props.item.name,
    description: props.item.description ?? '暂无描述',
    badge: qualityOf(props.item.rarity),
    // 悬浮面板在 body 层（无 --xy-* 变量），用全局 --color-* 令牌映射品阶色
    nameColor: qualityColor(props.item.rarity),
    badgeColor: qualityColor(props.item.rarity),
    details: [
      { label: '类型', value: props.item.type },
      { label: props.inStorage ? '数量' : '持有', value: `×${props.count}` },
    ],
    source: props.item.source,
  }
})

function onCardClick(): void {
  emit('open', props.item.id, props.gear?.instanceId)
}

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

/** 可出售：items.json value > 0（无该字段视为不可出售，如任务/钥匙/宝箱） */
const sellable = computed(() => (props.item.value ?? 0) > 0)
/** 右键菜单「出售」：有价值且持有数量 > 0 */
const showSell = computed(() => sellable.value && props.count > 0)

function onContextmenu(e: MouseEvent): void {
  if (props.inStorage) return
  openMenu(e)
}

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

function act(action: 'use' | 'sell' | 'storage' | 'discard' | 'open' | 'equip' | 'discardInstance'): void {
  closeMenu()
  if (action === 'equip' && props.gear) emit('equip', props.gear.instanceId)
  else if (action === 'discardInstance' && props.gear) emit('discardInstance', props.gear.instanceId)
  else emit(action as 'open', props.item.id)
}

onBeforeUnmount(() => {
  removeDocListener?.()
})
</script>

<style scoped lang="scss">
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
      0 0 0 2px var(--xy-paper),
      0 0 0 4px var(--ring),
      0 0 34px var(--glow),
      0 22px 46px rgba(var(--rgb-black), 0.4);

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
      @include mixin-bg-dual-dots();
    }
  }

  &--r2 {
    --r-color: var(--rarity-2);

    &::after {
      @include mixin-bg-dual-dots();
    }
  }

  &--r3 {
    --r-color: var(--rarity-3);

    &::after {
      @include mixin-bg-dual-dots();
    }
  }

  &--r4 {
    --r-color: var(--rarity-4);

    &::after {
      @include mixin-bg-dual-dots();
    }
  }

  &--r5 {
    --r-color: var(--rarity-5);

    &::after {
      @include mixin-bg-dual-dots();
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
.xy-item-name {}

.xy-item-type {
  color: var(--xy-ink-3);
}

.xy-item-rarity {}

/* 价值行（数量已并入名称行） */
.xy-item-meta {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
}

.xy-item-price {
  display: inline-flex;
  align-items: center;
  gap: 2px;
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

/* 数量（紧跟类型，名称行内） */
.xy-item-count {
  color: var(--color-success);
}

/* 装备实例品质文本（色值由全局 xy-eq-q--* 类提供） */
.xy-item-quality {
  font-size: var(--font-size-md);
}

/* 强化等级（实例模式名称行内，金色与价值色一致） */
.xy-item-enhance {
  color: var(--xy-gold);
  font-size: var(--font-size-md);
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
