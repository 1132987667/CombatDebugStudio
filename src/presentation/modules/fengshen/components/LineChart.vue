<template>
  <figure class="fs-chart">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="ariaLabel" class="fs-chart-svg">
      <!-- 网格 + 左右轴刻度 -->
      <g v-for="(t, i) in ticks" :key="`g${i}`">
        <line :x1="PAD_L" :x2="W - PAD_R" :y1="t.y" :y2="t.y" class="fs-chart-grid" />
        <text :x="PAD_L - 6" :y="t.y + 4" class="fs-chart-tick" text-anchor="end">{{ fmt(t.left) }}</text>
        <text :x="W - PAD_R + 6" :y="t.y + 4" class="fs-chart-tick" text-anchor="start">{{ fmt(t.right) }}</text>
      </g>
      <!-- x 轴刻度（每 xStep 个标签取一个） -->
      <text v-for="(lab, i) in xTicks" :key="`x${i}`" :x="xOf(lab.index)" :y="H - 4" class="fs-chart-tick"
        text-anchor="middle">{{ lab.text }}</text>
      <!-- 序列折线：null 为断点，分段绘制 -->
      <g v-for="(s, si) in series" :key="s.name">
        <polyline v-for="(seg, gi) in segments(s)" :key="gi" :points="seg" fill="none" :stroke="s.color"
          stroke-width="2" :stroke-dasharray="s.dashed ? '5 4' : undefined" stroke-linejoin="round" />
      </g>
    </svg>
    <figcaption class="fs-chart-legend">
      <span v-for="s in series" :key="s.name" class="fs-chart-legend-item">
        <span class="fs-chart-swatch" :class="{ dashed: s.dashed }"
          :style="s.dashed ? { color: s.color } : { background: s.color }" aria-hidden="true"></span>{{ s.name }}
      </span>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** 一条折线序列：points 与 labels 等长，null 为断点；axis 缺省 left */
export interface ChartSeries {
  name: string
  color: string
  points: Array<number | null>
  axis?: 'left' | 'right'
  dashed?: boolean
}

const props = withDefaults(defineProps<{
  /** x 轴全部标签（如等级 1..50） */
  labels: string[]
  series: ChartSeries[]
  /** x 轴刻度间隔（每 N 个标签画一个） */
  xStep?: number
  height?: number
  ariaLabel?: string
}>(), {
  xStep: 10,
  height: 260,
  ariaLabel: '折线图',
})

const W = 760
const PAD_L = 64
const PAD_R = 64
const PAD_T = 12
const H = computed(() => props.height)

/** 向上取整到 1/2/2.5/5 × 10^n 的「好看」刻度上限 */
function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * base >= v) return m * base
  }
  return 10 * base
}

/** 双轴各自的比例尺；空序列（全 null）按 0~1 兜底 */
function axisMax(side: 'left' | 'right'): number {
  let max = 0
  for (const s of props.series) {
    if ((s.axis ?? 'left') !== side) continue
    for (const p of s.points) if (p != null && p > max) max = p
  }
  return niceMax(max)
}

const leftMax = computed(() => axisMax('left'))
const rightMax = computed(() => axisMax('right'))

/** 左右轴共 5 条网格线：两侧各自满量程均分 4 段，网格线按比例落位（左右值共享同一 y） */
const ticks = computed(() =>
  [4, 3, 2, 1, 0].map((i) => ({
    left: (leftMax.value * i) / 4,
    right: (rightMax.value * i) / 4,
    y: PAD_T + plotH.value * (1 - i / 4),
  })),
)

const plotW = computed(() => W - PAD_L - PAD_R)
const plotH = computed(() => H.value - PAD_T - 20)

function xOf(i: number): number {
  const n = Math.max(1, props.labels.length - 1)
  return PAD_L + (plotW.value * i) / n
}

function scaleY(s: ChartSeries): (v: number) => number {
  const max = (s.axis ?? 'left') === 'right' ? rightMax.value : leftMax.value
  return (v) => PAD_T + plotH.value * (1 - v / (max || 1))
}

/** 序列按 null 断点切分为若干段 polyline 的 points 串 */
function segments(s: ChartSeries): string[] {
  const sy = scaleY(s)
  const out: string[] = []
  let cur: string[] = []
  s.points.forEach((p, i) => {
    if (p == null) {
      if (cur.length > 1) out.push(cur.join(' '))
      cur = []
      return
    }
    cur.push(`${xOf(i).toFixed(1)},${sy(p).toFixed(1)}`)
  })
  if (cur.length > 1) out.push(cur.join(' '))
  return out
}

/** x 轴刻度：每 xStep 个标签取一个，含末位 */
const xTicks = computed(() => {
  const out: Array<{ index: number; text: string }> = []
  for (let i = 0; i < props.labels.length; i += props.xStep) {
    out.push({ index: i, text: props.labels[i] })
  }
  const last = props.labels.length - 1
  if (last >= 0 && (out.length === 0 || out[out.length - 1].index !== last)) {
    out.push({ index: last, text: props.labels[last] })
  }
  return out
})

/** 刻度数值：千分位省显示（45000 → 45k），避免轴文字挤压 */
function fmt(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k`
  return String(Math.round(v * 100) / 100)
}
</script>

<style scoped lang="scss">
.fs-chart {
  margin: 0;
}

.fs-chart-svg {
  width: 100%;
  height: auto;
  display: block;
}

.fs-chart-grid {
  stroke: var(--color-border-default);
  stroke-width: 1;
  stroke-dasharray: 2 4;
}

.fs-chart-tick {
  font-size: var(--font-size-md);
  fill: var(--color-text-tertiary);
}

.fs-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3) 0;
}

.fs-chart-legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
}

.fs-chart-swatch {
  width: 14px;
  height: 3px;
  border-radius: 2px;

  &.dashed {
    background: repeating-linear-gradient(90deg, currentColor 0 5px, transparent 5px 8px);
  }
}
</style>
