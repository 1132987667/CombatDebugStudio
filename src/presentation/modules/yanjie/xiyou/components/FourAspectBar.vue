<template>
  <aside class="xy-aspect bg-dual-dots" aria-label="功能菜单 · 四象栏">
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
          <span v-if="tabBadges[tab.id]" class="xy-aspect-badge" aria-hidden="true">{{ tabBadges[tab.id] }}</span>
        </span>
      <span class="xy-aspect-label">{{ tab.label }}</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'

import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import IconAspectBattle from '~icons/app/aspect-battle'
import IconAspectMap from '~icons/app/aspect-map'
import IconAspectPack from '~icons/app/aspect-pack'
import IconAspectCultivate from '~icons/app/aspect-cultivate'
import IconAspectEquip from '~icons/app/aspect-equip'
import IconAspectMate from '~icons/app/aspect-mate'
import IconAspectCollect from '~icons/app/aspect-collect'
import IconAspectQuest from '~icons/app/aspect-quest'
import IconAspectTower from '~icons/app/aspect-tower'
import IconAspectCave from '~icons/app/aspect-cave'
import IconAspectSettings from '~icons/app/aspect-settings'
import { breakReady, nextBreakNode } from '../playerProfile'
import { questClaimable } from '../questProgress'
import { quests } from '../xiyouData'

export type GroupTab =
  | 'battle'
  | 'map'
  | 'tower'
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
const TABS: Array<{ id: GroupTab; label: string }> = [
  { id: 'battle', label: '战斗' },
  { id: 'map', label: '路引' },
  { id: 'pack', label: '行囊' },
  { id: 'cultivate', label: '修行' },
  { id: 'equip', label: '装备' },
  { id: 'mate', label: '伙伴' },
  { id: 'collect', label: '收集' },
  { id: 'quest', label: '历练' },
  { id: 'tower', label: '降妖塔' },
  { id: 'cave', label: '洞府' },
  { id: 'settings', label: '设置' },
]

const playerStore = usePlayerStore()
const pack = usePackStore()

/**
 * 四象栏角标：只挂「该回来看」的 actionable 信号（tab.id → 数字/短字）。
 * 修行内加点优先于突破——加点漏斗是持续态，突破是瞬时条件满足；无信号不挂。
 */
const tabBadges = computed<Partial<Record<GroupTab, string>>>(() => {
  const out: Partial<Record<GroupTab, string>> = {}
  const available = playerStore.statPoints.available
  if (available > 0) {
    out.cultivate = String(available)
  } else {
    const node = nextBreakNode(playerStore.player.breakStage ?? 0)
    if (node && breakReady(node, playerStore.player.level, pack.countOf(node.pillId), playerStore.currency.money)) {
      out.cultivate = '破'
    }
  }
  const claimable = quests.filter(questClaimable).length
  if (claimable > 0) out.quest = String(claimable)
  // 仓库全满无处可存（warehouseCount guard：restore 前零仓库的瞬时态不算满）
  if (pack.warehouseCount > 0 && !pack.anyWarehouseHasSpace) out.cave = '满'
  return out
})

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
  tower: IconAspectTower,
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
  /* 淡墨点底纹：与行囊/装备卡片同一纹样语言（全局 bg-dual-dots 类，模板已挂） */
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
  /* NOTE: 与洞府导航（cave.scss）同一交互范式——上浮 + 描线提亮 + 图标变朱砂，
     补齐此前的无过渡素面 hover */
  transition:
    transform var(--transition-fast),
    color var(--transition-fast),
    background var(--transition-fast),
    border-color var(--transition-fast);

  &:focus-visible {
    outline: 2px solid var(--color-border-focus);
    outline-offset: -2px;
  }

  &:hover:not(.active) {
    transform: translateY(-2px);
    color: var(--color-text-secondary);
    background: var(--color-bg-hover);
    border-color: var(--xy-ink-2);

    .xy-aspect-icon {
      color: var(--xy-seal);
    }
  }

  &.active {
    background: var(--xy-seal-soft);
    border-color: var(--xy-seal);
    color: var(--xy-seal);
    font-weight: var(--font-weight-bold);

    .xy-aspect-icon {
      color: var(--xy-gold);
    }
  }

  /* 激活态左侧朱红竖条指示（与洞府导航同款语言） */
  &.active::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 22%;
    bottom: 22%;
    width: 3px;
    background: var(--xy-seal);
  }
}

.xy-aspect-icon-wrap {
  position: relative;
  display: inline-flex;
}

.xy-aspect-icon {
  width: 22px;
  height: 22px;
  transition: color var(--transition-fast);
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
