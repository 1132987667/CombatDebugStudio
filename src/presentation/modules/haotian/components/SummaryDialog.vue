<template>
  <Dialog :model-value="open" :title="'战斗摘要'"
    width="min(840px, 94vw)" content-class="dialog-content--flush" @update:model-value="onModelValue">
    <div class="ht-sum-toolbar">
      <span class="ht-sum-meta">
        {{ summary?.rounds ?? 0 }} 回合 ·
        <template v-if="store.summaryCut === 'playback'">至 {{ formatTime(store.playback.t) }}</template>
        <template v-else>时长 {{ formatTime(summary?.durationMs ?? 0) }}</template>
        <template v-if="winnerText"> · 胜方 <b class="ht-st-ok">{{ winnerText }}</b></template>
        <template v-if="summary"> · 剩余血量 {{ summary.survivorHpPct }}%（存活 {{ summary.survivorCount }}）</template>
      </span>
      <span class="ht-sum-spacer"></span>
      <Button size="tiny" :active="store.summaryCut === 'playback'"
        title="摘要只统计当前回放位置之前的事件，便于对比前中后阶段" @click="store.toggleSummaryCut()">
        {{ store.summaryCut === 'playback' ? '截断至当前位置' : '整场统计' }}
      </Button>
      <Button size="tiny" :active="store.showEmptyStats"
        title="无事件源的指标列（如抵抗）默认隐藏，此开关强制显示" @click="store.toggleShowEmptyStats()">
        {{ store.showEmptyStats ? '显示空指标' : '隐藏空指标' }}
      </Button>
      <Button title="导出战斗摘要为 Markdown 报告（回合/胜方 + 单位指标表）" @click="store.exportSummaryMarkdown()">Markdown</Button>
      <Button title="导出战斗摘要为 CSV（带 BOM，Excel 直接打开）" @click="store.exportSummaryCsv()">CSV</Button>
    </div>
    <div class="ht-sum-body">
      <table v-if="teams.length" class="ht-sum-table ht-team-table">
        <thead>
          <tr>
            <th class="l">阵营</th>
            <th>输出</th>
            <th>承伤</th>
            <th>治疗</th>
            <th>击杀</th>
            <th>存活</th>
            <th>剩余血量</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in teams" :key="t.side">
            <td class="l nm">{{ teamLabel(t.side) }}</td>
            <td class="num">{{ t.dealt }}</td>
            <td class="num">{{ t.taken }}</td>
            <td class="num heal">{{ t.healed }}</td>
            <td class="num">{{ t.kills }}</td>
            <td class="num">{{ t.survivors }}/{{ t.total }}</td>
            <td class="num">{{ t.hpEnd }}/{{ t.hpMax }}</td>
          </tr>
        </tbody>
      </table>
      <table v-if="rows.length" class="ht-sum-table">
        <thead>
          <tr>
            <th class="l">参战单位</th>
            <th>攻击</th>
            <th>命中</th>
            <th>输出</th>
            <th>承伤</th>
            <th>治疗</th>
            <th>暴击</th>
            <th>闪避</th>
            <th v-if="showResists">抵抗</th>
            <th>Buff 施加</th>
            <th>击杀</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="l nm">{{ store.pnameSide(r.id) }}</td>
            <td>{{ r.s.attacks }}</td>
            <td>{{ r.s.hits }}</td>
            <td class="num">{{ r.s.dealt }}</td>
            <td class="num">{{ r.s.taken }}</td>
            <td class="num heal">{{ r.s.healed }}</td>
            <td class="num">{{ r.s.crits }}</td>
            <td class="num">{{ r.s.dodges }}</td>
            <td v-if="showResists" class="num">{{ r.s.resists }}</td>
            <td class="num">{{ r.s.buffsApplied }}</td>
            <td class="num">{{ r.s.kills }}</td>
            <td class="num" :class="r.s.alive ? 'ht-st-ok' : 'ht-st-bad'">{{ r.s.alive ? `存活 ${r.s.hpEnd}` : '阵亡' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else-if="!teams.length" class="ht-empty">存档未加载</div>
      <div v-if="dotHint" class="ht-sum-note">{{ dotHint }}</div>
    </div>
    <template #footer>
      <Button variant="energy" @click="close">关闭</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatTime } from '@/domain/battle/replay/unified/unified-sim'
import type { UnitSummary } from '@/domain/battle/replay/unified/unified-summary'
import { useHaotianStore } from '../stores/haotianStore'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'

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
  return store.pnameSide(sum.winner)
})

/** L2 阵营对比行 */
const teams = computed(() => summary.value?.teams ?? [])

/** resists 列：真实录制无 debuff 抵抗事件源，默认隐藏（配置强制显示时始终显示） */
const showResists = computed(() => store.showEmptyStats || store.hasResisted)

const teamLabel = (side: string): string => (side === 'ally' ? '友方' : side === 'enemy' ? '敌方' : side)

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
