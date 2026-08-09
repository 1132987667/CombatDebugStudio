<template>
  <div class="manual-action-panel">
    <div class="manual-header">
      <span class="manual-title">手动施放</span>
      <span class="manual-hint">手动模式下指定技能与目标执行一次行动</span>
    </div>
    <div class="manual-row">
      <span class="manual-label">施法者</span>
      <TacticalSelect v-model="casterId" :options="casterOptions" size="md" aria-label="施法者" />
    </div>
    <div class="manual-row">
      <span class="manual-label">技能</span>
      <TacticalSelect v-model="skillId" :options="skillOptions" size="md" aria-label="技能" />
    </div>
    <div class="manual-row">
      <span class="manual-label">目标</span>
      <TacticalSelect v-model="targetId" :options="targetOptions" size="md" aria-label="目标" />
    </div>
    <div class="manual-actions">
      <Button variant="energy" :disabled="!canExecute || isExecuting" @click="execute">
        {{ isExecuting ? '执行中...' : '执行行动' }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/presentation/components/Button.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import { useBattleStore } from '@/presentation/stores'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { SkillType } from '@/domain/skill/types'

const battleStore = useBattleStore()
const notification = useNotificationStore()

const allyAlive = computed(() => battleStore.allyTeam.filter(p => p.isAlive()))
const enemyAlive = computed(() => battleStore.enemyTeam.filter(p => p.isAlive()))

const casterId = ref('')
const skillId = ref('')
const targetId = ref('')

watch(allyAlive, (list) => {
  if (!list.some(p => p.id === casterId.value)) casterId.value = list[0]?.id ?? ''
}, { immediate: true })
watch(enemyAlive, (list) => {
  if (!list.some(p => p.id === targetId.value)) targetId.value = list[0]?.id ?? ''
}, { immediate: true })
watch(casterId, () => { skillId.value = '' })

const caster = computed(() => allyAlive.value.find(p => p.id === casterId.value) ?? null)

const casterOptions = computed<TSelectOption[]>(() =>
  allyAlive.value.map(p => ({ value: p.id, label: p.name })),
)
const skillOptions = computed<TSelectOption[]>(() => {
  const c = caster.value
  if (!c) return [{ value: '', label: '普通攻击' }]
  const activeSkills = c.getSkillList().filter(s => s.skillType !== SkillType.PASSIVE)
  return [
    { value: '', label: '普通攻击' },
    ...activeSkills.map(s => ({
      value: s.id,
      label: s.name,
      hint: s.energyCost ? `能量 ${s.energyCost}` : undefined,
    })),
  ]
})
const targetOptions = computed<TSelectOption[]>(() =>
  enemyAlive.value.map(p => ({ value: p.id, label: p.name })),
)

const canExecute = computed(() => !!caster.value && !!targetId.value)

const isExecuting = ref(false)

const execute = async () => {
  if (isExecuting.value || !caster.value || !targetId.value) return
  isExecuting.value = true
  try {
    const error = await battleStore.executeManualAction(casterId.value, skillId.value || null, targetId.value)
    if (error === null) {
      notification.notify('成功', `[${caster.value.name}] 已执行行动`, 'success')
    } else {
      notification.notify('提示', error, 'warning')
    }
  } finally {
    isExecuting.value = false
  }
}
</script>

<style scoped>
.manual-action-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-tertiary);
  border-top: 2px solid var(--color-border-default);
}

.manual-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.manual-title {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.manual-hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.manual-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.manual-label {
  flex: 0 0 48px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}

.manual-row .tactical-select {
  flex: 1;
}

.manual-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
