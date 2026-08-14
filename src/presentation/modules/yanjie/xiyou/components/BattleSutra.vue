<template>
  <section class="xy-sutra" aria-label="战斗心经 · 战斗日志">
    <h3 class="xy-sutra-title">战斗心经</h3>
    <div class="xy-sutra-log" role="log" aria-live="polite">
      <EmptyState v-if="blocks.length === 0">暂无战斗日志</EmptyState>
      <NarrativeBlocks :blocks="blocks" @hover="onSegmentEnter" @leave="onSegmentLeave" />
    </div>
    <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="tooltipRect"
      @hide="tooltipVisible = false" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { BattleLogEntry, LogSegmentHover } from '@/shared/types/battle-log'
import { LogType } from '@/shared/types/battle-log'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { RoundNarrativeRenderer } from '@/domain/battle/logs/renderers/RoundNarrativeRenderer'
import NarrativeBlocks from '@/presentation/components/NarrativeBlocks.vue'
import EntityTooltip from '@/presentation/components/EntityTooltip.vue'
import EmptyState from '@/presentation/components/EmptyState.vue'
import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import { LogTooltipResolver } from '@/application/projection/LogTooltipResolver'
import { container } from '@/infrastructure/di/Container'
import type { SkillManager } from '@/domain/skill/SkillManager'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'

const renderer = new RoundNarrativeRenderer()

let tooltipResolver: LogTooltipResolver | null = null
try {
  const skillManager = container.resolve<SkillManager>('SkillManager')
  const buffRegistry = container.resolve<BuffScriptRegistry>('BuffScriptRegistry')
  tooltipResolver = new LogTooltipResolver(buffRegistry, skillManager)
} catch {
  // 容器未就绪时静默
}

/** 战斗日志条目（仅 BATTLE 类型，与唤灵台 BattleLog 同源同口径） */
const battleEntries = ref<BattleLogEntry[]>([])
const logUpdateListener = () => {
  battleEntries.value = battleLogManager
    .getFilteredLogs()
    .filter((l) => l.type === LogType.BATTLE) as BattleLogEntry[]
}

const blocks = computed(() => renderer.renderEntries(battleEntries.value))

// ───────────────────────── 悬浮信息卡片 ─────────────────────────
const tooltipVisible = ref(false)
const tooltipData = ref<TooltipData | null>(null)
const tooltipRect = ref<DOMRect | null>(null)

function onSegmentEnter(event: MouseEvent, hover: LogSegmentHover) {
  if (!tooltipResolver) return
  const data = tooltipResolver.resolve(hover)
  if (data) {
    tooltipData.value = data
    tooltipRect.value = (event.target as HTMLElement).getBoundingClientRect()
    tooltipVisible.value = true
  }
}

function onSegmentLeave() {
  tooltipVisible.value = false
  tooltipData.value = null
  tooltipRect.value = null
}

onMounted(() => {
  battleLogManager.addListener(logUpdateListener)
})

onUnmounted(() => {
  battleLogManager.removeListener(logUpdateListener)
})
</script>

<style scoped lang="scss">
.xy-sutra {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper-warm);
  border-radius: 3px;
}

.xy-sutra-title {
  flex-shrink: 0;
  margin: 0;
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-family: var(--xy-font-title);
  font-size: var(--font-size-md);
  letter-spacing: 3px;
  border-radius: 3px 3px 0 0;
}

.xy-sutra-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
}
</style>
