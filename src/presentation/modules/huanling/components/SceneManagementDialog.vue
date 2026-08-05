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
        <TacticalInput size="md" :model-value="localSceneName" placeholder="测试场景名称" aria-label="测试场景名称"
          @keydown.enter="handleSave" @update:model-value="localSceneName = String($event ?? '')" />
        <Button @click="handleSave" :disabled="!localSceneName.trim()">[S]保存</Button>
      </div>
    </div>

    <div class="scene-section">
      <div class="section-header">
        <span class="section-title">加载/删除场景</span>
      </div>
      <div class="scene-actions">
        <TacticalSelect v-model="localSelectedScene" size="md" class="scene-select-slot"
          :options="sceneOptions" :disabled="savedScenes.length === 0" />
        <Button @click="handleLoad" :disabled="!localSelectedScene">[L]加载</Button>
        <Button variant="danger" @click="confirmDelete = true" :disabled="!localSelectedScene">[D]删除</Button>
      </div>
    </div>

    <div v-if="savedScenes.length === 0" class="empty-tip">
      暂保存的场景，点击保存按钮创建新场景
    </div>
  </Dialog>

  <!-- 删除场景二次确认 -->
  <ConfirmDialog v-model="confirmDelete" title="删除场景"
    :message="`确定要删除场景「${localSelectedScene}」吗？删除后不可恢复。`"
    confirm-text="删除" danger @confirm="doDelete" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import ConfirmDialog from '@/presentation/components/ConfirmDialog.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'

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

const sceneOptions = computed<TSelectOption[]>(() => [
  { value: '', label: '选择场景...' },
  ...props.savedScenes.map((s) => ({ value: s, label: s })),
])

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

// 删除场景（二次确认后执行）
const confirmDelete = ref(false)

const doDelete = () => {
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

/* TacticalInput 根默认 width:100%，场景行内给弹性宽度 */
.scene-actions .t-input {
  flex: 1;
}

.scene-select-slot {
  flex: 1;
}

.empty-tip {
  padding: var(--space-5);
  text-align: center;
  color: var(--color-text-tertiary);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  border: 1px dashed var(--color-border-tertiary);
}
</style>
