<template>
  <div class="ht-pane" style="--pc: var(--color-energy)">
    <div class="ht-pane-hd">
      <span class="t">行动卡片 · 因果序</span>
      <span style="display: flex; gap: 6px; align-items: center">
        <Button class="ht-tbtn" title="上一事件（←）" @click="store.stepEvent(-1)">上一事件</Button>
        <Button class="ht-tbtn" title="下一事件（空格/→）" @click="store.stepEvent(1)">下一事件</Button>
      </span>
    </div>
    <div class="ht-stream-hd">
      <div class="ht-sh-title">{{ nodeTitle }}</div>
      <div class="ht-sh-sub" v-html="nodeSub"></div>
    </div>
    <div class="ht-pane-bd ht-vscroll" ref="scrollRef" @scroll.passive="onScroll">
      <div v-if="items.length" class="ht-vlist" :style="{ height: totalHeight + 'px' }">
        <div v-for="item in visible" :key="item.id" class="ht-vitem" :data-id="item.id"
          :ref="(el) => measure(item.id, el as HTMLElement | null)"
          :style="{ transform: `translateY(${offsetOf(item.id)}px)` }">
          <div class="ht-ev" :title="`${item.summary}（点击检视，右键切换书签）`"
            role="button" tabindex="0"
            :aria-label="`${item.summary}${store.isBookmarked(item.id) ? ' · 已书签' : ''}`"
            :class="[toneClass(item), { on: item.id === store.selectedId, 'dbg-dim': meta(item).debugOnly, bm: store.isBookmarked(item.id), dim: isDim(item.id) }]"
            @click="store.focusEvent(item.id, { seek: true })"
            @keydown.enter.prevent="store.focusEvent(item.id, { seek: true })"
            @keydown.space.prevent="store.focusEvent(item.id, { seek: true })"
            @contextmenu.prevent="store.toggleBookmark(item.id)">
            <div class="ht-ev-hd">
              <span v-if="item.payload?.seg" class="ht-ev-step">段 {{ item.payload.seg }}</span>
              <span class="ht-ev-title">{{ item.summary }}</span>
              <button type="button" class="ht-bm-btn ht-ev-bm" :class="{ on: store.isBookmarked(item.id) }"
                :title="store.isBookmarked(item.id) ? '移除书签' : '添加书签'"
                :aria-label="store.isBookmarked(item.id) ? '移除书签' : '添加书签'"
                @click.stop="store.toggleBookmark(item.id)">◆</button>
              <span class="ht-ev-badge" :class="badgeOf(item)[0]">{{ badgeOf(item)[1] }}</span>
            </div>
            <div class="ht-ev-meta">
              <template v-if="item.sourceId">{{ store.pname(item.sourceId) }}</template>
              <template v-if="item.targetId">{{ item.sourceId ? ' → ' : '' }}{{ store.pname(item.targetId) }}</template>
              <template v-if="turnOf(item)"> · 第 {{ turnOf(item) }} 回合</template>
            </div>
            <div v-if="segIndicators.length" class="ht-ev-multi">
              <i v-for="(m, j) in segIndicators" :key="j" :class="[m, curSeg === j + 1 ? 'cur' : '']"></i>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="ht-empty">{{ store.archive ? '选中时间线节点以查看事件卡片' : '存档未加载，请从顶部选择数据源' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import type { DebugNode } from '@/domain/battle/replay/unified/unified-debug-tree'
import { buildSegResults } from '@/domain/battle/replay/unified/unified-debug-tree'
import type { UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { escapeHtml } from '@/shared/utils/log-segment-factory'
import Button from '@/presentation/components/Button.vue'
import { useHaotianStore } from '../stores/haotianStore'
import { useVirtualList } from '../composables/useVirtualList'

const props = defineProps<{ active?: boolean }>()

const store = useHaotianStore()

const meta = (ev: UnifiedEvent) => PHASE_META[ev.phase]

/** 事件所属回合：优先事件自带 turn，其次快照 turn；都没有则省略不显示 */
function turnOf(ev: UnifiedEvent): number | undefined {
  if (typeof ev.turn === 'number') return ev.turn
  const snapTurn = ev.snapshot?.turn
  return typeof snapTurn === 'number' ? snapTurn : undefined
}

// ───────────── 虚拟列表（复用 useVirtualList）─────────────

const items = computed<UnifiedEvent[]>(() => currentNode.value?.events ?? [])

const { scrollRef, onScroll, updateView, remeasure, resetScroll, measure, offsetOf, totalHeight, visible } =
  useVirtualList<UnifiedEvent>({
    items: () => items.value,
    estimate: 122,
    gap: 10,
    padding: 12,
    rowQuery: '.ht-vitem',
    attr: 'data-id',
  })

// 切换节点时回到顶部并重测视口
watch(
  () => store.debugNodeId,
  () => resetScroll(),
)

// 容器从隐藏变为可见（昊天镜 tab 激活 / 切到调试模式）时重测视口与已渲染卡片高度
watch(
  [() => props.active, () => store.mode],
  () => {
    nextTick(updateView)
    remeasure()
  },
)

// ───────────── 卡片内容 ─────────────

const isDim = (id: string): boolean => store.focusMode && !!store.selectedEvent && !store.isRelated(id)

const currentNode = computed<DebugNode | null>(() => {
  if (!store.debugNodeId) return null
  return store.debugNodes.find((n) => n.id === store.debugNodeId) ?? null
})

const nodeTitle = computed(() => {
  const n = currentNode.value
  return n ? `${n.name}${n.action ? ' · 行动日志' : ' · 阶段结算'}` : '等待载入…'
})

const nodeSub = computed(() => {
  const n = currentNode.value
  if (!n) return '—'
  if (n.action) {
    // NOTE: v-html 渲染，角色名先转义（存档可来自外部导入）
    const actor = escapeHtml(n.actor ? store.pname(n.actor) : '')
    const target = escapeHtml(n.target ? store.pname(n.target) : '')
    return `行动方 <b>${actor}</b> → 目标 <b>${target}</b> · ${n.events.length} 个事件`
  }
  return `系统阶段 · ${n.events.length} 个事件`
})

const segIndicators = computed<Array<'c' | 'm' | 'h'>>(() => {
  const n = currentNode.value
  if (!n?.action || (n.hits ?? 1) <= 1) return []
  return buildSegResults(n)
})

const curSeg = computed<number>(() => {
  const seg = store.selectedEvent?.payload?.seg
  return typeof seg === 'number' ? seg : 0
})

function toneClass(ev: UnifiedEvent): string {
  const pl = (ev.payload ?? {}) as Record<string, unknown>
  if (pl.death) return 't-death'
  if (ev.phase === 'damage_calculation') {
    if (pl.dodge) return 't-miss'
    if (pl.crit) return 't-crit'
    return 't-damage'
  }
  if (ev.phase === 'heal_calculation') return 't-heal'
  if (ev.phase === 'buff_lifecycle') return pl.resisted ? 't-debuff' : 't-buff'
  if (ev.phase === 'passive_trigger') return 't-passive'
  if (ev.phase === 'action_execution') return 't-action'
  return 't-phase'
}

function badgeOf(ev: UnifiedEvent): [string, string] {
  const pl = (ev.payload ?? {}) as Record<string, unknown>
  if (meta(ev).debugOnly) return ['b-dbg', '调试']
  if (ev.phase === 'damage_calculation') {
    if (pl.dodge) return ['b-miss', '闪避']
    if (pl.death) return ['b-death', '击杀']
    if (pl.crit) return ['b-crit', '暴击']
    return ['b-hit', '命中']
  }
  if (ev.phase === 'buff_lifecycle') {
    if (pl.resisted) return ['b-resist', '抵抗']
    return pl.action === 'update' ? ['b-ok', '衰减'] : ['b-hit', '施加']
  }
  if (ev.phase === 'passive_trigger') return ['b-miss', '触发']
  if (ev.phase === 'action_execution') return ['b-hit', '行动']
  return ['b-ok', '系统']
}
</script>
