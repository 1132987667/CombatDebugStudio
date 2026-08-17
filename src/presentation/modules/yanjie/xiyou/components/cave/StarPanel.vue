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
          <span class="xy-cave-star-stars" :aria-label="`星级 ${g.star}/${STAR_MAX}`">
            <IconStar v-for="s in STAR_MAX" :key="s" class="xy-cave-star-star"
              :class="{ on: s <= g.star }" />
          </span>
          <span class="xy-cave-enh-slot__lv">{{ g.slotLabel }}</span>
        </span>
        <p class="xy-cave-enh-slot__effect">{{ qualityOf(g.rarity) }} · {{ g.effect }}</p>
      </button>
      <p v-if="gears.length === 0" class="xy-cave-enh-empty">尚未穿戴任何装备</p>
    </div>

    <template v-if="gear">
      <div class="xy-cave-star-info">
        <p class="xy-cave-card__desc">
          「{{ gear.item }}」当前星级
          <span class="xy-cave-star-stars" :aria-label="`星级 ${gear.star}/${STAR_MAX}`">
            <IconStar v-for="s in STAR_MAX" :key="s" class="xy-cave-star-star"
              :class="{ on: s <= gear.star }" />
          </span>
        </p>
        <div class="xy-cave-star-cost">
          <span class="xy-cave-mat" :class="{ 'is-low': !hasSame }">
            同名装备 「{{ gear.item }}」 ×1
            <span v-if="!hasSame" class="xy-cave-mat__tag">不足</span>
          </span>
          <span class="xy-cave-mat" :class="{ 'is-low': !hasSoul }">
            小魂玉 ×{{ soulNeed }}
            <span v-if="!hasSoul" class="xy-cave-mat__tag">不足</span>
          </span>
        </div>
        <div :class="{ 'xy-cave-ripple': rippling, 'xy-cave-shake': shaking }">
          <button type="button" class="xy-cave-action" :disabled="!canStar" @click="doStar">
            {{ maxed ? '已 满 星' : '升 星' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import IconStar from '~icons/app/star'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore, GEAR_SLOT_LABELS, type GearSlotKey } from '@/presentation/stores/packStore'
import type { EquipmentData } from '@/domain/fengshen/types'
import { qualityOf } from '../../quality'
import { itemIdByName, STAR_MAX, starCost } from '../../caveLogic'

/** 升星槽位视图（真实穿戴实例 → 星级为实例属性，持久化） */
interface StarGearView {
  slot: GearSlotKey
  slotLabel: string
  item: string
  rarity: number
  star: number
  effect: string
}

const pack = usePackStore()
const notification = useNotificationStore()

const idx = ref(-1)
const rippling = ref(false)
const shaking = ref(false)

// NOTE: 升星数据源 = 真实穿戴实例（pack.equipped），星级/强化/品质持久化在实例，与装备面板同源。
const gears = computed<StarGearView[]>(() =>
  (Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[])
    .filter((slot) => pack.equippedGear(slot))
    .map((slot) => {
      const g = pack.equippedGear(slot) as EquipmentData
      const inst = pack.equippedInstance(slot) as NonNullable<ReturnType<typeof pack.equippedInstance>>
      return {
        slot,
        slotLabel: GEAR_SLOT_LABELS[slot],
        item: g.name,
        rarity: g.rarity,
        star: inst.star ?? 0,
        effect: statText(pack.instanceStats(inst)),
      }
    }),
)

function usable(_g: StarGearView): boolean {
  return true
}

const gear = computed<StarGearView | null>(() => (idx.value >= 0 ? gears.value[idx.value] ?? null : null))

const sameId = computed(() => (gear.value ? itemIdByName(gear.value.item) : null))
const soulNeed = computed(() => (gear.value ? starCost(gear.value.star) : 0))
const maxed = computed(() => !!gear.value && gear.value.star >= STAR_MAX)

const hasSame = computed(() => !!sameId.value && pack.countOf(sameId.value) >= 1)
const hasSoul = computed(() => pack.countOf('star_soul_01') >= soulNeed.value)

const canStar = computed(() => !!gear.value && !maxed.value && !!sameId.value && hasSame.value && hasSoul.value)

function doStar(): void {
  const g = gear.value
  if (!g || !canStar.value) return

  if (!pack.starGear(g.slot)) {
    shaking.value = true
    window.setTimeout(() => {
      shaking.value = false
    }, 400)
    return
  }
  rippling.value = true
  window.setTimeout(() => {
    rippling.value = false
  }, 700)
}

/** 装备 stats 文案（含品质系数/强化/星级/词缀），供升星展示 */
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
