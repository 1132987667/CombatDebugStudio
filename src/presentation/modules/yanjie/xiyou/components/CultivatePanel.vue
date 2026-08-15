<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" size="sm" destroy-inactive class="xy-tabs--seal">
      <template #character>
        <CharacterPanel @go-equip="emit('open-equip')" />
      </template>
      <template #realm>
        <RealmPanel />
      </template>
      <template #school>
        <SkillTreeView />
      </template>
      <template #martial>
        <PendingPanel title="功法" subtitle="问道长生 · 即将开放" desc="收集天下功法，装配四卷，修得无上神通。" />
      </template>
      <template #meridian>
        <PendingPanel title="经脉" subtitle="打通任督 · 即将开放" desc="冲穴通脉，先天根基，潜能无限。" />
      </template>
      <template #dharma>
        <PendingPanel title="神通" subtitle="法力无边 · 即将开放" desc="领悟天地神通，装配四大神通，战无不胜。" />
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Tabs from '@/presentation/components/Tabs.vue'
import type { TabItem } from '@/presentation/components/Tabs.vue'
import PendingPanel from './PendingPanel.vue'
import CharacterPanel from './cultivate/CharacterPanel.vue'
import RealmPanel from './cultivate/RealmPanel.vue'
import SkillTreeView from './SkillTreeView.vue'

const emit = defineEmits<{ 'open-equip': [] }>()

const sub = ref<'character' | 'realm' | 'school' | 'martial' | 'meridian' | 'dharma'>('character')

const SUBS: TabItem[] = [
  { id: 'character', label: '角色' },
  { id: 'realm', label: '境界' },
  { id: 'school', label: '流派' },
  { id: 'martial', label: '功法' },
  { id: 'meridian', label: '经脉' },
  { id: 'dharma', label: '神通' },
]
</script>

<style scoped lang="scss">
/* 行路态宝阁 290px 窄栏：6 页签超宽时横向滚动兜底（同 PackPanel 二级 tab） */
.xy-tabs--seal :deep(.tabs-header) {
  overflow-x: auto;
}
</style>
