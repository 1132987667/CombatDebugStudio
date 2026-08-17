<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" destroy-inactive class="xy-tabs--seal">
      <template #gear>
        <div class="xy-gear-layout">
          <!-- 左侧：当前穿戴槽位（固定）+ 已穿戴总属性 -->
          <aside class="xy-gear-side">
            <div class="xy-gear-grid">
              <div v-for="slot in GEAR_SLOT_KEYS" :key="slot" class="xy-gear-slot"
                :class="[{ empty: !equippedInstance(slot) }, slotQualityClass(slot)]"
                @mouseenter="onEnter($event, equippedInstance(slot))" @mouseleave="onLeave"
                @contextmenu.prevent="openMenu($event, { slot, equipped: true, g: equippedInstance(slot) })">
                <span class="xy-gear-slot-name">{{ GEAR_SLOT_LABELS[slot] }}</span>
                <span class="xy-gear-slot-item" :class="qualityClass(equippedInstance(slot)?.rarity ?? 1)">
                  {{ equippedInstance(slot)?.name ?? '空位' }}
                </span>
                <span class="xy-gear-slot-enhance" :class="{ 'xy-gear-slot-enhance--empty': !equippedInstance(slot) }">
                  {{ equippedInstance(slot) ? `强化 +${equippedInstance(slot)!.enhance} · 已穿戴` : '空位' }}
                </span>
                <span v-if="equippedInstance(slot)" class="xy-gear-slot-quality"
                  :class="equipQualityClass(equippedInstance(slot)!.quality)">
                  {{ qualityName(equippedInstance(slot)!.quality) }} · ×{{ factorText(equippedInstance(slot)!.qualityFactor) }}
                </span>
                <p class="xy-gear-slot-effect">{{ equippedInstance(slot) ? statsText(equippedInstance(slot)!) : '未装备' }}</p>
                <button v-if="equippedInstance(slot)" type="button" class="xy-gear-unequip" @click="pack.unequip(slot)">
                  卸下
                </button>
              </div>
            </div>

            <section class="xy-gear-total">
              <h5 class="xy-panel-hint">已穿戴装备提供总属性</h5>
              <div v-if="equippedTotal.length" class="xy-gear-total-rows">
                <span v-for="t in equippedTotal" :key="t.key" class="xy-gear-total-chip">
                  {{ t.label }} +{{ t.value }}{{ t.percent ? '%' : '' }}
                </span>
              </div>
              <p v-else class="xy-gear-pool__empty">尚未穿戴装备</p>
            </section>
          </aside>

          <!-- 右侧：背包装备池（独立滚动，可排序筛选） -->
          <div class="xy-gear-pool">
          <div class="xy-gear-toolbar">
            <TacticalSelect v-model="sortBy" :options="SORT_OPTIONS" placeholder="排序" class="xy-gear-sort" />
            <div class="xy-gear-filters" role="group" aria-label="品质筛选">
              <button v-for="f in QUALITY_FILTERS" :key="f.value" type="button"
                class="xy-gear-filter" :class="{ on: qualityFilter === f.value }" @click="qualityFilter = f.value">
                {{ f.label }}
              </button>
            </div>
          </div>
          <h5 class="xy-panel-hint xy-gear-pool-hint">背包装备 · 点击穿戴</h5>
          <div v-for="slot in GEAR_SLOT_KEYS" :key="slot" class="xy-gear-pool__group">
            <span class="xy-gear-pool__label">{{ GEAR_SLOT_LABELS[slot] }}</span>
            <div class="xy-gear-pool__items">
              <div
                v-for="g in gearInPack(slot)"
                :key="g.instanceId"
                class="xy-gear-pack-item"
              >
                <button
                  type="button"
                  class="xy-gear-pack-item__main"
                  @mouseenter="onEnter($event, g)" @mouseleave="onLeave"
                  @contextmenu.prevent="openMenu($event, { slot, equipped: false, g })"
                  @click="pack.equipInstance(g.instanceId)"
                >
                  <span class="xy-gear-pack-item__name">{{ g.name }}</span>
                  <span class="xy-gear-pack-item__stat">{{ statsText(g) }}</span>
                  <span class="xy-gear-pack-item__quality" :class="equipQualityClass(g.quality)">
                    {{ qualityName(g.quality) }} · ×{{ factorText(g.qualityFactor) }}
                  </span>
                  <span v-if="g.affixes.length" class="xy-gear-pack-item__affix">
                    词缀 ×{{ g.affixes.length }}
                  </span>
                </button>
                <button type="button" class="xy-gear-pack-item__detail" @click="openDetail(g)">详情</button>
              </div>
              <span v-if="gearInPack(slot).length === 0" class="xy-gear-pool__empty">无</span>
            </div>
          </div>
        </div>
        </div>

        <!-- 装备详情（新旧对比） -->
        <GearDetailDialog :instance="detailInstance" @close="onDetailClose" @equip="onDetailEquip" />

        <!-- 装备悬浮详情（复用 EntityTooltip：Teleport + rect 定位 + 视口翻转） -->
        <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="triggerRect"
          @hide="tooltipVisible = false" />

        <!-- 装备右键操作菜单（复用 PackItemCard 的 xy-ctx 范式） -->
        <Teleport to="body">
          <div v-if="menuOpen" ref="menuRef" class="xy-gear-ctx" role="menu" :style="menuStyle" aria-label="装备操作">
            <button v-if="menuTarget?.equipped" type="button" class="xy-gear-ctx-item" @click="act('unequip')">卸下</button>
            <button v-else type="button" class="xy-gear-ctx-item" @click="act('equip')">穿戴</button>
            <button type="button" class="xy-gear-ctx-item xy-gear-ctx-item--danger" @click="act('discard')">丢弃</button>
          </div>
        </Teleport>
      </template>

      <template #treasure>
        <p class="xy-panel-hint">喂养法宝提升等级 · 觉醒解锁本源神通</p>
        <div v-for="t in treasures" :key="t.name" class="xy-row-card">
          <div class="xy-row-top">
            <span class="xy-row-name" :class="qualityClass(t.rarity)">{{ t.name }}</span>
            <span class="xy-chip xy-chip--jade">{{ qualityOf(t.rarity) }}</span>
            <span v-if="t.active" class="xy-chip xy-chip--gold">已装备</span>
            <span class="xy-row-side">Lv.{{ t.level }}/{{ t.maxLevel }}</span>
          </div>
          <p class="xy-row-desc">{{ t.skill }}</p>
          <div class="xy-progress" :class="{ 'xy-progress--gold': t.active }">
            <div class="xy-progress-fill" :style="{ width: t.progress * 100 + '%' }"></div>
          </div>
        </div>
      </template>

      <template #mount>
        <div v-for="m in mounts" :key="m.name" class="xy-row-card">
          <div class="xy-row-top">
            <span class="xy-row-name" :class="qualityClass(m.rarity)">{{ m.name }}</span>
            <span class="xy-chip" :class="mountQualityChip(m.rarity)">{{ qualityOf(m.rarity) }}</span>
            <span v-if="m.active" class="xy-chip xy-chip--gold">当前</span>
            <span class="xy-row-side">Lv.{{ m.level }}</span>
          </div>
          <p class="xy-row-desc">{{ m.skill }}</p>
          <div class="xy-progress-text">
            <span>资质</span>
            <span>{{ m.aptitude }}</span>
          </div>
          <div class="xy-progress xy-progress--line">
            <div class="xy-progress-fill" :style="{ width: m.aptitude + '%' }"></div>
          </div>
          <p class="xy-row-desc xy-row-desc--key">速度加成 +{{ m.speed }}</p>
        </div>
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { TabItem } from '@/presentation/components'

import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import type { EquipmentData } from '@/domain/fengshen/types'
import {
  usePackStore,
  GEAR_SLOT_LABELS,
  type GearInstance,
  type GearSlotKey,
} from '@/presentation/stores/packStore'
import { mounts, treasures } from '../xiyouData'
import { equipQualityClass, qualityClass, qualityColor, qualityName, qualityOf } from '../quality'
import GearDetailDialog from './GearDetailDialog.vue'

const pack = usePackStore()

// NOTE: 独立进入装备 tab 时可能尚未开过行囊/洞府，确保背包与穿戴状态就绪
onMounted(() => {
  void pack.init()
})

const sub = ref<'gear' | 'treasure' | 'mount'>('gear')

const SUBS: TabItem[] = [
  { id: 'gear', label: '装备' },
  { id: 'treasure', label: '法宝' },
  { id: 'mount', label: '坐骑' },
]

/** 六类装备槽键（顺序 = 展示顺序） */
const GEAR_SLOT_KEYS: GearSlotKey[] = ['weapon', 'armor', 'helmet', 'boots', 'charm', 'ring']

/** 背包装备实例视图（含装备定义名，供模板展示） */
interface GearPackView extends GearInstance {
  name: string
  rarity: number
  stats: EquipmentData['stats']
}

/** 背包装备排序键 */
type GearSortKey = 'default' | 'rarity-desc' | 'rarity-asc' | 'name'
const sortBy = ref<GearSortKey>('default')

const SORT_OPTIONS = [
  { value: 'default', label: '默认排序' },
  { value: 'rarity-desc', label: '品阶降序' },
  { value: 'rarity-asc', label: '品阶升序' },
  { value: 'name', label: '名称' },
]

/** 品质筛选：0 全部，1-5 凡/精/超/绝/神（按装备实例 quality，与品阶正交） */
const QUALITY_FILTERS = [
  { value: 0, label: '全部' },
  { value: 1, label: '凡' },
  { value: 2, label: '精' },
  { value: 3, label: '超' },
  { value: 4, label: '绝' },
  { value: 5, label: '神' },
]
const qualityFilter = ref(0)

/** 背包中该槽位可穿戴的装备实例（应用品质筛选 + 排序） */
function gearInPack(slot: GearSlotKey): GearPackView[] {
  const list = pack
    .packGearInstances()
    .filter((g) => pack.gearById(g.itemId)?.slot === slot)
    .filter((g) => qualityFilter.value === 0 || g.quality === qualityFilter.value)
    .map((g) => ({
      ...g,
      name: pack.gearById(g.itemId)?.name ?? g.itemId,
      rarity: pack.gearById(g.itemId)?.rarity ?? 1,
      stats: pack.instanceStats(g),
    }))
  const by = sortBy.value
  if (by === 'rarity-desc') list.sort((a, b) => b.rarity - a.rarity)
  else if (by === 'rarity-asc') list.sort((a, b) => a.rarity - b.rarity)
  else if (by === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return list
}

/** 已穿戴装备提供的总属性（equippedStats 按 attribute+modifierType 聚合） */
const equippedTotal = computed<Array<{ key: string; label: string; value: number; percent: boolean }>>(() => {
  const agg = new Map<string, { value: number; percent: boolean }>()
  for (const s of pack.equippedStats()) {
    const key = `${s.attribute}:${s.modifierType}`
    const prev = agg.get(key)
    agg.set(key, { value: (prev?.value ?? 0) + s.value, percent: s.modifierType === 'percent' })
  }
  return [...agg.entries()]
    .map(([key, v]) => {
      const [attribute] = key.split(':')
      return { key, label: ATTR_LABEL[attribute] ?? attribute, value: v.value, percent: v.percent }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh'))
})

/* ── 装备详情（新旧对比弹窗） ── */
const detailInstance = ref<GearInstance | null>(null)

function openDetail(g: GearPackView): void {
  tooltipVisible.value = false
  detailInstance.value = g
}

function onDetailClose(): void {
  detailInstance.value = null
}

function onDetailEquip(instanceId: string): void {
  if (pack.equipInstance(instanceId)) detailInstance.value = null
}

/** 当前槽位已穿戴实例视图 */
function equippedInstance(slot: GearSlotKey): GearPackView | null {
  const inst = pack.equippedInstance(slot)
  if (!inst) return null
  return {
    ...inst,
    name: pack.gearById(inst.itemId)?.name ?? inst.itemId,
    rarity: pack.gearById(inst.itemId)?.rarity ?? 1,
    stats: pack.instanceStats(inst),
  }
}

/** 装备槽品质类（已穿戴按装备品级着色；空槽回退凡品灰） */
function slotQualityClass(slot: GearSlotKey): string {
  const rarity = equippedInstance(slot)?.rarity ?? 1
  return `xy-gear-slot--r${rarity}`
}

/* ── 装备悬浮详情（复用 EntityTooltip 范式：Teleport + rect 定位） ── */
const tooltipVisible = ref(false)
const triggerRect = ref<DOMRect | null>(null)
const tooltipData = ref<TooltipData | null>(null)

/** 属性代码 → 展示名（与 statsText 共用） */
const ATTR_LABEL: Record<string, string> = {
  attack: '攻击',
  defense: '防御',
  maxHealth: '气血',
  speed: '速度',
  critRate: '暴击率',
}

/** 装备实例 → 悬浮卡片数据（含基础属性×品质×强化、词缀、部位、来源） */
function gearTooltipData(g: GearPackView): TooltipData {
  const def = pack.gearById(g.itemId)
  const attrRows: { label: string; value: string }[] = g.stats.map((s) => {
    const n = ATTR_LABEL[s.attribute] ?? s.attribute
    const suffix = s.modifierType === 'percent' ? '%' : ''
    return { label: n, value: `${s.value >= 0 ? '+' : ''}${s.value}${suffix}` }
  })
  return {
    name: g.name,
    description: def?.description ?? '暂无描述',
    badge: qualityOf(g.rarity),
    nameColor: qualityColor(g.rarity),
    badgeColor: qualityColor(g.rarity),
    durationLabel: def?.subType,
    details: [
      { label: '部位', value: def ? (GEAR_SLOT_LABELS[def.slot] ?? def.slot) : '未知' },
      { label: '品质', value: `${qualityName(g.quality)} · ×${factorText(g.qualityFactor)}` },
      { label: '强化', value: g.enhance > 0 ? `+${g.enhance}` : '未强化' },
      { label: '词缀', value: g.affixes.length > 0 ? `×${g.affixes.length}` : '无' },
      ...attrRows,
    ],
    source: def?.source,
  }
}

/** 悬浮进入：记录触发元素 rect + 组装数据（空槽不显示） */
function onEnter(e: MouseEvent, g: GearPackView | null): void {
  if (!g) return
  triggerRect.value = (e.currentTarget as HTMLElement)?.getBoundingClientRect() ?? null
  tooltipData.value = gearTooltipData(g)
  tooltipVisible.value = true
}

function onLeave(): void {
  tooltipVisible.value = false
}

/* ── 装备右键菜单（复用 PackItemCard 的 xy-ctx 范式） ── */
/** 菜单目标：装备槽（equipped=true 卸下）或背包装备实例（equipped=false 穿戴） */
interface GearMenuTarget {
  slot: GearSlotKey
  equipped: boolean
  g: GearPackView | null
}

const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const menuTarget = ref<GearMenuTarget | null>(null)
let removeDocListener: (() => void) | null = null

/** 右键打开菜单：先收起悬浮，再定位菜单（视口内防溢出） */
function openMenu(e: MouseEvent, target: GearMenuTarget): void {
  if (!target.g) return
  tooltipVisible.value = false
  menuTarget.value = target
  menuStyle.value = {
    left: `${Math.min(e.clientX, window.innerWidth - 132)}px`,
    top: `${Math.min(e.clientY, window.innerHeight - 168)}px`,
  }
  menuOpen.value = true
  removeDocListener = () => {
    window.removeEventListener('mousedown', onDocMouseDown, true)
  }
  window.addEventListener('mousedown', onDocMouseDown, true)
}

function onDocMouseDown(e: MouseEvent): void {
  if (menuRef.value?.contains(e.target as Node)) return
  closeMenu()
}

function closeMenu(): void {
  menuOpen.value = false
  removeDocListener?.()
  removeDocListener = null
}

function act(action: 'equip' | 'unequip' | 'discard'): void {
  const target = menuTarget.value
  closeMenu()
  if (!target?.g) return
  if (action === 'equip') pack.equipInstance(target.g.instanceId)
  else if (action === 'unequip') pack.unequip(target.slot)
  else pack.discardItem(target.g.itemId)
}

onBeforeUnmount(() => {
  removeDocListener?.()
})

/** 装备 stats 文案："攻击 +12"（含强化与词缀） */
function statsText(g: GearPackView): string {
  return g.stats.map((s) => {
    const n = ATTR_LABEL[s.attribute] ?? s.attribute
    const suffix = s.modifierType === 'percent' ? '%' : ''
    return `${n} ${s.value >= 0 ? '+' : ''}${s.value}${suffix}`
  }).join(' · ')
}

/** 品质系数文案：×0.85（百分数展示，>=1 省略小数补零显示两位） */
function factorText(factor: number): string {
  return (Math.round(factor * 100) / 100).toFixed(2)
}

/** 坐骑品级 → chip 类（EquipPanel 专属，不入统一映射表） */
const MOUNT_CHIP_BY_RARITY: Record<number, string> = {
  1: 'xy-chip--muted',
  2: 'xy-chip--jade',
  3: 'xy-chip--jade',
  4: 'xy-chip--seal',
  5: 'xy-chip--gold',
}

function mountQualityChip(rarity: number): string {
  return MOUNT_CHIP_BY_RARITY[rarity] ?? 'xy-chip--muted'
}
</script>

<style scoped lang="scss">
@use '@/presentation/styles/mixins' as *;

.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 装备页左右布局：左侧固定穿戴槽位，右侧背包装备池 ── */
.xy-gear-layout {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

/* 左侧边栏：固定（面板内滚动时保持可见） */
.xy-gear-side {
  position: sticky;
  top: 0;
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* 右侧背包装备池：撑满剩余宽度 */
.xy-gear-pool {
  flex: 1;
  min-width: 0;
}

/* ── 当前穿戴：品质光晕卡片（还原旧设计：同心环背景 + 品级色边框 + hover 浮起发光） ── */
.xy-gear-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2);
}

.xy-gear-slot {
  --r-color: var(--xy-ink-line);
  --ring: var(--r-color);
  --glow: color-mix(in srgb, var(--r-color) 40%, transparent);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--r-color);
  border-radius: 2px;
  color: var(--xy-ink-1);

  &::after {
    @include bg-rings();
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 0 0 3px var(--xy-paper),
      0 0 0 6px var(--ring),
      0 0 34px var(--glow),
      0 22px 46px rgba(0, 0, 0, 0.4);

    &::after {
      animation: hover-breath 1.2s ease-in-out infinite;
    }
  }

  /* 品级着色：r1 凡品灰 ~ r5 仙品橙（对齐 tokens --rarity-* 令牌） */
  &--r1 {
    --r-color: var(--rarity-1);

    &::after {
      @include bg-rings($light: #666666);
    }
  }

  &--r2 {
    --r-color: var(--rarity-2);

    &::after {
      @include bg-rings($light: #4caf50);
    }
  }

  &--r3 {
    --r-color: var(--rarity-3);

    &::after {
      @include bg-rings($light: #60a5fa);
    }
  }

  &--r4 {
    --r-color: var(--rarity-4);

    &::after {
      @include bg-rings($light: #a855f7);
    }
  }

  &--r5 {
    --r-color: var(--rarity-5);

    &::after {
      @include bg-rings($light: #ff9800);
    }
  }

  &.empty {
    opacity: 0.6;
  }
}

.xy-gear-slot-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-gear-slot-item {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-gear-slot-enhance {
  font-size: var(--font-size-md);
  color: var(--xy-seal);

  &--empty {
    color: var(--xy-ink-4);
  }
}

.xy-gear-slot-quality {
  font-size: var(--font-size-md);
  font-weight: 600;
}

.xy-gear-slot-effect {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-gear-unequip {
  margin-top: var(--space-1);
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }
}

/* ── 已穿戴装备总属性 ── */
.xy-gear-total {
  padding: var(--space-3);
  border: 1px dashed var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);

  .xy-panel-hint {
    margin-bottom: var(--space-2);
  }
}

.xy-gear-total-rows {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.xy-gear-total-chip {
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

/* ── 背包装备池工具栏（排序 + 品质筛选） ── */
.xy-gear-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);

  .t-select {
    width: 9rem;
  }
}

.xy-gear-sort {
  flex-shrink: 0;
}

.xy-gear-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.xy-gear-filter {
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &.on {
    border-color: var(--xy-seal);
    background: var(--xy-seal-soft);
    color: var(--xy-seal);
  }
}

.xy-gear-pool-hint {
  margin-bottom: var(--space-2);
}

/* ── 背包装备池 ── */
.xy-gear-pool__group {
  margin-bottom: var(--space-3);
}

.xy-gear-pool__label {
  display: inline-block;
  margin-bottom: var(--space-1);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

.xy-gear-pool__items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.xy-gear-pack-item {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);

  &:hover {
    border-color: var(--xy-seal);
  }

  &.is-worn {
    border-color: var(--xy-seal);
    background: var(--xy-seal-soft);
  }
}

.xy-gear-pack-item__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: none;
  background: transparent;
  color: var(--xy-ink-1);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

.xy-gear-pack-item__detail {
  align-self: center;
  flex-shrink: 0;
  margin-right: var(--space-2);
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-md);

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }
}

.xy-gear-pack-item__name {
  font-size: var(--font-size-md);
}

.xy-gear-pack-item__stat {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-gear-pack-item__quality {
  font-size: var(--font-size-md);
  font-weight: 600;
}

.xy-gear-pack-item__worn {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

.xy-gear-pool__empty {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 装备右键操作菜单（Teleport 到 body，用全局令牌；与 PackItemCard 的 xy-ctx 同范式） ── */
.xy-gear-ctx {
  position: fixed;
  z-index: calc(var(--z-modal) + 60);
  display: flex;
  flex-direction: column;
  min-width: 128px;
  padding: var(--space-1);
  background: var(--color-overlay-panel);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
}

.xy-gear-ctx-item {
  padding: var(--space-2) var(--space-3);
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--font-size-md);
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-sm);

  &:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-warning);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &--danger:hover:not(:disabled) {
    color: var(--color-danger);
  }
}
</style>
