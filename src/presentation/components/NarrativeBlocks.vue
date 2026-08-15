<!--
* 文件: NarrativeBlocks.vue
* 功能: 战斗日志叙事块渲染（共享组件）
* 描述: 接收 RoundNarrativeRenderer 产出的 NarrativeBlock[]，统一渲染为
*       battle-header / round / action / settlement / snapshot / section /
*       summary / plain 各形态。悬浮信息卡片由宿主组件通过 hover/leave
*       事件自行处理（复用 LogTooltipResolver + EntityTooltip）。
 *       唤灵台 BattleLog（演劫台战斗心经亦直接复用 BattleLog）共用本组件，避免重复实现。
-->
<template>
  <div class="nb-root">
    <div v-for="(b, i) in blocks" :key="i" class="nb" :class="'nb--' + b.type">
      <template v-if="b.type === 'battle-header'">
        <span class="rule rule--double"></span>
        <div class="battle-line">
          <LogSeg v-for="(s, j) in b.segments" :key="j" :seg="s" @hover="onHover" @leave="onLeave" />
        </div>
        <span class="rule rule--double"></span>
      </template>

      <template v-else-if="b.type === 'round'">
        <span class="rule"></span>
        <span class="round-label">第 {{ b.turn }} 回合<template v-if="b.tag"> · {{ b.tag }}</template></span>
        <span class="rule"></span>
      </template>

      <template v-else-if="b.type === 'action'">
        <div class="action-header"><span class="glyph">◆</span>
          <LogSeg v-for="(s, j) in b.header" :key="j" :seg="s" @hover="onHover" @leave="onLeave" />
        </div>
        <div v-if="b.result" class="action-result">
          <LogSeg v-for="(s, j) in b.result" :key="j" :seg="s" @hover="onHover" @leave="onLeave" />
        </div>
        <div v-for="(sub, k) in b.subs" :key="'s' + k" class="action-sub">
          <span class="glyph glyph--sub">{{ k === b.subs.length - 1 ? '└' : '├' }}</span>
          <LogSeg v-for="(s, j) in sub" :key="j" :seg="s" @hover="onHover" @leave="onLeave" />
        </div>
      </template>

      <template v-else-if="b.type === 'settlement'">
        <div class="sub-header"><span class="rule rule--thin"></span>回合结算<span class="rule rule--thin"></span></div>
        <div v-for="(line, k) in b.lines" :key="k" class="indent-line">
          <LogSeg v-for="(s, j) in line" :key="j" :seg="s" @hover="onHover" @leave="onLeave" />
        </div>
      </template>

      <template v-else-if="b.type === 'snapshot'">
        <div class="sub-header"><span class="rule rule--thin"></span>态势<span class="rule rule--thin"></span></div>
        <div v-for="(line, k) in b.lines" :key="k" class="indent-line">
          <LogSeg v-for="(s, j) in line" :key="j" :seg="s" @hover="onHover" @leave="onLeave" />
        </div>
      </template>

      <template v-else-if="b.type === 'section'">
        <div class="section-title">【{{ b.title }}】</div>
        <div v-for="(line, k) in b.lines" :key="k" class="indent-line">
          <LogSeg v-for="(s, j) in line" :key="j" :seg="s" @hover="onHover" @leave="onLeave" />
        </div>
      </template>

      <template v-else-if="b.type === 'summary'">
        <span class="rule rule--double"></span>
        <div class="summary-content">
          <div v-for="(line, k) in b.lines" :key="k" class="summary-line">
            <LogSeg v-for="(s, j) in line" :key="j" :seg="s" @hover="onHover" @leave="onLeave" />
          </div>
        </div>
        <span class="rule rule--double"></span>
      </template>

      <template v-else>
        <LogSeg v-for="(s, j) in b.segments" :key="j" :seg="s" @hover="onHover" @leave="onLeave" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LogSegmentHover, NarrativeBlock } from '@/shared/types/battle-log'
import LogSeg from './LogSeg.vue'

defineProps<{ blocks: NarrativeBlock[] }>()

const emit = defineEmits<{
  (e: 'hover', event: MouseEvent, hover: LogSegmentHover): void
  (e: 'leave'): void
}>()

function onHover(event: MouseEvent, hover: LogSegmentHover): void {
  emit('hover', event, hover)
}

function onLeave(): void {
  emit('leave')
}
</script>

<style scoped lang="scss">
.nb-root {
  min-width: 0;
}

.nb {
  margin: var(--space-1) 0;
}

.nb--battle-header {
  display: flex;
  gap: var(--space-3);
  text-align: center;
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
  padding: var(--space-2) 0;
  align-items: center;
}

.battle-line {
  padding: var(--space-2) 0;
  letter-spacing: 1px;
  text-align: center;
}

.nb--round {
  display: flex;
  gap: var(--space-3);
  margin: var(--space-4) 0 var(--space-2);
  align-items: center;
}

.round-label {
  color: var(--color-info);
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
}

.action-header {
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-xl);
  margin: var(--space-1) 0;
}

.glyph {
  color: var(--color-warning);
  margin-right: var(--space-2);
}

.action-result,
.action-sub {
  padding-left: var(--space-5);
  line-height: var(--line-height-xl);
  margin: var(--space-1) 0;
}

.glyph--sub {
  color: var(--color-text-tertiary);
}

.sub-header {
  display: flex;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  margin-top: var(--space-2);
  letter-spacing: var(--space-1);
  align-items: center;
}

.indent-line {
  padding-left: var(--space-5);
  margin: var(--space-1) 0;
}

.section-title {
  color: var(--color-energy);
  font-weight: var(--font-weight-bold);
}

.nb--summary {
  display: flex;
  gap: 10px;
  padding: 8px 0;
  align-items: center;
}

.summary-content {
  text-align: center;
  padding: 4px 0;
}

.summary-line {
  margin: 2px 0;
}

.rule {
  flex: 1;
  height: 1px;
  background: var(--color-border-default);
  align-self: center;
}

.rule--double {
  height: 3px;
  border-top: 1px solid var(--color-border-tertiary);
  border-bottom: 1px solid var(--color-border-tertiary);
  background: transparent;
}

.rule--thin {
  opacity: 0.5;
}

/* 新块淡入 */
@media (prefers-reduced-motion: no-preference) {
  .nb {
    animation: nb-in 0.18s ease-out;
  }

  @keyframes nb-in {
    from {
      opacity: 0;
      transform: translateY(3px);
    }

    to {
      opacity: 1;
      transform: none;
    }
  }
}
</style>
