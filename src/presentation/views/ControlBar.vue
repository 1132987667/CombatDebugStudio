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
      <!-- 暂停/继续按钮 -->
      <button class="control-btn" @click="$emit('toggle-pause')" :disabled="!isBattleActive">
        {{ isPaused ? '继 续' : '暂 停' }}
      </button>
      <button class="control-btn" @click="$emit('end-battle')" :disabled="!isBattleActive">结束战斗</button>
      <button class="control-btn" @click="$emit('reset-battle')"
        :disabled="!isBattleActive && autoPlayMode !== 'off'">重置战斗</button>

      <span class="separator"></span>

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
      <!-- 调试模式：暂停相位指示 + 暂停 / 单步调试 -->
      <template v-if="debugMode">
        <span v-if="debugPhase" class="debug-phase-badge">⏸ 暂停于：{{ debugPhaseLabel }}</span>
        <button class="control-btn" @click="handleDebugStep" :disabled="!debugPhase">
          {{ debugPhase ? '继 续' : '暂 停' }}
        </button>
        <button class="control-btn" @click="handleDebugStep" :disabled="!debugPhase">
          {{ debugPhase ? '下一步 ▶' : '单步调试' }}
        </button>
      </template>
      <span class="separator"></span>

      <!-- 调试切换开关 -->
      <label class="debug-toggle-switch" :class="{ active: debugMode }" @click="toggleDebug">
        <span class="toggle-track">
          <span class="toggle-thumb"></span>
        </span>
        <span class="toggle-label">调试</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import RadioButtonGroup from "@/presentation/components/RadioButtonGroup.vue";
import { debugGate } from '@/domain/battle/debug/DebugGate'
import { eventBus } from '@/main'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'

const props = defineProps<{
  isBattleActive: boolean;
  isAutoPlaying: boolean;
  isPaused: boolean;
  battleSpeed?: number;
}>();

const emit = defineEmits<{
  "start-battle": [];
  "end-battle": [];
  "reset-battle": [];
  "toggle-pause": [];
  "toggle-auto-play": [];
  "battle-speed-change": [speed: number];
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



// ========== 调试模式 ==========
// NOTE: debugGate 是普通类，状态不可响应式追踪，
//       因此通过 DEBUG_PAUSE / DEBUG_PAUSE_RESUME 事件驱动本地 ref
const debugMode = ref(debugGate.enabled)
const debugPhase = ref<string | null>(debugGate.waitingPhase)

const PHASE_LABELS: Record<string, string> = {
  BATTLE_START: '战斗开始',
  TURN_START: '回合开始',
  TURN_END: '回合结束',
  BATTLE_END: '战斗结束',
}
const debugPhaseLabel = computed(() =>
  debugPhase.value ? (PHASE_LABELS[debugPhase.value] ?? debugPhase.value) : ''
)

const toggleDebug = () => {
  debugMode.value = !debugMode.value
  debugGate.setEnabled(debugMode.value)
}

// 暂停 / 单步调试：调试模式下战斗停在断点上，两者都推进到下一个断点
const handleDebugStep = () => {
  debugGate.nextStep()
}

onMounted(() => {
  eventBus.on(BattleEventCodes.DEBUG_TOGGLE, (data) => {
    debugMode.value = data?.enabled ?? false
  })
  eventBus.on(BattleEventCodes.DEBUG_PAUSE, (data) => {
    debugPhase.value = data?.phase ?? null
  })
  eventBus.on(BattleEventCodes.DEBUG_PAUSE_RESUME, () => {
    debugPhase.value = null
  })
})
onUnmounted(() => {
  eventBus.off(BattleEventCodes.DEBUG_TOGGLE)
  eventBus.off(BattleEventCodes.DEBUG_PAUSE)
  eventBus.off(BattleEventCodes.DEBUG_PAUSE_RESUME)
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
  color: var(--color-energy);
}

@keyframes pulse-glow {

  0%,
  100% {
    box-shadow: 0 0 5px rgba(34, 211, 238, 0.3);
  }

  50% {
    box-shadow: 0 0 20px rgba(34, 211, 238, 0.6);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.separator {
  width: 1px;
  height: 24px;
  background: var(--color-border-default);
  opacity: 0.4;
  flex-shrink: 0;
}

/* 调试相位徽标 */
.debug-phase-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border: 1px solid rgba(34, 211, 238, 0.5);
  border-radius: var(--radius-xl);
  background: rgba(34, 211, 238, 0.1);
  color: var(--color-energy);
  white-space: nowrap;
  animation: pulse-glow 2s ease-in-out infinite;
}

/* 调试切换开关 */
.debug-toggle-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
  padding: var(--space-1) var(--space-2);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-xl);
  transition: var(--transition-fast);
}

.debug-toggle-switch.active {
  border-color: rgba(34, 211, 238, 0.5);
  background: rgba(34, 211, 238, 0.1);
}

.toggle-track {
  position: relative;
  width: 36px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  transition: background var(--transition-fast);
  flex-shrink: 0;
}

.debug-toggle-switch.active .toggle-track {
  background: var(--color-energy);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.debug-toggle-switch.active .toggle-thumb {
  transform: translateX(16px);
}

.toggle-label {
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  transition: color var(--transition-fast);
}

.debug-toggle-switch.active .toggle-label {
  color: var(--color-energy);
}
</style>