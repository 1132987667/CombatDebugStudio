<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      玩家配置
      <span class="fs-page-hint">玩家成长（SAP 六维模型）· 系统预算 · 装备数值公式（IndexedDB params 域，保存后引擎数据源重载）</span>
    </div>

    <!-- 统计卡片 -->
    <div class="fs-stat-cards">
      <div class="fs-stat-card">
        <div class="fs-stat-num">{{ totalSap.total }}</div>
        <div class="fs-stat-label">满级总SAP</div>
      </div>
      <div class="fs-stat-card">
        <div class="fs-stat-num">{{ cfg.maxLevel }}</div>
        <div class="fs-stat-label">最高等级</div>
      </div>
      <div class="fs-stat-card">
        <div class="fs-stat-num">{{ totalBudgetWeight }}</div>
        <div class="fs-stat-label">预算总权重</div>
      </div>
      <div class="fs-stat-card">
        <div class="fs-stat-num">{{ equipFormula.maxLevel }}</div>
        <div class="fs-stat-label">装备等级上限</div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="fs-toolbar">
      <div class="fs-exp-tabs" role="tablist" aria-label="玩家配置">
        <button v-for="t in TABS" :key="t.id" type="button" class="fs-exp-tab" :class="{ active: activeTab === t.id }"
          :role="'tab'" :aria-selected="activeTab === t.id" @click="activeTab = t.id">{{ t.label }}</button>
      </div>
      <span class="fs-spacer"></span>
      <Button variant="ghost" size="small" @click="exportConfig">导出配置</Button>
      <Button variant="ghost" size="small" @click="importConfig">导入配置</Button>
    </div>

    <!-- Tab1 成长配置 -->
    <section v-if="activeTab === 'growth'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-exp-block">
        <div class="fs-block-title">总量校验</div>
        <div class="fs-exp-sim-row">
          <span class="fs-exp-field-label">固定成长</span><span class="fs-cell-num">{{ totalSap.fixed }}</span>
          <span class="fs-exp-field-label">自由点</span><span class="fs-cell-num">{{ totalSap.free }}</span>
          <span class="fs-exp-field-label">丹药</span><span class="fs-cell-num">{{ totalSap.pill }}</span>
          <span class="fs-exp-field-label">满级总量</span><span class="fs-cell-num">{{ totalSap.total }}</span>
          <span v-if="totalSap.total !== 900" class="fs-form-error">预期 900（固定+自由+丹药）</span>
        </div>
      </div>

      <div class="fs-exp-block">
        <div class="fs-block-title">等级设置</div>
        <div class="fs-exp-sim-row">
          <span class="fs-exp-field-label">最高等级</span>
          <input v-model.number="cfg.maxLevel" type="number" class="fs-input fs-exp-num-sm" min="1" max="100" />
          <span class="fs-exp-field-label">经验公式</span>
          <input v-model="cfg.expFormula" type="text" class="fs-input fs-exp-formula" placeholder="round(50 × L^1.35 + 60 × L)" />
          <span class="fs-exp-field-label">丹药加成</span>
          <input v-model.number="cfg.pillBonusPoints" type="number" class="fs-input fs-exp-num-sm" min="0" />
          <Button size="small" variant="primary" @click="applyFormula">按公式展开经验表</Button>
        </div>
        <div v-if="expRows.length" class="fs-form-hint">经验表预览（仅展示）：{{ expRows[0].level }} 级 {{ expRows[0].expRequired }} → {{ expRows[expRows.length - 1].level }} 级 {{ expRows[expRows.length - 1].expRequired }}</div>
      </div>

      <div class="fs-exp-block">
        <div class="fs-block-title">初始属性 / 每级成长 / SAP 转化</div>
        <table class="fs-table">
          <thead>
            <tr><th>属性</th><th>初始值 (Lv.1)</th><th>每级成长</th><th>1 属性点转化</th></tr>
          </thead>
          <tbody>
            <tr v-for="attr in PLAYER_BASE_ATTRS" :key="attr">
              <td>{{ attrLabel(attr) }}</td>
              <td><input v-model.number="cfg.base[attr]" type="number" class="fs-input fs-exp-num" /></td>
              <td><input v-model.number="cfg.growth[attr]" type="number" class="fs-input fs-exp-num" /></td>
              <td><input v-model.number="cfg.conversion[attr]" type="number" class="fs-input fs-exp-num" /></td>
            </tr>
          </tbody>
        </table>
        <div class="fs-exp-sim-row" style="margin-top: var(--space-2);">
          <span class="fs-exp-field-label">每级自由属性点</span>
          <input v-model.number="cfg.freePointsPerLevel" type="number" class="fs-input fs-exp-num-sm" min="0" />
        </div>
      </div>

      <div v-if="cfgErrors.length" class="fs-form-errors">
        <div v-for="e in cfgErrors" :key="e" class="fs-form-error">{{ e }}</div>
      </div>

      <div class="fs-toolbar" style="margin-top: var(--space-3);">
        <Button variant="energy" @click="saveGrowth">保存成长配置</Button>
        <Button variant="danger" size="small" @click="resetGrowth">重置默认</Button>
      </div>
    </section>

    <!-- Tab2 属性预览 -->
    <section v-else-if="activeTab === 'preview'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-exp-block">
        <div class="fs-block-title">属性预览（配置推算，非引擎结算）</div>
        <div class="fs-exp-sim-row">
          <span class="fs-exp-field-label">当前等级</span>
          <input v-model.number="previewLevel" type="number" class="fs-input fs-exp-num-sm" min="1" :max="cfg.maxLevel" />
          <span class="fs-exp-field-label">可用自由点</span>
          <span class="fs-cell-num">{{ availablePoints }}</span>
        </div>
      </div>

      <div class="fs-exp-block">
        <div class="fs-block-title">自由点分配（预览）</div>
        <table class="fs-table">
          <thead><tr><th>属性</th><th>分配点数</th><th>预览值</th><th>SAP</th></tr></thead>
          <tbody>
            <tr v-for="attr in PLAYER_BASE_ATTRS" :key="attr">
              <td>{{ attrLabel(attr) }}</td>
              <td><input v-model.number="alloc[attr]" type="number" class="fs-input fs-exp-num-sm" min="0" :max="availablePoints" /></td>
              <td class="fs-cell-num">{{ preview.stats[attr] }}</td>
              <td class="fs-cell-num">{{ round1(preview.sapByAttr[attr]) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="fs-exp-sim-result" :class="{ warn: preview.usedPoints > availablePoints }">
          已分配 {{ preview.usedPoints }} / {{ availablePoints }} 点 · 预览总 SAP <span class="fs-cell-num">{{ round1(preview.totalSap) }}</span>
        </div>
      </div>
    </section>

    <!-- Tab3 系统预算 + 装备公式 -->
    <section v-else class="fs-exp-panel" role="tabpanel">
      <div class="fs-exp-block">
        <div class="fs-block-title">养成系统预算权重</div>
        <table class="fs-table">
          <thead><tr><th>系统</th><th>权重</th><th>占比</th><th>等级总属性点</th><th>备注</th></tr></thead>
          <tbody>
            <tr v-for="s in budget.systems" :key="s.system">
              <td>{{ s.label }}</td>
              <td class="fs-cell-num">{{ s.weight }}</td>
              <td class="fs-cell-num">{{ budgetPercent(s) }}</td>
              <td class="fs-cell-num">{{ s.totalSap ?? '—' }}</td>
              <td>{{ s.note ?? '' }}</td>
            </tr>
          </tbody>
        </table>
        <div class="fs-toolbar" style="margin-top: var(--space-2);">
          <Button variant="energy" @click="saveBudget">保存系统预算</Button>
        </div>
      </div>

      <div class="fs-exp-block">
        <div class="fs-block-title">装备数值公式（存档）</div>
        <div class="fs-exp-sim-result">
          单位基数 = {{ round2(equipBaseUnit(equipFormula)) }}（{{ equipFormula.baseSap }} ÷ {{ equipFormula.slotCount }} ÷ {{ equipFormula.weightPerSlot }} ÷ {{ equipFormula.maxLevel }}）
          · 核心权重 {{ equipFormula.coreWeight }} / 附加 {{ equipFormula.affixWeight }} · 浮动 {{ equipFormula.floatRange.min * 100 }}%~{{ equipFormula.floatRange.max * 100 }}%
        </div>
        <div class="fs-exp-sim-row" style="margin-top: var(--space-2);">
          <span class="fs-exp-field-label">验算</span>
          <input v-model.number="simLevel" type="number" class="fs-input fs-exp-num-sm" min="1" :max="equipFormula.maxLevel" />
          <select v-model="simTier" class="fs-input">
            <option v-for="(w, tier) in equipFormula.tierWeight" :key="tier" :value="tier">{{ tier }}（{{ w.min }}~{{ w.max }}）</option>
          </select>
          <span class="fs-exp-field-label">转化系数</span>
          <input v-model.number="simConvert" type="number" class="fs-input fs-exp-num-sm" min="0" step="0.1" />
          <Button size="small" variant="energy" @click="runEquipSim">计算</Button>
        </div>
        <div v-if="equipSim" class="fs-exp-sim-result">
          核心属性 {{ equipSim.core.min }}~{{ equipSim.core.max }}（基准 {{ equipSim.core.base }}）
          · 附加属性 {{ equipSim.affix.min }}~{{ equipSim.affix.max }}（基准 {{ equipSim.affix.base }}）
        </div>
        <div class="fs-toolbar" style="margin-top: var(--space-2);">
          <Button variant="energy" @click="saveFormula">保存装备公式</Button>
        </div>
      </div>
    </section>

    <!-- 导出弹窗 -->
    <Dialog v-model="showExportDialog" title="导出玩家配置" width="500px">
      <div class="fs-export-options">
        <div class="fs-option-cards">
          <div class="fs-option-card" :class="{ selected: exportType === 'growth' }" @click="exportType = 'growth'">
            <div class="fs-opt-name">成长配置</div>
            <div class="fs-opt-desc">玩家成长参数（等级/经验/属性/转化）</div>
          </div>
          <div class="fs-option-card" :class="{ selected: exportType === 'budget' }" @click="exportType = 'budget'">
            <div class="fs-opt-name">系统预算</div>
            <div class="fs-opt-desc">养成系统权重分配</div>
          </div>
          <div class="fs-option-card" :class="{ selected: exportType === 'formula' }" @click="exportType = 'formula'">
            <div class="fs-opt-name">装备公式</div>
            <div class="fs-opt-desc">装备数值计算公式</div>
          </div>
          <div class="fs-option-card" :class="{ selected: exportType === 'all' }" @click="exportType = 'all'">
            <div class="fs-opt-name">全部配置</div>
            <div class="fs-opt-desc">包含以上所有配置</div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="showExportDialog = false">取消</Button>
        <Button variant="primary" @click="doExport">导出 JSON</Button>
      </template>
    </Dialog>

    <!-- 导入弹窗 -->
    <Dialog v-model="showImportDialog" title="导入玩家配置" width="500px">
      <div class="fs-import-zone">
        <div class="fs-drop-zone" role="button" tabindex="0" aria-label="选择 JSON 文件"
          @click="fileInput?.click()" @dragover.prevent @drop.prevent="onDrop"
          @keydown.enter.prevent="fileInput?.click()" @keydown.space.prevent="fileInput?.click()">
          <div class="fs-dz-main">将 JSON 文件拖拽到此处，或点击选择文件</div>
          <div class="fs-form-hint">支持 .json 格式的玩家配置文件</div>
        </div>
        <input ref="fileInput" type="file" accept=".json" style="display: none" @change="onPick" />
      </div>
      <template #footer>
        <Button variant="ghost" @click="showImportDialog = false">取消</Button>
        <Button variant="primary" :disabled="!pendingImportData" @click="doImport">开始导入</Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { PlayerGrowthConfig, PlayerBaseAttrCode, SystemBudgetConfig, EquipFormulaConfig } from '@/domain/fengshen/types'
import {
  calcEquipBaseValue,
  calcTotalSap,
  computePlayerPreview,
  equipBaseUnit,
  fillExpFromFormula,
  fixedGrowthSap,
  PLAYER_BASE_ATTRS,
  tierWeightValue,
  validatePlayerConfig,
} from '@/domain/fengshen/player-config'
import Dialog from '@/presentation/components/Dialog.vue'

const TABS = [
  { id: 'growth', label: '成长配置' },
  { id: 'preview', label: '属性预览' },
  { id: 'budget', label: '系统预算/装备公式' },
] as const

const api = container.resolve<GameDataApi>('GameDataApi')
const write = container.resolve<FengshenDataService>('FengshenDataService')
const notification = useNotificationStore()

const activeTab = ref<(typeof TABS)[number]['id']>('growth')

/** 默认成长配置（对齐 PRD §19 / D1 决策） */
function defaultGrowth(): PlayerGrowthConfig {
  return {
    id: 'player_config',
    maxLevel: 50,
    expFormula: 'round(50 × L^1.35 + 60 × L)',
    base: { maxHealth: 60, attack: 15, defense: 10, hitValue: 10, dodgeValue: 10, speed: 10 },
    growth: { maxHealth: 24, attack: 8, defense: 4, hitValue: 3, dodgeValue: 3, speed: 2 },
    freePointsPerLevel: 4,
    conversion: { maxHealth: 12, attack: 2, defense: 2, hitValue: 2, dodgeValue: 2, speed: 2 },
    pillBonusPoints: 100,
    currentLevel: 1,
  }
}

function defaultBudget(): SystemBudgetConfig {
  return {
    id: 'system_budget',
    systems: [
      { system: 'level', label: '等级', totalSap: 900, weight: 120, note: '800（每级16属性点 × 50）+ 丹药100' },
      { system: 'equipment', label: '装备', weight: 240, note: '100% × 强化15(1.6) × 满级升星(1.25)' },
      { system: 'school', label: '流派树', weight: 60 },
      { system: 'pet', label: '宠物', weight: 60 },
      { system: 'mount', label: '坐骑', weight: 60 },
      { system: 'artifact', label: '法宝', weight: 60 },
      { system: 'relic', label: '神器', weight: 60 },
    ],
  }
}

function defaultFormula(): EquipFormulaConfig {
  return {
    id: 'equip_formula',
    baseSap: 900,
    slotCount: 6,
    weightPerSlot: 3,
    maxLevel: 50,
    coreWeight: 2,
    affixWeight: 1,
    floatRange: { min: 0.5, max: 1.1 },
    tierWeight: {
      fan: { min: 0.5, max: 0.6 },
      xuan: { min: 0.6, max: 0.7 },
      di: { min: 0.7, max: 0.8 },
      tian: { min: 0.8, max: 0.9 },
      xian: { min: 0.9, max: 1.0 },
    },
  }
}

const cfg = reactive<PlayerGrowthConfig>(defaultGrowth())
const budget = reactive<SystemBudgetConfig>(defaultBudget())
const equipFormula = reactive<EquipFormulaConfig>(defaultFormula())

const cfgErrors = ref<string[]>([])

// Tab2 预览
const previewLevel = ref(1)
const alloc = reactive<Record<PlayerBaseAttrCode, number>>({ maxHealth: 0, attack: 0, defense: 0, hitValue: 0, dodgeValue: 0, speed: 0 })
const availablePoints = computed(() => Math.max(0, (previewLevel.value - 1) * (cfg.freePointsPerLevel ?? 0)))
const preview = computed(() => computePlayerPreview(cfg, previewLevel.value, alloc))

// Tab1 总量
const totalSap = computed(() => calcTotalSap(cfg))
const expRows = ref<Array<{ level: number; expRequired: number }>>([])

// Tab3 装备验算
const simLevel = ref(10)
const simTier = ref('xian')
const simConvert = ref(2)
const equipSim = ref<{ core: ReturnType<typeof calcEquipBaseValue>; affix: ReturnType<typeof calcEquipBaseValue> } | null>(null)

const totalBudgetWeight = computed(() => budget.systems.reduce((s, e) => s + e.weight, 0))

const ATTR_LABELS: Record<PlayerBaseAttrCode, string> = {
  maxHealth: '气血',
  attack: '攻击',
  defense: '防御',
  hitValue: '命中',
  dodgeValue: '闪避',
  speed: '速度',
}

function attrLabel(attr: PlayerBaseAttrCode): string {
  return ATTR_LABELS[attr] ?? attr
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}
function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function budgetPercent(s: { weight: number }): string {
  const total = totalBudgetWeight.value || 1
  return ((s.weight / total) * 100).toFixed(2) + '%'
}

function resetInto<T extends object>(target: T, source: T): void {
  Object.keys(target).forEach((k) => delete (target as Record<string, unknown>)[k])
  Object.assign(target, structuredClone(source))
}

function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

// ════════════ 加载 / 保存 ════════════

async function load(): Promise<void> {
  try {
    const [pc, sb, ef] = await Promise.all([api.getPlayerConfig(), api.getSystemBudget(), api.getEquipFormula()])
    if (pc) resetInto(cfg, pc)
    if (sb) resetInto(budget, sb)
    if (ef) resetInto(equipFormula, ef)
  } catch {
    resetInto(cfg, defaultGrowth())
    resetInto(budget, defaultBudget())
    resetInto(equipFormula, defaultFormula())
  }
}

function applyFormula(): void {
  expRows.value = fillExpFromFormula(cfg.expFormula, cfg.maxLevel)
}

async function saveGrowth(): Promise<void> {
  const errors = validatePlayerConfig(cfg)
  cfgErrors.value = errors
  if (errors.length) {
    notification.notify('保存失败', errors.join('\n'), 'error')
    return
  }
  const result = await write.save('params', { id: 'player_config', name: '玩家成长配置', data: toPlain(cfg) })
  if (result.ok) notification.notify('已保存', `玩家成长配置已保存 · 数据版本 v${await api.getDataVersion()}`, 'success')
  else notification.notify('保存失败', result.errors?.join('\n') ?? '', 'error')
}

function resetGrowth(): void {
  resetInto(cfg, defaultGrowth())
}

async function saveBudget(): Promise<void> {
  const result = await write.save('params', { id: 'system_budget', name: '养成系统预算权重', data: toPlain(budget) })
  if (result.ok) notification.notify('已保存', `系统预算已保存 · 数据版本 v${await api.getDataVersion()}`, 'success')
  else notification.notify('保存失败', result.errors?.join('\n') ?? '', 'error')
}

async function saveFormula(): Promise<void> {
  const result = await write.save('params', { id: 'equip_formula', name: '装备数值公式', data: toPlain(equipFormula) })
  if (result.ok) notification.notify('已保存', `装备公式已保存 · 数据版本 v${await api.getDataVersion()}`, 'success')
  else notification.notify('保存失败', result.errors?.join('\n') ?? '', 'error')
}

function runEquipSim(): void {
  const tw = tierWeightValue(equipFormula, simTier.value)
  equipSim.value = {
    core: calcEquipBaseValue(equipFormula, simLevel.value, 'core', tw, simConvert.value),
    affix: calcEquipBaseValue(equipFormula, simLevel.value, 'affix', tw, simConvert.value),
  }
}

// ════════════ 导出 / 导入 ════════════

const showExportDialog = ref(false)
const showImportDialog = ref(false)
const exportType = ref<'growth' | 'budget' | 'formula' | 'all'>('all')
const pendingImportData = ref<unknown>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function exportConfig(): void {
  showExportDialog.value = true
}

function importConfig(): void {
  showImportDialog.value = true
}

function doExport(): void {
  let data: unknown
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
  
  switch (exportType.value) {
    case 'growth':
      data = { type: 'player_config', data: toPlain(cfg) }
      break
    case 'budget':
      data = { type: 'system_budget', data: toPlain(budget) }
      break
    case 'formula':
      data = { type: 'equip_formula', data: toPlain(equipFormula) }
      break
    case 'all':
      data = {
        type: 'player_config_all',
        data: {
          growth: toPlain(cfg),
          budget: toPlain(budget),
          formula: toPlain(equipFormula),
        },
      }
      break
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `player_config_${exportType.value}_${timestamp}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  
  showExportDialog.value = false
  notification.notify('导出成功', `玩家配置已导出为 ${exportType.value} 格式`, 'success')
}

function onDrop(e: DragEvent): void {
  const file = e.dataTransfer?.files[0]
  if (!file) return
  readFile(file)
}

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) readFile(file)
  input.value = ''
}

function readFile(file: File): void {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result as string)
      pendingImportData.value = json
      notification.notify('文件已加载', `准备导入: ${file.name}`, 'info')
    } catch {
      notification.notify('文件格式错误', '请选择有效的 JSON 文件', 'error')
    }
  }
  reader.readAsText(file)
}

function doImport(): void {
  if (!pendingImportData.value) return
  
  const data = pendingImportData.value as Record<string, unknown>
  
  try {
    if (data.type === 'player_config' && data.data) {
      resetInto(cfg, data.data as PlayerGrowthConfig)
      notification.notify('导入成功', '成长配置已导入', 'success')
    } else if (data.type === 'system_budget' && data.data) {
      resetInto(budget, data.data as SystemBudgetConfig)
      notification.notify('导入成功', '系统预算已导入', 'success')
    } else if (data.type === 'equip_formula' && data.data) {
      resetInto(equipFormula, data.data as EquipFormulaConfig)
      notification.notify('导入成功', '装备公式已导入', 'success')
    } else if (data.type === 'player_config_all' && data.data) {
      const allData = data.data as Record<string, unknown>
      if (allData.growth) resetInto(cfg, allData.growth as PlayerGrowthConfig)
      if (allData.budget) resetInto(budget, allData.budget as SystemBudgetConfig)
      if (allData.formula) resetInto(equipFormula, allData.formula as EquipFormulaConfig)
      notification.notify('导入成功', '全部配置已导入', 'success')
    } else {
      notification.notify('导入失败', '无法识别的配置格式', 'error')
      return
    }
    
    showImportDialog.value = false
    pendingImportData.value = null
  } catch {
    notification.notify('导入失败', '配置数据格式错误', 'error')
  }
}

void load()
</script>

<style scoped lang="scss">
.fs-exp-formula {
  width: 240px;
  font-family: var(--font-family-mono);
}

.warn {
  border-left-color: #ff4d4f;
}

.fs-stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.fs-stat-card {
  padding: var(--space-3);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  text-align: center;
}

.fs-stat-num {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-mono);
  color: var(--color-energy);
}

.fs-stat-label {
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
  margin-top: var(--space-1);
  letter-spacing: 1px;
}

.fs-export-options {
  margin-bottom: var(--space-4);
}

.fs-option-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.fs-option-card {
  padding: var(--space-3);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-border-tertiary);
  }
  
  &.selected {
    border-color: var(--color-energy);
    background: rgba(var(--rgb-energy), var(--alpha-tint));
  }
}

.fs-opt-name {
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-1);
}

.fs-opt-desc {
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}

.fs-import-zone {
  margin-bottom: var(--space-4);
}

.fs-drop-zone {
  border: 1.5px dashed var(--color-border-tertiary);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  text-align: center;
  color: var(--color-text-tertiary);
  background: var(--color-bg-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-energy);
    background: rgba(var(--rgb-energy), var(--alpha-tint));
  }
}

.fs-dz-main {
  color: var(--color-energy);
  font-size: var(--font-size-lg);
  margin-bottom: var(--space-2);
}
</style>
