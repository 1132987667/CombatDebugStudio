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
import type { CompendiumItem } from '@/composables/useCompendium'

interface Props {
  item: CompendiumItem
}

const props = defineProps<Props>()

const getItemTypeText = (type: string): string => {
  const typeMap: Record<string, string> = {
    'weapon': '武器',
    'armor': '防具',
    'accessory': '饰品',
    'material': '材料',
    'consumable': '消耗品',
    'quest': '任务物品'
  }
  return typeMap[type] || type
}

const getRarityText = (rarity: number): string => {
  const rarityMap: Record<number, string> = {
    1: '普通',
    2: '稀有',
    3: '史诗',
    4: '传说'
  }
  return rarityMap[rarity] || '普通'
}

const getStatLabel = (key: string): string => {
  const statMap: Record<string, string> = {
    'attack': '攻击力',
    'defense': '防御力',
    'speed': '速度',
    'health': '生命值',
    'critRate': '暴击率',
    'critDamage': '暴击伤害',
    'physicalDamage': '物理伤害',
    'magicDamage': '魔法伤害'
  }
  return statMap[key] || key
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

const getEffectTypeText = (type: string): string => {
  const effectMap: Record<string, string> = {
    'heal': '生命恢复',
    'mpRestore': '能量恢复',
    'buff': '增益效果',
    'damage': '伤害',
    'shield': '护盾'
  }
  return effectMap[type] || type
}

const formatEffectValue = (value: number): string => {
  return `+${value}`
}

const getSlotText = (slot: string): string => {
  const slotMap: Record<string, string> = {
    'weapon': '武器',
    'armor': '护甲',
    'helm': '头盔',
    'boots': '鞋子',
    'ring': '戒指',
    'necklace': '项链',
    'bracelet': '手镯',
    'belt': '腰带'
  }
  return slotMap[slot] || slot
}

const getDefaultDescription = (item: CompendiumItem): string => {
  const descriptions: Record<string, string> = {
    'mat_001': '生长在灵山深处的普通药草，具有基本的灵气。',
    'mat_002': '蕴含火焰精华的矿石，是锻造火系武器的材料。',
    'mat_003': '从冰魄中采集的晶体，可用于制作冰系装备。',
    'weapon_001': '铁匠打造的制式长剑，剑身锋利，适合初学者使用。',
    'armor_001': '由精铁打造的护甲，具备基本的防护能力。',
    'potion_001': '恢复少量生命值的药水，战斗中的必备品。'
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
  color: #eee;
}

.item-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #0f3460;
  margin-bottom: 0.75rem;
}

.item-title h2 {
  margin: 0;
  font-size: 16px;
  color: #4fc3f7;
}

.item-type {
  display: inline-block;
  margin-top: 4px;
  font-size: 11px;
  color: #888;
  padding: 1px 5px;
  background: #1a1a2e;
  border-radius: 3px;
}

.item-rarity {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
}

.item-rarity.rarity-1 {
  color: #888;
  background: rgba(136, 136, 136, 0.15);
}

.item-rarity.rarity-2 {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.15);
}

.item-rarity.rarity-3 {
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.15);
}

.item-rarity.rarity-4 {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
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

.item-description-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.description-text {
  font-size: 11px;
  color: #aaa;
  line-height: 1.6;
  margin: 0;
}

.item-stats-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.25rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.35rem 0.5rem;
  background: #0f0f1a;
  border-radius: 3px;
}

.stat-label {
  font-size: 11px;
  color: #888;
}

.stat-value {
  font-size: 12px;
  font-weight: bold;
}

.stat-value.positive {
  color: #4ade80;
}

.stat-value.negative {
  color: #e94560;
}

.item-effects-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.effects-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.effect-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.35rem 0.5rem;
  background: #0f0f1a;
  border-radius: 3px;
}

.effect-type {
  font-size: 11px;
  color: #888;
}

.effect-value {
  font-size: 12px;
  font-weight: bold;
  color: #4fc3f7;
}

.item-usage-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.slot-tag {
  display: inline-block;
  padding: 0.3rem 0.5rem;
  background: #0f0f1a;
  border-radius: 3px;
  font-size: 11px;
  color: #aaa;
}

.item-source-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.source-item {
  padding: 0.35rem 0.5rem;
  background: #0f0f1a;
  border-radius: 3px;
}

.source-text {
  font-size: 11px;
  color: #aaa;
}

.empty-source {
  text-align: center;
  padding: 0.5rem;
  color: #666;
  font-size: 11px;
}
</style>
