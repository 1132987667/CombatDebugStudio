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
        @click="selectGear(i)"
      >
        <span class="xy-cave-enh-slot__meta">
          <span class="xy-cave-enh-slot__item">{{ g.item }}</span>
          <span class="xy-cave-enh-slot__lv">{{ qualityName(g.quality) }} · {{ g.slotLabel }}</span>
        </span>
        <p class="xy-cave-enh-slot__effect">{{ g.affixes.length }} 条词条</p>
      </button>
      <p v-if="gears.length === 0" class="xy-cave-enh-empty">尚未穿戴任何装备</p>
    </div>

    <template v-if="gear">
      <h5 class="xy-cave-sec">词条（{{ washModes.directed ? '点选一条作为定向/锁词条目标' : '定向/锁词条需精/超品质' }}）</h5>
      <div class="xy-cave-wash-affixes">
        <button
          v-for="(a, i) in gear.affixes"
          :key="`${a.attribute}:${a.modifierType}:${i}`"
          type="button"
          class="xy-cave-wash-affix"
          :class="{ 'is-selected': targetIdx === i }"
          :disabled="!washModes.directed"
          @click="targetIdx = i"
        >
          {{ affixText(a) }}
        </button>
      </div>

      <div class="xy-cave-star-cost">
        <span class="xy-cave-mat" :class="{ 'is-low': !hasMat('normal') }">
          洗练石 ×1（持 {{ matCount('normal') }}）
          <span v-if="!hasMat('normal')" class="xy-cave-mat__tag">不足</span>
        </span>
        <span class="xy-cave-mat" :class="{ 'is-low': !hasMat('directed') }" v-if="washModes.directed">
          定向洗练石 ×1（持 {{ matCount('directed') }}）
        </span>
        <span class="xy-cave-mat" :class="{ 'is-low': !hasMat('locked') }" v-if="washModes.locked">
          锁词条符 ×1（持 {{ matCount('locked') }}）
        </span>
        <span class="xy-cave-mat">铜钱 {{ WASH_COST_GOLD }}（每次）</span>
      </div>

      <div class="xy-cave-wash-actions">
        <button type="button" class="xy-cave-action" :disabled="!canWash('normal')" @click="doWash('normal')">
          普通洗练
        </button>
        <button type="button" class="xy-cave-action" :disabled="!canWash('directed')" @click="doWash('directed')">
          定向洗练
        </button>
        <button type="button" class="xy-cave-action" :disabled="!canWash('locked')" @click="doWash('locked')">
          锁词条洗练
        </button>
      </div>
      <p class="xy-cave-card__desc">普通=全部重随机 · 定向=仅所选一条重随机 · 锁词条=所选不变其余重随机；结果可能更差。</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore, GEAR_SLOT_LABELS, type GearSlotKey, type GearAffix } from '@/presentation/stores/packStore'
import {
  WASH_COST_GOLD,
  WASH_MATERIAL_NAMES,
  WASH_MATERIALS,
  washAllowed,
  type WashMode,
} from '../../caveLogic'

/** 洗练槽位视图（真实穿戴实例） */
interface WashGearView {
  slot: GearSlotKey
  slotLabel: string
  item: string
  quality: number
  affixes: GearAffix[]
}

const pack = usePackStore()
const notification = useNotificationStore()

const idx = ref(-1)
const targetIdx = ref(-1)

const gears = computed<WashGearView[]>(() =>
  (Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[])
    .filter((slot) => pack.equippedGear(slot))
    .map((slot) => {
      const inst = pack.equippedInstance(slot) as NonNullable<ReturnType<typeof pack.equippedInstance>>
      return {
        slot,
        slotLabel: GEAR_SLOT_LABELS[slot],
        item: (pack.equippedGear(slot) as { name: string }).name,
        quality: inst.quality,
        affixes: inst.affixes,
      }
    }),
)

function usable(g: WashGearView): boolean {
  return g.affixes.length > 0
}

const gear = computed<WashGearView | null>(() => (idx.value >= 0 ? gears.value[idx.value] ?? null : null))

function selectGear(i: number): void {
  idx.value = i
  targetIdx.value = -1
}

const qualityName = (q: number): string => ({ 1: '凡', 2: '精', 3: '超', 4: '绝', 5: '神' })[q] ?? `品质${q}`

const washModes = computed(() => ({
  normal: washAllowed('normal', gear.value?.quality ?? 1),
  directed: washAllowed('directed', gear.value?.quality ?? 1),
  locked: washAllowed('locked', gear.value?.quality ?? 1),
}))

function matCount(mode: WashMode): number {
  return pack.countOf(WASH_MATERIALS[mode])
}
function hasMat(mode: WashMode): boolean {
  return matCount(mode) >= 1
}
const hasGold = computed(() => pack.currency.copper >= WASH_COST_GOLD)

function canWash(mode: WashMode): boolean {
  if (!gear.value || !washModes.value[mode] || !hasGold.value || !hasMat(mode)) return false
  if (mode !== 'normal') return targetIdx.value >= 0
  return true
}

function doWash(mode: WashMode): void {
  const g = gear.value
  if (!g || !canWash(mode)) return
  pack.washGear(g.slot, mode, targetIdx.value)
}

/** 词条文案（属性名 + 数值，percent 补 %） */
function affixText(a: GearAffix): string {
  const label: Record<string, string> = {
    attack: '攻击',
    defense: '防御',
    maxHealth: '气血',
    speed: '速度',
    critRate: '暴击率',
    critDamage: '暴击伤害',
    hitBonus: '命中加成',
    speedBonus: '速度加成',
    comboRate: '连击率',
    counterRate: '反击率',
    dodge: '闪避',
    blockRate: '格挡率',
  }
  const suffix = a.modifierType === 'percent' ? '%' : ''
  return `${label[a.attribute] ?? a.attribute} +${a.value}${suffix}`
}
</script>

<style scoped>
.xy-cave-wash-affixes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.xy-cave-wash-affix {
  border: 1px solid var(--xy-line, #c9b48a);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: var(--font-size-md);
}

.xy-cave-wash-affix:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.xy-cave-wash-affix.is-selected {
  border-color: var(--xy-accent, #a4763a);
  background: color-mix(in srgb, var(--xy-accent, #a4763a) 12%, transparent);
}

.xy-cave-wash-actions {
  display: flex;
  gap: 12px;
  margin: 12px 0 8px;
}
</style>
