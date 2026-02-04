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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  max-width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  padding: 15px 20px;
  background: #f5f5f5;
  border-bottom: 1px solid #eaeaea;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-title {
  font-size: 16px;
  font-weight: bold;
  color: #303133;
}

.dialog-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #909399;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.3s;
}

.dialog-close:hover {
  background: #ecf5ff;
  color: #409eff;
}

.dialog-content {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.dialog-footer {
  padding: 10px 20px;
  background: #f5f5f5;
  border-top: 1px solid #eaeaea;
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