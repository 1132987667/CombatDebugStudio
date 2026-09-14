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
              <span class="xy-chip" :class="questChip(q)">
                {{ questState(q) }}
              </span>
              <button v-if="canClaim(q)" type="button" class="xy-claim-btn" @click="claim(q)">领取奖励</button>
              <span v-else class="xy-row-side">{{ q.progress }}/{{ q.target }}</span>
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
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { saveManager } from '../save-bridge'
import { events, quests } from '../xiyouData'
import type { XiyouQuest } from '../types'

const sub = ref<'quest' | 'event'>('quest')

const notification = useNotificationStore()

const SUBS: TabItem[] = [
  { id: 'quest', label: '任务' },
  { id: 'event', label: '活动' },
]

/** 任务态文案与配色：已领取 > 可领取 > 进行中 */
function questState(q: XiyouQuest): string {
  if (q.claimed) return '已领取'
  return q.progress >= q.target ? '可领取' : '进行中'
}

function questChip(q: XiyouQuest): string {
  if (q.claimed) return 'xy-chip--muted'
  return q.progress >= q.target ? 'xy-chip--gold' : 'xy-chip--jade'
}

/** 结构化任务达成未领取才出领取按钮（纯展示任务如「勤修苦练」无 rewards，不出） */
function canClaim(q: XiyouQuest): boolean {
  return !!q.rewards?.length && !q.claimed && q.progress >= q.target
}

/** 领取奖励：exp/money/item 分别入账并标记录态（进度经存档持久化） */
function claim(q: XiyouQuest): void {
  if (!canClaim(q) || !q.rewards) return
  const player = usePlayerStore()
  const pack = usePackStore()
  for (const r of q.rewards) {
    if (r.kind === 'exp') player.gainExp(r.amount)
    else if (r.kind === 'money') player.gainCurrency('money', r.amount)
    else if (r.kind === 'item' && r.itemId) pack.addItem(r.itemId, r.amount)
  }
  q.claimed = true
  void saveManager.save('auto')
  notification.toast(`领取「${q.name}」奖励`, 'success')
}

const questCats = computed(() => {
  const order: Array<XiyouQuest['type']> = ['主线', '日常', '周常']
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

.xy-claim-btn {
  padding: 2px var(--space-3);
  border: 1px solid var(--xy-gold);
  border-radius: var(--radius-sm);
  background: var(--xy-gold-soft);
  font-size: var(--font-size-md);
  font-family: inherit;
  color: var(--xy-gold);
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: var(--xy-gold);
    color: var(--xy-ink-1);
  }
}

</style>
