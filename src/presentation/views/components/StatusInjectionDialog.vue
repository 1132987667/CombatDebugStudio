<!--
 * 文件: StatusInjectionDialog.vue
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 初始状态注入对话框
 * 描述: 负责初始参数配置、状态设置和确认交互界面
 * 版本: 1.0.0
-->

<template>
  <Dialog :model-value="modelValue" @update:model-value="handleModelValueChange" title="初始状态注入" width="500px">
    <div class="selected-info">
      <span class="label">当前选中:</span>
      <span class="value">{{ selectedCharName || '未选择' }}</span>
    </div>

    <div class="status-section">
      <div class="si-section-header">
        <span class="section-title">可用状态</span>
        <span class="status-count">{{ activeStatuses.length }}/{{ localStatuses.length }}</span>
      </div>

      <div class="status-list">
        <div class="si-status-item" :class="{ active: status.active, disabled: !selectedCharName }">
          <label class="status-label">
            <input type="checkbox" v-model="status.active" :disabled="!selectedCharName">
            <span class="si-status-name" :class="status.isPositive ? 'positive' : 'negative'">
              {{ status.name }}
            </span>
          </label>
          <span class="si-status-duration">回合:{{ status.duration }}</span>
          <span class="si-status-effect">{{ status.effect }}</span>
        </div>

        <div v-if="localStatuses.length === 0" class="empty-tip">
          {{ selectedCharName ? '暂无可用状态' : '请先选择角色' }}
        </div>
      </div>
    </div>

    <div class="si-section-actions">
      <button class="btn-medium" @click="handleAddStatus" :disabled="!hasSelectedStatus || !selectedCharName">
        [A]添加状态
      </button>
      <button class="btn-medium" @click="handleClear" :disabled="!hasActiveStatus">
        [C]清空
      </button>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'

/**
 * 可注入状态接口
 * 用于定义战斗中可注入到角色的状态数据
 */
export interface InjectableStatus {
  /** 状态唯一标识符 */
  id: string
  /** 状态名称 */
  name: string
  /** 持续回合数 */
  duration: number
  /** 状态效果描述 */
  effect: string
  /** 是否激活 */
  active: boolean
  /** 是否为增益状态 */
  isPositive: boolean
}

interface Props {
  modelValue: boolean
  selectedCharName: string
  injectableStatuses: InjectableStatus[]
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:injectableStatuses', statuses: InjectableStatus[]): void
  (e: 'add'): void
  (e: 'clear'): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  selectedCharName: ''
})

const emit = defineEmits<Emits>()

const localStatuses = ref<InjectableStatus[]>([])

const handleModelValueChange = (value: boolean) => {
  emit('update:modelValue', value)
}

watch(() => props.injectableStatuses, (newStatuses) => {
  localStatuses.value = JSON.parse(JSON.stringify(newStatuses))
}, { deep: true, immediate: true })

watch(localStatuses, (newStatuses) => {
  emit('update:injectableStatuses', JSON.parse(JSON.stringify(newStatuses)))
}, { deep: true })

const activeStatuses = computed(() => {
  return localStatuses.value.filter(s => s.active)
})

const hasSelectedStatus = computed(() => {
  return activeStatuses.value.length > 0
})

const hasActiveStatus = computed(() => {
  return localStatuses.value.some(s => s.active)
})

const handleAddStatus = () => {
  if (hasSelectedStatus.value && props.selectedCharName) {
    emit('add')
  }
}

const handleClear = () => {
  localStatuses.value.forEach(s => {
    s.active = false
  })
  emit('clear')
}
</script>

<style scoped>
.status-section {
  margin-bottom: var(--space-4);
}

.si-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.status-count {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  background: var(--color-bg-primary);
  padding: 2px 8px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
}

.status-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--space-2);
}

.si-status-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-1);
  transition: all 0.2s;
}

.si-status-item:last-child {
  margin-bottom: 0;
}

.si-status-item:hover {
  background: var(--color-bg-primary);
}

.si-status-item.active {
  background: var(--color-bg-tertiary);
  border-left: 3px solid var(--color-info);
}

.si-status-item.disabled {
  opacity: 0.5;
}

.status-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  flex: 1;
}

.status-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.si-status-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.si-status-name.positive {
  color: var(--color-success);
}

.si-status-name.negative {
  color: var(--color-danger);
}

.si-status-duration {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  background: var(--color-border-default);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.si-status-effect {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-tip {
  padding: var(--space-8) var(--space-5);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.si-section-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-default);
}
</style>
