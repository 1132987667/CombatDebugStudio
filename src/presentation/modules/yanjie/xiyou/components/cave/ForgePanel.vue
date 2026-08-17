<template>
  <div>
    <!-- 部位 Tab：武器 / 衣服 / 头盔 / 靴子 / 护符 / 戒指 -->
    <Tabs v-model="part" :tabs="PART_TABS" destroy-inactive class="xy-tabs--seal">
      <template v-for="p in PART_TABS" :key="p.id" #[p.id]>
        <div class="xy-cave-forge-list">
          <button
            v-for="r in recipesOf(p.id)"
            :key="r.name"
            type="button"
            class="xy-cave-card"
            :class="[{ 'is-selected': selected?.name === r.name }, { 'is-locked': !unlockedOf(r) }]"
            :disabled="!unlockedOf(r)"
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
            <p v-if="!unlockedOf(r)" class="xy-cave-card__lock">需「{{ blueprintNameOf(r) }}」解锁</p>
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

import type { TabItem } from '@/presentation/components'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore } from '@/presentation/stores/packStore'
import type { XiyouRecipe } from '../../types'
import { forgeRecipes, equipmentCatalog } from '../../xiyouData'
import { catalogById, itemIdByName, itemName, qualityOf } from '../../caveLogic'

const pack = usePackStore()
const notification = useNotificationStore()

type ForgePart = 'weapon' | 'armor' | 'helmet' | 'boots' | 'charm' | 'ring'

const part = ref<ForgePart>('weapon')

const PART_TABS: TabItem[] = [
  { id: 'weapon', label: '武器' },
  { id: 'armor', label: '衣服' },
  { id: 'helmet', label: '头盔' },
  { id: 'boots', label: '靴子' },
  { id: 'charm', label: '护符' },
  { id: 'ring', label: '戒指' },
]

const selected = ref<XiyouRecipe | null>(null)
const brewing = ref(false)
const rippling = ref(false)
const shaking = ref(false)

watch(part, () => {
  selected.value = null
})

// NOTE: 部位以 equipment.json slot 为权威（6 槽）；不用 item.type 判断——
//       材料与装备存在重名（如「翡翠玉镯」：玉石材料 vs 戒指装备），type 会误判。
const SLOT_OF_PART: Record<ForgePart, string> = {
  weapon: 'weapon',
  armor: 'armor',
  helmet: 'helmet',
  boots: 'boots',
  charm: 'charm',
  ring: 'ring',
}

function partOf(r: XiyouRecipe): ForgePart | null {
  const g = equipmentCatalog.find((eq) => eq.name === r.name)
  if (!g) return null
  const found = (Object.entries(SLOT_OF_PART) as [ForgePart, string][]).find(([, slot]) => slot === g.slot)
  return found?.[0] ?? null
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
  const g = gearOf(r)
  if (!g || !pack.blueprintUnlocked(g.id)) return false
  const mats = materialsOf(r)
  return mats.length > 0 && mats.every((m) => m.enough)
}

/** 图纸解锁状态（t1 默认解锁；高阶需持有图纸） */
function unlockedOf(r: XiyouRecipe): boolean {
  const g = gearOf(r)
  return g ? pack.blueprintUnlocked(g.id) : false
}

/** 图纸名称（未持有/未注册时兜底 blueprintId） */
function blueprintNameOf(r: XiyouRecipe): string {
  const g = gearOf(r)
  if (!g?.blueprintId) return ''
  return itemName(g.blueprintId) ?? g.blueprintId
}

function craft(): void {
  const r = selected.value
  if (!r || brewing.value) return
  const g = gearOf(r)
  if (!g) return
  if (!unlockedOf(r)) {
    notification.toast(`未解锁「${g.name}」制造，需持有「${blueprintNameOf(r)}」`, 'warning')
    return
  }
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
    const inst = pack.craftEquipment(g.id)
    if (inst) {
      rippling.value = true
      window.setTimeout(() => {
        rippling.value = false
      }, 700)
    }
    brewing.value = false
  }, 500)
}
</script>
