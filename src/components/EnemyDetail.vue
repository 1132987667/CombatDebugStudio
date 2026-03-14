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
      <div class="monitor-subtitle">基础属性</div>
      <div class="monitor-grid">
        <div class="monitor-item">
          <span class="monitor-label">气血</span>
          <span class="monitor-value">{{ enemy.stats.health }}</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">攻击</span>
          <span class="monitor-value">{{ enemy.stats.minAttack }}-{{ enemy.stats.maxAttack }}</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">防御</span>
          <span class="monitor-value">{{ enemy.stats.defense }}</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">速度</span>
          <span class="monitor-value">{{ enemy.stats.speed }}</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">暴击率</span>
          <span class="monitor-value">{{ enemy.stats.critRate || 10 }}%</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">暴击伤害</span>
          <span class="monitor-value">{{ enemy.stats.critDamage || 125 }}%</span>
        </div>
      </div>
    </div>

    <div class="enemy-skills-panel">
      <div class="monitor-subtitle">技能展示</div>
      <div v-if="skills.length === 0" class="empty-skills">
        <span>暂无技能</span>
      </div>
      <div v-else class="skills-container">
        <div v-for="skill in skills" :key="skill.id" class="skill-card">
          <div class="skill-header">
            <span class="skill-name">{{ skill.name }}</span>
            <div class="skill-meta">
              <span v-if="skill.category === 'passive'" class="skill-tag passive">被动</span>
              <span v-else-if="skill.category === 'ultimate'" class="skill-tag ultimate">大招</span>
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
      <div class="monitor-subtitle">掉落物品</div>
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
import { useCompendium, type CompendiumEnemy } from '@/composables/useCompendium'

interface Props {
  enemy: CompendiumEnemy
}

const props = defineProps<Props>()

const { getSkillById, getItemById } = useCompendium()

const skills = computed(() => {
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
    .filter(s => s !== undefined)
})

const getSelectorText = (selector: string): string => {
  const selectorMap: Record<string, string> = {
    'single_enemy': '单体敌人',
    'single_ally': '单体友军',
    'all_enemies': '全体敌人',
    'all_ally': '全体友军',
    'self': '自身',
    'random_enemy': '随机敌人'
  }
  return selectorMap[selector] || selector
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
  color: #eee;
}

.enemy-header {
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #0f3460;
  margin-bottom: 0.75rem;
}

.enemy-title h2 {
  margin: 0;
  font-size: 16px;
  color: #4fc3f7;
}

.enemy-level {
  font-size: 12px;
  color: #e94560;
  margin-left: 8px;
  padding: 1px 6px;
  background: rgba(233, 69, 96, 0.2);
  border-radius: 3px;
}

.section-title {
  font-size: 12px;
  font-weight: bold;
  color: #4fc3f7;
  margin: 0 0 0.5rem 0;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #0f3460;
  letter-spacing: 0.5px;
}

.enemy-stats-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.monitor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
}

.monitor-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.2rem 0.4rem;
  background: #0f0f1a;
  border-radius: 3px;
}

.monitor-label {
  font-size: 11px;
  color: #888;
}

.monitor-value {
  font-size: 12px;
  font-weight: bold;
  color: #eee;
}

.monitor-subtitle {
  color: #4fc3f7;
  font-size: 11px;
  margin-bottom: 0.35rem;
  padding-bottom: 0.15rem;
  border-bottom: 1px dashed #0f3460;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
}

.enemy-skills-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.skills-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.skill-card {
  background: #0f0f1a;
  border: 1px solid #0f3460;
  border-radius: 3px;
  overflow: hidden;
}

.skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0.5rem;
  background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
  border-bottom: 1px solid #0f3460;
}

.skill-name {
  font-size: 12px;
  font-weight: bold;
  color: #4fc3f7;
}

.skill-meta {
  display: flex;
  gap: 0.35rem;
}

.skill-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
}

.skill-tag.passive {
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.15);
}

.skill-tag.ultimate {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
}

.skill-cost {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  color: #f97316;
  background: rgba(249, 115, 22, 0.15);
}

.skill-body {
  padding: 0.4rem 0.5rem;
}

.skill-description {
  font-size: 11px;
  color: #aaa;
  line-height: 1.5;
  margin: 0 0 0.35rem 0;
}

.skill-selector {
  display: flex;
  gap: 0.25rem;
  font-size: 10px;
}

.selector-label {
  color: #888;
}

.selector-value {
  color: #4fc3f7;
}

.empty-skills,
.empty-drops {
  text-align: center;
  padding: 0.5rem;
  color: #666;
  font-size: 11px;
}

.enemy-drops-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.drops-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.drop-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.5rem;
  background: #0f0f1a;
  border-radius: 3px;
}

.drop-item-name {
  flex: 1;
  font-size: 11px;
  color: #eee;
}

.drop-quantity {
  font-size: 11px;
  color: #4fc3f7;
}

.drop-chance {
  font-size: 10px;
  color: #888;
  padding: 1px 4px;
  background: #1a1a2e;
  border-radius: 3px;
}

.enemy-description {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
}

.description-text {
  font-size: 11px;
  color: #aaa;
  line-height: 1.6;
  margin: 0;
}
</style>
