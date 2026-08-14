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
import { qualityOf } from '../../data/quality'
import {
  enhanceCost,
  enhanceMaterialOf,
  enhanceSuccessRate,
  type MaterialCost,
} from '../../data/caveLogic'

/** 强化槽位视图（真实穿戴装备 → 展示用） */
interface EnhanceGearView {
  slot: GearSlotKey
  slotLabel: string
  item: string
  rarity: number
  enhance: number
  maxEnhance: number
  effect: string
}

const pack = usePackStore()
const notification = useNotificationStore()

const idx = ref(-1)
const rippling = ref(false)
const shaking = ref(false)

// NOTE: 强化数据源 = 真实穿戴（pack.equipped），与装备面板同源，不再读 equip.json 静态 gearSlots。
// 强化等级目前无独立存档（强化系统未落地），统一展示 0/N 占位，仅走流程演示。
const gears = computed<EnhanceGearView[]>(() =>
  (['weapon', 'armor', 'accessory'] as GearSlotKey[])
    .filter((slot) => pack.equippedGear(slot))
    .map((slot) => {
      const g = pack.equippedGear(slot) as EquipmentData
      return {
        slot,
        slotLabel: GEAR_SLOT_LABELS[slot],
        item: g.name,
        rarity: g.rarity,
        enhance: 0,
        maxEnhance: 10,
        effect: statText(g),
      }
    }),
)

function usable(g: EnhanceGearView): boolean {
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
    // NOTE: 强化等级暂无持久化（强化系统未落地），本轮仅流程演示，数值不入库
    rippling.value = true
    window.setTimeout(() => {
      rippling.value = false
    }, 700)
    notification.toast(`强化成功！「${g.item}」强化 +1（演示）`, 'success')
  } else {
    shaking.value = true
    window.setTimeout(() => {
      shaking.value = false
    }, 400)
    notification.toast(`强化失败，「${g.item}」等级不变`, 'error')
  }
}

/** 装备 stats 文案（"攻击 +12"），供强化对比展示 */
function statText(g: EquipmentData): string {
  const label: Record<string, string> = {
    attack: '攻击',
    defense: '防御',
    maxHealth: '气血',
    speed: '速度',
    critRate: '暴击率',
  }
  return g.stats.map((s) => {
    const n = label[s.attribute] ?? s.attribute
    const suffix = s.modifierType === 'percent' ? '%' : ''
    return `${n} ${s.value >= 0 ? '+' : ''}${s.value}${suffix}`
  }).join(' · ')
}

/** 从效果文案推基础值后按强化档位重算（"攻击 +12" → 强化后数值） */
function formatEffect(effect: string, level: number): string {
  const m = /^([^\d+-]*)([+-])(\d+(?:\.\d+)?)(%)?/.exec(effect)
  if (!m) return effect
  const prefix = m[1]
  const sign = m[2]
  const base = parseFloat(m[3])
  const isPercent = !!m[4]
  const next = Math.round(base * (1 + 0.05 * level))
  const suffix = isPercent ? '%' : ''
  return `${prefix}${sign}${next}${suffix}`
}
</script>
