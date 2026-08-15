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
            <svg v-for="s in STAR_MAX" :key="s" viewBox="0 0 24 24" class="xy-cave-star-star"
              :class="{ on: s <= g.star }" aria-hidden="true">
              <path d="M12 3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 15.9 6.7 19l1.3-5.9-4.5-4 6-.6L12 3z" fill="currentColor" />
            </svg>
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
            <svg v-for="s in STAR_MAX" :key="s" viewBox="0 0 24 24" class="xy-cave-star-star"
              :class="{ on: s <= gear.star }" aria-hidden="true">
              <path d="M12 3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 15.9 6.7 19l1.3-5.9-4.5-4 6-.6L12 3z" fill="currentColor" />
            </svg>
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
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore, GEAR_SLOT_LABELS, type GearSlotKey } from '@/presentation/stores/packStore'
import type { EquipmentData } from '@/domain/fengshen/types'
import { qualityOf } from '../../data/quality'
import { itemIdByName, STAR_MAX, starCost } from '../../data/caveLogic'

/** 升星槽位视图（真实穿戴装备 → 展示用，星级暂无独立存档，统一 0 起步） */
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

// NOTE: 升星数据源 = 真实穿戴（pack.equipped），与装备/强化面板同源，不再读 equip.json 静态 gearSlots。
const gears = computed<StarGearView[]>(() =>
  (Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[])
    .filter((slot) => pack.equippedGear(slot))
    .map((slot) => {
      const g = pack.equippedGear(slot) as EquipmentData
      return {
        slot,
        slotLabel: GEAR_SLOT_LABELS[slot],
        item: g.name,
        rarity: g.rarity,
        star: 0,
        effect: statText(g),
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

  if (!pack.removeItem(sameId.value!, 1)) return
  if (!pack.removeItem('star_soul_01', soulNeed.value)) return

  // NOTE: 星级暂无持久化（升星系统未落地），本轮仅流程演示
  rippling.value = true
  window.setTimeout(() => {
    rippling.value = false
  }, 700)
  notification.toast(`升星成功！「${g.item}」升至 1 星（演示）`, 'success')
}

/** 装备 stats 文案（"攻击 +12"），供升星展示 */
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
</script>
