<template>
  <Teleport to="body">
    <Transition name="xy-qs-fade">
      <div v-if="open" class="xy-qs-overlay" @click.self="emit('update:open', false)">
        <div class="xy-qs" role="dialog" aria-label="战斗行囊·快捷栏">
          <div class="xy-qs-head">
            <span class="xy-qs-title">行囊 · 快捷栏</span>
            <span class="xy-qs-sub">战斗中一键使用（不暂停战斗）</span>
            <button type="button" class="xy-qs-close" aria-label="关闭" @click="emit('update:open', false)">×</button>
          </div>

          <div class="xy-qs-slots" role="list" aria-label="快捷栏">
            <button v-for="(id, i) in quickSlots" :key="i" type="button" class="xy-qs-slot" :class="{ 'is-filled': !!id }"
              role="listitem" :disabled="!id" @click="useSlot(i)">
              <template v-if="id">
                <span class="xy-qs-slot-name">{{ nameOf(id) }}</span>
                <span class="xy-qs-slot-count">×{{ pack.countOf(id) }}</span>
              </template>
              <span v-else class="xy-qs-slot-empty" aria-hidden="true">空</span>
            </button>
          </div>

          <p class="xy-qs-divider">背包消耗品（点击装入快捷栏）</p>
          <div class="xy-qs-items" role="list" aria-label="背包消耗品">
            <button v-for="it in consumables" :key="it.id" type="button" class="xy-qs-item"
              @click="fillSlot(it.id)">
              <span class="xy-qs-item-name" :class="qsColorClass(it.rarity)">{{ it.name }}</span>
              <span class="xy-qs-item-count">×{{ pack.countOf(it.id) }}</span>
            </button>
            <p v-if="!consumables.length" class="xy-qs-none">背包中没有可用的消耗品</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePackStore } from '@/presentation/stores/packStore'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const pack = usePackStore()

/** 可装入快捷栏的消耗品（丹药/永久丹药/符箓/晶球，且持有 > 0） */
const consumables = computed(() => {
  const types = new Set(['丹药', '永久丹药', '符箓', '晶球'])
  return pack.ownedItems
    .filter((it) => types.has(it.type))
    .sort((a, b) => a.rarity - b.rarity)
})

function nameOf(itemId: string): string {
  return pack.catalogById(itemId)?.name ?? itemId
}

/** 快捷栏品级色类（px-qs-q1..q5，数字类；色值对齐 quality.ts QUALITY_COLORS） */
function qsColorClass(rarity: number): string {
  return `px-qs-q${rarity}`
}

function useSlot(idx: number): void {
  pack.useInBattle(idx)
}

/** 装入：优先空位，满则替换第 0 格 */
function fillSlot(itemId: string): void {
  const empty = pack.quickSlots.indexOf(null)
  pack.setQuickSlot(empty >= 0 ? empty : 0, itemId)
}
</script>

<style scoped lang="scss">
/* NOTE: Teleport 到 body，.xy-game 之外，统一用全局 --color-* 令牌 */
.xy-qs-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) + 60);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(var(--rgb-black), 0.35);
}

.xy-qs {
  width: 400px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  padding: var(--space-4);
  background: var(--color-overlay-panel);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
  color: var(--color-text-primary);
}

.xy-qs-head {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  padding-right: var(--space-5);
}

.xy-qs-title {
  font-family: 'KaiTi', 'STKaiti', 'Kaiti SC', serif;
  font-size: var(--font-size-lg);
  letter-spacing: 3px;
}

.xy-qs-sub {
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}

.xy-qs-close {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 24px;
  height: 24px;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: var(--font-size-md);
  line-height: 1;

  &:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }
}

.xy-qs-slots {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.xy-qs-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  height: 64px;
  border: 1px dashed var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text-tertiary);
  cursor: default;
  font-family: inherit;

  &.is-filled {
    border-style: solid;
    border-color: var(--color-warning);
    color: var(--color-text-primary);
    cursor: pointer;

    &:hover {
      box-shadow: 0 0 10px rgba(var(--rgb-warning), var(--alpha-glow));
    }
  }
}

.xy-qs-slot-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-md);
  padding: 0 var(--space-1);
}

.xy-qs-slot-count {
  font-size: var(--font-size-md);
  color: var(--color-warning);
}

.xy-qs-slot-empty {
  font-size: var(--font-size-md);
  color: var(--color-text-disabled);
}

.xy-qs-divider {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
}

.xy-qs-items {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  overflow-y: auto;
  min-height: 0;
}

.xy-qs-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  cursor: pointer;
  font-family: inherit;
  text-align: left;

  &:hover {
    border-color: var(--color-warning);
  }
}

.xy-qs-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-md);
}

.xy-qs-item-count {
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}

.xy-qs-none {
  margin: 0;
  padding: var(--space-4);
  text-align: center;
  font-size: var(--font-size-md);
  color: var(--color-text-disabled);
}

/* 品质色（对齐 QUALITY_COLORS：text-disabled/success/skill-active/debuff/warning） */
.px-qs-q1 {
  color: var(--color-text-disabled);
}

.px-qs-q2 {
  color: var(--color-success);
}

.px-qs-q3 {
  color: var(--color-skill-active);
}

.px-qs-q4 {
  color: var(--color-debuff);
}

.px-qs-q5 {
  color: var(--color-warning);
}

.xy-qs-fade-enter-active,
.xy-qs-fade-leave-active {
  transition: opacity 200ms ease;
}

.xy-qs-fade-enter-from,
.xy-qs-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .xy-qs-fade-enter-active,
  .xy-qs-fade-leave-active {
    transition: opacity 1ms;
  }
}
</style>
