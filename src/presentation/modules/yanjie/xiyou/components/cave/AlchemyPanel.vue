<!--
  

-->
<template>
  <div>
    <!-- 丹方网格 -->
    <div class="xy-cave-alc-grid">
      <button
        v-for="r in recipes"
        :key="r.name"
        type="button"
        class="xy-cave-card"
        :class="{ 'is-selected': selected?.name === r.name }"
        @click="select(r)"
      >
        <span class="xy-cave-card__top">
          <span class="xy-cave-card__name">{{ r.name }}</span>
          <span class="xy-cave-chip" :class="qualityChip(r)">{{ qualityOfOut(r) }}</span>
          <span class="xy-cave-card__side">丹方 Lv.{{ r.level }}</span>
        </span>
        <p class="xy-cave-card__desc xy-cave-card__key">{{ r.effect }}</p>
        <span class="xy-cave-card__yield">产出 ×{{ Math.max(1, r.count ?? 1) }}</span>
        <span class="xy-cave-card__mats">
          <span
            v-for="m in materialsOf(r)"
            :key="m.name"
            class="xy-cave-mat"
            :class="{ 'is-low': !m.enough }"
          >
            {{ m.name }} ×{{ m.count }}
            <span v-if="!m.enough" class="xy-cave-mat__tag">不足</span>
          </span>
        </span>
      </button>
    </div>

    <!-- 丹炉：选中丹方后投料 → 炼制 -->
    <div class="xy-cave-alc-hearth" :class="{ 'xy-cave-alc-hearth--brew': brewing, 'xy-cave-ripple': rippling }">
      <div class="xy-cave-alc-kettle-wrap">
        <IconKettle class="xy-cave-alc-kettle" />
        <span class="xy-cave-alc-flame" aria-hidden="true"></span>
      </div>

      <span class="xy-cave-alc-ingrids">
        <template v-if="selected">
          <span v-for="m in materialsOf(selected)" :key="m.name" class="xy-cave-mat">{{ m.name }} ×{{ m.count }}</span>
        </template>
        <span v-else class="xy-cave-mat xy-cave-mat--empty">请选择丹方投料</span>
      </span>

      <p class="xy-cave-alc-state">
        {{ brewing ? '炉火正盛 · 炼 制 中…' : selected ? '材料已入炉 · 可 开 炉' : '丹炉空置' }}
      </p>

      <div class="xy-cave-alc-action">
        <button
          type="button"
          class="xy-cave-action"
          :disabled="!selected || brewing || !canCraft(selected)"
          @click="brew"
        >
          {{ brewing ? '炼 制 中…' : '开 始 炼 制' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import IconKettle from '~icons/app/kettle'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore } from '@/presentation/stores/packStore'
import type { XiyouRecipe } from '../../types'
import { alchemyRecipes } from '../../xiyouData'
import { itemIdByName, itemName, qualityOf } from '../../caveLogic'
import { qualityClassOf } from '../../quality'

const pack = usePackStore()
const notification = useNotificationStore()

const recipes = alchemyRecipes
const selected = ref<XiyouRecipe | null>(null)
const brewing = ref(false)
const rippling = ref(false)

function select(r: XiyouRecipe): void {
  if (brewing.value) return
  selected.value = r
}

function qualityOfOut(r: XiyouRecipe): string {
  const outId = itemIdByName(r.name)
  return outId ? qualityOf(outId) : '凡品'
}

function qualityChip(r: XiyouRecipe): string {
  return qualityClassOf(qualityOfOut(r))
}

interface MatView {
  name: string
  count: number
  have: number
  enough: boolean
}

function materialsOf(r: XiyouRecipe): MatView[] {
  const mats = r.materials ?? []
  return mats.map((m) => {
    const have = pack.countOf(m.itemId)
    return { name: itemName(m.itemId), count: m.count, have, enough: have >= m.count }
  })
}

function canCraft(r: XiyouRecipe): boolean {
  const mats = materialsOf(r)
  return mats.length > 0 && mats.every((m) => m.enough)
}

/** 炼制：1.5s 后结算（防连点 + 炉火动画）。产出数量取丹方 count（至少 1 颗），材料不足/无产出定义不扣料 */
function brew(): void {
  const r = selected.value
  if (!r || brewing.value) return
  const outId = itemIdByName(r.name)
  if (!outId) {
    notification.toast(`炼制失败：未找到「${r.name}」的产出定义`, 'danger')
    return
  }
  if (!canCraft(r)) {
    notification.toast('材料不足，无法开炉', 'danger')
    return
  }
  brewing.value = true
  window.setTimeout(() => {
    for (const m of r.materials ?? []) pack.removeItem(m.itemId, m.count)
    const outCount = Math.max(1, r.count ?? 1)
    pack.addItem(outId, outCount)
    rippling.value = true
    window.setTimeout(() => {
      rippling.value = false
    }, 700)
    notification.toast(`炼制成功！获得「${r.name}」×${outCount}`, 'success')
    brewing.value = false
  }, 1500)
}
</script>
