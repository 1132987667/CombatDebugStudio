<template>
  <!-- 游戏大厅：选择游戏进入 -->
  <div v-if="!entered" class="yj-hall bg-ink">
    <header class="yj-hall-header">
      <div class="yj-brand">
        <h1 class="yj-brand-title">演劫台</h1>
        <p class="yj-brand-sub">以身入劫 · 实战应验</p>
      </div>
      <p class="yj-hall-desc">选择一款游戏，开启真实回合制对局。战局产出战斗记录，可入昊天镜照彻分析。</p>
    </header>

    <main class="yj-games">
      <button
        type="button"
        class="yj-game-card yj-game-card--active"
        @click="enterGame('xiyou')"
      >
        <div class="yj-game-cover" aria-hidden="true">
          <svg viewBox="0 0 96 96" class="yj-game-mark">
            <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" stroke-width="2" opacity="0.6" />
            <circle cx="48" cy="48" r="32" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4" />
            <path d="M48 20v56M20 48h56" stroke="currentColor" stroke-width="2" />
            <path d="M33 33l30 30M63 33L33 63" stroke="currentColor" stroke-width="1.5" opacity="0.7" />
          </svg>
        </div>
        <div class="yj-game-info">
          <span class="yj-game-name">斗战西游</span>
          <span class="yj-game-tag">水墨回合制 RPG</span>
        </div>
        <p class="yj-game-desc">收集材料、打造装备、淬炼技艺，一路降妖伏魔，战胜最终 BOSS 六耳猕猴。</p>
        <span class="yj-game-enter">进入游戏</span>
      </button>

      <div class="yj-game-card yj-game-card--locked" aria-disabled="true">
        <div class="yj-game-cover">
          <svg viewBox="0 0 96 96" class="yj-game-mark">
            <path d="M28 44V32a20 20 0 0 1 40 0v12" fill="none" stroke="currentColor" stroke-width="3" />
            <rect x="24" y="44" width="48" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="3" />
          </svg>
        </div>
        <div class="yj-game-info">
          <span class="yj-game-name">更多游戏</span>
          <span class="yj-game-tag">敬请期待</span>
        </div>
        <p class="yj-game-desc">演劫台为多游戏容器，后续将接入更多回合制对局。</p>
        <span class="yj-game-enter">未解锁</span>
      </div>
    </main>
  </div>

  <!-- 游戏本体 -->
  <div v-else class="yj-game-stage">
    <XiyouGame @back="entered = ''" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import XiyouGame from './games/xiyou/XiyouGame.vue'

/** 已进入的游戏 id；空字符串表示仍在游戏大厅 */
const entered = ref<'' | 'xiyou'>('')

function enterGame(game: 'xiyou'): void {
  entered.value = game
}

// NOTE: 暴露进入状态供 BattleArena 隐藏全局 ModuleHeader，避免与游戏自身顶部栏叠加
defineExpose({ entered })
</script>

<style lang="scss">
@use './styles/yanjie.scss';
</style>
