<template>
  <Dialog :model-value="open" :title="`战斗摘要 · ${store.archive?.battleId ?? '—'}`"
    width="min(840px, 94vw)" content-class="dialog-content--flush" @update:model-value="onModelValue">
    <div class="ht-sum-toolbar">
      <span class="ht-sum-meta">
        {{ summary?.rounds ?? 0 }} 回合 · 时长 {{ formatTime(summary?.durationMs ?? 0) }}
        <template v-if="winnerText"> · 胜方 <b class="ht-st-ok">{{ winnerText }}</b></template>
      </span>
      <span class="ht-sum-spacer"></span>
      <button class="ht-btn" title="导出战斗摘要为 Markdown 报告（回合/胜方 + 单位指标表）" @click="store.exportSummaryMarkdown()">⇩ Markdown</button>
      <button class="ht-btn" title="导出战斗摘要为 CSV（带 BOM，Excel 直接打开）" @click="store.exportSummaryCsv()">⇩ CSV</button>
    </div>
    <div class="ht-sum-body">
      <table v-if="rows.length" class="ht-sum-table">
        <thead>
          <tr>
            <th class="l">参战单位</th>
            <th>攻击</th>
            <th>输出</th>
            <th>承伤</th>
            <th>治疗</th>
            <th>暴击</th>
            <th>闪避</th>
            <th>抵抗</th>
            <th>Buff 施加</th>
            <th>击杀</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="l nm">{{ store.pname(r.id) }}<span class="id">{{ r.id }}</span></td>
            <td>{{ r.s.attacks }}</td>
            <td class="num">{{ r.s.dealt }}</td>
            <td class="num">{{ r.s.taken }}</td>
            <td class="num heal">{{ r.s.healed }}</td>
            <td class="num">{{ r.s.crits }}</td>
            <td class="num">{{ r.s.dodges }}</td>
            <td class="num">{{ r.s.resists }}</td>
            <td class="num">{{ r.s.buffsApplied }}</td>
            <td class="num">{{ r.s.kills }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="ht-empty">存档未加载</div>
      <div v-if="dotHint" class="ht-sum-note">{{ dotHint }}</div>
    </div>
    <template #footer>
      <button class="ht-btn primary" @click="close">关闭</button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import type { UnitSummary } from '@/domain/battle/replay/unified/unified-summary'
import { useHaotianStore } from '../stores/haotianStore'
import Dialog from '@/presentation/components/Dialog.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useHaotianStore()

const summary = computed(() => store.summary)

const rows = computed<Array<{ id: string; s: UnitSummary }>>(() => {
  const sum = summary.value
  if (!sum) return []
  const known = new Set(store.archive?.initialState.participants.map((p) => p.id) ?? [])
  const ids = (store.archive?.initialState.participants.map((p) => p.id) ?? []).concat(
    Object.keys(sum.units).filter((id) => !known.has(id)),
  )
  return ids.map((id) => ({ id, s: sum.units[id] })).filter((r) => r.s)
})

const winnerText = computed(() => {
  const sum = summary.value
  if (!sum?.winner) return ''
  return store.archive?.initialState.participants.find((p) => p.id === sum.winner)?.name ?? sum.winner
})

/** dot 伤害无 sourceId，提示承伤与输出无需对账 */
const dotHint = computed(() => {
  const sum = summary.value
  if (!sum) return ''
  const hasDot = store.evs.some((e) => e.phase === 'damage_calculation' && (e.payload as Record<string, unknown>)?.dot && !e.sourceId)
  return hasDot ? '提示：含持续伤害（无来源单位），其伤害计入承伤但未计入任何单位的输出。' : ''
})

const onModelValue = (val: boolean): void => emit('update:open', val)

const close = (): void => emit('update:open', false)
</script>
