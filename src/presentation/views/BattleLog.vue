<template>
  <div class="battle-log-section">
    <div class="log-header">
      <span>战斗日志</span>
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
    <div class="log-content">
      <div v-for="(log, index) in logs" :key="index" class="log-entry" :class="log.type">
        <span class="log-seq">#{{ log.index }}</span>
        <span class="log-type">[{{ LogTypeLabel[log.type] }}]</span>
        <span class="log-result">
          <span v-for="(segment, segIndex) in log.segments" :key="segIndex" :class="segment.classStr">{{
            segment.text }}</span>
        </span>
      </div>
      <div v-if="logs.length === 0" class="no-logs">暂无战斗日志</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import type { LogEntry, LogFilters } from '@/shared/types/battle-log';
import { LogTypeLabel } from '@/shared/types/battle-log';
import { battleLogManager } from '@/infrastructure/adapters/logging'

interface Props {
}

const props = defineProps<Props>();

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

const applyFilters = () => {
  battleLogManager.updateFilters(logFilters);
};

onMounted(() => {
  battleLogManager.addListener(() => {
    logVersion.value++;
  });
});

onUnmounted(() => {
  // ponytail: BattleLogManager 暂无可移除 listener 的 API，
  // listener 持有 logVersion 的闭包引用，组件卸载后继续递增无害但浪费。
  // 升级路径：给 manager 加上 removeListener 后在此处调用清理
});
</script>

<style scoped>
@use'@/presentation/styles/main.scss';

.log-seq {
  color: var(--color-text-tertiary);
  margin-right: var(--space-2);
  font-size: var(--font-size-sm);
  min-width: 3em;
  display: inline-block;
}
</style>
