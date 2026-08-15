<template>
  <div class="xy-panel-scroll xy-pack-host">
    <!-- 左右双栏：左边为主——左可自由切换任意页签；右不可抢左（占用页签禁用），
         左切到右当前页签时右自动让位到下一个可用页签 -->
    <div class="xy-pack-dual">
      <PackPane v-model:sub="leftSub" :selected-id="selectedId" @open-detail="openDetail" @use="onUse"
        @move-storage="onMoveToStorage" @ask-card-discard="askCardDiscard" @open-storage-cell="openStorageCell" />
      <PackPane v-model:sub="rightSub" :excluded="leftSub" :selected-id="selectedId" @open-detail="openDetail" @use="onUse"
        @move-storage="onMoveToStorage" @ask-card-discard="askCardDiscard" @open-storage-cell="openStorageCell" />
    </div>

    <!-- 物品详情弹窗 -->
    <PackItemDetail :item-id="selectedId" :count="selectedId ? countOf(selectedId) : 0"
      @close="selectedId = null" @use="onUse" @storage="onMoveToStorage" @discard="onDiscard" @equip="onEquip" />

    <!-- 仓库：存入选择 -->
    <Dialog :model-value="storePickOpen" title="存入仓库" width="440px" @update:model-value="storePickOpen = false">
      <p class="xy-store-hint">选择背包物品（整组存入）</p>
      <div class="xy-store-pick-list">
        <button v-for="it in pack.ownedItems" :key="it.id" type="button" class="xy-store-pick-item"
          @click="pickIntoStorage(it.id)">
          <span class="xy-store-pick-name" :style="{ color: qualityColor(it.rarity) }">{{ it.name }}</span>
          <span class="xy-store-pick-count">×{{ countOf(it.id) }}</span>
        </button>
        <EmptyState v-if="!pack.ownedItems.length">背包没有可存入的物品</EmptyState>
      </div>
    </Dialog>

    <!-- 仓库：取出确认 -->
    <ConfirmDialog v-model="storageTakeOpen" title="取出物品"
      :message="storageTakeMsg" confirm-text="取出" @confirm="onTakeOut" />

    <!-- 卡片右键：丢弃确认 -->
    <ConfirmDialog v-model="cardDiscardOpen" title="丢弃物品"
      :message="cardDiscardMsg" confirm-text="丢弃" danger @confirm="onCardDiscard" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ConfirmDialog from '@/presentation/components/ConfirmDialog.vue'
import Dialog from '@/presentation/components/Dialog.vue'
import EmptyState from '@/presentation/components/EmptyState.vue'
import { usePackStore } from '@/presentation/stores/packStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { qualityColor } from '../quality'
import PackItemDetail from './PackItemDetail.vue'
import PackPane, { type PackSub } from './PackPane.vue'

const pack = usePackStore()
const notification = useNotificationStore()

/* ── 左右双栏：左边为主（左自由切，右不抢左；左撞右时右自动让位） ── */
const leftSub = ref<PackSub>('pack')
const rightSub = ref<PackSub>('storage')

const PACK_SUBS: PackSub[] = ['pack', 'storage', 'shop']

/** 让位目标：排除被左占用的页签，取下一个可用页签 */
function spareOf(v: PackSub): PackSub {
  return PACK_SUBS.find((s) => s !== v) ?? 'pack'
}

// NOTE: 左边为主——左切到 X 时，若右已在 X，把右挤到下一个可用页签；
//       右被 leftSub 占用页签禁用（PackPane excluded），无法反向抢左。
watch(leftSub, (v) => {
  if (rightSub.value === v) rightSub.value = spareOf(v)
})

/* ── 物品详情 ── */
const selectedId = ref<string | null>(null)

function openDetail(itemId: string): void {
  selectedId.value = itemId
}

function onUse(itemId: string): void {
  if (pack.useItem(itemId)) selectedId.value = null
}

function onMoveToStorage(itemId: string): void {
  if (pack.moveToStorage(itemId)) selectedId.value = null
}

function onDiscard(itemId: string): void {
  if (pack.discardItem(itemId)) selectedId.value = null
}

function onEquip(_itemId: string): void {
  notification.toast('请到装备面板操作（当前为展示态）')
}

function countOf(itemId: string): number {
  return pack.countOf(itemId)
}

/* ── 卡片右键丢弃（独立确认弹窗） ── */
const cardDiscardId = ref<string | null>(null)
const cardDiscardOpen = ref(false)

const cardDiscardMsg = computed(() =>
  cardDiscardId.value
    ? `确定丢弃「${nameOf(cardDiscardId.value)}」×${countOf(cardDiscardId.value)} 吗？此操作不可恢复。`
    : '',
)

function askCardDiscard(itemId: string): void {
  cardDiscardId.value = itemId
  cardDiscardOpen.value = true
}

function onCardDiscard(): void {
  if (cardDiscardId.value) pack.discardItem(cardDiscardId.value)
  cardDiscardId.value = null
}

function nameOf(itemId: string): string {
  return pack.catalogById(itemId)?.name ?? itemId
}

/* ── 仓库存取 ── */
const storePickOpen = ref(false)
const storageTakeIdx = ref<number | null>(null)
const storageTakeOpen = ref(false)

const storageTakeMsg = computed(() => {
  if (storageTakeIdx.value === null) return ''
  const slot = pack.storage[storageTakeIdx.value]
  return slot?.itemId ? `取出「${nameOf(slot.itemId)}」×${slot.count} 到背包？` : ''
})

function openStorageCell(i: number): void {
  const slot = pack.storage[i]
  if (slot?.itemId) {
    storageTakeIdx.value = i
    storageTakeOpen.value = true
  } else {
    storePickOpen.value = true
  }
}

function pickIntoStorage(itemId: string): void {
  if (pack.moveToStorage(itemId)) storePickOpen.value = false
}

function onTakeOut(): void {
  if (storageTakeIdx.value !== null) {
    pack.moveToInventory(storageTakeIdx.value)
    storageTakeIdx.value = null
  }
}

onMounted(() => {
  void pack.init()
})
</script>

<style scoped lang="scss">
/* 双栏行囊：左右面板并排，各占一半；内部滚动由 PackPane 自理 */
.xy-panel-scroll.xy-pack-host {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.xy-pack-dual {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

/* ── 存入选择列表（Dialog 在 body，用全局令牌） ── */
.xy-store-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--color-text-disabled);
}

.xy-store-pick-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 40vh;
  overflow-y: auto;
}

.xy-store-pick-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-default);
  border-radius: 2px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  cursor: pointer;
  font-family: inherit;
  text-align: left;

  &:hover {
    border-color: var(--color-brand-red);
  }
}

.xy-store-pick-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-md);
}

.xy-store-pick-count {
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}
</style>
