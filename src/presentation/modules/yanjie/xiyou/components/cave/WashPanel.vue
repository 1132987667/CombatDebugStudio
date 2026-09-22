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
        <p class="xy-cave-enh-slot__effect">{{ washable(g).length }} 条词条</p>
      </button>
      <p v-if="gears.length === 0" class="xy-cave-enh-empty">尚未穿戴任何装备</p>
    </div>

    <template v-if="gear">
      <h5 class="xy-cave-sec">附加词条（{{ washModes.directed ? '点选一条作为定向/锁词条目标' : '定向/锁词条需精/超品质' }}）</h5>
      <div class="xy-cave-wash-affixes">
        <button
          v-for="(a, i) in washable(gear)"
          :key="`${a.attribute}:${a.modifierType}:${i}`"
          type="button"
          class="xy-cave-wash-affix"
          :class="[diffClass(a), { 'is-selected': targetIdx === i }]"
          :disabled="!washModes.directed"
          @click="targetIdx = i"
        >
          {{ affixText(a) }}{{ diffMark(a) }}
        </button>
        <span
          v-for="r in removedAffixes"
          :key="`rm-${r.attribute}:${r.modifierType}`"
          class="xy-cave-wash-affix is-removed"
          :title="`本次洗练被替换：${affixText(r)}`"
        >
          {{ affixText(r) }}
        </span>
      </div>
      <p v-if="removedAffixes.length" class="xy-cave-wash-diff-note">删除线为本次洗练被替换掉的旧词条</p>

      <div class="xy-cave-star-cost">
        <span class="xy-cave-mat" :class="{ 'is-low': !hasMat('normal') }">
          洗练石 ×1（持 {{ matCount('normal') }}）
          <span v-if="!hasMat('normal')" class="xy-cave-mat__tag">不足</span>
        </span>
        <span class="xy-cave-mat" :class="{ 'is-low': !hasMat('directed') }" v-if="washModes.directed">
          天衍定元玉 ×1（持 {{ matCount('directed') }}）
        </span>
        <span class="xy-cave-mat" :class="{ 'is-low': !hasMat('locked') }" v-if="washModes.locked">
          九宫锁灵印 ×1（持 {{ matCount('locked') }}）
        </span>
        <span class="xy-cave-mat">金钱 {{ WASH_COST_GOLD }}（每次）</span>
      </div>

      <div class="xy-cave-wash-actions" :class="{ 'xy-cave-ripple': rippling, 'xy-cave-shake': shaking }">
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
import { attrShortName } from '@/domain/fengshen/equipment-overview'
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

/** 可洗练的附加词条（§21：主要属性 fixed 第 1 条 / main 第 2 条不参与洗练，index 与 washGear 的附加下标一致） */
function washable(g: WashGearView): GearAffix[] {
  return g.affixes.filter((a) => !a.fixed && !a.main)
}

function usable(g: WashGearView): boolean {
  return washable(g).length > 0
}

const gear = computed<WashGearView | null>(() => (idx.value >= 0 ? gears.value[idx.value] ?? null : null))

function selectGear(i: number): void {
  idx.value = i
  targetIdx.value = -1
  lastWashDiff.value = null
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
const hasGold = computed(() => pack.currency.money >= WASH_COST_GOLD)

function canWash(mode: WashMode): boolean {
  if (!gear.value || !washModes.value[mode] || !hasGold.value || !hasMat(mode)) return false
  if (mode !== 'normal') return targetIdx.value >= 0
  return true
}

function doWash(mode: WashMode): void {
  const g = gear.value
  if (!g || !canWash(mode)) return
  // 洗练前快照:词条键(attribute|modifierType) → 旧值,供洗练后 diff 高亮
  const before = new Map<string, number>()
  for (const a of washable(g)) before.set(affixKey(a), a.value)
  const ok = pack.washGear(g.slot, mode, targetIdx.value)
  if (ok) {
    computeWashDiff(before)
    rippling.value = true
    window.setTimeout(() => { rippling.value = false }, 700)
  } else {
    shaking.value = true
    window.setTimeout(() => { shaking.value = false }, 400)
  }
}

const rippling = ref(false)
const shaking = ref(false)

/* ── 洗练 diff 高亮:对比最近一次洗练前后的附加词条 ── */

const affixKey = (a: Pick<GearAffix, 'attribute' | 'modifierType'>): string => `${a.attribute}|${a.modifierType}`

interface WashDiff {
  up: Set<string>
  down: Set<string>
  added: Set<string>
  removed: Array<Pick<GearAffix, 'attribute' | 'modifierType' | 'value'>>
}

const lastWashDiff = ref<WashDiff | null>(null)

function computeWashDiff(before: Map<string, number>): void {
  const g = gear.value
  if (!g) { lastWashDiff.value = null; return }
  const up = new Set<string>()
  const down = new Set<string>()
  const added = new Set<string>()
  const afterKeys = new Set<string>()
  for (const a of washable(g)) {
    const k = affixKey(a)
    afterKeys.add(k)
    const prev = before.get(k)
    if (prev === undefined) { if (before.size > 0) added.add(k); continue }
    if (a.value > prev) up.add(k)
    else if (a.value < prev) down.add(k)
  }
  const removed: WashDiff['removed'] = []
  for (const [k, value] of before) {
    if (afterKeys.has(k)) continue
    const [attribute, modifierType] = k.split('|')
    removed.push({ attribute, modifierType, value })
  }
  lastWashDiff.value = { up, down, added, removed }
}

const removedAffixes = computed(() => lastWashDiff.value?.removed ?? [])

function diffClass(a: GearAffix): string {
  const d = lastWashDiff.value
  if (!d) return ''
  const k = affixKey(a)
  if (d.up.has(k)) return 'is-up'
  if (d.down.has(k)) return 'is-down'
  if (d.added.has(k)) return 'is-added'
  return ''
}

function diffMark(a: GearAffix): string {
  const cls = diffClass(a)
  if (cls === 'is-up') return ' ↑'
  if (cls === 'is-down') return ' ↓'
  if (cls === 'is-added') return ' ＋'
  return ''
}

/** 词条文案（属性名 + 数值，percent 补 %；属性名走领域字典，覆盖全部曲线属性码） */
function affixText(a: GearAffix): string {
  const suffix = a.modifierType === 'percent' ? '%' : ''
  return `${attrShortName(a.attribute)} +${a.value}${suffix}`
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
  border: 1px solid var(--xy-ink-line);
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
  border-color: var(--xy-seal);
  background: color-mix(in srgb, var(--xy-seal) 12%, transparent);
}

/* 洗练 diff 高亮:↑ 提升 / ↓ 降低 / ＋ 新增 / 删除线 = 被替换旧词条 */
.xy-cave-wash-affix.is-up {
  border-color: var(--color-success);
  color: var(--color-success);
}

.xy-cave-wash-affix.is-down {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.xy-cave-wash-affix.is-added {
  border-color: var(--color-warning);
  color: var(--color-warning);
}

.xy-cave-wash-affix.is-removed {
  text-decoration: line-through;
  opacity: 0.55;
  cursor: default;
}

.xy-cave-wash-diff-note {
  margin: -6px 0 12px;
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}

.xy-cave-wash-actions {
  display: flex;
  gap: 12px;
  margin: 12px 0 8px;
}
</style>
