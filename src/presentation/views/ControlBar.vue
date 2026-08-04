<template>
  <div class="control-bar">
    <!-- 自动战斗状态指示器 -->
    <div v-if="isAutoPlaying" class="auto-battle-indicator">
      <span class="auto-indicator-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 8-10h-7z"/></svg>
      </span>
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
        <span class="speed-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 8-10h-7z"/></svg>
        </span>
        <span class="speed-text">战斗速度 x{{ props.battleSpeed ?? 1 }}</span>
      </button>

      <!-- ★ 快速战斗开关 -->
      <ToggleSwitch :model-value="store.quickMode" @update:model-value="store.toggleQuickMode()"
        accent-color="var(--color-warning)" label="快速" />


    </div>
    <div class="control-group right">
      <!-- 调试模式：暂停相位指示 + 暂停 / 单步调试 -->
      <template v-if="debugMode">
        <span v-if="debugPhase" class="debug-phase-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="3" width="5" height="18" rx="1"/><rect x="14" y="3" width="5" height="18" rx="1"/></svg>
          暂停于：{{ debugPhaseLabel }}
        </span>
        <button class="control-btn" @click="handleDebugStep" :disabled="!debugPhase">
          {{ debugPhase ? '继 续' : '暂 停' }}
        </button>
        <button class="control-btn" @click="handleDebugStep" :disabled="!debugPhase">
          {{ debugPhase ? '下一步' : '单步调试' }}
        </button>
      </template>
      <span class="separator"></span>

      <!-- 调试切换开关 -->
      <ToggleSwitch :model-value="debugMode" @update:model-value="toggleDebug()" label="调试" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import RadioButtonGroup from "@/presentation/components/RadioButtonGroup.vue";
import ToggleSwitch from "@/presentation/components/ToggleSwitch.vue";
import { container } from '@/infrastructure/di/Container'
import { UIEventBus } from '@/infrastructure/adapters/event/UIEventBus'
import type { DebugGate as DebugGateType } from '@/domain/battle/debug/DebugGate'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import { useBattleStore } from '@/presentation/stores/battleStore'

const emitter = container.resolve<UIEventBus>('UIEventBus').getEmitter()
let debugGate: DebugGateType | undefined
try { debugGate = container.resolve<DebugGateType>('DebugGate') } catch { /* 容器未初始化 */ }

const store = useBattleStore()

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
const debugMode = ref(debugGate?.enabled ?? false)
const debugPhase = ref<string | null>(debugGate?.waitingPhase ?? null)

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
  debugGate?.setEnabled(debugMode.value)
}

// 暂停 / 单步调试：调试模式下战斗停在断点上，两者都推进到下一个断点
const handleDebugStep = () => {
  debugGate?.nextStep()
}

onMounted(() => {
  emitter.on(BattleEventCodes.DEBUG_TOGGLE, (data) => {
    debugMode.value = data?.enabled ?? false
  })
  emitter.on(BattleEventCodes.DEBUG_PAUSE, (data) => {
    debugPhase.value = data?.phase ?? null
  })
  emitter.on(BattleEventCodes.DEBUG_PAUSE_RESUME, () => {
    debugPhase.value = null
  })
})
onUnmounted(() => {
  emitter.off(BattleEventCodes.DEBUG_TOGGLE)
  emitter.off(BattleEventCodes.DEBUG_PAUSE)
  emitter.off(BattleEventCodes.DEBUG_PAUSE_RESUME)
})
</script>

<style scoped>
.auto-battle-indicator {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: linear-gradient(135deg, rgba(var(--rgb-energy), var(--alpha-wash-strong)), rgba(var(--rgb-skill-active), var(--alpha-wash-strong)));
  border: 1px solid var(--border-debug-color-light);
  border-radius: var(--radius-xl);
  animation: pulse-glow 2s ease-in-out infinite;
  z-index: var(--z-float);
}

.auto-indicator-icon {
  font-size: var(--font-size-xl);
  animation: spin 1s linear infinite;
}

.auto-indicator-text {
  color: var(--color-energy);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-md);
  text-shadow: 0 0 10px var(--border-debug-color-light);
}

.auto-indicator-speed {
  background: var(--border-debug-color);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-lg);
  color: var(--color-energy);
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
  border: 1px solid var(--border-debug-color-light);
  border-radius: var(--radius-xl);
  background: rgba(var(--rgb-energy), var(--alpha-wash));
  color: var(--color-energy);
  white-space: nowrap;
  animation: pulse-glow 2s ease-in-out infinite;
}
</style>