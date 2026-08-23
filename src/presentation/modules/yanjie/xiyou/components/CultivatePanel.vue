<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" size="sm" destroy-inactive class="xy-tabs--seal">
      <template #character>
        <CharacterPanel @go-equip="emit('open-equip')" />
      </template>
      <template #school>
        <SchoolsPanel />
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import type { TabItem } from '@/presentation/components'
import CharacterPanel from './cultivate/CharacterPanel.vue'
import SchoolsPanel from './SchoolsPanel.vue'

const emit = defineEmits<{ 'open-equip': [] }>()

const sub = ref<'character' | 'realm' | 'school' | 'meridian' | 'dharma'>('character')

const SUBS: TabItem[] = [
  { id: 'character', label: '角色' },
  { id: 'realm', label: '境界' },
  { id: 'school', label: '流派' },
  { id: 'meridian', label: '经脉' },
]
</script>

<style scoped lang="scss">
/* 行路态宝阁 290px 窄栏：6 页签超宽时横向滚动兜底（同 PackPanel 二级 tab） */
.xy-tabs--seal :deep(.tabs-header) {
  overflow-x: auto;
}
</style>
