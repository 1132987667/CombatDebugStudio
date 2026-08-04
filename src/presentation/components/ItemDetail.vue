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
      <p class="description-text">{{ item.description || `${item.name}是一种有用的物品。` }}</p>
    </div>

    <div v-if="item.stats && Object.keys(item.stats).length > 0" class="item-stats-panel">
      <h3 class="section-title">属性加成</h3>
      <div class="stats-grid">
        <div v-for="(value, key) in item.stats" :key="key" class="stat-item">
          <span class="stat-label">{{ getAttrName(key as ATTRIBUTE_CODE) }}</span>
          <span class="stat-value" :class="getValueClass(value)">{{ formatValue(value) }}</span>
        </div>
      </div>
    </div>

    <div v-if="item.effects && item.effects.length > 0" class="item-effects-panel">
      <h3 class="section-title">物品效果</h3>
      <div class="effects-list flex flex-col gap-1">
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


  </div>
</template>

<script setup lang="ts">
import type { CompendiumItem } from '@/presentation/composables/useCompendium'
import { rarityNames } from '@/shared/types/Item'
import {
  getItemTypeText,
  getEffectTypeText,
  getSlotText,
} from '@/shared/utils/display-helpers'
import { getAttrName, type ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { BuffPolarity } from '@/shared/types/buff-classification'

interface Props {
  item: CompendiumItem
}

const props = defineProps<Props>()

const getRarityText = (rarity: number): string => {
  return rarityNames[rarity] || '普通'
}

const getValueClass = (value: number | string): string => {
  if (typeof value === 'string' && value.startsWith('+')) {
    return BuffPolarity.POSITIVE
  }
  if (typeof value === 'string' && value.startsWith('-')) {
    return BuffPolarity.NEGATIVE
  }
  if (typeof value === 'number' && value > 0) {
    return BuffPolarity.POSITIVE
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
}

.item-description-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
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


</style>
