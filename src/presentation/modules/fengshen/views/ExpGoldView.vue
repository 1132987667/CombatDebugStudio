<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      经验与金钱管理
      <span class="fs-page-hint">升级经验表 · 敌人奖励基准 · 等级差加成（IndexedDB params 域，保存后引擎数据源重载）</span>
    </div>

    <!-- 三 Tab 切换 -->
    <div class="fs-exp-tabs" role="tablist" aria-label="经验与金钱管理">
      <button v-for="t in TABS" :key="t.id" type="button" class="fs-exp-tab" :class="{ active: activeTab === t.id }"
        :role="'tab'" :aria-selected="activeTab === t.id" @click="activeTab = t.id">{{ t.label }}</button>
    </div>

    <!-- Tab1 升级经验表 -->
    <section v-if="activeTab === 'exp_table'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-toolbar">
        <span class="fs-exp-field-label">最大等级</span>
        <input v-model.number="expTable.maxLevel" type="number" class="fs-input fs-exp-num-sm" min="1" max="100" />
        <Button variant="primary" size="small" @click="applyExpFormula">按公式填充（1-10级×300，11-30级×600，31-50级×900）</Button>
        <span class="fs-spacer"></span>
        <Button variant="danger" size="small" @click="resetExpTable">重置</Button>
        <Button variant="energy" size="small" @click="saveExpTable">保存</Button>
      </div>

      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th>等级</th><th>升级所需经验</th><th>累计经验</th><th>约需击败同等级敌人</th><th>备注</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="(entry, i) in expTable.entries" :key="entry.level">
              <td class="fs-cell-num">{{ entry.level }}</td>
              <td>
                <input v-model.number="entry.expRequired" type="number" class="fs-input fs-exp-num" min="1" />
              </td>
              <td class="fs-cell-num">{{ cumulativeExp(i) }}</td>
              <td class="fs-cell-num">{{ enemiesToLevelUp(entry) ?? '—' }}</td>
              <td><input v-model="entry.note" type="text" class="fs-input" placeholder="备注（不参与计算）" /></td>
              <td class="fs-col-actions">
                <Button size="small" :disabled="expTable.entries.length <= 1" title="删除该等级"
                  @click="removeExpEntry(i)">删除</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="fs-form-hint">公式提示：{{ expTable.formulaHint }}</div>
      <div v-if="expErrors.length" class="fs-form-errors">
        <div v-for="e in expErrors" :key="e" class="fs-form-error">{{ e }}</div>
      </div>
    </section>

    <!-- Tab2 敌人经验金钱 -->
    <section v-else-if="activeTab === 'enemy_reward'" class="fs-exp-panel" role="tabpanel">
      <div class="fs-exp-block">
        <div class="fs-block-title">角色倍率（键对齐 enemies.json role）</div>
        <div class="fs-exp-mult-row">
          <label v-for="(v, key) in enemyReward.roleMultiplier" :key="key" class="fs-exp-mult-item">
            <span>{{ key }}</span>
            <input v-model.number="enemyReward.roleMultiplier[key]" type="number" step="0.1" min="0.01"
              class="fs-input fs-exp-num" />
          </label>
        </div>
      </div>

      <div class="fs-toolbar">
        <span class="fs-exp-field-label">插值方式</span>
        <select v-model="enemyReward.interpolation" class="fs-input">
          <option value="linear">线性插值</option>
          <option value="nearest">最近档位</option>
        </select>
        <Button variant="primary" size="small" @click="applyEnemyFormula">按公式填充（1-70 级）</Button>
        <span class="fs-spacer"></span>
        <Button variant="danger" size="small" @click="resetEnemyReward">重置</Button>
        <Button variant="energy" size="small" @click="saveEnemyReward">保存</Button>
      </div>

      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th>敌人等级</th><th>基础经验</th><th>金钱下限</th><th>金钱上限</th><th>备注</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="(entry, i) in enemyReward.entries" :key="entry.enemyLevel">
              <td>
                <input v-model.number="entry.enemyLevel" type="number" class="fs-input fs-exp-num" min="1" max="99" />
              </td>
              <td><input v-model.number="entry.baseExp" type="number" class="fs-input fs-exp-num" min="1" /></td>
              <td><input v-model.number="entry.goldMin" type="number" class="fs-input fs-exp-num" min="0" /></td>
              <td><input v-model.number="entry.goldMax" type="number" class="fs-input fs-exp-num" min="0" /></td>
              <td><input v-model="entry.note" type="text" class="fs-input" placeholder="备注" /></td>
              <td class="fs-col-actions">
                <Button size="small" title="删除该档位" @click="removeEnemyEntry(i)">删除</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="fs-exp-block">
        <div class="fs-block-title">快速验算</div>
        <div class="fs-exp-sim-row">
          <span class="fs-exp-field-label">敌人等级</span>
          <input v-model.number="simEnemyLevel" type="number" class="fs-input fs-exp-num-sm" min="1" max="99" />
          <span class="fs-exp-field-label">角色</span>
          <select v-model="simRole" class="fs-input">
            <option v-for="k in roleKeys" :key="k" :value="k">{{ k }}</option>
          </select>
          <Button size="small" variant="energy" @click="runEnemySim">计算</Button>
        </div>
        <div v-if="simResult" class="fs-exp-sim-result">
          基础经验 {{ simResult.baseExp }} · 基础金钱 {{ simResult.goldMin }}~{{ simResult.goldMax }}
          → 实际经验 <span class="fs-cell-num">{{ simResult.exp }}</span> · 实际金钱 <span class="fs-cell-num">{{ simResult.goldMinFinal }}~{{ simResult.goldMaxFinal }}</span>
        </div>
      </div>
    </section>

    <!-- Tab3 等级差加成规则 -->
    <section v-else class="fs-exp-panel" role="tabpanel">
      <div class="fs-toolbar">
        <Button variant="primary" size="small" @click="addRule">+ 新增规则</Button>
        <span class="fs-spacer"></span>
        <Button variant="danger" size="small" @click="resetLevelDiff">重置</Button>
        <Button variant="energy" size="small" @click="saveLevelDiff">保存</Button>
      </div>

      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th>#</th><th>名称</th><th>等级差条件</th><th>经验倍率</th><th>金钱倍率</th><th>描述</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="(rule, i) in levelDiff.rules" :key="rule.id">
              <td class="fs-cell-num">{{ i + 1 }}</td>
              <td><input v-model="rule.label" type="text" class="fs-input" /></td>
              <td><input :value="diffConditionText(rule)" type="text" class="fs-input fs-exp-cond"
                placeholder="0 / [3,5] / <= -5 / >= 6" @change="parseDiffCondition(rule, $event)" /></td>
              <td><input v-model.number="rule.expMultiplier" type="number" step="0.1" class="fs-input fs-exp-num" /></td>
              <td><input v-model.number="rule.goldMultiplier" type="number" step="0.1" class="fs-input fs-exp-num" /></td>
              <td><input v-model="rule.description" type="text" class="fs-input" placeholder="规则说明" /></td>
              <td class="fs-col-actions">
                <Button size="small" variant="danger" title="删除该规则" @click="removeRule(i)">删除</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="fs-exp-block fs-exp-rule-meta">
        <div class="fs-exp-sim-row">
          <span class="fs-exp-field-label">兜底倍率</span>
          <input v-model.number="levelDiff.fallbackMultiplier" type="number" step="0.1" class="fs-input fs-exp-num" />
          <span class="fs-exp-field-label">钳制范围</span>
          <input v-model.number="levelDiff.clampRange.min" type="number" step="0.1" class="fs-input fs-exp-num" />
          <span class="fs-exp-sep">~</span>
          <input v-model.number="levelDiff.clampRange.max" type="number" step="0.1" class="fs-input fs-exp-num" />
        </div>
      </div>

      <div class="fs-exp-block">
        <div class="fs-block-title">模拟验算</div>
        <div class="fs-exp-sim-row">
          <span class="fs-exp-field-label">玩家等级</span>
          <input v-model.number="simPlayerLevel" type="number" class="fs-input fs-exp-num-sm" min="1" max="99" />
          <span class="fs-exp-field-label">敌人等级</span>
          <input v-model.number="simDiffEnemyLevel" type="number" class="fs-input fs-exp-num-sm" min="1" max="99" />
          <Button size="small" variant="energy" @click="runLevelDiffSim">计算</Button>
        </div>
        <div v-if="diffSimResult" class="fs-exp-sim-result">
          等级差 {{ diffSimResult.diff }}（{{ diffSimResult.sign }}）→
          命中「{{ diffSimResult.ruleLabel }}」→
          经验 <span class="fs-cell-num">×{{ diffSimResult.expMult }}</span> · 金钱 <span class="fs-cell-num">×{{ diffSimResult.goldMult }}</span>
        </div>
      </div>

      <div v-if="diffErrors.length" class="fs-form-errors">
        <div v-for="e in diffErrors" :key="e" class="fs-form-error">{{ e }}</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'

import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { EnemyRewardTableConfig, ExpTableConfig, LevelDiffBonusConfig, LevelDiffCondition } from '@/domain/fengshen/types'
import {
  calcEnemyReward,
  calcLevelDiffMultiplier,
  interpolateEnemyReward,
  matchLevelDiffCondition,
  matchLevelDiffRule,
} from '@/domain/fengshen/exp-reward'

const TABS = [
  { id: 'exp_table', label: '升级经验表' },
  { id: 'enemy_reward', label: '敌人经验金钱' },
  { id: 'level_diff', label: '等级差加成规则' },
] as const

const api = container.resolve<GameDataApi>('GameDataApi')
const write = container.resolve<FengshenDataService>('FengshenDataService')
const notification = useNotificationStore()

const activeTab = ref<(typeof TABS)[number]['id']>('exp_table')

/** 升级经验表草稿 */
const expTable = reactive<ExpTableConfig>({
  id: 'exp_table',
  maxLevel: 50,
  entries: [],
  formulaHint: '',
})
const expErrors = ref<string[]>([])

/** 敌人奖励基准草稿 */
const enemyReward = reactive<EnemyRewardTableConfig>({
  id: 'enemy_reward_table',
  roleMultiplier: {},
  entries: [],
  interpolation: 'linear',
})
const roleKeys = ref<string[]>([])
const simEnemyLevel = ref(10)
const simRole = ref('normal')
const simResult = ref<ReturnType<typeof calcEnemyReward> | null>(null)

/** 等级差规则草稿 */
const levelDiff = reactive<LevelDiffBonusConfig>({
  id: 'level_diff_bonus',
  rules: [],
  fallbackMultiplier: 1,
  clampRange: { min: 0.1, max: 3 },
})
const diffErrors = ref<string[]>([])
const simPlayerLevel = ref(10)
const simDiffEnemyLevel = ref(15)
const diffSimResult = ref<{ diff: number; sign: string; ruleLabel: string; expMult: number; goldMult: number } | null>(null)

// ════════════ 加载 / 保存 ════════════

async function load(): Promise<void> {
  try {
    const [et, er, ld] = await Promise.all([
      api.getExpTable(),
      api.getEnemyRewardTable(),
      api.getLevelDiffBonus(),
    ])
    resetInto(expTable, et ?? defaultExpTable())
    resetInto(enemyReward, er ?? defaultEnemyReward())
    resetInto(levelDiff, ld ?? defaultLevelDiff())
    roleKeys.value = Object.keys(enemyReward.roleMultiplier)
  } catch {
    resetInto(expTable, defaultExpTable())
    resetInto(enemyReward, defaultEnemyReward())
    resetInto(levelDiff, defaultLevelDiff())
  }
}

function resetInto<T extends object>(target: T, source: T): void {
  Object.keys(target).forEach((k) => delete (target as Record<string, unknown>)[k])
  Object.assign(target, structuredClone(source))
}

/** 深拷贝为纯 JSON 对象（剥离 Vue reactive proxy；IDB structuredClone 无法克隆 proxy） */
function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Tab1 保存 */
async function saveExpTable(): Promise<void> {
  const errors = validateExpTable()
  expErrors.value = errors
  if (errors.length) return
  const result = await write.save('params', { id: 'exp_table', name: '玩家升级经验表', data: toPlain(expTable) })
  if (result.ok) notification.notify('已保存', `升级经验表已保存 · 数据版本 v${await api.getDataVersion()}`, 'success')
  else notification.notify('保存失败', result.errors?.join('\n') ?? '', 'error')
}

/** Tab2 保存 */
async function saveEnemyReward(): Promise<void> {
  const errors = validateEnemyReward()
  if (errors.length) {
    notification.notify('保存失败', errors.join('\n'), 'error')
    return
  }
  const result = await write.save('params', { id: 'enemy_reward_table', name: '敌人经验与金钱基准表', data: toPlain(enemyReward) })
  if (result.ok) notification.notify('已保存', `敌人经验与金钱基准表已保存 · 数据版本 v${await api.getDataVersion()}`, 'success')
  else notification.notify('保存失败', result.errors?.join('\n') ?? '', 'error')
}

/** Tab3 保存 */
async function saveLevelDiff(): Promise<void> {
  const errors = validateLevelDiff()
  diffErrors.value = errors
  if (errors.length) return
  const result = await write.save('params', { id: 'level_diff_bonus', name: '等级差经验加成规则', data: toPlain(levelDiff) })
  if (result.ok) notification.notify('已保存', `等级差经验加成规则已保存 · 数据版本 v${await api.getDataVersion()}`, 'success')
  else notification.notify('保存失败', result.errors?.join('\n') ?? '', 'error')
}

// ════════════ Tab1 交互 ════════════

function cumulativeExp(idx: number): number {
  let sum = 0
  for (let i = 0; i <= idx; i++) sum += expTable.entries[i]?.expRequired ?? 0
  return sum
}

/** 该等级升级约需击败的同等级普通敌人数量：升级经验 ÷ 同等级普通敌人基础经验（normal 倍率） */
function enemiesToLevelUp(entry: ExpTableConfig['entries'][number]): number | null {
  if (!entry || !entry.expRequired || entry.expRequired <= 0) return null
  const base = interpolateEnemyReward(enemyReward, entry.level)
  const expPerKill = Math.max(1, Math.round(base.baseExp * (enemyReward.roleMultiplier['normal'] ?? 1)))
  return Math.ceil(entry.expRequired / expPerKill)
}

/** 按公式填充：1-10 级 300×等级，11-30 级 600×等级，31-50 级 900×等级（保留已有备注） */
function applyExpFormula(): void {
  const notes = new Map(expTable.entries.map((e) => [e.level, e.note]))
  const maxLevel = Math.max(1, Math.min(100, expTable.maxLevel || 50))
  const entries: ExpTableConfig['entries'] = []
  for (let lv = 1; lv <= maxLevel; lv++) {
    entries.push({ level: lv, expRequired: lv <= 10 ? 300 * lv : lv <= 30 ? 600 * lv : 900 * lv, note: notes.get(lv) ?? '' })
  }
  expTable.entries.splice(0, expTable.entries.length, ...entries)
  expTable.maxLevel = maxLevel
  expTable.formulaHint = '1-10级：300×等级；11-30级：600×等级；31-50级：900×等级'
}

function removeExpEntry(i: number): void {
  expTable.entries.splice(i, 1)
}

function validateExpTable(): string[] {
  const errors: string[] = []
  if (expTable.maxLevel < 1 || expTable.maxLevel > 100) errors.push('最大等级超出允许范围（1~100）')
  const levels = new Set<number>()
  for (const e of expTable.entries) {
    if (!Number.isInteger(e.expRequired) || e.expRequired <= 0) errors.push(`等级 ${e.level}：升级经验必须为正整数`)
    levels.add(e.level)
  }
  for (let lv = 1; lv <= expTable.maxLevel; lv++) {
    if (!levels.has(lv)) errors.push(`等级 ${lv} 缺失，请补全`)
  }
  return errors
}

function resetExpTable(): void {
  resetInto(expTable, defaultExpTable())
}

function defaultExpTable(): ExpTableConfig {
  const entries: ExpTableConfig['entries'] = []
  for (let lv = 1; lv <= 50; lv++) {
    entries.push({ level: lv, expRequired: lv <= 10 ? 300 * lv : lv <= 30 ? 600 * lv : 900 * lv })
  }
  return { id: 'exp_table', maxLevel: 50, entries, formulaHint: '1-10级：300×等级；11-30级：600×等级；31-50级：900×等级' }
}

// ════════════ Tab2 交互 ════════════

/** 按公式填充 1-70 级：经验=等级×10，金钱=等级×3~等级×5 */
function applyEnemyFormula(): void {
  const entries: EnemyRewardTableConfig['entries'] = []
  for (let lv = 1; lv <= 70; lv++) {
    entries.push({ enemyLevel: lv, baseExp: lv * 10, goldMin: lv * 3, goldMax: lv * 5 })
  }
  enemyReward.entries.splice(0, enemyReward.entries.length, ...entries)
}

function removeEnemyEntry(i: number): void {
  enemyReward.entries.splice(i, 1)
}

function validateEnemyReward(): string[] {
  const errors: string[] = []
  for (const e of enemyReward.entries) {
    if (!Number.isInteger(e.baseExp) || e.baseExp <= 0) errors.push(`等级 ${e.enemyLevel}：基础经验必须为正整数`)
    if (e.goldMin < 0 || e.goldMin > e.goldMax) errors.push(`等级 ${e.enemyLevel}：金钱下限不能大于上限`)
  }
  for (const v of Object.values(enemyReward.roleMultiplier)) {
    if (!(v > 0)) errors.push('角色倍率必须大于 0')
  }
  return errors
}

function runEnemySim(): void {
  const cfg: EnemyRewardTableConfig = { ...enemyReward, entries: enemyReward.entries.map((e) => ({ ...e })) }
  simResult.value = calcEnemyReward(cfg, simEnemyLevel.value, simRole.value)
}

function resetEnemyReward(): void {
  resetInto(enemyReward, defaultEnemyReward())
  roleKeys.value = Object.keys(enemyReward.roleMultiplier)
}

function defaultEnemyReward(): EnemyRewardTableConfig {
  return {
    id: 'enemy_reward_table',
    baseExpFormula: 'enemyLevel × 10',
    baseGoldFormula: 'enemyLevel × 3 + random(0, enemyLevel × 2)',
    roleMultiplier: {
      normal: 1.0,
      elite: 1.15,
      yaotu: 1.2,
      yaokui: 2.0,
      yaowang: 3.0,
      yaozun: 5.0,
    },
    entries: [
      { enemyLevel: 1, baseExp: 10, goldMin: 3, goldMax: 5, note: '小花山初级敌人' },
      { enemyLevel: 5, baseExp: 50, goldMin: 15, goldMax: 25, note: '小花山后期' },
      { enemyLevel: 10, baseExp: 100, goldMin: 30, goldMax: 50, note: '浅水涧' },
      { enemyLevel: 15, baseExp: 150, goldMin: 45, goldMax: 75, note: '碎石坡' },
      { enemyLevel: 20, baseExp: 200, goldMin: 60, goldMax: 100, note: '熔岩洞' },
      { enemyLevel: 25, baseExp: 250, goldMin: 75, goldMax: 125, note: '蛛丝谷' },
      { enemyLevel: 30, baseExp: 300, goldMin: 90, goldMax: 150, note: '灵霄台终局' },
      { enemyLevel: 40, baseExp: 400, goldMin: 120, goldMax: 200, note: '中期深度（插值锚点）' },
      { enemyLevel: 50, baseExp: 500, goldMin: 150, goldMax: 250, note: '后期深度（插值锚点）' },
      { enemyLevel: 60, baseExp: 600, goldMin: 180, goldMax: 300, note: '妖尊 档（插值锚点）' },
      { enemyLevel: 70, baseExp: 700, goldMin: 210, goldMax: 350, note: '终局档（插值锚点）' },
    ],
    interpolation: 'linear',
  }
}

// ════════════ Tab3 交互 ════════════

function addRule(): void {
  levelDiff.rules.push({
    id: `rule_${levelDiff.rules.length + 1}`,
    label: '新规则',
    condition: { diff: 0 },
    expMultiplier: 1,
    goldMultiplier: 1,
    description: '',
  })
}

function removeRule(i: number): void {
  levelDiff.rules.splice(i, 1)
}

/** 条件显示文本 */
function diffConditionText(rule: LevelDiffBonusConfig['rules'][number]): string {
  const c = rule.condition.diff
  if (typeof c === 'number') return String(c)
  if (Array.isArray(c)) return `[${c[0]}, ${c[1]}]`
  return c
}

/** 从文本解析条件（change 时回写，非法保持原值） */
function parseDiffCondition(rule: LevelDiffBonusConfig['rules'][number], e: Event): void {
  const raw = (e.target as HTMLInputElement).value.trim()
  const parsed = parseConditionText(raw)
  if (parsed !== null) rule.condition.diff = parsed
}

function parseConditionText(raw: string): LevelDiffCondition | null {
  if (/^-?\d+$/.test(raw)) return Number(raw)
  const m = raw.match(/^\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]$/)
  if (m) return [Number(m[1]), Number(m[2])]
  if (/^\s*<=\s*-?\d+\s*$/.test(raw) || /^\s*>=\s*-?\d+\s*$/.test(raw)) {
    return raw.replace(/\s+/g, ' ')
  }
  return null
}

function validateLevelDiff(): string[] {
  const errors: string[] = []
  for (const r of levelDiff.rules) {
    if (r.expMultiplier < 0.01 || r.expMultiplier > 10) errors.push(`规则「${r.label ?? r.id}」经验倍率超出合理范围（0.01~10）`)
    if (r.goldMultiplier < 0.01 || r.goldMultiplier > 10) errors.push(`规则「${r.label ?? r.id}」金钱倍率超出合理范围（0.01~10）`)
  }
  if (!levelDiff.rules.some((r) => typeof r.condition.diff === 'number' && r.condition.diff === 0)) {
    errors.push('缺少同级（diff=0）规则')
  }
  for (let i = 0; i < levelDiff.rules.length; i++) {
    for (let j = i + 1; j < levelDiff.rules.length; j++) {
      if (rulesOverlap(levelDiff.rules[i].condition.diff, levelDiff.rules[j].condition.diff)) {
        errors.push(`规则「${levelDiff.rules[i].label}」与「${levelDiff.rules[j].label}」区间重叠`)
      }
    }
  }
  return errors
}

function rulesOverlap(a: LevelDiffCondition, b: LevelDiffCondition): boolean {
  for (let d = -30; d <= 30; d++) {
    if (matchLevelDiffCondition(a, d) && matchLevelDiffCondition(b, d)) return true
  }
  return false
}

function runLevelDiffSim(): void {
  const diff = simDiffEnemyLevel.value - simPlayerLevel.value
  const rule = matchLevelDiffRule({ rules: levelDiff.rules, fallbackMultiplier: levelDiff.fallbackMultiplier, clampRange: levelDiff.clampRange }, diff)
  const mult = calcLevelDiffMultiplier(levelDiff, diff)
  diffSimResult.value = {
    diff,
    sign: diff > 0 ? '越级' : diff < 0 ? '压级' : '同级',
    ruleLabel: rule?.label ?? `无规则命中（兜底 ${levelDiff.fallbackMultiplier}）`,
    expMult: mult.expMult,
    goldMult: mult.goldMult,
  }
}

function resetLevelDiff(): void {
  resetInto(levelDiff, defaultLevelDiff())
}

function defaultLevelDiff(): LevelDiffBonusConfig {
  return {
    id: 'level_diff_bonus',
    rules: [
      { id: 'rule_underleveled_5', label: '碾压（低5级及以上）', condition: { diff: '<= -5' }, expMultiplier: 0.1, goldMultiplier: 0.5, description: '敌人等级比玩家低5级及以上，经验大幅衰减', note: '防止低级刷怪' },
      { id: 'rule_underleveled_3', label: '轻松（低3~4级）', condition: { diff: [-4, -3] }, expMultiplier: 0.5, goldMultiplier: 0.8, description: '敌人等级比玩家低3~4级，经验减半' },
      { id: 'rule_underleveled_1', label: '略低（低1~2级）', condition: { diff: [-2, -1] }, expMultiplier: 0.8, goldMultiplier: 1.0, description: '敌人等级略低于玩家，经验轻微衰减' },
      { id: 'rule_even', label: '同级', condition: { diff: 0 }, expMultiplier: 1.0, goldMultiplier: 1.0, description: '等级相同，无修正' },
      { id: 'rule_overleveled_1', label: '略高（高1~2级）', condition: { diff: [1, 2] }, expMultiplier: 1.2, goldMultiplier: 1.0, description: '敌人略强，经验小幅加成' },
      { id: 'rule_overleveled_3', label: '挑战（高3~5级）', condition: { diff: [3, 5] }, expMultiplier: 1.5, goldMultiplier: 1.2, description: '越级挑战，经验显著加成' },
      { id: 'rule_overleveled_6', label: '极限（高6级及以上）', condition: { diff: '>= 6' }, expMultiplier: 2.0, goldMultiplier: 1.5, description: '极限越级，经验翻倍', note: '鼓励挑战高难内容' },
    ],
    fallbackMultiplier: 1.0,
    clampRange: { min: 0.1, max: 3.0 },
  }
}

void load()
</script>

<style scoped lang="scss">
/* NOTE: 共用布局类 fs-exp-tabs/tab/panel/block/sim-row/sim-result/field-label/num/num-sm
   已上移至 styles/fengshen.scss（三个视图共用）；此处只保留本视图专用类。 */
.fs-exp-mult-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
}

.fs-exp-mult-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);

  span {
    color: var(--color-text-secondary);
    white-space: nowrap;
    min-width: 4em;
  }
}

.fs-exp-cond {
  width: 120px;
  font-family: var(--font-family-mono);
}

.fs-exp-sep {
  color: var(--color-text-tertiary);
}

.fs-exp-rule-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
