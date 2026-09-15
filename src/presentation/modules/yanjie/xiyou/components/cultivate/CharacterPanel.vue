<template>
  <div class="xy-character-panel">
    <!-- 左列：属性面板（吃剩余宽度，属性网格双列铺开） -->
    <div class="xy-col xy-col--main">
      <section class="xy-section">
        <h4 class="xy-sec-title">
          属性面板<span class="xy-sec-count">已激活 {{ attrActiveCount }} / {{ attrTotal }} 项</span>
        </h4>

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
              <span class="xy-attr-value" :class="valueClass(item)">{{ attrText(item) }}</span>
            </div>
          </div>
        </div>

        <div class="xy-attr-group">
          <button type="button" class="xy-attr-sub xy-attr-sub--toggle" :aria-expanded="advancedExpanded"
            @click="advancedExpanded = !advancedExpanded">
            <span class="xy-attr-caret" :class="{ 'xy-attr-caret--open': advancedExpanded }" aria-hidden="true"></span>
            <span>进阶属性</span>
            <span class="xy-sec-count">共 {{ advancedCount }} 项</span>
          </button>
          <template v-if="advancedExpanded">
            <div v-for="group in advancedGroupList" :key="group.key" class="xy-attr-sub-group">
              <button type="button" class="xy-attr-sub xy-attr-sub--minor xy-attr-sub--toggle" :aria-expanded="expandedGroups.has(group.key)"
                @click="toggleGroup(group.key)">
                <span class="xy-attr-caret xy-attr-caret--minor" :class="{ 'xy-attr-caret--open': expandedGroups.has(group.key) }" aria-hidden="true"></span>
                <span>{{ group.label }}</span>
                <span class="xy-sec-count">{{ group.attrs.length }} 项</span>
              </button>
              <div v-if="expandedGroups.has(group.key)" class="xy-attr-grid" @mouseleave="hideAttrTooltip">
                <div class="xy-attr-item" v-for="item in group.attrs" :key="item.code"
                  @mouseenter="showAttrTooltip($event, item.code, attrVal(item.code))" @mousemove="updateTooltipPosition">
                  <span class="xy-attr-label">{{ item.displayName }}</span>
                  <span class="xy-attr-value" :class="valueClass(item)">{{ attrText(item) }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>

    <!-- 右列：角色卡 + 加点 + 装备总览 -->
    <div class="xy-col xy-col--side">
      <section class="xy-section xy-char-header">
        <div class="xy-char-name-row">
          <span class="xy-char-name">{{ player.name }}</span>
          <span class="xy-char-level">Lv.{{ player.level }}</span>
        </div>
        <p class="xy-char-title">{{ player.title }}</p>
        <div class="xy-vital-bar" role="img" :aria-label="`气血 ${player.hp}/${player.maxHp}`">
          <div class="xy-vital-fill xy-vital-fill--hp" :style="{ width: hpPct + '%' }"></div>
          <span class="xy-vital-text">{{ player.hp }} / {{ player.maxHp }}</span>
        </div>
        <div class="xy-vital-bar" role="img" :aria-label="`能量 ${player.energy}/${player.maxEnergy}`">
          <div class="xy-vital-fill xy-vital-fill--energy" :style="{ width: energyPct + '%' }"></div>
          <span class="xy-vital-text">{{ player.energy }} / {{ player.maxEnergy }}</span>
        </div>
        <div class="xy-vital-bar xy-vital-bar--exp" role="img" :aria-label="`经验 ${player.exp}/${player.expNeed}`">
          <div class="xy-vital-fill xy-vital-fill--exp" :style="{ width: expPct + '%' }"></div>
          <span class="xy-vital-text">经验 {{ player.exp }} / {{ player.expNeed }}</span>
        </div>
        <div class="xy-char-meta">
          <span class="xy-coin">金钱 {{ currency.money }}</span>
          <span class="xy-coin">灵韵 {{ currency.xianyuan }}</span>
          <span class="xy-coin">流派 {{ currentSchoolName }}</span>
        </div>
      </section>

      <section class="xy-section">
        <h4 class="xy-sec-title">
          角色加点<span class="xy-sec-count" title="每次升级获得的自由属性点">可用属性点 <b class="xy-sec-count--num">{{ statPoints.available }}</b></span>
        </h4>
        <div class="xy-stat-list">
          <div class="xy-stat-row" v-for="stat in statList" :key="stat.key">
            <span class="xy-stat-label">{{ stat.label }}</span>
            <span class="xy-stat-desc">{{ stat.desc }}</span>
            <div class="xy-stat-ctrl">
              <button type="button" class="xy-stat-btn" :aria-label="`减少${stat.label}`" :disabled="statPoints[stat.key] <= 0" @click="decStat(stat.key)">−</button>
              <span class="xy-stat-val">{{ statPoints[stat.key] }}</span>
              <button type="button" class="xy-stat-btn xy-stat-btn--inc" :aria-label="`增加${stat.label}`" :disabled="statPoints.available <= 0" @click="incStat(stat.key)">＋</button>
            </div>
          </div>
        </div>
        <div class="xy-stat-actions">
          <button type="button" class="xy-btn xy-btn--primary" :disabled="usedPoints === 0" @click="applyStats">分配加点</button>
          <button type="button" class="xy-btn xy-btn--ghost" :disabled="usedPoints === 0" @click="resetStats">重置加点</button>
        </div>
      </section>

      <section class="xy-section">
        <h4 class="xy-sec-title">
          等级突破<span class="xy-sec-count">{{ breakNode ? `已完成 ${player.breakStage}/5 阶` : '五阶圆满' }}</span>
        </h4>
        <template v-if="breakNode">
          <p class="xy-break-desc">
            升至 <b>Lv.{{ breakNode.level }}</b> 需：突破丹·{{ breakNodeCn }} ×1（持有
            <span :class="{ 'xy-break-lack': breakPillCount < 1 }">{{ breakPillCount }}</span>）+ 金钱 {{ breakNode.money }}
          </p>
          <p v-if="!breakLevelReady" class="xy-break-desc">角色达到 Lv.{{ breakNode.level - 1 }} 且经验满溢后可突破。</p>
          <button type="button" class="xy-btn xy-btn--primary" :disabled="!canBreak" @click="doBreak">
            {{ breakLevelReady ? `突破·${breakNodeCn}` : '未达突破等级' }}
          </button>
        </template>
        <p v-else class="xy-break-desc">五阶突破已圆满，境界再无桎梏。</p>
      </section>

      <section class="xy-section">
        <h4 class="xy-sec-title">
          装备总览<span class="xy-sec-count">已穿 {{ equippedCount }}/6</span>
        </h4>
        <p v-if="equippedCount === 0" class="xy-equip-hint">
          尚未穿戴装备：通关关卡获取掉落，或前往洞府打造后在此穿戴。
        </p>
        <div class="xy-equip-list">
          <div class="xy-equip-row" :class="{ 'xy-equip-row--empty': !row.gear }" v-for="row in gearSlotRows" :key="row.slot">
            <span class="xy-equip-slot">{{ row.slot }}</span>
            <template v-if="row.gear">
              <span class="xy-equip-name">{{ row.gear.name }}<em v-if="row.enhance > 0">+{{ row.enhance }}</em></span>
              <span class="xy-chip" :class="qualityClass(row.gear.rarity)">{{ qualityOf(row.gear.rarity) }}</span>
            </template>
            <span v-else class="xy-equip-name xy-equip-name--empty">未穿戴</span>
          </div>
        </div>
        <button type="button" class="xy-link-btn" @click="emit('goEquip')">前往装备面板</button>
      </section>
    </div>

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
import { getAttributeDisplayConfig, DISPLAY_GROUP_LABELS } from '@/presentation/config/attributeDisplay'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { usePackStore, GEAR_SLOT_LABELS, type GearSlotKey } from '@/presentation/stores/packStore'
import { playerConfig, BREAK_NODES, breakNodeLabel, nextBreakNode } from '../../playerProfile'
import { equipBonuses } from '../../battle'
import { qualityClass, qualityOf } from '../../quality'
import { schools } from '../../xiyouData'

const emit = defineEmits<{ goEquip: [] }>()

const notification = useNotificationStore()

const { player, currency, statPoints, playerAttributes, battleSnapshot } = storeToRefs(usePlayerStore())

const expPct = computed(() => (player.value.expNeed > 0 ? (player.value.exp / player.value.expNeed) * 100 : 0))
const hpPct = computed(() => (player.value.maxHp > 0 ? (player.value.hp / player.value.maxHp) * 100 : 0))
const energyPct = computed(() => (player.value.maxEnergy > 0 ? (player.value.energy / player.value.maxEnergy) * 100 : 0))

// 当前流派（schools 单例的 selected；新档未选流派时显式给出状态而非留白）
const currentSchoolName = computed(() => schools.find((s) => s.selected)?.name ?? '未选定')

/* ── 属性面板（对齐唤灵台「角色监控」：基础/进阶两层分组，元数据驱动 + 悬浮说明） ── */

interface AttrEntry {
  code: ATTRIBUTE_CODE
  displayName: string
  isPercentage: boolean
}

function toEntry(code: ATTRIBUTE_CODE, meta: { displayName: string; isPercentage?: boolean }): AttrEntry {
  return { code, displayName: meta.displayName, isPercentage: !!meta.isPercentage }
}

const EXCLUDED_CORE = new Set<ATTRIBUTE_CODE>([
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
    //       进阶属性（如 armorBreak/lifestealRate），不再当 0 值噪音隐藏；situational（情境增伤、
    //       毒抗等）并入折叠区按组展示；hidden（运行时资源与五行属性）不进面板。
    //       分组轴为属性族（*Bonus/系数/最终值与基础属性同族），非计算层
    if (display.displayTier !== 'advanced' && display.displayTier !== 'situational') continue
    const entry = toEntry(code as ATTRIBUTE_CODE, meta)
    const list = groups[display.group] ?? (groups[display.group] = [])
    list.push(entry)
  }
  return groups
})

// 分组中文名（单一来源 attributeDisplay）；「生命/攻击」与属性名「气血/攻击力」同屏混淆，域内改语义名
const GROUP_LABEL_OVERRIDES: Record<string, string> = {
  vitality: '生存',
  offense: '输出',
}
const advancedGroupList = computed(() =>
  Object.entries(advancedGroups.value).map(([key, attrs]) => ({
    key,
    label: GROUP_LABEL_OVERRIDES[key] ?? DISPLAY_GROUP_LABELS[key as keyof typeof DISPLAY_GROUP_LABELS] ?? key,
    attrs,
  })),
)

const advancedExpanded = ref(false)

// 子组二级折叠：默认只展开有非零值的组（新手期 0 值组不铺开），展开状态随后续手动操作
const expandedGroups = ref(new Set<string>())

const advancedCount = computed(() =>
  Object.values(advancedGroups.value).reduce((sum, list) => sum + list.length, 0),
)
// 属性加成（*Bonus）已通过展示配置归入进阶区属性族分组，此处 attrTotal 已含
const attrTotal = computed(() => 2 + coreAttrs.value.length + advancedCount.value)

// 「已激活」= 值 > 0 的展示项（对玩家有意义的元信息，替代无感的总项数）
const attrActiveCount = computed(() => {
  let count = 0
  if (attrVal(ATTRIBUTE_CODE.currentHealth) > 0) count++
  if (attrVal(ATTRIBUTE_CODE.maxEnergy) > 0) count++
  for (const item of coreAttrs.value) if (attrVal(item.code) > 0) count++
  for (const group of advancedGroupList.value) for (const item of group.attrs) if (attrVal(item.code) > 0) count++
  return count
})

const hpText = computed(() => `${attrVal(ATTRIBUTE_CODE.currentHealth)}/${attrVal(ATTRIBUTE_CODE.maxHealth)}`)
const energyText = computed(() => `${attrVal(ATTRIBUTE_CODE.currentEnergy)}/${attrVal(ATTRIBUTE_CODE.maxEnergy)}`)

// NOTE: 装备加成与战斗主角同口径（BattleZen.initBattle / BattleRoster 均 equipBonuses(equippedStats, battleSnapshot)），
//       面板数值 = 实时快照（基础+加点+流派）+ 已穿戴装备词缀增量，否则面板与战斗数值不同源
const pack = usePackStore()
const gearBonus = computed(() => equipBonuses(pack.equippedStats(), battleSnapshot.value))

function attrVal(code: ATTRIBUTE_CODE): number {
  return (playerAttributes.value[code] ?? getAttrDv(code)) + (gearBonus.value[code] ?? 0)
}

// 子组默认展开态依赖 attrVal（含装备加成），须在 gearBonus 就绪后初始化
for (const [group, list] of Object.entries(advancedGroups.value)) {
  if (list.some((item) => attrVal(item.code) > 0)) expandedGroups.value.add(group)
}

function toggleGroup(group: string) {
  const next = new Set(expandedGroups.value)
  if (next.has(group)) next.delete(group)
  else next.add(group)
  expandedGroups.value = next
}

function attrText(item: AttrEntry): string {
  return attrVal(item.code) + (item.isPercentage ? '%' : '')
}

/** 零值弱化 + 百分比标记（0 值灰化后百分比金标只剩噪音，统一交由 zero 类表达「无」） */
function valueClass(item: AttrEntry): Record<string, boolean> {
  return {
    'xy-attr-value--pct': item.isPercentage && attrVal(item.code) > 0,
    'xy-attr-value--zero': attrVal(item.code) <= 0,
  }
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

// SAP 六维自由点（《玩家数值体系构建计划.md》D1）：转化率读 player.json statBonuses，展示不硬编码
const STAT_DEFS = [
  { key: 'hp', label: '气血', attr: 'maxHealth' },
  { key: 'atk', label: '攻击', attr: 'attack' },
  { key: 'def', label: '防御', attr: 'defense' },
  { key: 'hit', label: '命中', attr: 'hitValue' },
  { key: 'dodge', label: '闪避', attr: 'dodgeValue' },
  { key: 'speed', label: '速度', attr: 'speed' },
] as const

type StatKey = (typeof STAT_DEFS)[number]['key']

/** 每级自由点（player.json freePointsPerLevel） */
const freePointsPerLevel = playerConfig.freePointsPerLevel ?? 4

const statList = STAT_DEFS.map(({ key, label, attr }) => ({
  key,
  label,
  desc: `+${playerConfig.statBonuses[key]?.[attr] ?? 0}/点`,
}))

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
// ═══ 等级突破（§20）：节点丹+金钱扣减在组件层完成，playerStore 不反向依赖 packStore ═══
const breakNode = computed(() => nextBreakNode(player.value.breakStage ?? 0))
const breakNodeCn = computed(() => (breakNode.value ? breakNodeLabel(breakNode.value.stage) : ''))
const breakPillCount = computed(() => (breakNode.value ? pack.countOf(breakNode.value.pillId) : 0))
const breakLevelReady = computed(() => !!breakNode.value && player.value.level >= breakNode.value.level - 1)
const canBreak = computed(
  () => !!breakNode.value && breakLevelReady.value && breakPillCount.value >= 1 && currency.value.money >= (breakNode.value?.money ?? 0),
)

function doBreak(): void {
  const node = breakNode.value
  if (!node || !canBreak.value) return
  pack.removeItem(node.pillId, 1)
  currency.value.money -= node.money
  usePlayerStore().setBreakStage(node.stage)
  notification.toast(`突破·${breakNodeCn.value}成功！解锁 Lv.${node.level}`, 'success')
}
//       只列六件套基础槽——GEAR_SLOT_LABELS 的 artifact/relic（法宝/神器）系统未实装，
//       计入会重现「8/6」计数穿帮，待系统落地后放开。
const BASE_GEAR_SLOTS: GearSlotKey[] = ['weapon', 'armor', 'helmet', 'boots', 'charm', 'glove']

interface EquipOverviewRow {
  slot: string
  gear: { name: string; rarity: number } | null
  enhance: number
}
const gearSlotRows = computed<EquipOverviewRow[]>(() =>
  BASE_GEAR_SLOTS.map((slot) => {
    const g = pack.equippedGear(slot)
    return {
      slot: GEAR_SLOT_LABELS[slot],
      gear: g ? { name: g.name, rarity: g.rarity } : null,
      enhance: pack.equippedInstance(slot)?.enhance ?? 0,
    }
  }),
)
const equippedCount = computed(() => gearSlotRows.value.filter((r) => r.gear).length)
</script>

<style scoped lang="scss">
.xy-character-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: var(--space-4);
  align-items: start;
  max-width: 1440px;
}

@media (max-width: 1280px) {
  .xy-character-panel {
    grid-template-columns: minmax(0, 1fr);
  }
}

.xy-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.xy-char-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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

/* 气血/能量/经验通用条：填充色区分语义（朱砂=气血、青绿=能量、鎏金细条=经验） */
.xy-vital-bar {
  position: relative;
  height: 18px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.xy-vital-bar--exp {
  height: 12px;
}

.xy-vital-fill {
  height: 100%;
  transition: width var(--transition-base);
}

.xy-vital-fill--hp {
  background: linear-gradient(90deg, var(--xy-seal), var(--xy-seal-soft));
}

.xy-vital-fill--energy {
  background: linear-gradient(90deg, var(--xy-jade), var(--xy-jade-soft));
}

.xy-vital-fill--exp {
  background: linear-gradient(90deg, var(--xy-gold), var(--xy-gold-soft));
}

.xy-vital-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-md);
  color: var(--xy-ink-1);
  text-shadow: 0 0 2px var(--xy-paper);
}

.xy-char-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.xy-break-desc {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);

  b {
    color: var(--xy-gold);
  }
}

.xy-break-lack {
  color: var(--xy-seal);
  font-weight: var(--font-weight-bold);
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

.xy-sec-count--num {
  font-weight: var(--font-weight-bold);
  color: var(--xy-gold);
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
  gap: var(--space-1);
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--xy-seal);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--xy-ink-2);
}

.xy-attr-sub--minor {
  border-left-color: var(--xy-ink-line);
  font-weight: var(--font-weight-regular);
  color: var(--xy-ink-3);
}

/* 折叠开关：整行可点 + CSS 三角指示（矢量字符 ▶ 属控制符号被禁，用 border 绘制） */
.xy-attr-sub--toggle {
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border: none;
  border-left: 3px solid var(--xy-seal);
  background: none;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--xy-paper-light);
  }

  &.xy-attr-sub--minor {
    border-left-color: var(--xy-ink-line);

    &:hover {
      background: var(--xy-paper-light);
    }
  }
}

.xy-attr-caret {
  width: 0;
  height: 0;
  flex-shrink: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-left: 6px solid var(--xy-ink-4);
  transition: transform var(--transition-fast);
}

.xy-attr-caret--minor {
  border-left-width: 5px;
  border-top-width: 3px;
  border-bottom-width: 3px;
}

.xy-attr-caret--open {
  transform: rotate(90deg);
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
  gap: var(--space-1);
}

.xy-stat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper-light);
  color: var(--xy-ink-1);
  cursor: pointer;
  font-size: var(--font-size-md);
  line-height: 1;

  &:hover:not(:disabled) {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.xy-stat-btn--inc:hover:not(:disabled) {
  background: var(--xy-seal-soft);
}

.xy-stat-val {
  width: 26px;
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

.xy-equip-hint {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
  color: var(--xy-ink-3);
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

.xy-equip-row--empty {
  opacity: 0.55;
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

.xy-equip-name--empty {
  color: var(--xy-ink-4);
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
