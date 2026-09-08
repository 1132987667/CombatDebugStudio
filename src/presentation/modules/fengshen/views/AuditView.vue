<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      来源审计
      <span class="fs-page-hint">64 项核心数值属性 × 系统投放矩阵（只读视图）</span>
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
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="fs-form-hint">
        ● 主来源 · ○ 副来源 · 空 = 不参与 ·
        <span class="fs-audit-missing-label">高亮行</span> = 缺失主来源
      </div>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">
        掉落归属总账
        <span class="fs-page-hint">enemies.drops → 物品归属（独家投放 = 只由一只怪掉落；零投放 = 全集中无任何敌人掉落）</span>
      </div>
      <div class="fs-audit-spread">
        <span class="fs-audit-spread-item"><b>{{ dropSpread.one }}</b> 种仅 1 只怪掉</span>
        <span class="fs-audit-spread-item"><b>{{ dropSpread.two }}</b> 种 2 只怪掉</span>
        <span class="fs-audit-spread-item"><b>{{ dropSpread.few }}</b> 种 3~5 只怪掉</span>
        <span class="fs-audit-spread-item"><b>{{ dropSpread.many }}</b> 种 6+ 只怪掉</span>
        <span class="fs-audit-spread-item">投放物品共 {{ ownership.length }} 种</span>
      </div>
      <div class="fs-audit-drop-grid">
        <div>
          <div class="fs-form-hint">独家投放（{{ exclusiveDrops.length }} 种，点击物品/敌人定位）</div>
          <div class="fs-table-wrap fs-audit-scroll">
            <table class="fs-table">
              <thead><tr><th>物品</th><th>掉落敌人</th></tr></thead>
              <tbody>
                <tr v-for="row in exclusiveDrops" :key="row.itemId">
                  <td>
                    <button type="button" class="fs-audit-link" :title="`点击在「${itemTableLabel(row.itemId)}」表定位`"
                      @click="gotoItem(row.itemId)">{{ itemName(row.itemId) }}</button>
                    <span class="fs-audit-item-id">{{ row.itemId }}</span>
                  </td>
                  <td>
                    <button type="button" class="fs-audit-link" title="点击在敌人表定位"
                      @click="gotoEnemy(row.enemies[0]!.id)">{{ row.enemies[0]?.name ?? '—' }}</button>
                  </td>
                </tr>
                <tr v-if="!exclusiveDrops.length">
                  <td colspan="2" class="fs-empty">无独家投放物品</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="fs-form-hint">零投放（{{ zeroDrops.length }} 种，无任何敌人掉落）</div>
          <TacticalInput :model-value="zeroFilter" placeholder="过滤物品名 / ID…" aria-label="过滤零投放物品"
            @update:model-value="zeroFilter = String($event ?? '')" />
          <div class="fs-table-wrap fs-audit-scroll fs-audit-zero-scroll">
            <table class="fs-table">
              <thead><tr><th>物品</th></tr></thead>
              <tbody>
                <tr v-for="id in zeroDrops" :key="id">
                  <td>
                    <button type="button" class="fs-audit-link" title="点击在对应表定位"
                      @click="gotoItem(id)">{{ itemName(id) }}</button>
                    <span class="fs-audit-item-id">{{ id }}</span>
                  </td>
                </tr>
                <tr v-if="!zeroDrops.length">
                  <td class="fs-empty">{{ zeroFilter ? '过滤后无匹配物品' : '全部物品均有敌人投放' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import type { AttributeDef, SystemBudgetConfig } from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import { getCoreAttributes } from '@/domain/fengshen/attribute-dictionary'
import TacticalInput from '@/presentation/components/TacticalInput.vue'
import {
  dropOwnership,
  zeroDropItemIds,
} from '@/domain/fengshen/data-insight'

const api = container.resolve<GameDataApi>('GameDataApi')
const store = useFengshenStore()

/** 64 项核心数值属性 code（权威字典）；审计矩阵只投这些 */
const CORE_CODES = new Set(getCoreAttributes().map((e) => e.code))

const attributes = ref<AttributeDef[]>([])
const budget = ref<SystemBudgetConfig>({ id: 'system_budget', systems: [] })

// ── 投放总账：掉落归属（装备属性频次已随 PRD §21 公式化删除，静态表无 stats 可统计） ──
const enemies = ref<Enemy[]>([])
/** 物品全集 id → 名称 + 所在表（items/materials/equipment），供跳转定位 */
interface ItemRef { name: string; table: 'items' | 'materials' | 'equipment' }
const itemIndex = ref<Record<string, ItemRef>>({})
const zeroFilter = ref('')

const ownership = computed(() => dropOwnership(enemies.value))
const exclusiveDrops = computed(() => ownership.value.filter((r) => r.enemies.length === 1))
const zeroDrops = computed(() => {
  const ids = zeroDropItemIds(Object.keys(itemIndex.value).map((id) => ({ id })), enemies.value)
  const kw = zeroFilter.value.trim().toLowerCase()
  if (!kw) return ids
  return ids.filter((id) => id.toLowerCase().includes(kw) || (itemIndex.value[id]?.name ?? '').toLowerCase().includes(kw))
})

/** 掉落分布：按"掉落怪数量"分桶统计物品种类数（投放集中度一眼可见） */
const dropSpread = computed(() => {
  const buckets = { one: 0, two: 0, few: 0, many: 0 }
  for (const row of ownership.value) {
    const n = row.enemies.length
    if (n === 1) buckets.one++
    else if (n === 2) buckets.two++
    else if (n <= 5) buckets.few++
    else buckets.many++
  }
  return buckets
})

function itemName(id: string): string {
  return itemIndex.value[id]?.name ?? id
}

function itemTableLabel(id: string): string {
  const table = itemIndex.value[id]?.table
  return table === 'items' ? '物品' : table === 'materials' ? '材料' : '装备'
}

/** 点击物品 → 跳到其所在表并定位（引用断裂同款跳转） */
function gotoItem(id: string): void {
  const item = itemIndex.value[id]
  if (item) store.navigateTo(item.table, id)
}

function gotoEnemy(id: string): void {
  store.navigateTo('enemies', id)
}

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

onMounted(async () => {
  const [attrs, sb, eqs, enm, items, materials] = await Promise.all([
    api.listAttributes(),
    api.getSystemBudget(),
    api.listEquipment(),
    api.listByTable<Enemy>('enemies', { limit: 1000 }),
    api.listByTable<{ id: string; name?: string }>('items', { limit: 5000 }),
    api.listByTable<{ id: string; name?: string }>('materials', { limit: 5000 }),
  ])
  attributes.value = attrs.filter((a) => !a.isRuntimeState && CORE_CODES.has(a.code))
  budget.value = sb ?? { id: 'system_budget', systems: [] }
  totalWeight.value = budget.value.systems.reduce((sum, s) => sum + s.weight, 0)
  enemies.value = enm
  const index: Record<string, ItemRef> = {}
  for (const it of items) index[it.id] = { name: String(it.name ?? it.id), table: 'items' }
  for (const it of materials) index[it.id] = { name: String(it.name ?? it.id), table: 'materials' }
  for (const eq of eqs) index[eq.id] = { name: eq.name, table: 'equipment' }
  itemIndex.value = index
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
  font-size: var(--font-size-md);
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
  background: var(--color-info);
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
  font-size: var(--font-size-md);
  border-radius: 50%;

  &.primary {
    color: var(--color-info);
    font-weight: bold;
  }

  &.secondary {
    color: var(--color-text-tertiary);
  }
}

.fs-audit-missing {
  background: var(--color-warning-bg);
}

.fs-audit-warning {
  color: var(--color-warning);
  font-weight: bold;
  font-size: var(--font-size-md);
}

.fs-audit-missing-label {
  background: var(--color-warning-bg);
  padding: 0 var(--space-1);
  border-radius: 2px;
}

.fs-audit-scroll {
  max-height: 320px;
  overflow-y: auto;
}

.fs-audit-freq-cell {
  display: flex;
  align-items: center;
  gap: var(--space-2);

  .fs-audit-budget-bar {
    min-width: 120px;
  }
}

.fs-audit-freq-num {
  min-width: 40px;
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}

.fs-audit-drop-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.fs-audit-item-id {
  display: block;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
  font-family: var(--font-family-mono);
}

.fs-audit-spread {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
}

.fs-audit-spread-item {
  color: var(--color-text-secondary);

  b {
    color: var(--color-info);
  }
}

.fs-audit-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--color-info);
  font: inherit;
  cursor: pointer;
  text-align: left;

  &:hover {
    text-decoration: underline;
  }
}

.fs-audit-zero-scroll {
  max-height: 240px;
  margin-top: var(--space-2);
}
</style>
