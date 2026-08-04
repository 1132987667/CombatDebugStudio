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
    <div class="ht-st-item">
      数据源 <b>{{ store.source || '—' }}</b>
    </div>
    <div class="ht-st-item">
      断点 <b :class="store.bpArmed ? 'ht-st-warn' : ''">{{ bpLabel }}</b>
    </div>
    <div class="ht-st-right">
      <div class="ht-st-item">
        <span class="ht-st-dot"></span>
        <span :class="store.validation?.errors.length ? 'ht-st-warn' : 'ht-st-ok'">就绪</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useHaotianStore } from '../stores/haotianStore'

const store = useHaotianStore()

const bpLabel = computed(() => {
  const enabled = store.breakpoints.filter((b) => b.enabled && b.type !== 'none')
  return enabled.length ? `${enabled.length} 条启用` : '未启用'
})
</script>
