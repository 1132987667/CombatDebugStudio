<template>
  <div 
    class="buff-icon" 
    :class="{ 'buff': !isDebuff, 'debuff': isDebuff }"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <div class="icon-container">
      <img 
        :src="iconUrl" 
        :alt="buffName" 
        class="icon"
        v-if="iconUrl"
      >
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
  margin: 0 4px;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.buff-icon:hover {
  transform: scale(1.1);
}

.icon-container {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 8px;
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
  font-size: 20px;
  font-weight: bold;
  color: white;
}

.buff .icon-placeholder {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
}

.debuff .icon-placeholder {
  background: linear-gradient(135deg, #f97316, #ef4444);
}

.duration {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  font-size: 12px;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 4px;
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
  border-radius: 8px;
  padding: 12px;
  width: 200px;
  margin-bottom: 8px;
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
  margin-bottom: 8px;
}

.tooltip-name {
  font-size: 14px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.85);
}

.tooltip-type {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgba(96, 165, 250, 0.2);
  color: #60a5fa;
}

.debuff .tooltip-type {
  background: rgba(249, 115, 22, 0.2);
  color: #f97316;
}

.tooltip-description {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
  line-height: 1.4;
}

.tooltip-stats {
  font-size: 11px;
}

.tooltip-stat {
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
}

.stat-label {
  color: rgba(255, 255, 255, 0.6);
}

.stat-value {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}
</style>