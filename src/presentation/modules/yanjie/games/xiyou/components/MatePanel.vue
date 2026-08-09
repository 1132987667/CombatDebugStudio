<template>
  <div class="xy-panel-scroll">
    <div class="xy-panel-tabs" role="tablist" aria-label="伙伴子系统">
      <button v-for="s in SUBS" :key="s.id" type="button" role="tab" class="xy-panel-tab"
        :class="{ active: sub === s.id }" :aria-selected="sub === s.id" @click="sub = s.id">
        {{ s.label }}
      </button>
    </div>

    <!-- 伙伴 -->
    <div v-if="sub === 'mates'">
      <p class="xy-panel-hint">上阵伙伴上限 3 · 主角 {{ player.name }} Lv.{{ player.level }}</p>
      <div class="xy-card-grid">
        <div v-for="m in matesWithUnlock" :key="m.name" class="xy-mate-card" :class="{ active: m.active, locked: !m.unlocked }">
          <div class="xy-mate-head">
            <span class="xy-mate-name" :class="qualityClass(m.quality)">{{ m.name }}</span>
            <span v-if="m.active" class="xy-chip xy-chip--gold">上阵</span>
          </div>
          <span class="xy-mate-role xy-chip xy-chip--jade">{{ m.role }}</span>
          <span class="xy-mate-level">Lv.{{ m.level }} · {{ m.quality }}</span>
          <div class="xy-mate-stars" aria-label="星级">
            <svg v-for="i in 5" :key="i" viewBox="0 0 24 24" class="xy-star" :class="{ on: i <= m.stars }" aria-hidden="true">
              <path d="M12 3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 15.9 6.7 19l1.3-5.9-4.5-4 6-.6L12 3z" fill="currentColor" />
            </svg>
          </div>
          <p class="xy-row-desc">{{ m.desc }}</p>
        </div>
      </div>
    </div>

    <!-- 灵宠 -->
    <div v-else-if="sub === 'pets'">
      <div v-for="p in pets" :key="p.name" class="xy-row-card">
        <div class="xy-row-top">
          <span class="xy-row-name" :class="qualityClass(p.quality)">{{ p.name }}</span>
          <span class="xy-chip xy-chip--jade">{{ p.quality }}</span>
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
    </div>

    <!-- 缘分 -->
    <div v-else>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { affinities, mates, pets, player, type XiyouMate, type XiyouQuality } from '../data/mock'

const sub = ref<'mates' | 'pets' | 'affinity'>('mates')

const SUBS = [
  { id: 'mates', label: '伙伴' },
  { id: 'pets', label: '灵宠' },
  { id: 'affinity', label: '缘分' },
] as const

/** 伙伴解锁状态：前 4 位已解锁，余下待剧情推进（展示用） */
const matesWithUnlock: Array<XiyouMate & { unlocked: boolean }> = mates.map((m, i) => ({ ...m, unlocked: i < 4 }))

function qualityClass(q: XiyouQuality): string {
  return `xy-q--${q}`
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
