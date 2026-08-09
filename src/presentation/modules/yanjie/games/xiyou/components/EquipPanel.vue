<template>
  <div class="xy-panel-scroll">
    <div class="xy-panel-tabs" role="tablist" aria-label="装备子系统">
      <button v-for="s in SUBS" :key="s.id" type="button" role="tab" class="xy-panel-tab"
        :class="{ active: sub === s.id }" :aria-selected="sub === s.id" @click="sub = s.id">
        {{ s.label }}
      </button>
    </div>

    <!-- 装备 -->
    <div v-if="sub === 'gear'">
      <div class="xy-gear-grid">
        <div v-for="g in gearSlots" :key="g.slot" class="xy-gear-slot" :class="{ empty: !g.equipped }">
          <span class="xy-gear-slot-name">{{ g.slot }}</span>
          <span class="xy-gear-slot-item">{{ g.item }}</span>
          <span v-if="g.equipped" class="xy-gear-slot-enhance">+{{ g.enhance }}</span>
          <span v-else class="xy-gear-slot-enhance xy-gear-slot-enhance--empty">空</span>
          <p class="xy-gear-slot-effect">{{ g.effect }}</p>
        </div>
      </div>

      <div class="xy-gear-actions">
        <button v-for="a in gearActions" :key="a.name" type="button" class="xy-gear-action xy-ink-hover">
          <span class="xy-gear-action-name">{{ a.name }}</span>
          <span class="xy-gear-action-cost">{{ a.cost }}</span>
        </button>
      </div>
    </div>

    <!-- 法宝 -->
    <div v-else-if="sub === 'treasure'">
      <p class="xy-panel-hint">喂养法宝提升等级 · 觉醒解锁本源神通</p>
      <div v-for="t in treasures" :key="t.name" class="xy-row-card">
        <div class="xy-row-top">
          <span class="xy-row-name" :class="qualityClass(t.tier)">{{ t.name }}</span>
          <span class="xy-chip xy-chip--jade">{{ t.tier }}</span>
          <span v-if="t.active" class="xy-chip xy-chip--gold">已装备</span>
          <span class="xy-row-side">Lv.{{ t.level }}/{{ t.maxLevel }}</span>
        </div>
        <p class="xy-row-desc">{{ t.skill }}</p>
        <div class="xy-progress" :class="{ 'xy-progress--gold': t.active }">
          <div class="xy-progress-fill" :style="{ width: t.progress * 100 + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 坐骑 -->
    <div v-else>
      <div v-for="m in mounts" :key="m.name" class="xy-row-card">
        <div class="xy-row-top">
          <span class="xy-row-name" :class="qualityClass(m.quality)">{{ m.name }}</span>
          <span class="xy-chip" :class="mountQualityChip(m.quality)">{{ m.quality }}</span>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { gearSlots, mounts, treasures, type XiyouQuality } from '../data/mock'

const sub = ref<'gear' | 'treasure' | 'mount'>('gear')

const SUBS = [
  { id: 'gear', label: '装备' },
  { id: 'treasure', label: '法宝' },
  { id: 'mount', label: '坐骑' },
] as const

const gearActions = [
  { name: '强化', cost: '消耗 铜钱×120' },
  { name: '升星', cost: '消耗 玄铁×2' },
  { name: '洗练', cost: '消耗 灵石×1' },
  { name: '替换', cost: '从背包更换' },
]

function qualityClass(q: XiyouQuality): string {
  return `xy-q--${q}`
}

function mountQualityChip(q: XiyouQuality): string {
  return { 凡品: 'xy-chip--muted', 玄品: 'xy-chip--jade', 地品: 'xy-chip--jade', 天品: 'xy-chip--seal', 仙品: 'xy-chip--gold' }[q]
}
</script>

<style scoped lang="scss">
.xy-panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding-right: var(--space-2);
}

.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 装备 ── */
.xy-gear-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.xy-gear-slot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;

  &.empty {
    opacity: 0.6;
    background: var(--color-bg-secondary);
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

.xy-gear-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.xy-gear-action {
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
}

.xy-gear-action-name {
  font-size: var(--font-size-md);
}

.xy-gear-action-cost {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}
</style>
