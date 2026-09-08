<template>
  <figure ref="rootEl" class="fs-chart">
    <svg ref="svgEl" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="ariaLabel" class="fs-chart-svg"
      @mousemove="onMove" @mouseleave="hoverIdx = null">
      <!-- 网格 + 左右轴刻度（右轴仅在有右侧序列时显示） -->
      <g v-for="(t, i) in ticks" :key="`g${i}`">
        <line :x1="PAD_L" :x2="W - PAD_R" :y1="t.y" :y2="t.y" class="fs-chart-grid" />
        <text :x="PAD_L - 6" :y="t.y + 4" class="fs-chart-tick" text-anchor="end">{{ fmt(t.left) }}</text>
        <text v-if="hasRightSeries" :x="W - PAD_R + 6" :y="t.y + 4" class="fs-chart-tick" text-anchor="start">{{ fmt(t.right) }}</text>
      </g>
      <!-- x 轴刻度（每 xStep 个标签取一个） -->
      <text v-for="(lab, i) in xTicks" :key="`x${i}`" :x="xOf(lab.index)" :y="H - 4" class="fs-chart-tick"
        text-anchor="middle">{{ lab.text }}</text>
      <!-- hover 竖线 + 数据点 -->
      <line v-if="hoverIdx !== null" :x1="xOf(hoverIdx)" :x2="xOf(hoverIdx)" :y1="PAD_T" :y2="PAD_T + plotH"
        class="fs-chart-cursor" />
      <g v-for="s in visibleSeries" :key="s.name">
        <!-- NOTE: stroke 走 style 而非 presentation attribute —— SVG attribute 不解析 var() 主题色 -->
        <polyline v-for="(seg, gi) in segments(s)" :key="gi" :points="seg" fill="none"
          :style="{ stroke: s.color }" stroke-width="2"
          :stroke-dasharray="s.dashed ? '5 4' : undefined" stroke-linejoin="round" />
        <circle v-if="dotY(s) !== null" :cx="xOf(hoverIdx ?? 0)" :cy="dotY(s) ?? 0" r="3.5"
          fill="var(--color-bg-primary)" :style="{ stroke: s.color }" stroke-width="2" />
      </g>
    </svg>

    <!-- hover 数值提示：跟随竖线，右半区自动左翻 -->
    <div v-if="hoverIdx !== null" class="fs-chart-tip" :style="tipStyle" role="status">
      <div class="fs-chart-tip-title">{{ labels[hoverIdx] }}</div>
      <div v-for="row in tipRows" :key="row.name" class="fs-chart-tip-row">
        <span class="fs-chart-swatch" :class="{ dashed: row.dashed }"
          :style="row.dashed ? { color: row.color } : { background: row.color }" aria-hidden="true"></span>
        <span class="fs-chart-tip-name">{{ row.name }}</span>
        <span class="fs-chart-tip-val">{{ row.value }}</span>
      </div>
    </div>

    <figcaption class="fs-chart-legend">
      <button v-for="s in series" :key="s.name" type="button" class="fs-chart-legend-item"
        :class="{ off: hidden.has(s.name) }" :aria-pressed="hidden.has(s.name)"
        :title="hidden.has(s.name) ? `点击显示「${s.name}」` : `点击隐藏「${s.name}」`" @click="toggleSeries(s.name)">
        <span class="fs-chart-swatch" :class="{ dashed: s.dashed }"
          :style="s.dashed ? { color: s.color } : { background: s.color }" aria-hidden="true"></span>{{ s.name }}
      </button>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

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
  /** 数值提示格式化（hover tooltip 与数据点共用） */
  valueFormatter?: (v: number) => string
  ariaLabel?: string
}>(), {
  xStep: 10,
  height: 260,
  valueFormatter: undefined,
  ariaLabel: '折线图',
})

const W = 760
const PAD_L = 64
const PAD_R = 64
const PAD_T = 12
const H = computed(() => props.height)

// ── 图例显隐：隐藏的序列不参与绘图与 y 域计算 ──
const hidden = ref(new Set<string>())
function toggleSeries(name: string): void {
  const next = new Set(hidden.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    // 至少保留一条可见序列（全隐藏时 y 域失去意义）
    if (props.series.length - next.size <= 1) return
    next.add(name)
  }
  hidden.value = next
}

const visibleSeries = computed(() => props.series.filter((s) => !hidden.value.has(s.name)))

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
  for (const s of visibleSeries.value) {
    if ((s.axis ?? 'left') !== side) continue
    for (const p of s.points) if (p != null && p > max) max = p
  }
  return niceMax(max)
}

const leftMax = computed(() => axisMax('left'))
const rightMax = computed(() => axisMax('right'))

/** 是否存在右轴序列（无则隐藏右轴刻度，避免显示 0~1 假刻度） */
const hasRightSeries = computed(() => visibleSeries.value.some((s) => (s.axis ?? 'left') === 'right'))

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

/** hover 数据点 y 坐标；该序列在当前索引无值（null 断点）时返回 null 不绘制 */
function dotY(s: ChartSeries): number | null {
  if (hoverIdx.value === null) return null
  const v = s.points[hoverIdx.value]
  return v == null ? null : scaleY(s)(v)
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

/** 轴刻度数值：千分位省显示（45000 → 45k），避免轴文字挤压 */
function fmt(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k`
  return String(Math.round(v * 100) / 100)
}

function fmtValue(v: number): string {
  return props.valueFormatter ? props.valueFormatter(v) : fmt(v)
}

// ── hover：最近索引吸附 + HTML 浮层提示 ──
const svgEl = ref<SVGSVGElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const hoverIdx = ref<number | null>(null)

function onMove(e: MouseEvent): void {
  if (!svgEl.value || props.labels.length === 0) return
  const rect = svgEl.value.getBoundingClientRect()
  const scale = rect.width / W
  const vx = (e.clientX - rect.left) / scale
  const n = props.labels.length
  const step = plotW.value / Math.max(1, n - 1)
  const idx = Math.round((vx - PAD_L) / step)
  hoverIdx.value = Math.min(n - 1, Math.max(0, idx))
}

const tipRows = computed(() =>
  hoverIdx.value === null
    ? []
    : visibleSeries.value
        .map((s) => ({
          name: s.name,
          color: s.color,
          dashed: !!s.dashed,
          value: s.points[hoverIdx.value!] == null ? '—' : fmtValue(s.points[hoverIdx.value!]!),
        })),
)

/** 提示框定位：跟随竖线；右半区向左翻转避免出界 */
const tipStyle = computed(() => {
  if (hoverIdx.value === null || !svgEl.value || !rootEl.value) return {}
  const scale = svgEl.value.getBoundingClientRect().width / W
  const px = xOf(hoverIdx.value) * scale
  const rootW = rootEl.value.clientWidth
  const flip = px > rootW / 2
  return {
    left: 'auto',
    right: 'auto',
    [flip ? 'right' : 'left']: `${flip ? rootW - px : px}px`,
    transform: flip ? 'translateX(-12px)' : 'translateX(12px)',
  }
})
</script>

<style scoped lang="scss">
.fs-chart {
  margin: 0;
  position: relative;
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

.fs-chart-cursor {
  stroke: var(--color-text-tertiary);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.fs-chart-tick {
  font-size: var(--font-size-md);
  fill: var(--color-text-tertiary);
}

.fs-chart-tip {
  position: absolute;
  top: var(--space-2);
  pointer-events: none;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-2) var(--space-3);
  min-width: 140px;
  z-index: 2;
}

.fs-chart-tip-title {
  color: var(--color-text-secondary);
  margin-bottom: var(--space-1);
}

.fs-chart-tip-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.fs-chart-tip-name {
  flex: 1;
  color: var(--color-text-secondary);
}

.fs-chart-tip-val {
  font-variant-numeric: tabular-nums;
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
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;

  &.off {
    opacity: 0.4;
    text-decoration: line-through;
  }
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
