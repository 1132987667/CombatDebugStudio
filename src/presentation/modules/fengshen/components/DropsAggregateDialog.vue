<!--
* 文件: DropsAggregateDialog.vue
* 功能: 封神榜掉落聚合试算（enemies 表多选）
* 描述: 对勾选的多个敌人做「连战总产出」试算：同物品跨敌合并（至少一件用复合概率），
*       奖励区间逐敌求和；模拟对照按每轮连战全部敌人实测。纯配置计算，不进引擎。
* 依赖: drop-sim 聚合纯函数（domain）；Dialog/Button 公共组件
-->
<template>
  <Dialog :model-value="open" :title="`掉落聚合试算 · ${entities.length} 个敌人`" width="720px"
    @update:model-value="onModelValue">
    <div class="fs-ds">
      <table v-if="report?.items.length" class="fs-qv-table">
        <thead>
          <tr>
            <th>物品</th>
            <th title="掉落表含该物品的敌人数">来源</th>
            <th title="连战全部敌人后至少出一件的概率 = 1-∏(1-ci)">至少一件</th>
            <th title="连战全部敌人的期望总件数 = Σ ci×qi">期望件数</th>
            <th v-if="observation" title="模拟实测：至少出一件的轮次占比">实测</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in report.items" :key="it.itemId">
            <td :title="`id: ${it.itemId}`">{{ itemName(it.itemId) }}</td>
            <td>×{{ it.sources }}</td>
            <td>{{ pct(it.atLeastOne) }}</td>
            <td>{{ round3(it.expectedTotal) }}</td>
            <td v-if="observation">{{ pct(observation.observedAtLeastOne[it.itemId] ?? 0) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="fs-ds-empty">所选敌人均未配置掉落。</div>

      <table v-if="report?.money || report?.exp" class="fs-qv-table">
        <thead>
          <tr>
            <th>奖励</th>
            <th title="各敌人奖励区间逐敌求和">总区间</th>
            <th>期望/轮</th>
            <th v-if="observation">实测均值</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="report.money">
            <td>金钱</td>
            <td>{{ report.money.min }} ~ {{ report.money.max }}</td>
            <td>{{ round3(report.money.expected) }}</td>
            <td v-if="observation">{{ round3(observation.moneyObserved ?? 0) }}</td>
          </tr>
          <tr v-if="report.exp">
            <td>经验</td>
            <td>{{ report.exp.min }} ~ {{ report.exp.max }}</td>
            <td>{{ round3(report.exp.expected) }}</td>
            <td v-if="observation">{{ round3(observation.expObserved ?? 0) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="fs-ds-controls">
        <label class="fs-ds-field">
          <span>模拟轮数</span>
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
      <div class="fs-form-hint">解析口径按配置复合概率计算；模拟对照按种子实测「每轮连战全部敌人」，用于验证一局产出符合直觉。</div>
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
  aggregateDropSet,
  simulateDropSet,
  type DropSetObservation,
  type DropSetReport,
  type DropSetSource,
} from '@/domain/fengshen/drop-sim'
import { resolveRefName } from '@/domain/fengshen/refNames'

const props = defineProps<{
  open: boolean
  /** 勾选的敌人行（drops / money / exp） */
  entities: Array<Record<string, unknown>>
  /** 全表引用字典（id → 中文名） */
  refIndex?: Record<string, string>
}>()

const emit = defineEmits<{ close: [] }>()

const report = ref<DropSetReport | null>(null)
const observation = ref<DropSetObservation | null>(null)
const trials = ref(1000)
const seed = ref('')

function dropsOf(e: Record<string, unknown>): EnemyDrop[] {
  return Array.isArray(e.drops) ? (e.drops as EnemyDrop[]) : []
}

function rangeOf(v: unknown): [number, number] | undefined {
  return Array.isArray(v) && v.length === 2
    && typeof v[0] === 'number' && typeof v[1] === 'number' ? (v as [number, number]) : undefined
}

function sources(): DropSetSource[] {
  return props.entities.map((e) => ({
    drops: dropsOf(e),
    money: rangeOf(e.money),
    exp: rangeOf(e.exp),
  }))
}

function recompute(): void {
  observation.value = null
  if (!props.open) return
  report.value = aggregateDropSet(sources())
}

watch(() => [props.open, props.entities], recompute, { immediate: true })

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
  observation.value = simulateDropSet(sources(), trials.value, seed.value.trim() || undefined)
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
