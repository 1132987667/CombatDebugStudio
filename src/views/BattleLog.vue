<template>
  <div class="battle-log-section">
    <div class="log-header">
      <span>战斗日志</span>
      <div class="log-filters">
        <label class="filter-check">
          <input type="checkbox" v-model="logFilters.damage">伤害
        </label>
        <label class="filter-check">
          <input type="checkbox" v-model="logFilters.status">状态
        </label>
        <label class="filter-check">
          <input type="checkbox" v-model="logFilters.crit">暴击
        </label>
        <label class="filter-check">
          <input type="checkbox" v-model="logFilters.heal">治疗
        </label>
        <input type="text" v-model="logKeyword" placeholder="关键字" class="log-keyword">
        <button class="btn-small" @click="applyFilters">[F]过滤</button>
      </div>
    </div>
    <div class="log-content">
      {{ filteredLogs }}
      <div v-for="(log, index) in filteredLogs" :key="index" class="log-entry" :class="log.category">
        <span class="log-turn">[{{ log.turn }}]</span>
        <span class="log-result">
          <span 
            v-for="(segment, segIndex) in log.segments" 
            :key="segIndex"
            :class="getSegmentClass(segment.color)"
          >{{ segment.text }}</span>
        </span>
      </div>
      <div v-if="filteredLogs.length === 0" class="no-logs">暂无战斗日志</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from "vue";
import type { BattleLogEntry, LogFilters } from '@/types/battle-log';
import { LogSegmentColorClass } from '@/types/battle-log';

interface Props {
  logs: BattleLogEntry[];
}

const props = defineProps<Props>();

const logKeyword = ref("");
const logFilters = reactive<LogFilters>({
  damage: true,
  status: true,
  crit: true,
  heal: false,
});

function getSegmentClass(color?: string): string {
  if (!color || color === 'default') {
    return ''
  }
  return LogSegmentColorClass[color as keyof typeof LogSegmentColorClass] || ''
}

const filteredLogs = computed(() => {
  let logs = [...props.logs].reverse();

  if (logKeyword.value) {
    const keyword = logKeyword.value.toLowerCase()
    logs = logs.filter((log) => {
      const text = log.segments.map(s => s.text).join('').toLowerCase()
      return text.includes(keyword) ||
             log.source.toLowerCase().includes(keyword) ||
             log.target.toLowerCase().includes(keyword)
    })
  }

  return logs
});

const applyFilters = () => {
  // 触发过滤逻辑，这里可以添加额外的过滤逻辑
  console.log("应用过滤器", logFilters, logKeyword.value);
};
</script>

<style scoped>
@use'@/styles/main.scss';
</style>