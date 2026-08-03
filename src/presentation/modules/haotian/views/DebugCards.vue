<template>
  <div class="ht-pane" style="--pc: var(--color-energy)">
    <div class="ht-pane-hd">
      <span class="t">事件流 · 卡片流</span>
      <span style="display: flex; gap: 6px; align-items: center">
        <button class="ht-tbtn" title="上一事件（←）" @click="store.stepEvent(-1)">上一事件</button>
        <button class="ht-tbtn" title="下一事件（空格/→）" @click="store.stepEvent(1)">下一事件</button>
        <span class="s">投影 2 · 因果链</span>
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
            :class="[toneClass(item), { on: item.id === store.selectedId, 'dbg-dim': meta(item).debugOnly, bm: store.isBookmarked(item.id), dim: isDim(item.id) }]"
            @click="store.focusEvent(item.id, { seek: true })" @contextmenu.prevent="store.toggleBookmark(item.id)">
            <div class="ht-ev-hd">
              <span v-if="item.payload?.seg" class="ht-ev-step">段 {{ item.payload.seg }}</span>
              <span class="ht-ev-title">{{ item.summary }}</span>
              <span v-if="store.isBookmarked(item.id)" class="ht-ev-bm" title="书签（右键切换）">◆</span>
              <span class="ht-ev-badge" :class="badgeOf(item)[0]">{{ badgeOf(item)[1] }}</span>
            </div>
            <div class="ht-ev-bd" v-html="descHtml(item)"></div>
            <div class="ht-ev-meta">
              {{ item.correlationId }}<template v-if="item.parentId"> · ← {{ item.parentId }}</template>
              <template v-if="item.sourceId"> · {{ item.sourceId }}</template>
              <template v-if="item.targetId"> → {{ item.targetId }}</template>
              · 时间={{ formatTime(item.timestamp) }}
            </div>
            <div v-if="segIndicators.length" class="ht-ev-multi">
              <i v-for="(m, j) in segIndicators" :key="j" :class="[m, curSeg === j + 1 ? 'cur' : '']"></i>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="ht-empty">选中时间线节点以查看事件卡片</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { DebugNode } from '@/domain/battle/replay/unified/unified-debug-tree'
import { buildSegResults } from '@/domain/battle/replay/unified/unified-debug-tree'
import type { UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { escapeHtml } from '@/shared/utils/log-segment-factory'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import { useHaotianStore } from '../stores/haotianStore'

const props = defineProps<{ active?: boolean }>()

const store = useHaotianStore()
const scrollRef = ref<HTMLElement | null>(null)

const meta = (ev: UnifiedEvent) => PHASE_META[ev.phase]

// ───────────── 虚拟列表（V4 VL 简化版）─────────────

const EST = 122
const GAP = 10
const PAD = 12
/** 测量高度非响应式缓存；布局节拍触发重排，避免渲染期改响应式 Map 导致重渲染循环 */
const heights = new Map<string, number>()
const layoutTick = ref(0)
const scrollTop = ref(0)
const viewH = ref(400)
let layoutRaf = 0

function updateView(): void {
  if (scrollRef.value) viewH.value = scrollRef.value.clientHeight || 400
}

function onScroll(): void {
  if (scrollRef.value) scrollTop.value = scrollRef.value.scrollTop
}

function measure(id: string, el: HTMLElement | null): void {
  if (!el) return
  const h = el.offsetHeight
  // NOTE: 容器 display:none（昊天镜 tab 未激活 / 未切到调试模式）时 offsetHeight 恒为 0，
  // 写入缓存会让虚拟列表按 0 高度布局 → 首次打开时所有卡片叠在一起。隐藏期测量直接忽略，
  // 待容器可见后由 remeasure() 显式重测（vitem 为绝对定位 + translateY，DOM 复用不触发 :ref 回调）。
  if (h <= 0) return
  if (heights.get(id) !== h) {
    heights.set(id, h)
    if (!layoutRaf) {
      layoutRaf = requestAnimationFrame(() => {
        layoutRaf = 0
        layoutTick.value++
      })
    }
  }
}

/** 容器变为可见后重测已渲染项，修正隐藏期缺失/错误的高度缓存 */
function remeasure(): void {
  nextTick(() => {
    const box = scrollRef.value
    if (!box || !box.offsetParent) return
    box.querySelectorAll<HTMLElement>('.ht-vitem').forEach((el) => {
      const id = el.getAttribute('data-id')
      if (id) measure(id, el)
    })
  })
}

function offsetOf(id: string): number {
  void layoutTick.value
  let y = PAD
  for (const it of items.value) {
    if (it.id === id) return y
    y += (heights.get(it.id) ?? EST) + GAP
  }
  return y
}

const totalHeight = computed(() => {
  void layoutTick.value
  let y = PAD
  for (const it of items.value) y += (heights.get(it.id) ?? EST) + GAP
  return y + PAD
})

const visible = computed(() => {
  void layoutTick.value
  const st = scrollTop.value
  const vh = viewH.value
  const out: UnifiedEvent[] = []
  let y = PAD
  for (const it of items.value) {
    const h = heights.get(it.id) ?? EST
    if (y + h >= st - 240 && y <= st + vh + 240) out.push(it)
    y += h + GAP
  }
  return out
})

// 切换节点时回到顶部并重测视口
watch(
  () => store.debugNodeId,
  () => {
    scrollTop.value = 0
    if (scrollRef.value) scrollRef.value.scrollTop = 0
    nextTick(updateView)
  },
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

const items = computed<UnifiedEvent[]>(() => currentNode.value?.events ?? [])

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

/** 摘要着色：先转义 HTML（v-html 渲染，防存档注入 XSS），再对数值/暴击着色 */
function descHtml(ev: UnifiedEvent): string {
  let s = escapeHtml(ev.summary)
  s = s.replace(/(\d+(?:\.\d+)?)/g, '<span class="hd">$1</span>')
  s = s.replace(/暴击/g, '<span class="hc">暴击</span>')
  return s
}
</script>
