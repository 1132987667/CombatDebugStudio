<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="phase" class="debug-step-overlay" @click.self="handleNext">
        <div class="debug-step-card">
          <div class="step-icon">🐞</div>
          <div class="step-phase">{{ phaseLabel }}</div>
          <div class="step-hint">阶段已暂停，点击下方按钮继续战斗</div>
          <button class="step-btn" @click="handleNext">▶ 下一步</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { debugGate } from '@/domain/battle/debug/DebugGate'

const props = defineProps<{
  phase: string | null
}>()

const phaseLabel = computed(() => {
  const map: Record<string, string> = {
    BATTLE_START: '战斗开始',
    TURN_START: '回合开始',
    TURN_END: '回合结束',
    BATTLE_END: '战斗结束',
  }
  return map[props.phase ?? ''] || props.phase || ''
})

const handleNext = () => {
  debugGate.nextStep()
}
</script>

<style scoped>
.debug-step-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
}

.debug-step-card {
  background: rgba(10, 15, 25, 0.95);
  border: 1px solid rgba(34, 211, 238, 0.4);
  border-radius: 12px;
  padding: 32px 48px;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  animation: card-enter 0.25s ease;
}

.step-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.step-phase {
  font-size: 20px;
  font-weight: 600;
  color: #22d3ee;
  margin-bottom: 8px;
}

.step-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 20px;
}

.step-btn {
  padding: 10px 32px;
  font-size: 15px;
  font-weight: 600;
  color: #0a0f19;
  background: linear-gradient(135deg, #22d3ee, #06b6d4);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.step-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(34, 211, 238, 0.4);
}
.step-btn:active {
  transform: translateY(0);
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
