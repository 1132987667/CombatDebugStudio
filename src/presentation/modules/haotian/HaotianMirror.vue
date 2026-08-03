<template>
  <div class="ht-root">
    <CommandBar />

    <div class="ht-modes">
      <!-- 回放系统 · 投影 1 -->
      <div class="ht-mode" :class="{ on: store.mode === 'replay' }" role="tabpanel">
        <ReplayStage />
        <div class="ht-grid">
          <ReplayStream style="flex: 1; min-width: 0" />
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0">
            <div class="ht-pane" style="--pc: var(--color-warning)">
              <div class="ht-pane-hd">
                <span class="t">检视器 · 共用渲染器</span>
                <span class="s">载荷 + 结算</span>
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
          <DebugTimeline style="flex: 1.1; min-width: 0" />
          <DebugCards style="flex: 1.6; min-width: 0" />
          <div style="flex: 1.3; min-width: 0; display: flex; flex-direction: column; min-height: 0">
            <div class="ht-pane" style="--pc: var(--color-success)">
              <div class="ht-pane-hd">
                <span class="t">深度检视 · 共用渲染器</span>
                <span class="s">{{ store.selectedEvent ? '载荷 + 结算' : '—' }}</span>
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

    <div class="ht-toast">
      <div v-for="t in store.toasts" :key="t.id" class="ht-toast-item">{{ t.msg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import CommandBar from './views/CommandBar.vue'
import ReplayStage from './views/ReplayStage.vue'
import ReplayStream from './views/ReplayStream.vue'
import Inspector from './views/Inspector.vue'
import DebugTimeline from './views/DebugTimeline.vue'
import DebugCards from './views/DebugCards.vue'
import StatusBar from './views/StatusBar.vue'
import DiagPanel from './views/DiagPanel.vue'
import { useHaotianStore } from './stores/haotianStore'
import { useHaotianHotkeys } from './composables/useHaotianHotkeys'

const props = defineProps<{ active?: boolean }>()

const store = useHaotianStore()

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
  selectEvent: (id, opts) => store.focusEvent(id, opts),
})

onMounted(async () => {
  await store.loadDemo()
  store.applyDeepLink()
})
</script>

<style lang="scss">
@import './styles/haotian.scss';
</style>
