<template>
  <div class="xy-school-panel">
    <section class="xy-school-select">
      <div class="xy-school-head">
        <span>当前流派：<strong>{{ currentSchool?.name ?? '未选择' }}</strong></span>
        <span>技能点：{{ skillPoints.spent }} / {{ skillPoints.max }}</span>
      </div>
      <div class="xy-school-grid">
        <div class="xy-school-card" v-for="s in schools" :key="s.id" :class="{ 'is-selected': s.selected }" @click="selectSchool(s)">
          <h4 class="xy-school-name">{{ s.name }}</h4>
          <p class="xy-school-motto">{{ s.motto }}</p>
          <span class="xy-chip" :class="s.selected ? 'xy-chip--gold' : 'xy-chip--muted'">{{ s.selected ? '当前' : '选择' }}</span>
        </div>
      </div>
    </section>

    <section class="xy-section" v-if="currentSchool">
      <h4 class="xy-sec-title">技能树 · {{ currentSchool.name }}</h4>
      <div class="xy-school-tips">
        <span class="xy-school-tip">同分支逐层点亮，点亮上一层才能点下一层</span>
        <span class="xy-school-tip">已用 {{ schoolSpent }} 点 · 剩余 {{ availablePoints }} 点</span>
      </div>
      <div class="xy-branch-grid">
        <div class="xy-branch" v-for="branch in currentSchool.branches" :key="branch">
          <h5 class="xy-branch-title">{{ branch }}</h5>
          <div class="xy-node-list">
            <button
              type="button"
              class="xy-node"
              :class="nodeClass(n)"
              :disabled="!toggleable(n)"
              @click="toggleNode(n)"
              v-for="n in nodesOf(branch)"
              :key="n.id"
            >
              <span class="xy-node-head">
                <span class="xy-node-type">{{ nodeTypeText(n.type) }}</span>
                <span class="xy-node-name">{{ n.name }}</span>
                <span class="xy-node-points">{{ n.points }} 点</span>
              </span>
              <span class="xy-node-desc">{{ n.desc }}</span>
              <span class="xy-node-energy" v-if="n.energyCost > 0">消耗 {{ n.energyCost }} 能量</span>
              <span class="xy-node-req" v-if="!isLearned(n) && !prereqMet(n)">需先点亮上一阶</span>
            </button>
          </div>
        </div>
      </div>
      <div class="xy-school-actions">
        <button type="button" class="xy-btn xy-btn--ghost" :disabled="schoolSpent === 0" @click="resetSchool">重置本流派</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { schools, skillPoints } from '../../data/mock'
import type { XiyouSchool, XiyouSkillNode, XiyouNodeType } from '../../data/mock'

const currentSchool = computed(() => schools.find((s) => s.selected))

const availablePoints = computed(() => Math.max(0, skillPoints.max - skillPoints.spent))

const schoolSpent = computed(() =>
  currentSchool.value?.nodes.filter((n) => isLearned(n)).reduce((sum, n) => sum + n.points, 0) ?? 0,
)

const ULT_COST = 5
const ultLearned = computed(() => schools.reduce((sum, s) => sum + s.nodes.filter((n) => isLearned(n) && n.type === 'ultimate').length, 0))

function isLearned(n: XiyouSkillNode): boolean {
  return n.learned === true
}

function nodesOf(branch: string): XiyouSkillNode[] {
  return currentSchool.value?.nodes.filter((n) => n.branch === branch).sort((a, b) => a.tier - b.tier) ?? []
}

function prereqMet(n: XiyouSkillNode): boolean {
  if (n.tier === 1) return true
  const prev = currentSchool.value?.nodes.find((p) => p.branch === n.branch && p.tier === n.tier - 1)
  return prev ? isLearned(prev) : false
}

function pointsEnough(n: XiyouSkillNode): boolean {
  return availablePoints.value >= n.points
}

/** 大招限制：已点亮 2 个大招后，未点亮的大招不可再点 */
function ultLimitReached(n: XiyouSkillNode): boolean {
  return n.type === 'ultimate' && n.points >= ULT_COST && ultLearned.value >= 2 && !isLearned(n)
}

function toggleable(n: XiyouSkillNode): boolean {
  if (isLearned(n)) return true
  return prereqMet(n) && pointsEnough(n) && !ultLimitReached(n)
}

function nodeClass(n: XiyouSkillNode): Record<string, boolean> {
  return {
    'is-learned': isLearned(n),
    'is-locked': !isLearned(n) && !toggleable(n),
  }
}

function toggleNode(n: XiyouSkillNode) {
  if (isLearned(n)) {
    n.learned = false
    skillPoints.spent = Math.max(0, skillPoints.spent - n.points)
    return
  }
  if (!toggleable(n)) return
  n.learned = true
  skillPoints.spent += n.points
}

function selectSchool(s: XiyouSchool) {
  if (s.selected) return
  schools.forEach((school) => (school.selected = school.id === s.id))
}

function resetSchool() {
  const s = currentSchool.value
  if (!s) return
  if (!confirm('确认重置本流派全部技能点？')) return
  s.nodes.forEach((n) => {
    if (isLearned(n)) skillPoints.spent = Math.max(0, skillPoints.spent - n.points)
    n.learned = false
  })
}

function nodeTypeText(t: XiyouNodeType): string {
  return { attribute: '属性', passive: '被动', skill: '小技能', ultimate: '大招', enhance: '强化' }[t]
}
</script>

<style scoped lang="scss">
.xy-school-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.xy-school-select {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
}

.xy-school-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);

  strong {
    color: var(--xy-ink-1);
  }
}

.xy-school-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.xy-school-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--xy-ink-2);
  }

  &.is-selected {
    border-color: var(--xy-gold);
    background: var(--xy-gold-soft);
  }
}

.xy-school-name {
  margin: 0;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  color: var(--xy-ink-1);
}

.xy-school-motto {
  flex: 1;
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-section {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
}

.xy-sec-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--xy-ink-2);
}

.xy-school-tips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin-bottom: var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-branch-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  align-items: start;
}

.xy-branch {
  padding: var(--space-2);
  border: 1px dashed var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper-light);
}

.xy-branch-title {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 2px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-2);
}

.xy-node-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.xy-node {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
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

.xy-node-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-node-type {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

.xy-node-name {
  flex: 1;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-node-points {
  font-size: var(--font-size-md);
  color: var(--xy-gold);
}

.xy-node-desc {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-node-energy {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-node-req {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-school-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-3);
}

.xy-btn {
  padding: var(--space-1) var(--space-4);
  border-radius: 2px;
  font-size: var(--font-size-md);
  font-family: inherit;
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

.xy-chip {
  display: inline-flex;
  padding: 0 var(--space-2);
  border: 1px solid currentColor;
  border-radius: 2px;
  font-size: var(--font-size-md);
}

.xy-chip--gold {
  color: var(--xy-gold);
}

.xy-chip--muted {
  color: var(--xy-ink-4);
}
</style>
