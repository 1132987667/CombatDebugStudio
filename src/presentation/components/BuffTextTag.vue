<template>
  <span class="buff-text-tag" :class="[colorClass, { 'has-stacks': stacks > 1, 'tag--last-turn': turnsLeft === 1 }]"
    :title="tooltipText" @mouseenter="$emit('hover', $event)" @mouseleave="$emit('leave')">
    <template v-if="type === 'control'">
      【{{ text }}】<span v-if="turnsLeft > 0" class="tag-turns">（{{ turnsLeft }}）</span>
    </template>
    <template v-else>
      {{ text }}
      <span v-if="stacks > 1" class="tag-stacks">×{{ stacks }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ConditionState, ConditionStateNames } from '@/shared/types/buff-display'

const props = withDefaults(defineProps<{
  /** 显示文本，如 "攻击↑45%" 或 "眩晕" */
  text: string
  /** 标签类型 */
  type: 'buff' | 'debuff' | 'control'
  /** 条件状态 */
  condition?: ConditionState
  /** 剩余回合数（展开面板显示用） */
  turnsLeft?: number
  /** 叠加层数 */
  stacks?: number
  /** 悬停 tooltip */
  tooltip?: string
}>(), {
  condition: ConditionState.NONE,
  turnsLeft: 0,
  stacks: 1,
  tooltip: '',
})

defineEmits<{
  hover: [event: MouseEvent]
  leave: []
}>()

const TypeClass = {
  buff: 'tag--buff',
  debuff: 'tag--debuff',
  control: 'tag--control',
}

const colorClass = computed(() => {
  if (props.condition === ConditionState.INACTIVE) return 'tag--inactive'
  if (props.condition === ConditionState.PERMANENT) return 'tag--permanent'
  return TypeClass[props.type]
})

const tooltipText = computed(() => {
  if (props.tooltip) return props.tooltip
  const names = ConditionStateNames
  const validStates: string[] = Object.values(ConditionState)
  if (validStates.includes(props.condition)) {
    return `${props.text}（${names[props.condition]}）`
  }
  return props.text
})
</script>

<style scoped>
.buff-text-tag {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 1px var(--space-2);
  border-radius: var(--radius-sm);
  line-height: var(--line-height-md);
  white-space: nowrap;
  cursor: default;
  transition: color var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

/* 增益 */
.tag--buff {
  color: var(--color-energy);
  font-weight: var(--font-weight-bold);
}

.tag--buff:hover {
  background: rgba(var(--rgb-energy), var(--alpha-wash));
}

/* 减益 */
.tag--debuff {
  color: var(--color-danger);
}

.tag--debuff:hover {
  background: var(--color-danger-bg);
}

/* 控制 */
.tag--control {
  color: var(--color-debuff);
  font-weight: var(--font-weight-bold);
}

.tag--control:hover {
  background: rgba(var(--rgb-debuff), var(--alpha-wash));
}

/* 未激活 */
.tag--inactive {
  color: var(--color-text-disabled);
}

/* 永久 */
.tag--permanent {
  color: var(--color-text-tertiary);
}

.tag-turns,
.tag-stacks {
  color: var(--color-text-tertiary);
}

.has-stacks {
  border: 1px solid var(--color-border-hairline);
}

/* 剩余 1 回合闪烁 — 尊重系统减少动效设置 */
@media (prefers-reduced-motion: no-preference) {
  .tag--last-turn {
    animation: blink-turn 1s ease-in-out infinite;
  }
}

.tag--last-turn {
  opacity: 0.7;
}

@keyframes blink-turn {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }
}
</style>
