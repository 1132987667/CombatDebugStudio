<template>
  <div>
    <!-- 仙缘（催熟资源，战斗胜利获得） -->
    <div class="xy-garden-bank" role="status" aria-label="当前仙缘">
      <span class="xy-garden-bank__value">仙缘 {{ pack.currency.xianyuan }}</span>
      <span class="xy-garden-bank__hint">投入作物与仙缘催熟，种 1 株收多株；仙缘靠战斗胜利积累</span>
    </div>

    <!-- 作物选择 -->
    <div class="xy-garden-seeds" role="radiogroup" aria-label="选择作物">
      <button
        v-for="c in crops"
        :key="c.id"
        type="button"
        role="radio"
        :aria-checked="selectedCropId === c.id"
        class="xy-garden-seed"
        :class="{ 'is-selected': selectedCropId === c.id }"
        :disabled="!canPlant(c)"
        :title="canPlant(c) ? undefined : plantBlockReason(c)"
        @click="selectedCropId = c.id"
      >
        <span class="xy-garden-seed__name">
          {{ c.name }}
          <span v-if="needInput(c)" class="xy-garden-seed__stock">存{{ pack.countOf(c.id) }}</span>
        </span>
        <span class="xy-garden-seed__cost">仙缘{{ c.xianyuan }} · 收{{ c.yield }}</span>
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
        :disabled="!plot.cropId && (cooldownOf(i) > 0 || !selectedCrop || !canPlant(selectedCrop))"
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
          <span class="xy-garden-plot__hint">{{ plantHint }}</span>
        </template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePackStore } from '@/presentation/stores/packStore'
import { gardenCrops } from '../../xiyouData'
import type { XiyouGardenCrop } from '../../types'

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

/** 草药类作物：种植需投入同 id 株数（灵植无来源不投入） */
function needInput(c: XiyouGardenCrop): boolean {
  return (c.input ?? 0) > 0
}

function canPlant(c: XiyouGardenCrop): boolean {
  if (pack.currency.xianyuan < c.xianyuan) return false
  return !needInput(c) || pack.countOf(c.id) >= (c.input ?? 0)
}

function plantBlockReason(c: XiyouGardenCrop): string {
  if (pack.currency.xianyuan < c.xianyuan) return `仙缘不足（需 ${c.xianyuan}）`
  if (needInput(c) && pack.countOf(c.id) < (c.input ?? 0)) return `「${c.name}」数量不足`
  return ''
}

const plantHint = computed(() => {
  if (!selectedCrop.value) return '先选择作物'
  if (!canPlant(selectedCrop.value)) return plantBlockReason(selectedCrop.value)
  return `点击种植「${selectedCrop.value.name}」`
})

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
  if (!selectedCrop.value || !canPlant(selectedCrop.value)) return
  pack.plantCrop(i, selectedCrop.value.id, now.value)
}
</script>
