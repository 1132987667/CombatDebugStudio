<template>
  <div class="buff-icon" :class="{ 'buff': !isDebuff, 'debuff': isDebuff }" @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false">
    <div class="icon-container">
      <img :src="iconUrl" :alt="buffName" class="icon" v-if="iconUrl">
      <div class="icon-placeholder" v-else>
        {{ buffName.charAt(0) }}
      </div>
      <div class="duration" v-if="remainingTurns > 0">
        {{ remainingTurns }}
      </div>
    </div>

    <!-- 悬停提示 -->
    <div class="buff-tooltip" v-if="showTooltip">
      <div class="tooltip-header">
        <span class="tooltip-name">{{ buffName }}</span>
        <span class="tooltip-type">{{ isDebuff ? '减益' : '增益' }}</span>
      </div>
      <div class="tooltip-description">{{ description }}</div>
      <div class="tooltip-stats">
        <div class="tooltip-stat">
          <span class="stat-label">剩余回合：</span>
          <span class="stat-value">{{ remainingTurns }}</span>
        </div>
        <div class="tooltip-stat" v-if="currentStacks > 1">
          <span class="stat-label">叠加层数：</span>
          <span class="stat-value">{{ currentStacks }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// Props
const props = defineProps<{
  buffId: string
  buffName: string
  description: string
  remainingTurns: number
  currentStacks: number
  isDebuff: boolean
  iconPath?: string
}>()

// 响应式数据
const showTooltip = ref(false)

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

// 引入计算属性
import { computed } from 'vue'
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
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  min-width: 16px;
  text-align: center;
}

/* 悬停提示 */
.buff-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(17, 24, 39, 0.95);
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  width: 200px;
  margin-bottom: var(--space-2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  backdrop-filter: blur(8px);
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
  font-size: var(--font-size-xs);
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
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: var(--space-2);
  line-height: var(--line-height-sm);
}

.tooltip-stat {
  margin-bottom: var(--space-1);
  display: flex;
  justify-content: space-between;
}

.stat-label {
  color: rgba(255, 255, 255, 0.6);
}

.stat-value {
  color: rgba(255, 255, 255, 0.85);
  font-weight: var(--font-weight-medium);
}
</style>