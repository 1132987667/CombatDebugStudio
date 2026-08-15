<template>
  <section class="xy-cabinet xy-panel" aria-label="功能宝阁">
    <header v-if="!isRouteTab" class="xy-cabinet-head">
      <h2 class="xy-seal-title">{{ CURRENT_TAB.label }}</h2>
      <p class="xy-cabinet-sub">{{ CURRENT_TAB.sub }}</p>
    </header>

    <div class="xy-cabinet-body">
      <div v-if="tab === 'battle' || tab === 'map'" class="xy-cabinet-scroll">
        <SceneTimeline :regions="regions" :scenes="scenes" :current="current" @select="emit('select', $event)" />
      </div>

      <PackPanel v-else-if="tab === 'pack'" />
      <CultivatePanel v-else-if="tab === 'cultivate'" @open-equip="emit('open-equip')" />
      <EquipPanel v-else-if="tab === 'equip'" />
      <MatePanel v-else-if="tab === 'mate'" />
      <CollectPanel v-else-if="tab === 'collect'" />
      <QuestPanel v-else-if="tab === 'quest'" />
      <CavePanel v-else-if="tab === 'cave'" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GroupTab } from './FourAspectBar.vue'
import type { XiyouRegion, XiyouScene } from '../types'
import CavePanel from './cave/CavePanel.vue'
import CollectPanel from './CollectPanel.vue'
import CultivatePanel from './CultivatePanel.vue'
import EquipPanel from './EquipPanel.vue'
import MatePanel from './MatePanel.vue'
import PackPanel from './PackPanel.vue'
import QuestPanel from './QuestPanel.vue'
import SceneTimeline from './SceneTimeline.vue'

const props = defineProps<{
  tab: GroupTab
  current: XiyouScene | null
  regions: XiyouRegion[]
  scenes: XiyouScene[]
}>()
const emit = defineEmits<{ select: [scene: XiyouScene]; 'open-equip': [] }>()

/** 战斗/路引 tab：路引时间线自带头部（含进度），隐藏通用头部避免标题重复 */
const isRouteTab = computed(() => props.tab === 'battle' || props.tab === 'map')

const CURRENT_TAB = computed<{ label: string; sub: string }>(() => {
  const map: Record<GroupTab, { label: string; sub: string }> = {
    battle: { label: '战斗', sub: '演武台 · 当前场景对战' },
    map: { label: '降妖路引', sub: '五域二十五关 · 择路而进' },
    pack: { label: '行囊', sub: '乾坤袋 · 背包 / 仓库 / 坊市' },
    cultivate: { label: '修行', sub: '问道长生 · 角色 / 境界 / 流派 / 功法 / 经脉 / 神通' },
    equip: { label: '装备', sub: '兵器法宝 · 装备 / 法宝 / 坐骑' },
    mate: { label: '伙伴', sub: '结伴同行 · 伙伴 / 灵宠 / 缘分' },
    collect: { label: '收集', sub: '志怪录 · 图鉴 / 成就 / 称号' },
    quest: { label: '历练', sub: '云游四海 · 任务 / 签到 / 活动' },
    cave: { label: '洞府', sub: '修炼洞 · 打造 / 炼制 / 强化 / 升星 / 修炼 / 合成' },
    settings: { label: '设置', sub: '游戏 · 战斗 · 音效 · 关于' },
  }
  return map[props.tab]
})
</script>

<style scoped lang="scss">
.xy-cabinet {
  grid-area: cabinet;
  margin: var(--space-3) 0 var(--space-3) var(--space-3);
  padding: var(--space-4);
}

.xy-cabinet-head {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 2px solid var(--xy-ink-line);

  .xy-seal-title {
    margin: 0;
    padding: 0;
    border-bottom: none;

    /* 副标题同行后不再需要印章方块 */
    &::after {
      display: none;
    }
  }
}

.xy-cabinet-sub {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-cabinet-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.xy-cabinet-scroll {
  height: 100%;
  overflow-y: auto;
  padding-right: var(--space-2);
}

.xy-cabinet-cat-title {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}
</style>
