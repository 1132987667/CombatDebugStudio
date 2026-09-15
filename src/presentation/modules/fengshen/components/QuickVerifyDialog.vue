<!--
* 文件: QuickVerifyDialog.vue
* 功能: 封神榜快速验证（无头模拟战）
* 描述: 用当前已保存配置在封神榜上下文直接模拟一场/N 场战斗，输出胜负、回合数与
*       七层战报（单位输出/承伤/暴击、阵营汇总、关键事件），免去"切演劫台重开对局"
*       的回归循环。编成规则：验证敌人 → 我方取 actors 表前 4；验证角色 → 我方为该
*       角色 + actors 表其余前 3，敌方取 enemies 表前 4。
* 依赖: QuickBattleSim（无头模拟 + 聚合统计）；Dialog/Button 公共组件
-->
<template>
  <Dialog :model-value="open" title="快速验证 · 无头模拟战" width="880px" @update:model-value="onModelValue">
    <div class="fs-qv">
      <div class="fs-qv-lineup">
        <span class="fs-qv-lineup-label">编成</span>
        <span>我方：{{ lineupAllyText || '（加载中…）' }}</span>
        <span class="fs-qv-vs">vs</span>
        <span>敌方：{{ lineupEnemyText || '（加载中…）' }}</span>
      </div>
      <div v-if="lineupError" class="fs-qv-error">{{ lineupError }}</div>
      <div v-if="skippedRows.length" class="fs-qv-warn">
        已跳过 {{ skippedRows.length }} 条不参与模拟（表坏行缺 id/name/stats、或编成引用未命中）：{{ skippedRows.slice(0, 5).join('、') }}<template v-if="skippedRows.length > 5"> 等</template>
      </div>

      <div class="fs-qv-controls">
        <label class="fs-qv-field">
          <span class="fs-qv-field-label">我方编成</span>
          <TacticalSelect v-model="allyLineupId" size="md" :options="lineupOptions" />
        </label>
        <label class="fs-qv-field">
          <span class="fs-qv-field-label">敌方编成</span>
          <TacticalSelect v-model="enemyLineupId" size="md" :options="lineupOptions" />
        </label>
        <label class="fs-qv-field">
          <span class="fs-qv-field-label">种子</span>
          <input v-model="seed" class="fs-qv-input" type="text" placeholder="留空随机；填写后固定单场可复现" />
        </label>
        <div class="fs-qv-field">
          <span class="fs-qv-field-label">场次</span>
          <div class="fs-qv-count">
            <Button v-for="n in COUNT_OPTIONS" :key="n" size="small"
              :variant="battleCount === n && !seed.trim() ? 'primary' : 'ghost'" :disabled="running || !!seed.trim()"
              @click="battleCount = n">{{ n }}</Button>
          </div>
        </div>
        <Button variant="primary" :disabled="running || lineupLoading || !canRun" @click="run">
          {{ running ? progress || '模拟中…' : lineupLoading ? '编成载入中…' : '开始验证' }}
        </Button>
      </div>
      <div class="fs-qv-hint">按当前已保存配置模拟（行内已即时保存；编辑器中未保存的草稿不参与）。同种子同编成结果可复现。</div>

      <!-- 单场：完整战报 -->
      <template v-if="single">
        <div class="fs-qv-verdict" :class="`fs-qv-verdict--${single.winner ?? 'draw'}`">
          {{ verdictText }}
        </div>
        <template v-if="single.summary">
          <table class="fs-qv-table">
            <thead>
              <tr><th>阵营</th><th>总输出</th><th>总承伤</th><th>治疗</th><th>击杀</th><th>存活</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in single.summary.teams" :key="t.side">
                <td>{{ sideLabel(t.side) }}</td>
                <td>{{ t.dealt }}</td>
                <td>{{ t.taken }}</td>
                <td>{{ t.healed }}</td>
                <td>{{ t.kills }}</td>
                <td>{{ t.survivors }}/{{ t.total }}</td>
              </tr>
            </tbody>
          </table>
          <table class="fs-qv-table">
            <thead>
              <tr><th>单位</th><th>阵营</th><th>输出</th><th>承伤</th><th>治疗</th><th>暴击</th><th>最高单次</th><th>击杀</th><th>存活</th><th>结束HP</th></tr>
            </thead>
            <tbody>
              <tr v-for="u in unitRows" :key="u.id">
                <td>{{ u.name }}</td>
                <td>{{ sideLabel(u.side) }}</td>
                <td>{{ u.dealt }}</td>
                <td>{{ u.taken }}</td>
                <td>{{ u.healed }}</td>
                <td>{{ u.crits }}</td>
                <td>{{ u.highestHit }}</td>
                <td>{{ u.kills }}</td>
                <td>{{ u.alive ? '是' : '否' }}</td>
                <td>{{ u.hpEnd }}/{{ u.hpMax }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="single.summary.keyEvents.length" class="fs-qv-events">
            <div class="fs-qv-events-title">关键事件</div>
            <div v-for="(e, i) in single.summary.keyEvents.slice(0, 6)" :key="i" class="fs-qv-event">
              <span class="fs-qv-event-turn">R{{ e.turn }}</span>{{ e.text }}
            </div>
          </div>
        </template>
        <div v-else class="fs-qv-hint">未分胜负，无战报统计。</div>
      </template>

      <!-- 多场：聚合 -->
      <template v-if="agg">
        <div class="fs-qv-verdict">
          共 {{ agg.total }} 场 · 我方胜 {{ agg.allyWins }} / 敌方胜 {{ agg.enemyWins }} / 平局 {{ agg.draws }}
          · 平均 {{ agg.avgRounds }} 回合 · 暴击率 {{ agg.critRate }}%
        </div>
        <div v-for="(f, i) in agg.failures" :key="i" class="fs-qv-error">失败 {{ f.count }} 场：{{ f.reason }}</div>
      </template>
    </div>

    <template #footer>
      <Button variant="ghost" @click="emit('close')">关闭</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import type { ActorData } from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import { ParticipantSide, ParticipantSideName } from '@/domain/battle/type/types'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import {
  aggregateQuickBattles,
  runQuickBattle,
  type QuickBattleAggregate,
  type QuickBattleResult,
} from '@/application/service/QuickBattleSim'

const props = defineProps<{
  open: boolean
  /** 当前实体所在表（enemies / actors） */
  table: string
  /** 当前实体行（详情面板展示的已保存行） */
  entity: Record<string, unknown>
}>()

const emit = defineEmits<{ close: [] }>()

const COUNT_OPTIONS = [1, 10, 30] as const

type Row = Record<string, unknown>

const lineupAllyText = ref('')
const lineupEnemyText = ref('')
const lineupError = ref('')
/** 坏行剔除不静默：列出被跳过的行（表:id），防止模拟建立在缩水编成上而无人察觉 */
const skippedRows = ref<string[]>([])
const allyRows = ref<ActorData[]>([])
const enemyRows = ref<Enemy[]>([])
const seed = ref('')
const battleCount = ref<number>(1)
const running = ref(false)
const progress = ref('')
const single = ref<QuickBattleResult | null>(null)
const agg = ref<QuickBattleAggregate | null>(null)

// ════ 自选编成（lineups 表）：'' = 默认固定规则，选中行覆盖同侧编成 ════
type LineupRow = { id: string; name?: string; roles?: Array<{ roleId?: string }> }
const allyLineupId = ref<string | null>('')
const enemyLineupId = ref<string | null>('')
const lineupRows = ref<LineupRow[]>([])
const lineupOptions = computed<TSelectOption[]>(() => [
  { value: '', label: '默认规则' },
  ...lineupRows.value.map((l) => ({ value: l.id, label: l.name || l.id })),
])

function isLineupRow(l: Row): l is LineupRow {
  return !!l && typeof l.id === 'string' && Array.isArray(l.roles)
}

const canRun = computed(() => allyRows.value.length > 0 && enemyRows.value.length > 0)
/** 编成重建中：禁用开始按钮，防止用旧编成跑模拟 */
const lineupLoading = ref(false)

const verdictText = computed(() => {
  if (!single.value) return ''
  const side = single.value.winner
  const label = side ? ParticipantSideName[side] : '未分胜负'
  return `${label} · 共 ${single.value.rounds} 回合`
})

function sideLabel(side: string): string {
  return side === ParticipantSide.ALLY ? ParticipantSideName.ally : side === ParticipantSide.ENEMY ? ParticipantSideName.enemy : side
}

function onModelValue(v: boolean): void {
  if (!v) emit('close')
}

/** 行 → 参战数据：最小形状校验（id/name/非空 stats），坏行不进引擎（空 stats 会构造出 0 血参与者） */
function asActor(r: Row): ActorData | null {
  return r && typeof r.id === 'string' && typeof r.name === 'string'
    && typeof r.stats === 'object' && r.stats !== null
    && Object.keys(r.stats).length > 0 ? (r as unknown as ActorData) : null
}
function asEnemy(r: Row): Enemy | null {
  return asActor(r)
}

/** 划分有效行 / 坏行，坏行记录「表:id」供显式提示 */
function partitionValid<T>(table: string, rows: Row[], map: (r: Row) => T | null): { valid: T[]; skipped: string[] } {
  const valid: T[] = []
  const skipped: string[] = []
  rows.forEach((r, i) => {
    const v = map(r)
    if (v) valid.push(v)
    else skipped.push(`${table}:${String(r?.id ?? `#索引${i}`)}`)
  })
  return { valid, skipped }
}

/** lineups 单侧编成解析：我方仅收 actors 命中、敌方仅收 enemies 命中；未命中 roleId 计入缺失（不静默缩编） */
function collectLineupSide(
  lineupId: string,
  side: 'ally' | 'enemy',
  actors: ActorData[],
  enemies: Enemy[],
): { allyUnits: ActorData[]; enemyUnits: Enemy[]; missing: string[]; lineupName: string } {
  const out = { allyUnits: [] as ActorData[], enemyUnits: [] as Enemy[], missing: [] as string[], lineupName: lineupId }
  const lineup = lineupRows.value.find((l) => l.id === lineupId)
  if (!lineup) return out
  out.lineupName = lineup.name || lineup.id
  const pool = side === 'ally' ? actors : enemies
  const poolById = new Map(pool.map((r) => [r.id, r]))
  for (const role of lineup.roles ?? []) {
    const roleId = String(role?.roleId ?? '')
    const hit = roleId ? poolById.get(roleId) : undefined
    if (!hit) {
      out.missing.push(roleId || '(空 roleId)')
      continue
    }
    if (side === 'ally') out.allyUnits.push(hit as ActorData)
    else out.enemyUnits.push(hit as Enemy)
  }
  return out
}

async function loadRows(table: string): Promise<Row[]> {
  const api = container.resolve<GameDataApi>('GameDataApi')
  return api.listByTable<Row>(table, { limit: 1000 })
}

/** 构造编成：默认规则 = 验证敌人 → actors 前 4 vs 该敌人；验证角色 → 该角色 + 其余前 3 vs enemies 前 4。选择 lineups 编成时覆盖同侧 */
async function buildLineup(): Promise<void> {
  lineupLoading.value = true
  lineupError.value = ''
  try {
    const [actorRows, enemyRowsAll, lineupAll] = await Promise.all([
      loadRows('actors'), loadRows('enemies'), loadRows('lineups'),
    ])
    const allyPart = partitionValid('actors', actorRows, asActor)
    const enemyPart = partitionValid('enemies', enemyRowsAll, asEnemy)
    skippedRows.value = [...allyPart.skipped, ...enemyPart.skipped]
    const actors = allyPart.valid
    const enemies = enemyPart.valid
    lineupRows.value = lineupAll.filter(isLineupRow)
    if (props.table === 'enemies') {
      const cur = asEnemy(props.entity)
      allyRows.value = actors.slice(0, 4)
      enemyRows.value = cur ? [cur] : []
    } else {
      const cur = asActor(props.entity)
      const others = actors.filter((a) => a.id !== cur?.id).slice(0, 3)
      allyRows.value = cur ? [cur, ...others] : others
      enemyRows.value = enemies.slice(0, 4)
    }
    // 选中编成即以编成为准：命中 0 也覆盖为空并明示错误，绝不静默回退默认编成
    let lineupIssue = ''
    if (allyLineupId.value) {
      const r = collectLineupSide(allyLineupId.value, 'ally', actors, enemies)
      allyRows.value = r.allyUnits.slice(0, 4)
      skippedRows.value.push(...r.missing.map((id) => `编成「${r.lineupName}」:${id}`))
      if (!r.allyUnits.length) {
        lineupIssue = `我方编成「${r.lineupName}」的 roles 全部未命中 actors 表，请检查编成引用`
      }
    }
    if (enemyLineupId.value) {
      const r = collectLineupSide(enemyLineupId.value, 'enemy', actors, enemies)
      enemyRows.value = r.enemyUnits.slice(0, 4)
      skippedRows.value.push(...r.missing.map((id) => `编成「${r.lineupName}」:${id}`))
      if (!r.enemyUnits.length) {
        lineupIssue = lineupIssue || `敌方编成「${r.lineupName}」的 roles 全部未命中 enemies 表，请检查编成引用`
      }
    }
    lineupAllyText.value = allyRows.value.map((a) => a.name).join('、') || '（无可用角色）'
    lineupEnemyText.value = enemyRows.value.map((e) => e.name).join('、') || '（无可用敌人）'
    if (lineupIssue) {
      lineupError.value = lineupIssue
    } else if (!allyRows.value.length || !enemyRows.value.length) {
      lineupError.value = '编成不完整：actors / enemies 表需至少一条含 id/name/stats 的有效数据'
    }
  } catch (e) {
    lineupError.value = `编成加载失败: ${String(e)}`
  } finally {
    lineupLoading.value = false
  }
}

watch(() => props.open, (v) => {
  if (!v) return
  single.value = null
  agg.value = null
  skippedRows.value = []
  void buildLineup()
})

// 切换编成选择即时重建；旧模拟结果随旧编成作废，一并清除
watch([allyLineupId, enemyLineupId], () => {
  if (!props.open) return
  single.value = null
  agg.value = null
  void buildLineup()
})

/** 跑 1 场（战报）或 N 场（聚合）；填了种子强制单场（同种子多场结果无差异） */
async function run(): Promise<void> {
  running.value = true
  single.value = null
  agg.value = null
  try {
    const n = seed.value.trim() ? 1 : battleCount.value
    const results: QuickBattleResult[] = []
    for (let i = 0; i < n; i++) {
      progress.value = n > 1 ? `模拟中 ${i + 1}/${n}` : '模拟中…'
      results.push(await runQuickBattle({
        allyActors: allyRows.value,
        enemyEnemies: enemyRows.value,
        seed: seed.value.trim() || undefined,
      }))
    }
    if (n === 1) single.value = results[0]
    else agg.value = aggregateQuickBattles(results)
  } finally {
    running.value = false
    progress.value = ''
  }
}

/** 单位明细行：我方在前，同阵营按输出降序 */
const unitRows = computed(() => {
  const units = single.value?.summary?.units
  if (!units) return []
  return Object.values(units).sort((a, b) => {
    if (a.side !== b.side) return a.side === ParticipantSide.ALLY ? -1 : 1
    return b.dealt - a.dealt
  })
})
</script>

<style scoped lang="scss">
.fs-qv {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.fs-qv-lineup {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}

.fs-qv-lineup-label {
  color: var(--color-text-tertiary);
}

.fs-qv-vs {
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
}

.fs-qv-error {
  color: var(--color-danger);
}

.fs-qv-warn {
  color: var(--color-warning);
}

.fs-qv-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

.fs-qv-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.fs-qv-field-label {
  color: var(--color-text-tertiary);
}

.fs-qv-input {
  min-width: 240px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.fs-qv-count {
  display: flex;
  gap: var(--space-1);
}

.fs-qv-hint {
  color: var(--color-text-tertiary);
}

.fs-qv-verdict {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}

.fs-qv-verdict--ally {
  color: var(--color-success);
}

.fs-qv-verdict--enemy {
  color: var(--color-danger);
}

.fs-qv-events {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.fs-qv-events-title {
  color: var(--color-text-tertiary);
}

.fs-qv-event {
  color: var(--color-text-secondary);
}

.fs-qv-event-turn {
  display: inline-block;
  min-width: 3em;
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
}
</style>
