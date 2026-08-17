<template>
  <div class="ht-attrs">
    <Tabs v-model="active" :tabs="tabs" size="sm" equal-width />
    <div v-if="!store.selectedEvent" class="ht-attrs-empty">选中事件以查看目标 / 行动角色属性</div>
    <div v-else-if="participant" class="ht-attrs-body">
      <div class="ht-attrs-hd">
        <span class="ht-attrs-name">{{ participant.name }}</span>
        <span class="ht-attrs-id">{{ participant.id }}</span>
      </div>
      <div v-if="rows.length" class="ht-attrs-grid">
        <div v-for="r in rows" :key="r.code" class="ht-attrs-row" :title="`${r.code} · ${r.tier}`">
          <span class="k">{{ r.name }}</span>
          <span class="v">{{ r.value }}{{ r.pct ? '%' : '' }}</span>
        </div>
      </div>
      <div v-else class="ht-attrs-empty">该角色无属性数据（存档未携带 attributes）</div>
    </div>
    <div v-else class="ht-attrs-empty">
      {{ active === 'actor' ? '该事件无行动角色（无 sourceId）' : '该事件无目标角色（无 targetId）' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { getAttrMeta, getAttrName, type ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { getAttributeDisplayConfig, type DisplayTier } from '@/presentation/config/attributeDisplay'
import type { ArchiveParticipant } from '@/domain/battle/replay/unified/unified-archive'
import { useHaotianStore } from '../stores/haotianStore'

const store = useHaotianStore()
const active = ref<'target' | 'actor'>('target')

const tabs = [
  { id: 'target', label: '目标角色' },
  { id: 'actor', label: '行动角色' },
]

/** 当前激活 tab 对应的角色（初始参与者快照，仅用于名字/id 展示） */
const participant = computed<ArchiveParticipant | null>(() =>
  active.value === 'actor' ? store.selectedActor : store.selectedTarget,
)

interface AttrRow {
  code: string
  name: string
  value: number
  pct: boolean
  tier: DisplayTier
}

/**
 * 当前属性：初始快照 + 沿 attribute_recalc 事件推演到当前回放时刻的覆盖值。
 * 回放到任意时刻（如第 50 回合）面板反映该时刻属性，而非开战那一刻。
 */
const currentAttrs = computed<Record<string, number> | undefined>(() => {
  const p = participant.value
  if (!p) return undefined
  return store.attrsAt.get(p.id) ?? p.attributes
})

/**
 * 属性列表：core 层级全显示；advanced/situational 仅显示非 0 值（省噪音）；
 * hidden（hp/energy/shield）由存档契约排除，此处双保险跳过。
 */
const rows = computed<AttrRow[]>(() => {
  const p = participant.value
  const attrs = currentAttrs.value
  if (!p || !attrs) return []
  const out: AttrRow[] = []
  for (const [code, value] of Object.entries(attrs)) {
    const cfg = getAttributeDisplayConfig(code)
    if (cfg.displayTier === 'hidden') continue
    if (cfg.displayTier !== 'core' && value === 0) continue
    out.push({
      code,
      name: getAttrName(code as ATTRIBUTE_CODE),
      value,
      pct: !!getAttrMeta(code as ATTRIBUTE_CODE)?.isPercentage,
      tier: cfg.displayTier,
    })
  }
  return out
})
</script>
