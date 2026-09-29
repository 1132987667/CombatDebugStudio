<template>
  <div class="xy-panel-scroll xy-pack-host">
    <!-- 左右双栏：左边为主——左可自由切换任意页签；右不可抢左（占用页签禁用），
         左切到右当前页签时右自动让位到下一个可用页签 -->
    <div class="xy-pack-dual">
      <PackPane v-model:sub="leftSub" :selected-id="selectedId" @open-detail="openDetail" @use="onUse"
        @move-storage="onMoveToStorage" @ask-card-discard="askCardDiscard" @open-storage-cell="openStorageCell"
        @discard-gear-instance="onDiscardGearInstance" @equip-gear-instance="onEquipGearInstance" />
      <PackPane v-model:sub="rightSub" :excluded="leftSub" :selected-id="selectedId" @open-detail="openDetail" @use="onUse"
        @move-storage="onMoveToStorage" @ask-card-discard="askCardDiscard" @open-storage-cell="openStorageCell"
        @discard-gear-instance="onDiscardGearInstance" @equip-gear-instance="onEquipGearInstance" />
    </div>

    <!-- 物品详情弹窗 -->
    <PackItemDetail :item-id="selectedId" :count="selectedId ? countOf(selectedId) : 0"
      @close="selectedId = null" @use="onUse" @storage="onMoveToStorage" @discard="onDiscard" @equip="onEquip" />

    <!-- 装备实例详情（逐件卡点击：新旧对比 + 穿戴） -->
    <GearDetailDialog :instance="detailInstance" @close="detailInstance = null" @equip="onGearDialogEquip" />

    <!-- 仓库：存入选择（仓库格只存 itemId+count，装备实例不可入仓） -->
    <Dialog :model-value="storePickOpen" title="存入仓库" width="440px" @update:model-value="storePickOpen = false">
      <p class="xy-store-hint">存入「{{ pack.activeWarehouse?.name ?? '仓库' }}」——选择背包物品（整组存入；装备逐件持有，暂不支持入仓）</p>
      <div class="xy-store-pick-list">
        <button v-for="it in storableItems" :key="it.id" type="button" class="xy-store-pick-item"
          @click="pickIntoStorage(it.id)">
          <span class="xy-store-pick-name" :style="{ color: qualityColor(it.rarity) }">{{ it.name }}</span>
          <span class="xy-store-pick-count">×{{ countOf(it.id) }}</span>
        </button>
        <EmptyState v-if="!storableItems.length">背包没有可存入的物品</EmptyState>
      </div>
    </Dialog>

    <!-- 背包：存入目标仓选择（多仓时先选仓，单仓由 onMoveToStorage 直接存入） -->
    <Dialog :model-value="storeTargetItem !== null" title="存入仓库" width="400px"
      @update:model-value="storeTargetItem = null">
      <p class="xy-store-hint">将「{{ storeTargetItem ? nameOf(storeTargetItem) : '' }}」整组存入目标仓库</p>
      <div class="xy-store-pick-list">
        <button v-for="w in pack.warehouses" :key="w.id" type="button" class="xy-store-pick-item"
          :disabled="!freeSlotsOf(w.id)" @click="pickTargetWarehouse(w.id)">
          <span class="xy-store-pick-name">{{ w.name }}</span>
          <span class="xy-store-pick-count">空位 {{ freeSlotsOf(w.id) }}/{{ w.slots.length }}</span>
        </button>
      </div>
    </Dialog>

    <!-- 仓库：格物品操作（取回背包 / 转移到其他仓库） -->
    <Dialog v-model="storageCellOpen" title="仓库物品" width="400px">
      <p class="xy-store-hint">{{ storageCellMsg }}</p>
      <TacticalSelect v-if="transferTargets.length" v-model="transferTo" :options="transferTargets"
        placeholder="选择目标仓库" class="xy-storage-transfer" />
      <div class="xy-storage-cell-actions">
        <Button size="small" variant="secondary" @click="onTakeOut">取回背包</Button>
        <Button size="small" variant="primary" :disabled="!transferTo" @click="onTransfer">转移</Button>
      </div>
    </Dialog>

    <!-- 卡片右键：丢弃确认 -->
    <ConfirmDialog v-model="cardDiscardOpen" title="丢弃物品"
      :message="cardDiscardMsg" confirm-text="丢弃" danger @confirm="onCardDiscard" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { usePackStore } from '@/presentation/stores/packStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { qualityColor } from '../quality'
import PackItemDetail from './PackItemDetail.vue'
import GearDetailDialog from './GearDetailDialog.vue'
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
/** 装备实例详情（逐件卡点击打开；与 itemId 级 PackItemDetail 互斥） */
const detailInstance = ref<ReturnType<typeof findGearInstance>>(null)

function findGearInstance(instanceId: string) {
  return pack.gearInstances.find((g) => g.instanceId === instanceId) ?? null
}

function openDetail(itemId: string, instanceId?: string): void {
  if (instanceId) {
    const inst = findGearInstance(instanceId)
    if (inst) {
      detailInstance.value = inst
      selectedId.value = null
      return
    }
  }
  detailInstance.value = null
  selectedId.value = itemId
}

function onGearDialogEquip(instanceId: string): void {
  if (pack.equipInstance(instanceId)) detailInstance.value = null
}

/** 卡片菜单「穿戴这一件」 */
function onEquipGearInstance(instanceId: string): void {
  pack.equipInstance(instanceId)
}

/** 卡片菜单「丢弃这一件」（与装备面板一致：单件直丢，不整堆） */
function onDiscardGearInstance(instanceId: string): void {
  pack.discardGearInstance(instanceId)
}

function onUse(itemId: string): void {
  if (pack.useItem(itemId)) selectedId.value = null
}

/** 存入仓库：单仓直接存入；多仓先弹目标仓选择（刷宝玩法需分仓存放） */
function onMoveToStorage(itemId: string): void {
  if (pack.warehouses.length <= 1) {
    if (pack.moveToStorage(itemId, pack.activeWarehouseId)) selectedId.value = null
    return
  }
  storeTargetItem.value = itemId
}

/** 选定目标仓后存入 */
function pickTargetWarehouse(warehouseId: string): void {
  const itemId = storeTargetItem.value
  if (!itemId) return
  if (pack.moveToStorage(itemId, warehouseId)) {
    storeTargetItem.value = null
    selectedId.value = null
  }
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
/** 待存入的物品 id（多仓时先选目标仓；null = 未进入选择） */
const storeTargetItem = ref<string | null>(null)

/** 可入仓物品：装备逐件持有（gearInstances），不支持整堆入仓 */
const storableItems = computed(() => pack.ownedItems.filter((it) => !pack.gearById(it.id)))

/** 某仓剩余空位数 */
function freeSlotsOf(warehouseId: string): number {
  const w = pack.warehouses.find((x) => x.id === warehouseId)
  return w ? w.slots.filter((s) => !s.itemId).length : 0
}

/* ── 仓库格物品操作（取回背包 / 转移到其他仓库） ── */
const storageCellIdx = ref<number | null>(null)
const storageCellOpen = ref(false)
/** 转移目标仓 id（空串 = 未选择） */
const transferTo = ref('')

/** 操作弹窗标题文案：物品名 × 数量 */
const storageCellMsg = computed(() => {
  const idx = storageCellIdx.value
  const slot = idx === null ? undefined : pack.activeWarehouse?.slots[idx]
  return slot?.itemId ? `「${nameOf(slot.itemId)}」×${slot.count}` : ''
})

/** 可转移目标仓（排除当前仓；附空位数） */
const transferTargets = computed(() =>
  pack.warehouses
    .filter((w) => w.id !== pack.activeWarehouseId)
    .map((w) => ({ value: w.id, label: `${w.name}（空位 ${w.slots.filter((s) => !s.itemId).length}）` })),
)

function openStorageCell(i: number): void {
  const slot = pack.activeWarehouse?.slots[i]
  if (slot?.itemId) {
    storageCellIdx.value = i
    transferTo.value = ''
    storageCellOpen.value = true
  } else {
    storePickOpen.value = true
  }
}

function pickIntoStorage(itemId: string): void {
  if (pack.moveToStorage(itemId, pack.activeWarehouseId)) storePickOpen.value = false
}

function onTakeOut(): void {
  if (storageCellIdx.value === null) return
  if (pack.moveToInventory(storageCellIdx.value, pack.activeWarehouseId)) storageCellOpen.value = false
}

function onTransfer(): void {
  if (storageCellIdx.value === null || !transferTo.value) return
  if (pack.transferWarehouseItem(pack.activeWarehouseId, storageCellIdx.value, transferTo.value)) {
    storageCellOpen.value = false
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

  /* 目标仓已满：不可选 */
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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

/* ── 仓库格操作弹窗（取回 / 转移） ── */
.xy-storage-transfer {
  width: 100%;
  margin-bottom: var(--space-2);
}

.xy-storage-cell-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
</style>
