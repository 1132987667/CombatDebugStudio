<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      系统投放明细
      <span class="fs-page-hint">各养成系统的属性投放规则 · 实际投放 vs 预算占比偏差</span>
    </div>

    <!-- 统计卡片 -->
    <div class="fs-stat-cards">
      <div class="fs-stat-card"><div class="fs-stat-num">{{ totalActualSap }}</div><div class="fs-stat-label">投放总 SAP（满级）</div></div>
      <div class="fs-stat-card"><div class="fs-stat-num">{{ totalBudgetWeight }}</div><div class="fs-stat-label">预算总权重</div></div>
      <div class="fs-stat-card" :class="warnCount > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ warnCount }}</div><div class="fs-stat-label">偏差预警（&gt;10%）</div>
      </div>
      <div class="fs-stat-card" :class="errorCount > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ errorCount }}</div><div class="fs-stat-label">严重偏差（&gt;50%）</div>
      </div>
    </div>

    <!-- 系统选择 + 保存 -->
    <div class="fs-toolbar">
      <TacticalSelect v-model="activeSystem" size="md" :options="systemOptions" aria-label="选择养成系统" />
      <span class="fs-spacer"></span>
      <span class="fs-version">评估等级 {{ evalLevel }}</span>
      <Button variant="primary" size="small" :disabled="!loaded" @click="save">保存配置</Button>
    </div>

    <!-- 投放规则表 -->
    <div class="fs-exp-block">
      <div class="fs-block-title">{{ activeLabel }} · 投放规则（{{ activeRules.length }} 条）</div>
      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th>属性</th><th>模式</th><th>定值 / 区间 / 模板参数</th><th>满级值</th><th>SAP</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="(rule, i) in activeRules" :key="i">
              <td>
                <select v-model="rule.attribute" class="fs-input fs-rule-input" aria-label="属性">
                  <option v-for="a in attrOptions" :key="a.id" :value="a.id">{{ a.name }}（{{ a.id }}）</option>
                </select>
              </td>
              <td>
                <select v-model="rule.mode" class="fs-input fs-rule-mode" aria-label="投放模式"
                  @change="onModeChange(rule)">
                  <option value="fixed">定值</option>
                  <option value="range">区间</option>
                  <option value="formula">公式</option>
                </select>
              </td>
              <td>
                <template v-if="rule.mode === 'fixed'">
                  <input v-model.number="rule.value" type="number" class="fs-input fs-exp-num-sm" min="0" />
                </template>
                <template v-else-if="rule.mode === 'range'">
                  <input v-model.number="rule.range!.min" type="number" class="fs-input fs-exp-num-sm" min="0" aria-label="区间下限" />
                  ~
                  <input v-model.number="rule.range!.max" type="number" class="fs-input fs-exp-num-sm" min="0" aria-label="区间上限" />
                </template>
                <template v-else>
                  <span class="fs-exp-field-label">k×等级+b：</span>
                  <input v-model.number="rule.formula!.k" type="number" step="0.1" class="fs-input fs-exp-num-sm" aria-label="斜率 k" />
                  <input v-model.number="rule.formula!.b" type="number" step="0.1" class="fs-input fs-exp-num-sm" aria-label="截距 b" />
                </template>
              </td>
              <td class="fs-cell-num">{{ ruleValue(rule) }}</td>
              <td class="fs-cell-num">{{ ruleSap(rule) }}</td>
              <td class="fs-col-actions">
                <Button size="small" @click="removeRule(i)">删除</Button>
              </td>
            </tr>
            <tr v-if="!activeRules.length">
              <td colspan="6" class="fs-empty">本系统暂无投放规则，点击下方按钮添加</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="fs-exp-sim-row">
        <Button size="small" @click="addRule">添加投放规则</Button>
        <span class="fs-exp-field-label">本系统合计</span>
        <span class="fs-cell-num">{{ activeSap }} SAP</span>
        <span v-if="activeBudget" class="fs-exp-field-label">预算</span>
        <span v-if="activeBudget" class="fs-cell-num">{{ activeBudget.weight }} 权重（{{ (activeBudgetShare * 100).toFixed(1) }}%）</span>
      </div>
    </div>

    <!-- 偏差表 -->
    <div class="fs-exp-block">
      <div class="fs-block-title">实际投放 vs 预算（占比口径：偏差 =（实际占比 − 预算占比）÷ 预算占比）</div>
      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th>系统</th><th>预算权重</th><th>预算占比</th><th>实际 SAP</th><th>实际占比</th><th>偏差</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in deviationRows" :key="row.system">
              <td>{{ row.label }}</td>
              <td class="fs-cell-num">{{ row.noBudget ? '—' : row.budgetWeight }}</td>
              <td class="fs-cell-num">{{ row.noBudget ? '—' : (row.budgetShare * 100).toFixed(1) + '%' }}</td>
              <td class="fs-cell-num">{{ row.actualSap }}</td>
              <td class="fs-cell-num">{{ (row.actualShare * 100).toFixed(1) }}%</td>
              <td class="fs-cell-num" :class="row.status !== 'ok' ? 'fs-cell-dev-' + row.status : ''">
                {{ row.noBudget ? '无预算行' : (row.deviation > 0 ? '+' : '') + row.deviation + '%' }}
              </td>
              <td><span class="fs-sev" :class="`fs-sev-${row.status === 'ok' ? 'info' : row.status}`">{{ statusLabel(row) }}</span></td>
            </tr>
            <tr v-if="!deviationRows.length"><td colspan="7" class="fs-empty">配置加载中</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import Button from '@/presentation/components/Button.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import {
  budgetDeviations,
  evalDistributionValue,
  sapMultiplierIndex,
  type BudgetDeviationRow,
} from '@/domain/fengshen/system-distributor'
import type {
  AttributeDef,
  SystemBudgetConfig,
  SystemDistributionConfig,
  SystemDistributionEntry,
  SystemDistributionRule,
} from '@/domain/fengshen/types'

const api = container.resolve<GameDataApi>('GameDataApi')
const write = container.resolve<FengshenDataService>('FengshenDataService')
const notif = useNotificationStore()

const loaded = ref(false)
const draft = ref<SystemDistributionConfig>({ id: 'system_distribution', systems: [] })
const budget = ref<SystemBudgetConfig | null>(null)
const attributes = ref<AttributeDef[]>([])
const maxLevel = ref(50)
const activeSystem = ref('level')

const sapMultipliers = computed(() => sapMultiplierIndex(attributes.value))

const systemOptions = computed<TSelectOption[]>(() =>
  draft.value.systems.map((s) => ({ value: s.system, label: s.label })))

const activeEntry = computed<SystemDistributionEntry | null>(
  () => draft.value.systems.find((s) => s.system === activeSystem.value) ?? null)

const activeRules = computed<SystemDistributionRule[]>(() => activeEntry.value?.distributions ?? [])

const activeLabel = computed(() => activeEntry.value?.label ?? activeSystem.value)

const activeBudget = computed(() => budget.value?.systems.find((b) => b.system === activeSystem.value) ?? null)

const totalBudgetWeight = computed(() => budget.value?.systems.reduce((s, b) => s + b.weight, 0) ?? 0)

const evalLevel = computed(() => maxLevel.value)

const attrOptions = computed(() =>
  attributes.value
    .filter((a) => a.numeric !== false)
    .map((a) => ({ id: a.code, name: a.name })))

function ruleValue(rule: SystemDistributionRule): number {
  return Math.round(evalDistributionValue(rule, evalLevel.value) * 10) / 10
}

function ruleSap(rule: SystemDistributionRule): number {
  const v = evalDistributionValue(rule, evalLevel.value)
  return Math.round((v / (sapMultipliers.value[rule.attribute] ?? 1)) * 10) / 10
}

const activeSap = computed(() => {
  const m = sapMultipliers.value
  return Math.round(activeRules.value.reduce((s, r) => s + evalDistributionValue(r, evalLevel.value) / (m[r.attribute] ?? 1), 0) * 10) / 10
})

const activeBudgetShare = computed(() => {
  const total = totalBudgetWeight.value
  return total > 0 && activeBudget.value ? activeBudget.value.weight / total : 0
})

const totalActualSap = computed(() =>
  Math.round(draft.value.systems.reduce(
    (sum, e) => sum + e.distributions.reduce(
      (s, r) => s + evalDistributionValue(r, evalLevel.value) / (sapMultipliers.value[r.attribute] ?? 1), 0), 0) * 10) / 10)

const deviationRows = computed<BudgetDeviationRow[]>(() => {
  if (!budget.value) return []
  return budgetDeviations(draft.value, budget.value, sapMultipliers.value, evalLevel.value)
})

const warnCount = computed(() => deviationRows.value.filter((r) => !r.noBudget && r.status === 'warn').length)
const errorCount = computed(() => deviationRows.value.filter((r) => !r.noBudget && r.status === 'error').length)

function statusLabel(row: BudgetDeviationRow): string {
  if (row.noBudget) return '无预算'
  return row.status === 'ok' ? '正常' : row.status === 'warn' ? '预警' : '严重'
}

onMounted(async () => {
  const [dist, b, attrs, pc] = await Promise.all([
    api.getSystemDistribution(),
    api.getSystemBudget(),
    api.listAttributes(),
    api.getPlayerConfig(),
  ])
  draft.value = dist ?? { id: 'system_distribution', systems: [] }
  budget.value = b
  attributes.value = attrs
  maxLevel.value = pc?.maxLevel ?? 50
  if (draft.value.systems.length && !draft.value.systems.some((s) => s.system === activeSystem.value)) {
    activeSystem.value = draft.value.systems[0].system
  }
  loaded.value = true
})

function addRule(): void {
  const entry = activeEntry.value
  if (!entry) return
  entry.distributions.push({ attribute: 'attack', mode: 'fixed', value: 100 })
}

function removeRule(index: number): void {
  activeEntry.value?.distributions.splice(index, 1)
}

/** 模式切换时补齐对应字段（fixed→value / range→区间 / formula→linear 参数），清掉无关字段 */
function onModeChange(rule: SystemDistributionRule): void {
  if (rule.mode === 'fixed') {
    rule.value = rule.value ?? 100
    rule.range = undefined
    rule.formula = undefined
  } else if (rule.mode === 'range') {
    rule.range = rule.range ?? { min: 80, max: 120 }
    rule.value = undefined
    rule.formula = undefined
  } else {
    rule.formula = rule.formula ?? { template: 'linear', k: 2, b: 10 }
    rule.value = undefined
    rule.range = undefined
  }
}

async function save(): Promise<void> {
  const result = await write.save('params', {
    id: 'system_distribution',
    name: '系统投放明细',
    description: '各养成系统的属性投放规则（fixed 定值 / range 区间 / formula 模板），与 system_budget 占比对比输出偏差',
    data: JSON.parse(JSON.stringify(draft.value)),
  })
  if (result.ok) notif.toast('系统投放明细已保存', 'success', 3000)
  else notif.toast(`保存失败：${result.errors?.[0] ?? '未知错误'}`, 'error', 4000)
}
</script>

<style scoped>
.fs-rule-input {
  min-width: 150px;
}
.fs-rule-mode {
  min-width: 80px;
}
.fs-cell-dev-warn {
  color: var(--color-warning);
}
.fs-cell-dev-error {
  color: var(--color-danger);
}
.fs-sev {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 3px;
  font-size: var(--font-size-md);
  line-height: 1.6;
}
.fs-sev-ok,
.fs-sev-info {
  color: var(--color-text-secondary);
  background: rgba(var(--rgb-neutral), var(--alpha-wash-strong));
  border: 1px solid rgba(var(--rgb-neutral), var(--alpha-border));
}
.fs-sev-warn {
  color: var(--color-warning);
  background: rgba(var(--rgb-warning), var(--alpha-wash-strong));
  border: 1px solid rgba(var(--rgb-warning), var(--alpha-border));
}
.fs-sev-error {
  color: var(--color-danger);
  background: rgba(var(--rgb-danger), var(--alpha-wash-strong));
  border: 1px solid rgba(var(--rgb-danger), var(--alpha-border));
}
</style>
