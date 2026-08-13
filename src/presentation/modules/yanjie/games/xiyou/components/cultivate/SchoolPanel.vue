<template>
  <div class="xy-school-panel">
    <section class="xy-school-select">
      <div class="xy-school-head">
        <span>当前流派：<strong>{{ currentSchool?.name ?? '未选择' }}</strong></span>
        <span>技能点：{{ totalPoints }} / {{ maxPoints }}</span>
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
      <div class="xy-skill-tier" v-for="tier in TIERS" :key="tier">
        <div class="xy-tier-head">
          <span>{{ tierText(tier) }}（Lv.{{ tierLevelReq(tier) }} 开启）</span>
          <span class="xy-tier-lock" v-if="player.level < tierLevelReq(tier)">未解锁</span>
        </div>
        <div class="xy-skill-grid">
          <div class="xy-skill-node" v-for="sk in skillsByTier(tier)" :key="sk.name"
            :class="{ 'is-locked': player.level < skillLevelReq(sk) }">
            <div class="xy-skill-head">
              <span class="xy-skill-type">{{ skillTypeText(sk.type) }}</span>
              <span class="xy-skill-name">{{ sk.name }}</span>
            </div>
            <p class="xy-skill-desc">{{ sk.desc }}</p>
            <div class="xy-skill-ctrl">
              <span class="xy-skill-cost" v-if="sk.cost > 0">消耗 {{ sk.cost }} 能量</span>
              <div class="xy-skill-points">
                <button type="button" class="xy-stat-btn" :disabled="(sk.currentPoints ?? 0) <= 0" @click="decSkill(sk)">-</button>
                <span class="xy-stat-val">{{ sk.currentPoints ?? 0 }}/{{ skillMaxPoints(sk) }}</span>
                <button type="button" class="xy-stat-btn"
                  :disabled="(sk.currentPoints ?? 0) >= skillMaxPoints(sk) || player.level < skillLevelReq(sk) || availablePoints <= 0"
                  @click="incSkill(sk)">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="xy-school-actions">
        <button type="button" class="xy-btn xy-btn--ghost" :disabled="totalPoints === 0" @click="resetSkillPoints">重置技能点</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { player, schools } from '../../data/mock'
import type { XiyouSchool, XiyouSkill } from '../../data/mock'

const currentSchool = computed(() => schools.find((s) => s.selected))

const totalPoints = computed(() => currentSchool.value?.totalPoints ?? 0)
const maxPoints = computed(() => currentSchool.value?.maxPoints ?? TIERS.length * 4)

const availablePoints = computed(() => Math.max(0, maxPoints.value - totalPoints.value))

const TIERS = [1, 2, 3] as const

function tierOf(type: XiyouSkill['type']): 1 | 2 | 3 {
  return type === 'passive' ? 1 : type === 'skill' ? 2 : 3
}

function tierText(tier: number): string {
  return tier === 1 ? '第一层' : tier === 2 ? '第二层' : '第三层'
}

function tierLevelReq(tier: number): number {
  return tier === 1 ? 1 : tier === 2 ? 5 : 10
}

function skillTier(sk: XiyouSkill): number {
  return sk.tier ?? tierOf(sk.type)
}

function skillLevelReq(sk: XiyouSkill): number {
  return sk.levelReq ?? tierLevelReq(skillTier(sk))
}

function skillMaxPoints(sk: XiyouSkill): number {
  return sk.maxPoints ?? (sk.type === 'passive' ? 5 : sk.type === 'skill' ? 3 : 1)
}

function skillTypeText(t: XiyouSkill['type']): string {
  return { passive: '被动', skill: '小技能', ultimate: '大招' }[t]
}

function skillsByTier(tier: number): XiyouSkill[] {
  return currentSchool.value?.skills.filter((sk) => skillTier(sk) === tier) ?? []
}

function selectSchool(s: XiyouSchool) {
  if (s.selected) return
  if (!confirm(`确认切换至${s.name}？当前流派技能点将全部重置。`)) return
  schools.forEach((school) => {
    school.selected = school.id === s.id
    school.skills.forEach((sk) => (sk.currentPoints = 0))
    school.totalPoints = 0
  })
}

function incSkill(sk: XiyouSkill) {
  const s = currentSchool.value
  if (!s || availablePoints.value <= 0 || player.level < skillLevelReq(sk) || (sk.currentPoints ?? 0) >= skillMaxPoints(sk)) return
  sk.currentPoints = (sk.currentPoints ?? 0) + 1
  s.totalPoints = (s.totalPoints ?? 0) + 1
}

function decSkill(sk: XiyouSkill) {
  const s = currentSchool.value
  if (!s || (sk.currentPoints ?? 0) <= 0) return
  sk.currentPoints = (sk.currentPoints ?? 0) - 1
  s.totalPoints = (s.totalPoints ?? 0) - 1
}

function resetSkillPoints() {
  const s = currentSchool.value
  if (!s) return
  if (!confirm('确认重置所有技能点？')) return
  s.skills.forEach((sk) => (sk.currentPoints = 0))
  s.totalPoints = 0
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
  margin: 0 0 var(--space-3);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--xy-ink-2);
}

.xy-skill-tier {
  margin-bottom: var(--space-4);
}

.xy-tier-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px dashed var(--xy-ink-line);
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-tier-lock {
  margin-left: auto;
  color: var(--xy-ink-4);
}

.xy-skill-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.xy-skill-node {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;

  &.is-locked {
    opacity: 0.5;
    background: var(--color-bg-secondary);
  }
}

.xy-skill-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-skill-type {
  font-size: var(--font-size-md);
  color: var(--xy-seal);
}

.xy-skill-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-skill-desc {
  flex: 1;
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-skill-ctrl {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-1);
}

.xy-skill-cost {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-skill-points {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-stat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--color-bg-secondary);
  color: var(--xy-ink-2);
  cursor: pointer;
  font-size: var(--font-size-md);

  &:hover:not(:disabled) {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.xy-stat-val {
  width: 36px;
  text-align: center;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-gold);
}

.xy-school-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-2);
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
</style>
