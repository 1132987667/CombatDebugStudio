<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      全局健康检查
      <span class="fs-page-hint">引用断裂 · 命名重复 · 字段重复 扫描</span>
    </div>

    <div class="fs-stat-cards">
      <div class="fs-stat-card"><div class="fs-stat-num">{{ report?.scannedRules ?? 0 }}</div><div class="fs-stat-label">检查规则</div></div>
      <div class="fs-stat-card"><div class="fs-stat-num">{{ report?.checkedEntities ?? 0 }}</div><div class="fs-stat-label">检查条目</div></div>
      <div class="fs-stat-card" :class="countByKind('integrity') > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ countByKind('integrity') }}</div><div class="fs-stat-label">断裂引用</div>
      </div>
      <div class="fs-stat-card" :class="countByKind('duplicate_name') > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ countByKind('duplicate_name') }}</div><div class="fs-stat-label">命名重复</div>
      </div>
      <div class="fs-stat-card" :class="countByKind('duplicate_ref') > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ countByKind('duplicate_ref') }}</div><div class="fs-stat-label">字段重复</div>
      </div>
    </div>

    <div class="fs-table-wrap">
      <table class="fs-table">
        <thead>
          <tr><th>类别</th><th>引用方</th><th>引用字段</th><th>问题对象</th><th>目标表</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="(issue, i) in report?.issues ?? []" :key="i">
            <td><span class="fs-kind" :class="`fs-kind-${issue.kind}`">{{ kindLabel(issue.kind) }}</span></td>
            <td class="fs-cell-id">{{ issue.sourceId }}</td>
            <td>{{ issue.field }}</td>
            <td class="fs-cell-missing">
              {{ issue.missingId }}
              <span v-if="issue.detail" class="fs-kind-detail">{{ issue.detail }}</span>
            </td>
            <td :title="`表名：${issue.targetTable}`">{{ tableLabel(issue.targetTable) }}</td>
            <td class="fs-col-actions">
              <Button size="small" :title="`跳转到「${tableLabel(issue.sourceTable)}」表并定位该实体`"
                @click="store.navigateTo(issue.sourceTable, issue.sourceId)">定位引用方</Button>
              <Button size="small" :title="`跳转到「${tableLabel(issue.targetTable)}」表`"
                @click="store.navigateTo(issue.targetTable)">目标表</Button>
            </td>
          </tr>
          <tr v-if="!report?.issues?.length">
            <td colspan="6" class="fs-empty">{{ report ? '未发现问题，数据自洽' : '尚未扫描，点击「重新扫描」' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="fs-toolbar" style="margin-top: 14px; justify-content: flex-start;">
      <Button variant="primary" @click="store.runHealth">重新扫描</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/presentation/components/Button.vue'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import type { FengshenTableName } from '@/domain/fengshen/types'
import type { HealthCheckKind } from '@/application/service/DataIntegrityService'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'

const store = useFengshenStore()
const report = computed(() => store.healthReport)

const KIND_LABEL: Record<HealthCheckKind, string> = {
  integrity: '引用断裂',
  duplicate_name: '命名重复',
  duplicate_ref: '字段重复',
}

function countByKind(kind: HealthCheckKind): number {
  return report.value?.issues.filter((i) => i.kind === kind).length ?? 0
}

function kindLabel(kind: HealthCheckKind): string {
  return KIND_LABEL[kind] ?? kind
}

function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as FengshenTableName]?.label ?? table
}
</script>
