<!--
 * 文件: BattleSummaryDialog.vue
 * 功能: 战斗战报弹窗
 * 描述: 战斗结束后展示多维度统计数据，支持复制摘要和导出 JSON。
 *       纯中文排版，无图标/Emoji，信息密度优先。
-->
<template>
  <Dialog :model-value="modelValue" @update:model-value="emitModelValue" title="战斗战报" width="650px">
    <div v-if="summary" class="summary-container">
      <!-- 头部 -->
      <div class="summary-header">
        <span class="winner-badge" :class="summary.winner === '友方' ? 'win' : 'lose'">
          {{ summary.winner === '友方' ? '胜利' : '败北' }}
        </span>
        <span class="summary-meta">
          {{ summary.totalRounds }} 回合 · {{ formatDuration(summary.duration) }}
        </span>
      </div>

      <!-- 数据总览 -->
      <div class="summary-stats">
        <div class="stat-card">
          <div class="stat-value damage">{{ summary.totalDamageDealt }}</div>
          <div class="stat-label">总伤害</div>
        </div>
        <div class="stat-card">
          <div class="stat-value heal">{{ summary.totalHealing }}</div>
          <div class="stat-label">总治疗</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" :class="summary.totalDamageTaken > 0 ? 'damage' : ''">
            {{ summary.totalDamageTaken }}
          </div>
          <div class="stat-label">受击伤害</div>
        </div>
      </div>

      <!-- 最高单次 -->
      <div v-if="summary.highestSingleDamage || summary.highestSingleHeal" class="summary-records">
        <div v-if="summary.highestSingleDamage" class="record-line">
          最高伤害: <strong>{{ summary.highestSingleDamage.actor }}</strong> —
          {{ summary.highestSingleDamage.value }} 点{{ summary.highestSingleDamage.crit ? '（暴击）' : '' }}
        </div>
        <div v-if="summary.highestSingleHeal" class="record-line">
          最高治疗: <strong>{{ summary.highestSingleHeal.actor }}</strong> —
          {{ summary.highestSingleHeal.value }} 点
        </div>
      </div>

      <!-- 参与者列表 -->
      <div v-if="summary.participants.length > 0" class="summary-participants">
        <div class="section-title">参与者状态</div>
        <div class="participant-row" v-for="p in summary.participants" :key="p.id">
          <span class="p-name">{{ p.name }}</span>
          <span class="p-hp">{{ p.hpEnd }}/{{ p.hpMax }}</span>
          <span class="p-stat damage" title="造成伤害">{{ p.totalDamageDealt }}</span>
          <span class="p-stat" title="承受伤害">{{ p.totalDamageTaken }}</span>
          <span class="p-stat heal" title="获得治疗">{{ p.totalHealingReceived }}</span>
        </div>
      </div>

      <!-- 动作时间线摘要 -->
      <div v-if="summary.actionTimeline.length > 0" class="summary-timeline">
        <div class="section-title">动作时间线</div>
        <div class="timeline-entry" v-for="(a, i) in trimmedTimeline" :key="i">
          <span class="tl-turn">T{{ a.turn }}</span>
          <span class="tl-actor">{{ a.actor }}</span>
          <span class="tl-action">{{ a.action }}</span>
          <span class="tl-target" v-if="a.target">→ {{ a.target }}</span>
          <span class="tl-value damage" v-if="a.damage"> {{ a.damage }}{{ a.crit ? ' 暴击' : '' }}</span>
          <span class="tl-value heal" v-if="a.heal"> +{{ a.heal }}</span>
        </div>
        <div v-if="summary.actionTimeline.length > 10" class="timeline-more">
          ... 共 {{ summary.actionTimeline.length }} 条动作
        </div>
      </div>
    </div>

    <!-- 无数据 -->
    <div v-else class="summary-empty">
      暂无战报数据
    </div>

    <!-- 底部按钮 -->
    <template #footer>
      <Button @click="copySummary">复制摘要</Button>
      <Button @click="exportJson">导出 JSON</Button>
      <Button @click="closeDialog">关闭</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import type { BattleSummary } from '@/shared/types/battle-summary'

interface Props {
  modelValue: boolean
  summary: BattleSummary | null
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  summary: null,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const emitModelValue = (v: boolean) => emit('update:modelValue', v)
const closeDialog = () => emit('update:modelValue', false)

// 格式化耗时
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// 时间线仅显示前 10 条
const trimmedTimeline = computed(() => {
  return props.summary?.actionTimeline.slice(0, 10) ?? []
})

// 复制纯文本摘要
const copySummary = () => {
  const s = props.summary
  if (!s) return

  const lines = [
    `战斗战报 — ${s.winner === '友方' ? '胜利' : '败北'}`,
    `${s.totalRounds} 回合 · ${formatDuration(s.duration)}`,
    `─── 数据统计 ───`,
    `总伤害: ${s.totalDamageDealt}  |  总治疗: ${s.totalHealing}  |  受击: ${s.totalDamageTaken}`,
  ]
  if (s.highestSingleDamage) {
    lines.push(`最高伤害: ${s.highestSingleDamage.actor} — ${s.highestSingleDamage.value} 点${s.highestSingleDamage.crit ? '（暴击）' : ''}`)
  }
  if (s.highestSingleHeal) {
    lines.push(`最高治疗: ${s.highestSingleHeal.actor} — ${s.highestSingleHeal.value} 点`)
  }

  navigator.clipboard.writeText(lines.join('\n')).catch(() => {
    // ponytail: 静默失败，剪贴板不可用时不做处理
  })
}

// 导出 JSON
const exportJson = () => {
  if (!props.summary) return
  const blob = new Blob([JSON.stringify(props.summary, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `battle-summary-${props.summary.battleId}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.summary-container {
  padding: var(--space-2);
  max-height: 60vh;
  overflow-y: auto;
}
.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border-default);
}
.winner-badge {
  font-size: 1.2em;
  font-weight: bold;
}
.winner-badge.win { color: var(--color-heal, #4caf50); }
.winner-badge.lose { color: var(--color-damage, #f44336); }
.summary-meta {
  color: var(--color-text-secondary);
}

.summary-stats {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.stat-card {
  flex: 1;
  text-align: center;
  padding: var(--space-2);
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  border: 1px solid var(--color-border-default);
}
.stat-value {
  font-size: 1.5em;
  font-weight: bold;
}
.stat-value.damage { color: var(--color-damage, #f44336); }
.stat-value.heal { color: var(--color-heal, #4caf50); }
.stat-label {
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.summary-records {
  margin-bottom: var(--space-3);
  padding: var(--space-2);
  background: var(--color-bg-tertiary);
  border-radius: 6px;
}
.record-line {
  margin: 4px 0;
}

.section-title {
  font-weight: bold;
  margin-bottom: var(--space-1);
  color: var(--color-text-secondary);
}
.summary-participants {
  margin-bottom: var(--space-3);
}
.participant-row {
  display: flex;
  gap: var(--space-2);
  padding: 4px 0;
  border-bottom: 1px solid var(--color-border-hairline);
}
.p-name { flex: 0 0 80px; font-weight: bold; }
.p-hp { flex: 0 0 70px; }
.p-stat { flex: 0 0 60px; text-align: right; }
.p-stat.damage { color: var(--color-damage, #f44336); }
.p-stat.heal { color: var(--color-heal, #4caf50); }

.summary-timeline {
  margin-bottom: var(--space-2);
}
.timeline-entry {
  display: flex;
  gap: var(--space-2);
  padding: 2px 0;
}
.tl-turn { flex: 0 0 30px; color: var(--color-text-tertiary); }
.tl-actor { flex: 0 0 60px; font-weight: bold; }
.tl-action { flex: 0 0 50px; color: var(--color-text-secondary); }
.tl-target { flex: 1; color: var(--color-text-secondary); }
.tl-value.damage { color: var(--color-damage, #f44336); }
.tl-value.heal { color: var(--color-heal, #4caf50); }
.timeline-more {
  color: var(--color-text-tertiary);
  font-style: italic;
}

.summary-empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-text-tertiary);
}
</style>
