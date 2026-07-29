<!--
* 文件: Tabs.vue
* 功能: 通用标签页组件
* 描述: 收编 BattleLog / BattleDashboard / CharacterEditor / DebugLogDialog 四处
*       重复的页签头实现（标记 + 样式 + 激活逻辑 + 指示条 + 徽章）。
*       内置滑动指示条、计数徽章弹跳、键盘导航（←/→/Home/End + 禁用跳过）、
*       完整 ARIA tabs 语义。面板默认 v-show 保活（保留滚动位置与组件状态），
*       destroy-inactive 切换为销毁模式。页面通过 --tabs-accent 覆盖激活主题色。
* 版本: 2.0.0
-->
<script lang="ts">
// NOTE: 类型导出必须放在独立 script 块 —— <script setup> 内的 export 需要
// Vue 3.3+ 编译器才稳定，而 package.json 声明的下限是 ^3.2.47。
export interface TabItem {
  /** 页签唯一标识，同时作为内容插槽名 */
  id: string
  /** 显示文本 */
  label: string
  /** 计数徽章（定义即显示，含 0）；数值变化时触发弹跳动画 */
  count?: number
  /** 禁用该页签（点击与键盘导航均跳过） */
  disabled?: boolean
}

/** 模块级实例序号（Vue 3.2 无 useId，用于 ARIA id 关联） */
let instanceSeq = 0
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Props {
  tabs: TabItem[]
  /** 当前激活页签 id（v-model） */
  modelValue: string
  /** md 标准 / sm 紧凑（仅缩小内边距，字号保持 --font-size-md） */
  size?: 'md' | 'sm'
  /** 页签等宽铺满 */
  equalWidth?: boolean
  /** true = 销毁非激活面板（原 v-if 页面）；false = v-show 保活（默认） */
  destroyInactive?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  equalWidth: false,
  destroyInactive: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', id: string): void
  (e: 'change', id: string): void
}>()

const uid = ++instanceSeq
const tabButtonId = (id: string) => `tabs-${uid}-tab-${id}`
const panelId = (id: string) => `tabs-${uid}-panel-${id}`

/** 防御：modelValue 不匹配任何页签时回退到首个可用页签，避免面板全空 */
const activeId = computed(() => {
  if (props.tabs.some((t) => t.id === props.modelValue)) return props.modelValue
  return props.tabs.find((t) => !t.disabled)?.id ?? ''
})

const tabRefs = new Map<string, HTMLButtonElement>()
const headerRef = ref<HTMLElement | null>(null)
const indicatorStyle = ref({ left: '0px', width: '0px', opacity: 0 })

function setTabRef(id: string, el: HTMLButtonElement | null) {
  if (el) tabRefs.set(id, el)
  else tabRefs.delete(id)
}

function select(tab: TabItem) {
  // NOTE: 与 props.modelValue 比较（而非 activeId）——非法 modelValue 回退态下
  // 点击回退页签仍会 emit，使父组件状态自我修复
  if (tab.disabled || tab.id === props.modelValue) return
  emit('update:modelValue', tab.id)
  emit('change', tab.id)
}

/** 键盘导航：roving tabindex + 自动激活，←/→ 循环，Home/End 跳转，跳过禁用项 */
function onKeydown(e: KeyboardEvent) {
  const enabled = props.tabs.filter((t) => !t.disabled)
  if (enabled.length === 0) return
  const idx = enabled.findIndex((t) => t.id === activeId.value)
  let next: TabItem | undefined
  if (e.key === 'ArrowRight') next = enabled[(idx + 1) % enabled.length]
  else if (e.key === 'ArrowLeft') next = enabled[(idx - 1 + enabled.length) % enabled.length]
  else if (e.key === 'Home') next = enabled[0]
  else if (e.key === 'End') next = enabled[enabled.length - 1]
  else return
  e.preventDefault()
  select(next)
  tabRefs.get(next.id)?.focus()
}

function updateIndicator() {
  const el = tabRefs.get(activeId.value)
  if (!el) {
    indicatorStyle.value = { left: '0px', width: '0px', opacity: 0 }
    return
  }
  indicatorStyle.value = {
    left: `${el.offsetLeft}px`,
    width: `${el.offsetWidth}px`,
    opacity: 1,
  }
}

watch([activeId, () => props.tabs], () => nextTick(updateIndicator))

let resizeObserver: ResizeObserver | null = null
const onResize = () => updateIndicator()

onMounted(() => {
  nextTick(updateIndicator)
  window.addEventListener('resize', onResize)
  // NOTE: jsdom 无 ResizeObserver，守卫保证测试环境不崩
  if (typeof ResizeObserver !== 'undefined' && headerRef.value) {
    resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(headerRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
  resizeObserver = null
})

/** 暴露给页面：字体异步加载等布局变化后手动校准指示条 */
defineExpose({ updateIndicator })
</script>

<template>
  <div class="tabs-root" :class="[`tabs-root--${size}`, { 'tabs-root--equal': equalWidth }]">
    <div ref="headerRef" class="tabs-header" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :ref="(el) => setTabRef(tab.id, el as HTMLButtonElement | null)"
        :id="tabButtonId(tab.id)"
        class="tabs-tab"
        :class="{ 'is-active': tab.id === activeId }"
        role="tab"
        :aria-selected="tab.id === activeId"
        :aria-controls="panelId(tab.id)"
        :tabindex="tab.id === activeId ? 0 : -1"
        :disabled="tab.disabled"
        @click="select(tab)"
        @keydown="onKeydown"
      >
        <span class="tabs-tab-label">{{ tab.label }}</span>
        <!-- :key 绑定 count：数值变化时强制重建节点，重触发弹跳动画 -->
        <span v-if="tab.count != null" :key="tab.count" class="tabs-badge">{{ tab.count }}</span>
      </button>
      <span class="tabs-indicator" :style="indicatorStyle" aria-hidden="true"></span>
    </div>

    <div class="tabs-panels">
      <template v-for="tab in tabs" :key="tab.id">
        <!-- v-if 处理销毁模式，v-show 处理保活模式；二者同节点时 v-if 先求值 -->
        <div
          v-if="!destroyInactive || tab.id === activeId"
          v-show="tab.id === activeId"
          :id="panelId(tab.id)"
          class="tabs-panel"
          role="tabpanel"
          :aria-labelledby="tabButtonId(tab.id)"
        >
          <slot :name="tab.id" :tab="tab" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tabs-root {
  /* 页面可覆盖的主题变量 —— 保留各页签既有的视觉身份 */
  --tabs-accent: var(--color-info);
  --tabs-accent-glow: rgba(var(--rgb-info), var(--alpha-glow));

  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ====== 页签头：分层背景 + 底部描边，指示条悬浮其上 ====== */
.tabs-header {
  position: relative;
  display: flex;
  background:
    linear-gradient(180deg, rgba(var(--rgb-white), var(--alpha-tint)) 0%, transparent 100%),
    var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border-default);
  flex-shrink: 0;
}

.tabs-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: transparent;
  border: none;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md); /* AGENTS.md 红线：文本不低于 --font-size-md */
  font-weight: var(--font-weight-medium);
  font-family: inherit;
  line-height: var(--line-height-md);
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast);

  &:hover:not(:disabled) {
    color: var(--color-text-primary);
    background: var(--color-bg-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--tabs-accent);
    outline-offset: -2px;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.is-active {
    color: var(--tabs-accent);
    font-weight: var(--font-weight-bold);
    text-shadow: 0 0 8px var(--tabs-accent-glow);
  }
}

.tabs-root--sm .tabs-tab {
  padding: var(--space-1) var(--space-3);
}

.tabs-root--equal .tabs-tab {
  flex: 1;
}

/* ====== 计数徽章 ====== */
.tabs-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: var(--color-border-default);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xxs);
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-mono);
  transition: background-color var(--transition-fast), color var(--transition-fast),
    box-shadow var(--transition-fast);

  .is-active & {
    background: var(--tabs-accent);
    color: var(--color-bg-secondary);
    box-shadow: 0 0 6px var(--tabs-accent-glow);
  }
}

/* 徽章弹跳：尊重系统减动效设置 */
@media (prefers-reduced-motion: no-preference) {
  .tabs-badge {
    animation: tabs-badge-pop 0.2s ease-out;
  }

  .tabs-indicator {
    transition:
      left 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      opacity var(--transition-fast);
  }
}

@keyframes tabs-badge-pop {
  0% {
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}

/* ====== 滑动指示条：2px 霓虹底线，压住 header 底边 ====== */
.tabs-indicator {
  position: absolute;
  bottom: -1px;
  height: 2px;
  border-radius: var(--radius-full);
  background: var(--tabs-accent);
  box-shadow: 0 0 8px var(--tabs-accent-glow);
  pointer-events: none;
}

/* ====== 面板：flex 列布局，让日志/列表类内容自然撑满 ====== */
.tabs-panels {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tabs-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
