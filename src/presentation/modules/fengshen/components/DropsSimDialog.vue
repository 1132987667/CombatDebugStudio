<!--
* 文件: DropsSimDialog.vue
* 功能: 封神榜掉落试算（enemies 表）
* 描述: 对当前敌人行的 drops 与金钱/经验奖励区间做数值试算：解析口径给出单次期望与
*       「打 n 次至少出一件」概率，蒙特卡洛对照给出实测掉率。纯配置计算，不进引擎。
* 依赖: drop-sim（domain 纯函数）；Dialog/Button 公共组件
-->
<template>
  <Dialog :model-value="open" :title="`掉落试算 · ${entityName}`" width="720px" @update:model-value="onModelValue">
    <div class="fs-ds">
      <table v-if="report?.items.length" class="fs-qv-table">
        <thead>
          <tr>
            <th>物品</th><th>掉率</th><th>数量</th><th>期望/次</th>
            <th title="打 10 次至少出一件的概率">≥1件@10次</th>
            <th title="打 50 次至少出一件的概率">≥1件@50次</th>
            <th title="打 100 次至少出一件的概率">≥1件@100次</th>
            <th v-if="observation" title="模拟实测掉率">实测</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in report.items" :key="it.itemId">
            <td :title="`id: ${it.itemId}`">{{ itemName(it.itemId) }}</td>
            <td>{{ pct(it.chance) }}</td>
            <td>×{{ it.quantity }}</td>
            <td>{{ round3(it.expected) }}</td>
            <td>{{ pct(probAtLeastOne(it.chance, 10)) }}</td>
            <td>{{ pct(probAtLeastOne(it.chance, 50)) }}</td>
            <td>{{ pct(probAtLeastOne(it.chance, 100)) }}</td>
            <td v-if="observation">{{ pct(observation.observedRates[it.itemId] ?? 0) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="fs-ds-empty">该敌人未配置掉落。</div>

      <table v-if="report?.money || report?.exp" class="fs-qv-table">
        <thead>
          <tr><th>奖励</th><th>区间</th><th>期望/次</th><th v-if="observation">实测均值</th></tr>
        </thead>
        <tbody>
          <tr v-if="report.money">
            <td>金钱</td><td>{{ report.money.min }} ~ {{ report.money.max }}</td>
            <td>{{ round3(report.money.expected) }}</td>
            <td v-if="observation">{{ round3(observation.moneyObserved ?? 0) }}</td>
          </tr>
          <tr v-if="report.exp">
            <td>经验</td><td>{{ report.exp.min }} ~ {{ report.exp.max }}</td>
            <td>{{ round3(report.exp.expected) }}</td>
            <td v-if="observation">{{ round3(observation.expObserved ?? 0) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="fs-ds-controls">
        <label class="fs-ds-field">
          <span>模拟次数</span>
          <select v-model.number="trials" class="fs-ds-select">
            <option :value="1000">1000</option>
            <option :value="10000">10000</option>
            <option :value="100000">100000</option>
          </select>
        </label>
        <label class="fs-ds-field">
          <span>种子</span>
          <input v-model="seed" class="fs-ds-input" type="text" placeholder="留空随机" />
        </label>
        <Button size="small" variant="primary" @click="run">模拟对照</Button>
      </div>
      <div class="fs-form-hint">期望与「至少一件」概率按配置解析计算；模拟对照按种子实测，用于验证配置符合直觉。</div>
    </div>

    <template #footer>
      <Button variant="ghost" @click="emit('close')">关闭</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import type { EnemyDrop } from '@/shared/types/enemy'
import {
  analyzeDrops,
  probAtLeastOne,
  simulateDrops,
  type DropSimObservation,
  type DropSimReport,
} from '@/domain/fengshen/drop-sim'
import { resolveRefName } from '@/domain/fengshen/refNames'

const props = defineProps<{
  open: boolean
  /** enemies 表当前行（drops / money / exp） */
  entity: Record<string, unknown>
  /** 全表引用字典（id → 中文名） */
  refIndex?: Record<string, string>
}>()

const emit = defineEmits<{ close: [] }>()

const entityName = computed(() => String(props.entity.name ?? props.entity.id ?? ''))
const report = ref<DropSimReport | null>(null)
const observation = ref<DropSimObservation | null>(null)
const trials = ref(1000)
const seed = ref('')

function dropsOf(e: Record<string, unknown>): EnemyDrop[] {
  return Array.isArray(e.drops) ? (e.drops as EnemyDrop[]) : []
}

function rangeOf(v: unknown): [number, number] | undefined {
  return Array.isArray(v) && v.length === 2
    && typeof v[0] === 'number' && typeof v[1] === 'number' ? (v as [number, number]) : undefined
}

function recompute(): void {
  observation.value = null
  if (!props.open) return
  report.value = analyzeDrops(
    dropsOf(props.entity),
    rangeOf(props.entity.money),
    rangeOf(props.entity.exp),
  )
}

watch(() => [props.open, props.entity], recompute, { immediate: true })

function itemName(id: string): string {
  return resolveRefName(id, props.refIndex)
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function round3(v: number): string {
  return String(Math.round(v * 1000) / 1000)
}

function run(): void {
  observation.value = simulateDrops(
    dropsOf(props.entity),
    trials.value,
    seed.value.trim() || undefined,
    rangeOf(props.entity.money),
    rangeOf(props.entity.exp),
  )
}

function onModelValue(v: boolean): void {
  if (!v) emit('close')
}
</script>

<style scoped lang="scss">
.fs-ds {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.fs-ds-empty {
  color: var(--color-text-tertiary);
}

.fs-ds-controls {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
}

.fs-ds-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  > span {
    color: var(--color-text-tertiary);
  }
}

.fs-ds-select,
.fs-ds-input {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.fs-ds-input {
  min-width: 160px;
}
</style>
