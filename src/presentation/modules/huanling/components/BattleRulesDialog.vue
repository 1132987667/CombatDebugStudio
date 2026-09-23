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
    <SpeedSelector :model-value="localSpeed" label="自动速率:" @update:model-value="updateSpeed">
      <template #extra>
        <TacticalInput type="number" size="md" class="custom-speed-slot" :model-value="customSpeed"
          placeholder="自定义" aria-label="自定义速率"
          @update:model-value="customSpeed = $event as number | null" @change="updateCustomSpeed" />
      </template>
    </SpeedSelector>
    <label class="rule-item">
      <span>每回合法力回复</span>
      <TacticalInput type="number" size="md" class="custom-speed-slot" :model-value="localRules.energyGainPerTurn"
        aria-label="每回合法力回复"
        @update:model-value="localRules.energyGainPerTurn = Number($event) || 0" />
    </label>
    <label class="rule-item">
      <span>单次伤害下限</span>
      <TacticalInput type="number" size="md" class="custom-speed-slot" :model-value="localRules.minDamage"
        aria-label="单次伤害下限" placeholder="1"
        @update:model-value="localRules.minDamage = toPositiveInt($event, 1)" />
    </label>
    <label class="rule-item">
      <span>单次伤害上限</span>
      <TacticalInput type="number" size="md" class="custom-speed-slot" :model-value="localRules.maxDamage"
        aria-label="单次伤害上限" placeholder="9999"
        @update:model-value="localRules.maxDamage = toPositiveInt($event, 9999)" />
    </label>
    <label class="rule-item">
      <span>随机种子</span>
      <TacticalInput size="md" class="seed-slot" :model-value="seed ?? ''" placeholder="留空 = 随机"
        aria-label="随机种子" @update:model-value="emitSeed" />
    </label>
    <p class="seed-hint">固定种子后命中/暴击判定可复现；与「回退一步」配合做分支对比。留空则每场随机。实际种子见开战后系统日志。</p>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, reactive } from 'vue'

import { BattleRules } from '@/presentation/stores/battleStore'

interface Props {
  modelValue: boolean
  rules: BattleRules
  speed: number
  /** 固定随机种子（null = 每场随机），对应 battleStore.pendingSeed */
  seed?: string | null
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:rules', rules: BattleRules): void
  (e: 'update:speed', speed: number): void
  (e: 'update:seed', seed: string | null): void
  (e: 'rule-change', key: keyof BattleRules, value: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  speed: 1,
  seed: null,
})

const emit = defineEmits<Emits>()

const localRules = reactive<BattleRules>({ ...props.rules })
const localSpeed = ref(props.speed)
const customSpeed = ref<number | null>(null)

const handleModelValueChange = (value: boolean) => {
  emit('update:modelValue', value)
}

/** 伤害阈值输入解析：非法/非正数回退到领域默认值（0 对上下限无合法语义） */
const toPositiveInt = (value: unknown, fallback: number): number => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
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

/** 种子输入：去空白，空串归一为 null（= 随机） */
const emitSeed = (value: string | number | null) => {
  const text = String(value ?? '').trim()
  emit('update:seed', text === '' ? null : text)
}
</script>

<style scoped>
.rule-list {
  display: flex;
  flex-direction: column;
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

/* TacticalInput 根默认 width:100%，速率行内给定宽紧凑显示 */
.custom-speed-slot {
  flex: 0 0 64px;
}

.seed-slot {
  flex: 1 1 auto;
  min-width: 0;
}

.seed-hint {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}
</style>
