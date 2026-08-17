<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" destroy-inactive class="xy-tabs--seal">
      <template #quest>
        <div v-for="cat in questCats" :key="cat.label" class="xy-quest-cat">
          <h4 class="xy-sec-title">
            {{ cat.label }}
            <span class="xy-sec-count">{{ cat.done }}/{{ cat.items.length }}</span>
          </h4>
          <div v-for="q in cat.items" :key="q.name" class="xy-row-card" :class="{ done: q.progress >= q.target }">
            <div class="xy-row-top">
              <span class="xy-row-name">{{ q.name }}</span>
              <span class="xy-chip" :class="q.progress >= q.target ? 'xy-chip--gold' : 'xy-chip--jade'">
                {{ q.progress >= q.target ? '可领取' : '进行中' }}
              </span>
              <span class="xy-row-side">{{ q.progress }}/{{ q.target }}</span>
            </div>
            <p class="xy-row-desc">{{ q.desc }}</p>
            <div class="xy-progress">
              <div class="xy-progress-fill" :style="{ width: (Math.min(q.progress, q.target) / q.target) * 100 + '%' }"></div>
            </div>
            <p class="xy-row-desc xy-row-desc--key">奖励 {{ q.reward }}</p>
          </div>
        </div>
      </template>

      <template #event>
        <div v-for="e in events" :key="e.name" class="xy-row-card">
          <div class="xy-row-top">
            <span class="xy-row-name">{{ e.name }}</span>
            <span class="xy-chip" :class="eventChip(e.status)">{{ e.status }}</span>
            <span class="xy-row-side">{{ e.time }}</span>
          </div>
          <p class="xy-row-desc">{{ e.desc }}</p>
          <p class="xy-row-desc xy-row-desc--key">奖励 {{ e.reward }}</p>
        </div>
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import type { TabItem } from '@/presentation/components'
import { events, quests } from '../xiyouData'
import type { XiyouQuest } from '../types'

const sub = ref<'quest' | 'event'>('quest')

const SUBS: TabItem[] = [
  { id: 'quest', label: '任务' },
  { id: 'event', label: '活动' },
]

const questCats = computed(() => {
  const order: Array<XiyouQuest['type']> = ['主线', '日常']
  return order.map(type => {
    const items = quests.filter(q => q.type === type)
    return { label: type, items, done: items.filter(q => q.progress >= q.target).length }
  })
})

function eventChip(status: string): string {
  return { 进行中: 'xy-chip--gold', 预告: 'xy-chip--seal', 已结束: 'xy-chip--muted' }[status] ?? 'xy-chip--muted'
}
</script>

<style scoped lang="scss">
.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-quest-cat {
  margin-bottom: var(--space-4);
}

.xy-row-card.done {
  border-color: rgba(var(--rgb-warning), var(--alpha-border));
  background: var(--xy-gold-soft);
}

</style>
