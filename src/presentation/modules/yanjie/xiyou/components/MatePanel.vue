<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" destroy-inactive class="xy-tabs--seal">
      <template #mates>
        <p class="xy-panel-hint">上阵伙伴上限 {{ MAX_ACTIVE_MATES }} · 主角 {{ playerStore.player.name }} Lv.{{ playerStore.player.level }}</p>
        <div class="xy-card-grid">
          <div v-for="(m, i) in matesWithUnlock" :key="m.name" class="xy-mate-card" :class="{ active: m.active, locked: !m.unlocked }">
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
            <button
              v-if="m.unlocked && m.stats && m.level > 0"
              type="button"
              class="xy-mate-toggle"
              :class="{ off: m.active }"
              :disabled="!m.active && activeMateCount >= MAX_ACTIVE_MATES"
              @click="toggleMate(m.name)"
            >{{ m.active ? '下场' : '上阵' }}</button>
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

      
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import IconStar from '~icons/app/star'

import type { TabItem } from '@/presentation/components'
import { mates, pets } from '../xiyouData'
import { MAX_ACTIVE_MATES } from '../battle'
import { saveManager } from '../save-bridge'
import type { XiyouMate } from '../types'
import { qualityClass, qualityOf } from '../quality'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

const playerStore = usePlayerStore()
const notification = useNotificationStore()

const sub = ref<'mates' | 'pets'>('mates')

const SUBS: TabItem[] = [
  { id: 'mates', label: '伙伴' },
  { id: 'pets', label: '灵宠' },
]

/** 伙伴解锁状态：前 4 位已解锁，余下待剧情推进（展示用） */
const matesWithUnlock: Array<XiyouMate & { unlocked: boolean }> = mates.map((m, i) => ({ ...m, unlocked: i < 4 }))

const activeMateCount = computed(() => mates.filter((m) => m.active).length)

/** 上阵/下场（上限 MAX_ACTIVE_MATES；即时存档，出战阵容随下次战斗生效） */
function toggleMate(name: string): void {
  const m = mates.find((x) => x.name === name)
  if (!m) return
  if (m.active) {
    m.active = false
  } else {
    if (activeMateCount.value >= MAX_ACTIVE_MATES) {
      notification.toast(`上阵伙伴最多 ${MAX_ACTIVE_MATES} 名`, 'warning')
      return
    }
    m.active = true
  }
  saveManager.autoSave()
  notification.toast(m.active ? `${m.name} 已上阵` : `${m.name} 已下场`, 'success')
}
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

.xy-mate-toggle {
  align-self: flex-start;
  margin-top: var(--space-1);
  padding: 2px var(--space-3);
  border: 1px solid var(--xy-gold);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-gold);
  font-family: inherit;
  font-size: var(--font-size-md);
  letter-spacing: 2px;
  cursor: pointer;

  &:hover:not(:disabled) { background: var(--xy-gold-soft); }
  &.off { border-color: var(--xy-ink-line); color: var(--xy-ink-3); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
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
