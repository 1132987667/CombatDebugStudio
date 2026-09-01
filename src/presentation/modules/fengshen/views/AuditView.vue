<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      来源审计
      <span class="fs-page-hint">属性 × 系统投放矩阵（只读视图）</span>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">养成系统预算权重</div>
      <div class="fs-audit-budget">
        <div v-for="s in budget.systems" :key="s.system" class="fs-audit-budget-item">
          <span class="fs-audit-budget-label">{{ s.label }}</span>
          <div class="fs-audit-budget-bar">
            <div class="fs-audit-budget-fill" :style="{ width: budgetPercent(s) }"></div>
          </div>
          <span class="fs-audit-budget-weight">{{ s.weight }}（{{ budgetPercent(s) }}）</span>
        </div>
      </div>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">属性来源矩阵</div>
      <div class="fs-table-wrap">
        <table class="fs-table fs-audit-matrix">
          <thead>
            <tr>
              <th class="fs-audit-attr-col">属性</th>
              <th v-for="sys in SYSTEM_LABELS" :key="sys.key" class="fs-audit-sys-col">{{ sys.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="attr in attributes" :key="attr.id" :class="{ 'fs-audit-missing': attr.systems.length === 0 }">
              <td class="fs-audit-attr-name">
                {{ attr.name }}
                <span v-if="attr.systems.length === 0" class="fs-audit-warning" title="缺失主来源">!</span>
              </td>
              <td v-for="sys in SYSTEM_LABELS" :key="sys.key" class="fs-audit-cell">
                <span v-if="isPrimary(attr, sys.key)" class="fs-audit-dot primary" title="主来源">●</span>
                <span v-else-if="isSecondary(attr, sys.key)" class="fs-audit-dot secondary" title="副来源">○</span>
                <span v-else-if="isForbidden(attr, sys.key)" class="fs-audit-dot forbidden" title="禁止">✕</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="fs-form-hint">
        ● 主来源 · ○ 副来源 · ✕ 禁止 · 空 = 不参与 ·
        <span class="fs-audit-missing-label">高亮行</span> = 缺失主来源
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import type { AttributeDef, SystemBudgetConfig } from '@/domain/fengshen/types'

const api = container.resolve<GameDataApi>('GameDataApi')

const attributes = ref<AttributeDef[]>([])
const budget = ref<SystemBudgetConfig>({ id: 'system_budget', systems: [] })

const SYSTEM_LABELS = [
  { key: 'level', label: '等级' },
  { key: 'equipment', label: '装备' },
  { key: 'school', label: '流派' },
  { key: 'pet', label: '宠物' },
  { key: 'mount', label: '坐骑' },
  { key: 'artifact', label: '法宝' },
  { key: 'relic', label: '神器' },
] as const

const totalWeight = ref(0)

function budgetPercent(s: { weight: number }): string {
  const total = totalWeight.value || 1
  return ((s.weight / total) * 100).toFixed(1) + '%'
}

function isPrimary(attr: AttributeDef, system: string): boolean {
  return attr.systems.length > 0 && attr.systems[0] === system
}

function isSecondary(attr: AttributeDef, system: string): boolean {
  return attr.systems.length > 1 && attr.systems.slice(1).includes(system)
}

function isForbidden(_attr: AttributeDef, _system: string): boolean {
  return false
}

onMounted(async () => {
  const [attrs, sb] = await Promise.all([api.listAttributes(), api.getSystemBudget()])
  attributes.value = attrs.filter((a) => !a.isRuntimeState)
  budget.value = sb ?? { id: 'system_budget', systems: [] }
  totalWeight.value = budget.value.systems.reduce((sum, s) => sum + s.weight, 0)
})
</script>

<style scoped lang="scss">
.fs-audit-budget {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.fs-audit-budget-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 200px;
}

.fs-audit-budget-label {
  width: 48px;
  text-align: right;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.fs-audit-budget-bar {
  flex: 1;
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.fs-audit-budget-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.fs-audit-budget-weight {
  width: 80px;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.fs-audit-matrix {
  min-width: 600px;
}

.fs-audit-attr-col {
  width: 160px;
  min-width: 160px;
}

.fs-audit-sys-col {
  width: 64px;
  min-width: 64px;
  text-align: center;
}

.fs-audit-attr-name {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.fs-audit-cell {
  text-align: center;
  padding: var(--space-1) var(--space-2);
}

.fs-audit-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  font-size: 12px;
  border-radius: 50%;

  &.primary {
    color: var(--color-primary);
    font-weight: bold;
  }

  &.secondary {
    color: var(--color-text-tertiary);
  }

  &.forbidden {
    color: var(--color-danger);
  }
}

.fs-audit-missing {
  background: var(--color-warning-bg);
}

.fs-audit-warning {
  color: var(--color-warning);
  font-weight: bold;
  font-size: var(--font-size-sm);
}

.fs-audit-missing-label {
  background: var(--color-warning-bg);
  padding: 0 var(--space-1);
  border-radius: 2px;
}
</style>
