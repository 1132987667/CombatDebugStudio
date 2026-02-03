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
        <button class="btn-small" @click="$emit('filter-change', { filters: logFilters, keyword: logKeyword })">[F]过滤</button>
      </div>
    </div>
    <div class="log-content">
      <div v-for="(log, index) in filteredLogs" :key="index" class="log-entry" :class="log.level">
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

const props = defineProps<{
  logs: BattleLog[];
}>();

const emit = defineEmits<{
  "filter-change": [data: { filters: LogFilters; keyword: string }];
}>();

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
</script>

<style scoped>
.battle-log-section {
  margin-top: 20px;
  border-top: 1px solid #ddd;
  padding-top: 15px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.log-filters {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-check {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
}

.log-keyword {
  width: 120px;
  padding: 3px 6px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 12px;
}

.btn-small {
  padding: 3px 8px;
  font-size: 12px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 3px;
  cursor: pointer;
}

.btn-small:hover {
  background: #e0e0e0;
}

.log-content {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 10px;
  background: #f9f9f9;
}

.log-entry {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px;
  margin-bottom: 4px;
  border-radius: 3px;
  font-size: 12px;
  line-height: 1.3;
}

.log-entry.damage {
  background: rgba(255, 0, 0, 0.05);
  border-left: 3px solid #ff4444;
}

.log-entry.crit {
  background: rgba(255, 165, 0, 0.05);
  border-left: 3px solid #ff9900;
}

.log-entry.heal {
  background: rgba(0, 255, 0, 0.05);
  border-left: 3px solid #44cc44;
}

.log-entry.status {
  background: rgba(0, 0, 255, 0.05);
  border-left: 3px solid #4444ff;
}

.log-entry.info {
  background: rgba(128, 128, 128, 0.05);
  border-left: 3px solid #888888;
}

.log-turn {
  font-weight: bold;
  color: #666;
}

.log-source {
  color: #333;
}

.log-action {
  color: #666;
}

.log-target {
  color: #888;
}

.log-result {
  font-weight: bold;
}

.sub-effects {
  margin-left: 20px;
  margin-top: 4px;
  width: 100%;
}

.sub-effect {
  font-size: 11px;
  color: #777;
  margin-left: 10px;
}

.no-logs {
  text-align: center;
  color: #999;
  padding: 20px;
  font-style: italic;
}
</style>