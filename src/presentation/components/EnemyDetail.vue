<!--
 * 文件: EnemyDetail.vue
 * 创建日期: 2026-03-07
 * 作者: CombatDebugStudio
 * 功能: 敌人图鉴详情展示组件
 * 描述: 显示敌人的属性面板、技能展示区和背景故事
 * 版本: 1.0.0
-->

<template>
  <div class="enemy-detail">
    <div class="enemy-header">
      <div class="enemy-title">
        <h2>{{ enemy.name }} <span class="enemy-level">Lv.{{ enemy.level }}</span></h2>
      </div>
    </div>

    <div class="enemy-stats-panel">
      <div class="enemy-section-title">基础属性</div>
      <div class="enemy-stats-grid">
        <div class="enemy-stat-item">
          <span class="enemy-stat-label">气血</span>
          <span class="enemy-stat-value">{{ enemy.stats.currentHealth }}</span>
        </div>
        <div class="monitor-item">
          <span class="enemy-stat-label">攻击</span>
          <span class="enemy-stat-value">{{ enemy.stats.minAttack }}-{{ enemy.stats.maxAttack }}</span>
        </div>
        <div class="monitor-item">
          <span class="enemy-stat-label">防御</span>
          <span class="enemy-stat-value">{{ enemy.stats.defense }}</span>
        </div>
        <div class="monitor-item">
          <span class="enemy-stat-label">速度</span>
          <span class="enemy-stat-value">{{ enemy.stats.speed }}</span>
        </div>
        <div class="monitor-item">
          <span class="enemy-stat-label">暴击率</span>
          <span class="enemy-stat-value">{{ enemy.stats.critRate || 10 }}%</span>
        </div>
        <div class="monitor-item">
          <span class="enemy-stat-label">暴击伤害</span>
          <span class="enemy-stat-value">{{ enemy.stats.critDamage || 125 }}%</span>
        </div>
      </div>
    </div>

    <div class="enemy-skills-panel">
      <div class="enemy-section-title">技能展示</div>
      <div v-if="allSkills.length === 0" class="empty-skills">
        <span>暂无技能</span>
      </div>
      <div v-else class="skills-container">
        <!-- 被动技能按分类分组 -->
        <div v-for="group in groupedPassives" :key="group.category" class="skill-group">
          <div class="skill-group-title">
            <span class="group-dot" :style="{ background: group.color }"></span>
            {{ group.label }}
            <span class="group-count">({{ group.skills.length }})</span>
          </div>
          <div v-for="skill in group.skills" :key="skill.id" class="skill-card">
            <div class="skill-header">
              <span class="skill-name">{{ skill.name }}</span>
              <div class="skill-meta">
                <span class="skill-tag category-tag" :style="{ color: group.color, borderColor: group.color }">{{ group.label }}</span>
                <span class="skill-tag passive">被动</span>
              </div>
            </div>
            <div class="skill-body">
              <p class="skill-description">{{ skill.description }}</p>
            </div>
          </div>
        </div>
        <!-- 其他技能（小技能/大招） -->
        <div v-for="skill in otherSkills" :key="skill.id" class="skill-card">
          <div class="skill-header">
            <span class="skill-name">{{ skill.name }}</span>
            <div class="skill-meta">
              <span v-if="skill.category === 'ultimate'" class="skill-tag ultimate">大招</span>
              <span v-if="skill.energyCost > 0" class="skill-cost">消耗: {{ skill.energyCost }}能量</span>
            </div>
          </div>
          <div class="skill-body">
            <p class="skill-description">{{ skill.description }}</p>
            <div v-if="skill.selector" class="skill-selector">
              <span class="selector-label">目标:</span>
              <span class="selector-value">{{ getSelectorText(skill.selector) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="enemy-drops-panel">
      <div class="enemy-section-title">掉落物品</div>
      <div v-if="enemy.drops && enemy.drops.length > 0" class="drops-list">
        <div v-for="drop in enemy.drops" :key="drop.itemId" class="drop-item">
          <span class="drop-item-name">{{ getItemName(drop.itemId) }}</span>
          <span class="drop-quantity">×{{ drop.quantity }}</span>
          <span class="drop-chance">{{ Math.round(drop.chance * 100) }}%</span>
        </div>
      </div>
      <div v-else class="empty-drops">
        <span>暂无掉落</span>
      </div>
    </div>

    <div class="enemy-description">
      <h3 class="section-title">背景故事</h3>
      <p class="description-text">{{ getEnemyDescription(enemy) }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCompendium, type CompendiumEnemy, type CompendiumSkill } from '@/presentation/composables/useCompendium'
import { formatTargetConfig } from '@/domain/skill/types'

/** 被动分类展示配置：优先级从高到低 */
const CATEGORY_CONFIG: Record<string, { label: string; color: string; priority: number }> = {
  aura:      { label: '光环',   color: '#34d399', priority: 0 },
  trigger:   { label: '触发',   color: '#a78bfa', priority: 1 },
  heal:      { label: '治疗',   color: '#f472b6', priority: 2 },
  immunity:  { label: '免疫',   color: '#fbbf24', priority: 3 },
  summon:    { label: '召唤',   color: '#fb923c', priority: 4 },
  dot:       { label: '持续',   color: '#f87171', priority: 5 },
  shield:    { label: '护盾',   color: '#22d3ee', priority: 6 },
  attribute: { label: '属性',   color: '#60a5fa', priority: 7 },
}

const UNCATEGORIZED = { label: '未分类', color: '#94a3b8', priority: 99 }

interface Props {
  enemy: CompendiumEnemy
}

const props = defineProps<Props>()

const { getSkillById, getItemById } = useCompendium()

/** 合并所有技能，标记分类 */
const allSkills = computed(() => {
  const skillIds = [
    ...(props.enemy.skills.small || []),
    ...(props.enemy.skills.passive || []),
    ...(props.enemy.skills.ultimate || [])
  ]
  return skillIds
    .map(id => {
      const skill = getSkillById(id)
      if (!skill) return undefined
      const category = id.includes('_passive') ? 'passive' : id.includes('_ultimate') ? 'ultimate' : 'small'
      return { ...skill, category }
    })
    .filter((s): s is CompendiumSkill & { category: string } => s !== undefined)
})

/** 按 passiveCategory 分组的被动技能 */
interface SkillGroup {
  category: string
  label: string
  color: string
  skills: (CompendiumSkill & { category: string })[]
}

const groupedPassives = computed<SkillGroup[]>(() => {
  const passives = allSkills.value.filter(s => s.category === 'passive')
  const groups = new Map<string, SkillGroup>()

  for (const skill of passives) {
    // 取首个分类为主分类，避免重复展示
    const primary = skill.passiveCategory?.[0]
    const cat = primary && CATEGORY_CONFIG[primary] ? primary : '__uncategorized__'
    if (!groups.has(cat)) {
      const cfg = CATEGORY_CONFIG[cat] ?? UNCATEGORIZED
      groups.set(cat, { category: cat, label: cfg.label, color: cfg.color, skills: [] })
    }
    groups.get(cat)!.skills.push(skill)
  }

  return [...groups.values()].sort((a, b) => {
    const pa = CATEGORY_CONFIG[a.category]?.priority ?? 99
    const pb = CATEGORY_CONFIG[b.category]?.priority ?? 99
    return pa - pb
  })
})

/** 非被动技能（小技能/大招） */
const otherSkills = computed(() => {
  return allSkills.value.filter(s => s.category !== 'passive')
})

const getSelectorText = (selector: any): string => {
  return formatTargetConfig(selector)
}

const getItemName = (itemId: string): string => {
  const item = getItemById(itemId)
  if (item) return item.name

  const knownItems: Record<string, string> = {
    'elix_001': '生命精华',
    'elix_002': '能量精华',
    'elix_003': '速度精华',
    'elix_004': '防御精华',
    'elix_005': '攻击精华',
    'elix_006': '暴击精华',
    'elix_007': '全能精华',
    'crys_001': '火焰结晶',
    'crys_002': '冰霜结晶',
    'crys_003': '雷电结晶',
    'crys_004': '光明结晶',
    'crys_005': '黑暗结晶',
    'crys_006': '大地结晶',
    'crys_007': '神圣结晶'
  }

  return knownItems[itemId] || itemId
}

const getEnemyDescription = (enemy: CompendiumEnemy): string => {
  if (enemy.description) return enemy.description

  const descriptions: Record<string, string> = {
    'enemy_001': '生长在灵山深处的花妖，擅长使用花粉进行迷惑攻击。',
    'enemy_002': '由草木精灵化成的草精，行动敏捷，善于缠绕敌人。',
    'enemy_003': '山魈的幼年形态，虽然年幼但已具备相当的战斗力。',
    'enemy_004': '食人花的进阶形态，喷射的毒液可让敌人持续掉血。',
    'enemy_005': '由巨石吸收天地灵气化成的精怪，防御力极高。'
  }

  return descriptions[enemy.id] || `${enemy.name}是一种栖息在灵山中的怪物，具有独特的战斗能力。`
}
</script>

<style scoped>
.enemy-detail {
  color: var(--color-text-secondary);
}

.enemy-header {
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border-default);
  margin-bottom: var(--space-3);
}

.enemy-title h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  color: var(--color-info);
}

.enemy-level {
  color: var(--color-brand-red);
  margin-left: var(--space-2);
  padding: 1px var(--space-1);
  background: rgba(233, 69, 96, 0.2);
  border-radius: var(--radius-sm);
}

.enemy-stats-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.enemy-section-title {
  color: var(--color-info);
  margin-bottom: var(--space-1);
  padding-bottom: var(--space-1);
  border-bottom: 1px dashed var(--color-border-default);
}

.enemy-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-1);
}

.enemy-stat-item {
  display: flex;
  justify-content: space-between;
  padding: 0.2rem 0.4rem;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.enemy-stat-label {
  color: var(--color-text-tertiary);
}

.enemy-stat-value {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-secondary);
}

.enemy-skills-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.skills-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.skill-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.skill-group-title {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-secondary);
  padding: var(--space-1) var(--space-1);
  border-bottom: 1px dashed var(--color-border-default);
}

.group-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group-count {
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-normal);
}

.skill-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-2);
  background: linear-gradient(135deg, var(--color-bg-tertiary) 0%, var(--color-bg-primary) 100%);
  border-bottom: 1px solid var(--color-border-default);
}

.skill-name {
  font-weight: var(--font-weight-bold);
  color: var(--color-info);
}

.skill-meta {
  display: flex;
  gap: var(--space-1);
}

.skill-tag {
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

.skill-tag.passive {
  color: var(--color-debuff);
  background: rgba(167, 139, 250, 0.15);
}

.skill-tag.category-tag {
  border: 1px solid;
  background: transparent;
}

.skill-tag.ultimate {
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.15);
}

.skill-cost {
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  color: var(--color-warning);
  background: rgba(249, 115, 22, 0.15);
}

.skill-body {
  padding: var(--space-2) var(--space-2);
}

.skill-description {
  color: var(--color-text-tertiary);
  line-height: var(--line-height-md);
  margin: 0 0 var(--space-1) 0;
}

.skill-selector {
  display: flex;
  gap: var(--space-1);
}

.selector-label {
  color: var(--color-text-tertiary);
}

.selector-value {
  color: var(--color-info);
}

.empty-skills,
.empty-drops {
  text-align: center;
  padding: var(--space-2);
  color: var(--color-text-disabled);
}

.enemy-drops-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.drops-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.drop-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.drop-item-name {
  flex: 1;
  color: var(--color-text-secondary);
}

.drop-quantity {
  color: var(--color-info);
}

.drop-chance {
  color: var(--color-text-tertiary);
  padding: 1px var(--space-1);
  background: var(--color-bg-primary);
  border-radius: var(--radius-sm);
}

.enemy-description {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
}

.description-text {
  color: var(--color-text-tertiary);
  line-height: var(--line-height-lg);
  margin: 0;
}
</style>
