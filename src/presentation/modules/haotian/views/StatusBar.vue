<template>
  <div class="ht-status">
    <div class="ht-st-item click" title="点击查看校验报告" @click="store.toggleDiag()">
      <span :class="store.validation?.errors.length ? 'ht-st-warn' : 'ht-st-ok'">
        {{ store.validation?.errors.length ?? 0 }} 错误 / {{ store.validation?.warnings.length ?? 0 }} 警告
      </span>
    </div>
    <div class="ht-st-item">事件 <b>{{ store.validation?.stats.events ?? 0 }}</b></div>
    <div class="ht-st-item">书签 <b>{{ store.bookmarkCount }}</b></div>
    <div class="ht-st-item">模式 <b>{{ store.mode === 'replay' ? '回放' : '调试' }}</b></div>
    <div class="ht-st-right">
      <div class="ht-st-item"><span class="ht-st-dot"></span>就绪</div>
      <div class="ht-st-item">{{ utcClock }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useHaotianStore } from '../stores/haotianStore'

const store = useHaotianStore()

const utcClock = ref('--:--:--')

let timer = 0

onMounted(() => {
  const tick = (): void => {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    utcClock.value = `世界时 ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  }
  tick()
  timer = window.setInterval(tick, 1000)
})
onUnmounted(() => {
  window.clearInterval(timer)
})
</script>
