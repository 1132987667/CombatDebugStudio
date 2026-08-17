<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" destroy-inactive class="xy-tabs--seal">
      <template #mates>
        <p class="xy-panel-hint">上阵伙伴上限 3 · 主角 {{ playerStore.player.name }} Lv.{{ playerStore.player.level }}</p>
        <div class="xy-card-grid">
          <div v-for="m in matesWithUnlock" :key="m.name" class="xy-mate-card" :class="{ active: m.active, locked: !m.unlocked }">
            <div class="xy-mate-head">
              <span class="xy-mate-name" :class="qualityClass(m.rarity)">{{ m.name }}</span>
              <span v-if="m.active" class="xy-chip xy-chip--gold">上阵</span>
            </div>
            <span class="xy-mate-role xy-chip xy-chip--jade">{{ m.role }}</span>
            <span class="xy-mate-level">Lv.{{ m.level }} · {{ qualityOf(m.rarity) }}</span>
            <div class="xy-mate-stars" aria-label="星级">
              <IconStar v-for="i in 5" :key="i" class="xy-star" :class="{ on: i <= m.stars }" />
            </div>
            <p class="xy-row-desc">{{ m.desc }}</p>
          </div>
        </div>
      </template>

      <template #pets>
        <div v-for="p in pets" :key="p.name" class="xy-row-card">
          <div class="xy-row-top">
            <span class="xy-row-name" :class="qualityClass(p.rarity)">{{ p.name }}</span>
            <span class="xy-chip xy-chip--jade">{{ qualityOf(p.rarity) }}</span>
            <span v-if="p.active" class="xy-chip xy-chip--gold">伴战</span>
            <span class="xy-row-side">Lv.{{ p.level }}</span>
          </div>
          <p class="xy-row-desc">{{ p.skill }}</p>
          <div class="xy-progress-text">
            <span>成长资质</span>
            <span>{{ p.growth }} / 100</span>
          </div>
          <div class="xy-progress xy-progress--gold">
            <div class="xy-progress-fill" :style="{ width: p.growth + '%' }"></div>
          </div>
        </div>
      </template>

      <template #affinity>
        <p class="xy-panel-hint">集齐缘分成员，激活羁绊加成</p>
        <div v-for="a in affinities" :key="a.name" class="xy-row-card" :class="{ activated: a.activated }">
          <div class="xy-row-top">
            <span class="xy-row-name">{{ a.name }}</span>
            <span class="xy-chip" :class="a.activated ? 'xy-chip--gold' : 'xy-chip--muted'">
              {{ a.activated ? '已激活' : '未激活' }}
            </span>
          </div>
          <p class="xy-row-desc">{{ a.members.join(' · ') }}</p>
          <p class="xy-row-desc xy-row-desc--key">{{ a.bonus }}</p>
          <div class="xy-progress">
            <div class="xy-progress-fill" :style="{ width: a.progress * 100 + '%' }"></div>
          </div>
        </div>
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import IconStar from '~icons/app/star'

import type { TabItem } from '@/presentation/components'
import { affinities, mates, pets } from '../xiyouData'
import type { XiyouMate } from '../types'
import { qualityClass, qualityOf } from '../quality'
import { usePlayerStore } from '@/presentation/stores/playerStore'

const playerStore = usePlayerStore()

const sub = ref<'mates' | 'pets' | 'affinity'>('mates')

const SUBS: TabItem[] = [
  { id: 'mates', label: '伙伴' },
  { id: 'pets', label: '灵宠' },
  { id: 'affinity', label: '缘分' },
]

/** 伙伴解锁状态：前 4 位已解锁，余下待剧情推进（展示用） */
const matesWithUnlock: Array<XiyouMate & { unlocked: boolean }> = mates.map((m, i) => ({ ...m, unlocked: i < 4 }))
</script>

<style scoped lang="scss">
.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 伙伴 ── */
.xy-mate-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;

  &.active {
    border-color: var(--xy-gold);
    background: var(--xy-gold-soft);
  }

  &.locked {
    opacity: 0.55;
  }
}

.xy-mate-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.xy-mate-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-mate-level {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-mate-stars {
  display: flex;
  gap: 2px;
}

.xy-star {
  width: 12px;
  height: 12px;
  color: var(--xy-ink-4);
  opacity: 0.5;

  &.on {
    color: var(--xy-gold);
    opacity: 1;
  }
}

.xy-row-card.activated {
  border-color: rgba(var(--rgb-warning), var(--alpha-border));
  background: var(--xy-gold-soft);
}
</style>
