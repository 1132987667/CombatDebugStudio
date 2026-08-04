<template>
  <Dialog :model-value="open" title="条件断点配置" width="min(460px, 92vw)"
    content-class="dialog-content--flush" @update:model-value="onModelValue">
    <div class="ht-modal-bd">
      <div class="ht-kvrow">
        <span class="k">条件类型</span>
        <TacticalSelect v-model="type" size="sm" :options="typeOptions" />
      </div>
      <div v-if="type === 'damage' || type === 'roll'" class="ht-kvrow">
        <span class="k">阈值</span>
        <input v-model.number="value" type="number" min="0" step="1" class="ht-select" aria-label="断点阈值" />
      </div>
      <div v-if="type === 'level'" class="ht-kvrow">
        <span class="k">级别</span>
        <TacticalSelect v-model="value" size="sm" :options="levelOptions" />
      </div>
      <div v-if="type === 'actor'" class="ht-kvrow">
        <span class="k">单位</span>
        <TacticalSelect v-model="value" size="sm" :options="actorOptions" />
      </div>
      <label class="ht-bp-arm">
        <input v-model="armed" type="checkbox" /> 启用断点（播放命中自动暂停并定位）
      </label>
      <div class="ht-bp-note">示例：伤害 ≥ 150 → 命中结算事件即暂停；级别 warn → 命中「阵亡」。</div>
    </div>
    <template #footer>
      <button class="ht-btn" @click="close">取消</button>
      <button class="ht-btn primary" @click="save">保存断点</button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BreakpointConfig } from '@/domain/battle/replay/unified/unified-breakpoint'
import { useHaotianStore } from '../stores/haotianStore'
import Dialog from '@/presentation/components/Dialog.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useHaotianStore()

const participants = store.archive?.initialState.participants ?? []
const type = ref<BreakpointConfig['type']>('none')
const value = ref<string | number>('')
const armed = ref(false)

const typeOptions: TSelectOption[] = [
  { value: 'none', label: '手动暂停（无条件）' },
  { value: 'damage', label: '伤害 ≥ 阈值' },
  { value: 'level', label: '级别 = warn / error' },
  { value: 'roll', label: '随机值 > 阈值' },
  { value: 'actor', label: '单位行动（ID）' },
]
const levelOptions: TSelectOption[] = [
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' },
]
const actorOptions: TSelectOption[] = [
  { value: '', label: '选择单位…' },
  ...participants.map((p) => ({ value: p.id, label: `${p.name}（${p.id}）` })),
]

watch(
  () => props.open,
  (val) => {
    if (val) {
      type.value = store.breakpoint.type
      value.value = store.breakpoint.value ?? ''
      armed.value = store.bpArmed
    }
  },
)

const onModelValue = (val: boolean): void => emit('update:open', val)

const close = (): void => emit('update:open', false)

const save = (): void => {
  store.setBreakpoint({ type: type.value, value: type.value === 'none' ? undefined : value.value }, armed.value)
  store.toast(`断点已${armed.value && type.value !== 'none' ? '启用' : '保存'}`)
  close()
}
</script>
