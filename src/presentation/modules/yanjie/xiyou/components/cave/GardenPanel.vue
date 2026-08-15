<template>
  <div>
    <!-- 种子选择 -->
    <div class="xy-garden-seeds" role="radiogroup" aria-label="选择作物">
      <button
        v-for="c in crops"
        :key="c.id"
        type="button"
        role="radio"
        :aria-checked="selectedCropId === c.id"
        class="xy-garden-seed"
        :class="{ 'is-selected': selectedCropId === c.id }"
        @click="selectedCropId = c.id"
      >
        <span class="xy-garden-seed__name">{{ c.name }}</span>
        <span class="xy-garden-seed__yield">收获 ×{{ c.yield }}</span>
      </button>
    </div>

    <!-- 地块 -->
    <div class="xy-garden-grid" role="list" aria-label="药园地块">
      <button
        v-for="(plot, i) in pack.garden"
        :key="i"
        type="button"
        role="listitem"
        class="xy-garden-plot"
        :class="{ 'is-ready': !!plot.cropId, 'is-cooling': !plot.cropId && cooldownOf(i) > 0 }"
        :disabled="!plot.cropId && cooldownOf(i) > 0"
        @click="onPlotClick(i)"
      >
        <template v-if="plot.cropId">
          <span class="xy-garden-plot__crop">{{ nameOf(plot.cropId) }}</span>
          <span class="xy-garden-plot__hint">已成熟 · 点击收获</span>
        </template>
        <template v-else-if="cooldownOf(i) > 0">
          <span class="xy-garden-plot__crop">灵田恢复中</span>
          <span class="xy-garden-plot__hint">{{ fmtCooldown(cooldownOf(i)) }}</span>
        </template>
        <template v-else>
          <span class="xy-garden-plot__crop">空置灵田</span>
          <span class="xy-garden-plot__hint">{{ selectedCrop ? `点击种植「${selectedCrop.name}」` : '先选择作物' }}</span>
        </template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePackStore } from '@/presentation/stores/packStore'
import { gardenCrops } from '../../xiyouData'

const pack = usePackStore()

const crops = gardenCrops
const selectedCropId = ref<string | null>(crops[0]?.id ?? null)

/** 冷却倒计时 tick（每秒刷新，驱动地块剩余时间显示） */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const selectedCrop = computed(() => crops.find((c) => c.id === selectedCropId.value) ?? null)

function cooldownOf(i: number): number {
  return pack.gardenCooldown(i, now.value)
}

function nameOf(id: string): string {
  return pack.catalogById(id)?.name ?? id
}

function fmtCooldown(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function onPlotClick(i: number): void {
  const plot = pack.garden[i]
  if (plot?.cropId) {
    pack.harvestCrop(i, now.value)
    return
  }
  if (cooldownOf(i) > 0) return
  if (!selectedCrop.value) return
  pack.plantCrop(i, selectedCrop.value.id, now.value)
}
</script>
