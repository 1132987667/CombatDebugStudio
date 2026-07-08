<!--
 * 文件: SceneManagementDialog.vue
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 场景管理对话框
 * 描述: 负责场景渲染配置、环境交互设置和场景状态管理
 * 版本: 1.0.0
-->

<template>
  <Dialog :model-value="modelValue" @update:model-value="handleModelValueChange" title="场景管理" width="450px">
    <div class="scene-section">
      <div class="section-header">
        <span class="section-title">保存场景</span>
      </div>
      <div class="scene-actions">
        <input type="text" v-model="localSceneName" placeholder="测试场景名称" class="scene-input"
          @keydown.enter="handleSave">
        <button class="btn-medium" @click="handleSave" :disabled="!localSceneName.trim()">[S]保存</button>
      </div>
    </div>

    <div class="scene-section">
      <div class="section-header">
        <span class="section-title">加载/删除场景</span>
      </div>
      <div class="scene-actions">
        <select v-model="localSelectedScene" class="scene-select" :disabled="savedScenes.length === 0">
          <option value="">选择场景...</option>
          <option v-for="scene in savedScenes" :key="scene" :value="scene">{{ scene }}</option>
        </select>
        <button class="btn-medium" @click="handleLoad" :disabled="!localSelectedScene">[L]加载</button>
        <button class="btn-medium btn-danger" @click="handleDelete" :disabled="!localSelectedScene">[D]删除</button>
      </div>
    </div>

    <div v-if="savedScenes.length === 0" class="empty-tip">
      暂保存的场景，点击保存按钮创建新场景
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'

interface Props {
  modelValue: boolean
  sceneName: string
  selectedScene: string
  savedScenes: string[]
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:sceneName', value: string): void
  (e: 'update:selectedScene', value: string): void
  (e: 'save', sceneName: string): void
  (e: 'load', sceneName: string): void
  (e: 'delete', sceneName: string): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  sceneName: '',
  selectedScene: '',
  savedScenes: () => []
})

const emit = defineEmits<Emits>()

const localSceneName = ref(props.sceneName)
const localSelectedScene = ref(props.selectedScene)

const handleModelValueChange = (value: boolean) => {
  emit('update:modelValue', value)
}

watch(() => props.sceneName, (newVal) => {
  localSceneName.value = newVal
})

watch(() => props.selectedScene, (newVal) => {
  localSelectedScene.value = newVal
})

watch(localSceneName, (newVal) => {
  emit('update:sceneName', newVal)
})

watch(localSelectedScene, (newVal) => {
  emit('update:selectedScene', newVal)
})

const handleSave = () => {
  if (localSceneName.value.trim()) {
    emit('save', localSceneName.value.trim())
    localSceneName.value = ''
  }
}

const handleLoad = () => {
  if (localSelectedScene.value) {
    emit('load', localSelectedScene.value)
  }
}

const handleDelete = () => {
  if (localSelectedScene.value) {
    emit('delete', localSelectedScene.value)
    localSelectedScene.value = ''
  }
}
</script>

<style scoped>
.scene-section {
  margin-bottom: var(--space-5);
}

.scene-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.scene-input {
  flex: 1;
}

.scene-select {
  flex: 1;
}

.scene-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-tip {
  padding: var(--space-5);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  border: 1px dashed var(--color-border-strong);
}
</style>
