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
          <span class="log-seq">#{{ log.index }}</span>
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
import type { LogEntry } from '@/shared/types/battle-log'
import { LogLevel } from '@/shared/types/battle-log'

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
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-bg-tertiary);
}

.log-btn {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: none;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.log-btn:hover {
  background: var(--color-border-strong);
}

.log-count {
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}

.log-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
  background: var(--color-bg-secondary);
}

.log-item {
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-bg-tertiary);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: var(--font-size-md);
}

.log-item:hover {
  background: var(--color-bg-primary);
}

.log-time {
  color: var(--color-text-tertiary);
  margin-right: var(--space-2);
}

.log-level {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  margin-right: var(--space-2);
  font-weight: bold;
}

.log-seq {
  color: var(--color-text-tertiary);
  margin-right: var(--space-2);
  font-size: var(--font-size-sm);
  min-width: 3em;
  display: inline-block;
}

.level-DEBUG {
  color: var(--color-text-tertiary);
}

.level-DEBUG .log-level {
  background: var(--color-bg-tertiary);
}

.level-INFO {
  color: var(--color-energy);
}

.level-INFO .log-level {
  background: var(--color-energy);
}

.level-WARN {
  color: var(--color-warning);
}

.level-WARN .log-level {
  background: var(--color-warning);
}

.level-ERROR {
  color: var(--color-danger);
}

.level-ERROR .log-level {
  background: var(--color-danger);
}

.log-source {
  color: var(--color-debuff);
  margin-right: var(--space-2);
}

.log-message {
  color: var(--color-text-secondary);
}

.log-context {
  margin-top: var(--space-2);
  padding: var(--space-2);
  background: var(--color-bg-primary);
  border-radius: var(--radius-sm);
  overflow-x: auto;
}

.log-context pre {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.log-error {
  margin-top: var(--space-1);
  color: var(--color-danger);
  font-size: var(--font-size-md);
}

.log-empty {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: var(--space-6);
}
</style>
