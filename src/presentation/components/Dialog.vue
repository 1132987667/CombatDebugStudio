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
      <div v-if="modelValue" ref="overlayRef" class="dialog-overlay"
        :class="{
          'dialog-overlay--transparent': !showMask,
          'dialog-overlay--placement-right': placement === 'right',
        }"
        role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @click.self="onOverlayClick">
        <div class="dialog-container" ref="containerRef" :style="{ width: width, height: height }">
          <div class="dialog-header">
              <span class="dialog-title">{{ title }}</span>
              <div class="dialog-header-actions flex items-center gap-2">
              <slot name="header-actions"></slot>
              <button type="button" class="dialog-header-btn dialog-header-btn--drag" aria-label="拖动弹窗" title="拖动弹窗"
                @mousedown.prevent="startDrag">
                <span class="dialog-header-btn__icon" aria-hidden="true" v-html="dragIcon"></span>
              </button>
              <button type="button" class="dialog-header-btn dialog-header-btn--close" aria-label="关闭弹窗" @click="close">
                <span class="dialog-header-btn__icon" aria-hidden="true" v-html="closeIcon"></span>
              </button>
            </div>
          </div>
          <div class="dialog-content" :class="contentClass">
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

<script lang="ts">
// NOTE: 模块级弹窗打开栈——多个 Dialog 实例（嵌套弹窗）共享，
// 保证只有最顶层的弹窗响应 ESC/Tab，body 滚动锁按引用计数管理
const openDialogKeys: symbol[] = [];
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import dragIconRaw from "@/presentation/assets/icons/drag.svg?raw";
import closeIconRaw from "@/presentation/assets/icons/close.svg?raw";

// drag.svg 自带 XML 声明与 DOCTYPE，仅保留 <svg> 部分，避免 v-html 插入非法文档头
const dragIcon = dragIconRaw.replace(/^[\s\S]*?(<svg[\s\S]*<\/svg>)/, "$1");
const closeIcon = closeIconRaw.replace(/^[\s\S]*?(<svg[\s\S]*<\/svg>)/, "$1");

interface Props {
  modelValue: boolean;
  title: string;
  width?: string;
  height?: string;
  /** 是否显示遮罩背景，默认 true */
  showMask?: boolean;
  /** 点击遮罩时是否关闭弹窗，默认 true。设为 false 时点击遮罩不关闭 */
  maskClosable?: boolean;
  /** 按 ESC 时是否关闭弹窗，默认 true。编辑类弹窗（未保存内容）应设为 false */
  escClosable?: boolean;
  /** 追加到内容区（.dialog-content）的类名，用于覆写默认内边距/滚动布局（如分栏图鉴） */
  contentClass?: string;
  /** 停靠位置：'center' 居中弹窗（默认），'right' 右缘停靠（如调试面板） */
  placement?: "center" | "right";
}

const props = withDefaults(defineProps<Props>(), {
  width: "60vw",
  showMask: true,
  maskClosable: true,
  escClosable: true,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "close"): void;
}>();

const close = () => {
  emit("update:modelValue", false);
  emit("close");
};

/* ═══ 拖拽：按住标题栏拖拽按钮移动弹窗 ═══
   用 transform: translate 平移容器——overlay 仍负责居中定位，拖拽只是相对位移，
   不影响打开/关闭过渡动画（过渡作用于 overlay 整体）。 */
const containerRef = ref<HTMLElement | null>(null);
let dragStartX = 0;
let dragStartY = 0;
let offsetX = 0;
let offsetY = 0;
let dragging = false;

const startDrag = (e: MouseEvent) => {
  // 仅左键拖拽；右键/中键不拦截
  if (e.button !== 0) return;
  dragging = true;
  dragStartX = e.clientX - offsetX;
  dragStartY = e.clientY - offsetY;
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
};

const onDragMove = (e: MouseEvent) => {
  if (!dragging) return;
  offsetX = e.clientX - dragStartX;
  offsetY = e.clientY - dragStartY;
  const el = containerRef.value;
  if (el) {
    el.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  }
};

const onDragEnd = () => {
  dragging = false;
  window.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", onDragEnd);
};

/* ═══ 无障碍：ESC 关闭 + Tab 焦点陷阱 + 打开聚焦/关闭还原 ═══
   嵌套弹窗（如确认弹窗叠在对话框上）：只有栈顶实例响应 ESC/Tab */
const overlayRef = ref<HTMLElement | null>(null);
const instanceKey = Symbol("dialog");
let isOpen = false;
let lastFocused: HTMLElement | null = null;

const getFocusable = (): HTMLElement[] => {
  const el = overlayRef.value;
  if (!el) return [];
  return Array.from(
    el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((node) => !node.hasAttribute("disabled"));
};

const handleKeydown = (e: KeyboardEvent) => {
  // 非最顶层弹窗不响应（嵌套时 ESC 只关最上层）
  if (!isOpen || openDialogKeys[openDialogKeys.length - 1] !== instanceKey) return;
  if (e.key === "Escape") {
    // 编辑类弹窗（escClosable=false）不响应 ESC，避免误触丢未保存内容
    if (props.escClosable) close();
    return;
  }
  // Tab 焦点陷阱：焦点在弹窗内循环，不逃逸到背景页面
  if (e.key === "Tab") {
    const focusables = getFocusable();
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
};

/** 点击遮罩时根据 maskClosable 决定是否关闭 */
const onOverlayClick = () => {
  if (props.maskClosable) {
    close()
  }
}

const releaseOverflow = () => {
  if (openDialogKeys.length === 0) {
    window.document.body.style.overflow = "";
  }
};

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      isOpen = true;
      if (openDialogKeys.length === 0) {
        window.document.body.style.overflow = "hidden";
      }
      openDialogKeys.push(instanceKey);
      lastFocused = document.activeElement as HTMLElement | null;
      window.addEventListener("keydown", handleKeydown);
      nextTick(() => {
        // 聚焦 overlay 本体（tabindex=-1），Tab 首击落到弹窗内第一个控件，不误触 × 按钮
        overlayRef.value?.focus();
      });
    } else {
      isOpen = false;
      window.removeEventListener("keydown", handleKeydown);
      const idx = openDialogKeys.indexOf(instanceKey);
      if (idx !== -1) openDialogKeys.splice(idx, 1);
      releaseOverflow();
      lastFocused?.focus?.();
      lastFocused = null;
    }
  },
  { immediate: true } // 以 modelValue=true 初始挂载时也注册 ESC/焦点/滚动锁
);

onBeforeUnmount(() => {
  // 卸载兜底：若弹窗仍开着（父级 v-if 移除），清理监听与滚动锁
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("mousemove", onDragMove);
  window.removeEventListener("mouseup", onDragEnd);
  const idx = openDialogKeys.indexOf(instanceKey);
  if (idx !== -1) {
    openDialogKeys.splice(idx, 1);
    releaseOverflow();
  }
});
</script>

<style scoped>

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
.dialog-fade-enter-active {
  transition: opacity var(--transition-base), transform var(--transition-base);
}

/* NOTE: 退出比进入快（退出 ≈ 进入的 60-70%） */
.dialog-fade-leave-active {
  transition: opacity var(--transition-fast), transform var(--transition-fast);
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
  box-shadow: var(--shadow-layered);
}
</style>