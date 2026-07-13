<template>
  <div class="battle-log-section">
    <div class="log-header">
      <span>战斗日志</span>
      <div class="log-toolbar">
        <!-- 新增：日志风格切换 -->
        <select v-model="selectedStyle" class="style-select" @change="onStyleChange">
          <option v-for="style in availableStyles" :key="style.id" :value="style.id">
            {{ style.name }}
          </option>
        </select>

        <div class="log-filters">
          <label class="filter-check">
            <input type="checkbox" v-model="logFilters.battle">战斗
          </label>
          <label class="filter-check">
            <input type="checkbox" v-model="logFilters.system">系统
          </label>
          <label class="filter-check">
            <input type="checkbox" v-model="logFilters.action">操作
          </label>
          <label class="filter-check">
            <input type="checkbox" v-model="logFilters.debug">调试
          </label>
          <input type="text" v-model="logKeyword" placeholder="关键字" class="log-keyword">
          <button class="btn-medium" @click="applyFilters">[F]过滤</button>
        </div>
      </div>
    </div>
    <div class="log-content" ref="logContainer" @scroll="onScroll">
      <div v-for="(log, index) in logs" :key="index" class="log-entry" :class="log.type">
        <span class="log-seq">#{{ log.index }}</span>
        <span class="log-type">[{{ LogTypeLabel[log.type] }}]</span>
        <span class="log-result">
          <span v-for="(segment, segIndex) in log.segments" :key="segIndex" :class="segment.classStr">{{ segment.text }}</span>
        </span>
      </div>
      <div v-if="logs.length === 0" class="no-logs">暂无战斗日志</div>
    </div>
    <!-- 新增：底部统计条 -->
    <div v-if="stats.totalRounds > 0" class="log-stats">
      <span class="stat-item">回合: {{ stats.totalRounds }}</span>
      <span class="stat-item">总伤害: {{ stats.totalDamage }}</span>
      <span class="stat-item">总治疗: {{ stats.totalHealing }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import type { LogEntry, LogFilters } from '@/shared/types/battle-log';
import { LogTypeLabel, LogLevel, BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log';
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { PokemonStyleRenderer, SlayTheSpireRenderer } from '@/infrastructure/adapters/logging'
import type { PlayerLogRenderer } from '@/infrastructure/adapters/logging'

interface Props {
}

const props = defineProps<Props>();

// 可用风格列表
const availableStyles: PlayerLogRenderer[] = [
  PokemonStyleRenderer,
  SlayTheSpireRenderer,
]

// 当前选中的风格 ID
const selectedStyle = ref(battleLogManager.getPlayerRenderer().id)

// 风格切换
const onStyleChange = () => {
  const renderer = availableStyles.find(s => s.id === selectedStyle.value)
  if (renderer) {
    battleLogManager.setPlayerRenderer(renderer)
  }
}

const logKeyword = ref("");
const logFilters = reactive<LogFilters>({
  battle: true,
  system: true,
  item: true,
  action: true,
  debug: false,
});

// ponytail: battleLogManager 是普通 TS 单例非 Vue 响应式，
// 用 logVersion ref 作为 reactivity 触发器，addListener 回调递增它驱动 computed 重新求值
const logVersion = ref(0);

const logs = computed(() => {
  void logVersion.value;
  const filtered = battleLogManager.getFilteredLogs();
  const keyword = logKeyword.value.trim().toLowerCase();
  if (!keyword) return filtered;
  return filtered.filter((log: LogEntry) => {
    if (log.message?.toLowerCase().includes(keyword)) return true;
    if (log.segments?.some((s) => s.text.toLowerCase().includes(keyword))) return true;
    return false;
  });
});

// 新增：从日志中统计战斗数据
const stats = computed(() => {
  void logVersion.value;
  const allLogs = battleLogManager.getAllLogs();
  let totalDamage = 0
  let totalHealing = 0
  const roundSet = new Set<number | string>()

  for (const log of allLogs) {
    if (log.turn != null) roundSet.add(log.turn)
    if (log.category === BATTLE_LOG_CATEGORIES.DAMAGE || log.category === BATTLE_LOG_CATEGORIES.CRIT) {
      const num = extractNumberFromLog(log)
      totalDamage += num
    }
    if (log.category === BATTLE_LOG_CATEGORIES.HEAL) {
      const num = extractNumberFromLog(log)
      totalHealing += num
    }
  }

  return {
    totalRounds: roundSet.size,
    totalDamage,
    totalHealing,
  }
})

// ponytail: 简单的数字提取，从 segments 或 message 中找数值
function extractNumberFromLog(log: LogEntry): number {
  if (log.segments) {
    for (const seg of log.segments) {
      const n = parseInt(seg.text, 10)
      if (!isNaN(n)) return n
    }
  }
  const m = log.message?.match(/\d+/)
  return m ? parseInt(m[0], 10) : 0
}

const applyFilters = () => {
  battleLogManager.updateFilters(logFilters);
};

const logUpdateListener = () => {
  logVersion.value++;
}

onMounted(() => {
  battleLogManager.addListener(logUpdateListener);
});

onUnmounted(() => {
  battleLogManager.removeListener(logUpdateListener);
});

// === 自动滚动 ===
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
    if (autoScrollTimer) {
      clearTimeout(autoScrollTimer)
    }
    autoScrollTimer = setTimeout(() => {
      autoScrollEnabled.value = true
      autoScrollTimer = null
      // ponytail: 不主动滚动，等下次 logVersion 变化由 watch 触发
    }, SCROLL_RESTORE_DELAY)
  } else {
    autoScrollEnabled.value = true
    if (autoScrollTimer) {
      clearTimeout(autoScrollTimer)
      autoScrollTimer = null
    }
  }
}

const scrollToBottom = () => {
  if (!logContainer.value) return
  logContainer.value.scrollTop = logContainer.value.scrollHeight
}

watch(logVersion, () => {
  nextTick(() => {
    if (autoScrollEnabled.value) {
      scrollToBottom()
    }
  })
})

onUnmounted(() => {
  if (autoScrollTimer) {
    clearTimeout(autoScrollTimer)
    autoScrollTimer = null
  }
})
</script>

<style scoped>
@use'@/presentation/styles/main.scss';

.log-seq {
  color: var(--color-text-tertiary);
  margin-right: var(--space-2);
  min-width: 3em;
  display: inline-block;
}

/* 新增：工具栏布局 */
.log-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

/* 新增：风格选择器 */
.style-select {
  padding: 2px 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--color-text);
  cursor: pointer;
}

/* 新增：底部统计条 */
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
</style>
