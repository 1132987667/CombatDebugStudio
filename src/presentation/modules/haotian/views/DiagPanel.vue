<template>
  <div class="ht-diag" :class="{ open: store.diagOpen }" role="dialog" aria-label="校验报告">
    <div class="ht-diag-hd">
      <span>统一事件流 · 校验报告</span>
      <button class="ht-btn" @click="store.toggleDiag()">关闭 ×</button>
    </div>
    <div class="ht-diag-list" v-if="store.validation">
      <div v-for="(row, i) in rows" :key="i" class="ht-dl">
        <span class="ht-tag" :class="row.kind">{{ row.tag }}</span>
        <span>{{ row.text }}</span>
      </div>
    </div>
    <div class="ht-diag-list" v-else>
      <div class="ht-dl"><span class="ht-tag info">信息</span><span>存档未加载</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ValidationResult } from '@/domain/battle/replay/unified/unified-validator'
import { useHaotianStore } from '../stores/haotianStore'

const store = useHaotianStore()

interface DiagRow {
  kind: 'info' | 'ok' | 'err' | 'warn'
  tag: string
  text: string
}

  const rows = computed<DiagRow[]>(() => {
    const v = store.validation as ValidationResult | null
    if (!v) return []
    const out: DiagRow[] = []
    out.push({ kind: 'info', tag: '格式', text: '事件列表含 阶段 + 因果链 → 统一事件流，双工作台全功能' })
    out.push({ kind: 'ok', tag: '时基', text: '战斗开始 为相对零点 · 单调时基' })
    if (v.errors.length) {
      for (const x of v.errors) out.push({ kind: 'err', tag: '错误', text: x })
    } else {
      out.push({ kind: 'ok', tag: '校验', text: `结构校验通过 — ${v.stats.events} 事件 / ${v.stats.checks} 次随机判定` })
    }
    for (const x of v.warnings) out.push({ kind: 'warn', tag: '警告', text: x })
    for (const x of v.infos) out.push({ kind: 'info', tag: '索引', text: x })
    out.push({ kind: 'info', tag: '性能', text: `解析 ${store.parseMs.toFixed(1)}ms · 校验 ${store.validateMs.toFixed(1)}ms（工作线程，失败回退主线程）` })
    out.push({ kind: 'info', tag: '裁决', text: '回放与调试是同一数据源的两个投影 — 无第二份事件序列' })
    return out
  })
</script>
