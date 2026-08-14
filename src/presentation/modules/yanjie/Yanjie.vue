<template>
  <!-- 演劫台唯一项目：斗战西游（进入即游戏全屏态） -->
  <div class="yj-game-stage">
    <XiyouGame @back="emit('back')" />
  </div>
</template>

<script setup lang="ts">
import XiyouGame from './xiyou/XiyouGame.vue'

/** 退出斗战西游（由设置面板「退出演劫台」触发，父级切回默认模块） */
const emit = defineEmits<{ back: [] }>()
</script>

<style lang="scss">
@use './styles/yanjie.scss';
</style>
