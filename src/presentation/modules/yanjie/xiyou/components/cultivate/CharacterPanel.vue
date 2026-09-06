<template>
  <div class="xy-character-panel">
    <section class="xy-char-header">
      <div class="xy-char-info">
        <div class="xy-char-name-row">
          <span class="xy-char-name">{{ player.name }}</span>
          <span class="xy-char-level">Lv.{{ player.level }}</span>
        </div>
        <p class="xy-char-title">{{ player.title }}</p>
        <div class="xy-exp-bar">
          <div class="xy-exp-fill" :style="{ width: expPct + '%' }"></div>
          <span class="xy-exp-text">{{ player.exp }} / {{ player.expNeed }} 经验</span>
        </div>
      </div>
    </section>

    <section class="xy-section">
      <h4 class="xy-sec-title">属性面板<span class="xy-sec-count">共 {{ attrTotal }} 项</span></h4>

      <div class="xy-attr-group">
        <p class="xy-attr-sub">基础属性</p>
        <div class="xy-attr-grid" @mouseleave="hideAttrTooltip">
          <div class="xy-attr-item" @mouseenter="showAttrTooltip($event, ATTRIBUTE_CODE.maxHealth, attrVal(ATTRIBUTE_CODE.maxHealth))" @mousemove="updateTooltipPosition">
            <span class="xy-attr-label">气血</span>
            <span class="xy-attr-value">{{ hpText }}</span>
          </div>
          <div class="xy-attr-item" @mouseenter="showAttrTooltip($event, ATTRIBUTE_CODE.maxEnergy, attrVal(ATTRIBUTE_CODE.maxEnergy))" @mousemove="updateTooltipPosition">
            <span class="xy-attr-label">能量</span>
            <span class="xy-attr-value">{{ energyText }}</span>
          </div>
          <div class="xy-attr-item" v-for="item in coreAttrs" :key="item.code"
            @mouseenter="showAttrTooltip($event, item.code, attrVal(item.code))" @mousemove="updateTooltipPosition">
            <span class="xy-attr-label">{{ item.displayName }}</span>
            <span class="xy-attr-value" :class="{ 'xy-attr-value--pct': item.isPercentage }">{{ attrText(item) }}</span>
          </div>
        </div>
      </div>

      <div class="xy-attr-group">
        <button type="button" class="xy-attr-sub xy-attr-sub--toggle" :aria-expanded="advancedExpanded"
          @click="advancedExpanded = !advancedExpanded">
          <span>进阶属性</span>
          <span class="xy-attr-caret">{{ advancedExpanded ? '收起' : '展开' }}</span>
        </button>
        <template v-if="advancedExpanded">
          <div v-for="(attrs, group) in advancedGroups" :key="group" class="xy-attr-sub-group">
            <p class="xy-attr-sub xy-attr-sub--minor">{{ groupLabels[group] ?? group }}</p>
            <div class="xy-attr-grid" @mouseleave="hideAttrTooltip">
              <div class="xy-attr-item" v-for="item in attrs" :key="item.code"
                @mouseenter="showAttrTooltip($event, item.code, attrVal(item.code))" @mousemove="updateTooltipPosition">
                <span class="xy-attr-label">{{ item.displayName }}</span>
                <span class="xy-attr-value" :class="{ 'xy-attr-value--pct': item.isPercentage }">{{ attrText(item) }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section class="xy-section">
      <h4 class="xy-sec-title">角色加点<span class="xy-sec-count">剩余 {{ statPoints.available }} 点</span></h4>
      <div class="xy-stat-list">
        <div class="xy-stat-row" v-for="stat in statList" :key="stat.key">
          <span class="xy-stat-label">{{ stat.label }}</span>
          <span class="xy-stat-desc">{{ stat.desc }}</span>
          <div class="xy-stat-ctrl">
            <button type="button" class="xy-stat-btn" :disabled="statPoints[stat.key] <= 0" @click="decStat(stat.key)">-</button>
            <span class="xy-stat-val">{{ statPoints[stat.key] }}</span>
            <button type="button" class="xy-stat-btn" :disabled="statPoints.available <= 0" @click="incStat(stat.key)">+</button>
          </div>
        </div>
      </div>
      <div class="xy-stat-actions">
        <button type="button" class="xy-btn xy-btn--primary" :disabled="usedPoints === 0" @click="applyStats">分配加点</button>
        <button type="button" class="xy-btn xy-btn--ghost" :disabled="usedPoints === 0" @click="resetStats">重置加点</button>
      </div>
    </section>

    <section class="xy-section">
      <h4 class="xy-sec-title">装备总览<span class="xy-sec-count">{{ equippedGear.length }}/6</span></h4>
      <div class="xy-equip-list">
        <div class="xy-equip-row" v-for="g in equippedGear" :key="g.slot">
          <span class="xy-equip-slot">{{ g.slot }}</span>
          <span class="xy-equip-name">{{ g.item }}<em v-if="g.enhance > 0">+{{ g.enhance }}</em></span>
          <span class="xy-chip" :class="qualityClass(g.rarity)">{{ qualityOf(g.rarity) }}</span>
        </div>
      </div>
      <button type="button" class="xy-link-btn" @click="emit('goEquip')">前往装备面板</button>
    </section>

    <AttributeTooltip :visible="attrTooltip.visible" :title="attrTooltip.title"
      :final-value="attrTooltip.finalValue" :value-type="attrTooltip.valueType"
      :trigger-rect="attrTooltip.triggerRect" :attribute-code="attrTooltip.attributeCode" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

import { ATTRIBUTE_CODE, AttributeMetaMap, AttributeValueType, getAttrDv, getAttrMeta } from '@/domain/attribute/types'
import { getAttributeDisplayConfig } from '@/presentation/config/attributeDisplay'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { usePackStore, GEAR_SLOT_LABELS, type GearSlotKey } from '@/presentation/stores/packStore'
import { equipBonuses } from '../../battle'
import { qualityClass, qualityOf } from '../../quality'

defineEmits<{ goEquip: [] }>()

const notification = useNotificationStore()

const { player, statPoints, playerAttributes, battleSnapshot } = storeToRefs(usePlayerStore())

const expPct = computed(() => (player.value.exp / player.value.expNeed) * 100)

/* ── 属性面板（对齐唤灵台「角色监控」：基础/加成/进阶三层分组，元数据驱动 + 悬浮说明） ── */

interface AttrEntry {
  code: ATTRIBUTE_CODE
  displayName: string
  isPercentage: boolean
}

function toEntry(code: ATTRIBUTE_CODE, meta: { displayName: string; isPercentage?: boolean }): AttrEntry {
  return { code, displayName: meta.displayName, isPercentage: !!meta.isPercentage }
}

const EXCLUDED_CORE = new Set([
  ATTRIBUTE_CODE.currentHealth,
  ATTRIBUTE_CODE.currentEnergy,
  ATTRIBUTE_CODE.maxHealth,
  ATTRIBUTE_CODE.maxEnergy,
  ATTRIBUTE_CODE.shield,
])

const coreAttrs = computed<AttrEntry[]>(() =>
  Object.entries(AttributeMetaMap)
    .filter(
      ([code]) =>
        getAttributeDisplayConfig(code).displayTier === 'core' &&
        !EXCLUDED_CORE.has(code as ATTRIBUTE_CODE),
    )
    .map(([code, meta]) => toEntry(code as ATTRIBUTE_CODE, meta)),
)

const advancedGroups = computed<Record<string, AttrEntry[]>>(() => {
  const groups: Record<string, AttrEntry[]> = {}
  for (const [code, meta] of Object.entries(AttributeMetaMap)) {
    const display = getAttributeDisplayConfig(code)
    // NOTE: 未配置项（displayTier 默认 advanced）对齐唤灵台一并展示——流派增量/装备词缀可携带
    //       进阶属性（如 armorBreak/lifestealRate），不再当 0 值噪音隐藏；situational（五行抗性、
    //       情境增伤）并入折叠区按组展示；hidden（currentHealth/shield 等运行时资源）不进面板。
    //       分组轴为属性族（*Bonus/系数/最终值与基础属性同族），非计算层
    if (display.displayTier !== 'advanced' && display.displayTier !== 'situational') continue
    const entry = toEntry(code as ATTRIBUTE_CODE, meta)
    const list = groups[display.group] ?? (groups[display.group] = [])
    list.push(entry)
  }
  return groups
})

const groupLabels: Record<string, string> = {
  vitality: '生命',
  offense: '攻击',
  defense: '防御',
  speed: '速度',
  crit: '暴击',
  accuracy: '命中闪避',
  mechanic: '机制',
  control: '控制',
  elemental: '元素',
  support: '辅助',
  energy: '能量',
  utility: '其他',
}

const advancedExpanded = ref(false)

const advancedCount = computed(() =>
  Object.values(advancedGroups.value).reduce((sum, list) => sum + list.length, 0),
)
// 属性加成（*Bonus）已通过展示配置归入进阶区属性族分组，此处 advancedCount 已含
const attrTotal = computed(() => 2 + coreAttrs.value.length + advancedCount.value)

const hpText = computed(() => `${attrVal(ATTRIBUTE_CODE.currentHealth)}/${attrVal(ATTRIBUTE_CODE.maxHealth)}`)
const energyText = computed(() => `${attrVal(ATTRIBUTE_CODE.currentEnergy)}/${attrVal(ATTRIBUTE_CODE.maxEnergy)}`)

// NOTE: 装备加成与战斗主角同口径（BattleZen.initBattle / BattleRoster 均 equipBonuses(equippedStats, battleSnapshot)），
//       面板数值 = 实时快照（基础+加点+流派）+ 已穿戴装备词缀增量，否则面板与战斗数值不同源
const pack = usePackStore()
const gearBonus = computed(() => equipBonuses(pack.equippedStats(), battleSnapshot.value))

function attrVal(code: ATTRIBUTE_CODE): number {
  return (playerAttributes.value[code] ?? getAttrDv(code)) + (gearBonus.value[code] ?? 0)
}

function attrText(item: AttrEntry): string {
  return attrVal(item.code) + (item.isPercentage ? '%' : '')
}

const attrTooltip = ref({
  visible: false,
  title: '',
  finalValue: 0,
  valueType: AttributeValueType.VALUE as AttributeValueType,
  attributeCode: '' as string,
  triggerRect: null as DOMRect | null,
})

function showAttrTooltip(event: MouseEvent, code: ATTRIBUTE_CODE, value: number) {
  const meta = getAttrMeta(code)
  attrTooltip.value = {
    visible: true,
    title: meta?.displayName ?? code,
    finalValue: value,
    valueType: meta?.isPercentage ? AttributeValueType.PERCENT : AttributeValueType.VALUE,
    attributeCode: code,
    triggerRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
  }
}

function updateTooltipPosition(event: MouseEvent) {
  attrTooltip.value.triggerRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
}

function hideAttrTooltip() {
  attrTooltip.value.visible = false
}

const statList = [
  { key: 'strength', label: '力量', desc: '攻击 +1/点' },
  { key: 'vitality', label: '体质', desc: '气血 +10/点' },
  { key: 'agility', label: '敏捷', desc: '速度 +1/点' },
  { key: 'spirit', label: '精神', desc: '能量 +5/点' },
] as const

type StatKey = (typeof statList)[number]['key']

const usedPoints = computed(() => statList.reduce((sum, s) => sum + statPoints.value[s.key], 0))

function incStat(key: StatKey) {
  if (statPoints.value.available <= 0) return
  statPoints.value.available--
  statPoints.value[key]++
}

function decStat(key: StatKey) {
  if (statPoints.value[key] <= 0) return
  statPoints.value[key]--
  statPoints.value.available++
}

function applyStats() {
  notification.toast('加点已生效，属性已实时更新')
}

function resetStats() {
  if (!confirm('确认重置所有加点？')) return
  statList.forEach((s) => {
    statPoints.value.available += statPoints.value[s.key]
    statPoints.value[s.key] = 0
  })
}

// NOTE: 装备总览 = 真实穿戴（pack.equipped），与装备/强化/升星面板同源，不再读静态 gearSlots
interface EquipOverviewRow {
  slot: string
  item: string
  rarity: number
  enhance: number
}
const equippedGear = computed<EquipOverviewRow[]>(() =>
  (Object.keys(GEAR_SLOT_LABELS) as GearSlotKey[])
    .filter((slot) => pack.equippedGear(slot))
    .map((slot) => {
      const g = pack.equippedGear(slot)!
      return {
        slot: GEAR_SLOT_LABELS[slot],
        item: g.name,
        rarity: g.rarity,
        enhance: pack.equippedInstance(slot)?.enhance ?? 0,
      }
    }),
)
</script>

<style scoped lang="scss">
.xy-character-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.xy-char-header {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
}

.xy-char-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.xy-char-name-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.xy-char-name {
  
  font-size: var(--font-size-xl);
  letter-spacing: 2px;
  color: var(--xy-ink-1);
}

.xy-char-level {
  font-size: var(--font-size-md);
  color: var(--xy-gold);
}

.xy-char-title {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-exp-bar {
  position: relative;
  height: 14px;
  margin-top: var(--space-1);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.xy-exp-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--xy-jade), var(--xy-gold));
  transition: width var(--transition-base);
}

.xy-exp-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
  text-shadow: 0 0 2px var(--xy-paper);
}

.xy-section {
  padding: var(--space-3);
  border: 1px solid var(--xy-ink-line);
  background: var(--xy-paper);
  border-radius: 2px;
}

.xy-sec-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--xy-ink-2);
}

.xy-sec-count {
  margin-left: auto;
  font-weight: var(--font-weight-regular);
  color: var(--xy-ink-4);
}

.xy-attr-group {
  margin-bottom: var(--space-3);

  &:last-child {
    margin-bottom: 0;
  }
}

.xy-attr-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--xy-ink-2);
}

.xy-attr-sub--minor {
  margin-top: var(--space-2);
  border-left-color: var(--xy-ink-line);
  font-weight: var(--font-weight-regular);
  color: var(--xy-ink-3);
}

.xy-attr-sub--toggle {
  width: 100%;
  padding: 0 0 var(--space-1) var(--space-2);
  border: none;
  border-left: 3px solid var(--xy-seal);
  background: none;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
}

.xy-attr-caret {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-regular);
  color: var(--xy-ink-4);
}

.xy-attr-item {
  cursor: help;
}

.xy-stat-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.xy-stat-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
}

.xy-stat-label {
  width: 48px;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-ink-1);
}

.xy-stat-desc {
  flex: 1;
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
}

.xy-stat-ctrl {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-stat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--color-bg-secondary);
  color: var(--xy-ink-2);
  cursor: pointer;
  font-size: var(--font-size-md);

  &:hover:not(:disabled) {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.xy-stat-val {
  width: 24px;
  text-align: center;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--xy-gold);
}

.xy-stat-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.xy-btn {
  padding: var(--space-1) var(--space-4);
  border-radius: 2px;
  font-size: var(--font-size-md);
  font-family: inherit;
  letter-spacing: 1px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.xy-btn--primary {
  border: 1px solid var(--xy-seal);
  background: var(--xy-seal);
  color: #fff;
}

.xy-btn--ghost {
  border: 1px solid var(--xy-ink-line);
  background: transparent;
  color: var(--xy-ink-2);
}

.xy-equip-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.xy-equip-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border: 1px dashed var(--xy-ink-line);
  border-radius: 2px;
}

.xy-equip-slot {
  width: 48px;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-equip-name {
  flex: 1;
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);

  em {
    margin-left: var(--space-1);
    font-style: normal;
    color: var(--xy-seal);
  }
}

.xy-link-btn {
  padding: 0;
  border: none;
  background: none;
  font-size: var(--font-size-md);
  font-family: inherit;
  color: var(--xy-seal);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}
</style>
