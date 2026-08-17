<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" destroy-inactive class="xy-tabs--seal">
      <template #codex>
        <div v-for="ch in codexChapters" :key="ch.name" class="xy-codex-chapter">
          <h4 class="xy-sec-title">
            {{ ch.name }}
            <span class="xy-sec-count">{{ ch.entries.filter(e => e.captured).length }}/{{ ch.entries.length }}</span>
          </h4>
          <div class="xy-codex-grid">
            <div v-for="e in ch.entries" :key="e.name" class="xy-codex-entry" :class="{ locked: !e.captured }">
              <span class="xy-codex-name">{{ e.name }}</span>
              <span class="xy-codex-level">[{{ e.level }}]</span>
              <span class="xy-codex-state">{{ e.captured ? '已收录' : '未收录' }}</span>
            </div>
          </div>
        </div>
      </template>

      <template #achievement>
        <div v-for="a in achievements" :key="a.name" class="xy-row-card" :class="{ done: a.done }">
          <div class="xy-row-top">
            <span class="xy-row-name">{{ a.name }}</span>
            <span class="xy-chip" :class="a.done ? 'xy-chip--gold' : 'xy-chip--muted'">
              {{ a.done ? '已完成' : '进行中' }}
            </span>
            <span class="xy-row-side">奖励 {{ a.reward }}</span>
          </div>
          <p class="xy-row-desc">{{ a.desc }}</p>
          <div class="xy-progress-text">
            <span>{{ Math.min(a.progress, a.target) }}/{{ a.target }}</span>
            <span>{{ Math.round((Math.min(a.progress, a.target) / a.target) * 100) }}%</span>
          </div>
          <div class="xy-progress" :class="{ 'xy-progress--gold': a.done }">
            <div class="xy-progress-fill" :style="{ width: (Math.min(a.progress, a.target) / a.target) * 100 + '%' }"></div>
          </div>
        </div>
      </template>

      <template #title>
        <p class="xy-panel-hint">称号加成仅当前佩戴生效</p>
        <div v-for="t in titles" :key="t.name" class="xy-row-card" :class="{ owned: t.owned }">
          <div class="xy-row-top">
            <span class="xy-row-name">{{ t.name }}</span>
            <button v-if="t.equipped" type="button" class="xy-chip xy-chip--gold xy-title-btn" :disabled="true">佩戴中</button>
            <button v-else-if="t.owned" type="button" class="xy-chip xy-chip--jade xy-title-btn">佩戴</button>
            <span v-else class="xy-chip xy-chip--muted">未解锁</span>
          </div>
          <p class="xy-row-desc xy-row-desc--key">{{ t.bonus }}</p>
          <p class="xy-row-desc">{{ t.desc }}</p>
        </div>
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import type { TabItem } from '@/presentation/components'
import { achievements, codexChapters, titles } from '../xiyouData'

const sub = ref<'codex' | 'achievement' | 'title'>('codex')

const SUBS: TabItem[] = [
  { id: 'codex', label: '图鉴' },
  { id: 'achievement', label: '成就' },
  { id: 'title', label: '称号' },
]
</script>

<style scoped lang="scss">
.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 图鉴 ── */
.xy-codex-chapter {
  margin-bottom: var(--space-4);
}

.xy-codex-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.xy-codex-entry {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;

  &.locked {
    opacity: 0.5;
    background: var(--color-bg-secondary);
  }
}

.xy-codex-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-codex-level {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

.xy-codex-state {
  margin-left: auto;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 成就 ── */
.xy-row-card.done {
  border-color: rgba(var(--rgb-warning), var(--alpha-border));
}

/* ── 称号 ── */
.xy-row-card.owned {
  border-color: rgba(var(--rgb-warning), var(--alpha-border));
}

.xy-title-btn {
  border: 1px solid currentColor;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}
</style>
