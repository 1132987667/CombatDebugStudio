<template>
  <div class="battle-log-section bg-dual-dots">
    <!-- ═══ 头部：标题 + 搜索 + 导出（页签由下方 Tabs 组件接管） ═══ -->
    <div class="log-header bg-hatch">
      <span class="log-title">日志</span>

      <div class="log-tools">
        <ToggleSwitch v-model="showStatus" label="状态明细" />

        <TacticalInput size="md" :model-value="keyword" placeholder="搜索…" aria-label="搜索日志"
          @update:model-value="keyword = String($event ?? '')" />
        <div class="dropdown-wrapper" ref="exportWrapperRef">
          <Button @click="toggleMenu('export')" :aria-expanded="openMenu === 'export'"
            aria-haspopup="menu" title="导出当前页签日志">
            导出 ▾
          </Button>
          <div v-if="openMenu === 'export'" class="dropdown-menu">
            <button @click="exportLogs('txt')">导出为 TXT</button>
            <!-- 修复⑤：HTML 仅对战斗页签提供 -->
            <button v-if="activeTab === 'battle'" @click="exportLogs('html')">导出为 HTML</button>
          </div>
        </div>
        <div class="dropdown-wrapper" ref="clearWrapperRef">
          <Button @click="toggleMenu('clear')" :aria-expanded="openMenu === 'clear'"
            aria-haspopup="menu" title="清除日志">
            清除 ▾
          </Button>
          <div v-if="openMenu === 'clear'" class="dropdown-menu">
            <button @click="clearCurrentTab()">清除当前页签</button>
            <button @click="clearAllLogs()">清除全部</button>
          </div>
        </div>
      </div>
    </div>

    <Tabs v-model="activeTab" :tabs="tabsWithCount" class="log-tabs-host">
      <!-- ═══ 容器 A：战斗页签 ═══ -->
      <template #battle>
        <div class="log-content" :class="{ 'is-active': activeTab === 'battle' }"
          ref="battleContainer" @scroll="onScroll" aria-live="polite">
          <EmptyState v-if="blocks.length === 0">
            <template v-if="keyword && battleTotal > 0">无匹配结果<button type="button" class="empty-clear" @click="keyword = ''">清除搜索</button></template>
            <template v-else>暂无战斗日志</template>
          </EmptyState>
          <NarrativeBlocks :blocks="blocks" @hover="onSegmentEnter" @leave="onSegmentLeave" />
        </div> <!-- /battle-content -->
      </template>

      <!-- ═══ 容器 B-1：系统页签 ═══ -->
      <template #system>
        <div class="log-content log-content--flat" :class="{ 'is-active': activeTab === 'system' }"
          ref="systemContainer" @scroll="onScroll" aria-live="polite">
          <EmptyState v-if="systemLogs.length === 0">
            <template v-if="keyword && systemTotal > 0">无匹配结果<button type="button" class="empty-clear" @click="keyword = ''">清除搜索</button></template>
            <template v-else>暂无系统日志</template>
          </EmptyState>

          <div v-for="entry in systemLogs" :key="entry.index" class="flat-item" :class="flatItemClass(entry)">
            <!-- 系统/动作/物品条目：优先 segments -->
            <template v-if="entry.segments && entry.segments.length">
              <LogSeg v-for="(s, j) in entry.segments" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave" />
            </template>
            <template v-else>
              <span class="flat-msg">{{ entry.message }}</span>
            </template>
            <button type="button" class="copy-btn" title="复制此条" @click="copyEntry(entry)">复制</button>
          </div>
        </div>
      </template>

      <!-- ═══ 容器 B-2：调试页签 ═══ -->
      <template #debug>
        <div class="log-content log-content--flat" :class="{ 'is-active': activeTab === 'debug' }"
          ref="debugContainer" @scroll="onScroll" aria-live="polite">
          <!-- 级别过滤：选中若干级别只看所选，全不选 = 显示全部 -->
          <div class="level-filter" role="group" aria-label="按级别过滤">
            <span class="level-filter-label">级别</span>
            <button v-for="lv in FILTERABLE_LEVELS" :key="lv" type="button" class="level-chip"
              :class="[`chip-lv-${lv}`, { 'is-on': levelFilter.has(lv) }]"
              :aria-pressed="levelFilter.has(lv)" @click="toggleLevelFilter(lv)">
              {{ levelName(lv) }}
            </button>
            <button v-if="levelFilter.size > 0" type="button" class="level-chip chip-reset"
              title="重置为显示全部" @click="levelFilter.clear()">全部</button>
          </div>
          <div v-if="debugTotal > DEBUG_DISPLAY_LIMIT" class="flat-note">
            仅显示最近 {{ DEBUG_DISPLAY_LIMIT }} 条（共 {{ debugTotal }} 条）
          </div>
          <EmptyState v-if="debugLogs.length === 0">
            <template v-if="keyword && debugTotal > 0">无匹配结果<button type="button" class="empty-clear" @click="keyword = ''">清除搜索</button></template>
            <template v-else-if="levelFilter.size > 0">所选级别暂无日志</template>
            <template v-else>暂无调试日志</template>
          </EmptyState>

          <div v-for="(entry, idx) in debugLogs" :key="entry.index" class="flat-item" :class="flatItemClass(entry)">
            <!-- NOTE: 显示本地序号而非全局 index——全局计数器被 debug 等占用会产生空洞（跳号） -->
            <span class="flat-seq">#{{ idx + 1 }}</span>
            <span class="flat-level">{{ levelName(entry.level) }}</span>
            <span class="flat-msg">{{ entry.message }}</span>
            <pre v-if="entry.context" class="flat-ctx">{{ JSON.stringify(entry.context, null, 2) }}</pre>
            <div v-if="entry.error" class="flat-err">{{ entry.error.message }}</div>
            <button type="button" class="copy-btn" title="复制此条" @click="copyEntry(entry)">复制</button>
          </div>
        </div>
      </template>

      <!-- ═══ 容器 C：战斗战报页签（战斗结束后自动记录，保留最近 3 场，不弹窗） ═══ -->
      <template #report>
        <div class="log-content" :class="{ 'is-active': activeTab === 'report' }">
          <EmptyState v-if="recentSummaries.length === 0">暂无战斗战报（战斗结束后自动记录，保留最近 3 场）</EmptyState>
          <div v-for="(s, i) in recentSummaries" :key="s.battleId" class="report-item">
            <div class="report-tag">{{ REPORT_TAGS[i] ?? `更早一场` }}</div>
            <BattleSummaryCard :summary="s" />
          </div>
        </div>
      </template>
    </Tabs>

    <!-- 回到底部：用户上滚后出现，显式恢复跟随（替代原 3 秒自动回底） -->
    <button v-if="!autoScrollEnabled && activeTab !== 'report'" type="button" class="scroll-bottom-btn"
      title="回到底部并恢复自动滚动" @click="resumeFollow">
      回到底部 ▼
    </button>

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
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { TabItem } from '@/presentation/components'

import LogSeg from '@/presentation/components/LogSeg.vue'
import NarrativeBlocks from '@/presentation/components/NarrativeBlocks.vue'
import BattleSummaryCard from '@/presentation/components/BattleSummaryCard.vue'
import { summaryToText } from '@/shared/utils/battle-summary-text'
import { useBattleStore } from '@/presentation/stores/battleStore'
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
  { id: 'report', label: '战斗战报' },
  { id: 'system', label: '系统' },
  { id: 'debug', label: '调试' },
] as const
type TabId = (typeof TAB_DEFS)[number]['id']

const activeTab = ref<TabId>('battle')

/** 战报场次标签（recentSummaries 按最新在前排列，下标 0 = 最新一场） */
const REPORT_TAGS = ['最新一场', '上一场', '再上一场'] as const

/** 为 Tabs 组件构建带计数徽章的页签列表 */
const tabsWithCount = computed<TabItem[]>(() =>
  TAB_DEFS.map((t) => ({
    id: t.id,
    label: t.label,
    count: tabCount(t.id),
    // 调试页签存在 ERROR 时徽章标红，一眼发现运行异常
    danger: t.id === 'debug' && hasDebugError.value,
  })),
)

const keyword = ref('')
/** 战斗页签内的状态明细开关（原 showStatus，降噪用） */
const showStatus = ref(true)

const SYSTEM_TYPES: LogType[] = [LogType.SYSTEM, LogType.ACTION, LogType.ITEM]
const DEBUG_DISPLAY_LIMIT = 200

// ───────────────────────── 数据源：全量拉取，本地过滤 ─────────────────────────
const allLogs = ref<LogEntry[]>([])
const logUpdateListener = () => {
  allLogs.value = battleLogManager.getFilteredLogs()
}

/** 战斗战报历史（battleStore 在战斗结束时入列，最新在前，仅保留 3 场） */
const { recentSummaries, clearRecentSummaries } = useBattleStore()

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
const debugAllRaw = computed(() => allLogs.value.filter((l) => l.type === LogType.DEBUG))
const debugAll = computed(() => {
  let r = debugAllRaw.value
  if (levelFilter.value.size > 0) r = r.filter((e) => levelFilter.value.has(e.level ?? LogLevel.INFO))
  if (keyword.value) r = applyKeyword(r, keyword.value)
  return r
})
/** 调试日志原始总数（截断提示用；与 keyword 无关） */
const debugTotal = computed(() => debugAllRaw.value.length)
const debugLogs = computed(() => debugAll.value.slice(-DEBUG_DISPLAY_LIMIT))

// ───────────────────────── 级别过滤（调试页签） ─────────────────────────
/** 可过滤的级别（按严重度排序显示） */
const FILTERABLE_LEVELS = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG, LogLevel.TRACE] as const
/** 选中的级别集合；空 = 显示全部 */
const levelFilter = ref<Set<LogLevel>>(new Set())

function toggleLevelFilter(lv: LogLevel): void {
  const next = new Set(levelFilter.value)
  if (next.has(lv)) next.delete(lv)
  else next.add(lv)
  levelFilter.value = next
}

/** 调试页签存在 ERROR 级日志（页签徽章标红用） */
const hasDebugError = computed(() => debugAllRaw.value.some((e) => e.level === LogLevel.ERROR))

/** 战斗 / 系统日志原始总数（搜索无结果空态区分用：过滤后有内容但无匹配 → 提示清除搜索） */
const battleTotal = computed(() => allLogs.value.filter((l) => l.type === LogType.BATTLE).length)
const systemTotal = computed(() => allLogs.value.filter((l) => SYSTEM_TYPES.includes(l.type)).length)

/** 叙事块 */
const blocks = computed(() => renderer.renderEntries(battleLogs.value))

// ───────────────────────── 页签计数 ═══ Tabs 组件接管指示条 ──────────────────
function tabCount(id: TabId): number {
  if (id === 'battle') return allLogs.value.filter((l) => l.type === LogType.BATTLE).length
  if (id === 'report') return recentSummaries.length
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

function onSegmentEnter(event: MouseEvent | FocusEvent, hover: LogSegmentHover) {
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
  // 上滚离开底部 = 用户要回看，停止跟随；回到底部由用户点「回到底部」或手动滚回恢复
  const { scrollTop, scrollHeight, clientHeight } = el
  autoScrollEnabled.value = scrollTop >= scrollHeight - clientHeight - 5
}

/** 「回到底部」按钮：滚到底并恢复自动跟随 */
function resumeFollow(): void {
  autoScrollEnabled.value = true
  scrollActiveToBottom()
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

// ───────────────────────── 工具条下拉（导出 / 清除共用） ─────────────────────────

const openMenu = ref<'export' | 'clear' | null>(null)
const exportWrapperRef = ref<HTMLElement | null>(null)
const clearWrapperRef = ref<HTMLElement | null>(null)

function toggleMenu(menu: 'export' | 'clear'): void {
  openMenu.value = openMenu.value === menu ? null : menu
}

function handleMenuClickOutside(e: MouseEvent): void {
  if (openMenu.value === 'export' && exportWrapperRef.value && !exportWrapperRef.value.contains(e.target as Node)) {
    openMenu.value = null
  } else if (openMenu.value === 'clear' && clearWrapperRef.value && !clearWrapperRef.value.contains(e.target as Node)) {
    openMenu.value = null
  }
}

function flatToText(e: LogEntry): string {
  if (e.segments?.length) return segsText(e.segments)
  return e.message ?? ''
}

function exportLogs(format: 'txt' | 'html' = 'txt'): void {
  openMenu.value = null
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
  } else if (activeTab.value === 'report') {
    // 战报页签：纯文本摘要（与卡片「复制摘要」同口径，仅 TXT）
    content = recentSummaries.map((s, i) => `【${REPORT_TAGS[i] ?? '更早一场'}】\n${summaryToText(s)}`).join('\n\n')
    mime = 'text/plain;charset=utf-8'
    ext = 'txt'
  } else {
    // 系统/调试页签：扁平日志，仅 TXT
    const logs = activeTab.value === 'debug' ? debugLogs.value : systemLogs.value
    content = logs.map(flatToText).join('\n')
    mime = 'text/plain;charset=utf-8'
    ext = 'txt'
  }

  if (!content.trim()) {
    useNotificationStore().toast('当前页签无内容可导出', 'warning')
    return
  }
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

// ───────────────────────── 清除（当前页签 / 全部） ─────────────────────────

function clearCurrentTab(): void {
  openMenu.value = null
  if (activeTab.value === 'battle') {
    battleLogManager.clearLogs()
  } else if (activeTab.value === 'system') {
    battleLogManager.clearLogsByTypes([...SYSTEM_TYPES])
  } else if (activeTab.value === 'debug') {
    battleLogManager.clearLogsByTypes([LogType.DEBUG])
  } else {
    clearRecentSummaries()
  }
}

function clearAllLogs(): void {
  openMenu.value = null
  battleLogManager.clearLogsByTypes([
    LogType.BATTLE,
    LogType.SYSTEM,
    LogType.ACTION,
    LogType.ITEM,
    LogType.DEBUG,
  ])
  clearRecentSummaries()
}

// ───────────────────────── 单条复制 ─────────────────────────

async function copyEntry(entry: LogEntry): Promise<void> {
  try {
    await navigator.clipboard.writeText(flatToText(entry))
    useNotificationStore().toast('已复制该条日志', 'success')
  } catch {
    useNotificationStore().toast('复制失败', 'warning')
  }
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

  document.addEventListener('click', handleMenuClickOutside)
})

onUnmounted(() => {
  battleLogManager.removeListener(logUpdateListener)
  document.removeEventListener('click', handleMenuClickOutside)
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

/* ─────────── 搜索 & 下拉（导出/清除共用） ─────────── */
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

.dropdown-wrapper {
  position: relative;
  display: inline-flex;
}

.dropdown-menu {
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

.dropdown-menu button {
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  white-space: nowrap;
  text-align: left;
}

.dropdown-menu button:hover {
  background: var(--color-bg-hover);
  color: var(--color-info);
}

/* ─────────── 内容容器（双容器，v-show 保留滚动位置） ─────────── */
/* 悬浮按钮的定位锚点 */
.battle-log-section {
  position: relative;
}

/* 页签切入时的淡入上浮 */
.log-content.is-active {
  animation: content-in 0.18s ease-out;
}

/* ─────────── 级别过滤（调试页签） ─────────── */
.level-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  margin-bottom: var(--space-1);
}

.level-filter-label {
  color: var(--color-text-tertiary);
}

.level-chip {
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background-color var(--transition-fast);
}

.level-chip:hover {
  color: var(--color-text-primary);
  border-color: var(--color-text-secondary);
}

/* 选中 = 对应级别色高亮（与条目左边线同色系） */
.level-chip.chip-lv-0.is-on {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: rgba(var(--rgb-danger), 0.12);
}

.level-chip.chip-lv-1.is-on {
  border-color: var(--color-warning);
  color: var(--color-warning);
  background: rgba(var(--rgb-warning), 0.12);
}

.level-chip.chip-lv-2.is-on {
  border-color: var(--color-info);
  color: var(--color-info);
  background: rgba(var(--rgb-info), 0.12);
}

.level-chip.chip-lv-3.is-on,
.level-chip.chip-lv-4.is-on {
  border-color: var(--color-text-secondary);
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

.level-chip.chip-reset {
  border-style: dashed;
}

.level-chip.chip-reset:hover {
  color: var(--color-info);
  border-color: var(--color-info);
}

/* ─────────── 单条复制按钮（hover 浮现） ─────────── */
.copy-btn {
  margin-left: auto;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.flat-item:hover .copy-btn,
.copy-btn:focus-visible {
  opacity: 1;
}

.copy-btn:hover {
  color: var(--color-info);
  border-color: var(--color-info);
}

/* ─────────── 回到底部悬浮按钮 ─────────── */
.scroll-bottom-btn {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-3);
  z-index: var(--z-dropdown);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-full);
  background: var(--color-bg-primary);
  color: var(--color-info);
  cursor: pointer;
  box-shadow: var(--shadow-md);
}

.scroll-bottom-btn:hover {
  border-color: var(--color-info);
  box-shadow: 0 0 8px rgba(var(--rgb-info), var(--alpha-glow));
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

/* ─────────── 战斗战报页签 ─────────── */
.report-item {
  margin-bottom: var(--space-3);
}

.report-item:last-child {
  margin-bottom: 0;
}

.report-tag {
  display: inline-block;
  margin-bottom: var(--space-1);
  padding: 1px var(--space-2);
  border-left: 2px solid var(--color-heal);
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

/* 搜索无结果空态内的「清除搜索」按钮 */
.empty-clear {
  margin-left: var(--space-2);
  padding: 2px 10px;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  color: var(--color-info);
  font-style: normal;
  cursor: pointer;
  font-family: inherit;

  &:hover {
    border-color: var(--color-info);
  }
}
</style>
