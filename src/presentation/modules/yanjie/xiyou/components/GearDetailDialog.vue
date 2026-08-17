<template>
  <Dialog
    :model-value="!!instance"
    :title="gear?.name ?? '装备详情'"
    :title-color="instance ? equipQualityColor(instance.quality) : undefined"
    width="460px"
    @update:model-value="onClose"
  >
    <div v-if="gear && instance" class="gd-detail">
      <div class="gd-top">
        <span class="gd-rank" :class="qualityClass(gear.rarity)">{{ qualityOf(gear.rarity) }}</span>
        <span class="gd-quality" :class="equipQualityClass(instance.quality)">
          {{ qualityName(instance.quality) }} · ×{{ factorText(instance.qualityFactor) }}
        </span>
        <span class="gd-meta">{{ slotLabel }} · {{ tierLabel }}</span>
        <span v-if="instance.enhance > 0" class="gd-enhance">强化 +{{ instance.enhance }}</span>
      </div>
      <p class="gd-desc">{{ gear.description || '暂无描述' }}</p>

      <!-- 新旧对比：候选 vs 当前穿戴同槽装备 -->
      <div class="gd-compare-head">
        <span>装备属性</span>
        <span v-if="oldGear" class="gd-compare-vs">对比已穿戴「{{ oldGear.name }}」</span>
        <span v-else class="gd-compare-vs gd-compare-vs--empty">当前未穿戴{{ slotLabel }}</span>
      </div>
      <div class="gd-rows">
        <p v-for="s in statRows" :key="s.key" class="gd-row">
          <span class="gd-row-key">{{ s.label }}</span>
          <span class="gd-row-val">{{ s.value >= 0 ? '+' : '' }}{{ s.value }}{{ s.percent ? '%' : '' }}</span>
          <span v-if="s.delta !== null" class="gd-row-delta"
            :class="s.delta >= 0 ? 'gd-row-delta--up' : 'gd-row-delta--down'">
            {{ s.delta >= 0 ? '+' : '' }}{{ s.delta }}{{ s.percent ? '%' : '' }}
          </span>
          <span v-if="s.isNew" class="gd-row-tag">新增</span>
          <span v-if="s.isGone" class="gd-row-tag gd-row-tag--gone">移除</span>
        </p>
        <p v-if="instance.affixes.length" class="gd-row gd-row--affix" v-for="a in instance.affixes" :key="a.id">
          <span class="gd-row-key">词缀</span>
          <span class="gd-row-val gd-row-val--affix">{{ labelOf(a.attribute) }} +{{ a.value }}{{ a.modifierType === 'percent' ? '%' : '' }}</span>
        </p>
        <p v-if="statRows.length === 0 && instance.affixes.length === 0" class="gd-empty">该装备无属性加成</p>
      </div>

      <p v-if="gear.source" class="gd-source">来源：{{ gear.source }}</p>

      <div class="gd-actions">
        <Button size="small" variant="primary" @click="onEquip">穿戴</Button>
        <Button size="small" @click="onClose">关闭</Button>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import {
  usePackStore,
  GEAR_SLOT_LABELS,
  type GearInstance,
  type GearSlotKey,
} from '@/presentation/stores/packStore'
import type { EquipmentData } from '@/domain/fengshen/types'
import { equipQualityClass, equipQualityColor, qualityClass, qualityName, qualityOf } from '../quality'

const props = defineProps<{
  instance: GearInstance | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'equip', instanceId: string): void
}>()

const pack = usePackStore()

/** 六槽键（详情对比仅对可穿戴槽位生效） */
const SLOT_KEYS: GearSlotKey[] = ['weapon', 'armor', 'helmet', 'boots', 'charm', 'ring']

const gear = computed(() => (props.instance ? pack.gearById(props.instance.itemId) : undefined))

const slot = computed<GearSlotKey | null>(() => {
  const s = gear.value?.slot
  return s && (SLOT_KEYS as string[]).includes(s) ? (s as GearSlotKey) : null
})

const slotLabel = computed(() => (slot.value ? GEAR_SLOT_LABELS[slot.value] : gear.value?.slot ?? '—'))

const TIER_LABELS: Record<string, string> = {
  t1: '一阶',
  t2: '二阶',
  t3: '三阶',
  t4: '天品',
  t5: '仙品',
}
const tierLabel = computed(() => (gear.value?.tier ? TIER_LABELS[gear.value.tier] ?? gear.value.tier : '—'))

const oldInst = computed(() => (slot.value ? pack.equippedInstance(slot.value) : null))
const oldGear = computed(() => (oldInst.value ? pack.gearById(oldInst.value.itemId) : undefined))

/** 按 attribute+modifierType 聚合实例 stats（基础×品质×强化 + 词缀） */
function aggregate(stats: EquipmentData['stats']): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of stats) {
    const key = `${s.attribute}:${s.modifierType}`
    map.set(key, (map.get(key) ?? 0) + s.value)
  }
  return map
}

const newMap = computed(() => aggregate(props.instance ? pack.instanceStats(props.instance) : []))
const oldMap = computed(() => (oldInst.value ? aggregate(pack.instanceStats(oldInst.value)) : new Map()))

interface StatRow {
  key: string
  label: string
  value: number
  percent: boolean
  /** 与当前穿戴同槽装备的差值；无对比对象为 null */
  delta: number | null
  isNew: boolean
  isGone: boolean
}

const STAT_LABELS: Record<string, string> = {
  attack: '攻击',
  defense: '防御',
  maxHealth: '气血',
  speed: '速度',
  critRate: '暴击率',
  critDamage: '暴击伤害',
  hit: '命中',
  dodge: '闪避',
  damageReduction: '伤害减免',
  healReceived: '治疗效果',
  damageToLowHp: '对低血伤害',
  damageToDemon: '对妖伤害',
  attackBonus: '攻击加成',
  defenseBonus: '防御加成',
  comboRate: '连击率',
  reflectDamagePercent: '反弹伤害',
}

const statRows = computed<StatRow[]>(() => {
  const rows: StatRow[] = []
  const keys = new Set([...newMap.value.keys(), ...oldMap.value.keys()])
  for (const key of keys) {
    const [attribute, modifierType] = key.split(':')
    const newVal = newMap.value.get(key)
    const oldVal = oldMap.value.get(key)
    if (newVal === undefined) {
      // 候选无、旧装备有 → 穿戴后该属性被移除
      rows.push({
        key,
        label: STAT_LABELS[attribute] ?? attribute,
        value: oldVal ?? 0,
        percent: modifierType === 'percent',
        delta: null,
        isNew: false,
        isGone: true,
      })
      continue
    }
    rows.push({
      key,
      label: STAT_LABELS[attribute] ?? attribute,
      value: newVal,
      percent: modifierType === 'percent',
      delta: oldVal === undefined ? null : newVal - oldVal,
      isNew: oldVal === undefined,
      isGone: false,
    })
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'zh'))
})

function labelOf(attribute: string): string {
  return STAT_LABELS[attribute] ?? attribute
}

/** 品质系数文案：×0.85（两位小数） */
function factorText(factor: number): string {
  return (Math.round(factor * 100) / 100).toFixed(2)
}

function onClose(): void {
  emit('close')
}

function onEquip(): void {
  if (props.instance) emit('equip', props.instance.instanceId)
}
</script>

<style scoped lang="scss">
/* NOTE: Dialog 经 Teleport 到 body，位于 .xy-game 之外，--xy-* 变量不可用，统一用全局 --color-* 令牌 */
.gd-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.gd-top {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.gd-rank,
.gd-quality {
  font-family: 'KaiTi', 'STKaiti', 'Kaiti SC', serif;
  font-size: var(--font-size-lg);
  letter-spacing: 2px;
}

.gd-quality {
  font-weight: 600;
}

.gd-meta {
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}

.gd-enhance {
  margin-left: auto;
  font-size: var(--font-size-md);
  color: var(--color-skill-active);
}

.gd-desc {
  margin: 0;
  padding: var(--space-3);
  background: var(--color-bg-secondary);
  border-radius: 2px;
  font-size: var(--font-size-md);
  line-height: var(--line-height-md);
  color: var(--color-text-secondary);
}

.gd-compare-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
}

.gd-compare-vs {
  font-size: var(--font-size-sm);
  color: var(--color-text-disabled);

  &--empty {
    color: var(--color-text-disabled);
  }
}

.gd-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.gd-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);

  &--affix {
    padding-top: var(--space-1);
    border-top: 1px dashed var(--color-border-default);
  }
}

.gd-row-key {
  flex: 1;
  min-width: 0;
  color: var(--color-text-disabled);
}

.gd-row-val {
  color: var(--color-text-primary);

  &--affix {
    color: var(--color-brand-red);
  }
}

.gd-row-delta {
  font-size: var(--font-size-sm);

  &--up {
    color: var(--color-buff);
  }

  &--down {
    color: var(--color-debuff);
  }
}

.gd-row-tag {
  padding: 0 var(--space-1);
  font-size: var(--font-size-sm);
  border-radius: 2px;
  background: var(--color-buff-soft);
  color: var(--color-buff);

  &--gone {
    background: var(--color-debuff-soft);
    color: var(--color-debuff);
  }
}

.gd-empty {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--color-text-disabled);
}

.gd-source {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-disabled);
}

.gd-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  border-top: 1px dashed var(--color-border-default);
  padding-top: var(--space-3);
}
</style>
