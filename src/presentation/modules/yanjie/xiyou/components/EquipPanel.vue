<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" destroy-inactive class="xy-tabs--seal">
      <template #gear>
        <!-- 当前穿戴：三类槽位 -->
        <div class="xy-gear-grid">
          <div v-for="slot in GEAR_SLOT_KEYS" :key="slot" class="xy-gear-slot"
            :class="{ empty: !equippedGear(slot) }">
            <span class="xy-gear-slot-name">{{ GEAR_SLOT_LABELS[slot] }}</span>
            <span class="xy-gear-slot-item">{{ equippedGear(slot)?.name ?? '空位' }}</span>
            <span class="xy-gear-slot-enhance" :class="{ 'xy-gear-slot-enhance--empty': !equippedGear(slot) }">
              {{ equippedGear(slot) ? '已穿戴' : '空位' }}
            </span>
            <p class="xy-gear-slot-effect">{{ equippedGear(slot) ? statText(equippedGear(slot)!) : '未装备' }}</p>
            <button v-if="equippedGear(slot)" type="button" class="xy-gear-unequip" @click="pack.unequip(slot)">
              卸下
            </button>
          </div>
        </div>

        <!-- 背包装备：按槽位分组，可穿戴 -->
        <div class="xy-gear-pool">
          <h5 class="xy-panel-hint">背包装备 · 点击穿戴</h5>
          <div v-for="slot in GEAR_SLOT_KEYS" :key="slot" class="xy-gear-pool__group">
            <span class="xy-gear-pool__label">{{ GEAR_SLOT_LABELS[slot] }}</span>
            <div class="xy-gear-pool__items">
              <button
                v-for="g in gearInPack(slot)"
                :key="g.id"
                type="button"
                class="xy-gear-pack-item xy-ink-hover"
                :class="{ 'is-worn': pack.equipped[slot] === g.id }"
                @click="pack.equip(g.id)"
              >
                <span class="xy-gear-pack-item__name">{{ g.name }}</span>
                <span class="xy-gear-pack-item__stat">{{ statText(g) }}</span>
                <span v-if="pack.equipped[slot] === g.id" class="xy-gear-pack-item__worn">已穿戴</span>
              </button>
              <span v-if="gearInPack(slot).length === 0" class="xy-gear-pool__empty">无</span>
            </div>
          </div>
        </div>
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
import { onMounted, ref } from 'vue'
import Tabs from '@/presentation/components/Tabs.vue'
import type { TabItem } from '@/presentation/components/Tabs.vue'
import type { EquipmentData } from '@/domain/fengshen/types'
import { usePackStore, GEAR_SLOT_LABELS, type GearSlotKey } from '@/presentation/stores/packStore'
import { mounts, treasures } from '../data/mock'
import { qualityClass, qualityOf } from '../data/quality'

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

/** 三类装备槽键（顺序 = 展示顺序） */
const GEAR_SLOT_KEYS: GearSlotKey[] = ['weapon', 'armor', 'accessory']

/** 背包中该槽位可穿戴的装备（按稀有度降序） */
function gearInPack(slot: GearSlotKey): EquipmentData[] {
  const worn = pack.equipped[slot]
  return pack.ownedItems
    .filter((it) => pack.gearById(it.id)?.slot === slot && it.id !== worn)
    .map((it) => pack.gearById(it.id)!)
    .sort((a, b) => b.rarity - a.rarity)
}

function equippedGear(slot: GearSlotKey): EquipmentData | undefined {
  return pack.equippedGear(slot)
}

/** 装备 stats 文案："攻击 +12" */
function statText(g: EquipmentData): string {
  const label: Record<string, string> = {
    attack: '攻击',
    defense: '防御',
    maxHealth: '气血',
    speed: '速度',
    critRate: '暴击率',
  }
  return g.stats.map((s) => {
    const n = label[s.attribute] ?? s.attribute
    const suffix = s.modifierType === 'percent' ? '%' : ''
    return `${n} ${s.value >= 0 ? '+' : ''}${s.value}${suffix}`
  }).join(' · ')
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

/* ── 当前穿戴 ── */
.xy-gear-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.xy-gear-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
  color: var(--xy-ink-1);

  &.empty {
    opacity: 0.55;
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
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
  color: var(--xy-ink-1);
  cursor: pointer;
  font-family: inherit;
  text-align: left;

  &:hover {
    border-color: var(--xy-seal);
  }

  &.is-worn {
    border-color: var(--xy-seal);
    background: var(--xy-seal-soft);
  }
}

.xy-gear-pack-item__name {
  font-size: var(--font-size-md);
}

.xy-gear-pack-item__stat {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-gear-pack-item__worn {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

.xy-gear-pool__empty {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}
</style>
