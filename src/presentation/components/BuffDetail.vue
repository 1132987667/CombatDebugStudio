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
import { AttributeCodeNames } from '@/domain/attribute/types'
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
      key: AttributeCodeNames[key] || key,
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
    'buff_speed_up': '提升角色10点速度，持续1回合。',
    'buff_ally_atk_up': '提升同伴5%攻击力，持续2回合。',
    'buff_iron_armor': '减少20%受到的物理伤害。',
    'buff_wind_spirit': '风之精灵附身，提升45%速度。',
    'buff_poison': '中毒状态，每回合损失一定生命值。',
    'buff_shield': '获得护盾保护，可吸收一定伤害。'
  }

  return descriptions[buff.id] || `获得${buff.name}效果。`
}

const getPossibleSources = (buffId: string): string[] => {
  const sources: Record<string, string[]> = {
    'buff_speed_up': ['技能: 迅捷之风'],
    'buff_ally_atk_up': ['技能: 战斗号召'],
    'buff_iron_armor': ['技能: 铁甲护体'],
    'buff_poison': ['技能: 毒液喷射', '敌人: 食人花妖'],
    'buff_shield': ['技能: 护盾术'],
    'buff_stun': ['技能: 眩晕打击']
  }

  return sources[buffId] || []
}
</script>

<style scoped>
.buff-detail {
  color: #eee;
}

.buff-header {
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #0f3460;
  margin-bottom: 0.75rem;
}

.buff-title h2 {
  margin: 0;
  font-size: 16px;
  color: #4fc3f7;
}

.buff-badges {
  display: flex;
  gap: 0.35rem;
  margin-top: 4px;
}

.buff-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
}

.buff-badge.stacks {
  background: rgba(167, 139, 250, 0.15);
  color: #a78bfa;
}

.buff-badge.duration {
  background: rgba(96, 165, 250, 0.15);
  color: #60a5fa;
}

.buff-badge.duration.permanent {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
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

.buff-attributes-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.attributes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.25rem;
}

.attribute-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.35rem 0.5rem;
  background: #0f0f1a;
  border-radius: 3px;
}

.attr-key {
  font-size: 11px;
  color: #888;
}

.attr-value {
  font-size: 12px;
  font-weight: bold;
}

.attr-value.numeric {
  color: #4fc3f7;
}

.attr-value.percent {
  color: #4ade80;
}

.empty-attributes {
  text-align: center;
  padding: 0.5rem;
  color: #666;
  font-size: 11px;
}

.buff-description-panel {
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

.buff-effect-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.effect-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.effect-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(79, 195, 247, 0.15);
  color: #4fc3f7;
}

.effect-tag.debuff {
  background: rgba(233, 69, 96, 0.15);
  color: #e94560;
}

.effect-tag.stacks {
  background: rgba(167, 139, 250, 0.15);
  color: #a78bfa;
}

.effect-tag.permanent {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.buff-usage-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 3px;
  padding: 0.5rem;
}

.usage-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.usage-item {
  padding: 0.35rem 0.5rem;
  background: #0f0f1a;
  border-radius: 3px;
}

.usage-text {
  font-size: 11px;
  color: #aaa;
}

.empty-usage {
  text-align: center;
  padding: 0.5rem;
  color: #666;
  font-size: 11px;
}
</style>
