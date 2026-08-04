<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      操作日志
      <span class="fs-page-hint">记录每条数据的修改时间戳与操作类型（增 / 删 / 改 / 导入）</span>
      <Button size="small" @click="store.loadLogs">刷新</Button>
    </div>

    <div v-if="store.logs.length" class="fs-timeline">
      <div v-for="log in store.logs" :key="log.id" class="fs-tl-item" :class="`op-${log.op}`">
        <div class="fs-tl-time">{{ formatTime(log.timestamp) }}</div>
        <div class="fs-tl-body">
          <span class="fs-tag" :class="opTagClass(log.op)">{{ opLabel(log.op) }}</span>
          <span class="fs-tl-desc">{{ log.table }} · <b>{{ log.entityName ?? log.entityId }}</b></span>
        </div>
      </div>
    </div>
    <div v-else class="fs-empty">暂无操作记录</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Button from '@/presentation/components/Button.vue'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import type { OperationKind } from '@/domain/fengshen/types'

const store = useFengshenStore()

onMounted(() => {
  void store.loadLogs()
})

const OP_META: Record<OperationKind, { label: string; cls: string }> = {
  create: { label: '新增', cls: 'fs-tag-ok' },
  update: { label: '修改', cls: 'fs-tag-aura' },
  delete: { label: '删除', cls: 'fs-tag-danger' },
  import: { label: '导入', cls: 'fs-tag-buff' },
}

function opLabel(op: OperationKind): string {
  return OP_META[op].label
}

function opTagClass(op: OperationKind): string {
  return OP_META[op].cls
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>
