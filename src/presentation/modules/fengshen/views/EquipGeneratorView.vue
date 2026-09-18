<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      装备批量生成器
      <span class="fs-page-hint">按装备公式 + 词条投放规则批量生成 · 固定种子可复现</span>
    </div>

    <!-- 生成参数 -->
    <div class="fs-exp-block">
      <div class="fs-block-title">生成参数</div>
      <div class="fs-exp-sim-row">
        <span class="fs-exp-field-label">部位</span>
        <select v-model="form.slot" class="fs-input fs-exp-num-sm" aria-label="装备部位">
          <option v-for="s in SLOT_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
        <span class="fs-exp-field-label">子类型</span>
        <select v-model="form.subType" class="fs-input fs-exp-num-sm" aria-label="子类型">
          <option v-for="st in subTypeOptions" :key="st.id" :value="st.id">{{ st.name }}</option>
        </select>
        <span class="fs-exp-field-label">品阶</span>
        <select v-model="form.tier" class="fs-input fs-exp-num" aria-label="品阶">
          <option v-for="t in TIER_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <span class="fs-exp-field-label">等级</span>
        <input v-model.number="form.level" type="number" class="fs-input fs-exp-num-sm" min="1" max="50" />
      </div>
      <div class="fs-exp-sim-row">
        <span class="fs-exp-field-label">品质</span>
        <select v-model.number="form.quality" class="fs-input fs-exp-num" aria-label="品质">
          <option v-for="q in 5" :key="q" :value="q">{{ QUALITY_NAMES[q] }}（词条 {{ q }} 条）</option>
        </select>
        <span class="fs-exp-field-label">品质系数</span>
        <input :value="qualityFactorOf(form.quality)" type="number" step="0.001" class="fs-input fs-exp-num"
          title="核心属性倍率（品质区间中值，可改）" @input="form.qualityFactor = Number(($event.target as HTMLInputElement).value) || 1" />
        <span class="fs-exp-field-label">数量</span>
        <input v-model.number="form.count" type="number" class="fs-input fs-exp-num-sm" min="1" max="500" />
        <span class="fs-exp-field-label">种子</span>
        <input v-model.number="form.seed" type="number" class="fs-input fs-exp-num-sm" placeholder="留空随机"
          title="固定种子可精确复现同一次生成" />
        <Button variant="primary" size="small" :disabled="!depsReady" @click="generate">生成</Button>
        <Button size="small" :disabled="!report" title="将生成结果导入 equipment 表（id 自动重排）"
          @click="importAll">一键导入 {{ report ? `（${report.items.length} 件）` : '' }}</Button>
        <Button size="small" :disabled="!report" title="导出 现有装备+生成结果 合并的 equipment.json，可直接替换 configs/equipment/equipment.json（不经 IndexedDB，导入失败时的替代路径）"
          @click="exportGeneratedJson">导出 equipment.json（含新增）</Button>
      </div>
      <div v-if="!depsReady" class="fs-form-error">配置加载中或缺失（需要 affix_rule / equip_formula / player_config）</div>
    </div>

    <!-- 全量重生成固定属性（§21 部位固定属性；只写固定标称值，随机词条仍运行时 roll） -->
    <div class="fs-exp-block">
      <div class="fs-block-title">
        全量重生成固定属性
        <span class="fs-page-hint">按每件装备自身的 部位/子类型/品阶/等级 依 §21 装备公式单值口径（品阶权重取区间上限，不含浮动与品质系数）重算核心属性；主要/附加词条保持运行时 roll</span>
      </div>
      <div class="fs-exp-sim-row">
        <Button variant="primary" size="small" :disabled="!depsReady" @click="regenAll">重生成全部固定属性</Button>
        <template v-if="regenReport">
          <Button size="small" title="同 id 覆盖写入运行时 equipment 表，沙盒内立即生效"
            @click="writeBackRegen">写入 equipment 表（{{ regenReport.items.length }} 件）</Button>
          <Button size="small" title="导出后替换 configs/equipment/equipment.json，封神榜与斗战西游（演劫台）共用同一份源数据"
            @click="exportRegenJson">导出 equipment.json</Button>
        </template>
      </div>
      <template v-if="regenReport">
        <div class="fs-stat-cards">
          <div class="fs-stat-card"><div class="fs-stat-num">{{ regenReport.items.length }}</div><div class="fs-stat-label">重生成件数</div></div>
          <div class="fs-stat-card"><div class="fs-stat-num">{{ regenOkCount }}</div><div class="fs-stat-label">成功写入固定属性</div></div>
          <div class="fs-stat-card"><div class="fs-stat-num">{{ regenReport.sapTotal }}</div><div class="fs-stat-label">标称 SAP 总量</div></div>
          <div class="fs-stat-card" :class="regenReport.warnings.length ? 'fs-stat-warn' : 'fs-stat-ok'">
            <div class="fs-stat-num">{{ regenReport.warnings.length }}</div><div class="fs-stat-label">配置缺口</div>
          </div>
        </div>
        <div class="fs-table-wrap">
          <table class="fs-table">
            <thead>
              <tr><th>ID</th><th>名称</th><th>部位</th><th>品阶</th><th>等级</th><th>固定属性（核心）</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in regenPreview" :key="row.id">
                <td class="fs-cell-id">{{ row.id }}</td>
                <td>{{ row.name }}</td>
                <td>{{ row.slot }}</td>
                <td>{{ row.tier }}</td>
                <td class="fs-cell-num">{{ row.itemLevel }}</td>
                <td>{{ row.core }}</td>
              </tr>
              <tr v-if="!regenPreview.length"><td colspan="6" class="fs-empty">equipment 表为空</td></tr>
            </tbody>
          </table>
        </div>
        <div v-if="regenReport.warnings.length" class="fs-exp-block">
          <div class="fs-block-title">配置缺口（跳过并保留原值，不补默认值）</div>
          <ul class="fs-warn-list">
            <li v-for="(w, i) in regenReport.warnings" :key="i">{{ w }}</li>
          </ul>
        </div>
      </template>
    </div>

    <!-- 统计结果 -->
    <template v-if="report">
      <div class="fs-stat-cards">
        <div class="fs-stat-card"><div class="fs-stat-num">{{ report.items.length }}</div><div class="fs-stat-label">生成件数</div></div>
        <div class="fs-stat-card"><div class="fs-stat-num">{{ report.seed }}</div><div class="fs-stat-label">实际种子</div></div>
        <div class="fs-stat-card">
          <div class="fs-stat-num">{{ sapSummary.mean }}</div><div class="fs-stat-label">单件 SAP 均值</div>
        </div>
        <div class="fs-stat-card" :class="report.warnings.length ? 'fs-stat-warn' : 'fs-stat-ok'">
          <div class="fs-stat-num">{{ report.warnings.length }}</div><div class="fs-stat-label">配置缺口</div>
        </div>
      </div>

      <div class="fs-exp-block">
        <div class="fs-block-title">数值分布统计（属性值 min / p50 / mean / p95 / max）</div>
        <div class="fs-table-wrap">
          <table class="fs-table">
            <thead>
              <tr><th>属性</th><th>来源</th><th>最小</th><th>P50</th><th>均值</th><th>P95</th><th>最大</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in statRows" :key="i">
                <td>{{ row.label }}</td>
                <td><span class="fs-kind" :class="row.isCore ? 'fs-kind-core' : ''">{{ row.isCore ? '核心' : '词条' }}</span></td>
                <td class="fs-cell-num">{{ row.min }}</td>
                <td class="fs-cell-num">{{ row.p50 }}</td>
                <td class="fs-cell-num">{{ row.mean }}</td>
                <td class="fs-cell-num">{{ row.p95 }}</td>
                <td class="fs-cell-num">{{ row.max }}</td>
              </tr>
              <tr v-if="!statRows.length"><td colspan="7" class="fs-empty">无属性产出（检查子类型配置）</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="report.warnings.length" class="fs-exp-block">
        <div class="fs-block-title">配置缺口（roll 时显式跳过，不补默认值）</div>
        <ul class="fs-warn-list">
          <li v-for="(w, i) in report.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <div class="fs-exp-block">
        <div class="fs-block-title">预览（前 {{ previewItems.length }} 件，导入后 id 由存储层重排）</div>
        <div class="fs-table-wrap">
          <table class="fs-table">
            <thead>
              <tr><th>临时 ID</th><th>名称</th><th>核心属性</th><th>词条数</th><th>SAP</th></tr>
            </thead>
            <tbody>
              <tr v-for="it in previewItems" :key="it.id">
                <td class="fs-cell-id">{{ it.id }}</td>
                <td>{{ it.name }}</td>
                <td>{{ coreLabel(it.id) }}</td>
                <td class="fs-cell-num">{{ affixCount(it.id) }}</td>
                <td class="fs-cell-num">{{ sapOf(it.id) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>

  <!-- 覆盖写入 equipment 表：二次确认（同 id 覆盖不可逆） -->
  <ConfirmDialog v-model="confirmWriteBack" title="写入 equipment 表"
    :message="`将把重生成后的 ${regenReport?.items.length ?? 0} 件装备按 id 覆盖写入 equipment 表，原有词条与数值会被替换。确定继续吗？`"
    confirm-text="覆盖写入" danger @confirm="runWriteBack" />

  <!-- 一键导入 equipment 表：二次确认（批量新增） -->
  <ConfirmDialog v-model="confirmImportAll" title="一键导入装备"
    :message="`将把本次生成的 ${report?.items.length ?? 0} 件装备导入 equipment 表（id 自动重排）。确定继续吗？`"
    confirm-text="导入" @confirm="runImportAll" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import Button from '@/presentation/components/Button.vue'
import { QUALITY_NAMES, qualityFactorOf } from '@/presentation/modules/yanjie/xiyou/quality'
import { generateEquipments, regenEquipmentCoreStats, toExportableEquipment, type EquipmentRegenReport } from '@/domain/fengshen/equip-generator'
import type { AffixRuleConfig, EquipmentData, EquipFormulaConfig, GearTier, PlayerGrowthConfig } from '@/domain/fengshen/types'
import { nextEntityId } from '@/domain/fengshen/types'
import type { EquipmentSlot } from '@/shared/types/Item'

const api = container.resolve<GameDataApi>('GameDataApi')
const write = container.resolve<FengshenDataService>('FengshenDataService')
const store = useFengshenStore()
const confirmWriteBack = ref(false)
const confirmImportAll = ref(false)
const notif = useNotificationStore()

const form = reactive({
  slot: 'weapon' as EquipmentSlot,
  subType: 'sword',
  tier: 't5' as GearTier,
  level: 50,
  quality: 5,
  qualityFactor: 1.455,
  count: 100,
  seed: undefined as number | undefined,
})

const affixRule = ref<AffixRuleConfig | null>(null)
const formula = ref<EquipFormulaConfig | null>(null)
const playerConfig = ref<PlayerGrowthConfig | null>(null)
const attrNames = ref<Record<string, string>>({})
const report = ref<EquipGenerateReport | null>(null)

const depsReady = computed(() => Boolean(affixRule.value && formula.value && playerConfig.value))

const SLOT_OPTIONS: Array<{ value: EquipmentSlot; label: string }> = [
  { value: 'weapon', label: '武器' },
  { value: 'armor', label: '衣甲' },
  { value: 'helmet', label: '头盔' },
  { value: 'boots', label: '靴子' },
  { value: 'charm', label: '护符' },
  { value: 'glove', label: '护手' },
]

const TIER_OPTIONS: Array<{ value: GearTier; label: string }> = [
  { value: 't1', label: 't1 凡品' },
  { value: 't2', label: 't2 玄品' },
  { value: 't3', label: 't3 地品' },
  { value: 't4', label: 't4 天品' },
  { value: 't5', label: 't5 仙品' },
]

/** 子类型随部位联动（affix_rule.sub_type_groups；无子类型部位回退部位同名 id） */
const subTypeOptions = computed<Array<{ id: string; name: string }>>(() => {
  const groups = affixRule.value?.sub_type_groups ?? {}
  const group = groups[form.slot]
  if (group?.sub_types?.length) return group.sub_types
  return [{ id: form.slot, name: SLOT_OPTIONS.find((s) => s.value === form.slot)?.label ?? form.slot }]
})

onMounted(async () => {
  const [rule, f, pc, attrs] = await Promise.all([
    api.getAffixRule(),
    api.getEquipFormula(),
    api.getPlayerConfig(),
    api.listAttributes(),
  ])
  affixRule.value = rule
  formula.value = f
  playerConfig.value = pc
  for (const a of attrs) attrNames.value[a.id] = a.name
  if (subTypeOptions.value.length && !subTypeOptions.value.some((s) => s.id === form.subType)) {
    form.subType = subTypeOptions.value[0].id
  }
})

function attrLabel(code: string): string {
  return attrNames.value[code] ?? code
}

interface StatRow {
  label: string
  isCore: boolean
  min: number; max: number; mean: number; p50: number; p95: number
}

/** 统计行：核心属性在前（验收口径），词条属性按名称排后 */
const statRows = computed<StatRow[]>(() => {
  if (!report.value) return []
  const rows: StatRow[] = []
  for (const [attr, s] of Object.entries(report.value.coreStats)) {
    rows.push({ label: `${attrLabel(attr)}（${attr}）`, isCore: true, ...s })
  }
  for (const [attr, s] of Object.entries(report.value.stats)) {
    if (report.value.coreStats[attr]) continue
    rows.push({ label: `${attrLabel(attr)}（${attr}）`, isCore: false, ...s })
  }
  return rows.sort((a, b) => (a.isCore === b.isCore ? a.label.localeCompare(b.label) : a.isCore ? -1 : 1))
})

const sapSummary = computed(() => {
  const list = report.value?.sapPerItem ?? []
  if (!list.length) return { mean: 0 }
  const mean = list.reduce((s, v) => s + v, 0) / list.length
  return { mean: Math.round(mean * 10) / 10 }
})

const previewItems = computed(() => report.value?.items.slice(0, 20) ?? [])

function coreLabel(itemId: string): string {
  const idx = report.value?.items.findIndex((i) => i.id === itemId) ?? -1
  const roll = idx >= 0 ? report.value?.itemRolls[idx] : undefined
  return roll?.core ? `${attrLabel(roll.core.attribute)} +${roll.core.value}` : '—'
}
function affixCount(itemId: string): number {
  const idx = report.value?.items.findIndex((i) => i.id === itemId) ?? -1
  return idx >= 0 ? report.value?.itemRolls[idx]?.affixCount ?? 0 : 0
}
function sapOf(itemId: string): number {
  const idx = report.value?.items.findIndex((i) => i.id === itemId) ?? -1
  return report.value?.sapPerItem[idx] ?? 0
}

function generate(): void {
  if (!depsReady.value) return
  const result = generateEquipments(
    {
      slot: form.slot,
      subType: form.subType,
      tier: form.tier,
      level: form.level,
      quality: form.quality,
      qualityFactor: form.qualityFactor,
      count: form.count,
      seed: form.seed,
    },
    {
      affixRule: affixRule.value!,
      formula: formula.value!,
      conversion: playerConfig.value!.conversion,
    },
  )
  report.value = result
  // 种子回填（留空随机后可拿着实际种子复现）
  form.seed = result.seed
  notif.toast(`已生成 ${result.items.length} 件（种子 ${result.seed}）`, 'success', 3000)
}

/** 一键导入：gen_ 临时 id 按现有表重排（gen_001 起），批量写库前先二次确认 */
async function importAll(): Promise<void> {
  if (!report.value) return
  confirmImportAll.value = true
}

async function runImportAll(): Promise<void> {
  if (!report.value) return
  const existing = await api.listByTable<Record<string, unknown>>('equipment', { limit: 2000 })
  let next = existing.map((r) => String(r.id))
  let ok = 0
  for (const item of report.value.items) {
    const id = nextEntityId(next, 'gen_')
    next = [...next, id]
    const result = await write.save('equipment', { ...item, id, name: `${item.name}` })
    if (result.ok) ok++
    else {
      notif.toast(`导入失败：${item.name} — ${result.errors?.[0] ?? '未知错误'}`, 'error', 4000)
      break
    }
  }
  if (ok) {
    await store.refreshVersion()
    notif.toast(`已导入 ${ok} 件装备到 equipment 表`, 'success', 3500)
  }
}

/** 导出 现有装备 + 本次生成结果 合并的 equipment.json（不经 IndexedDB；id 与一键导入同规则重排）。
 *  替换 configs/equipment/equipment.json 并 bump SEED_FLAG 后重启，封神榜与斗战西游同步生效。 */
async function exportGeneratedJson(): Promise<void> {
  if (!report.value) return
  const existing = await api.listByTable<Record<string, unknown>>('equipment', { limit: 2000 })
  const existingRows = toExportableEquipment(existing as unknown as EquipmentData[])
  const ids = existingRows.map((r) => String(r.id))
  const additions = report.value.items.map((item) => {
    const id = nextEntityId(ids, 'gen_')
    ids.push(id)
    return { ...item, id }
  })
  const json = JSON.stringify(toExportableEquipment([...existingRows, ...additions] as EquipmentData[]), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'equipment.json'
  a.click()
  URL.revokeObjectURL(url)
  notif.toast(`已导出 ${existingRows.length} 件现有 + ${additions.length} 件新增的 equipment.json；替换 configs 后 bump SEED_FLAG 重启生效`, 'success', 4500)
}

// ════════════ 全量重生成固定属性（§21 部位固定属性，只写标称值） ════════════

const regenReport = ref<EquipmentRegenReport | null>(null)
const regenOkCount = computed(() => regenReport.value?.entries.filter((e) => e.core).length ?? 0)

/** 按运行时 equipment 表逐件重算固定核心属性（品阶权重取区间上限，随机词条不进静态数据） */
async function regenAll(): Promise<void> {
  if (!depsReady.value) return
  const rows = await api.listByTable<Record<string, unknown>>('equipment', { limit: 2000 })
  regenReport.value = regenEquipmentCoreStats(rows as unknown as EquipmentData[], {
    affixRule: affixRule.value!,
    formula: formula.value!,
    conversion: playerConfig.value!.conversion,
  })
  notif.toast(`已按 §21 公式重算 ${regenReport.value.items.length} 件装备的固定属性`, 'success', 3000)
}

/** 同 id 覆盖写入运行时 equipment 表（沙盒内立即生效，斗战西游实例化亦按 coreStat 取值）；
 *  覆盖写不可逆，先经 ConfirmDialog 二次确认 */
async function writeBackRegen(): Promise<void> {
  if (!regenReport.value) return
  confirmWriteBack.value = true
}

async function runWriteBack(): Promise<void> {
  if (!regenReport.value) return
  let ok = 0
  for (const item of regenReport.value.items) {
    const result = await write.save('equipment', item)
    if (result.ok) ok++
    else {
      notif.toast(`写入失败：${item.name} — ${result.errors?.[0] ?? '未知错误'}`, 'error', 4000)
      break
    }
  }
  if (ok) {
    await store.refreshVersion()
    notif.toast(`已写入 ${ok} 件（同 id 覆盖）到 equipment 表`, 'success', 3500)
  }
}

/** 导出重生成结果为 equipment.json——剥离存储元数据 + id 排序，可直接替换 configs/equipment/equipment.json */
function exportRegenJson(): void {
  if (!regenReport.value) return
  const json = JSON.stringify(toExportableEquipment(regenReport.value.items), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'equipment.json'
  a.click()
  URL.revokeObjectURL(url)
  notif.toast('已导出规范 equipment.json；替换 configs/equipment/equipment.json 并 bump SEED_FLAG 后重启，封神榜与斗战西游同步生效', 'success', 4500)
}

const regenPreview = computed(() =>
  (regenReport.value?.entries ?? []).slice(0, 20).map((en) => ({
    id: en.item.id,
    name: en.item.name,
    slot: SLOT_OPTIONS.find((s) => s.value === en.item.slot)?.label ?? en.item.slot,
    tier: TIER_OPTIONS.find((t) => t.value === en.item.tier)?.label ?? en.item.tier ?? '—',
    itemLevel: en.item.itemLevel ?? 1,
    core: en.core ? `${attrLabel(en.core.attribute)} +${en.core.value}` : '—（缺口，保留原值）',
  })),
)
</script>

<style scoped>
.fs-warn-list {
  margin: 4px 0 0;
  padding-left: 18px;
  color: var(--color-warning);
  font-size: var(--font-size-md);
  line-height: 1.8;
}
.fs-kind-core {
  color: var(--color-info);
  border-color: rgba(var(--rgb-info), var(--alpha-glow));
  background: rgba(var(--rgb-info), var(--alpha-wash));
}
</style>
