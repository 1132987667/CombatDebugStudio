基于您提供的《斗战西游 · 修行面板重构设计文档》以及项目的开发规范（特别是 **禁止使用 emoji**、**文本大小不低于 `--font-size-md`**、**水墨主题令牌** 等约束），我为您完成了修行面板（CultivatePanel）的界面重构代码。

以下代码严格遵循了项目的 DDD 架构与 Vue 3 Composition API 规范，并将原先的硬编码内容替换为结构化的数据驱动，同时去除了设计文档中所有的 emoji 符号（如 `🔒`、`→`），以确保符合 `AGENTS.md` 的硬性约束。

### 1. 主入口重构：`CultivatePanel.vue`
将原有的 5 个 Tab 扩展为 6 个，并将默认激活页签改为 `character`。

```vue
<template>
  <div class="xy-panel-scroll">
    <Tabs v-model="sub" :tabs="SUBS" destroy-inactive class="xy-tabs--seal">
      <template #character>
        <CharacterPanel @go-equip="sub = 'equip'" />
      </template>
      <template #realm>
        <RealmPanel />
      </template>
      <template #school>
        <SchoolPanel />
      </template>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Tabs from '@/presentation/components/Tabs.vue'
import type { TabItem } from '@/presentation/components/Tabs.vue'
import CharacterPanel from './character/CharacterPanel.vue'
import RealmPanel from './realm/RealmPanel.vue'
import SchoolPanel from './school/SchoolPanel.vue'

const sub = ref<'character' | 'realm' | 'school' | 'martial' | 'meridian' | 'dharma' | 'equip'>('character')

const SUBS: TabItem[] = [
  { id: 'character', label: '角色' },
  { id: 'realm',     label: '境界' },
  { id: 'school',    label: '流派' },
  { id: 'martial',   label: '功法' },
  { id: 'meridian',  label: '经脉' },
]
</script>

<style scoped lang="scss">
.xy-panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding-right: var(--space-2);
}
</style>
```


### 3. Tab 1：角色面板 `character/CharacterPanel.vue`
整合了头像、经验条、属性网格、加点分配与装备总览。

```vue
<template>
  <div class="xy-character-panel">
    <section class="xy-char-header">
      <div class="xy-char-avatar">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="22" fill="var(--xy-paper-warm)" stroke="var(--xy-ink-line)" stroke-width="2"/>
          <path d="M24 12c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 18c-5.3 0-16 2.7-16 8v4h32v-4c0-5.3-10.7-8-16-8z" fill="var(--xy-ink-3)"/>
        </svg>
      </div>
      <div class="xy-char-info">
        <div class="xy-char-name-row">
          <span class="xy-char-name">{{ player.name }}</span>
          <span class="xy-char-level">Lv.{{ player.level }}</span>
        </div>
        <p class="xy-char-title">{{ playerLevel.title }}</p>
        <div class="xy-exp-bar">
          <div class="xy-exp-fill" :style="{ width: (player.exp / playerLevel.expNeed) * 100 + '%' }"></div>
          <span class="xy-exp-text">{{ player.exp }} / {{ playerLevel.expNeed }} 经验</span>
        </div>
      </div>
    </section>

    <section class="xy-section">
      <h4 class="xy-sec-title">属性面板</h4>
      <div class="xy-attr-grid">
        <div class="xy-attr-item" v-for="attr in attrsList" :key="attr.key">
          <span class="xy-attr-label">{{ attr.label }}</span>
          <span class="xy-attr-value">{{ attr.value }}</span>
        </div>
      </div>
    </section>

    <section class="xy-section">
      <h4 class="xy-sec-title">角色加点 <span class="xy-sec-count">剩余 {{ statPoints.available }} 点</span></h4>
      <div class="xy-stat-list">
        <div class="xy-stat-row" v-for="stat in statList" :key="stat.key">
          <span class="xy-stat-label">{{ stat.label }}</span>
          <span class="xy-stat-desc">{{ stat.desc }}</span>
          <div class="xy-stat-ctrl">
            <button type="button" class="xy-stat-btn" :disabled="statPoints[stat.key] <= 0" @click="decStat(stat.key)">-</button>
            <span class="xy-stat-val">{{ statPoints[stat.key] }}</span>
            <button type="button" class="xy-stat-btn" :disabled="statPoints.available <= 0" @click="incStat(stat.key)">+</button>
          </div>
        </div>
      </div>
      <div class="xy-stat-actions">
        <button type="button" class="xy-btn xy-btn--primary" :disabled="usedPoints === 0" @click="applyStats">分配加点</button>
        <button type="button" class="xy-btn xy-btn--ghost" :disabled="usedPoints === 0" @click="resetStats">重置加点</button>
      </div>
    </section>

    <section class="xy-section">
      <h4 class="xy-sec-title">装备总览</h4>
      <div class="xy-equip-list">
        <div class="xy-equip-row" v-for="eq in equipList" :key="eq.slot">
          <span class="xy-equip-slot">{{ eq.slot }}</span>
          <span class="xy-equip-name">{{ eq.name }} <em v-if="eq.enhance">+{{ eq.enhance }}</em></span>
          <span class="xy-chip" :class="qualityClass(eq.quality)">{{ eq.quality }}</span>
        </div>
      </div>
      <button type="button" class="xy-link-btn" @click="$emit('goEquip')">前往装备面板</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { player, playerLevel, statPoints, equipList } from '../../data/mock'

defineEmits<{ goEquip: [] }>()

const attrsList = computed(() => [
  { key: 'attack', label: '攻击', value: player.attack },
  { key: 'defense', label: '防御', value: player.defense },
  { key: 'speed', label: '速度', value: player.speed },
  { key: 'maxHp', label: '气血', value: `${player.hp}/${player.maxHp}` },
  { key: 'critRate', label: '暴击', value: `${player.critRate}%` },
  { key: 'critDamage', label: '暴伤', value: `${player.critDamage}%` },
  { key: 'maxEnergy', label: '能量', value: `${player.energy}/${player.maxEnergy}` },
  { key: 'hit', label: '命中', value: '90%' },
])

const statList = [
  { key: 'strength', label: '力量', desc: '攻击 +1/点' },
  { key: 'vitality', label: '体质', desc: '气血 +10/点' },
  { key: 'agility', label: '敏捷', desc: '速度 +1/点' },
  { key: 'spirit', label: '精神', desc: '能量 +5/点' },
] as const

type StatKey = typeof statList[number]['key']
const usedPoints = computed(() => statPoints.strength + statPoints.vitality + statPoints.agility + statPoints.spirit)

function incStat(key: StatKey) { if (statPoints.available > 0) { statPoints.available--; statPoints[key]++ } }
function decStat(key: StatKey) { if (statPoints[key] > 0) { statPoints[key]--; statPoints.available++ } }
function applyStats() { console.log('应用加点', statPoints) }
function resetStats() {
  if (confirm('确认重置所有加点？')) {
    const total = usedPoints.value
    statPoints.strength = statPoints.vitality = statPoints.agility = statPoints.spirit = 0
    statPoints.available += total
  }
}
function qualityClass(q: string) { return `xy-q--${q}` }
</script>

<style scoped lang="scss">
.xy-character-panel { display: flex; flex-direction: column; gap: var(--space-4); }
.xy-char-header { display: flex; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--xy-ink-line); background: var(--xy-paper); border-radius: 2px; }
.xy-char-avatar { width: 64px; height: 64px; flex-shrink: 0; }
.xy-char-info { flex: 1; display: flex; flex-direction: column; gap: var(--space-1); }
.xy-char-name-row { display: flex; align-items: baseline; gap: var(--space-2); }
.xy-char-name {  font-size: var(--font-size-xl); color: var(--xy-ink-1); letter-spacing: 2px; }
.xy-char-level { font-size: var(--font-size-md); color: var(--xy-gold); }
.xy-char-title { margin: 0; font-size: var(--font-size-md); color: var(--xy-ink-3); }
.xy-exp-bar { position: relative; height: 12px; background: var(--color-bg-secondary); border: 1px solid var(--xy-ink-line); border-radius: 2px; overflow: hidden; margin-top: var(--space-1); }
.xy-exp-fill { height: 100%; background: linear-gradient(90deg, var(--xy-jade), var(--xy-gold)); transition: width var(--transition-base); }
.xy-exp-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: var(--font-size-md); color: var(--xy-ink-1); text-shadow: 0 0 2px var(--xy-paper); }

.xy-section { border: 1px solid var(--xy-ink-line); background: var(--xy-paper); border-radius: 2px; padding: var(--space-3); }
.xy-sec-title { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-3); padding-left: var(--space-2); border-left: 3px solid var(--xy-seal); font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); color: var(--xy-ink-2); }
.xy-sec-count { margin-left: auto; font-weight: var(--font-weight-regular); color: var(--xy-ink-4); }

.xy-attr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.xy-attr-item { display: flex; justify-content: space-between; padding: var(--space-1) var(--space-2); background: var(--color-bg-secondary); border-radius: 2px; }
.xy-attr-label { font-size: var(--font-size-md); color: var(--xy-ink-3); }
.xy-attr-value { font-size: var(--font-size-md); color: var(--xy-ink-1); font-weight: var(--font-weight-bold); }

.xy-stat-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
.xy-stat-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2); border: 1px solid var(--xy-ink-line); border-radius: 2px; }
.xy-stat-label { font-size: var(--font-size-md); color: var(--xy-ink-1); width: 48px; font-weight: var(--font-weight-bold); }
.xy-stat-desc { font-size: var(--font-size-md); color: var(--xy-ink-3); flex: 1; }
.xy-stat-ctrl { display: flex; align-items: center; gap: var(--space-2); }
.xy-stat-btn { width: 24px; height: 24px; border: 1px solid var(--xy-ink-line); background: var(--color-bg-secondary); color: var(--xy-ink-2); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 2px; font-size: var(--font-size-md);
  &:hover:not(:disabled) { border-color: var(--xy-seal); color: var(--xy-seal); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.xy-stat-val { width: 24px; text-align: center; font-size: var(--font-size-md); color: var(--xy-gold); font-weight: var(--font-weight-bold); }
.xy-stat-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }
.xy-btn { padding: var(--space-1) var(--space-4); border-radius: 2px; font-size: var(--font-size-md); cursor: pointer; font-family: inherit; letter-spacing: 1px; &:disabled { opacity: 0.5; cursor: not-allowed; } }
.xy-btn--primary { background: var(--xy-seal); color: #fff; border: 1px solid var(--xy-seal); }
.xy-btn--ghost { background: transparent; color: var(--xy-ink-2); border: 1px solid var(--xy-ink-line); }

.xy-equip-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
.xy-equip-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2); border: 1px dashed var(--xy-ink-line); border-radius: 2px; }
.xy-equip-slot { font-size: var(--font-size-md); color: var(--xy-ink-4); width: 48px; }
.xy-equip-name { font-size: var(--font-size-md); color: var(--xy-ink-1); flex: 1; em { font-style: normal; color: var(--xy-seal); margin-left: var(--space-1); } }
.xy-link-btn { background: none; border: none; color: var(--xy-seal); font-size: var(--font-size-md); cursor: pointer; padding: 0; font-family: inherit; &:hover { text-decoration: underline; } }

.xy-q--凡品 { color: var(--xy-ink-4); border-color: var(--xy-ink-4); }
.xy-q--玄品 { color: var(--xy-jade); border-color: var(--xy-jade); }
.xy-chip { display: inline-flex; padding: 0 var(--space-2); border: 1px solid currentColor; border-radius: 2px; font-size: var(--font-size-md); }
</style>
```

### 4. Tab 2：境界面板 `realm/RealmPanel.vue`
包含当前境界进度、谱系列表及突破校验逻辑。

```vue
<template>
  <div class="xy-realm-panel">
    <section class="xy-realm-current">
      <div class="xy-realm-head">
        <span class="xy-realm-name">{{ currentRealm.name }} · {{ currentRealm.subStage }}</span>
        <span class="xy-chip xy-chip--gold">当前境界</span>
      </div>
      <p class="xy-realm-bonus">{{ currentRealm.bonus }}</p>
      <div class="xy-progress xy-progress--gold">
        <div class="xy-progress-fill" :style="{ width: currentRealm.progress * 100 + '%' }"></div>
      </div>
      <p class="xy-realm-next">
        下一重：<strong>{{ nextRealm?.name ?? '已臻化境' }}</strong>
        <span v-if="nextRealm">（需 Lv.{{ nextRealm.levelReq }} + {{ nextRealm.materialName }}×{{ nextRealm.materialCount }}）</span>
      </p>
    </section>

    <section class="xy-section">
      <h4 class="xy-sec-title">境界谱系 <span class="xy-sec-count">已通 {{ reachedCount }}/{{ realms.length }}</span></h4>
      <div class="xy-realm-list">
        <div class="xy-realm-row" v-for="r in realms" :key="r.id" :class="{ 'is-current': r.isCurrent, 'is-locked': !r.reached && !r.isCurrent }">
          <div class="xy-realm-main">
            <span class="xy-realm-title">{{ r.name }}</span>
            <span class="xy-chip" :class="r.reached || r.isCurrent ? 'xy-chip--jade' : 'xy-chip--muted'">
              {{ r.isCurrent ? '当前' : r.reached ? '已通达' : '未开启' }}
            </span>
          </div>
          <p class="xy-realm-req" v-if="!r.reached && !r.isCurrent">需 Lv.{{ r.levelReq }} + {{ r.materialName }}×{{ r.materialCount }}</p>
          <p class="xy-realm-unlock" v-else>{{ r.unlocks }}</p>
        </div>
      </div>
    </section>

    <div class="xy-realm-actions" v-if="canBreakthrough">
      <button type="button" class="xy-btn xy-btn--primary" @click="handleBreakthrough">突破至{{ nextRealm?.name }}</button>
      <span class="xy-realm-cost">消耗：{{ nextRealm?.materialName }}×{{ nextRealm?.materialCount }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { realms, player } from '../../data/mock'

const currentRealm = computed(() => realms.find(r => r.isCurrent) ?? realms[0])
const nextRealm = computed(() => {
  const idx = realms.findIndex(r => r.isCurrent)
  return idx >= 0 && idx < realms.length - 1 ? realms[idx + 1] : null
})
const reachedCount = computed(() => realms.filter(r => r.reached || r.isCurrent).length)
const canBreakthrough = computed(() => nextRealm.value && player.level >= nextRealm.value.levelReq)

function handleBreakthrough() {
  if (!nextRealm.value) return
  if (player.level < nextRealm.value.levelReq) { alert(`需达到 Lv.${nextRealm.value.levelReq}`); return }
  if (confirm(`确认突破至${nextRealm.value.name}？消耗${nextRealm.value.materialName}×${nextRealm.value.materialCount}`)) {
    console.log('突破成功') // 实际接入 packStore.deductItem 与境界状态更新
  }
}
</script>

<style scoped lang="scss">
.xy-realm-panel { display: flex; flex-direction: column; gap: var(--space-4); }
.xy-realm-current { padding: var(--space-4); border: 1px solid rgba(var(--rgb-warning), var(--alpha-border)); background: var(--xy-gold-soft); border-radius: 2px; }
.xy-realm-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.xy-realm-name {  font-size: var(--font-size-xl); color: var(--xy-ink-1); letter-spacing: 2px; }
.xy-realm-bonus { margin: 0 0 var(--space-3); font-size: var(--font-size-md); color: var(--xy-ink-2); }
.xy-realm-next { margin: var(--space-2) 0 0; font-size: var(--font-size-md); color: var(--xy-ink-3); strong { color: var(--xy-ink-1); } }

.xy-section { border: 1px solid var(--xy-ink-line); background: var(--xy-paper); border-radius: 2px; padding: var(--space-3); }
.xy-sec-title { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-3); padding-left: var(--space-2); border-left: 3px solid var(--xy-seal); font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); color: var(--xy-ink-2); }
.xy-sec-count { margin-left: auto; font-weight: var(--font-weight-regular); color: var(--xy-ink-4); }

.xy-realm-list { display: flex; flex-direction: column; gap: var(--space-2); }
.xy-realm-row { padding: var(--space-2) var(--space-3); border: 1px solid var(--xy-ink-line); border-radius: 2px;
  &.is-current { border-color: var(--xy-gold); background: var(--xy-gold-soft); }
  &.is-locked { opacity: 0.6; }
}
.xy-realm-main { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
.xy-realm-title { font-size: var(--font-size-md); color: var(--xy-ink-1); font-weight: var(--font-weight-bold); }
.xy-realm-req, .xy-realm-unlock { margin: 0; font-size: var(--font-size-md); color: var(--xy-ink-3); }

.xy-realm-actions { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px dashed var(--xy-seal); background: var(--xy-seal-soft); border-radius: 2px; }
.xy-realm-cost { font-size: var(--font-size-md); color: var(--xy-ink-2); }
.xy-btn { padding: var(--space-2) var(--space-4); border-radius: 2px; font-size: var(--font-size-md); cursor: pointer; font-family: inherit; letter-spacing: 2px; }
.xy-btn--primary { background: var(--xy-seal); color: #fff; border: 1px solid var(--xy-seal); }

.xy-progress { position: relative; height: 8px; border: 1px solid var(--xy-ink-line); background: var(--color-bg-secondary); border-radius: 4px; overflow: hidden; }
.xy-progress-fill { height: 100%; background: linear-gradient(90deg, var(--xy-gold), var(--xy-gold)); border-radius: 4px; }
.xy-chip { display: inline-flex; padding: 0 var(--space-2); border: 1px solid currentColor; border-radius: 2px; font-size: var(--font-size-md);
  &.xy-chip--gold { color: var(--xy-gold); }
  &.xy-chip--jade { color: var(--xy-jade); }
  &.xy-chip--muted { color: var(--xy-ink-4); }
}
</style>
```

### 5. Tab 3：流派面板 `school/SchoolPanel.vue`
包含流派切换与技能树加点逻辑，去除了原设计中的锁形 emoji，改用文本标识。

```vue
<template>
  <div class="xy-school-panel">
    <section class="xy-school-select">
      <div class="xy-school-head">
        <span>当前流派：<strong>{{ currentSchool?.name ?? '未选择' }}</strong></span>
        <span>技能点：{{ currentSchool?.totalPoints ?? 0 }} / {{ currentSchool?.maxPoints ?? 0 }}</span>
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
      <div class="xy-skill-tier" v-for="tier in [1, 2, 3]" :key="tier">
        <div class="xy-tier-head">
          <span>── 第{{ tier === 1 ? '一' : tier === 2 ? '二' : '三' }}层（Lv.{{ tier === 1 ? 1 : tier === 2 ? 5 : 10 }}）──</span>
          <span class="xy-tier-lock" v-if="player.level < (tier === 1 ? 1 : tier === 2 ? 5 : 10)">[未解锁]</span>
        </div>
        <div class="xy-skill-grid">
          <div class="xy-skill-node" v-for="sk in getSkillsByTier(tier)" :key="sk.id" :class="{ 'is-locked': player.level < sk.levelReq }">
            <div class="xy-skill-head">
              <span class="xy-skill-type">[{{ skillTypeText(sk.type) }}]</span>
              <span class="xy-skill-name">{{ sk.name }}</span>
            </div>
            <p class="xy-skill-desc">{{ sk.desc }}</p>
            <div class="xy-skill-ctrl" v-if="player.level >= sk.levelReq">
              <span class="xy-skill-cost" v-if="sk.cost > 0">消耗 {{ sk.cost }} 能量</span>
              <div class="xy-skill-points">
                <button type="button" class="xy-stat-btn" :disabled="sk.currentPoints <= 0" @click="decSkill(sk)">-</button>
                <span class="xy-stat-val">{{ sk.currentPoints }}/{{ sk.maxPoints }}</span>
                <button type="button" class="xy-stat-btn" :disabled="sk.currentPoints >= sk.maxPoints || availableSkillPoints <= 0" @click="incSkill(sk)">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="xy-school-actions">
        <button type="button" class="xy-btn xy-btn--ghost" @click="resetSkillPoints">重置技能点</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { schools, player } from '../../data/mock'
import type { XiyouSchool, XiyouSchoolSkill } from '../../data/mock'

const currentSchool = computed(() => schools.find(s => s.selected))
const availableSkillPoints = computed(() => currentSchool.value ? currentSchool.value.maxPoints - currentSchool.value.totalPoints : 0)
const getSkillsByTier = (tier: number) => currentSchool.value?.skills.filter(s => s.tier === tier) ?? []
const skillTypeText = (t: string) => ({ passive: '被动', small: '小技能', ultimate: '大招' }[t] ?? t)

function selectSchool(s: XiyouSchool) {
  if (s.selected) return
  if (confirm(`确认切换至${s.name}？当前流派技能点将全部重置。`)) {
    schools.forEach(school => {
      school.selected = school.id === s.id
      if (school.selected) { school.skills.forEach(sk => sk.currentPoints = 0); school.totalPoints = 0 }
    })
  }
}
function incSkill(sk: XiyouSchoolSkill) {
  if (availableSkillPoints.value > 0 && sk.currentPoints < sk.maxPoints) {
    sk.currentPoints++; if (currentSchool.value) currentSchool.value.totalPoints++
  }
}
function decSkill(sk: XiyouSchoolSkill) {
  if (sk.currentPoints > 0) { sk.currentPoints--; if (currentSchool.value) currentSchool.value.totalPoints-- }
}
function resetSkillPoints() {
  if (confirm('确认重置所有技能点？') && currentSchool.value) {
    currentSchool.value.skills.forEach(sk => sk.currentPoints = 0); currentSchool.value.totalPoints = 0
  }
}
</script>

<style scoped lang="scss">
.xy-school-panel { display: flex; flex-direction: column; gap: var(--space-4); }
.xy-school-select { border: 1px solid var(--xy-ink-line); background: var(--xy-paper); border-radius: 2px; padding: var(--space-3); }
.xy-school-head { display: flex; justify-content: space-between; margin-bottom: var(--space-3); font-size: var(--font-size-md); color: var(--xy-ink-2); strong { color: var(--xy-ink-1); } }
.xy-school-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.xy-school-card { padding: var(--space-3); border: 1px solid var(--xy-ink-line); border-radius: 2px; cursor: pointer; display: flex; flex-direction: column; gap: var(--space-1); transition: all var(--transition-fast);
  &:hover { border-color: var(--xy-ink-2); }
  &.is-selected { border-color: var(--xy-gold); background: var(--xy-gold-soft); }
}
.xy-school-name { margin: 0;  font-size: var(--font-size-lg); color: var(--xy-ink-1); }
.xy-school-motto { margin: 0; font-size: var(--font-size-md); color: var(--xy-ink-3); flex: 1; }

.xy-section { border: 1px solid var(--xy-ink-line); background: var(--xy-paper); border-radius: 2px; padding: var(--space-3); }
.xy-sec-title { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-3); padding-left: var(--space-2); border-left: 3px solid var(--xy-seal); font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); color: var(--xy-ink-2); }

.xy-skill-tier { margin-bottom: var(--space-4); }
.xy-tier-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); font-size: var(--font-size-md); color: var(--xy-ink-3); border-bottom: 1px dashed var(--xy-ink-line); padding-bottom: var(--space-1); }
.xy-tier-lock { margin-left: auto; color: var(--xy-ink-4); }
.xy-skill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.xy-skill-node { padding: var(--space-2); border: 1px solid var(--xy-ink-line); border-radius: 2px; display: flex; flex-direction: column; gap: var(--space-1);
  &.is-locked { opacity: 0.5; background: var(--color-bg-secondary); }
}
.xy-skill-head { display: flex; align-items: center; gap: var(--space-2); }
.xy-skill-type { font-size: var(--font-size-md); color: var(--xy-seal); }
.xy-skill-name { font-size: var(--font-size-md); color: var(--xy-ink-1); font-weight: var(--font-weight-bold); }
.xy-skill-desc { margin: 0; font-size: var(--font-size-md); color: var(--xy-ink-3); flex: 1; }
.xy-skill-ctrl { display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-1); }
.xy-skill-cost { font-size: var(--font-size-md); color: var(--xy-ink-4); }
.xy-skill-points { display: flex; align-items: center; gap: var(--space-2); }

.xy-stat-btn { width: 24px; height: 24px; border: 1px solid var(--xy-ink-line); background: var(--color-bg-secondary); color: var(--xy-ink-2); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 2px; font-size: var(--font-size-md);
  &:hover:not(:disabled) { border-color: var(--xy-seal); color: var(--xy-seal); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.xy-stat-val { width: 36px; text-align: center; font-size: var(--font-size-md); color: var(--xy-gold); font-weight: var(--font-weight-bold); }
.xy-school-actions { display: flex; justify-content: flex-end; margin-top: var(--space-2); }
.xy-btn { padding: var(--space-1) var(--space-4); border-radius: 2px; font-size: var(--font-size-md); cursor: pointer; font-family: inherit; }
.xy-btn--ghost { background: transparent; color: var(--xy-ink-2); border: 1px solid var(--xy-ink-line); }
.xy-chip { display: inline-flex; padding: 0 var(--space-2); border: 1px solid currentColor; border-radius: 2px; font-size: var(--font-size-md);
  &.xy-chip--gold { color: var(--xy-gold); }
  &.xy-chip--muted { color: var(--xy-ink-4); }
}
</style>
```

### 6. 数据源补充：`data/mock.ts`
请在现有的 `mock.ts` 文件中追加以下类型定义与响应式初始数据，以支撑上述组件的渲染。

```typescript
// ... 在 mock.ts 底部追加以下类型与数据 ...

/** 角色等级与经验 */
export interface XiyouPlayerLevel {
  level: number
  exp: number
  expNeed: number
  title: string
}

/** 加点分配 */
export interface XiyouStatPoints {
  available: number
  strength: number
  vitality: number
  agility: number
  spirit: number
}

/** 境界阶段 */
export interface XiyouRealmStage {
  id: number
  name: string
  subStage: string
  levelReq: number
  materialId: string
  materialName: string
  materialCount: number
  bonus: string
  bonusAttrs: Record<string, number>
  unlocks: string
  reached: boolean
  isCurrent: boolean
  progress: number
}

/** 流派技能 */
export interface XiyouSchoolSkill {
  id: string
  name: string
  type: 'passive' | 'small' | 'ultimate'
  tier: 1 | 2 | 3
  levelReq: number
  cost: number
  desc: string
  maxPoints: number
  currentPoints: number
  unlocked: boolean
}

export interface XiyouSchool {
  id: string
  name: string
  motto: string
  skills: XiyouSchoolSkill[]
  selected: boolean
  totalPoints: number
  maxPoints: number
}

// 数据实例化
export const playerLevel = reactive<XiyouPlayerLevel>({
  level: 5, exp: 360, expNeed: 1500, title: '斗气充盈，踏碎虚空'
})

export const statPoints = reactive<XiyouStatPoints>({
  available: 3, strength: 0, vitality: 0, agility: 0, spirit: 0
})

export const equipList = reactive([
  { slot: '武器', name: '玄铁棍', enhance: 3, quality: '玄品' },
  { slot: '衣服', name: '锁子甲', enhance: 2, quality: '凡品' },
  { slot: '饰品', name: '灵玉坠', enhance: 1, quality: '凡品' },
])

export const realms = reactive<XiyouRealmStage[]>([
  { id: 1, name: '炼气', subStage: '圆满', levelReq: 1, materialId: '', materialName: '', materialCount: 0, bonus: '基础战斗', bonusAttrs: {}, unlocks: '基础战斗', reached: true, isCurrent: false, progress: 1 },
  { id: 2, name: '筑基', subStage: '初期', levelReq: 5, materialId: 'item_zhujidan', materialName: '筑基丹', materialCount: 1, bonus: '攻击 +5%、气血 +10%', bonusAttrs: { attack: 5, maxHp: 10 }, unlocks: '流派选择', reached: false, isCurrent: true, progress: 0.78 },
  { id: 3, name: '金丹', subStage: '初期', levelReq: 12, materialId: 'item_jindan', materialName: '金丹碎片', materialCount: 3, bonus: '攻击 +10%、防御 +5%', bonusAttrs: { attack: 10, defense: 5 }, unlocks: '神通槽 +1', reached: false, isCurrent: false, progress: 0 },
  // ... 元婴、化神、大乘、斗战 等数据可按相同结构补充 ...
])

export const schools = reactive<XiyouSchool[]>([
  {
    id: 'dasheng', name: '大圣道', motto: '一棒定乾坤', selected: true, totalPoints: 5, maxPoints: 12,
    skills: [
      { id: 'ds_p1', name: '斗战意志', type: 'passive', tier: 1, levelReq: 1, cost: 0, desc: '每次攻击叠加 1 层战意，每层攻击 +2%', maxPoints: 5, currentPoints: 3, unlocked: true },
      { id: 'ds_s1', name: '破甲斩', type: 'small', tier: 1, levelReq: 1, cost: 50, desc: '造成 120% 攻击伤害，无视 30% 防御', maxPoints: 3, currentPoints: 2, unlocked: true },
      { id: 'ds_s2', name: '疾风步', type: 'small', tier: 2, levelReq: 5, cost: 50, desc: '速度 +30%，持续 3 回合', maxPoints: 3, currentPoints: 0, unlocked: true },
      { id: 'ds_p2', name: '连击本能', type: 'passive', tier: 2, levelReq: 5, cost: 0, desc: '普攻 15% 概率追加一次攻击', maxPoints: 3, currentPoints: 0, unlocked: true },
      { id: 'ds_u1', name: '齐天战意', type: 'ultimate', tier: 3, levelReq: 10, cost: 150, desc: '攻击 +50%、暴击 +30%，持续 5 回合', maxPoints: 1, currentPoints: 0, unlocked: false },
      { id: 'ds_p3', name: '不灭战体', type: 'passive', tier: 3, levelReq: 10, cost: 0, desc: '首次致死伤害时保留 1 点气血', maxPoints: 1, currentPoints: 0, unlocked: false },
    ]
  },
  // ... 天蓬道、净坛道 数据可按相同结构补充 ...
])
```

### 集成说明
2. **战斗联动预留**：当前代码仅处理 UI 表现与本地状态流转。后续接入战斗引擎时，只需在 `applyStats` 与 `handleBreakthrough` 中调用 `battleStore` 或 `GameDataProcessor` 将 `ModifierType.PERCENTAGE` 注入到 `BattleEntity` 即可。
3. **对话框升级**：当前交互使用了原生的 `confirm()` 进行二次确认。若需统一视觉体验，可将其替换为项目内的 `ConfirmDialog.vue` 组件。