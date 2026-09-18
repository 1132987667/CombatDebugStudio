import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { ATTRIBUTE_CODE, AttributeMetaMap, AttributeValueType, getAttrDv, getAttrMeta } from '@/domain/attribute/types'
import { getAttributeDisplayConfig, DISPLAY_GROUP_LABELS } from '@/presentation/config/attributeDisplay'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'

import { equipBonuses } from './battle'

/* ── 角色属性派生（修行 CharacterPanel / 战斗侧栏 BattleRoster 共用，口径必须同源） ── */

export interface AttrEntry {
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

// 分组中文名（单一来源 attributeDisplay）；「生命/攻击」与属性名「气血/攻击力」同屏混淆，域内改语义名
const GROUP_LABEL_OVERRIDES: Record<string, string> = {
  vitality: '生存',
  offense: '输出',
}

export function useCharacterAttrs() {
  const { playerAttributes, battleSnapshot } = storeToRefs(usePlayerStore())
  const pack = usePackStore()

  // NOTE: 装备加成与战斗主角同口径（BattleZen.initBattle / BattleRoster 均 equipBonuses(equippedStats, battleSnapshot)），
  //       面板数值 = 实时快照（基础+加点+流派）+ 已穿戴装备词缀增量，否则面板与战斗数值不同源
  const gearBonus = computed(() => equipBonuses(pack.equippedStats(), battleSnapshot.value))

  function attrVal(code: ATTRIBUTE_CODE): number {
    return (playerAttributes.value[code] ?? getAttrDv(code)) + (gearBonus.value[code] ?? 0)
  }

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
  for (const [group, list] of Object.entries(advancedGroups.value)) {
    if (list.some((item) => attrVal(item.code) > 0)) expandedGroups.value.add(group)
  }

  function toggleGroup(group: string) {
    const next = new Set(expandedGroups.value)
    if (next.has(group)) next.delete(group)
    else next.add(group)
    expandedGroups.value = next
  }

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

  // 悬浮属性说明（AttributeTooltip 全局组件）
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

  return {
    coreAttrs,
    advancedGroupList,
    advancedExpanded,
    expandedGroups,
    toggleGroup,
    advancedCount,
    attrTotal,
    attrActiveCount,
    hpText,
    energyText,
    attrVal,
    attrText,
    valueClass,
    attrTooltip,
    showAttrTooltip,
    updateTooltipPosition,
    hideAttrTooltip,
  }
}
