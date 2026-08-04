<template>
  <div class="ht-pane" style="--pc: var(--color-warning)">
    <div class="ht-pane-hd">
      <span class="t">战斗时间线</span>
      <span style="display: flex; gap: 8px; align-items: center">
        <Button size="tiny" :active="store.focusMode" title="聚焦选中事件的因果链，淡化无关分支"
          @click="store.toggleFocus()">聚焦</Button>
        <span class="s">{{ roundCount }} 个回合</span>
      </span>
    </div>
    <div class="ht-pane-bd">
      <div v-if="store.archive" class="ht-tree">
        <template v-for="entry in store.debugEntries" :key="entry.id">
          <div v-if="entry.kind === 'round'" class="ht-t-round">
            <div class="ht-t-row" role="button" tabindex="0" :aria-label="`${entry.name}，${expanded.has(entry.id) ? '已展开' : '已折叠'}，${entry.nodes.length} 个节点`"
              title="点击折叠/展开本回合" @click="toggleRound(entry.id)"
              @keydown.enter.prevent="toggleRound(entry.id)" @keydown.space.prevent="toggleRound(entry.id)">
              <span class="ht-t-tgl" :class="{ open: expanded.has(entry.id) }">▸</span>
              <span class="ht-t-ico">◈</span>
              <span class="ht-t-lab">{{ entry.name }}</span>
              <span class="ht-t-meta">{{ entry.nodes.length }} 节点</span>
            </div>
            <div v-if="expanded.has(entry.id)" class="ht-t-kids open">
              <div v-for="n in entry.nodes" :key="n.id" class="ht-t-row" role="button" tabindex="0"
                :aria-label="`${n.name}${dotLabelOf(n) ? '，' + dotLabelOf(n) : ''}`"
                title="点击检视该节点的事件卡片"
                :class="[{ on: store.debugNodeId === n.id }, dimClass(n)]" :data-nid="n.id"
                @click="store.selectDebugNode(n.id)"
                @keydown.enter.prevent="store.selectDebugNode(n.id)" @keydown.space.prevent="store.selectDebugNode(n.id)">
                <span class="ht-t-ico">{{ n.icon }}</span>
                <span class="ht-t-lab">{{ n.name }}</span>
                <span v-if="n.meta" class="ht-t-meta">{{ n.meta }}</span>
                <span v-if="dotOf(n)" class="ht-t-dot" :title="dotLabelOf(n) ?? undefined"
                  :style="{ background: dotOf(n)!, boxShadow: `0 0 6px ${dotOf(n)}` }"></span>
              </div>
            </div>
          </div>
          <div v-else class="ht-t-row" role="button" tabindex="0"
            :aria-label="`${entry.name}${dotLabelOf(entry) ? '，' + dotLabelOf(entry) : ''}`"
            title="点击检视该节点的事件卡片" :class="[{ on: store.debugNodeId === entry.id }, dimClass(entry)]" :data-nid="entry.id"
            @click="store.selectDebugNode(entry.id)"
            @keydown.enter.prevent="store.selectDebugNode(entry.id)" @keydown.space.prevent="store.selectDebugNode(entry.id)">
            <span class="ht-t-ico">{{ entry.icon }}</span>
            <span class="ht-t-lab">{{ entry.name }}</span>
            <span v-if="entry.meta" class="ht-t-meta">{{ entry.meta }}</span>
            <span v-if="dotOf(entry)" class="ht-t-dot" :title="dotLabelOf(entry) ?? undefined"
              :style="{ background: dotOf(entry)!, boxShadow: `0 0 6px ${dotOf(entry)}` }"></span>
          </div>
        </template>
      </div>
      <div v-else class="ht-empty">存档未加载</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { DebugNode } from '@/domain/battle/replay/unified/unified-debug-tree'
import { useHaotianStore } from '../stores/haotianStore'
import Button from '@/presentation/components/Button.vue'

const store = useHaotianStore()

const expanded = reactive(new Set<string>())

// 存档为异步装配（onMounted），watch 补初始化回合展开态
watch(
  () => store.debugEntries,
  (entries) => {
    for (const e of entries) {
      if (e.kind === 'round') expanded.add(e.id)
    }
  },
  { immediate: true },
)

const roundCount = computed(() => store.debugEntries.filter((e) => e.kind === 'round').length)

function toggleRound(id: string): void {
  if (expanded.has(id)) expanded.delete(id)
  else expanded.add(id)
}

/** 节点标记文本（阵亡 > 暴击 > 闪避），供无障碍与悬浮说明 */
function dotLabelOf(n: DebugNode): string | null {
  const hasDeath = n.events.some(
    (e) =>
      (e.payload as Record<string, unknown>)?.death ||
      (e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end'),
  )
  if (hasDeath) return '包含阵亡'
  if (n.events.some((e) => (e.payload as Record<string, unknown>)?.crit)) return '包含暴击'
  if (n.events.some((e) => (e.payload as Record<string, unknown>)?.dodge)) return '包含闪避'
  return null
}

/** 节点标记：阵亡 > 暴击 > 闪避 */
function dotOf(n: DebugNode): string | null {
  const hasDeath = n.events.some(
    (e) =>
      (e.payload as Record<string, unknown>)?.death ||
      (e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end'),
  )
  if (hasDeath) return 'var(--color-danger)'
  if (n.events.some((e) => (e.payload as Record<string, unknown>)?.crit)) return 'var(--color-warning)'
  if (n.events.some((e) => (e.payload as Record<string, unknown>)?.dodge)) return 'var(--color-energy)'
  return null
}

/** 聚焦模式下淡化与选中事件因果链无关的节点 */
function dimClass(n: DebugNode): Record<string, boolean> {
  if (!store.focusMode || !store.selectedEvent) return {}
  const related = n.events.some((e) => store.isRelated(e.id))
  return { dim: !related }
}
</script>
