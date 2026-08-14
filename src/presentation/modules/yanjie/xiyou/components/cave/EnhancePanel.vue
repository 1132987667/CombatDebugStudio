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
import { usePackStore } from '@/presentation/stores/packStore'
import type { XiyouGearSlot } from '../../data/mock'
import { gearSlots } from '../../data/mock'
import { qualityOf } from '../../data/quality'
import {
  enhanceCost,
  enhanceMaterialOf,
  enhanceSuccessRate,
  formatEffect,
  type MaterialCost,
} from '../../data/caveLogic'

const pack = usePackStore()
const notification = useNotificationStore()

const gears = gearSlots
const idx = ref(-1)
const rippling = ref(false)
const shaking = ref(false)

function usable(g: XiyouGearSlot): boolean {
  return g.equipped && g.item !== '空位'
}

const gear = computed<XiyouGearSlot | null>(() => (idx.value >= 0 ? gears[idx.value] ?? null : null))

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

const curEffect = computed(() => (gear.value ? formatEffect(gear.value.effect, gear.value.enhance) : ''))
const nextEffect = computed(() => (gear.value ? formatEffect(gear.value.effect, gear.value.enhance + 1) : ''))

function enhance(): void {
  const g = gear.value
  const m = mat.value
  if (!g || !m || !canEnhance.value) return

  if (!pack.removeItem(m.itemId!, m.count)) return
  if (!pack.spend('copper', cost.value)) return

  const success = Math.random() * 100 < rate.value
  if (success) {
    g.enhance += 1
    rippling.value = true
    window.setTimeout(() => {
      rippling.value = false
    }, 700)
    notification.toast(`强化成功！「${g.item}」强化 +${g.enhance}`, 'success')
  } else {
    shaking.value = true
    window.setTimeout(() => {
      shaking.value = false
    }, 400)
    notification.toast(`强化失败，「${g.item}」等级不变`, 'error')
  }
}
</script>
