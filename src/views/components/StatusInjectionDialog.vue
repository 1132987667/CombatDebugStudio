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
      <div class="section-header">
        <span class="section-title">可用状态</span>
        <span class="status-count">{{ activeStatuses.length }}/{{ localStatuses.length }}</span>
      </div>

      <div class="status-list">
        <div v-for="status in localStatuses" :key="status.id" class="status-item"
          :class="{ active: status.active, disabled: !selectedCharName }">
          <label class="status-label">
            <input type="checkbox" v-model="status.active" :disabled="!selectedCharName">
            <span class="status-name" :class="status.isPositive ? 'positive' : 'negative'">
              {{ status.name }}
            </span>
          </label>
          <span class="status-duration">回合:{{ status.duration }}</span>
          <span class="status-effect">{{ status.effect }}</span>
        </div>

        <div v-if="localStatuses.length === 0" class="empty-tip">
          {{ selectedCharName ? '暂无可用状态' : '请先选择角色' }}
        </div>
      </div>
    </div>

    <div class="section-actions">
      <button class="btn-small" @click="handleAddStatus" :disabled="!hasSelectedStatus || !selectedCharName">
        [A]添加状态
      </button>
      <button class="btn-small" @click="handleClear" :disabled="!hasActiveStatus">
        [C]清空
      </button>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from '@/components/Dialog.vue'

export interface InjectableStatus {
  id: string
  name: string
  duration: number
  effect: string
  active: boolean
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
.selected-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.selected-info .label {
  font-size: 13px;
  color: #909399;
}

.selected-info .value {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.status-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.status-count {
  font-size: 12px;
  color: #909399;
  background: #ebeef5;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 4px;
  margin-bottom: 4px;
  transition: all 0.2s;
}

.status-item:last-child {
  margin-bottom: 0;
}

.status-item:hover {
  background: #f5f7fa;
}

.status-item.active {
  background: #ecf5ff;
  border-left: 3px solid #409eff;
}

.status-item.disabled {
  opacity: 0.6;
}

.status-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex: 1;
}

.status-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.status-name {
  font-size: 14px;
  font-weight: 500;
}

.status-name.positive {
  color: #67c23a;
}

.status-name.negative {
  color: #f56c6c;
}

.status-duration {
  font-size: 12px;
  color: #909399;
  background: #f4f4f5;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.status-effect {
  font-size: 12px;
  color: #606266;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-tip {
  padding: 30px 20px;
  text-align: center;
  color: #909399;
  font-size: 13px;
}

.section-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.btn-small {
  padding: 8px 20px;
  border: 1px solid #409eff;
  background: white;
  color: #409eff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.btn-small:hover:not(:disabled) {
  background: #409eff;
  color: white;
}

.btn-small:disabled {
  border-color: #dcdfe6;
  color: #c0c4cc;
  cursor: not-allowed;
}
</style>
