/**
 * useBuffDisplay.ts — Buff 纯文本显示数据管道
 *
 * 功能：将现有 BuffSystem 的原始条目数据转换为纯文本 UI 所需的格式
 * 原则：不修改现有数据源，仅在展示层做格式转换
 */

import { computed, unref, type ComputedRef, type Ref } from 'vue'
import {
  BuffTextItem,
  BuffRawItem,
  MergedAttributeLine,
  BuffDisplayState,
  ConditionState,
  ConditionStateNames,
} from '@/shared/types/buff-display'
import type { ConditionState as ConditionStateType } from '@/shared/types/buff-display'
import type { BuffEffectLine } from '@/domain/buff/types'
import { getAttrName, ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import type { AttributeValueConfig } from '@/shared/types/buffs-json'

/** 极多 Buff 时次要分组的阈值 */
const SECONDARY_THRESHOLD = 20

/**
 * 从 config.attributes 提取属性修正
 * key=attribute code（如 "speed"），value=显式声明的 { value, type } 对象（如 { value: 5, type: "PERCENTAGE" }）
 * @param stacks 当前层数，用于缩放可叠加 buff
 */
function extractAttributesFromConfig(
  attributes: Record<ATTRIBUTE_CODE, AttributeValueConfig>,
  stacks: number,
): Array<{ attr: string; value: number; isFlat?: boolean }> {
  const result: Array<{ attr: string; value: number; isFlat?: boolean }> = []
  for (const [code, cfg] of Object.entries(attributes)) {
    const cn = getAttrName(code as ATTRIBUTE_CODE)
    if (!cn) continue
    // value 语义由配置显式声明：PERCENTAGE 为百分比点，ADDITIVE 为固定值
    const isFlat = cfg.type === 'ADDITIVE' ? true : undefined
    // perStack=false 的修饰符叠层不放大（与 ModifierEffect 语义一致），否则 × 层数
    const scaled = cfg.perStack === false ? cfg.value : cfg.value * stacks
    result.push({ attr: cn, value: Math.round(scaled), isFlat })
  }
  return result
}

/**
 * 检测 Buff 的条件状态 — 通过结构化 conditionState 决定
 * conditionState 缺失时视为无条件(NONE)
 * 条件标签（如 "残血"）由配置显式声明（conditionLabel），不做正则解析
 */
export function detectCondition(raw: {
  conditionState?: string
  description?: string
  remainingTurns?: number
  conditionLabel?: string
}): { condition: ConditionStateType; conditionLabel?: string } {
  // 优先级 1: 领域层结构化 conditionState
  if (raw.conditionState) {
    if (raw.conditionState === ConditionState.ACTIVE) {
      return { condition: ConditionState.ACTIVE, conditionLabel: '已激活' }
    }
    if (raw.conditionState === ConditionState.INACTIVE) {
      const label = raw.conditionLabel
      return {
        condition: ConditionState.INACTIVE,
        conditionLabel: label ? `${label}·${ConditionStateNames[ConditionState.INACTIVE]}` : ConditionStateNames[ConditionState.INACTIVE],
      }
    }
    if (raw.conditionState === ConditionState.PERMANENT) {
      return { condition: ConditionState.PERMANENT, conditionLabel: '永久' }
    }
    if (raw.conditionState === ConditionState.NONE) {
      return { condition: ConditionState.NONE }
    }
  }

  // conditionState 必须由调用方提供，缺失即视为无条件
  return { condition: ConditionState.NONE }
}

/**
 * 将原始 buff 条目转换为 BuffTextItem
 */
function toBuffTextItem(raw: BuffRawItem, entityId: string): BuffTextItem {
  const name = raw.name
  // ponytail: 当 name 为空时显示兜底文本，防止空标签出现在 UI 中
  const displayName = name || '未知效果'
  const description = raw.description || (name ? name : '无详细说明')
  const isNegative = raw.isNegative === true
  const remainingTurns = raw.remainingTurns ?? 0
  const stacks = raw.currentStacks ?? 1

  // 条件状态 — 使用 detectCondition 统一处理（结构化 → 显式 conditionLabel）
  const { condition, conditionLabel } = detectCondition({
    conditionState: raw.conditionState,
    description,
    remainingTurns,
    conditionLabel: raw.conditionLabel,
  })

  // 构造修饰符列表 — 从 config.attributes 提取
  const extracted = extractAttributesFromConfig(raw.attributes ?? {} as Record<ATTRIBUTE_CODE, AttributeValueConfig>, stacks)
  const modifiers = extracted.map((e) => ({
    sourceName: name,
    attribute: e.attr,
    value: e.value,
    // isFlat → ADDITIVE（固定数值修正），否则 → PERCENTAGE（百分比修正）
    type: e.isFlat ? ModifierType.ADDITIVE : ModifierType.PERCENTAGE,
    isFlat: e.isFlat,
  }))

  // 传递特殊效果行
  const effectLines: BuffEffectLine[] = raw.effectLines ?? []

  return {
    instanceId: raw.id,
    buffId: raw.buffId ?? raw.id ?? '',
    name: displayName,
    description,
    remainingTurns: condition === ConditionState.PERMANENT ? 0 : remainingTurns,
    stacks,
    isNegative,
    controlType: raw.controlType,
    condition,
    conditionLabel,
    isAura: raw.isAura,
    modifiers,
    effectLines,
    ownerId: entityId,
    scriptName: raw.scriptName,
    configKey: raw.buffId,
  }
}

/**
 * 合并同一属性的多来源
 * mod.value 已带符号：正=增益，负=减益
 * @param baseValues 可选的基础属性值映射（key=中文属性名，如 "攻击"）
 */
export function mergeAttributes(
  items: BuffTextItem[],
  baseValues?: Record<string, number>,
): MergedAttributeLine[] {
  const attrMap = new Map<
    string,
    {
      total: number
      sources: MergedAttributeLine['sources']
      hasFlat: boolean
      hasPercent: boolean
    }
  >()

  for (const item of items) {
    for (const mod of item.modifiers) {
      if (!attrMap.has(mod.attribute)) {
        attrMap.set(mod.attribute, {
          total: 0,
          sources: [],
          hasFlat: false,
          hasPercent: false,
        })
      }
      const entry = attrMap.get(mod.attribute)!
      entry.total += mod.value
      entry.sources.push({
        buffName: item.name,
        percent: mod.value,
        remainingTurns: item.remainingTurns,
        isPermanent: item.remainingTurns === 0,
        stacks: item.stacks,
      })
      if (mod.isFlat) {
        entry.hasFlat = true
      } else {
        entry.hasPercent = true
      }
    }
  }

  return Array.from(attrMap.entries()).map(([attribute, data]) => ({
    attribute,
    totalPercent: data.total,
    isChanged: data.total !== 0,
    // 仅当所有来源都是 flat 时标记为 flat；混合情况按百分比显示
    isFlat: data.hasFlat && !data.hasPercent,
    baseValue: baseValues?.[attribute],
    sources: data.sources,
  }))
}

/**
 * 排序函数
 */
export function sortItems(items: BuffTextItem[]): BuffTextItem[] {
  return [...items].sort((a, b) => {
    // 1. 条件已激活（active）排最前 — 效果正在生效，需要关注
    const aActive = a.condition === ConditionState.ACTIVE ? 0 : 1
    const bActive = b.condition === ConditionState.ACTIVE ? 0 : 1
    if (aActive !== bActive) return aActive - bActive

    // 2. 控制类型排次前
    const aCtrl = a.controlType && a.controlType !== 'none' ? 0 : 1
    const bCtrl = b.controlType && b.controlType !== 'none' ? 0 : 1
    if (aCtrl !== bCtrl) return aCtrl - bCtrl

    // 3. 条件未激活（inactive）排最后 — 条件未满足，效果暂不生效
    const aInactive = a.condition === ConditionState.INACTIVE ? 1 : 0
    const bInactive = b.condition === ConditionState.INACTIVE ? 1 : 0
    if (aInactive !== bInactive) return aInactive - bInactive

    // 4. 剩余回合短的排前（即将到期的优先展示）
    const aTurns = a.remainingTurns > 0 ? a.remainingTurns : Infinity
    const bTurns = b.remainingTurns > 0 ? b.remainingTurns : Infinity
    if (aTurns !== bTurns) return aTurns - bTurns

    // 5. 增益优先于减益
    const aBuff = a.isNegative ? 1 : 0
    const bBuff = b.isNegative ? 1 : 0
    if (aBuff !== bBuff) return aBuff - bBuff

    // 6. 按名称字母序
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

/**
 * 排序属性标签
 */
function sortLabels(labels: MergedAttributeLine[]): MergedAttributeLine[] {
  return [...labels].sort((a, b) => {
    // 增益排前
    if (a.totalPercent > 0 && b.totalPercent <= 0) return -1
    if (a.totalPercent <= 0 && b.totalPercent > 0) return 1
    // 绝对值大的排前
    return Math.abs(b.totalPercent) - Math.abs(a.totalPercent)
  })
}

/**
 * Buff 纯文本显示 Composable
 *
 * @param rawItems — ParticipantCard.vue 中 buffListItems 的计算结果 (Ref 或 ComputedRef)
 * @param entityId — 参与者 ID
 * @param collapseThreshold — 折叠阈值，默认 5
 * @param baseAttributes — 可选的基础属性值映射，key=中文属性名（如 "攻击"→100）
 */
export function useBuffDisplay(
  rawItems: Ref<BuffRawItem[]> | ComputedRef<BuffRawItem[]>,
  entityId: string,
  collapseThreshold: number = 5,
  baseAttributes?:
    | Record<string, number>
    | ComputedRef<Record<string, number>>
    | Ref<Record<string, number>>,
): ComputedRef<BuffDisplayState> {
  return computed(() => {
    const raw = rawItems.value
    const base = baseAttributes ? unref(baseAttributes) : undefined
    if (!raw || raw.length === 0) {
      return {
        items: [],
        mergedLabels: [],
        visibleAttrLabels: [],
        controlLabels: [],
        collapsedCount: 0,
        groups: [],
        longDurationItems: [],
      }
    }

    // 1. 转换为标准格式
    const items = raw.map((item) => toBuffTextItem(item, entityId))

    // 2. 排序
    const sorted = sortItems(items)

    // 3. 分类：控制 vs 非控制
    const controlItems = sorted.filter(
      (i) => i.controlType && i.controlType !== 'none',
    )

    // 4. 合并属性标签
    const mergedAll = mergeAttributes(sorted, base)
    const mergedLabels = sortLabels(mergedAll.filter((l) => l.isChanged))

    // 5. 计算折叠数量与可见属性标签
    const visibleAttrSlots = Math.max(
      0,
      collapseThreshold - controlItems.length,
    )
    const visibleAttrLabels = mergedLabels.slice(0, visibleAttrSlots)
    // ponytail: collapsedCount 只计实际隐藏的属性标签数，不包括一直全显的控制标签
    const collapsedCount = Math.max(0, mergedLabels.length - visibleAttrSlots)

    // 6. 为展开面板准备分组 — 极多 Buff 时拆分长时效果
    let groups: BuffTextItem[] = sorted
    let longDurationItems: BuffTextItem[] = []

    if (sorted.length > SECONDARY_THRESHOLD) {
      // 长时效果分组：非控制的、>=5回合或永久的效果归入长时组
      // 主分组保留：控制类 + 条件已激活 + 短时长（<5回合）效果
      const primary: BuffTextItem[] = []
      const longDur: BuffTextItem[] = []
      for (const item of sorted) {
        const isLongDuration =
          item.condition === ConditionState.PERMANENT ||
          item.remainingTurns >= 5 ||
          item.condition === ConditionState.INACTIVE
        const isControl = item.controlType && item.controlType !== 'none'
        if (isControl || item.condition === ConditionState.ACTIVE) {
          primary.push(item)
        } else if (isLongDuration) {
          longDur.push(item)
        } else {
          primary.push(item)
        }
      }
      groups = primary
      longDurationItems = longDur
    }
    const result = {
      items,
      mergedLabels,
      visibleAttrLabels,
      controlLabels: controlItems,
      collapsedCount,
      groups,
      longDurationItems,
    }
    return result
  })
}

/**
 * 格式化回合数
 */
export function formatRemainingTurns(turns: number): string {
  if (turns <= 0) return '永久'
  return `${turns}回合`
}

/**
 * 获取条件标签文本
 * @param condition 条件状态
 * @param customLabel 自定义标签（如 "残血"），当 condition 为 inactive 时与状态名拼接为 "残血·未激活"
 */
export function getConditionLabel(
  condition: ConditionStateType,
  customLabel?: string,
): string {
  const stateLabel = getConditionStateName(condition)
  if (customLabel && condition === ConditionState.INACTIVE) {
    return `${customLabel}·${stateLabel}`
  }
  return stateLabel
}

/** 获取条件状态的默认显示名 */
function getConditionStateName(condition: ConditionStateType): string {
  switch (condition) {
    case ConditionState.PERMANENT: return '永久'
    case ConditionState.ACTIVE: return '已激活'
    case ConditionState.INACTIVE: return '未激活'
    default: return ''
  }
}
