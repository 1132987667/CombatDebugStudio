<template>
  <header class="module-header bg-crackle">
    <div class="brand">
      <span class="brand-name">太初道枢</span>
    </div>

    <nav class="module-tabs" role="tablist" aria-label="模块导航">
      <button
        v-for="m in MODULES"
        :key="m.id"
        :ref="(el) => setTabRef(m.id, el as HTMLButtonElement | null)"
        :id="moduleTabId(m.id)"
        type="button"
        class="module-tab"
        :class="{ active: activeModule === m.id }"
        role="tab"
        :aria-selected="activeModule === m.id"
        :aria-controls="modulePanelId(m.id)"
        :tabindex="activeModule === m.id ? 0 : -1"
        @click="select(m.id)"
        @keydown="onKeydown"
      >
        {{ m.label }}
      </button>
    </nav>

    <div class="header-actions">
      <!-- NOTE: 各模块的操作按钮由调用方按 activeModule 收敛后经此 slot 注入 -->
      <slot name="actions" />
    </div>
  </header>
</template>

<script lang="ts">
/** 四大模块元数据（顺序与《太初道枢总体设计.md》9.3 一致） */
export const MODULES = [
  { id: 'fengshen', label: '封神榜', subtitle: '数据根源' },
  { id: 'huanling', label: '唤灵台', subtitle: '阵容战斗' },
  { id: 'yanjie', label: '演劫台', subtitle: '游戏模块' },
  { id: 'haotian', label: '昊天镜', subtitle: '战斗分析' },
] as const

export type ModuleId = (typeof MODULES)[number]['id']

/** 模块 Tab 按钮 DOM id（供面板 aria-labelledby 关联，规则与 Tabs.vue 一致） */
export function moduleTabId(id: ModuleId): string {
  return `module-tab-${id}`
}

/** 模块内容面板 DOM id（供 Tab 按钮 aria-controls 关联） */
export function modulePanelId(id: ModuleId): string {
  return `module-panel-${id}`
}
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ activeModule: ModuleId }>()
const emit = defineEmits<{ 'update:activeModule': [id: ModuleId] }>()

const currentMeta = computed(() => MODULES.find((m) => m.id === props.activeModule))

// NOTE: roving tabindex + 方向键导航与 Tabs.vue 保持一致（全项目 tab 交互统一）
const tabRefs = new Map<ModuleId, HTMLButtonElement>()

function setTabRef(id: ModuleId, el: HTMLButtonElement | null) {
  if (el) tabRefs.set(id, el)
  else tabRefs.delete(id)
}

function select(id: ModuleId) {
  if (id === props.activeModule) return
  emit('update:activeModule', id)
}

/** 键盘导航：←/→ 循环，Home/End 跳转，自动激活（与 Tabs.vue 同款） */
function onKeydown(e: KeyboardEvent) {
  const idx = MODULES.findIndex((m) => m.id === props.activeModule)
  let next: ModuleId | undefined
  if (e.key === 'ArrowRight') next = MODULES[(idx + 1) % MODULES.length].id
  else if (e.key === 'ArrowLeft') next = MODULES[(idx - 1 + MODULES.length) % MODULES.length].id
  else if (e.key === 'Home') next = MODULES[0].id
  else if (e.key === 'End') next = MODULES[MODULES.length - 1].id
  else return
  e.preventDefault()
  select(next)
  tabRefs.get(next)?.focus()
}
</script>

<style scoped lang="scss">
/* 顶栏骨架（布局/定位与 _layout.scss 的 main-layout 计算保持 80px 基线） */
.module-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-sticky);
  height: 60px;
  box-sizing: border-box;
  padding: 0 var(--space-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(
    135deg,
    var(--color-bg-tertiary) 0%,
    var(--color-bg-primary) 100%
  );
  border-bottom: 2px solid var(--color-border-default);
}

/* 左侧品牌区 */
.brand {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  min-width: 220px;
}

.brand-name {
  font-size: var(--font-size-xxxl);
  font-weight: var(--font-weight-bold);
  color: var(--color-brand-red);
  letter-spacing: 4px; /* 蓝本：封神榜后台管理Demo.html */
  text-shadow: 0 0 12px rgba(var(--rgb-brand-red), 0.35);
}

/* 中部模块 Tab 导航：绝对居中，与左右侧内容（品牌/操作按钮数量变化）解耦，位置恒定 */
.module-tabs {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  display: flex;
  gap: var(--space-1);
}

.module-tab {
  padding: var(--space-2) var(--space-5);
  border: 1px solid transparent;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
  letter-spacing: 2px;
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background var(--transition-fast),
    border-color var(--transition-fast);

  &:hover:not(.active) {
    color: var(--color-text-secondary);
    background: var(--color-bg-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--color-energy);
    outline-offset: -2px;
  }

  &.active {
    color: var(--color-energy);
    font-weight: var(--font-weight-bold);
    border-color: rgba(var(--rgb-energy), var(--alpha-border));
    border-bottom-color: transparent;
    background: var(--color-bg-primary);
    text-shadow: 0 0 10px rgba(var(--rgb-energy), var(--alpha-glow));
  }
}

/* 右侧操作按钮区（按模块收敛，由 slot 注入） */
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 220px;
  justify-content: flex-end;
}
</style>
