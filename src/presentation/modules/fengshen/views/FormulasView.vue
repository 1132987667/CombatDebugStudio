<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      属性与公式
      <span class="fs-page-hint">公式参考为主 · 逐击分层公式对照 DamageCalculator 真实执行顺序 + 引擎实例演算</span>
    </div>

    <!-- ===== 一、分层公式（按引擎执行顺序） ===== -->
    <div v-for="zone in zones" :key="zone.id" class="fs-block">
      <div class="fs-block-title">
        {{ zone.label }}
        <span class="fs-zone-desc">{{ zone.desc }}</span>
      </div>
      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th class="fs-col-label">环节</th><th>公式</th><th>涉及属性</th><th class="fs-col-prd">PRD</th><th class="fs-col-prd">对齐</th></tr>
          </thead>
          <tbody>
            <tr v-for="s in zone.steps" :key="s.key">
              <td class="fs-col-label">{{ s.label }}</td>
              <td>
                <div class="fs-formula">{{ s.expr }}</div>
                <div v-if="s.note" class="fs-note">{{ s.note }}</div>
              </td>
              <td class="fs-cell-dim">{{ attrNames(s.attrs) }}</td>
              <td class="fs-cell-dim">{{ s.prd || '—' }}</td>
              <td>
                <span class="fs-tag" :class="s.align === 'gap' ? 'fs-tag-danger' : 'fs-tag-ok'">
                  {{ s.align === 'gap' ? '待补' : '一致' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="fs-callout">{{ L4_NOTE }}</div>

    <!-- ===== 二、引擎实例演算 ===== -->
    <div class="fs-block">
      <div class="fs-block-title">
        实例演算
        <span class="fs-zone-desc">现场调用 DamageCalculator（默认关闭暴击/闪避随机，结果可复算）</span>
      </div>

      <div class="fs-trace-inputs">
        <div v-for="g in traceInputs" :key="g.group" class="fs-trace-input-group">
          <div class="fs-trace-input-title">{{ g.group }}</div>
          <div v-for="item in g.items" :key="item.label" class="fs-trace-input-row">
            <span class="fs-trace-input-label">{{ item.label }}</span>
            <span class="fs-cell-num">{{ item.value }}</span>
          </div>
        </div>
      </div>

      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th class="fs-col-label">步骤</th><th>说明</th><th class="fs-col-num">前值 → 后值</th></tr>
          </thead>
          <tbody>
            <tr v-for="(st, i) in trace.steps" :key="i">
              <td class="fs-col-label">{{ st.stepName }}</td>
              <td>{{ st.description }}</td>
              <td class="fs-cell-num">{{ st.before }} → {{ st.after }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="fs-form-hint">
        减免前 rawDamage <b class="fs-cell-num">{{ trace.result.rawDamage }}</b> ·
        最终伤害 <b class="fs-cell-num">{{ trace.result.finalDamage }}</b> ·
        暴击 {{ trace.result.isCritical ? '是' : '否' }} ·
        命中 {{ trace.result.isMiss ? '闪避' : '命中' }}。
        引擎每步 floor 取整（如 780 × 1.15 = 896.99… → 896），故手算与逐击链可能有 1 点差。
      </div>
    </div>

    <!-- ===== 三、属性字典（次要，只读折叠） ===== -->
    <details class="fs-block fs-dict">
      <summary class="fs-block-title">
        数值属性字典
        <span class="fs-zone-desc">64 项核心 · 按 PRD §9 分层（只读参考，编辑请用侧栏「属性定义」）</span>
      </summary>
      <div v-for="grp in dictGroups" :key="grp.category" class="fs-dict-group">
        <div class="fs-dict-group-title">{{ grp.category }}<span class="fs-dict-count">{{ grp.items.length }}</span></div>
        <div class="fs-table-wrap">
          <table class="fs-table">
            <thead>
              <tr><th class="fs-col-label">属性</th><th>代码</th><th class="fs-col-prd">层级</th></tr>
            </thead>
            <tbody>
              <tr v-for="a in grp.items" :key="a.code">
                <td class="fs-col-label">{{ a.name }}</td>
                <td class="fs-cell-dim">{{ a.code }}</td>
                <td><span class="fs-tag" :class="tierClass(a.tier)">{{ a.tier }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AttributeValueTier } from '@/domain/fengshen/types'
import {
  FORMULA_ZONES,
  DAMAGE_FORMULA_STEPS,
  L4_NOTE,
  buildSampleDamageTrace,
  type FormulaStep,
} from '@/domain/fengshen/damage-formula-reference'
import { getCoreAttributes, CORE_CATEGORY_ORDER, type AttributeDictEntry } from '@/domain/fengshen/attribute-dictionary'

const TIER_CLASSES: Record<AttributeValueTier, string> = {
  L1: 'fs-tag-aura',
  L2: 'fs-tag-buff',
  L3: 'fs-tag-ok',
  L4: 'fs-tag-muted',
}

function tierClass(tier: AttributeValueTier): string {
  return TIER_CLASSES[tier] ?? 'fs-tag-muted'
}

/** code → 权威中文名，用于展示公式步骤涉及属性 */
const NAME_BY_CODE = new Map<string, string>(
  getCoreAttributes().map((a) => [a.code, a.name]),
)
function attrNames(codes?: string[]): string {
  if (!codes?.length) return '—'
  return codes.map((c) => NAME_BY_CODE.get(c) ?? c).join('、')
}

/** 按引擎执行顺序给每个阶段附上其公式步骤 */
const zones = computed(() =>
  FORMULA_ZONES.map((z) => ({
    ...z,
    steps: DAMAGE_FORMULA_STEPS.filter((s): s is FormulaStep => s.zoneId === z.id),
  })).filter((z) => z.steps.length > 0),
)

const trace = buildSampleDamageTrace()
const traceInputs = computed(() => {
  const order: string[] = []
  const map = new Map<string, { label: string; value: string }[]>()
  for (const row of trace.inputs) {
    if (!map.has(row.group)) {
      map.set(row.group, [])
      order.push(row.group)
    }
    map.get(row.group)!.push({ label: row.label, value: row.value })
  }
  return order.map((group) => ({ group, items: map.get(group)! }))
})

const dictGroups = computed(() => {
  const core = getCoreAttributes()
  return CORE_CATEGORY_ORDER
    .map((category) => ({
      category: category as string,
      items: core.filter((a: AttributeDictEntry) => a.category === category),
    }))
    .filter((g) => g.items.length > 0)
})
</script>
