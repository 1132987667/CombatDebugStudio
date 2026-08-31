<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      玩家配置
      <span class="fs-page-hint">玩家成长（SAP 六维模型）· 系统预算 · 装备数值公式（IndexedDB params 域，保存后引擎数据源重载）</span>
    </div>

    <!-- 三 Tab 切换 -->
    <div class="fs-exp-tabs" role="tablist" aria-label="玩家配置">
      <button v-for="t in TABS" :key="t.id" type="button" class="fs-exp-tab" :class="{ active: activeTab === t.id }"
        :role="'tab'" :aria-selected="activeTab === t.id" @click="activeTab = t.id">{{ t.label }}</button>
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
const equipSim = ref<ReturnType<typeof calcEquipBaseValue> | null>(null)

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
</style>
