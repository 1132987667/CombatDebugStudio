<template>
  <div class="xy-enh-pool">
    <div v-for="group in gearGroups" :key="group.slot" class="xy-enh-pool__group">
      <span class="xy-enh-pool__label">{{ GEAR_SLOT_LABELS[group.slot] }}</span>
      <div class="xy-enh-pool__items">
        <div v-for="g in group.items" :key="g.instanceId" class="xy-gear-pack-item"
          :class="[`xy-gear-pack-item--r${g.rarity}`, { 'is-selected': modelValue === g.instanceId }]">
          <button type="button" class="xy-gear-pack-item__main" @mouseenter="onEnter($event, g)"
            @mouseleave="onLeave" @click="emit('update:modelValue', g.instanceId)">
            <span class="xy-gear-pack-item__title">
              <span class="xy-gear-pack-item__name" :class="qualityClass(g.rarity)">{{ g.name }}</span>
              <span v-if="g.equipped" class="xy-enh-pool__worn">穿戴中</span>
            </span>
            <span class="xy-gear-pack-item__sub">
              <span class="xy-gear-pack-item__quality" :class="equipQualityClass(g.quality)">
                {{ qualityLabel(g.quality, g.qualityFactor) }}
              </span>
              <span class="xy-gear-pack-item__enhance">强化 +{{ g.enhance }}</span>
              <span class="xy-gear-pack-item__star" :title="`星级 ${g.star}/${STAR_MAX}`">{{ starLabel(g.star) }}</span>
            </span>
          </button>
          <button type="button" class="xy-gear-pack-item__detail" @click="openDetail(g)">详情</button>
        </div>
      </div>
    </div>
    <p v-if="items.length === 0" class="xy-cave-enh-empty">暂无装备，先去打造或探索获取</p>
  </div>

  <!-- 装备悬浮详情（复用 EntityTooltip：Teleport + rect 定位 + 视口翻转；全局注册组件） -->
  <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="triggerRect" @hide="tooltipVisible = false" />

  <!-- 装备详情弹窗（新旧对比 + 穿戴） -->
  <GearDetailDialog :instance="detailInstance" @close="detailInstance = null" @equip="onDetailEquip" />
</template>

<script setup lang="ts">
/**
 * 洞府养成面板共用的装备选择网格（强化/升星/洗练）：
 * 数据源 = 已穿戴 + 背包全部装备实例，按部位分组；卡片与装备页背包池同款（xy-gear-pack-item）。
 * 只负责"选"：v-model 上报 instanceId，操作区由各面板自行实现。
 */
import { computed, ref } from 'vue'
import { usePackStore, GEAR_SLOT_LABELS, type GearInstance, type GearSlotKey } from '@/presentation/stores/packStore'
import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import type { EquipmentData } from '@/domain/fengshen/types'
import { equipQualityClass, qualityClass, qualityLabel } from '../../quality'
import { STAR_MAX, starLabel } from '../../caveLogic'
import { gearTooltipData, type GearTooltipView } from '../../gearTooltip'
import GearDetailDialog from '../GearDetailDialog.vue'

/** 候选视图：实例 + 装备定义上的展示字段（name/rarity/slot 实例不携带，从定义补齐） */
export interface GearPickItem extends GearTooltipView {
  slot: GearSlotKey
  equipped: boolean
}

const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', id: string): void }>()

const pack = usePackStore()

function toItem(inst: GearInstance, equipped: boolean): GearPickItem {
  const def = pack.gearById(inst.itemId) as EquipmentData
  return {
    ...inst,
    name: def?.name ?? inst.itemId,
    rarity: def?.rarity ?? 1,
    slot: def?.slot as GearSlotKey,
    equipped,
  }
}

const items = computed<GearPickItem[]>(() => {
  const all: GearPickItem[] = []
  for (const inst of pack.packGearInstances()) all.push(toItem(inst, false))
  for (const slot of Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]) {
    const inst = pack.equippedInstance(slot)
    if (inst) all.push(toItem(inst, true))
  }
  // 部位序（GEAR_SLOT_LABELS 键序）→ 穿戴中优先 → 品阶降序，保证列表稳定
  const slotOrder = Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]
  return all.sort((a, b) => {
    const bySlot = slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot)
    if (bySlot !== 0) return bySlot
    if (a.equipped !== b.equipped) return a.equipped ? -1 : 1
    return b.rarity - a.rarity
  })
})

/** 按部位分组（空部位不渲染组标题，与装备页背包池一致） */
const gearGroups = computed(() => {
  const slotOrder = Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[]
  return slotOrder
    .map((slot) => ({ slot, items: items.value.filter((g) => g.slot === slot) }))
    .filter((group) => group.items.length > 0)
})

/* ── 卡片悬浮详情（复用 EntityTooltip 范式：Teleport + rect 定位 + 视口翻转） ── */
const tooltipVisible = ref(false)
const triggerRect = ref<DOMRect | null>(null)
const tooltipData = ref<TooltipData | null>(null)

function onEnter(e: MouseEvent, g: GearPickItem): void {
  triggerRect.value = (e.currentTarget as HTMLElement)?.getBoundingClientRect() ?? null
  tooltipData.value = gearTooltipData(pack, GEAR_SLOT_LABELS, g)
  tooltipVisible.value = true
}

function onLeave(): void {
  tooltipVisible.value = false
}

/* ── 详情弹窗（新旧对比 + 穿戴） ── */
const detailInstance = ref<GearPickItem | null>(null)

function openDetail(g: GearPickItem): void {
  tooltipVisible.value = false
  detailInstance.value = g
}

function onDetailEquip(instanceId: string): void {
  if (pack.equipInstance(instanceId)) detailInstance.value = null
}
</script>

<style scoped lang="scss">
/* 卡片样式 = 装备页共享的 xy-gear-pack-item（scoped 需在本组件作用域引入；网格/空态用全局 xy-enh-pool/xy-cave-*） */
@use '../../styles/gear-pack-item.scss';
</style>
