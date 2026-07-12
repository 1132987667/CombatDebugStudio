<template>
  <span
    class="buff-text-tag"
    :class="[colorClass, { 'has-stacks': stacks > 1, 'tag--last-turn': turnsLeft === 1 }]"
    :title="tooltipText"
    @mouseenter="$emit('hover', $event)"
    @mouseleave="$emit('leave')"
  >
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
import type { ConditionState } from '@/shared/types/buff-display'

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
  condition: 'none',
  turnsLeft: 0,
  stacks: 1,
  tooltip: '',
})

defineEmits<{
  hover: [event: MouseEvent]
  leave: []
}>()

const colorClass = computed(() => {
  if (props.condition === 'inactive') return 'tag--inactive'
  if (props.condition === 'permanent') return 'tag--permanent'
  switch (props.type) {
    case 'buff': return 'tag--buff'
    case 'debuff': return 'tag--debuff'
    case 'control': return 'tag--control'
  }
})

const tooltipText = computed(() => {
  if (props.tooltip) return props.tooltip
  if (props.condition === 'inactive') return `${props.text}（未激活）`
  if (props.condition === 'active') return `${props.text}（已激活）`
  if (props.condition === 'permanent') return `${props.text}（永久）`
  return props.text
})
</script>

<style scoped>
.buff-text-tag {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  line-height: var(--line-height-md);
  white-space: nowrap;
  cursor: default;
  transition: all var(--transition-fast) ease;
}

/* 增益 */
.tag--buff {
  color: var(--color-energy);
  font-weight: var(--font-weight-bold);
}
.tag--buff:hover {
  background: rgba(34, 211, 238, 0.1);
}

/* 减益 */
.tag--debuff {
  color: var(--color-danger);
  font-weight: var(--font-weight-regular);
}
.tag--debuff:hover {
  background: rgba(244, 67, 54, 0.1);
}

/* 控制 */
.tag--control {
  color: var(--color-debuff);
  font-weight: var(--font-weight-bold);
}
.tag--control:hover {
  background: rgba(168, 85, 247, 0.1);
}

/* 未激活 */
.tag--inactive {
  color: var(--color-text-disabled);
  font-weight: var(--font-weight-regular);
}

/* 永久 */
.tag--permanent {
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-regular);
}

.tag-turns,
.tag-stacks {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-regular);
}

.has-stacks {
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
</style>
