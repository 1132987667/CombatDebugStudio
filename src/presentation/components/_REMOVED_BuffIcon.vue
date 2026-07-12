<template>
  <div class="buff-icon" :class="{ 'buff': !isDebuff, 'debuff': isDebuff }" ref="iconRef" @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave">
    <div class="icon-container">
      <img :src="iconUrl" :alt="buffName" class="icon" v-if="iconUrl">
      <div class="icon-placeholder" v-else>
        {{ buffName.charAt(0) }}
      </div>
      <div class="duration" v-if="remainingTurns > 0">
        {{ remainingTurns }}
      </div>
    </div>

    <!-- 悬停提示 — ponytail: Teleport 到 body 避免被父容器 overflow:hidden 裁剪 -->
    <Teleport to="body">
      <div class="buff-tooltip" v-if="showTooltip" :style="tooltipStyle">
        <div class="tooltip-header">
          <span class="tooltip-name">{{ buffName }}</span>
          <span class="tooltip-type">{{ isDebuff ? '减益' : '增益' }}</span>
        </div>
        <div class="tooltip-description">{{ description }}</div>
        <!-- 特殊效果行（DOT/HOT/护盾等） -->
        <div v-if="effectLines && effectLines.length > 0" class="tooltip-effects">
          <div v-for="(el, i) in effectLines" :key="i" class="tooltip-effect-line" :class="'effect--' + el.kind">
            ● {{ el.text }}
          </div>
        </div>
        <div class="tooltip-stats">
          <div class="tooltip-stat">
            <span class="stat-label">剩余回合：</span>
            <span class="stat-value">{{ remainingTurns > 0 ? remainingTurns : '永久' }}</span>
          </div>
          <div class="tooltip-stat" v-if="currentStacks > 1">
            <span class="stat-label">叠加层数：</span>
            <span class="stat-value">×{{ currentStacks }}</span>
          </div>
          <div class="tooltip-stat" v-if="conditionState === 'active'">
            <span class="stat-label">状态：</span>
            <span class="stat-value stat-active">已激活</span>
          </div>
          <div class="tooltip-stat" v-if="conditionState === 'inactive'">
            <span class="stat-label">状态：</span>
            <span class="stat-value stat-inactive">未激活</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { BuffEffectLine } from '@/domain/buff/types'

// Props
const props = defineProps<{
  buffId: string
  buffName: string
  description: string
  remainingTurns: number
  currentStacks: number
  isDebuff: boolean
  iconPath?: string
  effectLines?: BuffEffectLine[]
  conditionState?: 'active' | 'inactive'
}>()

// 响应式数据
const showTooltip = ref(false)
const iconRef = ref<HTMLElement | null>(null)

// ponytail: 计算 tooltip 位置（相对视口），配合 Teleport to="body" 避免被父容器 overflow:hidden 裁剪
const tooltipStyle = computed(() => {
  if (!showTooltip.value || !iconRef.value) return {}
  const rect = iconRef.value.getBoundingClientRect()
  return {
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top}px`,
  }
})

function onMouseEnter() {
  showTooltip.value = true
}

function onMouseLeave() {
  showTooltip.value = false
}

// 计算属性
const iconUrl = computed(() => {
  if (props.iconPath) {
    return props.iconPath
  }
  // 默认图标 - 使用文本转图片API
  const prompt = props.isDebuff
    ? `dark red debuff icon, ${props.buffName}, simple flat design, transparent background`
    : `bright blue buff icon, ${props.buffName}, simple flat design, transparent background`
  return `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=square`
})

</script>

<style scoped>
.buff-icon {
  position: relative;
  display: inline-block;
  margin: 0 var(--space-1);
  cursor: pointer;
  transition: transform var(--transition-fast) ease;
}

.buff-icon:hover {
  transform: scale(1.1);
}

.icon-container {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-xxl);
  font-weight: var(--font-weight-bold);
  color: white;
}

.buff .icon-placeholder {
  background: var(--color-info);
}

.debuff .icon-placeholder {
  background: linear-gradient(135deg, var(--color-warning), var(--color-danger));
}

.duration {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  font-weight: var(--font-weight-bold);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  min-width: 16px;
  text-align: center;
}

/* 悬停提示 — ponytail: position:fixed + Teleport 避免被父容器 overflow:hidden 裁剪 */
.buff-tooltip {
  position: fixed;
  transform: translate(-50%, -100%);
  margin-top: -8px;
  background: rgba(17, 24, 39, 0.95);
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  width: 200px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 10000;
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.buff-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 6px;
  border-style: solid;
  border-color: rgba(17, 24, 39, 0.95) transparent transparent transparent;
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.tooltip-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: rgba(255, 255, 255, 0.85);
}

.tooltip-type {
  padding: var(--space-1);
  border-radius: var(--radius-lg);
  background: rgba(96, 165, 250, 0.2);
  color: var(--color-info);
}

.debuff .tooltip-type {
  background: rgba(249, 115, 22, 0.2);
  color: var(--color-warning);
}

.tooltip-description {
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: var(--space-2);
  line-height: var(--line-height-sm);
}

/* 特殊效果行 */
.tooltip-effects {
  margin-bottom: var(--space-2);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: var(--space-1);
}

.tooltip-effect-line {
  font-size: var(--font-size-xs);
  line-height: var(--line-height-lg);
  padding-left: var(--space-2);
}

.effect--dot { color: var(--color-danger); }
.effect--hot { color: #4ade80; }
.effect--shield { color: var(--color-info); }
.effect--vampire, .effect--thorns { color: var(--color-warning); }

.tooltip-stat {
  margin-bottom: var(--space-1);
  display: flex;
  justify-content: space-between;
}

.stat-active { color: var(--color-energy); font-weight: var(--font-weight-semibold); }
.stat-inactive { color: var(--color-text-disabled); }

.stat-label {
  color: rgba(255, 255, 255, 0.6);
}

.stat-value {
  color: rgba(255, 255, 255, 0.85);
  font-weight: var(--font-weight-medium);
}
</style>