<template>
  <div class="ht-root">
    <CommandBar />

    <div class="ht-modes">
      <!-- 回放系统 · 投影 1 -->
      <div class="ht-mode" :class="{ on: store.mode === 'replay' }" role="tabpanel">
        <ReplayStage />
        <div class="ht-grid">
          <ReplayStream :style="colStyle('replayA')" />
          <div class="ht-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整事件流宽度"
            @pointerdown="startResize('replayA', $event)"
            @keydown.left.prevent="nudge('replayA', -20)" @keydown.right.prevent="nudge('replayA', 20)"></div>
          <div class="ht-col-flex">
            <div class="ht-pane" style="--pc: var(--color-warning)">
              <div class="ht-pane-hd">
                <span class="t">事件检视</span>
                <span class="s">事件详情</span>
              </div>
              <div class="ht-pane-bd">
                <Inspector />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 调试系统 · 投影 2 -->
      <div class="ht-mode" :class="{ on: store.mode === 'debug' }" role="tabpanel">
        <div class="ht-grid">
          <DebugTimeline :style="colStyle('debugA')" />
          <div class="ht-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整时间线宽度"
            @pointerdown="startResize('debugA', $event)"
            @keydown.left.prevent="nudge('debugA', -20)" @keydown.right.prevent="nudge('debugA', 20)"></div>
          <DebugCards :active="props.active" :style="colStyle('debugB')" />
          <div class="ht-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整卡片流宽度"
            @pointerdown="startResize('debugB', $event)"
            @keydown.left.prevent="nudge('debugB', -20)" @keydown.right.prevent="nudge('debugB', 20)"></div>
          <div class="ht-col-flex">
            <div class="ht-pane" style="--pc: var(--color-success)">
              <div class="ht-pane-hd">
                <span class="t">深度检视</span>
                <span class="s">{{ store.selectedEvent ? '事件详情' : '—' }}</span>
              </div>
              <div class="ht-pane-bd">
                <Inspector />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <StatusBar />
    <DiagPanel />

    <BookmarkPanel v-model:open="store.bookmarkOpen" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import CommandBar from './views/CommandBar.vue'
import ReplayStage from './views/ReplayStage.vue'
import ReplayStream from './views/ReplayStream.vue'
import Inspector from './views/Inspector.vue'
import DebugTimeline from './views/DebugTimeline.vue'
import DebugCards from './views/DebugCards.vue'
import StatusBar from './views/StatusBar.vue'
import DiagPanel from './views/DiagPanel.vue'
import BookmarkPanel from './components/BookmarkPanel.vue'
import { useHaotianStore } from './stores/haotianStore'
import { useHaotianHotkeys } from './composables/useHaotianHotkeys'

const props = defineProps<{ active?: boolean }>()

const store = useHaotianStore()

// ── 面板宽度（可拖拽分隔条，persist 到 localStorage）──
const PANEL_W_KEY = 'haotian.panel-widths.v1'
const DEFAULT_WIDTHS = { replayA: 360, debugA: 320, debugB: 400 } as const

function loadWidths(): Record<keyof typeof DEFAULT_WIDTHS, number> {
  try {
    const raw = localStorage.getItem(PANEL_W_KEY)
    if (raw) return { ...DEFAULT_WIDTHS, ...(JSON.parse(raw) as Record<string, number>) }
  } catch {
    /* 读取失败静默 */
  }
  return { ...DEFAULT_WIDTHS }
}

const widths = reactive<Record<keyof typeof DEFAULT_WIDTHS, number>>(loadWidths())

function saveWidths(): void {
  try {
    localStorage.setItem(PANEL_W_KEY, JSON.stringify(widths))
  } catch {
    /* 写入失败静默 */
  }
}

/** 列 flex 绑定：固定基准宽，宽度由分隔条控制，拖拽范围 200–760px */
function colStyle(key: keyof typeof DEFAULT_WIDTHS): Record<string, string> {
  return { flex: `0 0 ${widths[key]}px` }
}

function startResize(key: keyof typeof DEFAULT_WIDTHS, e: PointerEvent): void {
  e.preventDefault()
  const startX = e.clientX
  const startW = widths[key]
  const onMove = (ev: PointerEvent): void => {
    const d = ev.clientX - startX
    widths[key] = Math.min(760, Math.max(200, startW + d))
  }
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    saveWidths()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function nudge(key: keyof typeof DEFAULT_WIDTHS, d: number): void {
  widths[key] = Math.min(760, Math.max(200, widths[key] + d))
  saveWidths()
}

const currentDebugNodeEvents = computed(() => {
  if (!store.debugNodeId) return []
  const node = store.debugNodes.find((n) => n.id === store.debugNodeId)
  return node?.events ?? []
})

useHaotianHotkeys({
  isActive: () => props.active,
  mode: () => store.mode,
  setMode: (m) => store.setMode(m),
  togglePlay: () => store.togglePlay(),
  stepEvent: (dir) => store.stepEvent(dir),
  toggleFollow: () => {
    store.playback.follow = !store.playback.follow
  },
  closeDiag: () => {
    store.diagOpen = false
  },
  navCards: (dir) => {
    const list = currentDebugNodeEvents.value
    if (!list.length) return null
    const i = list.findIndex((x) => x.id === store.selectedId)
    const next = dir === 1 ? Math.min(list.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)
    return list[next]?.id ?? null
  },
  stepInChain: (dir) => store.stepInChain(dir),
  selectEvent: (id, opts) => store.focusEvent(id, opts),
  openBreakpoint: () => {
    store.bpOpen = true
  },
  openSummary: () => {
    store.sumOpen = true
  },
  openDiff: () => {
    store.diffOpen = true
  },
  toggleBookmarkPanel: () => store.toggleBookmarkPanel(),
})

onMounted(async () => {
  // NOTE: 首载不自动灌演示存档——保持空态让用户主动选数据源（深链定位除外）。
  // applyDeepLink 负责：深链携带 s/b 时加载对应来源存档（demo/stress/live/recordings），
  // 随后按 e 定位事件；无来源段时若只有事件链接则载入演示存档后定位。
  const hasEventLink = /e=/.test(location.hash)
  if (hasEventLink && !/s=/.test(location.hash)) await store.loadDemo()
  await store.applyDeepLink()
})
</script>

<style lang="scss">
@use './styles/haotian.scss';
</style>
