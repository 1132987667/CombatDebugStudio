<template>
  <div class="buff-text-group" :class="[colorClass, { 'has-debug': debugMode }]">
    <!-- 标题行 -->
    <div class="group-header">
      <span class="group-name">【{{ buff.name }}】</span>
      <span class="group-meta">
        {{ buff.condition === 'permanent' ? '永久' : `剩余 ${buff.remainingTurns} 回合` }}
        <span v-if="buff.stacks > 1"> · ×{{ buff.stacks }}层</span>
        <span v-if="buff.isAura"> · 全队</span>
        <span v-if="buff.condition === 'active'" class="meta-active"> · 已激活</span>
        <span v-if="buff.condition === 'inactive'" class="meta-inactive"> · {{ conditionText }}</span>
      </span>
    </div>

    <!-- 效果列表 -->
    <ul class="group-effects">
      <li
        v-for="(eff, idx) in effectLines"
        :key="idx"
        class="effect-line"
        :class="eff.className"
      >
        ● {{ eff.text }}
      </li>
    </ul>

    <!-- 调试信息（可折叠） -->
    <div v-if="debugMode" class="group-debug">
      <div class="debug-toggle" role="button" tabindex="0" @click.stop="battleStore.setShowDebug(!showDebug)"
        @keydown.enter.stop.prevent="battleStore.setShowDebug(!showDebug)"
        @keydown.space.stop.prevent="battleStore.setShowDebug(!showDebug)">
        {{ showDebug ? '▾' : '▸' }} 调试信息
      </div>
      <div v-if="showDebug" class="debug-content">
        <div class="debug-row"><span class="debug-label">实例ID:</span><code>{{ buff.instanceId }}</code></div>
        <div class="debug-row"><span class="debug-label">BuffID:</span><code>{{ buff.buffId }}</code></div>
        <div v-if="buff.scriptName" class="debug-row">
          <span class="debug-label">脚本:</span><code>{{ buff.scriptName }}</code>
        </div>
        <div v-if="buff.configKey" class="debug-row">
          <span class="debug-label">配置key:</span><code>{{ buff.configKey }}</code>
        </div>
        <div class="debug-row"><span class="debug-label">来源:</span><span>参与者 {{ buff.ownerId }}</span></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { BuffTextItem } from '@/shared/types/buff-display'
import { getConditionLabel } from '@/presentation/composables/useBuffDisplay'
import { useBattleStore } from '@/presentation/stores/battleStore'

const props = defineProps<{
  buff: BuffTextItem
  debugMode?: boolean
}>()

// 从 store 中获取显示调试信息状态
const battleStore = useBattleStore()
const showDebug = computed(() => battleStore.showDebug)

const colorClass = computed(() => {
  if (props.buff.condition === 'inactive') return 'group--inactive'
  if (props.buff.condition === 'permanent') return 'group--permanent'
  if (props.buff.controlType && props.buff.controlType !== 'none') return 'group--control'
  return props.buff.isNegative ? 'group--debuff' : 'group--buff'
})

const conditionText = computed(() => {
  return getConditionLabel(props.buff.condition, props.buff.conditionLabel)
})

/** 将 Buff 拆解为显示行 */
const effectLines = computed(() => {
  const lines: Array<{ text: string; className: string }> = []

  // 属性修正行
  for (const mod of props.buff.modifiers) {
    const arrow = mod.value > 0 ? '↑' : '↓'
    const absVal = Math.abs(mod.value)
    const turnText = props.buff.remainingTurns > 0
      ? `（${props.buff.remainingTurns}回合）`
      : props.buff.condition === 'permanent' ? '（永久）' : ''

    // 条件标签 — 使用 conditionLabel（投影层预计算），不再从 description 正则提取
    let conditionSuffix = ''
    if (props.buff.condition === 'active') conditionSuffix = '（已激活）'
    else if (props.buff.condition === 'inactive' && props.buff.conditionLabel) {
      conditionSuffix = `（${props.buff.conditionLabel}）`
    }

    const className = mod.value > 0 ? 'effect--buff' : 'effect--debuff'
    const text = `${mod.attribute}${arrow}${absVal}%${conditionSuffix}${turnText}`
    lines.push({ text, className })
  }

  // 特殊效果行（DOT/HEAL/护盾等非属性修正效果 — 来自脚本 getEffectLines）
  // NOTE: modifier 类效果行跳过——modifiers 区段已通过结构化数据渲染
  if (props.buff.effectLines && props.buff.effectLines.length > 0) {
    for (const el of props.buff.effectLines) {
      if (el.kind === 'modifier') continue
      lines.push({
        text: el.text,
        className: `effect--${el.kind}`,
      })
    }
  }

  // 特殊效果描述（非属性修正的纯文本，仅当无其他效果行时显示）
  const descClean = props.buff.description
    .replace(/[\u4e00-\u9fa5]{2,4}[↑↓]\d+%?/g, '') // 去掉已提取的属性行
    .replace(/【.*?】/g, '') // 去掉控制标记
    .trim()

  if (descClean && lines.length === 0) {
    // 只有纯描述没有属性修正时才显示
    lines.push({
      text: descClean,
      className: 'effect--special',
    })
  }

  return lines
})
</script>

<style scoped>
.buff-text-group {
  padding: var(--space-2) var(--space-3);
  border-left: 2px solid transparent;
  margin-bottom: var(--space-1);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.group--buff {
  border-left-color: var(--color-energy);
  background: rgba(var(--rgb-energy), var(--alpha-tint));
}
.group--debuff {
  border-left-color: var(--color-danger);
  background: rgba(var(--rgb-danger), var(--alpha-tint));
}
.group--control {
  border-left-color: var(--color-debuff);
  background: rgba(var(--rgb-debuff), var(--alpha-tint));
}
.group--inactive {
  border-left-color: var(--color-text-disabled);
  background: transparent;
}
.group--permanent {
  border-left-color: var(--color-text-tertiary);
  background: transparent;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-1);
}

.group-name {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-secondary);
}

.group-meta {
  color: var(--color-text-tertiary);
}

.meta-active {
  color: var(--color-energy);
  font-weight: var(--font-weight-semibold);
  padding: 0 4px;
  border-radius: var(--radius-xs);
  background: rgba(var(--rgb-energy), var(--alpha-wash));
}

.meta-inactive {
  color: var(--color-text-disabled);
  padding: 0 4px;
  border-radius: var(--radius-xs);
  background: rgba(var(--rgb-neutral), var(--alpha-tint));
}

.group-effects {
  list-style: none;
  margin: 0;
  padding: 0;
}

.effect-line {
  line-height: var(--line-height-lg);
  padding: 1px 0 1px var(--space-3);
  margin: 0;
}

.effect--buff {
  color: var(--color-energy);
  font-weight: var(--font-weight-bold);
}

.effect--debuff {
  color: var(--color-danger);
}

.effect--control {
  color: var(--color-debuff);
  font-weight: var(--font-weight-bold);
}

.effect--special {
  color: var(--color-text-tertiary);
}

/* 特殊效果行配色（DOT/HEAL/护盾等） */
.effect--dot {
  color: var(--color-danger);
}
.effect--hot {
  color: var(--color-heal, #4ade80);
}
.effect--shield {
  color: var(--color-info);
}
.effect--vampire,
.effect--thorns {
  color: var(--color-warning);
}
.effect--other {
  color: var(--color-text-tertiary);
}

/* 调试区 */
.group-debug {
  margin-top: var(--space-2);
  padding-top: var(--space-1);
  border-top: 1px dashed var(--border-common-color-dark);
}

.debug-toggle {
  color: var(--color-info);
  cursor: pointer;
  user-select: none;
  padding: var(--space-1) 0;
}

.debug-toggle:hover {
  color: var(--color-energy);
}

.debug-content {
  padding: var(--space-2);
  background: rgba(var(--rgb-overlay), 0.6);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-common-color-dark);
}

.debug-row {
  display: flex;
  gap: var(--space-2);
  margin-bottom: 2px;
}

.debug-label {
  color: var(--color-text-tertiary);
  min-width: 60px;
  flex-shrink: 0;
}

.debug-content code {
  color: var(--color-energy);
  font-family: var(--font-family-mono);
}
</style>
