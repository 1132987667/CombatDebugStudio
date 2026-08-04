<template>
  <Dialog :model-value="open" title="条件断点配置" width="min(520px, 92vw)"
    content-class="dialog-content--flush" @update:model-value="onModelValue">
    <div class="ht-modal-bd">
      <div v-if="store.breakpoints.length" class="ht-bp-list">
        <div v-for="bp in store.breakpoints" :key="bp.id" class="ht-bp-item" :class="{ off: !bp.enabled }">
          <label class="ht-bp-item-arm" :title="bp.enabled ? '停用该断点' : '启用该断点'">
            <input type="checkbox" :checked="bp.enabled" :aria-label="`${bp.enabled ? '停用' : '启用'}断点：${bpTitle(bp)}`"
              @change="store.toggleBreakpoint(bp.id)" />
          </label>
          <span class="ht-bp-item-label" :class="{ muted: !bp.enabled }">{{ bpTitle(bp) }}</span>
          <button type="button" class="ht-bp-item-del" title="删除断点" aria-label="删除断点"
            @click="store.removeBreakpoint(bp.id)">×</button>
        </div>
      </div>
      <div v-else class="ht-bp-empty">暂无断点。播放命中条件时自动暂停并定位。</div>

      <div class="ht-bp-add">
        <div class="ht-bp-add-title">添加断点</div>
        <div class="ht-kvrow">
          <span class="k">条件类型</span>
          <TacticalSelect v-model="type" size="md" :options="typeOptions" />
        </div>
        <div v-if="type === 'damage' || type === 'roll'" class="ht-kvrow">
          <span class="k">阈值</span>
          <TacticalInput type="number" integer min="0" size="md" :model-value="value"
            aria-label="断点阈值" @update:model-value="(v) => (value = (v ?? '') as string | number)" />
        </div>
        <div v-if="type === 'level'" class="ht-kvrow">
          <span class="k">级别</span>
          <TacticalSelect v-model="value" size="md" :options="levelOptions" />
        </div>
        <div v-if="type === 'actor'" class="ht-kvrow">
          <span class="k">单位</span>
          <TacticalSelect v-model="value" size="md" :options="actorOptions" />
        </div>
        <div v-if="type === 'actor' && !actorOptions.length" class="ht-bp-note">需先加载一份战斗数据（顶部选择数据源）才能按单位设置断点。</div>
        <div class="ht-bp-note">示例：伤害 ≥ 150 → 命中结算即暂停；级别 warn → 命中「阵亡」。可添加多条，任一命中即暂停。</div>
      </div>
    </div>
    <template #footer>
      <Button variant="ghost" :disabled="!store.breakpoints.length" title="移除全部断点" @click="store.clearBreakpoints()">清空全部</Button>
      <Button variant="primary" @click="add">添加断点</Button>
      <Button variant="energy" @click="close">关闭</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BreakpointConfig } from '@/domain/battle/replay/unified/unified-breakpoint'
import { useHaotianStore } from '../stores/haotianStore'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useHaotianStore()

const type = ref<BreakpointConfig['type']>('damage')
const value = ref<string | number>('')
const actorOptions = ref<TSelectOption[]>([])

const typeOptions: TSelectOption[] = [
  { value: 'damage', label: '伤害 ≥ 阈值' },
  { value: 'level', label: '级别 = warn / error' },
  { value: 'roll', label: '随机值 > 阈值' },
  { value: 'actor', label: '单位行动（ID）' },
]
const levelOptions: TSelectOption[] = [
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' },
]

watch(
  () => props.open,
  (val) => {
    if (!val) return
    const participants = store.archive?.initialState.participants ?? []
    actorOptions.value = [
      { value: '', label: '选择单位…' },
      ...participants.map((p) => ({ value: p.id, label: `${p.name}（${p.id}）` })),
    ]
  },
)

const BP_TITLE: Record<string, (bp: BreakpointConfig) => string> = {
  damage: (bp) => `伤害 ≥ ${bp.value}`,
  level: (bp) => `级别 = ${bp.value}`,
  roll: (bp) => `随机值 > ${bp.value}`,
  actor: (bp) => `单位行动：${store.pname(String(bp.value))}`,
  none: () => '手动暂停（无条件）',
}

function bpTitle(bp: BreakpointConfig): string {
  return (BP_TITLE[bp.type] ?? (() => bp.type))(bp)
}

function add(): void {
  store.addBreakpoint(type.value, type.value === 'none' ? undefined : value.value)
  type.value = 'damage'
  value.value = ''
  store.toast('断点已添加')
}

const onModelValue = (val: boolean): void => emit('update:open', val)
const close = (): void => emit('update:open', false)
</script>
