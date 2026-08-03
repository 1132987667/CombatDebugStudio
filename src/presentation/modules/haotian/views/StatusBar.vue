<template>
  <div class="ht-status">
    <div class="ht-st-item click" title="点击查看校验报告" @click="store.toggleDiag()">
      事件流 v{{ store.archive?.version ?? '—' }} ·
      <span :class="store.validation?.errors.length ? 'ht-st-warn' : 'ht-st-ok'">
        {{ store.validation?.errors.length ?? 0 }} 错误 / {{ store.validation?.warnings.length ?? 0 }} 警告
      </span>
    </div>
    <div class="ht-st-item">事件 <b>{{ store.validation?.stats.events ?? 0 }}</b> · 因果链 <b>{{ store.validation?.stats.chains ?? 0 }}</b></div>
    <div class="ht-st-item">锚点 <b>{{ store.validation?.stats.anchorsEv ?? 0 }}</b> 增量 + <b>{{ store.validation?.stats.anchorsTurn ?? 0 }}</b> 全量</div>
    <div class="ht-st-item">书签 <b>{{ store.bookmarkCount }}</b></div>
    <div class="ht-st-item">模式 <b>{{ store.mode === 'replay' ? '回放' : '调试' }}</b></div>
    <div class="ht-st-item">种子 {{ store.archive?.randomSeed ?? '—' }}</div>
    <div class="ht-st-item">渲染 <b>{{ fps }}</b> FPS</div>
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
const fps = ref(0)

let timer = 0
let fpsTimer = 0
let frames = 0
let raf = 0

onMounted(() => {
  const tick = (): void => {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    utcClock.value = `世界时 ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  }
  tick()
  timer = window.setInterval(tick, 1000)

  // 渲染 FPS（rAF 帧计数，每秒刷新）
  const count = (): void => {
    frames++
    raf = requestAnimationFrame(count)
  }
  raf = requestAnimationFrame(count)
  fpsTimer = window.setInterval(() => {
    fps.value = frames
    frames = 0
  }, 1000)
})
onUnmounted(() => {
  window.clearInterval(timer)
  window.clearInterval(fpsTimer)
  if (raf) cancelAnimationFrame(raf)
})
</script>
