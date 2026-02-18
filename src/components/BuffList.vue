<template>
  <div class="buff-list">
    <div 
      v-for="buff in buffs" 
      :key="buff.id"
      class="buff-item"
    >
      <BuffIcon
        :buffId="buff.buffId"
        :buffName="buff.name"
        :description="buff.description"
        :remainingTurns="buff.remainingTurns"
        :currentStacks="buff.currentStacks"
        :isDebuff="buff.isDebuff"
        :iconPath="buff.iconPath"
      />
    </div>
    <div class="buff-list-placeholder" v-if="buffs.length === 0">
      无效果
    </div>
  </div>
</template>

<script setup lang="ts">
import BuffIcon from '@/components/BuffIcon.vue'

// Props
const props = defineProps<{
  buffs: Array<{
    id: string
    buffId: string
    name: string
    description: string
    remainingTurns: number
    currentStacks: number
    isDebuff: boolean
    iconPath?: string
  }>
}>()
</script>

<style scoped>
.buff-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background: rgba(17, 24, 39, 0.4);
  border-radius: 8px;
  min-height: 56px;
  align-items: center;
}

.buff-item {
  flex-shrink: 0;
}

.buff-list-placeholder {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-style: italic;
  padding: 0 12px;
}
</style>