<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      属性与公式
      <span class="fs-page-hint">一级 / 二级属性 · 计算规则（当前公式在代码中，此页为只读参考）</span>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">属性定义</div>
      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th>属性</th><th>代码</th><th>层级</th><th>SAP 倍数</th><th>说明</th></tr>
          </thead>
          <tbody>
            <tr v-for="attr in attributes" :key="attr.id">
              <td>{{ attr.name }}</td>
              <td class="fs-cell-num">{{ attr.code }}</td>
              <td><span class="fs-tag" :class="tierClass(attr.valueTier)">{{ tierLabel(attr.valueTier) }}</span></td>
              <td class="fs-cell-num">{{ attr.sapMultiplier }}</td>
              <td>{{ attr.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">计算公式</div>
      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th>名称</th><th>公式</th><th>来源</th></tr>
          </thead>
          <tbody>
            <tr v-for="f in FORMULAS" :key="f.name">
              <td>{{ f.name }}</td>
              <td class="fs-formula">{{ f.formula }}</td>
              <td>{{ f.source }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="fs-form-hint">昊天镜可据此反推伤害计算是否符合预期；表达式引擎动态解析为增强项。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import type { AttributeDef, AttributeValueTier } from '@/domain/fengshen/types'

const api = container.resolve<GameDataApi>('GameDataApi')
const attributes = ref<AttributeDef[]>([])

const TIER_LABELS: Record<AttributeValueTier, string> = {
  L1: '基础值',
  L2: '百分比',
  L3: '独立乘',
  L4: '最终乘',
}

const TIER_CLASSES: Record<AttributeValueTier, string> = {
  L1: 'fs-tag-aura',
  L2: 'fs-tag-buff',
  L3: 'fs-tag-dot',
  L4: 'fs-tag-control',
}

function tierLabel(tier: AttributeValueTier): string {
  return TIER_LABELS[tier] ?? tier
}

function tierClass(tier: AttributeValueTier): string {
  return TIER_CLASSES[tier] ?? 'fs-tag-neutral'
}

const FORMULAS = [
  { name: '基础伤害', formula: 'rand(攻击最小, 攻击最大) × Σ修正系数', source: 'DamageCalculator' },
  { name: '防御减免', formula: '最终伤害 = 基础伤害 × (1 − 防御 × 0.01)', source: 'DamageCalculator' },
  { name: '暴击', formula: '暴击伤害 = 最终伤害 × 暴击伤害倍率', source: 'DamageCalculator' },
  { name: '计算命中率', formula: '命中值 ÷ (命中值 + 闪避值) × 100%', source: 'DamageCalculator' },
  { name: '实际命中', formula: 'clamp(计算命中率 + 命中率 − 闪避率, 10%, 95%)', source: 'DamageCalculator' },
] as const

onMounted(async () => {
  attributes.value = await api.listAttributes()
})
</script>
