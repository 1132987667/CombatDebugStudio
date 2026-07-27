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
      <div v-if="modelValue" class="dialog-overlay" :class="{ 'dialog-overlay--transparent': !showMask }"
        @click.self="onOverlayClick">
        <div class="dialog-container" :style="{ width: width, height: height }">
          <div class="dialog-header">
            <span class="dialog-title">{{ title }}</span>
            <div class="dialog-header-actions">
              <slot name="header-actions"></slot>
              <button class="dialog-close" @click="close">×</button>
            </div>
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
  height?: string;
  /** 是否显示遮罩背景，默认 true */
  showMask?: boolean;
  /** 点击遮罩时是否关闭弹窗，默认 true。设为 false 时点击遮罩不关闭 */
  maskClosable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  width: "500px",
  showMask: true,
  maskClosable: true,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "close"): void;
}>();

const close = () => {
  emit("update:modelValue", false);
  emit("close");
};

/** 点击遮罩时根据 maskClosable 决定是否关闭 */
const onOverlayClick = () => {
  if (props.maskClosable) {
    close()
  }
}

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
.dialog-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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
  box-shadow: 0 0 0 2px var(--color-info-bg);
}

.dialog-content button {
  background: var(--color-border-default);
  color: var(--color-info);
  border: 1px solid var(--color-border-tertiary);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  transition: var(--transition-fast);
  border-radius: var(--radius-sm);
}

.dialog-content button:hover {
  background: var(--color-border-tertiary);
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

/* 透明遮罩：背景完全透明，且不拦截点击事件（点击穿透到背后的元素） */
.dialog-overlay--transparent {
  background: transparent !important;
  pointer-events: none;
}

/* 弹窗容器自身保持可点击 */
.dialog-overlay--transparent .dialog-container {
  pointer-events: auto;
}
</style>