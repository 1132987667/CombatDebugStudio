<template>
  <div>
    <h5 class="xy-cave-sec">选择装备</h5>
    <!-- 全部装备（已穿戴 + 背包）按部位分组，卡片与装备页背包池同款 -->
    <GearPicker v-model="selectedId" />

    <template v-if="gear">
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
          金钱 {{ cost }}
          <span v-if="!hasMoney" class="xy-cave-mat__tag">不足</span>
        </span>
      </div>

      <p class="xy-cave-enh-success">
        成功率 <strong>{{ rate }}%</strong>
        <span v-if="maxed" class="xy-cave-chip xy-cave-chip--gold">已达强化上限</span>
      </p>

      <div :class="{ 'xy-cave-ripple': rippling, 'xy-cave-shake': shaking }">
        <button type="button" class="xy-cave-action" :disabled="!canEnhance" @click="doEnhance">强 化</button>
      </div>
      <p class="xy-cave-enh-risk">失败将消耗材料，强化等级不变</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/** 强化面板：选择交给 GearPicker（全背包），本面板只做强化操作区（对比/消耗/成功率） */
import { computed, ref } from 'vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore } from '@/presentation/stores/packStore'
import type { EquipmentStatEntry } from '@/domain/fengshen/types'
import { attrShortName } from '@/domain/fengshen/equipment-overview'
import { enhanceCost, enhanceMaterialOf, enhanceMaxByRarity, enhanceSuccessRate, type MaterialCost } from '../../caveLogic'
import GearPicker from './GearPicker.vue'

const pack = usePackStore()
const notification = useNotificationStore()

const selectedId = ref<string | null>(null)
const rippling = ref(false)
const shaking = ref(false)

/** 选中装备实例 + 养成字段（强化等级/连败/上限持久化在实例，与装备面板同源） */
const gearInst = computed(() => (selectedId.value ? pack.gearInstanceById(selectedId.value) : null))
const gearDef = computed(() => (gearInst.value ? pack.gearById(gearInst.value.itemId) : undefined))

const enhance = computed(() => gearInst.value?.enhance ?? 0)
const maxEnhance = computed(() => enhanceMaxByRarity(gearDef.value?.rarity ?? 1))
const failStreak = computed(() => gearInst.value?.enhanceFails ?? 0)
const maxed = computed(() => gearInst.value !== null && gearInst.value.enhance >= maxEnhance.value)

const mat = computed<MaterialCost>(() => enhanceMaterialOf(enhance.value))
const cost = computed(() => (gearDef.value ? enhanceCost(enhance.value, gearDef.value.rarity) : 0))
const rate = computed(() => enhanceSuccessRate(enhance.value, failStreak.value))

const hasMat = computed(() => pack.countOf(mat.value.itemId) >= mat.value.count)
const hasMoney = computed(() => pack.currency.money >= cost.value)

const canEnhance = computed(() => gearInst.value !== null && !maxed.value && hasMat.value && hasMoney.value)

const curEffect = computed(() => (gearInst.value ? statText(pack.instanceStats(gearInst.value)) : ''))
const nextEffect = computed(() =>
  gearInst.value ? statText(pack.instanceStats({ ...gearInst.value, enhance: gearInst.value.enhance + 1 })) : '',
)

function doEnhance(): void {
  const inst = gearInst.value
  if (!inst || !canEnhance.value) return
  const ok = pack.enhanceGear(inst.instanceId)
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
function statText(stats: EquipmentStatEntry[]): string {
  return stats.map((s) => {
    const n = attrShortName(s.attribute)
    const suffix = s.modifierType === 'percent' ? '%' : ''
    return `${n} ${s.value >= 0 ? '+' : ''}${s.value}${suffix}`
  }).join(' · ')
}
</script>
