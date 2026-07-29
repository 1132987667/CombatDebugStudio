<!--
 * 文件: ItemDetail.vue
 * 创建日期: 2026-03-07
 * 作者: CombatDebugStudio
 * 功能: 物品图鉴详情展示组件
 * 描述: 显示物品的属性、效果和描述信息
 * 版本: 1.0.0
-->

<template>
  <div class="item-detail">
    <div class="item-header">
      <div class="item-title">
        <h2>{{ item.name }}</h2>
        <span class="item-type">{{ getItemTypeText(item.type) }}</span>
      </div>
      <span v-if="item.rarity" class="item-rarity" :class="'rarity-' + item.rarity">
        {{ getRarityText(item.rarity) }}
      </span>
    </div>

    <div class="item-description-panel">
      <h3 class="section-title">物品描述</h3>
      <p class="description-text">{{ item.description || getDefaultDescription(item) }}</p>
    </div>

    <div v-if="item.stats && Object.keys(item.stats).length > 0" class="item-stats-panel">
      <h3 class="section-title">属性加成</h3>
      <div class="stats-grid">
        <div v-for="(value, key) in item.stats" :key="key" class="stat-item">
          <span class="stat-label">{{ getStatLabel(key) }}</span>
          <span class="stat-value" :class="getValueClass(value)">{{ formatValue(value) }}</span>
        </div>
      </div>
    </div>

    <div v-if="item.effects && item.effects.length > 0" class="item-effects-panel">
      <h3 class="section-title">物品效果</h3>
      <div class="effects-list">
        <div v-for="effect in item.effects" :key="effect.type" class="effect-item">
          <span class="effect-type">{{ getEffectTypeText(effect.type) }}</span>
          <span class="effect-value">{{ formatEffectValue(effect.value) }}</span>
        </div>
      </div>
    </div>

    <div v-if="item.slot" class="item-usage-panel">
      <h3 class="section-title">装备槽位</h3>
      <div class="slot-tag">
        <span>{{ getSlotText(item.slot) }}</span>
      </div>
    </div>

    <div class="item-source-panel">
      <h3 class="section-title">获取方式</h3>
      <div class="source-list">
        <div v-for="source in getItemSources(item.id)" :key="source" class="source-item">
          <span class="source-text">{{ source }}</span>
        </div>
        <div v-if="getItemSources(item.id).length === 0" class="empty-source">
          <span>可从商店购买或怪物掉落</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CompendiumItem } from '@/presentation/composables/useCompendium'
import { rarityNames } from '@/shared/types/Item'
import {
  getItemTypeText,
  getStatLabel,
  getEffectTypeText,
  getSlotText,
} from '@/shared/utils/display-helpers'

interface Props {
  item: CompendiumItem
}

const props = defineProps<Props>()

const getRarityText = (rarity: number): string => {
  return rarityNames[rarity] || '普通'
}

const getValueClass = (value: number | string): string => {
  if (typeof value === 'string' && value.startsWith('+')) {
    return 'positive'
  }
  if (typeof value === 'string' && value.startsWith('-')) {
    return 'negative'
  }
  if (typeof value === 'number' && value > 0) {
    return 'positive'
  }
  return ''
}

const formatValue = (value: number | string): string => {
  if (typeof value === 'number') {
    return value > 0 ? `+${value}` : `${value}`
  }
  return value
}

const formatEffectValue = (value: number): string => {
  return `+${value}`
}

const getDefaultDescription = (item: CompendiumItem): string => {
  const descriptions: Record<string, string> = {
    'mat_001': '生长在灵山深处的普通药草，具有基本的灵气。',
    'mat_002': '蕴含火焰精华的矿石，是锻造火系武器的材料。',
    'mat_003': '从冰魄中采集的晶体，可用于制作冰系装备。',
    'weapon_001': '铁匠打造的制式长剑，剑身锋利，适合初学者使用。',
    'armor_001': '由精铁打造的护甲，具备基本的防护能力。',
    'potion_001': '恢复少量气血值的药水，战斗中的必备品。'
  }
  return descriptions[item.id] || `${item.name}是一种有用的物品。`
}

const getItemSources = (itemId: string): string[] => {
  const sources: Record<string, string[]> = {
    'mat_001': ['灵山深处采集', '击败草精掉落'],
    'mat_002': ['火山矿洞采集', '击败火元素掉落'],
    'mat_003': ['冰魄之巅采集', '击败冰元素掉落'],
    'weapon_001': ['铁匠铺购买', '击败山魈掉落'],
    'armor_001': ['铁匠铺购买', '击败石魔掉落'],
    'potion_001': ['药店购买', '炼金师制作']
  }
  return sources[itemId] || []
}
</script>

<style scoped>
.item-detail {
  color: var(--color-text-secondary);
}

.item-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border-default);
  margin-bottom: var(--space-3);
}

.item-title h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  color: var(--color-info);
}

.item-type {
  display: inline-block;
  margin-top: var(--space-1);
  color: var(--color-text-tertiary);
  padding: 1px 5px;
  background: var(--color-bg-primary);
  border-radius: var(--radius-sm);
}

.item-rarity {
  padding: var(--space-1);
  border-radius: var(--radius-sm);
}

.item-rarity.rarity-1 {
  color: var(--color-text-tertiary);
  background: rgba(136, 136, 136, 0.15);
}

.item-rarity.rarity-2 {
  color: var(--color-info);
  background: var(--border-common-color-dark);
}

.item-rarity.rarity-3 {
  color: var(--color-debuff);
  background: rgba(167, 139, 250, 0.15);
}

.item-rarity.rarity-4 {
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.15);
}

.item-description-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.description-text {
  color: var(--color-text-tertiary);
  line-height: var(--line-height-lg);
  margin: 0;
}

.item-stats-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-1);
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.stat-label {
  color: var(--color-text-tertiary);
}

.stat-value {
  font-weight: var(--font-weight-bold);
}

.stat-value.positive {
  color: var(--color-success);
}

.stat-value.negative {
  color: var(--color-brand-red);
}

.item-effects-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.effects-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.effect-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.effect-type {
  color: var(--color-text-tertiary);
}

.effect-value {
  font-weight: var(--font-weight-bold);
  color: var(--color-info);
}

.item-usage-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.slot-tag {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
}

.item-source-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.source-item {
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.source-text {
  color: var(--color-text-tertiary);
}

.empty-source {
  text-align: center;
  padding: var(--space-2);
  color: var(--color-text-disabled);
}
</style>
