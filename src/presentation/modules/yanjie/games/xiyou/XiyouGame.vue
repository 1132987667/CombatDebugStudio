<template>
  <div class="xy-game">
    <!-- 游戏专属顶部导航栏（系统主题色） -->
    <header class="xy-topbar">
      <div class="xy-topbar-brand">
        <h1 class="xy-topbar-title">斗战西游</h1>
        <span class="xy-topbar-sub">降妖路引 · 水墨回合制</span>
      </div>
      <div class="xy-topbar-status">
        <span class="xy-coin xy-coin--jade">银两 {{ currency.silver }}</span>
        <span class="xy-coin">铜钱 {{ currency.copper.toLocaleString() }}</span>
        <span class="xy-coin xy-coin--gold">灵石 {{ currency.jade }}</span>
        <span class="xy-topbar-chip">{{ currentScene.name }}</span>
        <span class="xy-topbar-chip">Lv.{{ player.level }}</span>
      </div>
    </header>

    <!-- 主体三栏（行路态：战斗+宝阁+四象栏；功能态：全屏宝阁+四象栏） -->
    <div class="xy-body" :class="[`xy-side--${sidebarSide}`, isFeature ? 'xy-body--feature' : 'xy-body--journey']">
      <!-- 最右/左：功能菜单 · 四象栏 -->
      <FourAspectBar v-model="activeCabinet" @open-map="mapOpen = true" @open-settings="settingsOpen = true" />

      <!-- 功能宝阁（行路态 290px / 功能态全屏） -->
      <TreasureCabinet :tab="activeCabinet" :current="currentScene" @open-map="mapOpen = true" />

      <!-- 战斗禅台（仅行路态显示） -->
      <BattleZen v-show="!isFeature" :scene="currentScene" />
    </div>

    <!-- 降妖路引：弹窗大地图 -->
    <SceneMapDialog v-model="mapOpen" :regions="regions" :scenes="scenes" :current="currentScene"
      @select="currentScene = $event" />

    <!-- 设置：居中弹窗 -->
    <SettingsDialog v-model="settingsOpen" v-model:sidebar="sidebarSide" @back="emit('back')" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BattleZen from './components/BattleZen.vue'
import FourAspectBar, { type GroupTab } from './components/FourAspectBar.vue'
import SceneMapDialog from './components/SceneMapDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import TreasureCabinet from './components/TreasureCabinet.vue'
import { currency, player, regions, scenes, loadXiyouData, type XiyouScene } from './data/mock'

/** 当前选中的功能宝阁分组（map=行路态，其余=功能态） */
const activeCabinet = ref<GroupTab>('map')

/** 降妖路引弹窗开关 */
const mapOpen = ref(false)

/** 设置弹窗开关 */
const settingsOpen = ref(false)

/** 功能面板页签位置（四象栏在左/右） */
const sidebarSide = ref<'left' | 'right'>('right')

/** 功能态：点击装备/洞府/收集等时，宝阁全屏、战斗区隐藏 */
const isFeature = computed(() => activeCabinet.value !== 'map')

/** 当前选中关卡（由降妖路引弹窗选择） */
const currentScene = ref<XiyouScene>(scenes.find(s => s.unlocked) ?? scenes[0])

/** 返回演劫台（由设置面板「返回演劫台」触发） */
const emit = defineEmits<{ back: [] }>()

// NOTE: 封神榜数据源接线（需求说明 §5.1 方案 B）——数据先以 configs 兜底渲染，
//       封神榜 IDB 有西游数据则加载后原地更新（reactive），并重选当前关卡。
onMounted(async () => {
  await loadXiyouData()
  currentScene.value = scenes.find(s => s.unlocked) ?? scenes[0]
})
</script>

<style lang="scss">
@use './styles/xiyou.scss';
</style>
