<template>
  <aside class="xy-aspect" aria-label="功能菜单 · 四象栏">
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
        <svg viewBox="0 0 24 24" class="xy-aspect-icon" aria-hidden="true">
          <path :d="tab.path" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span v-if="tab.badge" class="xy-aspect-badge" aria-hidden="true">{{ tab.badge }}</span>
      </span>
      <span class="xy-aspect-label">{{ tab.label }}</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
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

/** 四象栏一级分组（墨线简笔画 + 文字，禁 emoji） */
const TABS: Array<{ id: GroupTab; label: string; badge?: string; path: string }> = [
  { id: 'battle', label: '战斗', path: 'M4 20L20 4M20 4H8M20 4v12' },
  { id: 'map', label: '路引', path: 'M5 3l7-2 7 2v18l-7 2-7-2V3zM12 1v20M5 7h14M5 12h14M5 17h14' },
  { id: 'pack', label: '行囊', path: 'M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4M20 7l-8 4M12 11v10' },
  { id: 'cultivate', label: '修行', path: 'M12 5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 10v4M8 21c1-3.5 2-5 4-5s3 1.5 4 5M5 18c.8-2.2 1.8-3.4 3-4M19 18c-.8-2.2-1.8-3.4-3-4' },
  { id: 'equip', label: '装备', path: 'M12 3l8 4v7c0 5-3 8-8 10-5-2-8-5-8-10V7l8-4zM12 3v21M5 10h14M5 15h14' },
  { id: 'mate', label: '伙伴', path: 'M9 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 21c.6-3.4 2.8-5 5-5s4.4 1.6 5 5M18 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 21c.5-2.3 1.8-3.5 3-3.5s2.5 1.2 3 3.5' },
  { id: 'collect', label: '收集', path: 'M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4zM8 7h8M8 11h8M8 15h5' },
  { id: 'quest', label: '历练', path: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM6 3c0 3 3 5 6 5s6-2 6-5M6 21c0-3 3-5 6-5s6 2 6 5M9 9h6M9 13h6M9 17h3', badge: '4' },
  { id: 'cave', label: '洞府', path: 'M4 21V10a8 8 0 0 1 16 0v11M4 21h16M8 21v-6h8v6M12 10v3' },
  { id: 'settings', label: '设置', path: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
]
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
