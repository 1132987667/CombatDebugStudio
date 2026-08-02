<!--
 * 文件: TracePayloadViewer.vue
 * 功能: TraceEvent payload 解读视图（树状/实时流共用）
 * 描述: 把结构化 payload 渲染为可读信息：
 *       - key-value 自适应网格（短键值并排，消灭横向空旷）
 *       - steps 数组（伤害/治疗计算链路）按 before→after 效果链展示
 *       不再向开发者抛原始 JSON——每个字段都是加工后的可读呈现。
-->

<template>
  <div class="payload-grid">
    <div v-for="(value, key) in payload" :key="key" class="payload-cell">
      <span class="payload-key">{{ key }}</span>
      <!-- steps 数组：按 before → after 效果链展示 -->
      <div v-if="key === 'steps' && Array.isArray(value)" class="payload-steps">
        <div v-for="(s, i) in value" :key="i" class="step-row">
          <!-- before === after（快照/跳过节点）：不画箭头，只显示单值 -->
          <template v-if="s.before !== s.after">
            <span class="step-before">{{ s.before }}</span>
            <span class="step-arrow">→</span>
          </template>
          <span class="step-after" :class="{ 'step-after--only': s.before === s.after }">{{ s.after }}</span>
          <span class="step-name">{{ s.stepName }}</span>
          <span class="step-desc">{{ s.description }}</span>
        </div>
      </div>
      <!-- weights 数组（AI 候选权重）：渲染为 `技能名=权重 ▸ …` 权重链 -->
      <div v-else-if="key === 'weights' && Array.isArray(value)" class="payload-weights">
        <span v-for="(w, i) in value" :key="i" class="weight-item" :title="weightTitle(w)">
          <span v-if="i > 0" class="weight-sep">▸</span>
          <span class="weight-name">{{ w.name ?? w.skillId }}</span>
          <span class="weight-val">={{ w.weight }}</span>
        </span>
      </div>
      <span v-else class="payload-value">{{ formatValue(value) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  payload: Record<string, unknown>
}

defineProps<Props>()

/** payload 值格式化：对象/数组 → JSON，其余 → 字符串 */
function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 权重悬停提示：展开 breakdown 明细（label=value 逐项） */
function weightTitle(w: Record<string, unknown>): string {
  const bd = w.breakdown as Array<{ label: string; value: number }> | undefined
  if (!Array.isArray(bd) || bd.length === 0) return ''
  return `${w.name ?? w.skillId}: ${bd.map((b) => `${b.label} ${b.value > 0 ? '+' : ''}${b.value}`).join(', ')}`
}
</script>

<style scoped lang="scss">
/* 自适应信息网格（auto-fit 折叠空轨道），短键值并排、消灭横向空旷 */
.payload-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-2) var(--space-3);
}

.payload-cell {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0;
  min-width: 0; /* 允许网格单元收缩，长值换行不溢出 */
}

.payload-key {
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.payload-value {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  word-break: break-all;
  overflow-wrap: anywhere;
}

/* steps 效果链：横跨全宽（过程性内容） */
.payload-steps {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.step-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-family: var(--font-family-mono);
}

.step-before {
  color: var(--color-text-secondary);
  min-width: 30px;
  text-align: right;
  flex-shrink: 0;
}

.step-arrow {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.step-after {
  color: var(--color-damage);
  min-width: 30px;
  flex-shrink: 0;
}

/* 单值节点（快照/跳过）：用中性主色而非伤害红，传达"值未变" */
.step-after--only {
  color: var(--color-text-primary);
}

.step-name {
  color: var(--color-text-tertiary);
  min-width: 70px;
  flex-shrink: 0;
}

/* weights 权重链：`技能名=权重 ▸ …`，悬停查看 breakdown 明细 */
.payload-weights {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  font-family: var(--font-family-mono);
}

.weight-item {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  cursor: help;
}

.weight-sep {
  color: var(--color-text-tertiary);
}

.weight-name {
  color: var(--color-text-secondary);
}

.weight-val {
  color: var(--color-energy);
  font-weight: var(--font-weight-semibold);
}

.step-desc {
  color: var(--color-text-secondary);
  flex: 1;
}
</style>
