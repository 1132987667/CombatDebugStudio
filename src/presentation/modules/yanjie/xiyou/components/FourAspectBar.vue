<template>
  <aside class="xy-aspect" aria-label="功能菜单 · 四象栏">
    <span>功能菜单</span>
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      class="xy-aspect-tab xy-ink-hover"
      :class="{ active: tab.id === modelValue }"
      :aria-pressed="tab.id === modelValue"
      @click="onTabClick(tab.id)"
    >
      <span class="xy-aspect-icon-wrap">
        <component :is="TAB_ICONS[tab.id]" class="xy-aspect-icon" aria-hidden="true" />
        <span v-if="tab.badge" class="xy-aspect-badge" aria-hidden="true">{{ tab.badge }}</span>
      </span>
      <span class="xy-aspect-label">{{ tab.label }}</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import IconAspectBattle from '~icons/app/aspect-battle'
import IconAspectMap from '~icons/app/aspect-map'
import IconAspectPack from '~icons/app/aspect-pack'
import IconAspectCultivate from '~icons/app/aspect-cultivate'
import IconAspectEquip from '~icons/app/aspect-equip'
import IconAspectMate from '~icons/app/aspect-mate'
import IconAspectCollect from '~icons/app/aspect-collect'
import IconAspectQuest from '~icons/app/aspect-quest'
import IconAspectCave from '~icons/app/aspect-cave'
import IconAspectSettings from '~icons/app/aspect-settings'

export type GroupTab =
  | 'battle'
  | 'map'
  | 'pack'
  | 'cultivate'
  | 'equip'
  | 'mate'
  | 'collect'
  | 'quest'
  | 'cave'
  | 'settings'

defineProps<{ modelValue: GroupTab }>()
const emit = defineEmits<{
  'update:modelValue': [tab: GroupTab]
  'open-map': []
  'open-settings': []
}>()

/** 点击 tab：路引切回行路态并弹大地图；设置弹居中窗；其余切功能态 */
function onTabClick(tab: GroupTab): void {
  if (tab === 'map') {
    emit('update:modelValue', 'map')
    emit('open-map')
    return
  }
  if (tab === 'settings') {
    emit('open-settings')
    return
  }
  emit('update:modelValue', tab)
}

/** 四象栏一级分组（墨线简笔画 + 文字，禁 emoji）；图标经 TAB_ICONS 映射为独立 svg 文件 */
const TABS: Array<{ id: GroupTab; label: string; badge?: string }> = [
  { id: 'battle', label: '战斗' },
  { id: 'map', label: '路引' },
  { id: 'pack', label: '行囊' },
  { id: 'cultivate', label: '修行' },
  { id: 'equip', label: '装备' },
  { id: 'mate', label: '伙伴' },
  { id: 'collect', label: '收集' },
  { id: 'quest', label: '历练', badge: '4' },
  { id: 'cave', label: '洞府' },
  { id: 'settings', label: '设置' },
]

/** tab id → 图标组件（svg 文件位于 src/presentation/assets/icons/aspect-*.svg） */
const TAB_ICONS: Record<GroupTab, Component> = {
  battle: IconAspectBattle,
  map: IconAspectMap,
  pack: IconAspectPack,
  cultivate: IconAspectCultivate,
  equip: IconAspectEquip,
  mate: IconAspectMate,
  collect: IconAspectCollect,
  quest: IconAspectQuest,
  cave: IconAspectCave,
  settings: IconAspectSettings,
}
</script>

<style scoped lang="scss">
.xy-aspect {
  grid-area: aspect;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-2);
  background: var(--color-bg-secondary);
  overflow-y: auto;
}

.xy-aspect-tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) 0;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  
  letter-spacing: 2px;

  &:hover:not(.active) {
    color: var(--color-text-secondary);
    background: var(--color-bg-hover);
  }

  &.active {
    background: var(--xy-seal);
    border-color: var(--xy-seal);
    color: #fff;
  }
}

.xy-aspect-icon-wrap {
  position: relative;
  display: inline-flex;
}

.xy-aspect-icon {
  width: 22px;
  height: 22px;
}

.xy-aspect-badge {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--xy-gold);
  color: var(--color-bg-primary);
  font-family: var(--font-family-base);
  font-size: var(--font-size-md);
  line-height: 1;
}

.xy-aspect-label {
  font-size: var(--font-size-md);
}
</style>
