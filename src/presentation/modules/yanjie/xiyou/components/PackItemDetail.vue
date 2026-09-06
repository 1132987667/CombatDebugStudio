<template>
  <Dialog :model-value="!!itemId" :title="item?.name ?? '物品详情'" :title-color="item ? qualityColor(item.rarity) : undefined"
    width="420px" @update:model-value="onClose">
    <div v-if="item" class="px-detail">
      <div class="px-detail-top">
        <span class="px-detail-rarity" :class="rarityClass(item.rarity)">{{ qualityOf(item.rarity) }}</span>
        <span class="px-detail-count">持有 ×{{ count }}</span>
      </div>
      <p class="px-detail-desc">{{ item.description || '暂无描述' }}</p>

      <div class="px-detail-rows">
        <p class="px-detail-row"><span class="px-detail-row-key">类型</span>{{ item.type }}</p>
        <p v-if="item.source" class="px-detail-row"><span class="px-detail-row-key">来源</span>{{ item.source }}</p>
      </div>

      <div class="px-detail-actions">
        <Button v-if="canUse" size="small" variant="primary" @click="onUse">使用</Button>
        <Button v-else-if="inBattleOnly" size="small" disabled title="仅战斗中可用（战斗行囊·快捷栏）">使用</Button>

        <Button v-if="canEquip" size="small" variant="secondary" @click="emit('equip', item.id)">装备</Button>
        <Button v-if="canStore" size="small" variant="secondary" @click="emit('storage', item.id)">存入仓库</Button>
        <Button v-if="storageFull" size="small" variant="warning" @click="pack.expandStorage()">仓库已满 · 扩容</Button>
        <Button v-if="canDiscard" size="small" variant="danger" @click="askDiscard = true">丢弃</Button>
        <Button v-else-if="item.type === '任务'" size="small" disabled title="任务物品不可丢弃">丢弃</Button>
      </div>
      <p v-if="inBattleOnly" class="px-detail-hint">恢复/增益类丹药需在战斗中经快捷栏使用</p>
    </div>

    <ConfirmDialog v-model="askDiscard" title="丢弃物品"
      :message="`确定丢弃「${item?.name ?? ''}」×${count} 吗？此操作不可恢复。`"
      confirm-text="丢弃" danger @confirm="onDiscard" />
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { usePackStore } from '@/presentation/stores/packStore'
import { qualityColor, qualityOf } from '../quality'

const props = defineProps<{
  itemId: string | null
  count: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'use', itemId: string): void
  (e: 'storage', itemId: string): void
  (e: 'discard', itemId: string): void
  (e: 'equip', itemId: string): void
}>()

const pack = usePackStore()

const askDiscard = ref(false)

const item = computed(() => (props.itemId ? pack.catalogById(props.itemId) : undefined))
const eff = computed(() => item.value?.effects?.[0])

/** 战斗外可即时生效（永久丹药[已实现]） */
const canUse = computed(() => (props.itemId ? pack.canUseOutOfBattle(props.itemId) : false))

/** 恢复/增益类丹药（有 effects）：战斗外禁用，仅快捷栏战斗中可用 */
const inBattleOnly = computed(() => !!eff.value && !canUse.value)

// NOTE: 装备判断以 equipment.json 槽位为权威（6 槽：weapon/armor/helmet/boots/charm/glove），
//       items.json type 已无「饰品」分类，不能用旧 3 类白名单判断
const canEquip = computed(() => (props.itemId ? !!pack.slotKeyOf(props.itemId) : false))

const canStore = computed(() => props.count > 0 && pack.storage.some((s) => !s.itemId))

/** 仓库已满：详情内提供扩容快捷入口 */
const storageFull = computed(() => props.count > 0 && !pack.storage.some((s) => !s.itemId))

const canDiscard = computed(() => props.count > 0 && item.value?.type !== '任务')

/** 品阶色类（px-q* 为全局令牌映射，见下方样式） */
function rarityClass(rarity: number): string {
  return `px-q${rarity}`
}

function onClose(): void {
  emit('close')
}

function onUse(): void {
  if (item.value) emit('use', item.value.id)
}

function onDiscard(): void {
  if (item.value) emit('discard', item.value.id)
}
</script>

<style scoped lang="scss">
/* NOTE: Dialog 经 Teleport 到 body，位于 .xy-game 之外，--xy-* 变量不可用，统一用全局 --color-* 令牌 */
.px-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* 品质色（凡/玄/地/天/仙，统一引用 tokens.scss 的 --rarity-* 令牌） */
.px-q1 {
  color: var(--rarity-1);
}

.px-q2 {
  color: var(--rarity-2);
}

.px-q3 {
  color: var(--rarity-3);
}

.px-q4 {
  color: var(--rarity-4);
}

.px-q5 {
  color: var(--rarity-5);
}

.px-detail-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.px-detail-rarity {
  font-family: 'KaiTi', 'STKaiti', 'Kaiti SC', serif;
  font-size: var(--font-size-lg);
  letter-spacing: 2px;
}

.px-detail-count {
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}

.px-detail-desc {
  margin: 0;
  padding: var(--space-3);
  background: var(--color-bg-secondary);
  border-radius: 2px;
  font-size: var(--font-size-md);
  line-height: var(--line-height-md);
  color: var(--color-text-secondary);
}

.px-detail-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.px-detail-row {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}

.px-detail-row-key {
  display: inline-block;
  min-width: 3em;
  color: var(--color-text-disabled);
}

.px-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: flex-end;
  border-top: 1px dashed var(--color-border-default);
  padding-top: var(--space-3);
}

.px-detail-hint {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--color-text-disabled);
}
</style>
