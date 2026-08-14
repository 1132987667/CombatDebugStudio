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
          <span class="xy-cave-enh-slot__lv">{{ g.slot }}</span>
        </span>
        <p class="xy-cave-enh-slot__effect">{{ qualityOf(g.rarity) }} · {{ g.effect }}</p>
      </button>
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
import { usePackStore } from '@/presentation/stores/packStore'
import type { XiyouGearSlot } from '../../data/mock'
import { gearSlots } from '../../data/mock'
import { qualityOf } from '../../data/quality'
import { itemIdByName, STAR_MAX, starCost } from '../../data/caveLogic'

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

  g.star += 1
  rippling.value = true
  window.setTimeout(() => {
    rippling.value = false
  }, 700)
  notification.toast(`升星成功！「${g.item}」升至 ${g.star} 星`, 'success')
}
</script>
