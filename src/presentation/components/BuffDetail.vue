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
      <p class="description-text">{{ getBuffDescription(buff) }}</p>
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

    <div class="buff-usage-panel">
      <h3 class="section-title">获取方式</h3>
      <div class="usage-list">
        <div v-for="source in getPossibleSources(buff.id)" :key="source" class="usage-item">
          <span class="usage-text">{{ source }}</span>
        </div>
        <div v-if="getPossibleSources(buff.id).length === 0" class="empty-usage">
          <span>可通过技能或装备获得</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getAttrName, ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { CompendiumBuff } from '@/presentation/composables/useCompendium'
import { BUFF_ID as STUN_BUFF_ID } from '@/domain/buff/scripts/StunDebuff'


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
  const id = props.buff.id.toLowerCase()
  if (id.includes('poison') || id.includes('stun') || id.includes('slow') || id.includes('seal')) {
    return '减益效果'
  }
  if (id.includes('heal') || id.includes('shield')) {
    return '增益效果'
  }
  if (id.includes('aura')) {
    return '光环效果'
  }
  return '增益/增益'
})

const effectTypeClass = computed(() => {
  if (effectType.value === '减益效果') return 'debuff'
  return 'buff'
})

const getBuffDescription = (buff: CompendiumBuff): string => {
  if (buff.description) return buff.description

  const descriptions: Record<string, string> = {
    'buff_speed_up': '提升角色10点速度，持续2回合',
    'buff_ally_atk_up': '提升同伴5%攻击力，持续2回合',
    'buff_iron_armor': '减少20%受到的伤害',
    'buff_wind_spirit': '风之精灵附身，提升5%速度',
    'buff_poison': '中毒状态，每回合损失一定气血值',
    'buff_shield': '获得护盾保护，可吸收一定伤害'
  }

  return descriptions[buff.id] || `获得${buff.name}效果。`
}

const getPossibleSources = (buffId: string): string[] => {
  const sources: Record<string, string[]> = {
    'buff_speed_up': ['技能 迅捷之风'],
    'buff_ally_atk_up': ['技能 战斗号召'],
    'buff_iron_armor': ['技能 铁甲护体'],
    'buff_poison': ['技能 毒液喷射', '敌人: 食人花妖'],
    'buff_shield': ['技能 护盾'],
    [STUN_BUFF_ID]: ['技能 眩晕打击']
  }

  return sources[buffId] || []
}
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

.description-text {
  color: var(--color-text-tertiary);
  line-height: var(--line-height-lg);
  margin: 0;
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

.buff-usage-panel {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
}

.usage-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.usage-item {
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.usage-text {
  color: var(--color-text-tertiary);
}

.empty-usage {
  text-align: center;
  padding: var(--space-2);
  color: var(--color-text-disabled);
}
</style>
