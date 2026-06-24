<!--
 * 文件: DebugLogDialog.vue
 * 创建日期: 2026-03-07
 * 作者: CombatDebugStudio
 * 功能: 调试日志弹窗
 * 描述: 显示 BattleLogManager 的日志信息
 * 版本: 1.0.0
-->

<template>
  <Dialog :model-value="modelValue" @update:model-value="handleModelValueChange" title="调试日志" width="800px">
    <div class="debug-log-container">
      <div class="log-toolbar">
        <button class="log-btn" @click="clearLogs">清空</button>
        <span class="log-count">共 {{ localLogs.length }} 条</span>
      </div>
      <div class="log-list" ref="logListRef">
        <div v-for="(log, index) in localLogs" :key="index" class="log-item" :class="'level-' + log.level">
          <span class="log-level" :class="'level-' + log.level">{{ logLevelName(log.level) }}</span>
          <span class="log-source" v-if="log.source">[{{ log.source }}]</span>
          <span class="log-message">{{ log.message }}</span>
          <div v-if="log.context" class="log-context">
            <pre>{{ JSON.stringify(log.context, null, 2) }}</pre>
          </div>
          <div v-if="log.error" class="log-error">
            {{ log.error.message }}
          </div>
        </div>
        <div v-if="localLogs.length === 0" class="log-empty">
          暂无日志
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import type { LogEntry } from '@/application/dto/battle-log'
import { LogLevel } from '@/application/dto/battle-log'

interface Props {
  modelValue: boolean
  logs: LogEntry[]
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'clear'): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  logs: () => []
})

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

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  })
}

const logLevelName = (level: LogLevel): string => {
  const names: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR'
  }
  return names[level] || 'UNKNOWN'
}
</script>

<style scoped>
.debug-log-container {
  display: flex;
  flex-direction: column;
  height: 500px;
}

.log-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border-bottom: 1px solid #1e3a5f;
}

.log-btn {
  background: #1e3a5f;
  color: #fff;
  border: none;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
}

.log-btn:hover {
  background: #2d5a8a;
}

.log-count {
  color: #8ba4c7;
  font-size: 0.875rem;
}

.log-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  background: #0a0a14;
}

.log-item {
  padding: 0.5rem;
  border-bottom: 1px solid #1e3a5f;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.875rem;
}

.log-item:hover {
  background: #12122a;
}

.log-time {
  color: #6b7280;
  margin-right: 0.5rem;
}

.log-level {
  padding: 0.125rem 0.375rem;
  border-radius: 2px;
  margin-right: 0.5rem;
  font-weight: bold;
}

.level-DEBUG {
  color: #9ca3af;
}

.level-DEBUG .log-level {
  background: #374151;
}

.level-INFO {
  color: #22d3ee;
}

.level-INFO .log-level {
  background: #0e7490;
}

.level-WARN {
  color: #f97316;
}

.level-WARN .log-level {
  background: #c2410c;
}

.level-ERROR {
  color: #ef4444;
}

.level-ERROR .log-level {
  background: #b91c1c;
}

.log-source {
  color: #a78bfa;
  margin-right: 0.5rem;
}

.log-message {
  color: #e5e7eb;
}

.log-context {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #1f2937;
  border-radius: 4px;
  overflow-x: auto;
}

.log-context pre {
  margin: 0;
  color: #d1d5db;
  font-size: 0.75rem;
}

.log-error {
  margin-top: 0.25rem;
  color: #f87171;
  font-size: 0.875rem;
}

.log-empty {
  text-align: center;
  color: #6b7280;
  padding: 2rem;
}
</style>
