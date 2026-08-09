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

    <!-- 主体三栏 -->
    <div class="xy-body">
      <!-- 最右：功能菜单 · 四象栏（含「路引」tab） -->
      <FourAspectBar v-model="activeCabinet" />

      <!-- 右：功能宝阁 -->
      <TreasureCabinet :tab="activeCabinet" :regions="regions" :scenes="scenes" :current="currentScene"
        @select="currentScene = $event" @back="emit('back')" />

      <!-- 中：战斗禅台 -->
      <BattleZen :scene="currentScene" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BattleZen from './components/BattleZen.vue'
import FourAspectBar, { type GroupTab } from './components/FourAspectBar.vue'
import TreasureCabinet from './components/TreasureCabinet.vue'
import { currency, player, regions, scenes, type XiyouScene } from './data/mock'

/** 当前选中的功能宝阁分组（对应四象栏） */
const activeCabinet = ref<GroupTab>('map')

/** 当前选中关卡（由降妖路引大地图选择） */
const currentScene = ref<XiyouScene>(scenes.find(s => s.unlocked) ?? scenes[0])

/** 返回演劫台（由设置面板「返回演劫台」触发） */
const emit = defineEmits<{ back: [] }>()
</script>

<style lang="scss">
@use './styles/xiyou.scss';
</style>
