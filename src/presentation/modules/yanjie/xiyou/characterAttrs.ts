import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { ATTRIBUTE_CODE, AttributeMetaMap, AttributeValueType, getAttrDv, getAttrMeta } from '@/domain/attribute/types'
import type { Modifier } from '@/domain/attribute/types'
import { ModifierSourceType, ModifierType } from '@/domain/attribute/types'
import { getAttributeDisplayConfig, DISPLAY_GROUP_LABELS } from '@/presentation/config/attributeDisplay'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { round } from '@/shared/utils/math'

import { computePlayerBase, computeStatBonuses, playerConfig } from './playerProfile'
import { schoolAttributeBonuses, treeAttrLayers, gearAttrLayers, equipBonuses } from './battle'
import { LAYERED_ATTR_TO_MAIN } from '@/shared/utils/attributeSync'
import { schools } from './xiyouData'

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

export interface CharacterAttrsOptions {
  /** 进阶属性默认全展开（修行页宽栏用；战斗侧栏窄，保持折叠） */
  expandAll?: boolean
}

export function useCharacterAttrs(options: CharacterAttrsOptions = {}) {
  const { player, playerAttributes, statPoints, battleSnapshot } = storeToRefs(usePlayerStore())
  const pack = usePackStore()

  // NOTE: 装备加成与战斗主角同口径（BattleZen.initBattle / BattleRoster 均 equipBonuses(equippedStats, battleSnapshot)），
  //       面板数值 = 实时快照（基础+加点+流派+树乘区）+ 已穿戴装备词缀增量，否则面板与战斗数值不同源
  const gearBonus = computed(() => equipBonuses(pack.equippedStats(), battleSnapshot.value))

  /** 六维主属性集合（LAYERED_ATTR_TO_MAIN 的值域 main；注意键域是加成/系数码，不可直接用 code 查键） */
  const LAYERED_MAINS: Set<ATTRIBUTE_CODE> = new Set(
    Object.values(LAYERED_ATTR_TO_MAIN).map((l) => l.main),
  )

  /** 六维：快照(已含树乘区) + 装备直加(词条flat+数值词条换算),再乘装备乘区(加成L2/系数L3,多个乘区单独相乘,同文档四层模型) */
  function sixAttrVal(code: ATTRIBUTE_CODE): number {
    const snap = playerAttributes.value[code] ?? getAttrDv(code)
    // gearBonus[code] = 装备 flat 直加 + 主属性数值 percent 词条换算值（不含 bonus/coef 乘区键）
    const gearBase = gearBonus.value[code] ?? 0
    const gear = gearAttrLayers(pack.equippedStats(), code)
    return Math.round((snap + gearBase) * (1 + gear.bonus / 100) * (1 + gear.coefficient / 100))
  }

  function attrVal(code: ATTRIBUTE_CODE): number {
    if (LAYERED_MAINS.has(code)) return sixAttrVal(code)
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

  const advancedExpanded = ref(!!options.expandAll)

  // 子组二级折叠：expandAll 时全展开；否则默认只展开有非零值的组（新手期 0 值组不铺开）
  const expandedGroups = ref(new Set<string>())
  for (const [group, list] of Object.entries(advancedGroups.value)) {
    if (options.expandAll || list.some((item) => attrVal(item.code) > 0)) expandedGroups.value.add(group)
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

  // 悬浮属性说明（AttributeTooltip 全局组件；modifiers = 来源分解，见 buildAttrModifiers）
  const attrTooltip = ref({
    visible: false,
    title: '',
    finalValue: 0,
    valueType: AttributeValueType.VALUE as AttributeValueType,
    attributeCode: '' as string,
    triggerRect: null as DOMRect | null,
    modifiers: [] as Modifier[],
  })

  /** 属性码 → 玩家成长字段映射（computePlayerBase 键；等级成长只覆盖这些属性，缺省 = 无成长层） */
  const PLAYER_BASE_KEY: Partial<Record<ATTRIBUTE_CODE, keyof ReturnType<typeof computePlayerBase>>> = {
    [ATTRIBUTE_CODE.maxHealth]: 'maxHp',
    [ATTRIBUTE_CODE.maxEnergy]: 'maxEnergy',
    [ATTRIBUTE_CODE.attack]: 'attackMax',
    [ATTRIBUTE_CODE.defense]: 'defense',
    [ATTRIBUTE_CODE.speed]: 'speed',
    [ATTRIBUTE_CODE.critRate]: 'critRate',
    [ATTRIBUTE_CODE.critDamage]: 'critDamage',
    [ATTRIBUTE_CODE.hitRate]: 'hitRate',
    [ATTRIBUTE_CODE.dodgeRate]: 'dodgeRate',
    [ATTRIBUTE_CODE.hitValue]: 'hitValue',
    [ATTRIBUTE_CODE.dodgeValue]: 'dodgeValue',
  }

  /**
   * 属性值来源分解（悬浮「来源明细 + 计算过程」的数据侧，《属性监控显示设计.md》四层模型）：
   * 基础数值层（ADDITIVE）：基础(1级) → 等级成长 → 加点 → 流派 → 流派树 → 装备；
   * 属性加成层（PERCENTAGE，L2）：流派树加成节点 + 装备加成词条；
   * 独立乘区层（MULTIPLICATIVE，L3）：流派树系数节点 + 装备系数词条。
   * 多个乘区单独相乘，禁止折算合并；运行时状态（当前气血/法力/护盾）不分解，单列当前值。
   */
  function buildAttrModifiers(code: ATTRIBUTE_CODE): Modifier[] {
    const mk = (sourceType: ModifierSourceType, sourceKey: string, value: number, type: ModifierType, description?: string): Modifier => ({
      sourceKey,
      sourceType,
      attribute: code,
      value,
      type,
      description,
    })
    if (AttributeMetaMap[code]?.isRuntimeState) {
      return [mk(ModifierSourceType.BASE, 'runtime', attrVal(code), ModifierType.ADDITIVE, '运行时状态')]
    }

    // ── 六维主属性：按四层模型正推（快照六维已乘树乘区，差值倒推失效） ──
    const isLayeredMain = Object.values(LAYERED_ATTR_TO_MAIN).some((l) => l.main === code)
    const key = PLAYER_BASE_KEY[code]
    if (isLayeredMain && key) {
      const baseVal = computePlayerBase(1)[key]
      const levelVal = computePlayerBase(player.value.level)[key] - baseVal
      const bonus = computeStatBonuses(statPoints.value)
      const pointVal = bonus[code] ?? 0
      // 流派属性绝对增量（schoolAttributeBonuses 输入与 playerStore 同口径：四维含加点）
      const leveled = computePlayerBase(player.value.level)
      const schoolAbs = schoolAttributeBonuses({
        attack: leveled.attackMax + (bonus[ATTRIBUTE_CODE.attack] ?? 0),
        defense: leveled.defense + (bonus[ATTRIBUTE_CODE.defense] ?? 0),
        speed: leveled.speed + (bonus[ATTRIBUTE_CODE.speed] ?? 0),
        maxHp: leveled.maxHp + (bonus[ATTRIBUTE_CODE.maxHealth] ?? 0),
      })[code] ?? 0
      const tree = treeAttrLayers(code)
      // 装备直加 = gearBonus[code]（词条 flat + 主属性数值 percent 词条换算,与 sixAttrVal 同源）
      const gearBase = gearBonus.value[code] ?? 0
      const gear = gearAttrLayers(pack.equippedStats(), code)
      const schoolName = schools.find((s) => s.selected)?.name

      const additive = [
        { t: ModifierSourceType.BASE, k: 'base', v: baseVal, d: undefined as string | undefined },
        { t: ModifierSourceType.LEVEL, k: 'level', v: levelVal, d: `Lv.${player.value.level}` },
        { t: ModifierSourceType.POINT, k: 'point', v: pointVal, d: '自由加点' },
        { t: ModifierSourceType.SCHOOL, k: 'school', v: schoolAbs, d: schoolName },
        { t: ModifierSourceType.SCHOOL, k: 'tree', v: tree.flat, d: '流派树' },
        { t: ModifierSourceType.EQUIPMENT, k: 'gear', v: gearBase, d: undefined },
      ].filter((it) => Math.abs(it.v) > 1e-9)
      const pctLayer = [
        { t: ModifierSourceType.SCHOOL, k: 'tree-bonus', v: tree.bonus, d: '流派树加成' },
        { t: ModifierSourceType.EQUIPMENT, k: 'gear-bonus', v: gear.bonus, d: '词条加成' },
      ].filter((it) => Math.abs(it.v) > 1e-9)
      const coefLayer = [
        { t: ModifierSourceType.SCHOOL, k: 'tree-coef', v: tree.coefficient, d: '流派树系数' },
        { t: ModifierSourceType.EQUIPMENT, k: 'gear-coef', v: gear.coefficient, d: '词条系数' },
      ].filter((it) => Math.abs(it.v) > 1e-9)
      const mods = [
        ...additive.map((it) => mk(it.t, it.k, it.v, ModifierType.ADDITIVE, it.d)),
        ...pctLayer.map((it) => mk(it.t, it.k, it.v, ModifierType.PERCENTAGE, it.d)),
        ...coefLayer.map((it) => mk(it.t, it.k, it.v, ModifierType.MULTIPLICATIVE, it.d)),
      ]
      return mods.length > 0 ? mods : [mk(ModifierSourceType.BASE, 'base', 0, ModifierType.ADDITIVE)]
    }

    // ── 非乘区属性：加法模型（配置基础 + 流派差值 + 装备） ──
    const baseVal = key ? computePlayerBase(1)[key] : Number((playerConfig.base as Record<string, number>)[code] ?? 0)
    const levelVal = key ? computePlayerBase(player.value.level)[key] - baseVal : 0
    const pointVal = computeStatBonuses(statPoints.value)[code] ?? 0
    const gearStats = pack.equippedStats()
    const gearFlatVal = gearStats
      .filter((s) => s.attribute === code && s.modifierType === 'flat')
      .reduce((sum, s) => sum + s.value, 0)
    const gearPctVal = (gearBonus.value[code] ?? 0) - gearFlatVal
    const schoolVal = round((playerAttributes.value[code] ?? getAttrDv(code)) - baseVal - levelVal - pointVal, 6)
    const items = [
      { t: ModifierSourceType.BASE, k: 'base', v: baseVal, d: undefined as string | undefined },
      { t: ModifierSourceType.LEVEL, k: 'level', v: levelVal, d: `Lv.${player.value.level}` },
      { t: ModifierSourceType.POINT, k: 'point', v: pointVal, d: '自由加点' },
      { t: ModifierSourceType.SCHOOL, k: 'school', v: schoolVal, d: schools.find((s) => s.selected)?.name },
      { t: ModifierSourceType.EQUIPMENT, k: 'gear', v: gearFlatVal, d: undefined },
      { t: ModifierSourceType.EQUIPMENT, k: 'gear-affix', v: gearPctVal, d: '词条加成' },
    ].filter((it) => Math.abs(it.v) > 1e-9)
    if (items.length === 0) return [mk(ModifierSourceType.BASE, 'base', 0, ModifierType.ADDITIVE)]
    return items.map((it) => mk(it.t, it.k, it.v, ModifierType.ADDITIVE, it.d))
  }

  function showAttrTooltip(event: MouseEvent, code: ATTRIBUTE_CODE, value: number) {
    const meta = getAttrMeta(code)
    attrTooltip.value = {
      visible: true,
      title: meta?.displayName ?? code,
      finalValue: value,
      valueType: meta?.isPercentage ? AttributeValueType.PERCENT : AttributeValueType.VALUE,
      attributeCode: code,
      triggerRect: (event.currentTarget as HTMLElement).getBoundingClientRect(),
      modifiers: buildAttrModifiers(code),
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
