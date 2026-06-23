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
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-container {
  background: #1a1a2e;
  border: 2px solid #0f3460;
  border-radius: 8px;
  box-shadow: 0 0 20px rgba(79, 195, 247, 0.3);
  overflow: hidden;
  max-width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  padding: 15px 20px;
  background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
  border-bottom: 2px solid #0f3460;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-title {
  font-size: 16px;
  font-weight: bold;
  color: #4fc3f7;
  text-shadow: 0 0 5px rgba(79, 195, 247, 0.5);
}

.dialog-close {
  background: none;
  border: 2px solid #4fc3f7;
  font-size: 18px;
  cursor: pointer;
  color: #4fc3f7;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.3s;
}

.dialog-close:hover {
  background: #4fc3f7;
  color: #1a1a2e;
  transform: scale(1.1);
}

.dialog-content {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
  background: #0f0f1a;
  color: #eee;
}

/* 确保弹窗内的表单元素样式与应用程序一致 */
.dialog-content input[type="checkbox"] {
  accent-color: #4fc3f7;
}

.dialog-content input[type="text"],
.dialog-content input[type="number"],
.dialog-content select {
  background: #0f0f1a;
  border: 1px solid #0f3460;
  color: #fff;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border-radius: 3px;
}

.dialog-content input[type="text"]:focus,
.dialog-content input[type="number"]:focus,
.dialog-content select:focus {
  outline: none;
  border-color: #4fc3f7;
  box-shadow: 0 0 0 2px rgba(79, 195, 247, 0.2);
}

.dialog-content button {
  background: #0f3460;
  color: #4fc3f7;
  border: 1px solid #1a4a7a;
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 3px;
}

.dialog-content button:hover {
  background: #1a4a7a;
}

.dialog-content button.active {
  background: #e94560;
  color: #fff;
}

.dialog-footer {
  padding: 10px 20px;
  background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
  border-top: 2px solid #0f3460;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

/* 过渡动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>