<template>
  <div v-if="open" class="ht-modal" @click.self="close">
    <div class="ht-modal-box">
      <div class="ht-modal-hd">
        <span>条件断点配置</span>
        <button class="ht-btn" @click="close">×</button>
      </div>
      <div class="ht-modal-bd">
        <div class="ht-kvrow">
          <span class="k">条件类型</span>
          <select v-model="type" class="ht-select">
            <option value="none">手动暂停（无条件）</option>
            <option value="damage">伤害 ≥ 阈值</option>
            <option value="level">级别 = warn / error</option>
            <option value="roll">随机值 &gt; 阈值</option>
            <option value="actor">单位行动（ID）</option>
          </select>
        </div>
        <div v-if="type === 'damage' || type === 'roll'" class="ht-kvrow">
          <span class="k">阈值</span>
          <input v-model.number="value" type="number" min="0" step="1" class="ht-select" aria-label="断点阈值" />
        </div>
        <div v-if="type === 'level'" class="ht-kvrow">
          <span class="k">级别</span>
          <select v-model="value" class="ht-select">
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </div>
        <div v-if="type === 'actor'" class="ht-kvrow">
          <span class="k">单位</span>
          <select v-model="value" class="ht-select" aria-label="选择单位">
            <option value="">选择单位…</option>
            <option v-for="p in participants" :key="p.id" :value="p.id">{{ p.name }}（{{ p.id }}）</option>
          </select>
        </div>
        <label class="ht-bp-arm">
          <input v-model="armed" type="checkbox" /> 启用断点（播放命中自动暂停并定位）
        </label>
        <div class="ht-bp-note">示例：伤害 ≥ 150 → 命中结算事件即暂停；级别 warn → 命中「阵亡」。</div>
      </div>
      <div class="ht-modal-ft">
        <button class="ht-btn" @click="close">取消</button>
        <button class="ht-btn primary" @click="save">保存断点</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BreakpointConfig } from '@/domain/battle/replay/unified/unified-breakpoint'
import { useHaotianStore } from '../stores/haotianStore'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useHaotianStore()

const participants = store.archive?.initialState.participants ?? []
const type = ref<BreakpointConfig['type']>('none')
const value = ref<string | number>('')
const armed = ref(false)

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

const close = (): void => emit('update:open', false)

const save = (): void => {
  store.setBreakpoint({ type: type.value, value: type.value === 'none' ? undefined : value.value }, armed.value)
  store.toast(`断点已${armed.value && type.value !== 'none' ? '启用' : '保存'}`)
  close()
}
</script>
