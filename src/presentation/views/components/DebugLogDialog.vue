<!--
 * 文件: DebugLogDialog.vue
 * 创建日期: 2026-03-07
 * 功能: 调试日志弹窗
 * 描述: 显示 BattleLogManager 的日志信息 + TraceEvent 结构化追踪（文档 调试日志改造.md §7 P2）
 *       - 树状：因果链视图（TraceLogTree，五维过滤）
 *       - 实时流：TraceEvent 扁平流，支持 level/phase/battleId/文本过滤
 *       - 日志：addDebugLog 错误通道（LogEntry 扁平列表）
 *       导出 JSON = TraceEvent[] 全量，天然可 diff（验收故事 D）
 * 版本: 2.1.0
 * 视觉: 参照 test1.html 控制台设计（深色面板 / 卡片行 / 徽章体系），
 *       所有文本字号不低于 --font-size-md（AGENTS.md 红线）
-->

<template>
  <Dialog :model-value="modelValue" @update:model-value="handleModelValueChange" title="调试日志" width="80vw">
    <template #header-actions>
      <button class="dialog-download" @click="exportTraceJson">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        导出 JSON
      </button>
      <button class="dialog-download" @click="downloadLogs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
        下载日志
      </button>
    </template>
    <div class="debug-log-container">
      <Tabs v-model="activeTab" :tabs="dialogTabs" size="sm" destroy-inactive>
        <template #tree>
          <div class="tree-container">
            <div class="log-toolbar">
              <button class="log-btn" @click="$emit('refreshTrace')">刷新</button>
            </div>
            <TraceLogTree :roots="traceRoots" :actor-names="actorNames" />
          </div>
        </template>
        <template #stream>
          <div class="log-toolbar stream-toolbar">
            <button class="log-btn" @click="$emit('refreshTrace')">刷新</button>
            <input v-model="streamText" placeholder="过滤关键词..." class="filter-input" aria-label="过滤关键词" />
            <select v-model="streamLevel" class="filter-select">
              <option value="">全部级别</option>
              <option v-for="l in streamLevels" :key="l" :value="l">{{ l }}</option>
            </select>
            <select v-model="streamPhase" class="filter-select">
              <option value="">全部阶段</option>
              <option v-for="p in streamPhases" :key="p" :value="p">{{ p }} · {{ phaseLabel(p) }}</option>
            </select>
            <select v-model="streamBattle" class="filter-select">
              <option value="">全部战斗</option>
              <option v-for="b in streamBattles" :key="b" :value="b">{{ b }}</option>
            </select>
            <span class="trace-count">{{ filteredStream.length }} 条</span>
          </div>
          <div class="log-list">
            <div v-for="evt in filteredStream" :key="evt.id" class="stream-item" role="button" tabindex="0"
              @click="toggleExpand(evt.id)" @keydown.enter.prevent="toggleExpand(evt.id)"
              @keydown.space.prevent="toggleExpand(evt.id)">
              <span class="stream-arrow">{{ isExpanded(evt.id) ? '▼' : '▶' }}</span>
              <span class="stream-level" :class="'stream-level-' + evt.level">{{ evt.level }}</span>
              <span class="stream-phase" :title="evt.phase">{{ evt.phase }} · {{ phaseLabel(evt.phase) }}</span>
              <span v-if="actorLabelOf(evt)" class="stream-actor" :title="actorTitleOf(evt)">{{ actorLabelOf(evt) }}</span>
              <span class="stream-summary">{{ evt.summary }}</span>
              <span class="stream-corr" :title="`correlationId: ${evt.correlationId}`">{{ shortCorr(evt.correlationId) }}</span>
              <div v-if="isExpanded(evt.id)" class="log-context">
                <TracePayloadViewer :payload="evt.payload" />
              </div>
            </div>
            <EmptyState v-if="filteredStream.length === 0">暂无追踪事件</EmptyState>
          </div>
        </template>
        <template #flat>
          <div class="log-toolbar">
            <button class="log-btn" @click="clearLogs">清空</button>
          </div>
          <div class="log-list" ref="logListRef">
            <div v-for="(log, index) in localLogs" :key="index" class="log-item" :class="'level-' + log.level">
              <span class="log-seq">#{{ log.index }}</span>
              <span class="log-level" :class="'level-' + log.level">{{ logLevelName(log.level) }}</span>
              <span class="log-source" v-if="log.source">[{{ log.source }}]</span>
              <span class="log-message">{{ log.segments?.map(s => s.text).join('') || log.message || '' }}</span>
              <div v-if="log.context" class="log-context">
                <pre>{{ JSON.stringify(log.context, null, 2) }}</pre>
              </div>
              <div v-if="log.error" class="log-error">
                {{ log.error.message }}
              </div>
            </div>
            <EmptyState v-if="localLogs.length === 0">暂无日志</EmptyState>
          </div>
        </template>
      </Tabs>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import Tabs from '@/presentation/components/Tabs.vue'
import type { TabItem } from '@/presentation/components/Tabs.vue'
import TraceLogTree from '@/presentation/views/components/TraceLogTree.vue'
import TracePayloadViewer from '@/presentation/views/components/TracePayloadViewer.vue'
import EmptyState from '@/presentation/components/EmptyState.vue'
import type { LogEntry } from '@/shared/types/battle-log'
import { TraceLevel, TracePhase, TracePhaseLabel, type TraceEvent, type TraceEventNode } from '@/shared/types/trace-event'
import { LogLevel } from '@/shared/types/battle-log'

interface Props {
  modelValue: boolean
  logs: LogEntry[]
  traceRoots?: TraceEventNode[]
  /** 实时流数据源 — TraceEvent[] 全量（BattleArena 从 traceCollector.getAll() 获取） */
  traceEvents?: TraceEvent[]
  /** 实体 ID → 角色名 映射（来自 battleStore 投影快照），未映射回退 ID */
  actorNames?: Record<string, string>
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'clear'): void
  (e: 'refreshTrace'): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  logs: () => [],
  traceRoots: () => [],
  traceEvents: () => [],
  actorNames: () => ({}),
})

const activeTab = ref('tree')

const dialogTabs = computed<TabItem[]>(() => [
  { id: 'tree', label: '树状' },
  { id: 'stream', label: '实时流', count: props.traceEvents.length },
  { id: 'flat', label: '日志', count: localLogs.value.length },
])

const emit = defineEmits<Emits>()

const logListRef = ref<HTMLElement | null>(null)
const localLogs = ref<LogEntry[]>([])

watch(() => props.logs, (newLogs) => {
  localLogs.value = [...newLogs]
}, { immediate: true, deep: true })

watch(() => props.modelValue, (val) => {
  if (val) {
    localLogs.value = [...props.logs]
  }
})

const handleModelValueChange = (value: boolean) => {
  emit('update:modelValue', value)
}

const clearLogs = () => {
  localLogs.value = []
  emit('clear')
}

const logLevelName = (level: LogLevel): string => {
  const names: Record<LogLevel, string> = {
    [LogLevel.TRACE]: 'TRACE',
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR'
  }
  return names[level] || 'UNKNOWN'
}

// ───────────── 实时流（TraceEvent）─────────────

const streamText = ref('')
const streamLevel = ref('')
const streamPhase = ref('')
const streamBattle = ref('')
const expandedIds = ref(new Set<string>())

const streamLevels = Object.values(TraceLevel)

/** phase 显示标签：英文值 + 中文名（未知 phase 回退英文原值） */
const phaseLabel = (p: string): string => TracePhaseLabel[p as TracePhase] ?? p

const streamPhases = computed(() =>
  [...new Set(props.traceEvents.map((e) => e.phase))].sort(),
)

const streamBattles = computed(() =>
  [...new Set(props.traceEvents.map((e) => e.battleId).filter(Boolean) as string[])].sort(),
)

const filteredStream = computed(() => {
  let list = props.traceEvents
  if (streamLevel.value) list = list.filter((e) => e.level === streamLevel.value)
  if (streamPhase.value) list = list.filter((e) => e.phase === streamPhase.value)
  if (streamBattle.value) list = list.filter((e) => e.battleId === streamBattle.value)
  if (streamText.value) {
    const kw = streamText.value.toLowerCase()
    list = list.filter((e) => `${e.summary} ${e.correlationId}`.toLowerCase().includes(kw))
  }
  return list
})

const isExpanded = (id: string): boolean => expandedIds.value.has(id)
const toggleExpand = (id: string): void => {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

const shortCorr = (correlationId: string): string =>
  correlationId.length > 16 ? `${correlationId.slice(0, 14)}…` : correlationId

/** 角色徽章文本（实时流行内）：source → target，未映射回退 ID */
const actorLabelOf = (e: TraceEvent): string => {
  const src = e.sourceId ? props.actorNames[e.sourceId] : undefined
  const tgt = e.targetId ? props.actorNames[e.targetId] : undefined
  if (!src && !tgt) return ''
  if (!tgt || tgt === src) return src || tgt
  return `${src || e.sourceId} → ${tgt}`
}

const actorTitleOf = (e: TraceEvent): string => {
  const parts = []
  if (e.sourceId) parts.push(`来源: ${props.actorNames[e.sourceId] ?? e.sourceId}`)
  if (e.targetId) parts.push(`目标: ${props.actorNames[e.targetId] ?? e.targetId}`)
  return parts.join(' · ')
}

// ───────────── 导出 ─────────────

/** 导出 TraceEvent[] 全量 JSON — 导出的 JSON 天然可 diff（验收故事 D） */
const exportTraceJson = () => {
  const text = JSON.stringify(props.traceEvents, null, 2)
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trace-events-${Date.now()}.json`
  a.click()
  // 延迟回收 URL，避免部分浏览器在下载启动前就中断
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 导出 addDebugLog（错误通道）文本日志 */
const downloadLogs = () => {
  const text = localLogs.value
    .map((log) => `[${logLevelName(log.level)}] ${log.segments?.map(s => s.text).join('') || log.message || ''}`)
    .join('\n')
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `debug-logs-${Date.now()}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<style scoped>
/* ═══ 面板：test1 .console 控制台窗口（深色渐变面板 + 细边框 + 圆角） ═══ */
.debug-log-container {
  display: flex;
  flex-direction: column;
  height: 80vh;
  background: linear-gradient(180deg, var(--color-bg-primary), var(--color-bg-secondary));
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* ═══ 工具栏：test1 .toolbar（深底 + 底边框） ═══ */
.log-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-default);
  background: rgba(255, 255, 255, 0.012);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.stream-toolbar {
  justify-content: flex-start;
}

/* ═══ 按钮：test1 .btn（胶囊按钮，hover 浮起青色描边） ═══ */
.log-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-family-sans);
  font-size: var(--font-size-md);
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  padding: 7px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  white-space: nowrap;
  transition: 0.18s ease;
}

.log-btn:hover {
  color: var(--color-energy);
  border-color: rgba(var(--rgb-energy), 0.4);
  background: var(--color-bg-tertiary);
}

/* ═══ 标题栏导出/下载按钮：test1 .btn（青色描边主按钮） ═══ */
.dialog-download {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  border: 1px solid rgba(var(--rgb-energy), 0.32);
  color: var(--color-energy);
  padding: 7px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-md);
  white-space: nowrap;
  transition: 0.18s ease;
}

.dialog-download svg {
  width: 14px;
  height: 14px;
}

.dialog-download:hover {
  background: rgba(var(--rgb-energy), 0.12);
  box-shadow: 0 0 0 3px rgba(var(--rgb-energy), 0.08);
}

/* ═══ 过滤条控件：test1 .input/.select ═══ */
.filter-input,
.filter-select {
  font-family: var(--font-family-sans);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  outline: none;
  transition: 0.18s;
}

.filter-input::placeholder {
  color: var(--color-text-disabled);
}

.filter-input:focus,
.filter-select:focus {
  border-color: rgba(var(--rgb-energy), 0.5);
  box-shadow: 0 0 0 3px rgba(var(--rgb-energy), 0.1);
  background: var(--color-bg-tertiary);
}

.filter-select option {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.trace-count {
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-md);
  white-space: nowrap;
  margin-left: auto;
}

/* ═══ 列表容器 + 自定义滚动条（test1） ═══ */
.log-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-secondary);
}

.log-list::-webkit-scrollbar {
  width: 11px;
  height: 11px;
}

.log-list::-webkit-scrollbar-track {
  background: transparent;
}

.log-list::-webkit-scrollbar-thumb {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  border: 3px solid transparent;
  background-clip: padding-box;
}

.log-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-bg-tertiary-hover);
  background-clip: padding-box;
}

/* ═══ 实时流行：test1 .row（紧凑网格行，hover 提亮） ═══ */
.stream-item {
  display: grid;
  grid-template-columns: 20px 64px auto 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border-left: 2px solid transparent;
  border-bottom: 1px solid var(--color-border-default);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-md);
  cursor: pointer;
  transition: background 0.15s;
}

.stream-item:hover {
  background: var(--color-bg-primary);
}

.stream-arrow {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
  text-align: center;
}

/* level 徽章：test1 .rl（暗底半透明胶囊） */
.stream-level {
  font-size: var(--font-size-md);
  font-weight: 600;
  letter-spacing: 0.6px;
  text-align: center;
  padding: 2px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.stream-level-trace { color: var(--color-text-tertiary); background: var(--color-bg-primary); }
.stream-level-debug { color: var(--color-text-tertiary); background: var(--color-bg-primary); }
.stream-level-info  { color: var(--color-energy); background: rgba(var(--rgb-energy), 0.12); }
.stream-level-warn  { color: var(--color-warning); background: rgba(var(--rgb-warning), 0.12); }
.stream-level-error { color: var(--color-danger); background: rgba(var(--rgb-danger), 0.14); }

.stream-phase {
  color: var(--color-debuff);
  font-size: var(--font-size-md);
  max-width: 22em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 实时流角色徽章（ID → 名字映射） */
.stream-actor {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  flex-shrink: 0;
  white-space: nowrap;
  max-width: 12em;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stream-summary {
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stream-corr {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
}

/* ═══ 日志行：test1 .logdump（mono 等宽流） ═══ */
.log-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-md);
  line-height: 1.6;
}

.log-item:hover {
  background: var(--color-bg-primary);
}

.log-seq {
  color: var(--color-text-tertiary);
  min-width: 3.5em;
}

.log-level {
  padding: 1px 8px;
  border-radius: 6px;
  font-weight: 600;
  letter-spacing: 0.4px;
  flex-shrink: 0;
}

.level-TRACE { color: var(--color-text-tertiary); opacity: 0.7; }
.level-TRACE .log-level { background: var(--color-bg-primary); opacity: 0.7; }
.level-DEBUG { color: var(--color-text-tertiary); }
.level-DEBUG .log-level { background: var(--color-bg-primary); }
.level-INFO { color: var(--color-energy); }
.level-INFO .log-level { background: rgba(var(--rgb-energy), 0.12); }
.level-WARN { color: var(--color-warning); }
.level-WARN .log-level { background: rgba(var(--rgb-warning), 0.12); }
.level-ERROR { color: var(--color-danger); }
.level-ERROR .log-level { background: rgba(var(--rgb-danger), 0.14); }

.log-source {
  color: var(--color-debuff);
  flex-shrink: 0;
}

.log-message {
  color: var(--color-text-secondary);
}

.log-error {
  margin-top: 4px;
  color: var(--color-danger);
  font-size: var(--font-size-md);
  flex-basis: 100%;
}

/* ═══ JSON 详情块 ═══ */
.log-context {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

.stream-item .log-context {
  grid-column: 1 / -1;
}

.log-context pre {
  margin: 0;
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-md);
  line-height: 1.6;
}

/* ═══ Tabs 徽章：覆盖共享组件默认小字号（--font-size-xxs ≈ 9px），
   面板内一律不低于 --font-size-md；日志页签沿用 test1 .badge.alert 红色 ═══ */
:deep(.tabs-badge) {
  min-width: 20px;
  height: 20px;
  padding: 0 7px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-secondary);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  font-family: var(--font-family-mono);
}

:deep(.tabs-tab.is-active .tabs-badge) {
  background: var(--color-energy);
  border-color: transparent;
  color: var(--color-bg-secondary);
  box-shadow: 0 0 8px rgba(var(--rgb-energy), 0.5);
}

:deep(.tabs-tab:nth-child(3) .tabs-badge) {
  background: rgba(var(--rgb-danger), 0.14);
  color: var(--color-danger);
  border-color: rgba(var(--rgb-danger), 0.3);
}

:deep(.tabs-tab:nth-child(3).is-active .tabs-badge) {
  background: var(--color-danger);
  border-color: transparent;
  color: var(--color-bg-secondary);
}
</style>
