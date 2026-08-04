<!--
 * 文件: ConfirmDialog.vue
 * 创建日期: 2026-07-31
 * 作者: CombatDebugStudio
 * 功能: 二次确认对话框（危险操作）
 * 描述: 基于 Dialog 的轻量确认弹窗；danger 变体用红色确认按钮
 * 用法:
 *   <ConfirmDialog v-model="confirmDelete" title="删除记录" message="确定要删除这条战斗记录吗？"
 *     confirm-text="删除" danger @confirm="doDelete" />
-->

<template>
  <Dialog :model-value="modelValue" :title="title" width="420px" @update:model-value="onUpdate">
    <div class="confirm-message">{{ message }}</div>
    <template #footer>
      <Button @click="cancel">取消</Button>
      <Button :variant="danger ? 'danger' : 'secondary'" @click="confirm">
        {{ confirmText }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'

interface Props {
  modelValue: boolean
  title: string
  message: string
  /** 确认按钮文案，默认 "确认" */
  confirmText?: string
  /** 危险操作：确认按钮用红色强调 */
  danger?: boolean
}

withDefaults(defineProps<Props>(), {
  confirmText: '确认',
  danger: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
}>()

const onUpdate = (value: boolean) => {
  emit('update:modelValue', value)
}

const cancel = () => {
  emit('update:modelValue', false)
}

const confirm = () => {
  try {
    emit('confirm')
  } finally {
    // NOTE: 无论处理函数是否抛错，都关闭弹窗，避免卡死
    emit('update:modelValue', false)
  }
}
</script>

<style scoped>
.confirm-message {
  padding: var(--space-2) var(--space-1);
  line-height: var(--line-height-lg);
  color: var(--color-text-primary);
  white-space: pre-line;
}
</style>
