<template>
  <div>
    <h5 class="xy-cave-sec">选择装备</h5>
    <!-- 全部装备（已穿戴 + 背包）按部位分组，卡片与装备页背包池同款 -->
    <GearPicker v-model="selectedId" />

    <template v-if="gearInst && gearDef">
      <div class="xy-cave-star-info">
        <p class="xy-cave-card__desc">
          「{{ gearDef.name }}」当前星级
          <span class="xy-cave-star-stars" :aria-label="`星级 ${star}/${STAR_MAX}`">
            <IconStar v-for="s in STAR_MAX" :key="s" class="xy-cave-star-star"
              :class="{ on: s <= star }" />
          </span>
        </p>
        <div class="xy-cave-star-cost">
          <span class="xy-cave-mat" :class="{ 'is-low': pointPool < pointNeed }">
            残魂点 {{ pointPool }} / {{ pointNeed }}
            <span v-if="pointPool < pointNeed" class="xy-cave-mat__tag">不足</span>
          </span>
          <span class="xy-cave-card__desc">破境耀星石 · 兵解残魄晶 · 同名装备（各 1 点，破境耀星石上/中/下 = 3/2/1 点）</span>
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
/** 升星面板：选择交给 GearPicker（全背包），本面板只做升星操作区（残魂点消耗） */
import { computed, ref } from 'vue'
import IconStar from '~icons/app/star'
import { usePackStore } from '@/presentation/stores/packStore'
import { STAR_MAX, starCost } from '../../caveLogic'
import GearPicker from './GearPicker.vue'

const pack = usePackStore()

const selectedId = ref<string | null>(null)
const rippling = ref(false)
const shaking = ref(false)

/** 选中装备实例 + 定义（星级持久化在实例；残魂点按同名装备计，排除目标自身） */
const gearInst = computed(() => (selectedId.value ? pack.gearInstanceById(selectedId.value) : null))
const gearDef = computed(() => (gearInst.value ? pack.gearById(gearInst.value.itemId) : undefined))

const star = computed(() => gearInst.value?.star ?? 0)
const maxed = computed(() => gearInst.value !== null && star.value >= STAR_MAX)

const pointNeed = computed(() => starCost(star.value + 1))
const pointPool = computed(() =>
  gearInst.value ? pack.starPointsAvailable(gearInst.value.itemId, gearInst.value.instanceId) : 0,
)

const canStar = computed(() => gearInst.value !== null && !maxed.value && pointPool.value >= pointNeed.value)

function doStar(): void {
  const inst = gearInst.value
  if (!inst || !canStar.value) return

  if (!pack.starGear(inst.instanceId)) {
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
</script>
