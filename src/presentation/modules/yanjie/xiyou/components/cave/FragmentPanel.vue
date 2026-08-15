<template>
  <div>
    <div v-for="v in rules" :key="v.fragId" class="xy-cave-frag-row">
      <div class="xy-cave-frag-row__info">
        <span class="xy-cave-card__top">
          <span class="xy-cave-card__name">{{ v.outName }}</span>
          <span class="xy-cave-chip" :class="qualityChip(v.outQuality)">{{ v.outQuality }}</span>
        </span>
        <p class="xy-cave-card__desc">
          {{ v.fragName }} ×{{ v.need }} 合成 {{ v.outName }} ×1
        </p>
      </div>

      <span class="xy-cave-frag-row__count">
        {{ v.fragName }}
        <strong>{{ haveOf(v) }}</strong>
        / {{ v.need }}
      </span>

      <div class="xy-cave-frag-row__progress">
        <div class="xy-progress xy-progress--gold">
          <div class="xy-progress-fill" :style="{ width: Math.min(percentOf(v), 100) + '%' }"></div>
        </div>
        <div class="xy-progress-text">
          <span>收集进度</span>
          <span>{{ Math.min(percentOf(v), 100) }}%</span>
        </div>
      </div>

      <button
        type="button"
        class="xy-cave-action xy-cave-action--ghost"
        :disabled="!canSynthesize(v)"
        @click="synthesize(v)"
      >
        合 成
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { usePackStore } from '@/presentation/stores/packStore'
import type { XiyouQuality } from '../../types'
import { qualityClassOf } from '../../quality'
import { fragmentRuleViews, type FragmentRuleView } from '../../caveLogic'

const pack = usePackStore()
const notification = useNotificationStore()

const rules = fragmentRuleViews()

function haveOf(v: FragmentRuleView): number {
  return pack.countOf(v.fragId)
}

function percentOf(v: FragmentRuleView): number {
  return Math.floor((haveOf(v) / v.need) * 100)
}

function canSynthesize(v: FragmentRuleView): boolean {
  return haveOf(v) >= v.need
}

function qualityChip(q: XiyouQuality): string {
  return qualityClassOf(q)
}

function synthesize(v: FragmentRuleView): void {
  if (!canSynthesize(v)) return
  if (!pack.removeItem(v.fragId, v.need)) return
  pack.addItem(v.outId, 1)
  notification.toast(`合成成功！获得「${v.outName}」×1`, 'success')
}
</script>
