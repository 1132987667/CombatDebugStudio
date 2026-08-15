<!--
 * 文件: BattleSummaryDialog.vue
 * 功能: 战斗战报弹窗（七层模型）
 * 描述: 战斗结束后展示统一战报（unified-summary.ts 从事件流派生）：
 *       L1 结果+胜负边际 / L2 阵营对比 / L3 单位贡献排名 / L4 判定健康度 /
 *       L5 技能使用 / L6 被动触发 / L7 关键事件。
 *       纯中文排版，无图标/Emoji，信息密度优先。支持复制摘要与导出 JSON。
-->
<template>
  <Dialog :model-value="modelValue" @update:model-value="emitModelValue" title="战斗战报" width="760px">
    <div v-if="summary" class="summary-container">
      <!-- L1 头部：结果 + 胜负边际 -->
      <div class="summary-header">
        <span class="winner-badge" :class="verdict === 'win' ? 'win' : verdict === 'lose' ? 'lose' : 'unknown'">
          {{ verdict === 'win' ? '胜利' : verdict === 'lose' ? '败北' : '未分胜负' }}
        </span>
        <span class="summary-meta">
          {{ summary.rounds }} 回合 · {{ formatDuration(summary.durationMs) }} ·
          剩余血量 {{ summary.survivorHpPct }}%（存活 {{ summary.survivorCount }}）
        </span>
      </div>

      <!-- L2 阵营对比 -->
      <div v-if="teams.length" class="section">
        <div class="section-title">阵营对比</div>
        <table class="sum-table">
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
            <tr v-for="t in teams" :key="t.side" :class="{ 'row-win': t.side === winnerSide }">
              <td class="l">{{ teamLabel(t.side) }}</td>
              <td class="num dmg">{{ t.dealt }}</td>
              <td class="num">{{ t.taken }}</td>
              <td class="num heal">{{ t.healed }}</td>
              <td class="num">{{ t.kills }}</td>
              <td class="num">{{ t.survivors }}/{{ t.total }}</td>
              <td class="num">{{ t.hpEnd }}/{{ t.hpMax }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- L3 单位贡献排名（输出降序 + MVP） -->
      <div v-if="rankedUnits.length" class="section">
        <div class="section-title">单位贡献 <span v-if="mvp" class="mvp-tag">MVP: {{ nameText(mvp.id) }}</span></div>
        <table class="sum-table">
          <thead>
            <tr>
              <th class="l">单位</th>
              <th>输出</th>
              <th>承伤</th>
              <th>治疗</th>
              <th>攻击</th>
              <th>暴击</th>
              <th>击杀</th>
              <th>每击</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in rankedUnits" :key="u.id" :class="{ 'row-mvp': mvp && mvp.id === u.id }">
              <td class="l nm">{{ nameText(u.id) }}</td>
              <td class="num dmg">{{ u.dealt }}</td>
              <td class="num">{{ u.taken }}</td>
              <td class="num heal">{{ u.healed }}</td>
              <td class="num">{{ u.attacks }}</td>
              <td class="num">{{ u.crits }}</td>
              <td class="num">{{ u.kills }}</td>
              <td class="num">{{ u.hits > 0 ? Math.round(u.dealt / u.hits) : '-' }}</td>
              <td class="num" :class="u.alive ? 'ok' : 'dead'">{{ u.alive ? `存活 ${u.hpEnd}` : '阵亡' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- L4 判定健康度 -->
      <div class="section">
        <div class="section-title">判定健康度</div>
        <div class="judge-row">
          <span class="judge-item">攻击 {{ summary.judgment.attacks }}</span>
          <span class="judge-item">命中 {{ summary.judgment.hits }}</span>
          <span class="judge-item">暴击 {{ summary.judgment.crits }}（{{ summary.judgment.critRate }}%）</span>
          <span class="judge-item">闪避 {{ summary.judgment.dodges }}</span>
          <span class="judge-item">抵抗 {{ summary.judgment.resists }}</span>
        </div>
      </div>

      <!-- L5 技能使用 -->
      <div v-if="summary.skills.length" class="section">
        <div class="section-title">技能使用</div>
        <table class="sum-table">
          <thead>
            <tr>
              <th class="l">技能</th>
              <th>次数</th>
              <th>输出</th>
              <th>占比</th>
              <th>治疗</th>
              <th>暴击</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, i) in summary.skills" :key="i">
              <td class="l nm">{{ s.skillName }}</td>
              <td class="num">{{ s.uses }}</td>
              <td class="num dmg">{{ s.damage }}</td>
              <td class="num">{{ s.pct }}%</td>
              <td class="num heal">{{ s.heal }}</td>
              <td class="num">{{ s.crits }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- L6 被动触发 -->
      <div v-if="summary.passives.length" class="section">
        <div class="section-title">被动触发</div>
        <table class="sum-table">
          <thead>
            <tr>
              <th class="l">被动</th>
              <th class="l">拥有者</th>
              <th>触发次数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in summary.passives" :key="i">
              <td class="l nm">{{ p.name }}</td>
              <td class="l">{{ p.owner }}</td>
              <td class="num">{{ p.triggered }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- L7 关键事件 -->
      <div v-if="summary.keyEvents.length" class="section">
        <div class="section-title">关键事件</div>
        <div class="key-events">
          <div v-for="(ev, i) in summary.keyEvents" :key="i" class="ke-line">
            <span class="ke-turn">T{{ ev.turn }}</span>
            <span :class="`ke-${ev.kind}`">{{ ev.text }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 无数据 -->
    <div v-else class="summary-empty">
      暂无战报数据
    </div>

    <!-- 底部按钮 -->
    <template #footer>
      <Button variant="energy" title="切换到昊天镜并回放该战斗（需先保存战斗记录）" @click="openInHaotian">去昊天镜分析</Button>
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
import { useBattleStore } from '@/presentation/stores/battleStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { uiNavBus, OPEN_ANALYSIS_EVENT } from '@/presentation/uiEvents'
import type { BattleSummary, UnitSummary } from '@/domain/battle/replay/unified/unified-summary'

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

/** 去昊天镜分析：广播跨模块导航事件（BattleArena 切 tab + haotianStore 按 battleId 加载记录） */
const openInHaotian = () => {
  const battleId = props.summary?.battleId
  if (!battleId) {
    useNotificationStore().toast('暂无战斗 ID，无法跳转分析', 'warning')
    return
  }
  uiNavBus.emit(OPEN_ANALYSIS_EVENT, battleId)
  closeDialog()
}

const teamLabel = (side: string): string => (side === 'ally' ? '友方' : side === 'enemy' ? '敌方' : side)

/** 阵营前缀名：与日志口径一致 [友方]/[敌方] */
const nameText = (id: string): string => {
  const u = props.summary?.units[id]
  if (!u) return id
  return `${teamLabel(u.side)}·${u.name}`
}

const verdict = computed<'win' | 'lose' | 'unknown'>(() => {
  const s = props.summary
  if (!s?.winner) return 'unknown'
  if (s.winner === 'ally') return 'win'
  if (s.winner === 'enemy') return 'lose'
  const side = s.units[s.winner]?.side
  if (side === 'ally') return 'win'
  if (side === 'enemy') return 'lose'
  return 'unknown'
})

const winnerSide = computed(() => {
  const s = props.summary
  if (!s?.winner) return ''
  if (s.winner === 'ally' || s.winner === 'enemy') return s.winner
  return s.units[s.winner]?.side ?? ''
})

const teams = computed(() => props.summary?.teams ?? [])

/** 单位按输出降序 */
const rankedUnits = computed(() => {
  if (!props.summary) return []
  return Object.values(props.summary.units).sort((a, b) => b.dealt - a.dealt || b.healed - a.healed)
})

const mvp = computed<UnitSummary | null>(() => {
  if (!props.summary) return null
  const best = Object.values(props.summary.units).reduce<UnitSummary | null>(
    (acc, u) => (u.dealt > (acc?.dealt ?? -1) && u.dealt > 0 ? u : acc),
    null,
  )
  return best
})

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// 复制纯文本摘要
const copySummary = () => {
  const s = props.summary
  if (!s) return

  const lines = [
    `战斗战报 — ${verdict.value === 'win' ? '胜利' : verdict.value === 'lose' ? '败北' : '未分胜负'}`,
    `${s.rounds} 回合 · ${formatDuration(s.durationMs)} · 胜方剩余血量 ${s.survivorHpPct}%`,
    `─── 阵营对比 ───`,
  ]
  for (const t of s.teams) {
    lines.push(`${teamLabel(t.side)}: 输出 ${t.dealt} | 承伤 ${t.taken} | 治疗 ${t.healed} | 击杀 ${t.kills} | 存活 ${t.survivors}/${t.total}`)
  }
  lines.push(`─── 判定 ───`)
  lines.push(`攻击 ${s.judgment.attacks} | 命中 ${s.judgment.hits} | 暴击 ${s.judgment.crits}(${s.judgment.critRate}%) | 闪避 ${s.judgment.dodges} | 抵抗 ${s.judgment.resists}`)
  if (mvp.value) lines.push(`MVP: ${nameText(mvp.value.id)} — 输出 ${mvp.value.dealt}`)
  if (s.keyEvents.length) {
    lines.push(`─── 关键事件 ───`)
    for (const ev of s.keyEvents) lines.push(`T${ev.turn} ${ev.text}`)
  }

  navigator.clipboard.writeText(lines.join('\n')).catch(() => {
    // HACK: 剪贴板不可用时静默失败（旧实现同口径）
  })
}

// 导出 JSON：优先导出完整统一存档（UnifiedArchive，含事件流），可在昊天镜「导入存档」回放/调试；
// 无存档时回退导出战报摘要（统计快照，昊天镜不可回放）
const exportJson = () => {
  const archive = useBattleStore().lastArchive
  const data = archive ?? props.summary
  if (!data) return
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = archive ? `battle-archive-${archive.battleId}.json` : `battle-summary-${props.summary!.battleId}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  if (archive) {
    useNotificationStore().notify('成功', '已导出完整存档，可在昊天镜「导入存档」中回放/调试', 'success')
  }
}
</script>

<style scoped>
.summary-container {
  padding: var(--space-2);
  max-height: 62vh;
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

.section {
  margin-bottom: var(--space-3);
}
.section-title {
  font-weight: bold;
  margin-bottom: var(--space-1);
  color: var(--color-text-secondary);
}
.mvp-tag {
  color: var(--color-heal, #4caf50);
  font-weight: bold;
  margin-left: var(--space-2);
}

.sum-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-md);
}
.sum-table th {
  text-align: right;
  padding: 4px 6px;
  color: var(--color-text-tertiary);
  font-weight: normal;
  border-bottom: 1px solid var(--color-border-hairline);
}
.sum-table th.l,
.sum-table td.l {
  text-align: left;
}
.sum-table td {
  text-align: right;
  padding: 4px 6px;
  border-bottom: 1px solid var(--color-border-hairline);
}
.sum-table td.nm {
  font-weight: bold;
}
.row-win td { background: rgba(76, 175, 80, 0.06); }
.row-mvp td { background: rgba(76, 175, 80, 0.1); }
.num.dmg { color: var(--color-damage, #f44336); }
.num.heal { color: var(--color-heal, #4caf50); }
.num.ok { color: var(--color-heal, #4caf50); }
.num.dead { color: var(--color-damage, #f44336); }

.judge-row {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.judge-item {
  color: var(--color-text-secondary);
}

.key-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ke-line {
  display: flex;
  gap: var(--space-2);
  padding: 2px 0;
}
.ke-turn {
  flex: 0 0 40px;
  color: var(--color-text-tertiary);
}
.ke-kill, .ke-first_blood { color: var(--color-damage, #f44336); }
.ke-highest_hit { color: var(--color-heal, #4caf50); }

.summary-empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-text-tertiary);
}
</style>
