<template>
  <div class="battle-log-section">
    <div class="log-header">
      <span>战斗日志 (最新在上，按时间倒序)</span>
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
      <div v-for="(log, index) in filteredLogs" :key="index" class="log-entry" :class="log.level">
        {{ log }}
        <span class="log-turn">[{{ log.turn }}]</span>
        <span class="log-source">{{ log.source }}</span>
        <span class="log-action">{{ log.action }}</span>
        <span class="log-target">{{ log.target }}</span>
        <span class="log-result">{{ log.result }}</span>
        <div v-if="log.subEffects && log.subEffects.length" class="sub-effects">
          <div v-for="(effect, ei) in log.subEffects" :key="ei" class="sub-effect">
            → {{ effect }}
          </div>
        </div>
      </div>
      <div v-if="filteredLogs.length === 0" class="no-logs">暂无战斗日志</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from "vue";

interface BattleLog {
  turn: string;
  source: string;
  action: string;
  target: string;
  result: string;
  level: string;
  subEffects?: string[];
}

interface LogFilters {
  damage: boolean;
  status: boolean;
  crit: boolean;
  heal: boolean;
}

interface Props {
  logs: BattleLog[];
}

const props = defineProps<Props>();

const logKeyword = ref("");
const logFilters = reactive<LogFilters>({
  damage: true,
  status: true,
  crit: true,
  heal: false,
});

const filteredLogs = computed(() => {
  let logs = [...props.logs];
  
  if (!logFilters.damage) {
    logs = logs.filter((l) => l.level !== "damage" && l.level !== "crit");
  }
  
  if (!logFilters.status) {
    logs = logs.filter((l) => l.level !== "status");
  }
  
  if (!logFilters.crit) {
    logs = logs.filter((l) => l.level !== "crit");
  }
  
  if (!logFilters.heal) {
    logs = logs.filter((l) => l.level !== "heal");
  }
  
  if (logKeyword.value) {
    const keyword = logKeyword.value.toLowerCase();
    logs = logs.filter(
      (l) =>
        l.source.toLowerCase().includes(keyword) ||
        l.target.toLowerCase().includes(keyword) ||
        l.result.toLowerCase().includes(keyword)
    );
  }
  
  return logs;
});

const applyFilters = () => {
  // 触发过滤逻辑，这里可以添加额外的过滤逻辑
  console.log("应用过滤器", logFilters, logKeyword.value);
};
</script>

<style scoped>
@use'@/styles/main.scss';
</style>