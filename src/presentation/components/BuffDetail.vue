<!--
 * 文件: BuffDetail.vue
 * 创建日期: 2026-03-07
 * 作者: CombatDebugStudio
 * 功能: Buff/状态图鉴详情展示组件
 * 描述: 显示buff/状态的效果属性和描述信息
 * 版本: 1.0.0
-->

<template>
  <div class="buff-detail">
    <div class="buff-header">
      <div class="buff-title">
        <h2>{{ buff.name }}</h2>
        <div class="buff-badges">
          <span class="buff-badge stacks">叠加: {{ buff.maxStacks }}</span>
          <span class="buff-badge duration" :class="{ 'permanent': isPermanent }">
            {{ isPermanent ? '永久' : `持续${buff.duration}回合` }}
          </span>
        </div>
      </div>
    </div>

    <div class="buff-attributes-panel">
      <h3 class="section-title">效果属性</h3>
      <div v-if="attributes.length > 0" class="attributes-grid">
        <div v-for="attr in attributes" :key="attr.key" class="attribute-item">
          <span class="attr-key">{{ attr.key }}</span>
          <span class="attr-value" :class="attr.valueType">{{ attr.value }}</span>
        </div>
      </div>
      <div v-else class="empty-attributes">
        <span>无属性效果</span>
      </div>
    </div>

    <div class="buff-description-panel">
      <h3 class="section-title">效果说明</h3>
      <p class="description-text">{{ buff.description || `获得${buff.name}效果。` }}</p>
    </div>

    <div class="buff-effect-panel">
      <h3 class="section-title">效果类型</h3>
      <div class="effect-tags">
        <span class="effect-tag" :class="effectTypeClass">
          {{ effectType }}
        </span>
        <span v-if="buff.maxStacks > 1" class="effect-tag stacks">
          可叠加
        </span>
        <span v-if="isPermanent" class="effect-tag permanent">
          永久
        </span>
      </div>
    </div>


  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getAttrName, ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { CompendiumBuff } from '@/presentation/composables/useCompendium'


interface Props {
  buff: CompendiumBuff
}

interface AttributeDisplay {
  key: string
  value: string
  valueType: string
}

const props = defineProps<Props>()

const isPermanent = computed(() => props.buff.duration === -1)

const attributes = computed((): AttributeDisplay[] => {
  if (!props.buff.attributes) return []

  return Object.entries(props.buff.attributes).map(([key, value]) => {
    let displayValue = value
    let valueType = 'numeric'

    if (value.startsWith('+') || value.startsWith('-')) {
      if (value.includes('%')) {
        displayValue = value
        valueType = 'percent'
      } else {
        displayValue = value
        valueType = 'numeric'
      }
    } else if (value.includes('%')) {
      valueType = 'percent'
    }

    return {
      key: getAttrName(key as ATTRIBUTE_CODE) || key,
      value: displayValue,
      valueType
    }
  })
})

const effectType = computed(() => {
  if (props.buff.category === 'aura') return '光环效果'
  if (props.buff.polarity === 'negative') return '减益效果'
  if (props.buff.polarity === 'positive') return '增益效果'
  return '中性效果'
})

const effectTypeClass = computed(() => {
  return props.buff.polarity === 'negative' ? 'debuff' : 'buff'
})
</script>

<style scoped>
.buff-detail {
  color: var(--color-text-primary);
}

.buff-header {
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border-default);
  margin-bottom: var(--space-3);
}

.buff-title h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  color: var(--color-info);
}

.buff-badges {
  display: flex;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.buff-badge {
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

.buff-badge.stacks {
  background: rgba(var(--rgb-debuff), var(--alpha-wash));
  color: var(--color-debuff);
}

.buff-badge.duration {
  background: var(--border-common-color-dark);
  color: var(--color-info);
}

.buff-badge.duration.permanent {
  background: rgba(var(--rgb-skill-ultimate), var(--alpha-wash));
  color: var(--color-warning);
}

.buff-attributes-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.attributes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-1);
}

.attribute-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.attr-key {
  color: var(--color-text-tertiary);
}

.attr-value {
  font-weight: var(--font-weight-bold);
}

.attr-value.numeric {
  color: var(--color-info);
}

.attr-value.percent {
  color: var(--color-success);
}

.empty-attributes {
  text-align: center;
  padding: var(--space-2);
  color: var(--color-text-disabled);
}

.buff-description-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.buff-effect-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.effect-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.effect-tag {
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-info-bg);
  color: var(--color-info);
}

.effect-tag.debuff {
  background: rgba(var(--rgb-brand-red), var(--alpha-wash));
  color: var(--color-brand-red);
}

.effect-tag.stacks {
  background: rgba(var(--rgb-debuff), var(--alpha-wash));
  color: var(--color-debuff);
}

.effect-tag.permanent {
  background: rgba(var(--rgb-skill-ultimate), var(--alpha-wash));
  color: var(--color-warning);
}


</style>
