/**
 * useBuffDisplay.ts — Buff 纯文本显示数据管道
 *
 * 功能：将现有 BuffSystem 的原始条目数据转换为纯文本 UI 所需的格式
 * 原则：不修改现有数据源，仅在展示层做格式转换
 */

import { computed, unref, type ComputedRef, type Ref } from 'vue'
import type {
  BuffTextItem,
  BuffRawItem,
  MergedAttributeLine,
  BuffDisplayState,
  ConditionState,
} from '@/shared/types/buff-display'
import type { BuffEffectLine } from '@/domain/buff/types'
import { ATTRIBUTE_SHORT_NAMES } from '@/presentation/config/attributeNames'

/** 极多 Buff 时次要分组的阈值 */
const SECONDARY_THRESHOLD = 20

/** 已知控制类 Buff 名称关键词（全匹配） */
const CONTROL_NAMES = new Set([
  '眩晕', '沉默', '恐惧', '魅惑', '石化',
  '睡眠', '冰冻', '混乱', '嘲讽', '定身',
  '缴械', '变形', '禁锢',
])

/** 已知条件关键词（description 中匹配） */
const CONDITION_KEYWORDS: Array<{ match: RegExp; label: string }> = [
  { match: /残血|生命.*低于|低血量/i, label: '残血' },
  { match: /满血|生命.*高于|高血量/i, label: '满血' },
  { match: /暴击|暴击后/i, label: '暴击' },
  { match: /闪避|闪避后/i, label: '闪避' },
  { match: /击杀|击败后/i, label: '击杀' },
  { match: /受击|被攻击/i, label: '受击' },
]

/**
 * 检测条件状态
 * 优先使用来自 BuffSystem 的实时 conditionState（由 setBuffConditionState 设置）
 * 回退到从 description 文本中启发式推断
 */
export function detectCondition(
  raw: BuffRawItem,
): { condition: ConditionState; conditionLabel?: string } {
  // 优先使用实例的实时条件状态（由领域层设置）
  if (raw.conditionState === 'active') {
    return { condition: 'active', conditionLabel: '已激活' }
  }
  if (raw.conditionState === 'inactive') {
    const label = matchConditionKeyword(raw.description || '', raw.name || '')
    return { condition: 'inactive', conditionLabel: label ? `${label}·未激活` : '未激活' }
  }

  const description = raw.description || ''
  const name = raw.name || ''
  for (const kw of CONDITION_KEYWORDS) {
    if (kw.match.test(description) || kw.match.test(name)) {
      // ponytail: 无法从纯文本推断条件是否满足，默认按未激活处理
      return { condition: 'inactive', conditionLabel: kw.label }
    }
  }
  return { condition: 'none' }
}

/** 辅助：从文本中匹配条件关键词 */
function matchConditionKeyword(description: string, name: string): string | undefined {
  for (const kw of CONDITION_KEYWORDS) {
    if (kw.match.test(description) || kw.match.test(name)) {
      return kw.label
    }
  }
  return undefined
}

/**
 * 从 isDebuff + name 推断类型
 * 优先使用结构化 controlType 字段，回退到名称关键词匹配
 */
export function detectType(name: string, isDebuff: boolean, controlType?: string): 'buff' | 'debuff' | 'control' {
  // 优先使用结构化字段（新数据走此路径）
  if (controlType && controlType !== 'none' && controlType !== '') {
    return 'control'
  }
  // 回退：名称匹配（兼容无 controlType 的旧数据）
  for (const keyword of CONTROL_NAMES) {
    if (name.includes(keyword)) return 'control'
  }
  return isDebuff ? 'debuff' : 'buff'
}

/**
 * 从 config.attributes 提取属性修正
 * key=attribute code（如 "speed"），value=格式如 "+0.05"（5%/层）或 "+20%"（20%）
 * @param stacks 当前层数，用于缩放可叠加 buff
 */
function extractAttributesFromConfig(
  attributes: Record<string, string>,
  stacks: number,
): Array<{ attr: string; value: number; isFlat?: boolean }> {
  const result: Array<{ attr: string; value: number; isFlat?: boolean }> = []
  for (const [code, valueStr] of Object.entries(attributes)) {
    const cn = ATTRIBUTE_SHORT_NAMES[code]
    if (!cn) continue
    const trimmed = valueStr.trim()
    const isPercent = trimmed.includes('%')
    const numericStr = trimmed.replace('%', '')
    const numValue = parseFloat(numericStr)
    if (isNaN(numValue)) continue

    let perStack: number
    let isFlat: boolean | undefined

    if (isPercent) {
      // "+20%" → 20（百分比点）
      perStack = numValue
      isFlat = undefined
    } else if (Math.abs(numValue) < 1) {
      // "+0.05" → 5（小数转百分比）
      perStack = numValue * 100
      isFlat = undefined
    } else {
      // "+10" → 固定值 10
      perStack = numValue
      isFlat = true
    }
    result.push({ attr: cn, value: Math.round(perStack * stacks), isFlat })
  }
  return result
}

/**
 * 从修饰符列表提取属性名（中文）+ 值
 * ponytail: 使用简单的关键词匹配提取属性，后续可从 config.modifiers 中精确获取
 */
function extractAttributes(
  name: string,
  description: string,
): Array<{ attr: string; value: number }> {
  const result: Array<{ attr: string; value: number }> = []

  // ponytail: 基于名称和描述的启发式提取
  // 格式："攻击↑30%" → +30, "防御↓15%" → -15
  // ↑ 表示增益（正数），↓ 表示减益（负数）
  const pattern = /([\u4e00-\u9fa5]{2,4})([↑↓])(\d+(?:\.\d+)?)%?/g
  let match: RegExpExecArray | null

  const text = `${description} ${name}`
  while ((match = pattern.exec(text)) !== null) {
    const sign = match[2] === '↑' ? 1 : -1
    result.push({ attr: match[1], value: sign * parseInt(match[3]) })
  }

  return result
}

/**
 * 将原始 buff 条目转换为 BuffTextItem
 */
function toBuffTextItem(
  raw: BuffRawItem,
  entityId: string,
): BuffTextItem {
  const name = raw.name
  // ponytail: 当 name 为空时显示兜底文本，防止空标签出现在 UI 中
  const displayName = name || '未知效果'
  const description = raw.description || (name ? name : '无详细说明')
  const isDebuff = raw.isDebuff === true
  const remainingTurns = raw.remainingTurns ?? 0
  const stacks = raw.currentStacks ?? 1

  const type = detectType(displayName, isDebuff, raw.controlType)

  // 检测条件状态——优先使用领域层的 conditionState
  let { condition, conditionLabel } = detectCondition(raw)
  // 永久效果覆盖条件检测
  if (remainingTurns === 0 || description.includes('永久')) {
    condition = 'permanent'
    conditionLabel = undefined
  }

  // 构造修饰符列表 — 优先使用 config.attributes，回退到文本提取
  const extracted = raw.attributes
    ? extractAttributesFromConfig(raw.attributes, stacks)
    : extractAttributes(displayName, description).map((e) => ({
        ...e,
        value: Math.round(e.value * stacks),
      }))
  const modifiers = extracted.map((e) => ({
    sourceName: name,
    attribute: e.attr,
    value: e.value,
    type: 'PERCENTAGE' as const,
    isFlat: e.isFlat,
  }))

  // 传递特殊效果行
  const effectLines: BuffEffectLine[] = raw.effectLines ?? []

  return {
    instanceId: raw.id,
    buffId: raw.buffId ?? raw.id ?? '',
    name: displayName,
    description,
    remainingTurns: condition === 'permanent' ? 0 : remainingTurns,
    stacks,
    type,
    condition,
    conditionLabel,
    isAura: description.includes('全队') || description.includes('光环'),
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
  const attrMap = new Map<string, {
    total: number
    sources: MergedAttributeLine['sources']
    hasFlat: boolean
    hasPercent: boolean
  }>()

  for (const item of items) {
    for (const mod of item.modifiers) {
      if (!attrMap.has(mod.attribute)) {
        attrMap.set(mod.attribute, { total: 0, sources: [], hasFlat: false, hasPercent: false })
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
    // 1. 控制类型排最前
    const aCtrl = a.type === 'control' ? 0 : 1
    const bCtrl = b.type === 'control' ? 0 : 1
    if (aCtrl !== bCtrl) return aCtrl - bCtrl

    // 2. 已激活的排前
    const aActive = a.condition === 'active' ? 0 : 1
    const bActive = b.condition === 'active' ? 0 : 1
    if (aActive !== bActive) return aActive - bActive

    // 3. 剩余回合短的排前（即将到期的优先展示）
    const aTurns = a.remainingTurns > 0 ? a.remainingTurns : Infinity
    const bTurns = b.remainingTurns > 0 ? b.remainingTurns : Infinity
    if (aTurns !== bTurns) return aTurns - bTurns

    // 4. 增益优先于减益
    const aBuff = a.type === 'debuff' ? 1 : 0
    const bBuff = b.type === 'debuff' ? 1 : 0
    if (aBuff !== bBuff) return aBuff - bBuff

    // 5. 按名称字母序
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
  baseAttributes?: Record<string, number> | ComputedRef<Record<string, number>> | Ref<Record<string, number>>,
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
        secondaryGroups: [],
      }
    }

    // 1. 转换为标准格式
    const items = raw.map((item) => toBuffTextItem(item, entityId))

    // 2. 排序
    const sorted = sortItems(items)

    // 3. 分类：控制 vs 非控制
    const controlItems = sorted.filter((i) => i.type === 'control')
    const nonControlItems = sorted.filter((i) => i.type !== 'control')

    // 4. 合并属性标签
    const mergedAll = mergeAttributes(sorted, base)
    const mergedLabels = sortLabels(mergedAll.filter((l) => l.isChanged))

    // 5. 计算折叠数量与可见属性标签
    const visibleAttrSlots = Math.max(0, collapseThreshold - controlItems.length)
    const visibleAttrLabels = mergedLabels.slice(0, visibleAttrSlots)
    // ponytail: collapsedCount 只计实际隐藏的属性标签数，不包括一直全显的控制标签
    const collapsedCount = Math.max(0, mergedLabels.length - visibleAttrSlots)

    // 6. 为展开面板准备分组 — 极多 Buff 时拆分次要分组
    let groups: BuffTextItem[] = sorted
    let secondaryGroups: BuffTextItem[] = []

    if (sorted.length > SECONDARY_THRESHOLD) {
      // ponytail: 次要分组包含：非控制 + 长时长（>=5回合或永久）+ 未激活条件
      // 优先保留控制类、短时长（<5回合）、已激活条件
      const primary: BuffTextItem[] = []
      const secondary: BuffTextItem[] = []
      for (const item of sorted) {
        const isLongDuration = item.remainingTurns === 0 || item.remainingTurns >= 5
        const isInactiveCondition = item.condition === 'inactive'
        if (item.type === 'control') {
          primary.push(item)
        } else if (item.condition === 'active') {
          primary.push(item)
        } else if (isLongDuration || isInactiveCondition) {
          secondary.push(item)
        } else {
          primary.push(item)
        }
      }
      groups = primary
      secondaryGroups = secondary
    }
    const result = {
      items,
      mergedLabels,
      visibleAttrLabels,
      controlLabels: controlItems,
      collapsedCount,
      groups,
      secondaryGroups,
    }
    return result
  })
}

/**
 * 获取纯文本显示颜色类名
 */
export function getBuffColorClass(
  type: 'buff' | 'debuff' | 'control',
  condition?: ConditionState,
): string {
  if (condition === 'inactive') return 'buff-text--inactive'
  if (condition === 'permanent') return 'buff-text--permanent'

  switch (type) {
    case 'buff': return 'buff-text--buff'
    case 'debuff': return 'buff-text--debuff'
    case 'control': return 'buff-text--control'
  }
}

/**
 * 格式化属性值：正数带 + 前缀
 */
export function formatBuffPercent(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${Math.round(value)}%`
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
 */
export function getConditionLabel(condition: ConditionState, customLabel?: string): string {
  if (condition === 'active') return '已激活'
  if (condition === 'inactive') return customLabel ? `${customLabel}·未激活` : '未激活'
  if (condition === 'permanent') return '永久'
  return ''
}
