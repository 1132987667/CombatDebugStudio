<template>
  <div class="control-bar">
    <!-- 自动战斗状态指示器 -->
    <div v-if="isAutoPlaying" class="auto-battle-indicator">
      <span class="auto-indicator-icon">⚡</span>
      <span class="auto-indicator-text">自动战斗中</span>
      <span class="auto-indicator-speed">x{{ props.battleSpeed ?? 1 }}</span>
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
      <RadioButtonGroup :model-value="autoPlayMode" :options="autoPlayOptions" :disabled="!isBattleActive"
        @update:model-value="handleAutoPlayModeChange" />

      <!-- 战斗速度控制按钮 -->
      <button class="control-btn speed-control-btn" @click="toggleBattleSpeed">
        <span class="speed-icon">⚡</span>
        <span class="speed-text">战斗速度 x{{ props.battleSpeed ?? 1 }}</span>
      </button>
    </div>
    <div class="control-group right">
      <label class="debug-toggle" :class="{ active: debugMode }">
        <input type="checkbox" v-model="debugMode" />
        调试
      </label>
      <button class="control-btn" @click="$emit('exit-tool')">[Q] 退出工具</button>
      <button class="control-btn" @click="$emit('show-help')">[H] 帮助文档</button>
      <span class="mode-indicator">战斗状态: {{ battleStateDisplay }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import RadioButtonGroup from "@/presentation/components/RadioButtonGroup.vue";
import { debugGate } from '@/domain/battle/debug/DebugGate'
import { eventBus } from '@/main'

const props = defineProps<{
  isBattleActive: boolean;
  isPaused: boolean;
  isAutoPlaying: boolean;
  battleSpeed?: number;
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

const autoPlayMode = computed(() => props.isAutoPlaying ? 'auto' as const : 'off' as const);

// 自动播放选项配置
const autoPlayOptions = [
  { value: 'off', label: '手动' },
  { value: 'auto', label: '自动' },
];

// 监听自动播放模式变化
const handleAutoPlayModeChange = (mode: string) => {
  emit('toggle-auto-play');
};

// 战斗速度控制 - 使用传入的 props.battleSpeed
const speedLevels = [1, 2, 3, 5]; // 支持1倍、2倍、3倍、5倍四个速度档位

// 切换战斗速度
const toggleBattleSpeed = () => {
  const currentIndex = speedLevels.indexOf(props.battleSpeed ?? 1);
  const nextIndex = (currentIndex + 1) % speedLevels.length;
  emit('battle-speed-change', speedLevels[nextIndex]);
};

const battleStateDisplay = computed(() => {
  if (autoPlayMode.value === 'fast') return "快速播放";
  if (autoPlayMode.value === 'auto') return "自动播放";
  if (!props.isPaused) return "进行中";
  return "暂停";
});

// 调试模式开关 — 与 DebugGate 单例双向同步
const debugMode = ref(debugGate.enabled)
watch(debugMode, (v) => {
  debugGate.setEnabled(v)
})
// 反向同步：通过 eventBus 监听外部调试开关变化
onMounted(() => {
  eventBus.on('debug-toggle', (data: any) => {
    debugMode.value = data?.enabled ?? false
  })
})
onUnmounted(() => {
  eventBus.off('debug-toggle')
})
</script>

<style scoped>
@use'@/presentation/styles/main.scss';

.auto-battle-indicator {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.2), rgba(59, 130, 246, 0.2));
  border: 1px solid rgba(34, 211, 238, 0.5);
  border-radius: var(--radius-xl);
  animation: pulse-glow 2s ease-in-out infinite;
  z-index: 100;
}

.auto-indicator-icon {
  font-size: var(--font-size-xl);
  animation: spin 1s linear infinite;
}

.auto-indicator-text {
  color: var(--color-energy);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-md);
  text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
}

.auto-indicator-speed {
  background: rgba(34, 211, 238, 0.3);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
  color: var(--color-energy);
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

.debug-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--font-size-sm);
  cursor: pointer;
  user-select: none;
  padding: var(--space-1) var(--space-2);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-sm);
  transition: var(--transition-fast);
}
.debug-toggle.active {
  color: var(--color-energy);
  border-color: rgba(34, 211, 238, 0.5);
  background: rgba(34, 211, 238, 0.1);
}
.debug-toggle input {
  accent-color: var(--color-energy);
}
</style>