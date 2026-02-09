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
import Dialog from '@/components/Dialog.vue'

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

const speedOptions = [0.5, 1, 2, 5]
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.rule-item:hover {
  background-color: #f5f7fa;
}

.rule-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.rule-item span {
  font-size: 14px;
  color: #303133;
}

.speed-selector {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.speed-selector span {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.speed-btn {
  padding: 6px 12px;
  border: 1px solid #dcdfe6;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #606266;
  transition: all 0.2s;
}

.speed-btn:hover {
  border-color: #409eff;
  color: #409eff;
}

.speed-btn.active {
  background: #409eff;
  border-color: #409eff;
  color: white;
}

.custom-speed {
  width: 80px;
  padding: 6px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.custom-speed:focus {
  border-color: #409eff;
}
</style>
