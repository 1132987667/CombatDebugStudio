<template>
  <Dialog :model-value="open" title="敌人横向对比" width="760px" @update:model-value="onModelValue">
    <div class="fs-table-wrap">
      <table class="fs-table fs-cmp-table">
        <thead>
          <tr>
            <th class="fs-cmp-label">指标</th>
            <th v-for="(r, i) in rows" :key="String(r.id)" class="fs-cmp-col">
              <button type="button" class="fs-cmp-col-btn" :class="{ base: i === baseIdx }"
                :title="i === baseIdx ? '当前基准列' : `点击设为基准（差值相对「${r.name}」计算）`"
                @click="baseIdx = i">
                {{ r.name }}<span class="fs-cmp-id">{{ r.id }}</span>
                <span v-if="i === baseIdx" class="fs-cmp-base-tag">基准</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in metricRows" :key="m.label">
            <td class="fs-cmp-label">{{ m.label }}</td>
            <td v-for="(r, i) in rows" :key="String(r.id)" class="fs-cmp-cell"
              :class="{ 'fs-cmp-best': isBest(m, i) }">
              <span class="fs-cmp-val">{{ m.value(r) }}</span>
              <span v-if="deltaText(m, i)" class="fs-cmp-delta" :class="{ neg: isNeg(m, i) }">{{ deltaText(m, i) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="fs-form-hint">
      点击列头切换基准：其余列的灰色小字为相对基准的差值（+强 / −弱）；
      每行最大值高亮（全 0 视为数据缺失不高亮）；命中/闪避取 stats 的 hit/dodge 值；技能数 = 小技能/被动/大招各自数组合计。
    </div>
    <template #footer>
      <Button variant="ghost" @click="emit('close')">关闭</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import { ENEMY_ROLE_LABELS } from '@/domain/fengshen/role-grades'

const props = defineProps<{
  open: boolean
  /** 选中的敌人行（2~4 条） */
  rows: Record<string, unknown>[]
}>()

const emit = defineEmits<{ close: [] }>()

/** 基准列（差值%相对该列计算）；行集合变化时收敛到有效索引 */
const baseIdx = ref(0)
watch(() => props.rows, (rows) => {
  if (baseIdx.value >= rows.length) baseIdx.value = 0
})

/** 品阶码 → 中文名（单一来源 role-grades） */
const ROLE_LABELS: Record<string, string> = ENEMY_ROLE_LABELS

function stat(r: Record<string, unknown>, key: string): number {
  const stats = r.stats as Record<string, number> | undefined
  return typeof stats?.[key] === 'number' ? stats[key] : 0
}

function num(r: Record<string, unknown>, key: string): number {
  return typeof r[key] === 'number' ? (r[key] as number) : 0
}

/** 技能组条数（small/passive/ultimate 兼容字符串单值形态） */
function skillCount(r: Record<string, unknown>, key: string): number {
  const skills = r.skills as Record<string, unknown> | undefined
  const v = skills?.[key]
  if (Array.isArray(v)) return v.length
  return typeof v === 'string' && v ? 1 : 0
}

function dropCount(r: Record<string, unknown>): number {
  return Array.isArray(r.drops) ? r.drops.length : 0
}

interface MetricRow {
  label: string
  /** 数值行参与「最大值高亮」与基准差值；文本行不参与 */
  pick?: (r: Record<string, unknown>) => number
  value: (r: Record<string, unknown>) => string
}

const metricRows: MetricRow[] = [
  { label: '等级', pick: (r) => num(r, 'level'), value: (r) => String(r.level ?? '—') },
  { label: '品阶', value: (r) => ROLE_LABELS[String(r.role)] ?? String(r.role ?? '—') },
  { label: '气血', pick: (r) => stat(r, 'maxHealth'), value: (r) => String(stat(r, 'maxHealth')) },
  { label: '攻击', pick: (r) => stat(r, 'attack'), value: (r) => String(stat(r, 'attack')) },
  { label: '防御', pick: (r) => stat(r, 'defense'), value: (r) => String(stat(r, 'defense')) },
  { label: '速度', pick: (r) => stat(r, 'speed'), value: (r) => String(stat(r, 'speed')) },
  { label: '命中', pick: (r) => stat(r, 'hit'), value: (r) => String(stat(r, 'hit')) },
  { label: '闪避', pick: (r) => stat(r, 'dodge'), value: (r) => String(stat(r, 'dodge')) },
  { label: '暴击率', pick: (r) => stat(r, 'critRate'), value: (r) => `${stat(r, 'critRate')}%` },
  { label: '暴击伤害', pick: (r) => stat(r, 'critDamage'), value: (r) => `${stat(r, 'critDamage')}%` },
  {
    label: '技能数',
    pick: (r) => skillCount(r, 'small') + skillCount(r, 'passive') + skillCount(r, 'ultimate'),
    value: (r) =>
      `${skillCount(r, 'small')} / ${skillCount(r, 'passive')} / ${skillCount(r, 'ultimate')}`,
  },
  { label: '掉落物', pick: dropCount, value: (r) => `${dropCount(r)} 种` },
]

/** 该行（列 i）是否为指标最大值；并列最大同高亮；全 0（数据缺失）不高亮 */
function isBest(m: MetricRow, i: number): boolean {
  if (!m.pick || props.rows.length < 2) return false
  const v = m.pick(props.rows[i])
  if (v === 0) return false
  return props.rows.every((other) => m.pick!(other) <= v)
}

/** 列 i 相对基准列的差值百分比；基准自身 / 基准为 0 / 文本行返回 null */
function deltaText(m: MetricRow, i: number): string | null {
  if (!m.pick || i === baseIdx.value || !props.rows[baseIdx.value]) return null
  const base = m.pick(props.rows[baseIdx.value])
  const v = m.pick(props.rows[i])
  if (base === 0) return null
  const pct = Math.round(((v - base) / base) * 100)
  if (pct === 0) return null
  return `${pct > 0 ? '+' : ''}${pct}%`
}

function isNeg(m: MetricRow, i: number): boolean {
  if (!m.pick || i === baseIdx.value) return false
  return m.pick(props.rows[i]) < m.pick(props.rows[baseIdx.value])
}

function onModelValue(v: boolean): void {
  if (!v) emit('close')
}
</script>

<style scoped lang="scss">
.fs-cmp-table {
  min-width: 520px;
}

.fs-cmp-label {
  width: 90px;
  color: var(--color-text-secondary);
}

.fs-cmp-col {
  min-width: 110px;
  padding: 0;
}

.fs-cmp-col-btn {
  width: 100%;
  display: block;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: inherit;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;

  &.base {
    box-shadow: inset 0 -2px 0 var(--color-info);
  }

  &:hover .fs-cmp-base-tag {
    visibility: visible;
  }
}

.fs-cmp-base-tag {
  visibility: hidden;
  margin-left: var(--space-1);
  color: var(--color-info);
  font-size: var(--font-size-md);
}

.fs-cmp-col-btn.base .fs-cmp-base-tag {
  visibility: visible;
}

.fs-cmp-id {
  display: block;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
  font-family: var(--font-family-mono);
}

.fs-cmp-cell {
  padding: var(--space-2) var(--space-3);
}

.fs-cmp-val {
  display: block;
  font-variant-numeric: tabular-nums;
}

.fs-cmp-delta {
  display: block;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;

  &.neg {
    color: var(--color-danger);
  }
}

.fs-cmp-best .fs-cmp-val {
  color: var(--color-info);
  font-weight: bold;
}
</style>
