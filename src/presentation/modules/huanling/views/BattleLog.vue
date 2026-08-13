<template>
  <div class="battle-log-section bg-dual-dots">
    <!-- ═══ 头部：标题 + 搜索 + 导出（页签由下方 Tabs 组件接管） ═══ -->
    <div class="log-header bg-hatch">
      <span class="log-title">日志</span>

      <div class="log-tools">
        <ToggleSwitch v-model="showStatus" label="状态明细" />

        <TacticalInput size="md" :model-value="keyword" placeholder="搜索…" aria-label="搜索日志"
          @update:model-value="keyword = String($event ?? '')" />
        <div class="export-wrapper" ref="exportWrapperRef">
          <Button @click="showExportMenu = !showExportMenu" title="导出当前页签日志">
            导出 ▾
          </Button>
          <div v-if="showExportMenu" class="export-menu">
            <button @click="exportLogs('txt')">导出为 TXT</button>
            <!-- 修复⑤：HTML 仅对战斗页签提供 -->
            <button v-if="activeTab === 'battle'" @click="exportLogs('html')">导出为 HTML</button>
          </div>
        </div>
      </div>
    </div>

    <Tabs v-model="activeTab" :tabs="tabsWithCount" class="log-tabs-host">
      <!-- ═══ 容器 A：战斗页签 ═══ -->
      <template #battle>
        <div class="log-content" :class="{ 'is-active': activeTab === 'battle' }"
          ref="battleContainer" @scroll="onScroll" aria-live="polite">
          <EmptyState v-if="blocks.length === 0">暂无战斗日志</EmptyState>
          <NarrativeBlocks :blocks="blocks" @hover="onSegmentEnter" @leave="onSegmentLeave" />
        </div> <!-- /battle-content -->
      </template>

      <!-- ═══ 容器 B-1：系统页签 ═══ -->
      <template #system>
        <div class="log-content log-content--flat" :class="{ 'is-active': activeTab === 'system' }"
          ref="systemContainer" @scroll="onScroll">
          <EmptyState v-if="systemLogs.length === 0">暂无系统日志</EmptyState>

          <div v-for="entry in systemLogs" :key="entry.index" class="flat-item" :class="flatItemClass(entry)">
            <!-- 系统/动作/物品条目：优先 segments -->
            <template v-if="entry.segments && entry.segments.length">
              <LogSeg v-for="(s, j) in entry.segments" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave" />
            </template>
            <template v-else>
              <span class="flat-msg">{{ entry.message }}</span>
            </template>
          </div>
        </div>
      </template>

      <!-- ═══ 容器 B-2：调试页签 ═══ -->
      <template #debug>
        <div class="log-content log-content--flat" :class="{ 'is-active': activeTab === 'debug' }"
          ref="debugContainer" @scroll="onScroll">
          <div v-if="debugTotal > DEBUG_DISPLAY_LIMIT" class="flat-note">
            仅显示最近 {{ DEBUG_DISPLAY_LIMIT }} 条（共 {{ debugTotal }} 条）
          </div>
          <EmptyState v-if="debugLogs.length === 0">暂无调试日志</EmptyState>

          <div v-for="(entry, idx) in debugLogs" :key="entry.index" class="flat-item" :class="flatItemClass(entry)">
            <!-- NOTE: 显示本地序号而非全局 index——全局计数器被 debug 等占用会产生空洞（跳号） -->
            <span class="flat-seq">#{{ idx + 1 }}</span>
            <span class="flat-level">{{ levelName(entry.level) }}</span>
            <span class="flat-msg">{{ entry.message }}</span>
            <pre v-if="entry.context" class="flat-ctx">{{ JSON.stringify(entry.context, null, 2) }}</pre>
            <div v-if="entry.error" class="flat-err">{{ entry.error.message }}</div>
          </div>
        </div>
      </template>
    </Tabs>

    <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="tooltipRect"
      @hide="tooltipVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type {
  LogSegmentHover,
  BattleLogEntry,
  LogEntry,
} from '@/shared/types/battle-log'
import { LogType, LogLevel } from '@/shared/types/battle-log'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { RoundNarrativeRenderer } from '@/domain/battle/logs/renderers/RoundNarrativeRenderer'
import NarrativeBlocks from '@/presentation/components/NarrativeBlocks.vue'
import LogSeg from '@/presentation/components/LogSeg.vue'
import Button from '@/presentation/components/Button.vue'
import Tabs from '@/presentation/components/Tabs.vue'
import ToggleSwitch from '@/presentation/components/ToggleSwitch.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'
import EmptyState from '@/presentation/components/EmptyState.vue'
import type { TabItem } from '@/presentation/components/Tabs.vue'
import EntityTooltip from '@/presentation/components/EntityTooltip.vue'
import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import { LogTooltipResolver } from '@/application/projection/LogTooltipResolver'
import { container } from '@/infrastructure/di/Container'
import type { SkillManager } from '@/domain/skill/SkillManager'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { blocksToText, blocksToHtml, segsText } from '@/shared/utils/log-segment-factory'
import { entityDisplayText } from '@/shared/types/battle-log'

// ───────────────────────── 渲染器 & 悬浮解析器 ─────────────────────────
const renderer = new RoundNarrativeRenderer()
let tooltipResolver: LogTooltipResolver | null = null
try {
  const skillManager = container.resolve<SkillManager>('SkillManager')
  const buffRegistry = container.resolve<BuffScriptRegistry>('BuffScriptRegistry')
  tooltipResolver = new LogTooltipResolver(buffRegistry, skillManager)
} catch {
  // 容器未就绪时静默
}

// ───────────────────────── 页签状态 ─────────────────────────
const TAB_DEFS = [
  { id: 'battle', label: '战斗' },
  { id: 'system', label: '系统' },
  { id: 'debug', label: '调试' },
] as const
type TabId = (typeof TAB_DEFS)[number]['id']

const activeTab = ref<TabId>('battle')

/** 为 Tabs 组件构建带计数徽章的页签列表 */
const tabsWithCount = computed<TabItem[]>(() =>
  TAB_DEFS.map((t) => ({ id: t.id, label: t.label, count: tabCount(t.id) })),
)

const keyword = ref('')
/** 战斗页签内的状态明细开关（原 showStatus，降噪用） */
const showStatus = ref(true)

const SYSTEM_TYPES = [LogType.SYSTEM, LogType.ACTION, LogType.ITEM]
const DEBUG_DISPLAY_LIMIT = 200

// ───────────────────────── 数据源：全量拉取，本地过滤 ─────────────────────────
const allLogs = ref<LogEntry[]>([])
const logUpdateListener = () => {
  allLogs.value = battleLogManager.getFilteredLogs()
}

// ───────────────────────── 派生数据 ─────────────────────────
function applyKeyword(list: LogEntry[], kw: string): LogEntry[] {
  const k = kw.toLowerCase()
  return list.filter((e) => {
    if (e.message?.toLowerCase().includes(k)) return true
    // NOTE: 按显示文本匹配（entity 段缺前缀时也补全），与导出/面板渲染同口径
    if (e.segments?.some((s) => entityDisplayText(s).toLowerCase().includes(k))) return true
    return false
  })
}

/** 战斗页签数据（叙事渲染输入） */
const battleLogs = computed(() => {
  let r = allLogs.value.filter((l) => l.type === LogType.BATTLE)
  if (!showStatus.value) {
    r = r.filter((l) => (l as BattleLogEntry).category !== 'status')
  }
  if (keyword.value) r = applyKeyword(r, keyword.value)
  return r as BattleLogEntry[]
})

/** 系统页签数据（SYSTEM + ACTION + ITEM） */
const systemLogs = computed(() => {
  let r = allLogs.value.filter((l) => SYSTEM_TYPES.includes(l.type))
  if (keyword.value) r = applyKeyword(r, keyword.value)
  return r
})

/** 调试页签数据（限量显示最新 N 条） */
const debugAll = computed(() => {
  let r = allLogs.value.filter((l) => l.type === LogType.DEBUG)
  if (keyword.value) r = applyKeyword(r, keyword.value)
  return r
})
const debugTotal = computed(() => debugAll.value.length)
const debugLogs = computed(() => debugAll.value.slice(-DEBUG_DISPLAY_LIMIT))

/** 叙事块 */
const blocks = computed(() => renderer.renderEntries(battleLogs.value))

// ───────────────────────── 页签计数 ═══ Tabs 组件接管指示条 ──────────────────
function tabCount(id: TabId): number {
  if (id === 'battle') return allLogs.value.filter((l) => l.type === LogType.BATTLE).length
  if (id === 'system') return allLogs.value.filter((l) => SYSTEM_TYPES.includes(l.type)).length
  return debugTotal.value
}

// ───────────────────────── 扁平条目辅助 ─────────────────────────
const LEVEL_NAMES: Record<number, string> = {
  [LogLevel.ERROR]: 'ERR',
  [LogLevel.WARN]: 'WRN',
  [LogLevel.INFO]: 'INF',
  [LogLevel.DEBUG]: 'DBG',
  [LogLevel.TRACE]: 'TRC',
}
function levelName(lv?: LogLevel): string {
  return LEVEL_NAMES[lv ?? LogLevel.INFO] ?? 'INF'
}

function flatItemClass(e: LogEntry): string {
  if (e.type === LogType.DEBUG) return 'flat-item--debug lv-' + (e.level ?? LogLevel.INFO)
  if (e.type === LogType.ACTION) return 'flat-item--action'
  if (e.type === LogType.ITEM) return 'flat-item--item'
  return 'flat-item--system'
}

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

// ───────────────────────── 自动滚动（三容器） ─────────────────────────
const battleContainer = ref<HTMLElement | null>(null)
const systemContainer = ref<HTMLElement | null>(null)
const debugContainer = ref<HTMLElement | null>(null)
const autoScrollEnabled = ref(true)
let autoScrollTimer: ReturnType<typeof setTimeout> | null = null
let scrollThrottled = false

function activeContainer(): HTMLElement | null {
  if (activeTab.value === 'battle') return battleContainer.value
  if (activeTab.value === 'system') return systemContainer.value
  return debugContainer.value
}

const onScroll = (ev: Event) => {
  const el = ev.target as HTMLElement
  if (!el || scrollThrottled) return
  scrollThrottled = true
  requestAnimationFrame(() => {
    scrollThrottled = false
  })
  const { scrollTop, scrollHeight, clientHeight } = el
  if (scrollTop < scrollHeight - clientHeight - 5) {
    autoScrollEnabled.value = false
    if (autoScrollTimer) clearTimeout(autoScrollTimer)
    autoScrollTimer = setTimeout(() => {
      autoScrollEnabled.value = true
      autoScrollTimer = null
    }, 3000)
  } else {
    autoScrollEnabled.value = true
    if (autoScrollTimer) {
      clearTimeout(autoScrollTimer)
      autoScrollTimer = null
    }
  }
}

function scrollActiveToBottom() {
  const el = activeContainer()
  if (el) el.scrollTop = el.scrollHeight
}

watch([battleLogs, systemLogs, debugLogs, activeTab], () => {
  nextTick(() => {
    if (autoScrollEnabled.value) scrollActiveToBottom()
  })
})

// ───────────────────────── 导出（当前页签） ─────────────────────────

const showExportMenu = ref(false)
const exportWrapperRef = ref<HTMLElement | null>(null)

function handleExportClickOutside(e: MouseEvent) {
  if (exportWrapperRef.value && !exportWrapperRef.value.contains(e.target as Node)) {
    showExportMenu.value = false
  }
}

function flatToText(e: LogEntry): string {
  if (e.segments?.length) return segsText(e.segments)
  return e.message ?? ''
}

function exportLogs(format: 'txt' | 'html' = 'txt'): void {
  showExportMenu.value = false
  let content: string
  let mime: string
  let ext: string

  if (activeTab.value === 'battle') {
    if (format === 'html') {
      content = blocksToHtml(blocks.value, {
        title: '战斗日志',
        generatedAt: new Date().toLocaleString(),
      })
      mime = 'text/html;charset=utf-8'
      ext = 'html'
    } else {
      content = blocksToText(blocks.value)
      mime = 'text/plain;charset=utf-8'
      ext = 'txt'
    }
  } else {
    // 系统/调试页签：扁平日志，仅 TXT
    const logs = activeTab.value === 'debug' ? debugLogs.value : systemLogs.value
    content = logs.map(flatToText).join('\n')
    mime = 'text/plain;charset=utf-8'
    ext = 'txt'
  }

  if (!content.trim()) return
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `battle-log-${activeTab.value}-${timestamp}.${ext}`
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ───────────────────────── 生命周期 ─────────────────────────
onMounted(() => {
  // 打开全部过滤器，确保 listener 收到全量日志（页签过滤在本地完成）
  battleLogManager.updateFilters({
    battle: true,
    system: true,
    item: true,
    action: true,
    debug: true,
  })
  battleLogManager.addListener(logUpdateListener)

  document.addEventListener('click', handleExportClickOutside)
})

onUnmounted(() => {
  battleLogManager.removeListener(logUpdateListener)
  document.removeEventListener('click', handleExportClickOutside)
  if (autoScrollTimer) clearTimeout(autoScrollTimer)
})
</script>

<style scoped>
/** 激活色覆盖：BattleLog 页签激活态使用 success 绿 + 辉光 */
.log-tabs-host.tabs-root {
  --tabs-accent: var(--color-success);
  --tabs-accent-glow: rgba(var(--rgb-success), var(--alpha-glow));
}

/* ─────────── 头部 ─────────── */


.log-title {
  color: var(--color-info);
  font-weight: var(--font-weight-bold);
  letter-spacing: 1px;
}

/* ─────────── 搜索 & 导出 ─────────── */
.log-tools {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
}

/* TacticalInput 根默认 width:100%，工具条内给弹性宽度避免占满整行 */
.log-tools .t-input {
  flex: 0 1 120px;
  min-width: 0;
}

.export-wrapper {
  position: relative;
  display: inline-flex;
}

.export-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--space-1);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: var(--z-dropdown);
  box-shadow: var(--shadow-md);
  min-width: 120px;
}

.export-menu button {
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  white-space: nowrap;
  text-align: left;
}

.export-menu button:hover {
  background: var(--color-bg-hover);
  color: var(--color-info);
}

/* ─────────── 内容容器（双容器，v-show 保留滚动位置） ─────────── */
/* 页签切入时的淡入上浮 */
.log-content.is-active {
  animation: content-in 0.18s ease-out;
}



/* ─────────── 扁平容器（系统/调试共用） ─────────── */
.log-content--flat {
  font-family: var(--font-family-mono);
}

.flat-note {
  color: var(--color-text-tertiary);
  padding: var(--space-1) var(--space-2);
  margin-bottom: var(--space-1);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  border-left: 2px solid var(--color-warning);
}

.flat-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  margin-bottom: 2px;
  border-radius: var(--radius-sm);
  border-left: 2px solid transparent;
  transition: background var(--transition-fast);
}

.flat-item:hover {
  background: var(--color-bg-hover);
}

.flat-item--system {
  border-left-color: var(--color-info);
}

.flat-item--action {
  border-left-color: var(--color-debuff);
}

.flat-item--item {
  border-left-color: var(--color-heal);
}

.flat-item--debug {
  border-left-color: var(--color-text-disabled);
}

.flat-seq {
  color: var(--color-text-disabled);
  min-width: 3.5em;
}

.flat-level {
  padding: 0 5px;
  border-radius: var(--radius-sm);
  font-weight: var(--font-weight-bold);
  background: var(--color-border-default);
  color: var(--color-text-secondary);
}

.flat-item.lv-0 .flat-level {
  background: var(--color-danger);
  color: var(--color-text-primary);
}

.flat-item.lv-1 .flat-level {
  background: var(--color-warning);
  color: var(--color-bg-secondary);
}

.flat-item.lv-2 .flat-level {
  background: var(--color-info);
  color: var(--color-bg-secondary);
}

.flat-item.lv-0 {
  color: var(--color-danger);
}

.flat-item.lv-1 {
  color: var(--color-warning);
}

.flat-msg {
  color: var(--color-text-secondary);
  flex: 1;
  min-width: 0;
  word-break: break-all;
}

.flat-item.lv-0 .flat-msg,
.flat-item.lv-1 .flat-msg {
  color: inherit;
}

.flat-ctx {
  flex-basis: 100%;
  margin: var(--space-1) 0 0 0;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-primary);
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  overflow-x: auto;
  white-space: pre-wrap;
}

.flat-err {
  flex-basis: 100%;
  color: var(--color-danger);
}
</style>
