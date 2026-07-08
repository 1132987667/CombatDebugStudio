<!--
 * 文件: BattleRulesDialog.vue
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗规则配置对话框
 * 描述: 负责战斗逻辑、规则判定和战斗流程控制的配置界面
 * 版本: 1.0.0
-->

<template>
  <Dialog :model-value="modelValue" @update:model-value="handleModelValueChange" title="战斗规则" width="450px">
    <div class="rule-list">
      <label class="rule-item">
        <input type="checkbox" v-model="localRules.speedFirst">
        <span>速度决定出手顺序</span>
      </label>
      <label class="rule-item">
        <input type="checkbox" v-model="localRules.fixedTurns">
        <span>固定回合制(每方全体行动1次)</span>
      </label>
      <label class="rule-item">
        <input type="checkbox" v-model="localRules.critEnabled">
        <span>暴击率生效</span>
      </label>
      <label class="rule-item">
        <input type="checkbox" v-model="localRules.dodgeEnabled">
        <span>闪避率生效</span>
      </label>
    </div>
    <div class="speed-selector">
      <span>自动速率:</span>
      <button v-for="speed in speedOptions" :key="speed" class="speed-btn" :class="{ active: localSpeed === speed }"
        @click="updateSpeed(speed)">
        {{ speed }}x
      </button>
      <input type="number" v-model.number="customSpeed" class="custom-speed" placeholder="自定义"
        @change="updateCustomSpeed">
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, reactive } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import { SPEED_OPTIONS } from '@/shared/constants/speed'

interface BattleRules {
  speedFirst: boolean
  fixedTurns: boolean
  critEnabled: boolean
  dodgeEnabled: boolean
}

interface Props {
  modelValue: boolean
  rules: BattleRules
  speed: number
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:rules', rules: BattleRules): void
  (e: 'update:speed', speed: number): void
  (e: 'rule-change', key: keyof BattleRules, value: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  speed: 1
})

const emit = defineEmits<Emits>()

const speedOptions = SPEED_OPTIONS
const localRules = reactive<BattleRules>({ ...props.rules })
const localSpeed = ref(props.speed)
const customSpeed = ref<number | null>(null)

const handleModelValueChange = (value: boolean) => {
  emit('update:modelValue', value)
}

watch(() => props.rules, (newRules) => {
  Object.assign(localRules, newRules)
}, { deep: true })

watch(() => props.speed, (newSpeed) => {
  localSpeed.value = newSpeed
})

watch(localRules, (newRules) => {
  emit('update:rules', { ...newRules })
}, { deep: true })

const updateSpeed = (speed: number) => {
  localSpeed.value = speed
  customSpeed.value = null
  emit('update:speed', speed)
}

const updateCustomSpeed = () => {
  if (customSpeed.value && customSpeed.value > 0) {
    localSpeed.value = customSpeed.value
    emit('update:speed', customSpeed.value)
  }
}
</script>

<style scoped>
.rule-list {
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}

.rule-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  transition: background-color var(--transition-fast);
}

.rule-item:hover {
  background-color: var(--color-bg-primary);
}

.rule-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.rule-item span {
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
}

.speed-selector {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-default);
}

.speed-selector span {
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.speed-btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border-strong);
  background: var(--color-border-default);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-info);
  transition: all var(--transition-fast);
}

.speed-btn:hover {
  background: var(--color-border-strong);
  color: var(--color-info);
}

.speed-btn.active {
  background: var(--color-info);
  border-color: var(--color-info);
  color: var(--color-bg-secondary);
}

.custom-speed {
  width: 80px;
}
</style>
