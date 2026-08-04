<template>
  <div class="ht-pane" style="--pc: var(--color-energy)">
    <div class="ht-pane-hd">
      <span class="t">事件流 · 时间序</span>
      <span style="display: flex; gap: 8px; align-items: center">
        <Button size="tiny" :active="store.showDbg" title="显示/隐藏调试专属事件（AI 决策 / 属性重算 / 配置）" @click="store.toggleDbg()">
          {{ store.showDbg ? '调试专属 · 显示' : '调试专属 · 隐藏' }}
        </Button>
        <span class="s">{{ shownCount }} / {{ store.evs.length }}</span>
      </span>
    </div>
    <div class="ht-stream-filter">
      <TacticalInput size="md" :model-value="store.streamText" placeholder="过滤关键词 / 数值…" aria-label="过滤关键词"
        @update:model-value="store.streamText = String($event ?? '')" />
    </div>
    <div class="ht-pane-bd" ref="scrollRef" @scroll.passive="onScroll">
      <div v-if="store.archive" class="ht-vlist" :style="{ height: totalHeight + 'px' }">
        <div v-for="ev in visible" :key="ev.id" class="ht-vitem" :data-vid="ev.id"
          :ref="(el) => measure(ev.id, el as HTMLElement | null)"
          :style="{ transform: `translateY(${offsetOf(ev.id)}px)` }">
          <div class="ht-srow" :data-eid="ev.id"
            :title="`${ev.summary}（点击定位，右键切换书签）`"
            role="button" tabindex="0"
            :aria-label="`${formatTime(ev.timestamp)} · ${ev.summary}${store.isBookmarked(ev.id) ? ' · 已书签' : ''}`"
            :class="[sepClass(ev), rootClass(ev), { past: isPast(ev), cur: isCur(ev), sel: ev.id === store.selectedId, bm: store.isBookmarked(ev.id), dim: isDim(ev.id) }]"
            @click="store.focusEvent(ev.id, { seek: true, fx: true })"
            @keydown.enter.prevent="store.focusEvent(ev.id, { seek: true, fx: true })"
            @keydown.space.prevent="store.focusEvent(ev.id, { seek: true, fx: true })"
            @contextmenu.prevent="store.toggleBookmark(ev.id)">
            <span class="ht-s-time">{{ formatTime(ev.timestamp) }}</span>
            <span class="ht-s-ico" :class="'ht-' + meta(ev).cls">{{ meta(ev).icon }}</span>
            <span class="ht-s-sum">{{ ev.summary }}</span>
            <span v-if="meta(ev).debugOnly" class="ht-s-dbg">调试</span>
            <button type="button" class="ht-bm-btn" :class="{ on: store.isBookmarked(ev.id) }"
              :title="store.isBookmarked(ev.id) ? '移除书签' : '添加书签'"
              :aria-label="store.isBookmarked(ev.id) ? '移除书签' : '添加书签'"
              @click.stop="store.toggleBookmark(ev.id)">◆</button>
          </div>
        </div>
      </div>
      <div v-else class="ht-empty">存档未加载</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import type { UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import { useHaotianStore } from '../stores/haotianStore'
import { useVirtualList } from '../composables/useVirtualList'
import TacticalInput from '@/presentation/components/TacticalInput.vue'
import Button from '@/presentation/components/Button.vue'

const store = useHaotianStore()

const { scrollRef, onScroll, updateView, remeasure, measure, offsetOf, totalHeight, visible } =
  useVirtualList<UnifiedEvent>({
    items: () => store.filteredEvents,
    estimate: 42,
    gap: 6,
    padding: 8,
    rowQuery: '.ht-vitem',
    attr: 'data-vid',
  })

const meta = (ev: UnifiedEvent) => PHASE_META[ev.phase]
const isPast = (ev: UnifiedEvent): boolean => ev.timestamp <= store.playback.t
const isCur = (ev: UnifiedEvent): boolean => store.lastEvent?.id === ev.id
const sepClass = (ev: UnifiedEvent): Record<string, boolean> => ({ sep: ev.phase === 'turn_flow' })
const rootClass = (ev: UnifiedEvent): Record<string, boolean> => ({ root: ev.phase === 'battle_lifecycle' })
const isDim = (id: string): boolean => store.focusMode && !!store.selectedEvent && !store.isRelated(id)

const shownCount = computed(() => store.filteredEvents.length)

// 播放跟随：当前事件滚动进视野（虚拟列表下按行偏移定位，无需命中已渲染行）
watch(
  () => store.lastEvent?.id,
  () => {
    if (!store.playback.playing || !store.playback.follow || !store.lastEvent || !scrollRef.value) return
    const y = offsetOf(store.lastEvent.id)
    const st = scrollRef.value.scrollTop
    const vh = scrollRef.value.clientHeight
    if (y < st + 30 || y > st + vh - 30) scrollRef.value.scrollTop = Math.max(0, y - vh / 2)
  },
)

// 容器从隐藏变为可见（昊天镜 tab 激活 / 切到回放模式）时重测视口与行高
watch(
  () => store.mode,
  () => {
    nextTick(updateView)
    remeasure()
  },
)
</script>
