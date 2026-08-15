<template>
  <div>
    <h5 class="xy-cave-sec">选择装备</h5>
    <div class="xy-cave-enh-grid">
      <button
        v-for="(g, i) in gears"
        :key="g.slot"
        type="button"
        class="xy-cave-card xy-cave-enh-slot"
        :class="{ 'is-selected': idx === i }"
        :disabled="!usable(g)"
        @click="idx = i"
      >
        <span class="xy-cave-enh-slot__meta">
          <span class="xy-cave-enh-slot__item">{{ g.item }}</span>
          <span class="xy-cave-enh-slot__lv">强化 {{ g.enhance }}/{{ g.maxEnhance }}</span>
        </span>
        <p class="xy-cave-enh-slot__effect">{{ qualityOf(g.rarity) }} · {{ g.slot }}</p>
      </button>
      <p v-if="gears.length === 0" class="xy-cave-enh-empty">尚未穿戴任何装备</p>
    </div>

    <template v-if="gear && mat">
      <div class="xy-cave-enh-compare">
        <div class="xy-cave-enh-row">
          <span class="xy-cave-enh-row__name">当前属性</span>
          <span class="xy-cave-enh-row__cur">{{ curEffect }}</span>
          <span class="xy-cave-enh-row__arrow">→</span>
          <span class="xy-cave-enh-row__next">{{ nextEffect }}</span>
        </div>
      </div>

      <div class="xy-cave-enh-cost">
        <span class="xy-cave-mat" :class="{ 'is-low': !hasMat }">
          {{ mat.name }} ×{{ mat.count }}
          <span v-if="!hasMat" class="xy-cave-mat__tag">不足</span>
        </span>
        <span class="xy-cave-mat" :class="{ 'is-low': !hasMoney }">
          铜钱 {{ cost }}
          <span v-if="!hasMoney" class="xy-cave-mat__tag">不足</span>
        </span>
      </div>

      <p class="xy-cave-enh-success">
        成功率 <strong>{{ rate }}%</strong>
        <span v-if="maxed" class="xy-cave-chip xy-cave-chip--gold">已达强化上限</span>
      </p>

      <div :class="{ 'xy-cave-ripple': rippling, 'xy-cave-shake': shaking }">
        <button type="button" class="xy-cave-action" :disabled="!canEnhance" @click="enhance">强 化</button>
      </div>
      <p class="xy-cave-enh-risk">失败将消耗材料，强化等级不变</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore, GEAR_SLOT_LABELS, type GearSlotKey } from '@/presentation/stores/packStore'
import type { EquipmentData } from '@/domain/fengshen/types'
import { qualityOf } from '../../quality'
import {
  enhanceCost,
  enhanceMaterialOf,
  enhanceMaxByRarity,
  enhanceSuccessRate,
  type MaterialCost,
} from '../../caveLogic'

/** 强化槽位视图（真实穿戴实例 → 强化等级为实例属性） */
interface EnhanceGearView {
  slot: GearSlotKey
  slotLabel: string
  item: string
  rarity: number
  enhance: number
  maxEnhance: number
  stats: EquipmentData['stats']
  nextStats: EquipmentData['stats']
}

const pack = usePackStore()
const notification = useNotificationStore()

const idx = ref(-1)
const rippling = ref(false)
const shaking = ref(false)

// NOTE: 强化数据源 = 真实穿戴实例（pack.equipped），强化等级/词缀持久化在实例，与装备面板同源。
const gears = computed<EnhanceGearView[]>(() =>
  (Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[])
    .filter((slot) => pack.equippedInstance(slot))
    .map((slot) => {
      const inst = pack.equippedInstance(slot) as NonNullable<ReturnType<typeof pack.equippedInstance>>
      const g = pack.gearById(inst.itemId) as EquipmentData
      return {
        slot,
        slotLabel: GEAR_SLOT_LABELS[slot],
        item: g.name,
        rarity: g.rarity,
        enhance: inst.enhance,
        maxEnhance: enhanceMaxByRarity(g.rarity),
        stats: pack.instanceStats(inst),
        nextStats: pack.instanceStats({ ...inst, enhance: inst.enhance + 1 }),
      }
    }),
)

function usable(_g: EnhanceGearView): boolean {
  return true
}

const gear = computed<EnhanceGearView | null>(() => (idx.value >= 0 ? gears.value[idx.value] ?? null : null))

const mat = computed<MaterialCost | null>(() =>
  gear.value ? enhanceMaterialOf(gear.value.slot) : null,
)

const cost = computed(() => (gear.value ? enhanceCost(gear.value.enhance) : 0))
const rate = computed(() => (gear.value ? enhanceSuccessRate(gear.value.enhance) : 0))
const maxed = computed(() => !!gear.value && gear.value.enhance >= gear.value.maxEnhance)

const hasMat = computed(() => !!mat.value?.itemId && pack.countOf(mat.value.itemId) >= mat.value.count)
const hasMoney = computed(() => pack.currency.copper >= cost.value)

const canEnhance = computed(
  () => !!gear.value && !!mat.value && !maxed.value && hasMat.value && hasMoney.value,
)

const curEffect = computed(() => (gear.value ? statText(gear.value.stats) : ''))
const nextEffect = computed(() => (gear.value ? statText(gear.value.nextStats) : ''))

function enhance(): void {
  const g = gear.value
  if (!g || !canEnhance.value) return
  const ok = pack.enhanceGear(g.slot)
  if (ok) {
    rippling.value = true
    window.setTimeout(() => {
      rippling.value = false
    }, 700)
  } else {
    shaking.value = true
    window.setTimeout(() => {
      shaking.value = false
    }, 400)
  }
}

/** 装备 stats 文案（"攻击 +12 · 速度 +10%"），供强化对比展示 */
function statText(stats: EquipmentData['stats']): string {
  const label: Record<string, string> = {
    attack: '攻击',
    defense: '防御',
    maxHealth: '气血',
    speed: '速度',
    critRate: '暴击率',
  }
  return stats.map((s) => {
    const n = label[s.attribute] ?? s.attribute
    const suffix = s.modifierType === 'percent' ? '%' : ''
    return `${n} ${s.value >= 0 ? '+' : ''}${s.value}${suffix}`
  }).join(' · ')
}
</script>
