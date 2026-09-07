<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      成长曲线
      <span class="fs-page-hint">玩家固定成长（base + 每级 growth，不含自由点分配）× 同等级敌人均值 · 等级 1→{{ maxLevel }}</span>
    </div>

    <div class="fs-toolbar">
      <span class="fs-chart-field-label">属性</span>
      <TacticalSelect v-model="attrCode" size="md" :options="attrOptions" />
      <span class="fs-spacer"></span>
      <span class="fs-version">敌人样本 {{ enemies.length }} 只 · 覆盖 {{ enemyLevels.length }} 个等级</span>
    </div>

    <div v-if="playerConfig" class="fs-block">
      <LineChart :labels="labels" :series="series" :x-step="10" :height="300"
        :aria-label="`${attrLabel} 成长曲线`" />
      <div class="fs-form-hint">
        {{ attrLabel }}：玩家 1 级 <b class="fs-cell-num">{{ fmt(playerSeries[0]) }}</b> →
        {{ maxLevel }} 级 <b class="fs-cell-num">{{ fmt(playerSeries[playerSeries.length - 1]) }}</b> ·
        敌人均值曲线仅绘制有敌人配置的等级（断点处不连线）。
      </div>
    </div>
    <div v-else class="fs-empty">玩家配置（params 域 player_config）缺失，无法绘制玩家曲线</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { computePlayerBase, PLAYER_BASE_ATTRS } from '@/domain/fengshen/player-config'
import { enemyMeanStatsByLevel, ENEMY_STAT_KEY_BY_PLAYER_ATTR } from '@/domain/fengshen/data-insight'
import type { PlayerBaseAttrCode } from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import type { PlayerGrowthConfig } from '@/domain/fengshen/types'
import type { TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import LineChart, { type ChartSeries } from '@/presentation/modules/fengshen/components/LineChart.vue'

const api = container.resolve<GameDataApi>('GameDataApi')

const playerConfig = ref<PlayerGrowthConfig | null>(null)
const enemies = ref<Enemy[]>([])
const attrCode = ref<PlayerBaseAttrCode>('attack')

const ATTR_LABELS: Record<PlayerBaseAttrCode, string> = {
  maxHealth: '气血',
  attack: '攻击',
  defense: '防御',
  hitValue: '命中',
  dodgeValue: '闪避',
  speed: '速度',
}

const attrOptions: TSelectOption[] = PLAYER_BASE_ATTRS.map((code) => ({ value: code, label: ATTR_LABELS[code] }))
const attrLabel = computed(() => ATTR_LABELS[attrCode.value])

const maxLevel = computed(() => playerConfig.value?.maxLevel ?? 50)
const labels = computed(() => Array.from({ length: maxLevel.value }, (_, i) => String(i + 1)))

/** 敌人覆盖的等级（含配置的等级集合，供样本统计与断点判定） */
const enemyLevels = computed(() => enemyMeans.value.map((e) => e.level))
const enemyMeans = computed(() => enemyMeanStatsByLevel(enemies.value))

/** 玩家曲线：base + (level-1) × growth（复用 PlayerConfigView 同一纯函数） */
const playerSeries = computed<Array<number | null>>(() => {
  const cfg = playerConfig.value
  if (!cfg) return labels.value.map(() => null)
  return labels.value.map((_, i) => computePlayerBase(cfg, i + 1)[attrCode.value])
})

/** 敌人均值曲线：敌人 stats 键与玩家六维键名不同（hit/hitValue），经映射表对齐 */
const enemySeries = computed<Array<number | null>>(() => {
  const key = ENEMY_STAT_KEY_BY_PLAYER_ATTR[attrCode.value]
  const byLevel = new Map(enemyMeans.value.map((e) => [e.level, e.stats[key]]))
  return labels.value.map((_, i) => byLevel.get(i + 1) ?? null)
})

const series = computed<ChartSeries[]>(() => [
  { name: `玩家 · ${attrLabel.value}`, color: 'var(--color-primary)', points: playerSeries.value },
  { name: '同等级敌人均值', color: 'var(--color-danger)', points: enemySeries.value },
])

function fmt(v: number | null | undefined): string {
  return v == null ? '—' : String(Math.round(v))
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
</style>
