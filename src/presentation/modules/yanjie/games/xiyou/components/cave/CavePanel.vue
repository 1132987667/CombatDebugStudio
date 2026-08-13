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
        <button
          v-for="n in NAVS"
          :key="n.id"
          type="button"
          class="xy-cave-nav-item"
          :class="{ active: active === n.id }"
          :aria-current="active === n.id ? 'page' : undefined"
          @click="active = n.id"
        >
          <svg viewBox="0 0 24 24" class="xy-cave-nav-icon" aria-hidden="true">
            <path :d="n.path" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
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
          <EnhancePanel v-else-if="active === 'enhance'" />
          <StarPanel v-else-if="active === 'star'" />
          <SkillPanel v-else-if="active === 'skill'" />
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
import { usePackStore } from '@/presentation/stores/packStore'
import { crafts } from '../../data/mock'
import AlchemyPanel from './AlchemyPanel.vue'
import EnhancePanel from './EnhancePanel.vue'
import ForgePanel from './ForgePanel.vue'
import FragmentPanel from './FragmentPanel.vue'
import SkillPanel from './SkillPanel.vue'
import StarPanel from './StarPanel.vue'

const pack = usePackStore()

onMounted(() => {
  void pack.init()
})

type CaveNavId = 'forge' | 'alchemy' | 'enhance' | 'star' | 'skill' | 'fragment'

const active = ref<CaveNavId>('forge')

/** 左侧导航：墨线简笔画 SVG + 文字（禁 emoji） */
const NAVS: Array<{ id: CaveNavId; label: string; path: string }> = [
  { id: 'forge', label: '打造装备', path: 'M15 3l6 6-4 4-6-6 4-4zM6 21l6.5-6.5M11 5l8 8M4 20l2-2' },
  { id: 'alchemy', label: '炼制丹药', path: 'M5 8h14M5 8l1 9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-9M3 8h18M9 4h6' },
  { id: 'enhance', label: '强化装备', path: 'M12 20V6M6 14l6-6 6 6' },
  { id: 'star', label: '装备升星', path: 'M12 3l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 15.9 6.7 19l1.3-5.9-4.5-4 6-.6L12 3z' },
  { id: 'skill', label: '技能修炼', path: 'M12 6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 11v4M8 20c.5-2.5 1.8-3.5 3.2-3.5S14.5 17.5 15 20' },
  { id: 'fragment', label: '碎片合成', path: 'M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4' },
]

const ACTIVE_NAV = computed(() => {
  const map: Record<CaveNavId, { label: string; sub: string }> = {
    forge: { label: '打造装备', sub: '铸炉 · 消耗材料制造兵甲' },
    alchemy: { label: '炼制丹药', sub: '丹炉 · 投入草药炼制灵丹' },
    enhance: { label: '强化装备', sub: '砺台 · 消耗晶球与金钱强化' },
    star: { label: '装备升星', sub: '星台 · 消耗同名装备突破星级' },
    skill: { label: '技能修炼', sub: '悟道 · 分配技能点修炼流派' },
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
