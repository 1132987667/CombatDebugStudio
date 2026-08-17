<template>
  <div class="xy-cave">
    <!-- 顶部货币条：制造时快速查看余额 -->
    <div class="xy-cave-top">
      <h3 class="xy-cave-top-name">
        洞府 · 修炼洞
        <span class="xy-cave-top-sub">工坊 / 丹炉 / 修炼之所</span>
      </h3>
      <div class="xy-cave-top-coins">
        <span class="xy-cave-coin">铜钱 {{ pack.currency.copper.toLocaleString() }}</span>
        <span class="xy-cave-coin xy-cave-coin--gold">灵石 {{ pack.currency.jade }}</span>
        <span class="xy-cave-coin xy-cave-coin--jade">银两 {{ pack.currency.silver }}</span>
      </div>
    </div>

    <div class="xy-cave-body">
      <!-- 左侧纵向导航：先产出，后强化 -->
      <nav class="xy-cave-nav" aria-label="洞府功能导航">
        <button v-for="n in NAVS" :key="n.id" type="button" class="xy-cave-nav-item"
          :class="{ active: active === n.id }" :aria-current="active === n.id ? 'page' : undefined"
          @click="active = n.id">
          <component :is="NAV_ICONS[n.id]" class="xy-cave-nav-icon" aria-hidden="true" />
          <span class="xy-cave-nav-label">{{ n.label }}</span>
        </button>
      </nav>

      <!-- 右侧内容区 -->
      <section class="xy-cave-main" aria-label="洞府功能内容">
        <header class="xy-cave-head">
          <h4 class="xy-cave-title">{{ ACTIVE_NAV.label }}</h4>
          <p class="xy-cave-head-sub">{{ ACTIVE_NAV.sub }}</p>
        </header>

        <!-- :key 强制重挂载 → 触发面板淡入上滑动效 -->
        <div class="xy-cave-panel" :key="active">
          <ForgePanel v-if="active === 'forge'" />
          <AlchemyPanel v-else-if="active === 'alchemy'" />
          <TalismanPanel v-else-if="active === 'talisman'" />
          <GardenPanel v-else-if="active === 'garden'" />
          <EnhancePanel v-else-if="active === 'enhance'" />
          <StarPanel v-else-if="active === 'star'" />
          <FragmentPanel v-else-if="active === 'fragment'" />
        </div>

        <footer class="xy-cave-status" aria-label="技艺概况">
          <span class="xy-cave-status-item" v-for="c in CRAFT_STATUS" :key="c.name">
            {{ c.name }} <strong>Lv.{{ c.level }}</strong>
          </span>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import IconNavForge from '~icons/app/nav-forge'
import IconNavAlchemy from '~icons/app/nav-alchemy'
import IconNavTalisman from '~icons/app/nav-talisman'
import IconNavGarden from '~icons/app/nav-garden'
import IconNavEnhance from '~icons/app/nav-enhance'
import IconNavStar from '~icons/app/nav-star'
import IconNavFragment from '~icons/app/nav-fragment'
import { usePackStore } from '@/presentation/stores/packStore'
import { crafts } from '../../xiyouData'
import AlchemyPanel from './AlchemyPanel.vue'
import EnhancePanel from './EnhancePanel.vue'
import ForgePanel from './ForgePanel.vue'
import FragmentPanel from './FragmentPanel.vue'
import GardenPanel from './GardenPanel.vue'
import StarPanel from './StarPanel.vue'
import TalismanPanel from './TalismanPanel.vue'

const pack = usePackStore()

onMounted(() => {
  void pack.init()
})

type CaveNavId = 'forge' | 'alchemy' | 'talisman' | 'garden' | 'enhance' | 'star' | 'fragment'

const active = ref<CaveNavId>('forge')

/** 左侧导航：墨线简笔画 SVG + 文字（禁 emoji）；图标经 NAV_ICONS 映射为独立 svg 文件 */
const NAVS: Array<{ id: CaveNavId; label: string }> = [
  { id: 'forge', label: '打造装备' },
  { id: 'alchemy', label: '炼制丹药' },
  { id: 'talisman', label: '炼制符箓' },
  { id: 'garden', label: '药园灵田' },
  { id: 'enhance', label: '强化装备' },
  { id: 'star', label: '装备升星' },
  { id: 'fragment', label: '碎片合成' },
]

/** nav id → 图标组件（svg 文件位于 src/presentation/assets/icons/nav-*.svg） */
const NAV_ICONS: Record<CaveNavId, Component> = {
  forge: IconNavForge,
  alchemy: IconNavAlchemy,
  talisman: IconNavTalisman,
  garden: IconNavGarden,
  enhance: IconNavEnhance,
  star: IconNavStar,
  fragment: IconNavFragment,
}

const ACTIVE_NAV = computed(() => {
  const map: Record<CaveNavId, { label: string; sub: string }> = {
    forge: { label: '打造装备', sub: '铸炉 · 消耗材料制造兵甲' },
    alchemy: { label: '炼制丹药', sub: '丹炉 · 投入草药炼制灵丹' },
    talisman: { label: '炼制符箓', sub: '符炉 · 炼制强化保护符' },
    garden: { label: '药园灵田', sub: '灵田 · 种植收获灵草仙果' },
    enhance: { label: '强化装备', sub: '砺台 · 消耗晶球与金钱强化' },
    star: { label: '装备升星', sub: '星台 · 消耗同名装备突破星级' },
    fragment: { label: '碎片合成', sub: '熔炼 · 碎片合成为完整之物' },
  }
  return map[active.value]
})

/** 底部状态栏：技艺等级概况（cave.json crafts） */
const CRAFT_STATUS = crafts.slice(0, 4).map((c) => ({ name: c.name, level: c.level }))
</script>

<style lang="scss">
@use '../../styles/cave.scss';
</style>
