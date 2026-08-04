<template>
  <div class="ht-pane" style="--pc: var(--color-energy)">
    <div class="ht-pane-hd">
      <span class="t">事件流 · 时间戳序</span>
      <span style="display: flex; gap: 8px; align-items: center">
        <button class="ht-btn mini" :class="{ on: store.showDbg }" title="显示/隐藏调试专属事件（AI 决策 / 属性重算 / 配置）" @click="store.toggleDbg()">
          {{ store.showDbg ? '调试专属 · 显示' : '调试专属 · 隐藏' }}
        </button>
        <span class="s">{{ shownCount }} / {{ store.evs.length }}</span>
      </span>
    </div>
    <div class="ht-stream-filter">
      <input v-model="store.streamText" class="ht-select ht-search" placeholder="过滤关键词 / 数值…" aria-label="过滤关键词" />
    </div>
    <div class="ht-pane-bd" ref="boxRef">
      <div v-if="store.archive" class="ht-stream">
        <div v-for="ev in shown" :key="ev.id" class="ht-srow" :data-eid="ev.id"
          :title="`${ev.summary}（点击定位，右键切换书签）`"
          :class="[sepClass(ev), rootClass(ev), { past: isPast(ev), cur: isCur(ev), sel: ev.id === store.selectedId, bm: store.isBookmarked(ev.id), dim: isDim(ev.id) }]"
          @click="store.focusEvent(ev.id, { seek: true, fx: true })"
          @contextmenu.prevent="store.toggleBookmark(ev.id)">
          <span class="ht-s-time">{{ formatTime(ev.timestamp) }}</span>
          <span class="ht-s-ico" :class="'ht-' + meta(ev).cls">{{ meta(ev).icon }}</span>
          <span class="ht-s-sum">{{ ev.summary }}</span>
          <span v-if="meta(ev).debugOnly" class="ht-s-dbg">调试</span>
          <span v-if="store.isBookmarked(ev.id)" class="ht-s-bm" title="书签（右键切换）">◆</span>
        </div>
      </div>
      <div v-else class="ht-empty">存档未加载</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import { useHaotianStore } from '../stores/haotianStore'

const store = useHaotianStore()
const boxRef = ref<HTMLElement | null>(null)

const meta = (ev: UnifiedEvent) => PHASE_META[ev.phase]
const isPast = (ev: UnifiedEvent): boolean => ev.timestamp <= store.playback.t
const isCur = (ev: UnifiedEvent): boolean => store.lastEvent?.id === ev.id
const sepClass = (ev: UnifiedEvent): Record<string, boolean> => ({ sep: ev.phase === 'turn_flow' })
const rootClass = (ev: UnifiedEvent): Record<string, boolean> => ({ root: ev.phase === 'battle_lifecycle' })
const isDim = (id: string): boolean => store.focusMode && !!store.selectedEvent && !store.isRelated(id)

const shown = computed(() => store.filteredEvents)
const shownCount = computed(() => shown.value.length)

// 播放跟随：当前事件滚动进视野（V4 updateCursorUI 同款）
watch(
  () => store.lastEvent?.id,
  () => {
    if (!store.playback.playing || !store.playback.follow || !store.lastEvent || !boxRef.value) return
    const row = boxRef.value.querySelector<HTMLElement>(`.ht-srow[data-eid="${store.lastEvent.id}"]`)
    if (!row) return
    const rt = row.offsetTop
    const rh = row.offsetHeight
    const st = boxRef.value.scrollTop
    const vh = boxRef.value.clientHeight
    if (rt < st + 30 || rt + rh > st + vh - 30) boxRef.value.scrollTop = rt - vh / 2
  },
)
</script>
