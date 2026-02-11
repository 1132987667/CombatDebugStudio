<template>
  <div class="control-bar">
    <!-- 自动战斗状态指示器 -->
    <div v-if="isAutoPlaying" class="auto-battle-indicator">
      <span class="auto-indicator-icon">⚡</span>
      <span class="auto-indicator-text">自动战斗中</span>
      <span class="auto-indicator-speed">x{{ battleSpeed }}</span>
    </div>
    
    <div class="control-group">
      <button class="control-btn" @click="$emit('start-battle')" :disabled="isBattleActive">开始战斗</button>
      <button class="control-btn" @click="$emit('end-battle')" :disabled="!isBattleActive">结束战斗</button>
      <button class="control-btn" @click="$emit('reset-battle')"
        :disabled="!isBattleActive && autoPlayMode !== 'off'">重置战斗</button>
      <button class="control-btn" @click="$emit('step-back')" :disabled="!isBattleActive">回退1回合</button>
      <button class="control-btn" @click="$emit('toggle-pause')" :disabled="!isBattleActive">{{ isPaused ? '继 续' :
        '暂 停' }}</button>
      <button class="control-btn" @click="$emit('single-step')" :disabled="!isBattleActive">单步执行</button>

      <!-- 自动播放模式单选按钮组 -->
      <RadioButtonGroup v-model="autoPlayMode" :options="autoPlayOptions" :disabled="!isBattleActive"
        @update:modelValue="handleAutoPlayModeChange" />

      <!-- 战斗速度控制按钮 -->
      <button class="control-btn speed-control-btn" @click="toggleBattleSpeed" :disabled="!isBattleActive">
        <span class="speed-icon">⚡</span>
        <span class="speed-text">战斗速度 x{{ battleSpeed }}</span>
      </button>
    </div>
    <div class="control-group right">
      <button class="control-btn" @click="$emit('exit-tool')">[Q] 退出工具</button>
      <button class="control-btn" @click="$emit('show-help')">[H] 帮助文档</button>
      <span class="mode-indicator">当前模式: 调试模式 | 战斗状态: {{ battleStateDisplay }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import RadioButtonGroup from "@/components/RadioButtonGroup.vue";

const props = defineProps<{
  isBattleActive: boolean;
  isPaused: boolean;
  isAutoPlaying: boolean;
}>();

const emit = defineEmits<{
  "start-battle": [];
  "end-battle": [];
  "reset-battle": [];
  "step-back": [];
  "toggle-pause": [];
  "single-step": [];
  "toggle-auto-play": [];
  "battle-speed-change": [speed: number];
  "exit-tool": [];
  "show-help": [];
}>();

// 自动播放模式状态 - 默认开启自动战斗
const autoPlayMode = ref<'off' | 'auto' | 'fast'>('auto');

// 自动播放选项配置
const autoPlayOptions = [
  { value: 'off', label: '手动' },
  { value: 'auto', label: '自动' },
];

// 监听自动播放模式变化
const handleAutoPlayModeChange = (mode: string) => {
  if (mode === 'off') {
    // 停止自动播放
    if (props.isAutoPlaying) {
      emit('toggle-auto-play');
    }
  } else {
    // 开始自动播放
    if (!props.isAutoPlaying) {
      emit('toggle-auto-play');
    }

    // 如果是快速模式，可以设置不同的播放速度
    if (mode === 'fast') {
      // 这里可以添加快速模式的速度设置逻辑
      console.log('快速自动播放模式已激活');
    }
  }
};

// 战斗速度控制
const battleSpeed = ref(1);
const speedLevels = [1, 2, 3]; // 支持1倍、2倍、3倍三个速度档位

// 切换战斗速度
const toggleBattleSpeed = () => {
  const currentIndex = speedLevels.indexOf(battleSpeed.value);
  const nextIndex = (currentIndex + 1) % speedLevels.length;
  battleSpeed.value = speedLevels[nextIndex];

  // 发射速度变化事件
  emit('battle-speed-change', battleSpeed.value);
};

// 监听外部自动播放状态变化，同步单选按钮状态
watch(() => props.isAutoPlaying, (newValue) => {
  if (newValue && autoPlayMode.value === 'off') {
    autoPlayMode.value = 'auto';
  } else if (!newValue && autoPlayMode.value !== 'off') {
    autoPlayMode.value = 'off';
  }
});

const battleStateDisplay = computed(() => {
  if (autoPlayMode.value === 'fast') return "快速播放";
  if (autoPlayMode.value === 'auto') return "自动播放";
  if (!props.isPaused) return "进行中";
  return "暂停";
});
</script>

<style scoped>
@use'@/styles/main.scss';

.auto-battle-indicator {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.2), rgba(59, 130, 246, 0.2));
  border: 1px solid rgba(34, 211, 238, 0.5);
  border-radius: 20px;
  animation: pulse-glow 2s ease-in-out infinite;
  z-index: 100;
}

.auto-indicator-icon {
  font-size: 18px;
  animation: spin 1s linear infinite;
}

.auto-indicator-text {
  color: #22d3ee;
  font-weight: 600;
  font-size: 14px;
  text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
}

.auto-indicator-speed {
  background: rgba(34, 211, 238, 0.3);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  color: #22d3ee;
}

@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 5px rgba(34, 211, 238, 0.3);
  }
  50% {
    box-shadow: 0 0 20px rgba(34, 211, 238, 0.6);
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>