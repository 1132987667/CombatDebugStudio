<template>
  <div class="xy-schools">
    <section class="xy-schools-head">
      <div class="xy-schools-head-row">
        <span class="xy-schools-title">天赋树</span>
        <span class="xy-schools-points">
          可用 <strong>{{ availablePoints }}</strong> /
          <em>{{ skillPoints.max }}</em> · 已用 {{ spentPoints }}
        </span>
      </div>
      <div class="xy-schools-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="xy-schools-tab"
          :class="{ active: schoolFilter === 'all' }"
          @click="schoolFilter = 'all'"
        >全部</button>
        <button
          v-for="s in schoolsDefs"
          :key="s.id"
          type="button"
          role="tab"
          class="xy-schools-tab"
          :class="['xy-schools-tab--' + s.id, { active: schoolFilter === s.id }]"
          @click="schoolFilter = s.id"
        >
          <span class="xy-schools-tab-dot" :class="'xy-schools-tab-dot--' + s.id"></span>
          {{ s.name }}
        </button>
      </div>
    </section>

    <section class="xy-schools-canvas-wrap" ref="wrapRef">
      <canvas
        ref="canvasRef"
        class="xy-schools-canvas"
        @click="onCanvasClick"
        @mousemove="onCanvasMouseMove"
        @mouseleave="onCanvasMouseLeave"
      />
      <div
        v-if="hoveredNode"
        class="xy-schools-tooltip"
        :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
      >
        <p class="xy-schools-tooltip-name">{{ hoveredNode.name }}</p>
        <p class="xy-schools-tooltip-type">{{ nodeTypeLabel(hoveredNode) }}</p>
        <p class="xy-schools-tooltip-desc">{{ formatDesc(hoveredNode) }}</p>
        <p class="xy-schools-tooltip-cost" v-if="hoveredNode.cost">
          消耗 {{ hoveredNode.cost[0] ?? 0 }} 点
        </p>
        <p class="xy-schools-tooltip-req" v-if="!hoveredNode.learned && !canUnlock(hoveredNode)">
          {{ unlockFailReason(hoveredNode) }}
        </p>
      </div>
    </section>

    <section class="xy-schools-actions">
      <button
        type="button"
        class="xy-btn xy-btn--ghost"
        :disabled="spentPoints === 0 || resetCost() > player.currency.copper"
        @click="doReset"
      >重置天赋树（{{ resetCost() }} 铜钱）</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import {
  schoolsDefs,
  schoolsLayers,
  skillPoints,
  availableSkillPoints,
} from '../xiyouData'
import type { SchoolsNode } from '../types'
import { RESET_PRICE_PER_POINT } from '@/presentation/stores/cultivateStore'

const player = usePlayerStore()
const notification = useNotificationStore()

const schoolFilter = ref<string>('all')
const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)

const availablePoints = computed(() => availableSkillPoints())
const spentPoints = computed(() => skillPoints.spent)

const hoveredNode = ref<SchoolsNode | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

const NODE_W = 56
const NODE_H = 44
const NODE_GAP_X = 64
const NODE_GAP_Y = 72
const SCHOOL_GAP = 12
const LAYER_LABEL_W = 32
const PADDING_TOP = 32
const PADDING_BOTTOM = 32
const PADDING_LEFT = 44
const PADDING_RIGHT = 16

const SCHOOL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  common: { bg: '#3a3a3a', border: '#777', text: '#ccc' },
  lianzhan: { bg: '#5c2020', border: '#c0392b', text: '#e74c3c' },
  pojun: { bg: '#5c4a10', border: '#d4a017', text: '#f1c40f' },
  budong: { bg: '#1a3a5c', border: '#2980b9', text: '#3498db' },
  huanying: { bg: '#3a1a5c', border: '#8e44ad', text: '#9b59b6' },
}
const CLR_LOCKED = { bg: '#2a2a2a', border: '#444', text: '#666' }
const CLR_LEARNED = { bg: '#1a4a1a', border: '#27ae60', text: '#2ecc71' }
const CLR_AVAILABLE = { bg: '#2a2a1a', border: '#f39c12', text: '#f1c40f' }

interface LayoutNode {
  node: SchoolsNode
  cx: number
  cy: number
  color: typeof CLR_LOCKED
  visible: boolean
}

let layoutNodes: LayoutNode[] = []

function getNodeColor(n: SchoolsNode): typeof CLR_LOCKED {
  if (n.learned) return CLR_LEARNED
  if (canUnlock(n)) return CLR_AVAILABLE
  return CLR_LOCKED
}

function getSchoolColor(school: string): typeof CLR_LOCKED {
  return SCHOOL_COLORS[school] ?? CLR_LOCKED
}

function computeLayout(): void {
  layoutNodes = []
  const dpr = window.devicePixelRatio || 1

  const visibleLayers = schoolsLayers.map((layer) => ({
    ...layer,
    nodes: layer.nodes.filter((n) => schoolFilter.value === 'all' || n.school === schoolFilter.value),
  }))

  // 按流派分组: common | lianzhan | pojun | budong | huanying
  const schoolOrder = ['common', 'lianzhan', 'pojun', 'budong', 'huanying']
  const maxNodesPerSchool = Math.max(
    1,
    ...visibleLayers.flatMap((l) => {
      const groups = new Map<string, number>()
      for (const n of l.nodes) groups.set(n.school, (groups.get(n.school) ?? 0) + 1)
      return [...groups.values()]
    }),
  )

  const canvasW =
    LAYER_LABEL_W + PADDING_LEFT +
    schoolOrder.length * (maxNodesPerSchool * NODE_GAP_X) +
    (schoolOrder.length - 1) * SCHOOL_GAP +
    PADDING_RIGHT
  const canvasH = PADDING_TOP + visibleLayers.length * NODE_GAP_Y + PADDING_BOTTOM

  if (canvasRef.value) {
    canvasRef.value.width = canvasW * dpr
    canvasRef.value.height = canvasH * dpr
    canvasRef.value.style.width = canvasW + 'px'
    canvasRef.value.style.height = canvasH + 'px'
    const ctx = canvasRef.value.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)
  }

  for (let li = 0; li < visibleLayers.length; li++) {
    const layer = visibleLayers[li]
    const rowFromTop = visibleLayers.length - 1 - li

    // 按 school 分组
    const groups = new Map<string, SchoolsNode[]>()
    for (const n of layer.nodes) {
      const arr = groups.get(n.school) ?? []
      arr.push(n)
      groups.set(n.school, arr)
    }

    let xOffset = LAYER_LABEL_W + PADDING_LEFT
    for (const school of schoolOrder) {
      const nodes = groups.get(school) ?? []
      for (let ni = 0; ni < nodes.length; ni++) {
        layoutNodes.push({
          node: nodes[ni],
          cx: xOffset + ni * NODE_GAP_X + NODE_GAP_X / 2,
          cy: PADDING_TOP + rowFromTop * NODE_GAP_Y,
          color: getNodeColor(nodes[ni]),
          visible: true,
        })
      }
      xOffset += maxNodesPerSchool * NODE_GAP_X + SCHOOL_GAP
    }
  }
}

function drawCanvas(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const w = canvas.width / dpr
  const h = canvas.height / dpr
  ctx.clearRect(0, 0, w, h)

  // 绘制层标
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '10px sans-serif'
  ctx.fillStyle = '#555'
  const visibleLayerCount = schoolsLayers.filter(
    (l) => schoolFilter.value === 'all' || l.nodes.some((n) => n.school === schoolFilter.value),
  ).length
  for (let i = 0; i < visibleLayerCount; i++) {
    const rowFromTop = visibleLayerCount - 1 - i
    const cy = PADDING_TOP + rowFromTop * NODE_GAP_Y
    ctx.fillText(`L${i + 1}`, LAYER_LABEL_W / 2, cy)
  }

  // 绘制层间连线
  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = 1
  ctx.setLineDash([2, 2])
  for (let i = 0; i < layoutNodes.length; i++) {
    const a = layoutNodes[i]
    for (let j = 0; j < layoutNodes.length; j++) {
      if (i === j) continue
      const b = layoutNodes[j]
      if (b.node.layer === a.node.layer + 1 && Math.abs(a.cx - b.cx) < NODE_GAP_X * 1.5) {
        ctx.beginPath()
        ctx.moveTo(a.cx, a.cy + NODE_H / 2)
        ctx.lineTo(b.cx, b.cy - NODE_H / 2)
        ctx.stroke()
      }
    }
  }
  ctx.setLineDash([])

  // 绘制节点
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const ln of layoutNodes) {
    if (!ln.visible) continue
    const n = ln.node
    const clr = ln.color
    const x = ln.cx - NODE_W / 2
    const y = ln.cy - NODE_H / 2
    const r = 3

    // 节点背景
    ctx.beginPath()
    ctx.roundRect(x, y, NODE_W, NODE_H, r)
    ctx.fillStyle = clr.bg
    ctx.fill()

    // 学校色左边框
    const schoolClr = getSchoolColor(n.school)
    ctx.beginPath()
    ctx.moveTo(x + 1, y + r)
    ctx.lineTo(x + 1, y + NODE_H - r)
    ctx.strokeStyle = schoolClr.border
    ctx.lineWidth = 2.5
    ctx.stroke()

    // 外边框
    ctx.beginPath()
    ctx.roundRect(x, y, NODE_W, NODE_H, r)
    ctx.strokeStyle = clr.border
    ctx.lineWidth = n.learned ? 2 : 1
    ctx.stroke()

    // 已解锁 / 可解锁光晕
    if (n.learned) {
      ctx.shadowColor = CLR_LEARNED.border
      ctx.shadowBlur = 4
      ctx.strokeStyle = CLR_LEARNED.border
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.shadowBlur = 0
    } else if (canUnlock(n)) {
      ctx.shadowColor = CLR_AVAILABLE.border
      ctx.shadowBlur = 4
      ctx.strokeStyle = CLR_AVAILABLE.border
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // 节点名
    ctx.fillStyle = n.learned ? CLR_LEARNED.text : schoolClr.text
    ctx.font = '11px sans-serif'
    const label = n.name.length > 3 ? n.name.slice(0, 3) + '.' : n.name
    ctx.fillText(label, ln.cx, ln.cy - 2)

    // 类型标签
    ctx.fillStyle = clr.text
    ctx.font = '8px sans-serif'
    const typeLabel = { attribute: '属性', learn: '技能', special: '特殊' }[n.type] ?? ''
    ctx.fillText(typeLabel, ln.cx, ln.cy + 11)
  }

  ctx.restore()
}

function hitTest(mx: number, my: number): SchoolsNode | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const x = mx - rect.left
  const y = my - rect.top
  for (const ln of layoutNodes) {
    if (!ln.visible) continue
    const dx = x - ln.cx
    const dy = y - ln.cy
    if (Math.abs(dx) <= NODE_W / 2 + 4 && Math.abs(dy) <= NODE_H / 2 + 4) {
      return ln.node
    }
  }
  return null
}

function onCanvasClick(e: MouseEvent): void {
  const node = hitTest(e.clientX, e.clientY)
  if (!node) return
  if (node.learned) return
  if (!canUnlock(node)) {
    notification.toast(unlockFailReason(node), 'warning')
    return
  }
  const cost = node.cost?.[0] ?? 1
  skillPoints.spent += cost
  node.learned = true
  notification.toast(`已解锁「${node.name}」`, 'success')
  drawCanvas()
}

function onCanvasMouseMove(e: MouseEvent): void {
  const node = hitTest(e.clientX, e.clientY)
  if (node) {
    hoveredNode.value = node
    const rect = wrapRef.value?.getBoundingClientRect()
    tooltipX.value = e.clientX - (rect?.left ?? 0) + 16
    tooltipY.value = e.clientY - (rect?.top ?? 0) - 10
    canvasRef.value && (canvasRef.value.style.cursor = canUnlock(node) ? 'pointer' : 'default')
  } else {
    hoveredNode.value = null
    canvasRef.value && (canvasRef.value.style.cursor = 'default')
  }
}

function onCanvasMouseLeave(): void {
  hoveredNode.value = null
}

function canUnlock(n: SchoolsNode): boolean {
  if (n.learned) return false
  const cost = n.cost?.[0] ?? 1
  if (availablePoints.value < cost) return false
  if (n.layer > 1) {
    const prevLayer = schoolsLayers.find((l) => l.layer === n.layer - 1)
    if (prevLayer && prevLayer.pointsRequired > 0) {
      const prevSpent = prevLayer.nodes.filter((nd) => nd.learned)
        .reduce((s, nd) => s + (nd.cost?.[0] ?? 0), 0)
      if (prevSpent < prevLayer.pointsRequired) return false
    }
  }
  return true
}

function unlockFailReason(n: SchoolsNode): string {
  if (n.learned) return '已解锁'
  const cost = n.cost?.[0] ?? 1
  if (availablePoints.value < cost) return '技能点不足'
  if (n.layer > 1) {
    const prevLayer = schoolsLayers.find((l) => l.layer === n.layer - 1)
    if (prevLayer && prevLayer.pointsRequired > 0) {
      const prevSpent = prevLayer.nodes.filter((nd) => nd.learned)
        .reduce((s, nd) => s + (nd.cost?.[0] ?? 0), 0)
      if (prevSpent < prevLayer.pointsRequired) return `需前一层累计 ${prevLayer.pointsRequired} 点`
    }
  }
  return '无法解锁'
}

function nodeTypeLabel(n: SchoolsNode): string {
  return { attribute: '属性加成', learn: '学习技能', special: '特殊效果' }[n.type] ?? n.type
}

function formatDesc(n: SchoolsNode): string {
  if (!n.value) return n.description
  const v = n.value.length > 1 ? n.value[1] : n.value[0]
  return `${n.name} +${v}${n.suffix}`
}

function resetCost(): number {
  return RESET_PRICE_PER_POINT * skillPoints.spent
}

function doReset(): void {
  const cost = resetCost()
  if (cost <= 0) return
  if (!confirm(`确认重置天赋树？消耗 ${cost} 铜钱，全部节点清空，技能点返还。`)) return
  if (player.currency.copper < cost) {
    notification.toast('铜钱不足', 'error')
    return
  }
  player.currency.copper -= cost
  for (const l of schoolsLayers) {
    for (const n of l.nodes) n.learned = false
  }
  skillPoints.spent = 0
  notification.toast(`天赋树已重置，消耗 ${cost} 铜钱`, 'success')
  drawCanvas()
}

function redraw(): void {
  computeLayout()
  drawCanvas()
}

watch(schoolFilter, () => nextTick(redraw))

watch(() => skillPoints.spent, () => drawCanvas())

onMounted(() => nextTick(redraw))

let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(() => redraw())
  if (wrapRef.value) ro.observe(wrapRef.value)
})
onUnmounted(() => ro?.disconnect())
</script>

<style scoped lang="scss">
.xy-schools {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
}

.xy-schools-head {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
}

.xy-schools-head-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.xy-schools-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  letter-spacing: 2px;
  color: var(--xy-ink-2);
}

.xy-schools-points {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);

  strong { color: var(--xy-gold); }
  em { font-style: normal; color: var(--xy-ink-3); }
}

.xy-schools-tabs {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.xy-schools-tab {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  font-family: inherit;
  font-size: var(--font-size-md);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &:hover:not(.active) { border-color: var(--xy-ink-2); color: var(--xy-ink-2); }
  &.active { border-color: var(--xy-seal); background: var(--xy-seal); color: #fff; }
}

.xy-schools-tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: #666;
}
.xy-schools-tab-dot--common { background: #777; }
.xy-schools-tab-dot--lianzhan { background: #c0392b; }
.xy-schools-tab-dot--pojun { background: #d4a017; }
.xy-schools-tab-dot--budong { background: #2980b9; }
.xy-schools-tab-dot--huanying { background: #8e44ad; }
.xy-schools-tab.active .xy-schools-tab-dot { background: #fff; }

.xy-schools-canvas-wrap {
  position: relative;
  flex: 1;
  overflow: auto;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
}

.xy-schools-canvas {
  display: block;
}

.xy-schools-tooltip {
  position: absolute;
  z-index: 10;
  max-width: 220px;
  padding: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper-warm);
  pointer-events: none;
}

.xy-schools-tooltip-name {
  margin: 0 0 2px;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-schools-tooltip-type {
  margin: 0 0 4px;
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

.xy-schools-tooltip-desc {
  margin: 0 0 2px;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-schools-tooltip-cost {
  margin: 0 0 2px;
  font-size: var(--font-size-md);
  color: var(--xy-gold);
}

.xy-schools-tooltip-req {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

.xy-schools-actions {
  display: flex;
  justify-content: flex-end;
}

.xy-btn {
  padding: var(--space-1) var(--space-4);
  border-radius: 2px;
  font-size: var(--font-size-md);
  font-family: inherit;
  letter-spacing: 1px;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.xy-btn--ghost {
  border: 1px solid var(--xy-ink-line);
  background: transparent;
  color: var(--xy-ink-2);
}
</style>
