<template>
  <div class="xy-skill-tree">
    <!-- 头部：技能点 + 流派 Tab -->
    <section class="xy-st-head">
      <div class="xy-st-head-row">
        <span class="xy-st-title">技能树</span>
        <span class="xy-st-points">
          可用 <strong>{{ cultivate.availablePoints }}</strong> /
          <em>{{ cultivate.skillPoints.max }}</em> · 已用 {{ cultivate.spentPoints }}
          <span class="xy-st-pills" v-if="cultivate.pillsUsed > 0">悟道丹 {{ cultivate.pillsUsed }}/{{ cultivate.pillPointLimit }}</span>
        </span>
      </div>
      <div class="xy-st-tabs" role="tablist" aria-label="流派">
        <button
          v-for="s in schools"
          :key="s.id"
          type="button"
          role="tab"
          class="xy-st-tab"
          :class="{ active: schoolId === s.id }"
          :aria-selected="schoolId === s.id"
          @click="schoolId = s.id"
        >
          {{ s.name }}
        </button>
      </div>
    </section>

    <!-- 节点网格（当前流派：3 分支 × 4 层） -->
    <section class="xy-st-tree" v-if="currentSchool">
      <div class="xy-st-branch" v-for="branch in currentSchool.branches" :key="branch">
        <h5 class="xy-st-branch-title">{{ branch }}</h5>
        <button
          type="button"
          class="xy-st-node"
          :class="nodeClass(n)"
          :disabled="isLearned(n) ? false : !cultivate.canUnlock(n.id)"
          :title="nodeTip(n)"
          v-for="n in nodesOf(branch)"
          :key="n.id"
          @click="onNodeClick(n)"
        >
          <span class="xy-st-node-head">
            <span class="xy-st-node-type">{{ nodeTypeText(n.type) }}</span>
            <span class="xy-st-node-name">{{ n.name }}</span>
            <span class="xy-st-node-points">{{ n.points }} 点</span>
          </span>
          <span class="xy-st-node-desc">{{ n.desc }}</span>
          <span class="xy-st-node-energy" v-if="n.energyCost > 0">消耗 {{ n.energyCost }} 能量</span>
          <span class="xy-st-node-req" v-if="!isLearned(n) && !prereqMet(n)">需先点亮：{{ prereqName(n) }}</span>
          <span class="xy-st-node-req" v-else-if="!isLearned(n) && cultivate.availablePoints < n.points">技能点不足</span>
          <span class="xy-st-node-req" v-else-if="!isLearned(n) && n.type === 'ultimate'">大招已解锁上限</span>
          <span class="xy-st-node-equipped" v-if="cultivate.isEquipped(n.id)">已装备</span>
        </button>
      </div>
    </section>

    <!-- 装备槽 + 已解锁技能池 -->
    <section class="xy-st-equip">
      <h4 class="xy-st-sec-title">出战技能</h4>
      <div class="xy-st-slot-row" v-for="row in SLOT_ROWS" :key="row.key">
        <span class="xy-st-slot-label">{{ row.label }}</span>
        <div class="xy-st-slot-list">
          <button
            v-for="i in row.limit"
            :key="i"
            type="button"
            class="xy-st-slot"
            :class="{ filled: slotOf(row.key, i - 1) }"
            :title="slotTitle(row.key, i - 1)"
            @click="onSlotClick(row.key, i - 1)"
          >
            <span class="xy-st-slot-name">{{ slotOf(row.key, i - 1)?.name ?? '空' }}</span>
            <span class="xy-st-slot-op" v-if="slotOf(row.key, i - 1)">卸下</span>
          </button>
        </div>
      </div>

      <div class="xy-st-pool" v-if="unlockedSkillNodes.length > 0">
        <p class="xy-st-pool-title">已解锁技能（点击装备）</p>
        <div class="xy-st-pool-list">
          <button
            v-for="n in unlockedSkillNodes"
            :key="n.id"
            type="button"
            class="xy-st-pool-node"
            :class="{ equipped: cultivate.isEquipped(n.id) }"
            :disabled="cultivate.isEquipped(n.id)"
            @click="equip(n)"
          >
            <span class="xy-st-pool-name">{{ n.name }}</span>
            <span class="xy-st-pool-type">{{ slotLabelOf(n) }}</span>
          </button>
        </div>
      </div>

      <!-- 纯流派加成状态 -->
      <div class="xy-st-pure" :class="pureClass">
        <span class="xy-st-pure-tag">{{ pureText }}</span>
        <span class="xy-st-pure-desc">{{ pureDesc }}</span>
      </div>
    </section>

    <!-- 洗点 -->
    <section class="xy-st-actions">
      <button
        type="button"
        class="xy-btn xy-btn--ghost xy-st-reset"
        :disabled="cultivate.spentPoints === 0 || cultivate.resetCost() > player.currency.copper"
        @click="doReset"
      >
        重置技能点（{{ cultivate.resetCost() }} 铜钱）
        <span v-if="cultivate.spentPoints > 0 && cultivate.resetCost() > player.currency.copper" class="xy-st-reset-warn">铜钱不足</span>
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCultivateStore, type EquipSlotType } from '@/presentation/stores/cultivateStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { schools } from '../xiyouData'
import type { XiyouSchool, XiyouSkillNode, XiyouNodeType } from '../types'

const cultivate = useCultivateStore()
const player = usePlayerStore()
const notification = useNotificationStore()

/** 当前浏览流派（Tab 仅浏览，v3.0 跨流派加点无单一流派概念） */
const schoolId = ref(schools[0]?.id ?? '')
const currentSchool = computed<XiyouSchool | undefined>(() => schools.find((s) => s.id === schoolId.value))

const SLOT_ROWS: Array<{ key: EquipSlotType; label: string; limit: number }> = [
  { key: 'passive', label: '被动', limit: 2 },
  { key: 'small', label: '小技能', limit: 2 },
  { key: 'ultimate', label: '大招', limit: 1 },
]

function slotOf(key: EquipSlotType, index: number): XiyouSkillNode | undefined {
  if (key === 'ultimate') {
    return cultivate.equippedSkills.ultimate
      ? nodeById(cultivate.equippedSkills.ultimate)
      : undefined
  }
  const id = cultivate.equippedSkills[key][index]
  return id ? nodeById(id) : undefined
}

function slotTitle(key: EquipSlotType, index: number): string {
  const n = slotOf(key, index)
  return n ? `${n.name} · ${n.desc}` : `${SLOT_ROWS.find((r) => r.key === key)?.label}槽 ${index + 1}`
}

function onSlotClick(key: EquipSlotType, index: number): void {
  const n = slotOf(key, index)
  if (!n) return
  cultivate.unequipSkill(n.id)
}

function nodeById(id: string): XiyouSkillNode | undefined {
  for (const s of schools) {
    const n = s.nodes.find((x) => x.id === id)
    if (n) return n
  }
  return undefined
}

function slotLabelOf(n: XiyouSkillNode): string {
  return { passive: '被动', skill: '小技能', ultimate: '大招' }[n.type] ?? n.type
}

function equip(n: XiyouSkillNode): void {
  const slot: EquipSlotType = n.type === 'passive' ? 'passive' : n.type === 'skill' ? 'small' : 'ultimate'
  cultivate.equipSkill(n.id, slot)
}

function isLearned(n: XiyouSkillNode): boolean {
  return n.learned === true
}

function nodesOf(branch: string): XiyouSkillNode[] {
  return currentSchool.value?.nodes.filter((n) => n.branch === branch).sort((a, b) => a.tier - b.tier) ?? []
}

/** 前置节点名（无前置返回空串） */
function prereqName(n: XiyouSkillNode): string {
  if (n.tier === 1) return ''
  const prev = currentSchool.value?.nodes.find((p) => p.branch === n.branch && p.tier === n.tier - 1)
  return prev?.name ?? ''
}

/** 前置是否满足（同分支上一层已点亮；第 1 层无前置） */
function prereqMet(n: XiyouSkillNode): boolean {
  if (n.tier === 1) return true
  const prev = currentSchool.value?.nodes.find((p) => p.branch === n.branch && p.tier === n.tier - 1)
  return prev ? prev.learned === true : false
}

function nodeClass(n: XiyouSkillNode): Record<string, boolean> {
  return {
    'is-learned': isLearned(n),
    'is-equipped': cultivate.isEquipped(n.id),
    'is-locked': !isLearned(n) && !cultivate.canUnlock(n.id),
  }
}

function nodeTip(n: XiyouSkillNode): string {
  const lines = [`${n.name}（${nodeTypeText(n.type)}）`, n.desc, `消耗 ${n.points} 技能点`]
  if (n.energyCost > 0) lines.push(`战斗中消耗 ${n.energyCost} 能量`)
  if (n.tier > 1) lines.push(`需先点亮：${prereqName(n)}`)
  return lines.join('\n')
}

function onNodeClick(n: XiyouSkillNode): void {
  if (isLearned(n)) return
  if (!cultivate.canUnlock(n.id)) {
    if (!prereqMet(n)) notification.toast(`需先点亮：${prereqName(n)}`, 'warning')
    else if (cultivate.availablePoints < n.points) notification.toast('技能点不足', 'warning')
    else if (n.type === 'ultimate') notification.toast('大招已解锁上限', 'warning')
    else notification.toast('无法点亮该节点', 'warning')
    return
  }
  if (cultivate.unlockNode(n.id)) {
    notification.toast(`已解锁「${n.name}」`, 'success')
  }
}

function nodeTypeText(t: XiyouNodeType): string {
  return { attribute: '属性', passive: '被动', skill: '小技能', ultimate: '大招', enhance: '强化' }[t]
}

// ════════════ 纯流派加成 ════════════
const pureSchool = computed(() => cultivate.pureSchoolBonus)
const pureName = computed(() => schools.find((s) => s.id === pureSchool.value)?.name ?? '')
const pureText = computed(() => (pureSchool.value ? `${pureName.value}·纯正` : '混搭阵容'))
const pureDesc = computed(() => {
  if (!pureSchool.value) return '出战技能来自不同流派，无额外加成'
  const b = schools.find((s) => s.id === pureSchool.value)?.pureBonus
  return b?.desc ?? '出战技能全为同一流派，获得流派加成'
})
const pureClass = computed(() => ({ active: !!pureSchool.value }))

// ════════════ 洗点 ════════════
function doReset(): void {
  const cost = cultivate.resetCost()
  if (cost <= 0) return
  if (!confirm(`确认重置技能树？消耗 ${cost} 铜钱，全部节点与装备槽清空，技能点返还（悟道丹获得的技能点不返还）。`)) return
  if (cultivate.resetNodes()) {
    notification.toast(`技能树已重置，消耗 ${cost} 铜钱`, 'success')
  } else {
    notification.toast('铜钱不足，无法重置技能树', 'error')
  }
}

/** 已解锁技能节点（装备池来源） */
const unlockedSkillNodes = computed(() => cultivate.unlockedSkillNodes)
</script>

<style scoped lang="scss">
.xy-skill-tree {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.xy-st-head {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
}

.xy-st-head-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.xy-st-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  letter-spacing: 2px;
  color: var(--xy-ink-2);
}

.xy-st-points {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);

  strong {
    color: var(--xy-gold);
  }

  em {
    font-style: normal;
    color: var(--xy-ink-3);
  }
}

.xy-st-pills {
  margin-left: var(--space-2);
  color: var(--xy-seal);
}

.xy-st-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.xy-st-tab {
  padding: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-3);
  font-family: inherit;
  font-size: var(--font-size-md);
  letter-spacing: 2px;
  cursor: pointer;

  &:hover:not(.active) {
    border-color: var(--xy-ink-2);
    color: var(--xy-ink-2);
  }

  &.active {
    border-color: var(--xy-seal);
    background: var(--xy-seal);
    color: #fff;
  }
}

.xy-st-tree {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  align-items: start;
}

.xy-st-branch {
  padding: var(--space-2);
  border: 1px dashed var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper-light);
}

.xy-st-branch-title {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 2px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-2);
}

.xy-st-node {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  margin-bottom: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover:not(:disabled) {
    border-color: var(--xy-seal);
  }

  &:disabled {
    cursor: not-allowed;
  }

  &.is-learned {
    border-color: var(--xy-gold);
    background: var(--xy-gold-soft);
  }

  &.is-locked {
    opacity: 0.55;
    background: var(--color-bg-secondary);
  }
}

.xy-st-node-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-st-node-type {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

.xy-st-node-name {
  flex: 1;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-st-node-points {
  font-size: var(--font-size-md);
  color: var(--xy-gold);
}

.xy-st-node-desc {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-st-node-energy {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-st-node-req {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-st-node-equipped {
  font-size: var(--font-size-md);
  color: var(--xy-jade);
}

.xy-st-equip {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
}

.xy-st-sec-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--xy-ink-2);
}

.xy-st-slot-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.xy-st-slot-label {
  width: 48px;
  flex-shrink: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-st-slot-list {
  display: flex;
  gap: var(--space-2);
  flex: 1;
}

.xy-st-slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  border: 1px dashed var(--xy-ink-line);
  border-radius: 2px;
  background: var(--color-bg-secondary);
  font-family: inherit;
  cursor: pointer;

  &.filled {
    border-style: solid;
    border-color: var(--xy-jade);
    background: var(--xy-jade-soft);
  }

  &:hover:not(:disabled) {
    border-color: var(--xy-ink-2);
  }
}

.xy-st-slot-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-st-slot-op {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

.xy-st-pool {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--xy-ink-line);
}

.xy-st-pool-title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-st-pool-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.xy-st-pool-node {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper-warm);
  font-family: inherit;
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &.equipped {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.xy-st-pool-name {
  font-weight: var(--font-weight-bold);
}

.xy-st-pool-type {
  color: var(--xy-ink-4);
}

.xy-st-pure {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--color-bg-secondary);

  &.active {
    border-color: var(--xy-gold);
    background: var(--xy-gold-soft);
  }
}

.xy-st-pure-tag {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-2);

  .active & {
    color: var(--xy-gold);
  }
}

.xy-st-pure-desc {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-st-actions {
  display: flex;
  justify-content: flex-end;
}

.xy-st-reset {
  position: relative;
}

.xy-st-reset-warn {
  margin-left: var(--space-1);
  color: var(--xy-seal);
}

.xy-btn {
  padding: var(--space-1) var(--space-4);
  border-radius: 2px;
  font-size: var(--font-size-md);
  font-family: inherit;
  letter-spacing: 1px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.xy-btn--ghost {
  border: 1px solid var(--xy-ink-line);
  background: transparent;
  color: var(--xy-ink-2);
}
</style>
