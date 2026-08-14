<template>
  <div>
    <!-- 部位 Tab：武器 / 衣服 / 饰品 -->
    <Tabs v-model="part" :tabs="PART_TABS" destroy-inactive class="xy-tabs--seal">
      <template v-for="p in PART_TABS" :key="p.id" #[p.id]>
        <div class="xy-cave-forge-list">
          <button
            v-for="r in recipesOf(p.id)"
            :key="r.name"
            type="button"
            class="xy-cave-card"
            :class="{ 'is-selected': selected?.name === r.name }"
            @click="selected = r"
          >
            <span class="xy-cave-card__top">
              <span class="xy-cave-card__name">{{ r.name }}</span>
              <span class="xy-cave-chip xy-cave-chip--jade">{{ tierOf(r) }}</span>
              <span class="xy-cave-card__side">已有 ×{{ countOfOut(r) }}</span>
            </span>
            <p class="xy-cave-card__desc xy-cave-card__key">{{ r.effect }}</p>
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
      </template>
    </Tabs>

    <!-- 底部：预览与铸造 -->
    <div
      v-if="selected"
      class="xy-cave-forge-detail"
      :class="{ 'xy-cave-ripple': rippling, 'xy-cave-shake': shaking }"
    >
      <div class="xy-cave-forge-detail__info">
        <span class="xy-cave-card__top">
          <span class="xy-cave-card__name">{{ selected.name }}</span>
          <span class="xy-cave-chip xy-cave-chip--gold">{{ qualityOfOut(selected) }}</span>
          <span class="xy-cave-card__side">{{ typeOfOut(selected) }} · {{ tierOf(selected) }}</span>
        </span>
        <p class="xy-cave-forge-detail__effect">{{ selected.effect }}</p>
        <span class="xy-cave-forge-detail__mats">
          <span
            v-for="m in materialsOf(selected)"
            :key="m.name"
            class="xy-cave-mat"
            :class="{ 'is-low': !m.enough }"
          >
            {{ m.name }} {{ m.have }}/{{ m.count }}
            <span v-if="!m.enough" class="xy-cave-mat__tag">不足</span>
          </span>
        </span>
      </div>
      <div class="xy-cave-forge-detail__action">
        <button
          type="button"
          class="xy-cave-action"
          :disabled="brewing || !canCraft(selected)"
          @click="craft"
        >
          {{ brewing ? '铸 造 中…' : '消 耗 材 料 · 铸 造' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Tabs from '@/presentation/components/Tabs.vue'
import type { TabItem } from '@/presentation/components/Tabs.vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore } from '@/presentation/stores/packStore'
import type { XiyouRecipe } from '../../data/mock'
import { forgeRecipes, equipmentCatalog } from '../../data/mock'
import { catalogById, itemIdByName, itemName, qualityOf } from '../../data/caveLogic'

const pack = usePackStore()
const notification = useNotificationStore()

const part = ref<'weapon' | 'armor' | 'ornament'>('weapon')

const PART_TABS: TabItem[] = [
  { id: 'weapon', label: '武器' },
  { id: 'armor', label: '衣服' },
  { id: 'ornament', label: '饰品' },
]

const selected = ref<XiyouRecipe | null>(null)
const brewing = ref(false)
const rippling = ref(false)
const shaking = ref(false)

watch(part, () => {
  selected.value = null
})

/** 配方产出物品 type → 部位分组（头盔等未归类归饰品） */
function partOf(r: XiyouRecipe): 'weapon' | 'armor' | 'ornament' {
  const type = catalogById(itemIdByName(r.name) ?? '')?.type
  if (type === '武器') return 'weapon'
  if (type === '衣服') return 'armor'
  return 'ornament'
}

function recipesOf(id: string): XiyouRecipe[] {
  return forgeRecipes.filter((r) => partOf(r) === id)
}

function tierOf(r: XiyouRecipe): string {
  return `器方 Lv.${r.level}`
}

function qualityOfOut(r: XiyouRecipe): string {
  const outId = itemIdByName(r.name)
  return outId ? qualityOf(outId) : '凡品'
}

function typeOfOut(r: XiyouRecipe): string {
  return catalogById(itemIdByName(r.name) ?? '')?.type ?? '未知'
}

function countOfOut(r: XiyouRecipe): number {
  const outId = itemIdByName(r.name)
  return outId ? pack.countOf(outId) : 0
}

interface MatView {
  name: string
  count: number
  have: number
  enough: boolean
}

/** 配方对应装备（材料权威在 configs/equipment/equipment.json，forgeRecipes 不再内联） */
function gearOf(r: XiyouRecipe) {
  return r.equipmentId ? equipmentCatalog.find((g) => g.id === r.equipmentId) : undefined
}

function materialsOf(r: XiyouRecipe): MatView[] {
  const mats = gearOf(r)?.materials ?? []
  return mats.map((m) => {
    const have = pack.countOf(m.itemId)
    return { name: itemName(m.itemId), count: m.count, have, enough: have >= m.count }
  })
}

function canCraft(r: XiyouRecipe): boolean {
  const mats = materialsOf(r)
  return mats.length > 0 && mats.every((m) => m.enough)
}

function craft(): void {
  const r = selected.value
  if (!r || brewing.value) return
  if (!canCraft(r)) {
    shaking.value = true
    notification.toast('材料不足，无法铸造', 'error')
    window.setTimeout(() => {
      shaking.value = false
    }, 400)
    return
  }

  brewing.value = true
  window.setTimeout(() => {
    const mats = gearOf(r)?.materials ?? []
    for (const m of mats) pack.removeItem(m.itemId, m.count)
    const outId = itemIdByName(r.name)
    if (outId) pack.addItem(outId, 1)
    rippling.value = true
    window.setTimeout(() => {
      rippling.value = false
    }, 700)
    notification.toast(`铸造成功！获得「${r.name}」`, 'success')
    brewing.value = false
  }, 500)
}
</script>
