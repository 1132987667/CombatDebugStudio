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
        <button class="btn-small" @click="applyFilters">[F]过滤</button>
      </div>
    </div>
    <div class="log-content">
      <div v-for="(log, index) in logs" :key="index" class="log-entry" :class="log.type">
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
import { ref, reactive, computed } from "vue";
import type { BattleLogEntry, LogFilters } from '@/types/battle-log';
import { LogTypeLabel } from '@/types/battle-log';
import { battleLogManager } from '@/utils/logging'

interface Props {
}



const props = defineProps<Props>();

const logKeyword = ref("");
const logFilters = reactive<LogFilters>({
  damage: true,
  status: true,
  crit: true,
  heal: false,
});

const logs = computed(() => battleLogManager.getFilteredLogs())

const applyFilters = () => {
};
</script>

<style scoped>
@use'@/styles/main.scss';
</style>