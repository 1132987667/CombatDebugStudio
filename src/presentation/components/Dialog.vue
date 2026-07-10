<!--
 * 文件: Dialog.vue
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 对话框组件
 * 描述: 提供模态对话框功能，支持标题、内容插槽和底部操作区域
 * 版本: 1.0.0
-->

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="modelValue" class="dialog-overlay" @click.self="close">
        <div class="dialog-container" :style="{ width: width }">
          <div class="dialog-header">
            <span class="dialog-title">{{ title }}</span>
            <button class="dialog-close" @click="close">×</button>
          </div>
          <div class="dialog-content">
            <slot></slot>
          </div>
          <div v-if="$slots.footer" class="dialog-footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { watch } from "vue";

interface Props {
  modelValue: boolean;
  title: string;
  width?: string;
}

const props = withDefaults(defineProps<Props>(), {
  width: "500px",
});

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "close"): void;
}>();

const close = () => {
  emit("update:modelValue", false);
  emit("close");
};

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      window.document.body.style.overflow = "hidden";
    } else {
      window.document.body.style.overflow = "";
    }
  }
);
</script>

<style scoped>
.dialog-title {
  text-shadow: 0 0 5px rgba(79, 195, 247, 0.5);
}

.dialog-close {
  border: 2px solid var(--color-info);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: var(--transition-base);
  color: var(--color-info);
}

.dialog-close:hover {
  background: var(--color-info);
  color: var(--color-bg-primary);
  transform: scale(1.1);
}

.dialog-content {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

/* 确保弹窗内的表单元素样式与应用程序一致 */
.dialog-content input[type="checkbox"] {
  accent-color: var(--color-info);
}

.dialog-content input[type="text"],
.dialog-content input[type="number"],
.dialog-content select {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.dialog-content input[type="text"]:focus,
.dialog-content input[type="number"]:focus,
.dialog-content select:focus {
  outline: none;
  border-color: var(--color-info);
  box-shadow: 0 0 0 2px rgba(79, 195, 247, 0.2);
}

.dialog-content button {
  background: var(--color-border-default);
  color: var(--color-info);
  border: 1px solid var(--color-border-strong);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  transition: var(--transition-fast);
  border-radius: var(--radius-sm);
}

.dialog-content button:hover {
  background: var(--color-border-strong);
}

.dialog-content button.active {
  background: var(--color-brand-red);
  color: var(--color-text-primary);
}

.dialog-footer {
  padding: var(--space-2) var(--space-5);
  background: linear-gradient(135deg, var(--color-bg-tertiary) 0%, var(--color-border-default) 100%);
  border-top: 2px solid var(--color-border-default);
  align-items: center;
  gap: var(--space-2);
}

/* 过渡动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity var(--transition-base), transform var(--transition-base);
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>