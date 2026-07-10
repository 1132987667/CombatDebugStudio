/**
 * useBuffDisplay.ts — Buff 纯文本显示数据管道
 *
 * 功能：将现有 BuffSystem 的原始条目数据转换为纯文本 UI 所需的格式
 * 原则：不修改现有数据源，仅在展示层做格式转换
 */

import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  BuffTextItem,
  MergedAttributeLine,
  BuffDisplayState,
  ConditionState,
} from '@/shared/types/buff-display'

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

/** 属性名缩写映射（标准中文本地化） */
const ATTRIBUTE_SHORT_NAMES: Record<string, string> = {
  attack: '攻击',
  defense: '防御',
  speed: '速度',
  critRate: '暴击',
  critDamage: '暴伤',
  damage: '伤害',
  damageReduction: '伤害减免',
  healthBonus: '生命加成',
  attackBonus: '攻击加成',
  defenseBonus: '防御加成',
  speedBonus: '速度加成',
  currentHealth: '生命',
  maxHealth: '生命',
  healing: '受疗',
  hitRate: '命中',
  dodgeRate: '闪避',
  physicalReduction: '物理减免',
  magicReduction: '魔法减免',
}

/**
 * 检测条件状态
 * 从 description 文本中推断条件类型与是否满足
 */
function detectCondition(
  description: string,
  name: string,
): { condition: ConditionState; conditionLabel?: string } {
  for (const kw of CONDITION_KEYWORDS) {
    if (kw.match.test(description) || kw.match.test(name)) {
      // ponytail: 无法从纯文本推断条件是否满足，默认按未激活处理
      // 升级路径：从 BuffSystem 获取 conditionState 字段
      return { condition: 'inactive', conditionLabel: kw.label }
    }
  }
  return { condition: 'none' }
}

/**
 * 从 isDebuff + name 推断类型
 */
function detectType(name: string, isDebuff: boolean): 'buff' | 'debuff' | 'control' {
  // 先检查是否为控制 — 控制优先于 debuff
  for (const keyword of CONTROL_NAMES) {
    if (name.includes(keyword)) return 'control'
  }
  return isDebuff ? 'debuff' : 'buff'
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
  raw: any,
  entityId: string,
): BuffTextItem {
  const name = raw.name || ''
  const description = raw.description || ''
  const isDebuff = raw.isDebuff === true
  const remainingTurns = raw.remainingTurns ?? 0
  const stacks = raw.currentStacks ?? 1

  const type = detectType(name, isDebuff)

  // 检测条件状态
  let { condition, conditionLabel } = detectCondition(description, name)
  // 永久效果覆盖条件检测
  if (remainingTurns === 0 || description.includes('永久')) {
    condition = 'permanent'
    conditionLabel = undefined
  }

  // 构造修饰符列表
  const extracted = extractAttributes(name, description)
  const modifiers = extracted.map((e) => ({
    sourceName: name,
    attribute: e.attr,
    value: e.value,
    type: 'PERCENTAGE' as const,
  }))

  return {
    instanceId: raw.id ?? raw.instanceId ?? '',
    buffId: raw.buffId ?? raw.id ?? '',
    name,
    description,
    remainingTurns: condition === 'permanent' ? 0 : remainingTurns,
    stacks,
    type,
    condition,
    isAura: description.includes('全队') || description.includes('光环'),
    modifiers,
    ownerId: entityId,
    scriptName: raw.scriptName,
    configKey: raw.buffId,
  }
}

/**
 * 合并同一属性的多来源
 * mod.value 已带符号：正=增益，负=减益
 */
function mergeAttributes(items: BuffTextItem[]): MergedAttributeLine[] {
  const attrMap = new Map<string, {
    total: number
    sources: MergedAttributeLine['sources']
  }>()

  for (const item of items) {
    for (const mod of item.modifiers) {
      if (!attrMap.has(mod.attribute)) {
        attrMap.set(mod.attribute, { total: 0, sources: [] })
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
    }
  }

  return Array.from(attrMap.entries()).map(([attribute, data]) => ({
    attribute,
    totalPercent: data.total,
    isChanged: data.total !== 0,
    sources: data.sources,
  }))
}

/**
 * 排序函数
 */
function sortItems(items: BuffTextItem[]): BuffTextItem[] {
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
 */
export function useBuffDisplay(
  rawItems: Ref<any[]> | ComputedRef<any[]>,
  entityId: string,
  collapseThreshold: number = 5,
): ComputedRef<BuffDisplayState> {
  return computed(() => {
    const raw = rawItems.value
    if (!raw || raw.length === 0) {
      return {
        items: [],
        mergedLabels: [],
        controlLabels: [],
        collapsedCount: 0,
        groups: [],
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
    const mergedAll = mergeAttributes(sorted)
    const mergedLabels = sortLabels(mergedAll.filter((l) => l.isChanged))

    // 5. 计算折叠数量
    const visibleCount = controlItems.length + mergedLabels.length
    const collapsedCount = Math.max(0, visibleCount - collapseThreshold)

    // 6. 为展开面板准备分组
    const groups = sorted

    return {
      items,
      mergedLabels,
      controlLabels: controlItems,
      collapsedCount,
      groups,
    }
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
