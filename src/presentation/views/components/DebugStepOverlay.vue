<template>
  <Teleport to="body">
    <Transition name="panel-slide">
      <div v-if="visible" class="debug-float-panel">
        <!-- 标题栏 -->
        <div class="dfp-header" @click="collapsed = !collapsed">
          <span class="dfp-icon">🐞</span>
          <span class="dfp-title">调试</span>
          <span class="dfp-badge" :class="{ active: debugGate.enabled }">
            {{ debugGate.enabled ? 'ON' : 'OFF' }}
          </span>
          <button class="dfp-collapse-btn" @click.stop="collapsed = !collapsed">
            {{ collapsed ? '▲' : '▼' }}
          </button>
          <button class="dfp-close-btn" @click.stop="visible = false">×</button>
        </div>

        <!-- 内容区 -->
        <div v-show="!collapsed" class="dfp-body">
          <!-- 当前阶段 -->
          <div class="dfp-section">
            <div class="dfp-section-title">当前阶段</div>
            <div class="dfp-phase-row">
              <span v-if="debugGate.waitingPhase" class="dfp-phase-tag">
                {{ phaseLabel(debugGate.waitingPhase) }}
              </span>
              <span v-else class="dfp-phase-idle">等待中</span>
            </div>
          </div>

          <!-- 阶段历史 -->
          <div class="dfp-section">
            <div class="dfp-section-title">阶段记录</div>
            <div ref="historyRef" class="dfp-history">
              <div v-for="(item, i) in phaseHistory" :key="i"
                class="dfp-history-item" :class="{ latest: i === phaseHistory.length - 1 }">
                <span class="dfp-history-time">{{ item.time }}</span>
                <span class="dfp-history-phase">{{ phaseLabel(item.phase) }}</span>
              </div>
              <div v-if="phaseHistory.length === 0" class="dfp-history-empty">暂无记录</div>
            </div>
          </div>

          <!-- 开关 -->
          <div class="dfp-actions">
            <button class="dfp-btn" :class="{ active: debugGate.enabled }" @click="toggleDebug">
              {{ debugGate.enabled ? '关闭调试' : '开启调试' }}
            </button>
            <button class="dfp-btn step-btn" @click="handleStep" :disabled="!debugGate.isWaiting()">
              ▶ 下一步
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { debugGate } from '@/domain/battle/debug/DebugGate'
import { eventBus } from '@/main'

const visible = ref(debugGate.enabled)
const collapsed = ref(false)
const historyRef = ref<HTMLElement | null>(null)

interface PhaseRecord {
  phase: string
  time: string
}
const phaseHistory = ref<PhaseRecord[]>([])
const MAX_HISTORY = 50

const phaseLabel = (p: string): string => {
  const map: Record<string, string> = {
    BATTLE_START: '战斗开始',
    TURN_START: '回合开始',
    TURN_END: '回合结束',
    BATTLE_END: '战斗结束',
  }
  return map[p] || p
}

const toggleDebug = () => {
  debugGate.setEnabled(!debugGate.enabled)
}

const handleStep = () => {
  debugGate.nextStep()
}

const onDebugToggle = (data: any) => {
  visible.value = data?.enabled ?? false
}

const onDebugPause = (data: any) => {
  const phase = data?.phase
  if (!phase) return

  const now = new Date()
  const time = now.toLocaleTimeString('zh-CN', { hour12: false })
  phaseHistory.value.push({ phase, time })
  if (phaseHistory.value.length > MAX_HISTORY) {
    phaseHistory.value.shift()
  }

  nextTick(() => {
    if (historyRef.value) {
      historyRef.value.scrollTop = historyRef.value.scrollHeight
    }
  })
}

onMounted(() => {
  eventBus.on('debug-pause', onDebugPause)
  eventBus.on('debug-toggle', onDebugToggle)
})

onUnmounted(() => {
  eventBus.off('debug-pause', onDebugPause)
  eventBus.off('debug-toggle', onDebugToggle)
})
</script>

<style scoped>
.debug-float-panel {
  position: fixed;
  bottom: 60px;
  right: 16px;
  z-index: 1500;
  width: 280px;
  background: rgba(10, 15, 25, 0.92);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  font-size: 13px;
  color: #e0e0e0;
  backdrop-filter: blur(4px);
  user-select: none;
  overflow: hidden;
}

/* 标题栏 */
.dfp-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(34, 211, 238, 0.08);
  border-bottom: 1px solid rgba(34, 211, 238, 0.15);
  cursor: pointer;
}
.dfp-icon {
  font-size: 16px;
}
.dfp-title {
  font-weight: 600;
  font-size: 13px;
  color: #22d3ee;
  flex: 1;
}
.dfp-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
  transition: all 0.2s;
}
.dfp-badge.active {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
}
.dfp-collapse-btn,
.dfp-close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  line-height: 1;
  border-radius: 3px;
}
.dfp-collapse-btn:hover,
.dfp-close-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

/* 内容区 */
.dfp-body {
  padding: 8px 10px;
  max-height: 360px;
  overflow-y: auto;
}

.dfp-section {
  margin-bottom: 8px;
}
.dfp-section-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

/* 当前阶段行 */
.dfp-phase-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dfp-phase-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
  font-weight: 600;
  font-size: 13px;
  animation: phase-pulse 0.3s ease;
}
.dfp-phase-idle {
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
  font-size: 12px;
}

/* 阶段历史 */
.dfp-history {
  max-height: 120px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}
.dfp-history-item {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  font-size: 12px;
  opacity: 0.6;
}
.dfp-history-item.latest {
  opacity: 1;
  font-weight: 500;
}
.dfp-history-time {
  color: rgba(255, 255, 255, 0.3);
  font-family: monospace;
  font-size: 11px;
  min-width: 60px;
}
.dfp-history-phase {
  color: #ccc;
}
.dfp-history-empty {
  color: rgba(255, 255, 255, 0.2);
  font-style: italic;
  font-size: 11px;
  padding: 4px 0;
}

/* 操作按钮 */
.dfp-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.dfp-btn {
  flex: 1;
  padding: 5px 6px;
  font-size: 11px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.dfp-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.dfp-btn.active {
  border-color: rgba(34, 211, 238, 0.4);
  color: #22d3ee;
  background: rgba(34, 211, 238, 0.08);
}
.step-btn {
  border-color: rgba(34, 211, 238, 0.3);
}
.step-btn:not(:disabled) {
  color: #22d3ee;
  border-color: #22d3ee;
}

/* 入场动画 */
.panel-slide-enter-active {
  transition: all 0.25s ease;
}
.panel-slide-leave-active {
  transition: all 0.2s ease;
}
.panel-slide-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
}
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
}

@keyframes phase-pulse {
  from { opacity: 0.6; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
