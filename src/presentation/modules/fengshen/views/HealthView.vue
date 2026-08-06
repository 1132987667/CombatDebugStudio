<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      全局健康检查
      <span class="fs-page-hint">引用完整性扫描 · 断裂引用报告</span>
    </div>

    <div class="fs-stat-cards">
      <div class="fs-stat-card"><div class="fs-stat-num">{{ report?.scannedRules ?? 0 }}</div><div class="fs-stat-label">检查规则</div></div>
      <div class="fs-stat-card"><div class="fs-stat-num">{{ report?.checkedEntities ?? 0 }}</div><div class="fs-stat-label">检查条目</div></div>
      <div class="fs-stat-card" :class="issueCount > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ issueCount }}</div><div class="fs-stat-label">断裂引用</div>
      </div>
    </div>

    <div class="fs-table-wrap">
      <table class="fs-table">
        <thead>
          <tr><th>引用方</th><th>引用字段</th><th>缺失 ID</th><th>目标表</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="(issue, i) in report?.issues ?? []" :key="i">
            <td class="fs-cell-id">{{ issue.sourceId }}</td>
            <td>{{ issue.field }}</td>
            <td class="fs-cell-missing">{{ issue.missingId }}</td>
            <td :title="`表名：${issue.targetTable}`">{{ tableLabel(issue.targetTable) }}</td>
            <td class="fs-col-actions">
              <Button size="small" :title="`跳转到「${tableLabel(issue.sourceTable)}」表并定位该实体`"
                @click="store.navigateTo(issue.sourceTable, issue.sourceId)">定位引用方</Button>
              <Button size="small" :title="`跳转到「${tableLabel(issue.targetTable)}」表`"
                @click="store.navigateTo(issue.targetTable)">目标表</Button>
            </td>
          </tr>
          <tr v-if="!report?.issues?.length">
            <td colspan="5" class="fs-empty">{{ report ? '未发现断裂引用' : '尚未扫描，点击「重新扫描」' }}</td>
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
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'

const store = useFengshenStore()
const report = computed(() => store.healthReport)
const issueCount = computed(() => report.value?.issues.length ?? 0)

function tableLabel(table: FengshenTableName): string {
  return TABLE_SCHEMAS[table]?.label ?? table
}
</script>
