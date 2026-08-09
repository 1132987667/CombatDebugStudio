<template>
  <div class="xy-panel-scroll">
    <div class="xy-panel-tabs" role="tablist" aria-label="修行子系统">
      <button v-for="s in SUBS" :key="s.id" type="button" role="tab" class="xy-panel-tab"
        :class="{ active: sub === s.id }" :aria-selected="sub === s.id" @click="sub = s.id">
        {{ s.label }}
      </button>
    </div>

    <!-- 修为 -->
    <div v-if="sub === 'realm'">
      <div class="xy-realm-now">
        <span class="xy-realm-now-name">{{ currentRealm.name }}</span>
        <span class="xy-realm-now-level">Lv.{{ currentRealm.level }}</span>
        <span class="xy-realm-now-bonus">{{ currentRealm.bonus }}</span>
        <div class="xy-progress xy-progress--gold">
          <div class="xy-progress-fill" :style="{ width: currentRealm.progress * 100 + '%' }"></div>
        </div>
        <span class="xy-progress-text">
          <span>下一重：{{ realms[nextRealmIndex].name }}</span>
          <span>{{ Math.round(currentRealm.progress * 100) }}%</span>
        </span>
      </div>

      <h4 class="xy-sec-title">境界谱系<span class="xy-sec-count">已通 {{ realms.filter(r => r.unlocked).length }}/{{ realms.length }}</span></h4>
      <div v-for="r in realms" :key="r.name" class="xy-row-card" :class="{ 'xy-row-card--muted': !r.unlocked }">
        <div class="xy-row-top">
          <span class="xy-row-name">{{ r.name }}</span>
          <span class="xy-chip" :class="r.unlocked ? 'xy-chip--jade' : 'xy-chip--muted'">{{ r.unlocked ? '已通达' : '未开启' }}</span>
          <span class="xy-row-side" v-if="r.level > 0">Lv.{{ r.level }}</span>
        </div>
        <p class="xy-row-desc">{{ r.desc }}</p>
        <p class="xy-row-desc xy-row-desc--key">{{ r.bonus }}</p>
      </div>
    </div>

    <!-- 功法 -->
    <div v-else-if="sub === 'martial'">
      <h4 class="xy-sec-title">装配栏<span class="xy-sec-count">{{ martialArts.filter(m => m.equipped).length }}/4</span></h4>
      <div class="xy-card-grid">
        <div v-for="m in martialArts.filter(x => x.equipped)" :key="m.name" class="xy-martial-slot">
          <span class="xy-martial-slot-name">{{ m.slot }}</span>
          <span class="xy-martial-slot-book" :class="qualityClass(m.quality)">{{ m.name }}</span>
          <span class="xy-martial-slot-lv">Lv.{{ m.level }}</span>
        </div>
      </div>

      <h4 class="xy-sec-title">功法收藏<span class="xy-sec-count">{{ martialArts.length }}</span></h4>
      <div v-for="m in martialArts" :key="m.name" class="xy-row-card">
        <div class="xy-row-top">
          <span class="xy-row-name" :class="qualityClass(m.quality)">{{ m.name }}</span>
          <span class="xy-chip xy-chip--jade">{{ m.quality }}</span>
          <span v-if="m.equipped" class="xy-chip xy-chip--gold">已装配</span>
          <span class="xy-row-side" v-else>{{ m.slot }}</span>
        </div>
        <p class="xy-row-desc">{{ m.effect }}</p>
      </div>
    </div>

    <!-- 经脉 -->
    <div v-else-if="sub === 'meridian'">
      <p class="xy-panel-hint">打通穴位提升先天根基 · 剩余潜能点 3</p>
      <div v-for="mer in meridians" :key="mer.name" class="xy-meridian">
        <h4 class="xy-sec-title">{{ mer.name }}</h4>
        <div class="xy-meridian-chain">
          <div v-for="(n, i) in mer.nodes" :key="n.name" class="xy-meridian-node-wrap">
            <div class="xy-meridian-node" :class="{ open: n.level > 0, peak: n.breakthrough, full: n.level === n.maxLevel }">
              <span class="xy-meridian-node-lv">{{ n.level > 0 ? n.level : '—' }}</span>
            </div>
            <span class="xy-meridian-node-name">{{ n.name }}</span>
            <span v-if="i < mer.nodes.length - 1" class="xy-meridian-link" :class="{ on: n.level > 0 }"></span>
          </div>
        </div>
        <div v-for="n in mer.nodes" :key="`${mer.name}-${n.name}`" class="xy-row-card xy-meridian-detail">
          <div class="xy-row-top">
            <span class="xy-row-name">{{ n.name }}</span>
            <span class="xy-chip" :class="n.level === n.maxLevel ? 'xy-chip--gold' : 'xy-chip--jade'">
              {{ n.breakthrough ? '贯通' : n.level === n.maxLevel ? '圆满' : '可冲穴' }}
            </span>
            <span class="xy-row-side">{{ n.level }}/{{ n.maxLevel }}</span>
          </div>
          <p class="xy-row-desc">{{ n.effect }}</p>
        </div>
      </div>
    </div>

    <!-- 流派 -->
    <div v-else-if="sub === 'school'">
      <p class="xy-panel-hint">选择流派，技能点可自由重置重新加点</p>
      <div v-for="s in schools" :key="s.id" class="xy-school-block">
        <div class="xy-row-top">
          <h3 class="xy-school-name">{{ s.name }}</h3>
          <span v-if="s.selected" class="xy-chip xy-chip--gold">当前流派</span>
        </div>
        <p class="xy-row-desc">{{ s.motto }}</p>
        <div class="xy-skill-grid">
          <div v-for="sk in s.skills" :key="sk.name" class="xy-skill-card xy-card"
            :class="cardState(s, sk)">
            <span class="xy-skill-name">{{ sk.name }}</span>
            <span class="xy-skill-type">{{ skillTypeText(sk.type) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 神通 -->
    <div v-else>
      <p class="xy-panel-hint">神通随等级解锁，装配后进入战斗生效</p>
      <div v-for="d in dharmas" :key="d.name" class="xy-row-card">
        <div class="xy-row-top">
          <span class="xy-row-name">{{ d.name }}</span>
          <span class="xy-chip xy-chip--jade">{{ d.type }}</span>
          <span v-if="d.equipped" class="xy-chip xy-chip--gold">已装配</span>
          <span class="xy-row-side">Lv.{{ d.level }}/{{ d.maxLevel }}</span>
        </div>
        <p class="xy-row-desc">{{ d.effect }}</p>
        <div class="xy-progress" :class="{ 'xy-progress--line': d.equipped }">
          <div class="xy-progress-fill" :style="{ width: (d.level / d.maxLevel) * 100 + '%' }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { dharmas, martialArts, meridians, realms, schools, type XiyouSchool, type XiyouSkill } from '../data/mock'

const sub = ref<'realm' | 'martial' | 'meridian' | 'school' | 'dharma'>('realm')

const SUBS = [
  { id: 'realm', label: '修为' },
  { id: 'martial', label: '功法' },
  { id: 'meridian', label: '经脉' },
  { id: 'school', label: '流派' },
  { id: 'dharma', label: '神通' },
] as const

const currentRealm = realms.find(r => r.level > 0) ?? realms[0]
const nextRealmIndex = Math.min(realms.indexOf(currentRealm) + 1, realms.length - 1)

function qualityClass(q: string): string {
  return `xy-q--${q}`
}

function skillTypeText(t: XiyouSkill['type']): string {
  return { passive: '被动', skill: '小技能', ultimate: '大招' }[t]
}

function cardState(school: XiyouSchool, skill: XiyouSkill): string {
  if (school.selected) return 'xy-card--select'
  return skill.type === 'passive' ? 'xy-card--view' : 'xy-card--none'
}
</script>

<style scoped lang="scss">
.xy-panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding-right: var(--space-2);
}

.xy-panel-hint {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

/* ── 修为 ── */
.xy-realm-now {
  padding: var(--space-3);
  margin-bottom: var(--space-4);
  border: 1px solid rgba(var(--rgb-warning), var(--alpha-border));
  background: var(--xy-gold-soft);
  border-radius: 2px;
}

.xy-realm-now-name {
  font-family: var(--xy-font-title);
  font-size: var(--font-size-xl);
  letter-spacing: 4px;
  color: var(--xy-ink-1);
  margin-right: var(--space-2);
}

.xy-realm-now-level {
  font-size: var(--font-size-md);
  color: var(--xy-gold);
}

.xy-realm-now-bonus {
  display: block;
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--font-size-md);
  color: var(--xy-ink-2);
}

.xy-row-card--muted {
  opacity: 0.55;
}

/* ── 功法 ── */
.xy-martial-slot {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--xy-ink-line);
  background: var(--color-bg-secondary);
  border-radius: 2px;
}

.xy-martial-slot-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-martial-slot-book {
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
}

.xy-martial-slot-lv {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

/* ── 经脉 ── */
.xy-meridian {
  margin-bottom: var(--space-4);
}

.xy-meridian-chain {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  margin-bottom: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
}

.xy-meridian-node-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.xy-meridian-node {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--xy-ink-4);
  border-radius: 50%;
  background: var(--color-bg-secondary);
  color: var(--xy-ink-4);
  transition: all var(--transition-fast);

  &.open {
    border-color: var(--xy-jade);
    color: var(--xy-jade);
  }

  &.peak {
    box-shadow: 0 0 0 3px var(--xy-jade-soft);
  }

  &.full {
    border-color: var(--xy-gold);
    color: var(--xy-gold);
  }
}

.xy-meridian-node-lv {
  font-size: var(--font-size-md);
}

.xy-meridian-node-name {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-meridian-link {
  position: absolute;
  top: 14px;
  left: 100%;
  width: var(--space-3);
  height: 2px;
  background: var(--xy-ink-4);
  opacity: 0.4;

  &.on {
    background: var(--xy-jade);
    opacity: 1;
  }
}

.xy-meridian-detail {
  margin-bottom: var(--space-1);
}

/* ── 流派 ── */
.xy-school-block {
  margin-bottom: var(--space-4);
}

.xy-school-name {
  margin: 0;
  font-family: var(--xy-font-title);
  font-size: var(--font-size-lg);
  color: var(--xy-ink-1);
}

.xy-skill-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.xy-skill-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2);
  border-radius: 2px;
}

.xy-skill-name {
  font-size: var(--font-size-md);
  color: inherit;
}

.xy-skill-type {
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}
</style>
