<template>
  <div class="xy-tree-panel">
    <section class="xy-tree-head">
      <div class="xy-tree-head-row">
        <span class="xy-tree-title">流派树</span>
        <span class="xy-tree-points">
          可用 <strong>{{ availablePoints }}</strong> /
          <em>{{ skillPoints.max }}</em> · 已用 {{ spentPoints }}
          <template v-if="ultimateLearned > 0"> · 大招 {{ ultimateLearned }}/{{ MAX_ULTIMATES }}</template>
        </span>
      </div>
      <div class="xy-tree-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="xy-tree-tab"
          :class="{ active: schoolFilter === 'all' }"
          @click="schoolFilter = 'all'"
        >全部</button>
        <button
          v-for="s in schoolsDefs"
          :key="s.id"
          type="button"
          role="tab"
          class="xy-tree-tab"
          :class="{ active: schoolFilter === s.id }"
          :style="{ '--sc': schoolColor(s.id) }"
          @click="schoolFilter = s.id"
        >{{ s.name }}</button>
      </div>
    </section>

    <section class="xy-tree-canvas" ref="wrapRef">
      <div class="xy-tree">
        <div
          class="xy-tree-col"
          v-for="col in columns"
          :key="col.id"
          :style="{ '--sc': schoolColor(col.id), '--lit': col.litPct + '%' }"
        >
          <div class="xy-tree-col-head">
            <span class="xy-tree-col-gem"></span>{{ col.name }}
          </div>
          <div class="xy-tree-col-body">
            <div class="xy-tree-spine"></div>
            <div class="xy-tree-spine-lit"></div>
            <template v-for="layer in col.layersReversed" :key="layer.layer">
              <div
                v-if="layer.layer > 1"
                class="xy-tree-gate"
                :class="{ open: gateOpen(layer.layer) }"
              >
                <i class="xy-tree-gem"></i>
                <span class="xy-tree-gate-req">{{ gateRequired(layer.layer) }}点</span>
              </div>
              <div class="xy-tree-layer">
                <button
                  v-for="node in layer.nodes"
                  :key="node.id"
                  type="button"
                  class="xy-node"
                  :class="[
                    'xy-node--' + nodeState(node),
                    'xy-node--' + node.type,
                    { 'xy-node--ult': node.skillKind === '大技能', dim: schoolFilter !== 'all' && schoolFilter !== node.school },
                  ]"
                  @click="learn(node)"
                  @mouseenter="showTip(node, $event)"
                  @mouseleave="hideTip"
                >
                  <span class="xy-node-label">{{ shortLabel(node) }}</span>
                  <span v-if="maxRankOf(node) > 1" class="xy-node-rank">{{ node.ranks }}/{{ maxRankOf(node) }}</span>
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div
        v-if="tip.node"
        class="xy-tree-tip"
        :class="{ below: tip.below }"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
      >
        <p class="xy-tree-tip-name">
          {{ tip.node.name }}
          <span class="xy-tree-tip-school">{{ schoolName(tip.node.school) }}</span>
        </p>
        <p class="xy-tree-tip-type">{{ typeLabel(tip.node) }}</p>
        <template v-if="tip.node.type === 'learn'">
          <p class="xy-tree-tip-desc">{{ formatDesc(tip.node) }}</p>
          <p class="xy-tree-tip-note">点亮后自动装配出战（学习格无需装备槽）</p>
        </template>
        <template v-else>
          <p class="xy-tree-tip-desc">{{ formatDesc(tip.node) }}</p>
          <p class="xy-tree-tip-effect" v-if="tip.node.ranks > 0">
            当前 +{{ valueAt(tip.node, tip.node.ranks) }}{{ tip.node.suffix }}
            <template v-if="tip.node.ranks < maxRankOf(tip.node)">
              → 下一级 +{{ valueAt(tip.node, tip.node.ranks + 1) }}{{ tip.node.suffix }}
            </template>
            <template v-else>（满级）</template>
          </p>
          <p class="xy-tree-tip-effect" v-else>
            效果 +{{ valueAt(tip.node, 1) }}{{ tip.node.suffix }}<template v-if="maxRankOf(tip.node) > 1">
            → +{{ valueAt(tip.node, maxRankOf(tip.node)) }}{{ tip.node.suffix }}（满级）</template>
          </p>
        </template>
        <p class="xy-tree-tip-cost" v-if="tip.node.ranks < maxRankOf(tip.node)">
          下一级消耗 {{ rankCost(tip.node) }} 点
        </p>
        <p class="xy-tree-tip-req" v-if="tip.node.ranks < maxRankOf(tip.node) && !canLearn(tip.node)">
          {{ failReason(tip.node) }}
        </p>
      </div>
    </section>

    <section class="xy-tree-actions">
      <button
        type="button"
        class="xy-btn xy-btn--ghost"
        :disabled="spentPoints === 0 || resetCost() > player.currency.money"
        @click="doReset"
      >洗点重置（{{ resetCost() }} 金钱）</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import {
  schoolsDefs,
  schoolsLayers,
  skillPoints,
  availableSkillPoints,
  nodeMaxRank,
  nodeRankCost,
  nodeValueAtRank,
} from '../xiyouData'
import type { SchoolsLayer, SchoolsNode } from '../types'
import { RESET_PRICE_PER_POINT } from '@/presentation/stores/cultivateStore'
import { saveManager } from '../save-bridge'

/** 全流派大招解锁上限（《完整项目说明.md》加点规则） */
const MAX_ULTIMATES = 2

const player = usePlayerStore()
const notification = useNotificationStore()

const schoolFilter = ref<string>('all')
const wrapRef = ref<HTMLElement | null>(null)

const availablePoints = computed(() => availableSkillPoints())
const spentPoints = computed(() => skillPoints.spent)

/* ── 流派配色（列徽章 / 节点点亮态共用 --sc 变量） ── */
const SCHOOL_COLORS: Record<string, string> = {
  common: '#8a8a8a',
  lianzhan: '#c0392b',
  pojun: '#d4a017',
  budong: '#2980b9',
  huanying: '#8e44ad',
}

function schoolColor(school: string): string {
  return SCHOOL_COLORS[school] ?? '#8a8a8a'
}

function schoolName(school: string): string {
  return schoolsDefs.find((s) => s.id === school)?.name ?? school
}

/* ── 布局模型：每流派一列（经脉脊柱自下而上 L1→L10），层内节点横排 ── */

interface TreeColumn {
  id: string
  name: string
  layersReversed: SchoolsLayer[]
  /** 列内单层最大节点数（决定列宽） */
  maxNodes: number
  /** 脊柱点亮比例（已连续达成门槛的最高层） */
  litPct: number
}const columns = computed<TreeColumn[]>(() => {
  const total = schoolsLayers.length
  return schoolsDefs.map((def) => {
    const layers = schoolsLayers
      .map((l) => ({ layer: l.layer, pointsRequired: l.pointsRequired, nodes: l.nodes.filter((n) => n.school === def.id) }))
      .filter((l) => l.nodes.length > 0 || l.layer === 1)
    const maxNodes = Math.max(1, ...layers.map((l) => l.nodes.length))
    // 脊柱点亮：从 L1 向上连续 gate 达成的层数
    let lit = 1
    for (const l of layers) {
      if (l.layer === 1) continue
      if (gateOpen(l.layer)) lit = l.layer
      else break
    }
    return {
      id: def.id,
      name: def.name,
      layersReversed: [...layers].reverse(),
      maxNodes,
      litPct: total > 1 ? ((lit - 1) / (total - 1)) * 100 : 0,
    }
  })
})

/* ── 层级门槛：进入 layer 层需第 layer-1 层累计投入 ≥ pointsRequired ── */

function layerById(layer: number): SchoolsLayer | undefined {
  return schoolsLayers.find((l) => l.layer === layer)
}

function layerSpent(layer: number): number {
  const l = layerById(layer)
  if (!l) return 0
  return l.nodes.reduce((sum, n) => sum + n.ranks * nodeRankCost(n, 1), 0)
}

function gateOpen(layer: number): boolean {
  if (layer <= 1) return true
  const prev = layerById(layer - 1)
  if (!prev || prev.pointsRequired <= 0) return true
  return layerSpent(layer - 1) >= prev.pointsRequired
}

function gateRequired(layer: number): number {
  return layerById(layer - 1)?.pointsRequired ?? 0
}

/* ── 节点状态与解锁 ── */

const ultimateLearned = computed(
  () => schoolsLayers.reduce(
    (sum, l) => sum + l.nodes.filter((n) => n.skillKind === '大技能' && n.ranks > 0).length,
    0,
  ),
)

function maxRankOf(node: SchoolsNode): number {
  return nodeMaxRank(node)
}

function rankCost(node: SchoolsNode): number {
  return nodeRankCost(node, node.ranks + 1)
}

function valueAt(node: SchoolsNode, rank: number): number {
  return nodeValueAtRank(node, rank)
}

function nodeState(node: SchoolsNode): 'learned' | 'available' | 'locked' {
  if (node.ranks > 0) return 'learned'
  if (canLearn(node)) return 'available'
  return 'locked'
}

function canLearn(node: SchoolsNode): boolean {
  if (node.ranks >= nodeMaxRank(node)) return false
  if (availablePoints.value < nodeRankCost(node, node.ranks + 1)) return false
  if (!gateOpen(node.layer)) return false
  if (node.skillKind === '大技能' && node.ranks === 0 && ultimateLearned.value >= MAX_ULTIMATES) return false
  return true
}

function failReason(node: SchoolsNode): string {
  if (node.ranks >= nodeMaxRank(node)) return '已满级'
  if (!gateOpen(node.layer)) return `需上一层累计投入 ${gateRequired(node.layer)} 点`
  if (node.skillKind === '大技能' && node.ranks === 0 && ultimateLearned.value >= MAX_ULTIMATES) {
    return `全流派大招最多解锁 ${MAX_ULTIMATES} 个`
  }
  if (availablePoints.value < nodeRankCost(node, node.ranks + 1)) return '技能点不足'
  return '无法解锁'
}

function learn(node: SchoolsNode): void {
  if (node.ranks >= nodeMaxRank(node)) return
  if (!canLearn(node)) {
    notification.toast(failReason(node), 'warning')
    return
  }
  const cost = nodeRankCost(node, node.ranks + 1)
  skillPoints.spent += cost
  node.ranks += 1
  saveManager.autoSave()
  notification.toast(
    node.type === 'learn'
      ? `已点亮「${node.name}」${node.skillIds?.length ? '，技能自动装配出战' : ''}`
      : `「${node.name}」升至 ${node.ranks}/${nodeMaxRank(node)} 级`,
    'success',
  )
}

/* ── 节点文案 ── */

function shortLabel(node: SchoolsNode): string {
  if (node.type === 'learn') return node.skillKind === '大技能' ? '大招' : node.skillKind === '小技能' ? '小技' : '被动'
  if (node.type === 'special') return '特殊'
  return node.name.slice(0, 2)
}

function typeLabel(node: SchoolsNode): string {
  if (node.type === 'learn') return `学习${node.skillKind ?? '技能'}`
  if (node.type === 'special') return '特殊效果'
  return '属性加成'
}

function formatDesc(node: SchoolsNode): string {
  return node.description
    .replace('${schoolName}', schoolName(node.school))
    .replace('${skillKind}', node.skillKind ?? '')
    .replace('${cost}', String(node.cost?.[0] ?? ''))
    .replace('${value}', String(node.value?.[0] ?? ''))
    .replace('${name}', node.name)
}

/* ── tooltip（节点上方居中，越界翻转到下方） ── */

const tip = ref<{ node: SchoolsNode | null; x: number; y: number; below: boolean }>({
  node: null,
  x: 0,
  y: 0,
  below: false,
})

// 树自下而上生长（L1 在底部）：挂载后滚动到起点，玩家从 L1 开始加点
onMounted(() => {
  nextTick(() => {
    const el = wrapRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
})

function showTip(node: SchoolsNode, e: MouseEvent): void {
  const wrap = wrapRef.value?.getBoundingClientRect()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  if (!wrap) return
  tip.value = {
    node,
    x: rect.left - wrap.left + rect.width / 2,
    y: rect.top - wrap.top,
    below: rect.top - wrap.top < 130,
  }
}

function hideTip(): void {
  tip.value.node = null
}

/* ── 洗点（《完整项目说明.md》：金钱 500 × 已分配点数，全部返还） ── */

function resetCost(): number {
  return RESET_PRICE_PER_POINT * skillPoints.spent
}

function doReset(): void {
  const cost = resetCost()
  if (cost <= 0) return
  if (!confirm(`确认洗点？消耗 ${cost} 金钱，流派树全部节点清空，技能点返还。`)) return
  if (player.currency.money < cost) {
    notification.toast('金钱不足', 'error')
    return
  }
  player.currency.money -= cost
  for (const l of schoolsLayers) {
    for (const n of l.nodes) n.ranks = 0
  }
  skillPoints.spent = 0
  saveManager.autoSave()
  notification.toast(`流派树已洗点，消耗 ${cost} 金钱`, 'success')
}
</script>

<style scoped lang="scss">
.xy-tree-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
}

/* ── 头部 ── */

.xy-tree-head {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
}

.xy-tree-head-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.xy-tree-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  letter-spacing: 2px;
  color: var(--xy-ink-2);
}

.xy-tree-points {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);

  strong { color: var(--xy-gold); }
  em { font-style: normal; color: var(--xy-ink-3); }
}

.xy-tree-tabs {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.xy-tree-tab {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  font-family: inherit;
  font-size: var(--font-size-md);
  cursor: pointer;

  &:hover:not(.active) { border-color: var(--xy-ink-2); color: var(--xy-ink-2); }
  &.active {
    border-color: var(--sc, var(--xy-seal));
    color: var(--sc, var(--xy-seal));
    background: color-mix(in srgb, var(--sc, var(--xy-seal)) 12%, transparent);
  }
}

/* ── 树画布 ── */

.xy-tree-canvas {
  position: relative;
  flex: 1;
  overflow: auto;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background:
    radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--xy-seal) 5%, transparent), transparent 60%),
    var(--xy-paper);
}

.xy-tree {
  display: flex;
  align-items: stretch;
  gap: var(--space-3);
  min-width: max-content;
  padding: var(--space-4) var(--space-4) var(--space-5);
}

.xy-tree-col {
  display: flex;
  flex-direction: column;
}

.xy-tree-col-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: var(--space-3);
  padding: var(--space-1) 0;
  border: 1px solid color-mix(in srgb, var(--sc) 55%, transparent);
  border-radius: 2px;
  background:
    linear-gradient(color-mix(in srgb, var(--sc) 14%, var(--xy-paper)), color-mix(in srgb, var(--sc) 14%, var(--xy-paper))),
    var(--xy-paper);
  color: color-mix(in srgb, var(--sc) 80%, #fff);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  letter-spacing: 4px;
  text-indent: 4px;
}

.xy-tree-col-gem {
  width: 8px;
  height: 8px;
  transform: rotate(45deg);
  background: var(--sc);
}

/* 列体：脊柱 + 层（L10 顶 → L1 底） */

.xy-tree-col-body {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  justify-content: flex-end;
}

.xy-tree-spine {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(to bottom, transparent, var(--xy-ink-line) 8%, var(--xy-ink-line) 92%, transparent);
}

.xy-tree-spine-lit {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 2px;
  height: var(--lit, 0%);
  transform: translateX(-50%);
  background: linear-gradient(to top, var(--sc), color-mix(in srgb, var(--sc) 40%, transparent));
  box-shadow: 0 0 6px color-mix(in srgb, var(--sc) 60%, transparent);
  transition: height 0.25s ease;
}

/* 层门槛（经脉节点）：竖线 + 菱形 + 需求点数 */

.xy-tree-gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;

  .xy-tree-gem {
    width: 9px;
    height: 9px;
    transform: rotate(45deg);
    border: 1px solid var(--xy-ink-line);
    background: var(--xy-paper);
  }

  .xy-tree-gate-req {
    font-size: var(--font-size-md);
    color: var(--xy-ink-4);
    letter-spacing: 1px;
  }

  &.open {
    .xy-tree-gem {
      border-color: var(--sc);
      background: var(--sc);
      box-shadow: 0 0 6px color-mix(in srgb, var(--sc) 70%, transparent);
    }
    .xy-tree-gate-req { color: var(--sc); }
  }
}

.xy-tree-layer {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) 0;
}

/* ── 节点：圆形三态 ── */

.xy-node {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid var(--xy-ink-line);
  background: var(--color-bg-secondary);
  color: var(--xy-ink-4);
  font-family: inherit;
  font-size: var(--font-size-md);
  cursor: default;
  transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.1s ease;

  &.dim { opacity: 0.25; pointer-events: none; }

  &.xy-node--locked { opacity: 0.55; }

  &.xy-node--available {
    cursor: pointer;
    opacity: 1;
    border-color: var(--xy-gold);
    color: var(--xy-ink-2);
    animation: xy-node-pulse 1.8s ease-in-out infinite;

    &:hover { transform: scale(1.08); }
  }

  &.xy-node--learned {
    cursor: pointer;
    opacity: 1;
    border-color: var(--sc);
    border-width: 2px;
    background:
      radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--sc) 40%, transparent), color-mix(in srgb, var(--sc) 12%, var(--color-bg-secondary)));
    color: color-mix(in srgb, var(--sc) 65%, #fff);
    text-shadow: 0 0 4px color-mix(in srgb, var(--sc) 60%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--sc) 45%, transparent);

    &:hover { transform: scale(1.08); }
  }

  &.xy-node--ult.xy-node--available {
    border-style: dashed;
  }

  &.xy-node--ult.xy-node--learned {
    box-shadow:
      0 0 8px color-mix(in srgb, var(--xy-gold) 55%, transparent),
      inset 0 0 6px color-mix(in srgb, var(--xy-gold) 30%, transparent);
    border-color: var(--xy-gold);
    color: var(--xy-gold);
  }
}

@keyframes xy-node-pulse {
  0%, 100% { box-shadow: 0 0 3px color-mix(in srgb, var(--xy-gold) 40%, transparent); }
  50% { box-shadow: 0 0 9px color-mix(in srgb, var(--xy-gold) 70%, transparent); }
}

.xy-node-label {
  pointer-events: none;
  line-height: 1;
}

.xy-node-rank {
  position: absolute;
  right: -4px;
  bottom: -2px;
  min-width: 20px;
  padding: 0 3px;
  border-radius: 8px;
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper-warm, var(--xy-paper));
  font-size: var(--font-size-md);
  line-height: 1.3;
  color: var(--xy-ink-3);
  pointer-events: none;
}

.xy-node--learned .xy-node-rank {
  border-color: var(--sc);
  color: var(--sc);
}

/* ── tooltip ── */

.xy-tree-tip {
  position: absolute;
  z-index: 10;
  width: 230px;
  transform: translate(-50%, calc(-100% - 12px));
  padding: var(--space-2) var(--space-3);
  border: 1px solid color-mix(in srgb, var(--xy-gold) 40%, var(--xy-ink-line));
  border-radius: 2px;
  background: var(--xy-paper-warm, var(--xy-paper));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  pointer-events: none;

  &.below { transform: translate(-50%, 16px); }
}

.xy-tree-tip-name {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 2px;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-tree-tip-school {
  font-weight: var(--font-weight-regular);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-tree-tip-type {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-md);
  color: var(--xy-gold);
}

.xy-tree-tip-desc {
  margin: 0 0 2px;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-tree-tip-note {
  margin: 0 0 2px;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-tree-tip-effect {
  margin: 0 0 2px;
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-tree-tip-cost {
  margin: 0 0 2px;
  font-size: var(--font-size-md);
  color: var(--xy-gold);
}

.xy-tree-tip-req {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

/* ── 底部操作 ── */

.xy-tree-actions {
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
