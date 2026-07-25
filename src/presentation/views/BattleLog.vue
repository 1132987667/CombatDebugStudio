<template>
  <div class="battle-log-section">
    <div class="log-header">
      <span>战斗日志</span>
      <div class="log-filters">
        <label class="filter-check"><input type="checkbox" v-model="filters.battle" /> 战斗</label>
        <label class="filter-check"><input type="checkbox" v-model="filters.system" /> 系统</label>
        <label class="filter-check"><input type="checkbox" v-model="showStatus" /> 状态</label>
        <input class="log-keyword" v-model="keyword" placeholder="搜索…" />
        <button class="export-btn" @click="exportLogs" title="导出日志文本">📋 导出</button>
      </div>
    </div>
    <div class="log-content" ref="logContainer" @scroll="onScroll">
      <div v-if="blocks.length === 0" class="no-logs">暂无战斗日志</div>

      <div v-for="(b, i) in blocks" :key="i" class="nb" :class="'nb--' + b.type">
        <!-- 战斗头/尾 -->
        <template v-if="b.type === 'battle-header'">
          <span class="rule rule--double"></span>
          <div class="battle-line"><LogSeg v-for="(s,j) in b.segments" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave"/></div>
          <span class="rule rule--double"></span>
        </template>

        <!-- 回合头 -->
        <template v-else-if="b.type === 'round'">
          <span class="rule"></span>
          <span class="round-label">第 {{ b.turn }} 回合<template v-if="b.tag"> · {{ b.tag }}</template></span>
          <span class="rule"></span>
        </template>

        <!-- 行动块 -->
        <template v-else-if="b.type === 'action'">
          <div class="action-header"><span class="glyph">◆</span>
            <LogSeg v-for="(s,j) in b.header" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave"/>
          </div>
          <div v-if="b.result" class="action-result">
            <LogSeg v-for="(s,j) in b.result" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave"/>
          </div>
          <div v-for="(sub,k) in b.subs" :key="'s'+k" class="action-sub">
            <span class="glyph glyph--sub">{{ k === b.subs.length - 1 ? '└' : '├' }}</span>
            <LogSeg v-for="(s,j) in sub" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave"/>
          </div>
        </template>

        <!-- 回合结算 -->
        <template v-else-if="b.type === 'settlement'">
          <div class="sub-header"><span class="rule rule--thin"></span>回合结算<span class="rule rule--thin"></span></div>
          <div v-for="(line,k) in b.lines" :key="k" class="indent-line">
            <LogSeg v-for="(s,j) in line" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave"/>
          </div>
        </template>

        <!-- 态势 -->
        <template v-else-if="b.type === 'snapshot'">
          <div class="sub-header"><span class="rule rule--thin"></span>态势<span class="rule rule--thin"></span></div>
          <div v-for="(line,k) in b.lines" :key="k" class="indent-line">
            <LogSeg v-for="(s,j) in line" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave"/>
          </div>
        </template>

        <!-- 条件激活 -->
        <template v-else-if="b.type === 'section'">
          <div class="section-title">【{{ b.title }}】</div>
          <div v-for="(line,k) in b.lines" :key="k" class="indent-line">
            <LogSeg v-for="(s,j) in line" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave"/>
          </div>
        </template>

        <!-- 战报摘要 -->
        <template v-else-if="b.type === 'summary'">
          <span class="rule rule--double"></span>
          <div class="summary-content">
            <div v-for="(line,k) in b.lines" :key="k" class="summary-line">
              <LogSeg v-for="(s,j) in line" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave"/>
            </div>
          </div>
          <span class="rule rule--double"></span>
        </template>

        <!-- 普通行 -->
        <template v-else>
          <LogSeg v-for="(s,j) in b.segments" :key="j" :seg="s" @hover="onSegmentEnter" @leave="onSegmentLeave"/>
        </template>
      </div>
    </div>

    <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="tooltipRect" @hide="tooltipVisible = false" />

    <div v-if="hasStats" class="log-stats">
      <span class="stat-item">回合: {{ stats.totalRounds }}</span>
      <span class="stat-item">总伤害: {{ stats.totalDamage }}</span>
      <span class="stat-item">总治疗: {{ stats.totalHealing }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { LogSegment, LogSegmentHover, LogFilters, BattleLogEntry, NarrativeBlock } from '@/shared/types/battle-log'
import { LogType } from '@/shared/types/battle-log'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { RoundNarrativeRenderer } from '@/domain/battle/logs/renderers/RoundNarrativeRenderer'
import LogSeg from '@/presentation/components/LogSeg.vue'
import EntityTooltip from '@/presentation/components/EntityTooltip.vue'
import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import { LogTooltipResolver } from '@/application/projection/LogTooltipResolver'
import { container } from '@/infrastructure/di/Container'
import type { SkillManager } from '@/domain/skill/SkillManager'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'

// 渲染器
const renderer = new RoundNarrativeRenderer()

// 悬浮解析器
let tooltipResolver: LogTooltipResolver | null = null
try {
  const skillManager = container.resolve<SkillManager>('SkillManager')
  renderer.setSkillLookup(skillManager)
  const buffRegistry = container.resolve<BuffScriptRegistry>('BuffScriptRegistry')
  tooltipResolver = new LogTooltipResolver(buffRegistry, skillManager)
} catch {
  // 容器未就绪时静默
}

// 数据源：battleLogManager
const logs = ref<BattleLogEntry[]>([])

const logUpdateListener = () => {
  logs.value = battleLogManager.getFilteredLogs() as BattleLogEntry[]
}

// 过滤
const filters = ref<LogFilters>({ ...battleLogManager.getFilters() })

// 监听本地过滤变更 → 同步到 battleLogManager
watch(
  () => [filters.value.battle, filters.value.system, filters.value.item, filters.value.action, filters.value.debug],
  () => {
    battleLogManager.updateFilters({
      battle: filters.value.battle,
      system: filters.value.system,
      item: filters.value.item,
      action: filters.value.action,
      debug: filters.value.debug,
    })
  },
  { immediate: true },
)

// 额外状态过滤（渲染层本地）
const showStatus = ref(true)

// 关键词搜索
const keyword = ref('')

const effectiveLogs = computed(() => {
  let result = logs.value
  // ★ 只保留 BATTLE 类型日志，过滤 SYSTEM/DEBUG/ACTION/ITEM
  result = result.filter((e) => e.type === LogType.BATTLE)
  // 关键词过滤
  if (keyword.value) {
    const kw = keyword.value.toLowerCase()
    result = result.filter((e) => {
      if (e.message?.toLowerCase().includes(kw)) return true
      if (e.segments?.some((s) => s.text.toLowerCase().includes(kw))) return true
      return false
    })
  }
  // 状态类别过滤（status 子类别按 showStatus 开关）
  if (!showStatus.value) {
    result = result.filter((e) => e.category !== 'status')
  }
  return result
})

// 渲染为叙事块
const blocks = computed(() => renderer.renderEntries(effectiveLogs.value))

// 统计（从 battleLogManager 汇总）
const hasStats = ref(false)
const stats = ref({ totalRounds: 0, totalDamage: 0, totalHealing: 0 })

// 定期刷新统计
let statTimer: ReturnType<typeof setInterval> | null = null

function refreshStats() {
  try {
    const allLogs = logs.value
    const rounds = new Set<number | string>()
    let dmg = 0
    let heal = 0
    for (const l of allLogs) {
      rounds.add(l.turn)
      if (l.category === 'damage' || l.category === 'crit') {
        // 从 segments 中提取数值
        const numSeg = l.segments?.find((s) => s.kind === 'damage')
        if (numSeg) dmg += parseInt(numSeg.text, 10) || 0
      }
      if (l.category === 'heal') {
        const numSeg = l.segments?.find((s) => s.kind === 'heal')
        if (numSeg) heal += parseInt(numSeg.text, 10) || 0
      }
    }
    stats.value = { totalRounds: rounds.size, totalDamage: dmg, totalHealing: heal }
    hasStats.value = rounds.size > 0
  } catch {
    // 静默
  }
}

watch(logs, refreshStats, { immediate: true })

// === 悬浮信息卡片 ===
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

// === 自动滚动 ===
const logContainer = ref<HTMLElement | null>(null)
const autoScrollEnabled = ref(true)
let autoScrollTimer: ReturnType<typeof setTimeout> | null = null
let scrollThrottled = false
const SCROLL_RESTORE_DELAY = 3000

const onScroll = () => {
  if (!logContainer.value || scrollThrottled) return
  scrollThrottled = true
  requestAnimationFrame(() => { scrollThrottled = false })
  const { scrollTop, scrollHeight, clientHeight } = logContainer.value
  if (scrollTop < scrollHeight - clientHeight - 5) {
    autoScrollEnabled.value = false
    if (autoScrollTimer) clearTimeout(autoScrollTimer)
    autoScrollTimer = setTimeout(() => {
      autoScrollEnabled.value = true
      autoScrollTimer = null
    }, SCROLL_RESTORE_DELAY)
  } else {
    autoScrollEnabled.value = true
    if (autoScrollTimer) { clearTimeout(autoScrollTimer); autoScrollTimer = null }
  }
}

const scrollToBottom = () => {
  if (!logContainer.value) return
  logContainer.value.scrollTop = logContainer.value.scrollHeight
}

watch(blocks, () => {
  nextTick(() => {
    if (autoScrollEnabled.value) scrollToBottom()
  })
})

onMounted(() => {
  battleLogManager.addListener(logUpdateListener)
  logUpdateListener() // 立即加载
})

onUnmounted(() => {
  battleLogManager.removeListener(logUpdateListener)
  if (autoScrollTimer) clearTimeout(autoScrollTimer)
  if (statTimer) clearInterval(statTimer)
})

// === 导出日志文本 ===

/** 将 LogSegment[] 拼接为纯文本 */
function segsText(segs: LogSegment[]): string {
  return segs.map((s) => s.text).join('')
}

/** 将 NarrativeBlock[] 渲染为叙事纯文本 */
function blocksToText(blocks: NarrativeBlock[]): string {
  const lines: string[] = []
  for (const b of blocks) {
    switch (b.type) {
      case 'battle-header':
        lines.push('═══════════════════════════════════════════')
        lines.push(segsText(b.segments))
        lines.push('═══════════════════════════════════════════')
        lines.push('')
        break
      case 'round':
        lines.push(`─────────────────────── 第 ${b.turn} 回合${b.tag ? ` · ${b.tag}` : ''} ───────────────────────`)
        break
      case 'action':
        lines.push(`◆ ${segsText(b.header)}`)
        if (b.result) lines.push(`  ${segsText(b.result)}`)
        for (let k = 0; k < b.subs.length; k++) {
          const prefix = k === b.subs.length - 1 ? '└' : '├'
          lines.push(`  ${prefix} ${segsText(b.subs[k])}`)
        }
        break
      case 'settlement':
        lines.push('')
        lines.push('  ── 回合结算 ──')
        for (const line of b.lines) {
          lines.push(`    ${segsText(line)}`)
        }
        break
      case 'snapshot':
        lines.push('')
        lines.push('  ── 态势 ──')
        for (const line of b.lines) {
          lines.push(`    ${segsText(line)}`)
        }
        break
      case 'section':
        lines.push(`【${b.title}】`)
        for (const line of b.lines) {
          lines.push(`  ${segsText(line)}`)
        }
        break
      case 'summary':
        lines.push('')
        lines.push('═══════════════════════════════════════════')
        for (const line of b.lines) {
          lines.push(segsText(line))
        }
        lines.push('═══════════════════════════════════════════')
        lines.push('')
        break
      default: // plain
        lines.push(segsText(b.segments))
    }
  }
  return lines.join('\n')
}

/** 导出战斗日志为 .txt 文件 */
function exportLogs(): void {
  const text = blocksToText(blocks.value)
  if (!text.trim()) return
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `battle-log-${timestamp}.txt`
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
@use '@/presentation/styles/main.scss';

.log-content {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: var(--font-size-sm);
  line-height: 1.7;
  padding: var(--space-2);
}

.no-logs {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: var(--space-6);
}

/* ── 分隔线（CSS 实现） ── */
.rule { flex: 1; height: 1px; background: var(--color-border-default); align-self: center; }
.rule--double { height: 3px; border-top: 1px solid var(--color-border-strong); border-bottom: 1px solid var(--color-border-strong); background: transparent; }
.rule--thin { opacity: 0.5; }

/* 叙事块基础 */
.nb { margin: 2px 0; }

/* 战斗头/尾 */
.nb--battle-header { display: flex; gap: 10px; text-align: center; font-weight: var(--font-weight-bold); color: var(--color-warning); padding: 6px 0; align-items: center; }
.battle-line { padding: 4px 0; letter-spacing: 1px; text-align: center; }

/* 回合头 */
.nb--round { display: flex; gap: 10px; margin: 14px 0 6px; align-items: center; }
.round-label { color: var(--color-info); font-weight: var(--font-weight-bold); white-space: nowrap; }

/* 行动块：◆ 头 + 缩进结果/从属 */
.action-header { font-weight: var(--font-weight-semibold); }
.glyph { color: var(--color-warning); margin-right: 6px; }
.action-result, .action-sub { padding-left: 1.4em; }
.glyph--sub { color: var(--color-text-tertiary); }

/* 结算/态势 子标题 */
.sub-header { display: flex; gap: 8px; color: var(--color-text-tertiary); margin-top: 8px; font-size: var(--font-size-xs); letter-spacing: 2px; align-items: center; }
.indent-line { padding-left: 1.4em; }

/* 条件激活 */
.section-title { color: var(--color-energy); font-weight: var(--font-weight-bold); }

/* 战报摘要 */
.nb--summary { display: flex; gap: 10px; padding: 8px 0; align-items: center; }
.summary-content { text-align: center; padding: 4px 0; }
.summary-line { margin: 2px 0; }

/* 统计栏 */
.log-stats {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.stat-item {
  white-space: nowrap;
}

/* 导出按钮 */
.export-btn {
  margin-left: auto;
  padding: 2px 8px;
  font-size: var(--font-size-xs);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition-fast);
}
.export-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

/* 微交互：新块淡入 */
@media (prefers-reduced-motion: no-preference) {
  .nb { animation: nb-in .18s ease-out; }
  @keyframes nb-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
}
.log-hoverable { text-decoration: underline dotted; text-underline-offset: 2px; cursor: help; transition: filter var(--transition-fast); }
.log-hoverable:hover { filter: brightness(1.35); }
</style>
