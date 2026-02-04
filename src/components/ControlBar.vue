<template>
  <div class="control-bar">
    <div class="control-group">
      <button class="control-btn" @click="$emit('start-battle')" :disabled="isBattleActive">开始战斗</button>
      <button class="control-btn" @click="$emit('end-battle')" :disabled="!isBattleActive">结束战斗</button>
      <button class="control-btn" @click="$emit('reset-battle')" :disabled="!isBattleActive && !isAutoPlaying">重置战斗</button>
      <button class="control-btn" @click="$emit('step-back')" :disabled="!isBattleActive">回退1回合</button>
      <button class="control-btn" @click="$emit('toggle-pause')" :disabled="!isBattleActive">{{ isPaused ? '[|] 继续' : '[||] 暂停' }}</button>
      <button class="control-btn" @click="$emit('single-step')" :disabled="!isBattleActive">单步执行</button>
      <button class="control-btn" @click="$emit('toggle-auto-play')" :disabled="!isBattleActive">{{ isAutoPlaying ? '[■] 停止自动' : '[▶] 自动播放' }}</button>
    </div>
    <div class="control-group right">
      <button class="control-btn" @click="$emit('exit-tool')">[Q] 退出工具</button>
      <button class="control-btn" @click="$emit('show-help')">[H] 帮助文档</button>
      <span class="mode-indicator">当前模式: 调试模式 | 战斗状态: {{ battleStateDisplay }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  isBattleActive: boolean;
  isPaused: boolean;
  isAutoPlaying: boolean;
}>();

const emit = defineEmits<{
  "start-battle": [];
  "end-battle": [];
  "reset-battle": [];
  "step-back": [];
  "toggle-pause": [];
  "single-step": [];
  "toggle-auto-play": [];
  "exit-tool": [];
  "show-help": [];
}>();

const battleStateDisplay = computed(() => {
  if (props.isAutoPlaying) return "自动播放";
  if (!props.isPaused) return "进行中";
  return "暂停";
});
</script>

<style scoped>
@import './BattleArena.scss';
</style>