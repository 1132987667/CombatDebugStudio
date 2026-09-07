<template>
  <Dialog :model-value="open" title="敌人横向对比" width="720px" @update:model-value="onModelValue">
    <div class="fs-table-wrap">
      <table class="fs-table fs-cmp-table">
        <thead>
          <tr>
            <th class="fs-cmp-label">指标</th>
            <th v-for="r in rows" :key="String(r.id)" class="fs-cmp-col">{{ r.name }}<span class="fs-cmp-id">{{ r.id }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in metricRows" :key="m.label">
            <td class="fs-cmp-label">{{ m.label }}</td>
            <td v-for="r in rows" :key="String(r.id)" :class="{ 'fs-cmp-best': isBest(m, r) }"
              class="fs-cell-num">{{ m.value(r) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="fs-form-hint">数值列高亮 = 同行最大（越大越强）；命中/闪避取 stats 的 hit/dodge 值；技能数 = 小技能/被动/大招各自数组合计。</div>
    <template #footer>
      <Button variant="ghost" @click="emit('close')">关闭</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'

const props = defineProps<{
  open: boolean
  /** 选中的敌人行（2~4 条） */
  rows: Record<string, unknown>[]
}>()

const emit = defineEmits<{ close: [] }>()

/** 品阶码 → 中文名（对齐 enemies.json 的 role 值） */
const ROLE_LABELS: Record<string, string> = {
  xiaoyao: '小妖',
  normal: '小妖',
  elite: '妖兵',
  yaobing: '妖兵',
  yaotu: '妖徒',
  yaokui: '妖魁',
  yaowang: '妖王',
  yaozun: '妖尊',
}

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
  /** 数值行参与「最大值高亮」；文本行不参与 */
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

/** 该行是否为指标最大值（并列最大同高亮；文本行恒 false） */
function isBest(m: MetricRow, r: Record<string, unknown>): boolean {
  if (!m.pick || props.rows.length < 2) return false
  const v = m.pick(r)
  return props.rows.every((other) => m.pick!(other) <= v)
}

function onModelValue(v: boolean): void {
  if (!v) emit('close')
}
</script>

<style scoped lang="scss">
.fs-cmp-table {
  min-width: 480px;
}

.fs-cmp-label {
  width: 90px;
  color: var(--color-text-secondary);
}

.fs-cmp-col {
  min-width: 110px;

  .fs-cmp-id {
    display: block;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-md);
    font-family: var(--font-family-mono);
  }
}

.fs-cmp-best {
  color: var(--color-primary);
  font-weight: bold;
}
</style>
