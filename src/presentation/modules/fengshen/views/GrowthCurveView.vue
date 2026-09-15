<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      成长曲线
      <span class="fs-page-hint">玩家固定成长（base + 每级 growth）× 同等级敌人均值 · 等级 1→{{ maxLevel }}</span>
    </div>

    <div class="fs-toolbar">
      <span class="fs-chart-field-label">属性</span>
      <TacticalSelect v-model="attrCode" size="md" :options="attrOptions" />
      <span class="fs-chart-field-label">敌人品阶</span>
      <TacticalSelect v-model="roleFilter" size="md" :options="roleOptions" />
      <label class="fs-chart-check">
        <input v-model="freePoints" type="checkbox" />
        叠加自由点上限（每级 {{ playerConfig?.freePointsPerLevel ?? 0 }} 点全投入本属性）
      </label>
      <span class="fs-spacer"></span>
      <span class="fs-version">敌人样本 {{ filteredEnemies.length }} 只 · 覆盖 {{ enemyLevels.length }} 个等级</span>
    </div>

    <div v-if="playerConfig" class="fs-block">
      <LineChart :labels="labels" :series="allSeries" :x-step="10" :height="300"
        :value-formatter="(v) => String(Math.round(v))" :aria-label="`${attrLabel} 成长曲线`" />
      <div class="fs-toolbar">
        <Button size="small" title="把当前三条序列存为快照（localStorage 持久，上限 5 份），调参前后叠加对比"
          @click="saveSnapshot">存为快照</Button>
        <span v-for="s in snapshots" :key="s.id" class="fs-snap-chip" :title="`属性：${ATTR_LABELS[s.attrCode] ?? s.attrCode}`">
          {{ s.name }}
          <button type="button" class="fs-snap-del" aria-label="删除快照" @click="removeSnapshot(s.id)">×</button>
        </span>
      </div>
      <div class="fs-form-hint">
        {{ attrLabel }}：玩家 1 级 <b class="fs-cell-num">{{ fmt(playerSeries[0]) }}</b> →
        {{ maxLevel }} 级 <b class="fs-cell-num">{{ fmt(playerSeries[playerSeries.length - 1]) }}</b> ·
        {{ maxLevel }} 级自由点上限 <b class="fs-cell-num">{{ fmt(freeSeries[freeSeries.length - 1]) }}</b> ·
        敌人均值曲线仅绘制有敌人配置的等级（断点处不连线）；悬停查看各级数值，点击图例隐藏/显示序列。
      </div>
    </div>
    <div v-else class="fs-empty">玩家配置（params 域 player_config）缺失，无法绘制玩家曲线</div>

    <div v-if="playerConfig" class="fs-block">
      <div class="fs-toolbar">
        <span class="fs-chart-field-label">数值表步进</span>
        <TacticalSelect v-model="tableStep" size="md" :options="stepOptions" />
        <span class="fs-form-hint">差值为「玩家 − 敌人均值」：负值=同等级打不过均值敌人（断档），过大=超模</span>
        <span class="fs-spacer"></span>
        <Button size="small" :disabled="!tableRows.length" title="导出数值表为 CSV"
          @click="exportCsv">导出 CSV</Button>
      </div>
      <table class="fs-table">
        <thead>
          <tr>
            <th>等级</th>
            <th>玩家 · {{ attrLabel }}</th>
            <th>玩家+自由点上限</th>
            <th>同等级敌人均值</th>
            <th>差值（玩家−敌人）</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableRows" :key="row.level">
            <td class="fs-cell-num">{{ row.level }}</td>
            <td class="fs-cell-num">{{ fmt(row.player) }}</td>
            <td class="fs-cell-num">{{ fmt(row.free) }}</td>
            <td class="fs-cell-num">{{ fmt(row.enemy) }}</td>
            <td class="fs-cell-num" :class="row.diffClass">{{ fmt(row.diff) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { computePlayerBase, PLAYER_BASE_ATTRS, PLAYER_BASE_ATTR_LABELS } from '@/domain/fengshen/player-config'
import { enemyMeanStatsByLevel, ENEMY_STAT_KEY_BY_PLAYER_ATTR } from '@/domain/fengshen/data-insight'
import type { PlayerBaseAttrCode } from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import type { PlayerGrowthConfig } from '@/domain/fengshen/types'
import { ENEMY_ROLE_LABELS } from '@/domain/fengshen/role-grades'
import { downloadCsv } from '@/shared/utils/csv'
import type { TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import Button from '@/presentation/components/Button.vue'
import LineChart, { type ChartSeries } from '@/presentation/modules/fengshen/components/LineChart.vue'

const api = container.resolve<GameDataApi>('GameDataApi')

const playerConfig = ref<PlayerGrowthConfig | null>(null)
const enemies = ref<Enemy[]>([])
const attrCode = ref<PlayerBaseAttrCode>('attack')
const roleFilter = ref('')
const freePoints = ref(false)

/** 属性中文名（单一来源 player-config） */
const ATTR_LABELS = PLAYER_BASE_ATTR_LABELS

/** 品阶码 → 中文名（单一来源 role-grades） */
const ROLE_LABELS: Record<string, string> = ENEMY_ROLE_LABELS

const attrOptions: TSelectOption[] = PLAYER_BASE_ATTRS.map((code) => ({ value: code, label: ATTR_LABELS[code] }))
const attrLabel = computed(() => ATTR_LABELS[attrCode.value])

/** 品阶下拉：从实际数据提取（未列出的 role 原值显示） */
const roleOptions = computed<TSelectOption[]>(() => {
  const roles = [...new Set(enemies.value.map((e) => String(e.role ?? '')).filter(Boolean))].sort()
  return [
    { value: '', label: '全部品阶' },
    ...roles.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r })),
  ]
})

/** 品阶筛选后的敌人均值样本 */
const filteredEnemies = computed(() =>
  roleFilter.value ? enemies.value.filter((e) => String(e.role ?? '') === roleFilter.value) : enemies.value,
)

const maxLevel = computed(() => playerConfig.value?.maxLevel ?? 50)
const labels = computed(() => Array.from({ length: maxLevel.value }, (_, i) => String(i + 1)))

/** 敌人覆盖的等级（供样本统计与断点判定） */
const enemyLevels = computed(() => enemyMeans.value.map((e) => e.level))
const enemyMeans = computed(() => enemyMeanStatsByLevel(filteredEnemies.value))

/** 玩家固定成长曲线：base + (level-1) × growth（复用 PlayerConfigView 同一纯函数） */
const playerSeries = computed<Array<number | null>>(() => {
  const cfg = playerConfig.value
  if (!cfg) return labels.value.map(() => null)
  return labels.value.map((_, i) => computePlayerBase(cfg, i + 1)[attrCode.value])
})

/** 自由点上限曲线：每级自由点全部投入当前查看的属性（策划口径的理论上限参考） */
const freeSeries = computed<Array<number | null>>(() => {
  const cfg = playerConfig.value
  if (!cfg) return labels.value.map(() => null)
  const conv = cfg.conversion[attrCode.value] ?? 1
  const perLevel = cfg.freePointsPerLevel ?? 0
  return labels.value.map((_, i) => computePlayerBase(cfg, i + 1)[attrCode.value] + i * perLevel * conv)
})

/** 敌人均值曲线：敌人 stats 键与玩家六维键名不同（hit/hitValue），经映射表对齐 */
const enemySeries = computed<Array<number | null>>(() => {
  const key = ENEMY_STAT_KEY_BY_PLAYER_ATTR[attrCode.value]
  const byLevel = new Map(enemyMeans.value.map((e) => [e.level, e.stats[key]]))
  return labels.value.map((_, i) => byLevel.get(i + 1) ?? null)
})

const series = computed<ChartSeries[]>(() => {
  const out: ChartSeries[] = [
    // NOTE: 主题无 --color-primary，折线用 --color-info（玩家）/ --color-warning（自由点）/ --color-danger（敌人）
    { name: `玩家 · ${attrLabel.value}`, color: 'var(--color-info)', points: playerSeries.value },
  ]
  if (freePoints.value) {
    out.push({
      name: `玩家+自由点上限 · ${attrLabel.value}`,
      color: 'var(--color-warning)',
      points: freeSeries.value,
      dashed: true,
    })
  }
  out.push({
    name: roleFilter.value ? `敌人均值 · ${ROLE_LABELS[roleFilter.value] ?? roleFilter.value}` : '同等级敌人均值',
    color: 'var(--color-danger)',
    points: enemySeries.value,
  })
  return out
})

// ════ 曲线快照：存档当前序列供调参前后叠加对比（localStorage 持久，上限 5 份） ════
interface CurveSnapshot {
  id: string
  name: string
  /** 快照对应属性：与当前属性不同不叠加（数值轴不同，叠加没有对比意义） */
  attrCode: PlayerBaseAttrCode
  series: Array<{ name: string; points: Array<number | null>; dashed: boolean }>
}
const SNAP_KEY = 'fs_curve_snapshots'

function loadSnapshots(): CurveSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAP_KEY)
    const list = raw ? (JSON.parse(raw) as CurveSnapshot[]) : []
    return Array.isArray(list) ? list.slice(0, 5) : []
  } catch {
    return []
  }
}

const snapshots = ref<CurveSnapshot[]>(loadSnapshots())

function persistSnapshots(): void {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snapshots.value.slice(0, 5)))
  } catch { /* 存储不可用时快照退化为仅本页内存态 */ }
}

function saveSnapshot(): void {
  const snap: CurveSnapshot = {
    id: `cs_${Date.now()}`,
    name: `${attrLabel.value} · ${roleFilter.value ? (ROLE_LABELS[roleFilter.value] ?? roleFilter.value) : '全部品阶'} · ${new Date().toLocaleTimeString()}`,
    attrCode: attrCode.value,
    series: series.value.map((s) => ({ name: s.name, points: [...s.points], dashed: !!s.dashed })),
  }
  snapshots.value = [snap, ...snapshots.value].slice(0, 5)
  persistSnapshots()
}

function removeSnapshot(id: string): void {
  snapshots.value = snapshots.value.filter((s) => s.id !== id)
  persistSnapshots()
}

/** 叠加快照序列（虚线灰）；仅叠加与当前查看属性相同的快照 */
const allSeries = computed<ChartSeries[]>(() => [
  ...series.value,
  ...snapshots.value
    .filter((s) => s.attrCode === attrCode.value)
    .flatMap((s) =>
      s.series.map((ser) => ({
        name: `${s.name} · ${ser.name}`,
        color: 'var(--color-text-tertiary)',
        points: ser.points,
        dashed: true,
      })),
    ),
])

function fmt(v: number | null | undefined): string {
  return v == null ? '—' : String(Math.round(v))
}

// ════ 逐级数值表：差值列直接暴露断档/超模 ════
const stepOptions: TSelectOption[] = [
  { value: 1, label: '每 1 级' },
  { value: 5, label: '每 5 级' },
  { value: 10, label: '每 10 级' },
]
const tableStep = ref(5)

interface CurveTableRow {
  level: number
  player: number | null
  free: number | null
  enemy: number | null
  diff: number | null
  diffClass: string
}

const tableRows = computed<CurveTableRow[]>(() => {
  const rows: CurveTableRow[] = []
  for (let i = 0; i < labels.value.length; i += tableStep.value) {
    const player = playerSeries.value[i]
    const free = freeSeries.value[i]
    const enemy = enemySeries.value[i]
    const diff = player != null && enemy != null ? player - enemy : null
    // 差值分级：负值（打不过均值敌人）危险；低于玩家值 20% 提示偏弱
    const diffClass = diff == null ? '' : diff < 0 ? 'fs-diff-bad' : diff < player * 0.2 ? 'fs-diff-warn' : 'fs-diff-ok'
    rows.push({ level: i + 1, player, free, enemy, diff, diffClass })
  }
  return rows
})

/** 数值表导出 CSV（与屏幕表格同口径，供评审/存档对比） */
function exportCsv(): void {
  downloadCsv(
    `growth-curve-${attrCode.value}.csv`,
    ['等级', `玩家·${attrLabel.value}`, '玩家+自由点上限', '同等级敌人均值', '差值（玩家−敌人）'],
    tableRows.value.map((r) => [r.level, fmt(r.player), fmt(r.free), fmt(r.enemy), fmt(r.diff)]),
  )
}

onMounted(async () => {
  const [cfg, rows] = await Promise.all([
    api.getPlayerConfig(),
    api.listByTable<Enemy>('enemies', { limit: 1000 }),
  ])
  playerConfig.value = cfg
  enemies.value = rows
})
</script>

<style scoped lang="scss">
.fs-chart-field-label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}

.fs-chart-check {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  cursor: pointer;
}

/* 数值表差值分级：负值危险 / 偏弱警示 / 正常 */
.fs-diff-bad {
  color: var(--color-danger);
  font-weight: var(--font-weight-semibold);
}

.fs-diff-warn {
  color: var(--color-warning);
}

.fs-diff-ok {
  color: var(--color-success);
}

/* 曲线快照 chips */
.fs-snap-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.fs-snap-del {
  border: none;
  background: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  padding: 0 var(--space-1);

  &:hover {
    color: var(--color-danger);
  }
}
</style>
